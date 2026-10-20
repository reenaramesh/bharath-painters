"""Serialize content writes on the owning measurement, independently of its document version."""
from collections.abc import Mapping
from functools import wraps
from decimal import Decimal, InvalidOperation
import hashlib
import json

from django.db import models, transaction
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from .models import MeasurementOpening, MeasurementSurface, Property, PropertyMeasurement, PropertyRoom
from .measurement_storage import require_measurement_editing


CREATION_FIELDS = {
    PropertyRoom: (
        "name", "room_type", "painting_area", "section", "description", "length", "width", "height",
        "window_count", "window_width", "window_height", "door_count", "door_width", "door_height",
    ),
    MeasurementSurface: (
        "work_area", "surface_type", "name", "area_group_name", "length", "breadth", "manual_area",
        "quantity", "paintable_sides", "room", "finish", "rate", "notes",
    ),
}


def creation_fingerprint(model, payload):
    """Hash original supported business input, never the mutable saved row."""
    canonical = {}
    for name in CREATION_FIELDS[model]:
        field = model._meta.get_field(name)
        value = payload.get(name, field.get_default())
        if value == "" and field.null:
            value = None
        if value is None:
            canonical[name] = None
        elif isinstance(field, (models.DecimalField, models.IntegerField, models.ForeignKey)):
            try:
                if isinstance(value, bool) or len(str(value)) > 100:
                    raise ValueError()
                number = Decimal(str(value))
                # Bound malformed exponents before formatting them into text.
                if not number.is_finite() or abs(number.as_tuple().exponent) > 50:
                    raise ValueError()
                if isinstance(field, models.DecimalField):
                    normalized = format(number, "f")
                    if "." in normalized:
                        normalized = normalized.rstrip("0").rstrip(".")
                    canonical[name] = "0" if number == 0 else normalized
                else:
                    if number != number.to_integral_value():
                        raise ValueError()
                    canonical[name] = int(number)
            except (InvalidOperation, TypeError, ValueError):
                raise ValidationError({name: "Use a valid finite measurement number."})
        else:
            canonical[name] = str(value).strip()
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class MeasurementRevisionConflict(APIException):
    status_code = 409
    default_detail = "This measurement changed on the server. Reload and resolve the conflict before saving."
    default_code = "measurement_revision_conflict"


def expected_revision(request):
    payload = request.data if isinstance(request.data, Mapping) else {}
    if "expected_revision" not in payload and "expected_revision" not in request.query_params:
        return None
    value = payload.get("expected_revision", request.query_params.get("expected_revision"))
    if type(value) is int and 0 <= value < 2**63:
        return value
    if isinstance(value, str) and value.isascii() and value.isdigit() and len(value) <= 19 and int(value) < 2**63:
        return int(value)
    raise ValidationError({"expected_revision": "Use a nonnegative integer revision."})


def check_revision(record, expected):
    if expected is not None and expected != record.edit_revision:
        raise MeasurementRevisionConflict()


def bump_revision(record):
    record.edit_revision += 1
    record.save(update_fields=("edit_revision", "updated_at"))


def measurement_mutation(handler):
    @wraps(handler)
    def protected(self, request, *args, **kwargs):
        with transaction.atomic():
            if not isinstance(request.data, Mapping):
                raise ValidationError({"detail": "Use an object for measurement changes."})
            require_measurement_editing(request)
            self.lock_measurement()
            response = handler(self, request, *args, **kwargs)
            # APIViews can return validation responses rather than raise. Roll
            # back record creation, room binding and all dependent writes too.
            if response.status_code >= 400:
                transaction.set_rollback(True)
            return response
    return protected


