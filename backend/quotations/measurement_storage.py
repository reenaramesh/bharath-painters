"""Read saved measurements during additive schema rollout without inventing revisions."""
from django.db import connection
from django.db.models import Prefetch
from rest_framework.exceptions import APIException

from .models import MeasurementOpening, MeasurementSurface, PropertyMeasurement, PropertyRoom


ROLLOUT_FIELDS = {
    PropertyMeasurement: ("edit_revision",),
    PropertyRoom: ("idempotency_key", "idempotency_revision", "idempotency_fingerprint"),
    MeasurementSurface: ("idempotency_key", "idempotency_revision", "idempotency_fingerprint"),
}


def missing_measurement_fields(model, request=None):
    # Request-scoped only: an activation or database switch must not leave a
    # process-global cache reporting the wrong capabilities.
    cache = getattr(request, "_measurement_storage_fields", None)
    if cache is None:
        cache = {}
        if request is not None:
            request._measurement_storage_fields = cache
    if model not in cache:
        with connection.cursor() as cursor:
            columns = {field.name for field in connection.introspection.get_table_description(cursor, model._meta.db_table)}
        cache[model] = tuple(name for name in ROLLOUT_FIELDS[model]
                             if model._meta.get_field(name).column not in columns)
    return cache[model]


def measurement_editing_available(request=None):
    return all(not missing_measurement_fields(model, request) for model in ROLLOUT_FIELDS)


class MeasurementStorageUnavailable(APIException):
    status_code = 503
    default_code = "measurement_schema_unavailable"
    default_detail = "Measurement editing is temporarily unavailable. Saved calculations can still be viewed."


def require_measurement_editing(request=None):
    if not measurement_editing_available(request):
        raise MeasurementStorageUnavailable()


def readable_measurement_rows(queryset, request=None):
    missing = missing_measurement_fields(queryset.model, request)
    return queryset.defer(*missing) if missing else queryset


def readable_openings(queryset, request=None):
    surfaces = readable_measurement_rows(MeasurementSurface.objects.all(), request).select_related("property")
    return queryset.prefetch_related(Prefetch("surface", queryset=surfaces),
                                     Prefetch("linked_surface", queryset=surfaces))


def readable_surfaces(queryset, request=None):
    openings = readable_openings(MeasurementOpening.objects.all(), request)
    return readable_measurement_rows(queryset, request).select_related("property").prefetch_related(None).prefetch_related(
        Prefetch("openings", queryset=openings))


def readable_measurement_records(queryset, request=None):
    return readable_measurement_rows(queryset, request).prefetch_related(
        Prefetch("surfaces", queryset=readable_surfaces(MeasurementSurface.objects.all(), request)),
        Prefetch("rooms", queryset=readable_measurement_rows(PropertyRoom.objects.all(), request)),
    )