class MeasurementMutationMixin:
    measurement_mutation_kind = "object"

    def lock_measurement(self):
        expected = expected_revision(self.request)
        replay = None
        if self.measurement_mutation_kind == "property":
            property_obj = self.get_property()
            # Serialize resolving/creating ?new=1 records and idempotency keys.
            Property.objects.select_for_update().get(pk=property_obj.pk)
            key = str(self.request.data.get("idempotency_key") or "").strip()
            if key and hasattr(self, "idempotent_replay"):
                model = self.get_serializer_class().Meta.model
                replay = model.objects.filter(
                    idempotency_key=key, property=property_obj,
                    measurement_record__contractor=self.request.user,
                ).first()
            if replay and str(self.request.query_params.get("new") or "").lower() in {"1", "true", "yes"}:
                record = replay.measurement_record
            else:
                # Import lazily to keep the resolver's property access policy in
                # one place without a views/helper import cycle.
                from .views import measurement_record_for
                record = measurement_record_for(self.request, property_obj, create=True)
        else:
            obj = self.get_surface() if self.measurement_mutation_kind == "opening_create" else self.get_object()
            if isinstance(obj, PropertyMeasurement):
                record, property_obj = obj, obj.property
            else:
                surface = obj.surface if isinstance(obj, MeasurementOpening) else obj
                record, property_obj = surface.measurement_record, surface.property
                if record is None:
                    # Old rooms without a measurement remain usable by online
                    # clients. Offline writes require a verifiable parent.
                    if expected is not None:
                        raise ValidationError({"expected_revision": "Reload this legacy room before saving offline."})
                    Property.objects.select_for_update().get(pk=property_obj.pk)
                    # A combined save may have bound this legacy child while
                    # this transaction waited for the property lock. Resolve
                    # its parent again before deciding that no parent exists.
                    surface.refresh_from_db(fields=("measurement_record",))
                    record = surface.measurement_record
                    if record is None:
                        return
        record = PropertyMeasurement.objects.select_for_update().filter(
            pk=record.pk, contractor=self.request.user, property=property_obj,
        ).first()
        if not record:
            raise PermissionDenied("This measurement does not belong to your account and property.")
        self.measurement_record = record
        self.request._locked_measurement_record = record
        is_replay = replay is not None and replay.measurement_record_id == record.pk
        if is_replay:
            if expected is not None and replay.idempotency_revision is None:
                raise MeasurementRevisionConflict("The original acknowledgement revision is unavailable. Reload and resolve this request.")
        else:
            check_revision(record, expected)
            if record.status == PropertyMeasurement.Status.LOCKED and not getattr(self, "measurement_allows_locked", False):
                raise ValidationError({"measurement": "An Area Calculation used in a quotation cannot be changed."})

    @measurement_mutation
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @measurement_mutation
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @measurement_mutation
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    def save_measurement(self, serializer, **kwargs):
        instance = serializer.instance
        changed = any(getattr(instance, field) != value for field, value in serializer.validated_data.items())
        if not changed:
            return instance
        instance = serializer.save(**kwargs)
        if getattr(self, "measurement_record", None):
            bump_revision(self.measurement_record)
            if isinstance(instance, PropertyMeasurement):
                instance.edit_revision = self.measurement_record.edit_revision
        return instance

    def perform_update(self, serializer):
        self.save_measurement(serializer)

    def perform_destroy(self, instance):
        is_record = isinstance(instance, PropertyMeasurement)
        instance.delete()
        if not is_record and getattr(self, "measurement_record", None):
            bump_revision(self.measurement_record)

    def measurement_created(self, serializer):
        record = getattr(self, "measurement_record", None)
        if record is None:
            # lock_measurement already rejects unverifiable offline revisions;
            # online clients may still add openings to a legacy null parent.
            return
        bump_revision(record)
        instance = serializer.instance
        if isinstance(instance, (PropertyRoom, MeasurementSurface)) and instance.idempotency_key:
            instance.idempotency_revision = record.edit_revision
            instance.idempotency_fingerprint = creation_fingerprint(type(instance), self.request.data)
            instance.save(update_fields=("idempotency_revision", "idempotency_fingerprint"))

    def creation_request_matches(self, instance, payload):
        return instance.idempotency_fingerprint == creation_fingerprint(type(instance), payload)

    def replay_response(self, instance):
        data = self.get_serializer(instance).data
        if instance.idempotency_revision is not None:
            data["measurement_revision"] = instance.idempotency_revision
        return data
