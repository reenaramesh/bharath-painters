from decimal import Decimal

from datetime import date
from django.conf import settings
from django.core.serializers import python
from django.db import transaction, models
from rest_framework import serializers
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from accounts.models import BharathUser, ContractorProfile

from decimal import Decimal
from .models import (
    Area, MeasurementSurfaceType,
    ServiceCategory,
    ServiceType,
    WorkDescription,
    PaintType,
    PaintBrand,
    PaintColor,
    Unit,
    Customer, ContractorCustomerConnection, normalize_indian_mobile,
    CustomerFollowUp,
    Property,
    Quotation,
    QuotationRoom,
    QuotationItem, WorkChange, WorkChangeItem,
    CustomerWorkHistory,
    WorkPhoto, PropertyRoom, PropertyMeasurement, ActivityLog,
)


class ActivityLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = ActivityLog
        fields = ("id", "actor", "actor_name", "actor_role", "action", "action_display", "module", "description", "object_id", "status_code", "metadata", "is_flagged", "review_note", "reviewed_at", "reviewed_by", "created_at")
        read_only_fields = fields


# ---------------------------------------------------------
# MASTER DATA
# ---------------------------------------------------------

class AreaSerializer(serializers.ModelSerializer):

    class Meta:
        model = Area
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


class MeasurementSurfaceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementSurfaceType
        fields = "__all__"
        read_only_fields = ("created_by", "created_at", "updated_at")


class ServiceTypeSerializer(serializers.ModelSerializer):

    class Meta:
        model = ServiceType
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


class PaintTypeSerializer(serializers.ModelSerializer):

    def validate_default_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    class Meta:
        model = PaintType
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


class PaintBrandSerializer(serializers.ModelSerializer):

    class Meta:
        model = PaintBrand
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


class PaintColorSerializer(serializers.ModelSerializer):

    class Meta:
        model = PaintColor
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


class UnitSerializer(serializers.ModelSerializer):

    class Meta:
        model = Unit
        fields = "__all__"

        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )


# ---------------------------------------------------------
# CUSTOMER
# ---------------------------------------------------------

class ConnectionScopedCustomerMixin:
    scoped_customer_fields = {
        "status": "customer_status",
        "source": "customer_source",
        "client_type": "customer_client_type",
        "requirement": "requirement",
        "notes": "internal_notes",
        "next_follow_up": "next_follow_up",
    }

    def contractor_connection(self, customer):
        request = self.context.get("request")
        if not request or getattr(request.user, "role", None) != BharathUser.Roles.CONTRACTOR:
            return None
        return ContractorCustomerConnection.objects.filter(
            customer=customer,
            contractor=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        connection = self.contractor_connection(instance)
        if not connection:
            return representation
        for public_name, connection_name in self.scoped_customer_fields.items():
            if public_name in representation:
                representation[public_name] = getattr(connection, connection_name)

        request = self.context.get("request")
        if "follow_ups" in representation:
            representation["follow_ups"] = CustomerFollowUpSerializer(
                instance.follow_ups.filter(created_by=request.user), many=True, context=self.context,
            ).data
        if "properties" in representation:
            properties = instance.properties.filter(
                models.Q(connection=connection)
                | models.Q(connection__isnull=True, contractor=request.user)
            )
            representation["properties"] = PropertySerializer(properties, many=True, context=self.context).data
        if "quotations" in representation:
            quotations = instance.quotations.filter(
                models.Q(connection=connection)
                | models.Q(connection__isnull=True, contractor=request.user)
            )
            representation["quotations"] = QuotationSerializer(quotations, many=True, context=self.context).data
        if "work_history" in representation:
            history = instance.work_history.filter(property__contractor=request.user)
            representation["work_history"] = CustomerWorkHistorySerializer(history, many=True, context=self.context).data
        return representation

    def update(self, instance, validated_data):
        connection = self.contractor_connection(instance)
        scoped_values = {}
        if connection:
            scoped_values = {
                connection_name: validated_data.pop(public_name)
                for public_name, connection_name in self.scoped_customer_fields.items()
                if public_name in validated_data
            }
        instance = super().update(instance, validated_data)
        if connection and scoped_values:
            for field, value in scoped_values.items():
                setattr(connection, field, value)
            connection.save(update_fields=tuple(scoped_values) + ("updated_at",))
        return instance


class CustomerSerializer(ConnectionScopedCustomerMixin, serializers.ModelSerializer):

    class Meta:
        model = Customer
        fields = "__all__"

        read_only_fields = (
            "contractor",
            "bharath_id",
            "normalized_mobile",
            "portal_user",
            "created_at",
            "updated_at",
        )

    def validate_mobile(self, value):
        normalized = normalize_indian_mobile(value)
        if not normalized:
            raise serializers.ValidationError("Enter a valid Indian mobile number.")
        queryset = Customer.objects.filter(normalized_mobile=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A Bharath Painters customer already exists for this mobile number.")
        return value


# ---------------------------------------------------------
# PROPERTY
# ---------------------------------------------------------

class PropertySerializer(serializers.ModelSerializer):
    has_measurements = serializers.SerializerMethodField()
    linear_unit_label = serializers.CharField(read_only=True)
    input_area_unit_label = serializers.CharField(read_only=True)

    class Meta:
        model = Property
        fields = "__all__"

        read_only_fields = (
            "contractor",
            "connection",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        category_master = attrs.get("category_master")
        if category_master:
            attrs["category"] = category_master.name
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        request = self.context.get("request")
        if request and customer:
            connected = ContractorCustomerConnection.objects.filter(
                customer=customer,
                contractor=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).exists()
            if not connected and customer.contractor_id == request.user.id:
                connection, _ = ContractorCustomerConnection.objects.get_or_create(
                    customer=customer,
                    contractor=request.user,
                    defaults={
                        "status": ContractorCustomerConnection.Status.CONNECTED,
                        "requested_by": request.user,
                        "approval_method": ContractorCustomerConnection.ApprovalMethod.INITIAL_CREATOR,
                    },
                )
                connected = connection.status == ContractorCustomerConnection.Status.CONNECTED
            if not connected:
                raise serializers.ValidationError({"customer": "Connect with this customer before creating a property."})
        if (
            self.instance
            and "measurement_unit" in attrs
            and attrs["measurement_unit"] != self.instance.measurement_unit
            and self.instance.measurement_surfaces.exists()
        ):
            raise serializers.ValidationError({
                "measurement_unit": "The unit cannot be changed after Area Calculations are saved. Delete the Area Calculations first or create a new property."
            })

        return attrs

    def get_has_measurements(self, obj):
        return obj.measurement_surfaces.exists()


class PropertyMeasurementSerializer(serializers.ModelSerializer):
    contractor_name = serializers.SerializerMethodField()
    contractor_id = serializers.CharField(source="contractor.bharath_id", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    total_sqft = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    room_count = serializers.IntegerField(source="rooms.count", read_only=True)
    surface_count = serializers.IntegerField(source="surfaces.count", read_only=True)

    class Meta:
        model = PropertyMeasurement
        fields = (
            "id", "property", "reference_no", "measured_on", "contractor",
            "contractor_name", "contractor_id", "status", "status_display", "submitted_at",
            "total_sqft", "room_count", "surface_count", "notes",
            "version", "created_by", "connection", "created_at", "updated_at",
        )
        read_only_fields = (
            "property", "reference_no", "contractor", "contractor_name",
            "contractor_id", "total_sqft", "room_count", "surface_count", "submitted_at",
            "version", "created_by", "connection", "created_at", "updated_at",
        )

    def get_contractor_name(self, obj):
        if not obj.contractor:
            return "Not assigned"
        profile = getattr(obj.contractor, "contractor_profile", None)
        return getattr(profile, "company_name", "") or obj.contractor.get_full_name() or obj.contractor.mobile


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = "__all__"
        read_only_fields = ("created_by", "created_at", "updated_at")


class WorkDescriptionSerializer(serializers.ModelSerializer):
    service_name = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    class Meta:
        model = WorkDescription
        fields = "__all__"
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_service_name(self, obj):
        return obj.service_type.name if obj.service_type else ""

    def get_category(self, obj):
        return obj.service_category.name if obj.service_category else (obj.service_type.category if obj.service_type else "")

    def validate_customer(self, customer):
        request = self.context.get("request")
        if request and customer.contractor_id != request.user.id:
            raise serializers.ValidationError(
                "You cannot create a property for another contractor's customer."
            )
        return customer


# ---------------------------------------------------------
# QUOTATION ROOM
# ---------------------------------------------------------






class QuotationRoomSerializer(serializers.ModelSerializer):

    property_room = serializers.PrimaryKeyRelatedField(
        queryset=PropertyRoom.objects.all(),
        required=False,
        allow_null=True
    )
    room_type_name = serializers.SerializerMethodField()

    class Meta:

        model = QuotationRoom

        fields = (
            "id",
            "property_room",
            "quotation",

            "area",
            "name",
            "room_type_name",

            "length",
            "width",
            "height",

            "window_count",
            "window_width",
            "window_height",

            "door_count",
            "door_width",
            "door_height",

            "wall_area",
            "ceiling_area",
            "window_area",
            "door_area",
            "paintable_area",

            "created_at",
        )

        read_only_fields = (
            "id",
            "quotation",

            "wall_area",
            "ceiling_area",
            "window_area",
            "door_area",
            "paintable_area",

            "created_at",
        )

    def get_room_type_name(self, obj):
        if obj.room_type_name_snapshot:
            return obj.room_type_name_snapshot
        property_room = obj.property_room
        if property_room and property_room.room_type:
            return property_room.room_type.name
        if obj.quotation.property.measurement_type == "EXTERIOR":
            return "Exterior"
        return obj.name

    # =====================================================
    # VALIDATION
    # =====================================================

    def validate(self, attrs):

        property_room = attrs.get(
            "property_room"
        )

        # If using a saved PropertyRoom,
        # dimensions can be copied automatically.

        if property_room:

            return attrs

        # New room requires name

        if not attrs.get("name"):

            raise serializers.ValidationError({
                "name":
                "Name is required when a saved property room is not selected."
            })

        return attrs

    # =====================================================
    # PROPERTY ROOM SECURITY
    # =====================================================

    def validate_property_room(
        self,
        property_room
    ):

        request = self.context.get(
            "request"
        )

        if (
            request
            and request.user
            and property_room
        ):

            # Make sure the property belongs
            # to the current contractor.

            if (
                (property_room.property.contractor_id or property_room.property.customer.contractor_id)
                != request.user.id
            ):

                raise serializers.ValidationError(
                    "You cannot use another contractor's property room."
                )

        return property_room

    # =====================================================
    # CALCULATE AREAS
    # =====================================================

    def calculate_areas(
        self,
        data
    ):

        length = Decimal(
            data.get("length") or 0
        )

        width = Decimal(
            data.get("width") or 0
        )

        height = Decimal(
            data.get("height") or 0
        )

        window_count = int(
            data.get("window_count") or 0
        )

        window_width = Decimal(
            data.get("window_width") or 0
        )

        window_height = Decimal(
            data.get("window_height") or 0
        )

        door_count = int(
            data.get("door_count") or 0
        )

        door_width = Decimal(
            data.get("door_width") or 0
        )

        door_height = Decimal(
            data.get("door_height") or 0
        )

        # -------------------------------------------------
        # WALL AREA
        # -------------------------------------------------

        wall_area = (
            Decimal("2")
            * (
                length
                + width
            )
            * height
        )

        # -------------------------------------------------
        # CEILING AREA
        # -------------------------------------------------

        ceiling_area = (
            length * width
        )

        # -------------------------------------------------
        # WINDOW AREA
        # -------------------------------------------------

        window_area = (
            Decimal(window_count)
            * window_width
            * window_height
        )

        # -------------------------------------------------
        # DOOR AREA
        # -------------------------------------------------

        door_area = (
            Decimal(door_count)
            * door_width
            * door_height
        )

        # -------------------------------------------------
        # PAINTABLE WALL AREA
        # -------------------------------------------------

        paintable_area = (
            wall_area
            - window_area
            - door_area
        )

        if paintable_area < 0:

            paintable_area = Decimal("0")

        # -------------------------------------------------
        # ROUND VALUES
        # -------------------------------------------------

        data["wall_area"] = wall_area.quantize(
            Decimal("0.01")
        )

        data["ceiling_area"] = ceiling_area.quantize(
            Decimal("0.01")
        )

        data["window_area"] = window_area.quantize(
            Decimal("0.01")
        )

        data["door_area"] = door_area.quantize(
            Decimal("0.01")
        )

        data["paintable_area"] = paintable_area.quantize(
            Decimal("0.01")
        )

        return data

    # =====================================================
    # COPY PROPERTY ROOM DATA
    # =====================================================

    def apply_property_room(
        self,
        validated_data
    ):

        property_room = validated_data.get(
            "property_room"
        )

        if not property_room:

            return validated_data

        validated_data["name"] = (
            property_room.name
        )

        validated_data["length"] = (
            property_room.length
        )

        validated_data["width"] = (
            property_room.width
        )

        validated_data["height"] = (
            property_room.height
        )

        validated_data["window_count"] = (
            property_room.window_count
        )

        validated_data["window_width"] = (
            property_room.window_width
        )

        validated_data["window_height"] = (
            property_room.window_height
        )

        validated_data["door_count"] = (
            property_room.door_count
        )

        validated_data["door_width"] = (
            property_room.door_width
        )

        validated_data["door_height"] = (
            property_room.door_height
        )

        return validated_data

    # =====================================================
    # CREATE
    # =====================================================

    def create(
        self,
        validated_data
    ):

        validated_data = self.apply_property_room(
            validated_data
        )

        validated_data = self.calculate_areas(
            validated_data
        )

        return super().create(
            validated_data
        )

    # =====================================================
    # UPDATE / PATCH
    # =====================================================

    def update(
        self,
        instance,
        validated_data
    ):

        validated_data = self.apply_property_room(
            validated_data
        )

        # Merge existing values with PATCH values
        # so recalculation works correctly.

        calculation_data = {
            "length": instance.length,
            "width": instance.width,
            "height": instance.height,

            "window_count": instance.window_count,
            "window_width": instance.window_width,
            "window_height": instance.window_height,

            "door_count": instance.door_count,
            "door_width": instance.door_width,
            "door_height": instance.door_height,
        }

        calculation_data.update(
            validated_data
        )

        calculation_data = self.calculate_areas(
            calculation_data
        )

        validated_data["wall_area"] = (
            calculation_data["wall_area"]
        )

        validated_data["ceiling_area"] = (
            calculation_data["ceiling_area"]
        )

        validated_data["window_area"] = (
            calculation_data["window_area"]
        )

        validated_data["door_area"] = (
            calculation_data["door_area"]
        )

        validated_data["paintable_area"] = (
            calculation_data["paintable_area"]
        )

        return super().update(
            instance,
            validated_data
        )




# ---------------------------------------------------------
# QUOTATION ITEM
# ---------------------------------------------------------



class QuotationItemSerializer(serializers.ModelSerializer):

    promote_to_master = serializers.BooleanField(write_only=True, required=False, default=False)

    id = serializers.IntegerField(
        required=False
    )

    service_name = serializers.SerializerMethodField()

    paint_type_name = serializers.SerializerMethodField()
    paint_type_features = serializers.SerializerMethodField()

    service_category_name = serializers.SerializerMethodField()
    brand_name = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()

    room_index = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True
    )

    calculation_method = serializers.ChoiceField(
        choices=QuotationItem.CalculationMethod.choices,
        required=False
    )

    quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True
    )

    class Meta:
        model = QuotationItem

        fields = (
            "id",
            "room",
            "room_index",

            "service_type",
            "service_name",
            "service_category",
            "service_category_name",
            "line_type",
            "custom_service_category",
            "custom_service_type",
            "paint_type",
            "paint_type_name",
            "paint_type_features",
            "custom_product_type",
            "paint_brand",
            "brand_name",
            "custom_brand",
            "color",

            "description",
            "coats",

            "calculation_method",
            "is_additional_service",
            "custom_unit",

            "quantity",
            "unit",
            "unit_name",
            "promote_to_master",
            "rate",
            "amount",

            "created_at",
        )

        read_only_fields = (
            "amount",
            "created_at",
        )

    def get_service_category_name(self, obj):
        return obj.service_category_name_snapshot or obj.custom_service_category or (obj.service_category.name if obj.service_category else "")

    def get_service_name(self, obj):
        return obj.service_name_snapshot or obj.custom_service_type or (obj.service_type.name if obj.service_type else "")

    def get_paint_type_name(self, obj):
        return obj.product_type_name_snapshot or obj.custom_product_type or (obj.paint_type.name if obj.paint_type else "")

    def get_paint_type_features(self, obj):
        return obj.product_type_features_snapshot or (obj.paint_type.key_features if obj.paint_type else "")

    def get_brand_name(self, obj):
        return obj.brand_name_snapshot or obj.custom_brand or (obj.paint_brand.name if obj.paint_brand else "")

    def get_unit_name(self, obj):
        return obj.unit_name_snapshot or obj.custom_unit or (obj.unit.name if obj.unit else "")

    def validate(self, data):

        calculation_method = data.get(
            "calculation_method",
            QuotationItem.CalculationMethod.AREA
        )

        rate = data.get("rate")

        if rate is None:
            raise serializers.ValidationError({
                "rate": "Rate is required."
            })

        if rate < 0:
            raise serializers.ValidationError({
                "rate": "Rate cannot be negative."
            })

        coats = data.get("coats", 1)

        if coats < 1:
            raise serializers.ValidationError({
                "coats": "At least one coat is required."
            })

        # -------------------------------------------------
        # LUMPSUM
        # -------------------------------------------------

        if calculation_method == (
            QuotationItem.CalculationMethod.LUMPSUM
        ):
            return data

        # -------------------------------------------------
        # MANUAL
        # -------------------------------------------------

        if calculation_method == (
            QuotationItem.CalculationMethod.MANUAL
        ):

            quantity = data.get("quantity")

            if quantity is None:
                raise serializers.ValidationError({
                    "quantity":
                    "Quantity is required for manual calculation."
                })

            if Decimal(quantity) <= 0:
                raise serializers.ValidationError({
                    "quantity":
                    "Quantity must be greater than zero."
                })

        return data



# ---------------------------------------------------------
# QUOTATION
# ---------------------------------------------------------



from decimal import Decimal

from django.db import transaction
from rest_framework import serializers


def generate_quotation_number():

    today = date.today()

    prefix = f"BRQ-{today.strftime('%Y%m%d')}-"

    last_quotation = (
        Quotation.objects
        .filter(
            quotation_number__startswith=prefix
        )
        .order_by("-id")
        .first()
    )

    if last_quotation:

        try:
            last_number = int(
                last_quotation.quotation_number
                .split("-")[-1]
            )

        except (ValueError, IndexError):
            last_number = 0

    else:
        last_number = 0

    next_number = last_number + 1

    return f"{prefix}{next_number:04d}"




from datetime import date
from decimal import Decimal

from rest_framework import serializers

from .models import (
    Quotation,
    QuotationRoom,
    QuotationItem,
    PropertyRoom,
)


# =========================================================
# UNIQUE QUOTATION NUMBER
# =========================================================

def generate_quotation_number():

    today = date.today()

    prefix = f"BRQ-{today.strftime('%Y%m%d')}-"

    last_quotation = (
        Quotation.objects
        .filter(
            quotation_number__startswith=prefix
        )
        .order_by("-id")
        .first()
    )

    if last_quotation:

        try:
            last_number = int(
                last_quotation.quotation_number.split("-")[-1]
            )

        except (ValueError, IndexError):

            last_number = 0

    else:

        last_number = 0

    next_number = last_number + 1

    return f"{prefix}{next_number:04d}"


# =========================================================
# WORK CHANGES
# =========================================================

class WorkChangeItemSerializer(serializers.ModelSerializer):
    change_type_display = serializers.CharField(source="get_change_type_display", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True)
    original_item_details = serializers.SerializerMethodField()

    class Meta:
        model = WorkChangeItem
        fields = "__all__"
        read_only_fields = (
            "work_change", "original_quantity", "old_rate", "old_amount",
            "new_amount", "price_difference", "original_service_snapshot",
            "original_material_snapshot", "original_brand_snapshot",
            "new_service_snapshot", "new_material_snapshot", "new_brand_snapshot",
            "unit_snapshot", "created_at", "updated_at",
        )

    def get_original_item_details(self, obj):
        item = obj.original_item
        if not item:
            return None
        return {
            "id": item.id,
            "room": item.room.name if item.room else "General",
            "service": item.service_name_snapshot,
            "material": item.product_type_name_snapshot,
            "brand": item.brand_name_snapshot,
            "description": item.description,
            "quantity": item.quantity,
            "unit": item.unit_name_snapshot or item.custom_unit,
            "rate": item.rate,
        }

    def validate(self, attrs):
        change = self.context.get("work_change") or getattr(self.instance, "work_change", None)
        quotation = self.context.get("quotation") or (change.quotation if change else None)
        change_type = attrs.get("change_type", getattr(self.instance, "change_type", None))
        original = attrs.get("original_item", getattr(self.instance, "original_item", None))
        quantity = attrs.get("changed_quantity", getattr(self.instance, "changed_quantity", Decimal("0")))
        completed = attrs.get("completed_quantity", getattr(self.instance, "completed_quantity", Decimal("0")))
        if quantity is None or quantity <= 0:
            raise serializers.ValidationError({"changed_quantity": "Enter a quantity greater than zero."})
        if completed is not None and completed < 0:
            raise serializers.ValidationError({"completed_quantity": "Completed quantity cannot be negative."})
        if change_type != WorkChangeItem.ChangeType.ADD_WORK:
            if not original:
                raise serializers.ValidationError({"original_item": "Select an accepted quotation line."})
            if quotation and original.quotation_id != quotation.id:
                raise serializers.ValidationError({"original_item": "This line does not belong to the accepted quotation."})
            if completed > original.quantity:
                raise serializers.ValidationError({"completed_quantity": "Completed quantity cannot exceed the original quantity."})
            committed = WorkChangeItem.objects.filter(
                original_item=original,
                work_change__status=WorkChange.Status.APPROVED,
                change_type__in=(WorkChangeItem.ChangeType.REMOVE_WORK, WorkChangeItem.ChangeType.CHANGE_SERVICE, WorkChangeItem.ChangeType.CHANGE_MATERIAL),
            )
            if self.instance:
                committed = committed.exclude(pk=self.instance.pk)
            committed_quantity = committed.aggregate(total=models.Sum("changed_quantity"))["total"] or Decimal("0")
            if change_type in {WorkChangeItem.ChangeType.REMOVE_WORK, WorkChangeItem.ChangeType.CHANGE_SERVICE, WorkChangeItem.ChangeType.CHANGE_MATERIAL} and quantity > original.quantity - completed - committed_quantity:
                raise serializers.ValidationError({"changed_quantity": "Changed quantity exceeds the unfinished quantity available."})
            if change_type == WorkChangeItem.ChangeType.CHANGE_QUANTITY and quantity < completed:
                raise serializers.ValidationError({"changed_quantity": "New quantity cannot be below the quantity already completed."})
        if change_type == WorkChangeItem.ChangeType.CHANGE_SERVICE and not attrs.get("new_service_type", getattr(self.instance, "new_service_type", None)):
            raise serializers.ValidationError({"new_service_type": "Select the new service."})
        if change_type == WorkChangeItem.ChangeType.CHANGE_MATERIAL and not attrs.get("new_product_type", getattr(self.instance, "new_product_type", None)):
            raise serializers.ValidationError({"new_product_type": "Select the new material."})
        return attrs


class WorkChangeSerializer(serializers.ModelSerializer):
    lines = WorkChangeItemSerializer(many=True)
    price_difference = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    quotation_number = serializers.CharField(source="quotation.quotation_number", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    property_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkChange
        fields = "__all__"
        read_only_fields = (
            "contractor", "customer", "change_number", "status", "sent_at",
            "approved_at", "rejected_at", "cancelled_at", "customer_response_note",
            "created_at", "updated_at",
        )

    def get_property_name(self, obj):
        return obj.quotation.property.name or obj.quotation.property.property_type

    def validate_quotation(self, quotation):
        request = self.context.get("request")
        if request and quotation.contractor_id != request.user.id:
            raise serializers.ValidationError("Quotation not found.")
        if quotation.status != Quotation.Status.IN_PROGRESS:
            raise serializers.ValidationError("Work Changes can be created only after work has started.")
        return quotation

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        quotation = validated_data["quotation"]
        request = self.context["request"]
        change = WorkChange.objects.create(
            **validated_data,
            contractor=request.user,
            customer=quotation.customer,
        )
        change.change_number = f"BWC-{change.requested_date:%Y%m%d}-{change.id:04d}"
        change.save(update_fields=("change_number", "updated_at"))
        if not lines:
            raise serializers.ValidationError({"lines": "Add at least one work-change line."})
        for line in lines:
            line_serializer = WorkChangeItemSerializer(
                context={"work_change": change, "quotation": quotation}
            )
            clean_line = line_serializer.validate(line)
            WorkChangeItem.objects.create(work_change=change, **clean_line)
        return change

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.status != WorkChange.Status.DRAFT:
            raise serializers.ValidationError({"status": "Only a draft Work Change can be edited."})
        lines = validated_data.pop("lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            if not lines:
                raise serializers.ValidationError({"lines": "Add at least one work-change line."})
            instance.lines.all().delete()
            for line in lines:
                line_serializer = WorkChangeItemSerializer(
                    context={"work_change": instance, "quotation": instance.quotation}
                )
                clean_line = line_serializer.validate(line)
                WorkChangeItem.objects.create(work_change=instance, **clean_line)
        return instance


# QUOTATION SERIALIZER
# =========================================================

class QuotationSerializer(serializers.ModelSerializer):

    contractor_details = serializers.SerializerMethodField()
    customer_details = serializers.SerializerMethodField()
    revision_changes = serializers.SerializerMethodField()
    revision_draft = serializers.SerializerMethodField()
    consolidated_product_details = serializers.SerializerMethodField()

    rooms = QuotationRoomSerializer(
        many=True,
        required=False
    )

    items = QuotationItemSerializer(
        many=True,
        required=False
    )

    class Meta:

        model = Quotation

        fields = (
            "id",
            "contractor",
            "contractor_details",
            "customer",
            "customer_details",
            "connection",
            "lead",
            "property",
            "measurement_record",

            "quotation_type",

            "quotation_number",
            "revision_of",
            "version_number",
            "revision_changes",
            "revision_draft",
            "quotation_date",
            "sent_at",
            "valid_until",

            "status",
            "customer_response_note",
            "customer_responded_at",

            "subtotal",

            "discount",
            "discount_type",
            "discount_value",

            "gst_percentage",
            "gst_mode",
            "gst_amount",

            "grand_total",

            "notes",
            "terms_conditions",
            "prepared_by",
            "inspected_by",
            "payment_terms",
            "product_details",
            "consolidated_product_details",
            "show_product_key_features",
            "work_duration",
            "work_procedures",

            "rooms",
            "items",

            "created_at",
            "updated_at",
        )

        read_only_fields = (
            "id",
            "contractor",
            "contractor_details",
            "customer_details",
            "connection",
            "quotation_number",
            "revision_of",
            "version_number",
            "revision_changes",
            "revision_draft",
            "status",
            "sent_at",
            "customer_response_note",
            "customer_responded_at",

            "subtotal",
            "discount",
            "gst_amount",
            "grand_total",

            "created_at",
            "updated_at",
        )

    def get_consolidated_product_details(self, obj):
        from .product_details import consolidated_product_details
        return consolidated_product_details(obj)

    def validate(self, attrs):
        if self.instance and self.instance.status != Quotation.Status.DRAFT:
            raise serializers.ValidationError({
                "quotation": "This quotation version is preserved. Create or open a draft revision to make changes."
            })
        request = self.context.get("request")
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        property_obj = attrs.get("property", getattr(self.instance, "property", None))
        measurement_record = attrs.get(
            "measurement_record", getattr(self.instance, "measurement_record", None)
        )
        quotation_type = attrs.get("quotation_type", getattr(self.instance, "quotation_type", Quotation.QuotationType.MEASUREMENT))

        connection = None
        if request and customer:
            connection = ContractorCustomerConnection.objects.filter(
                customer=customer,
                contractor=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).first()
            if not connection and customer.contractor_id == request.user.id:
                connection, _ = ContractorCustomerConnection.objects.get_or_create(
                    customer=customer,
                    contractor=request.user,
                    defaults={
                        "status": ContractorCustomerConnection.Status.CONNECTED,
                        "requested_by": request.user,
                        "approval_method": ContractorCustomerConnection.ApprovalMethod.INITIAL_CREATOR,
                    },
                )
            if not connection:
                raise serializers.ValidationError({
                    "customer": "Connect with this customer before creating a quotation."
                })

        lead = attrs.get("lead", getattr(self.instance, "lead", None))
        if request and lead:
            if lead.contractor_id != request.user.id:
                raise serializers.ValidationError({"lead": "You cannot use another contractor's lead."})
            if customer and lead.customer_id != customer.id:
                raise serializers.ValidationError({"lead": "The lead must belong to the selected customer."})

        if request and property_obj:
            property_owner_id = property_obj.contractor_id or property_obj.customer.contractor_id
            property_connection_id = property_obj.connection_id or getattr(connection, "id", None)
            if property_owner_id != request.user.id or property_connection_id != getattr(connection, "id", None):
                raise serializers.ValidationError({
                    "property": "You cannot use another contractor's property."
                })
            if customer and property_obj.customer_id != customer.id:
                raise serializers.ValidationError({
                    "property": "The property must belong to the selected customer."
                })

        for room_data in attrs.get("rooms", []):
            room = room_data.get("property_room")
            if room and (not property_obj or room.property_id != property_obj.id):
                raise serializers.ValidationError({"rooms": "Select rooms from the quotation property."})
            if room and measurement_record and room.measurement_record_id != measurement_record.id:
                raise serializers.ValidationError({"rooms": "Select rooms from the selected Area Calculation."})

        if measurement_record:
            if not property_obj or measurement_record.property_id != property_obj.id:
                raise serializers.ValidationError({
                    "measurement_record": "Select an Area Calculation belonging to the selected property."
                })
            measurement_owner_id = measurement_record.contractor_id or measurement_record.property.contractor_id or measurement_record.property.customer.contractor_id
            measurement_connection_id = measurement_record.connection_id or measurement_record.property.connection_id or getattr(connection, "id", None)
            if request and (measurement_owner_id != request.user.id or measurement_connection_id != getattr(connection, "id", None)):
                raise serializers.ValidationError({
                    "measurement_record": "You cannot use another contractor's Area Calculation."
                })

        if quotation_type == Quotation.QuotationType.MANUAL_LUMPSUM and "items" in attrs:
            items = attrs.get("items") or []
            if not items:
                raise serializers.ValidationError({"items": "Add at least one quotation line."})
            allowed = {QuotationItem.CalculationMethod.LUMPSUM, QuotationItem.CalculationMethod.MANUAL}
            if any(item.get("calculation_method") not in allowed for item in items):
                raise serializers.ValidationError({"items": "Manual quotations support quantity or lump-sum lines only."})

        return attrs

    def get_revision_changes(self, obj):
        from .revision_utils import quotation_revision_changes
        return quotation_revision_changes(obj)

    def get_revision_draft(self, obj):
        draft = obj.revisions.filter(status=Quotation.Status.DRAFT).order_by("-version_number").first()
        if not draft:
            return None
        return {
            "id": draft.id,
            "quotation_number": draft.quotation_number,
            "version_number": draft.version_number,
        }

    def resolve_item_masters(self, item_data):
        promote = item_data.pop("promote_to_master", False)
        if not promote:
            return item_data
        request = self.context.get("request")
        owner = request.user if request else None

        def master(model, name, **extra):
            name = (name or "").strip()
            if not name:
                return None
            queryset = model.objects.filter(name__iexact=name).filter(
                models.Q(created_by=owner) | models.Q(created_by__isnull=True)
            )
            if extra:
                queryset = queryset.filter(**extra)
            return queryset.first() or model.objects.create(name=name, created_by=owner, **extra)

        category = item_data.get("service_category")
        if not category:
            category = master(ServiceCategory, item_data.get("custom_service_category"))
            if category:
                item_data["service_category"] = category
        service = item_data.get("service_type")
        if not service and item_data.get("custom_service_type"):
            service = master(
                ServiceType,
                item_data.get("custom_service_type"),
                category_master=category,
                category=category.name if category else "Other",
                calculation_type=ServiceType.CalculationType.CUSTOM,
            )
            item_data["service_type"] = service
        if not item_data.get("paint_type"):
            item_data["paint_type"] = master(PaintType, item_data.get("custom_product_type"))
        if not item_data.get("paint_brand"):
            item_data["paint_brand"] = master(PaintBrand, item_data.get("custom_brand"))
        if not item_data.get("unit"):
            item_data["unit"] = master(Unit, item_data.get("custom_unit"))
        if category and item_data.get("description"):
            master(WorkDescription, item_data["description"], service_type=service, service_category=category)
        return item_data

    def get_contractor_details(self, quotation):
        snapshot = quotation.contractor_snapshot or {}
        if snapshot:
            request = self.context.get("request")
            logo = ""
            if snapshot.get("company_logo"):
                logo = f"{settings.MEDIA_URL.rstrip('/')}/{snapshot['company_logo'].lstrip('/')}"
                if request:
                    logo = request.build_absolute_uri(logo)
            return {
                "id": quotation.contractor_id,
                "bharath_id": snapshot.get("bharath_id", ""),
                "company_name": snapshot.get("company_name", ""),
                "owner_name": snapshot.get("owner_name", ""),
                "mobile": snapshot.get("mobile", ""),
                "email": snapshot.get("email", ""),
                "company_logo": logo,
                "company_logo_shape": snapshot.get("company_logo_shape", "RECTANGLE"),
                "office_address": snapshot.get("office_address", ""),
                "service_areas": snapshot.get("service_areas", ""),
                "gst_number": snapshot.get("gst_number", ""),
                "pan_number": snapshot.get("pan_number", ""),
                "is_verified": snapshot.get("is_verified", False),
                "verification_status": snapshot.get("verification_status", ""),
            }
        contractor = quotation.contractor
        try:
            profile = contractor.contractor_profile
        except ContractorProfile.DoesNotExist:
            profile = None

        request = self.context.get("request")
        logo = None
        if profile and profile.company_logo:
            logo = profile.company_logo.url
            if request:
                logo = request.build_absolute_uri(logo)

        return {
            "id": contractor.id,
            "bharath_id": contractor.bharath_id,
            "company_name": profile.company_name if profile else contractor.get_full_name(),
            "owner_name": profile.owner_name if profile else contractor.get_full_name(),
            "mobile": contractor.mobile,
            "email": contractor.email,
            "company_logo": logo,
            "company_logo_shape": profile.company_logo_shape if profile else "RECTANGLE",
            "office_address": profile.office_address if profile else "",
            "service_areas": profile.service_areas if profile else "",
            "gst_number": profile.gst_number if profile else "",
            "pan_number": profile.pan_number if profile else "",
            "is_verified": contractor.is_verified,
            "verification_status": contractor.verification_status,
        }

    def get_customer_details(self, obj):
        snapshot = obj.customer_snapshot or {}
        if snapshot:
            return {
                "id": obj.customer_id,
                "bharath_id": snapshot.get("bharath_id", ""),
                "name": snapshot.get("name", ""),
                "mobile": snapshot.get("mobile", ""),
            }
        return {
            "id": obj.customer_id,
            "bharath_id": obj.customer.bharath_id,
            "name": obj.customer.name,
            "mobile": obj.customer.mobile,
        }

    # =====================================================
    # ITEM CALCULATION
    # =====================================================

    def calculate_item_amount(
        self,
        item_data,
        room=None
    ):

        calculation_method = item_data.get(
            "calculation_method",
            QuotationItem.CalculationMethod.AREA
        )

        rate = Decimal(
            item_data.get("rate") or 0
        )

        if rate < 0:

            raise serializers.ValidationError({
                "rate": "Rate cannot be negative."
            })

        # -------------------------------------------------
        # LUMPSUM
        # -------------------------------------------------

        if calculation_method == (
            QuotationItem.CalculationMethod.LUMPSUM
        ):

            quantity = Decimal("1")

            amount = rate.quantize(
                Decimal("0.01")
            )

            return quantity, amount

        # -------------------------------------------------
        # MANUAL
        # -------------------------------------------------

        if calculation_method == (
            QuotationItem.CalculationMethod.MANUAL
        ):

            quantity = Decimal(
                item_data.get("quantity") or 0
            )

            if quantity <= 0:

                raise serializers.ValidationError({
                    "quantity":
                    "Quantity must be greater than zero."
                })

            amount = (
                quantity * rate
            ).quantize(
                Decimal("0.01")
            )

            return quantity, amount

        # -------------------------------------------------
        # AREA
        # -------------------------------------------------

        if room is None:

            raise serializers.ValidationError({
                "room":
                "Room is required for area-based calculation."
            })

        service_type = item_data.get(
            "service_type"
        )

        if not service_type:

            raise serializers.ValidationError({
                "service_type":
                "Service type is required for area calculation."
            })

        calculation_type = (
            service_type.calculation_type
        )

        measured = None
        if room.property_room_id:
            measured_surfaces = room.property_room.measurement_surfaces.prefetch_related("openings")
            if measured_surfaces.exists():
                walls = [surface for surface in measured_surfaces if surface.surface_type == "WALL"]
                ceilings = [surface for surface in measured_surfaces if surface.surface_type == "CEILING"]
                openings = [opening for surface in walls for opening in surface.openings.all()]
                measured = {
                    "WALL": max(
                        sum((surface.gross_area for surface in walls), Decimal("0"))
                        - sum((surface.deduction_area for surface in walls), Decimal("0"))
                        + sum((surface.addition_area for surface in walls), Decimal("0")),
                        Decimal("0"),
                    ),
                    "CEILING": sum((surface.net_area for surface in ceilings), Decimal("0")),
                    "DOOR": sum((opening.area for opening in openings if opening.opening_type == "DOOR"), Decimal("0")),
                    "WINDOW": sum((opening.area for opening in openings if opening.opening_type == "WINDOW"), Decimal("0")),
                    "WARDROBE": sum((opening.area for opening in openings if opening.opening_type == "WARDROBE"), Decimal("0")),
                }
                measured["WALL_CEILING"] = measured["WALL"] + measured["CEILING"]

        # -------------------------------------------------
        # WALL
        # -------------------------------------------------

        if calculation_type == "WALL":
            quantity = measured["WALL"] if measured is not None else room.paintable_area

        # -------------------------------------------------
        # CEILING
        # -------------------------------------------------

        elif calculation_type == "CEILING":

            quantity = measured["CEILING"] if measured is not None else room.ceiling_area

        # -------------------------------------------------
        # WALL + CEILING
        # -------------------------------------------------

        elif calculation_type == "WALL_CEILING":

            quantity = measured["WALL_CEILING"] if measured is not None else room.paintable_area + room.ceiling_area

        # -------------------------------------------------
        # DOOR
        # -------------------------------------------------

        elif calculation_type == "DOOR":

            quantity = measured["DOOR"] if measured is not None else room.door_area

        # -------------------------------------------------
        # WINDOW
        # -------------------------------------------------

        elif calculation_type == "WINDOW":

            quantity = measured["WINDOW"] if measured is not None else room.window_area

        elif calculation_type == "WARDROBE":

            quantity = measured["WARDROBE"] if measured is not None else Decimal("0")

        elif calculation_type == "WATERPROOFING":

            quantity = item_data.get("quantity")
            if quantity is None:
                raise serializers.ValidationError({"quantity": "Quantity is required for waterproofing."})

        # -------------------------------------------------
        # CUSTOM
        # -------------------------------------------------

        elif calculation_type == "CUSTOM":

            quantity = item_data.get(
                "quantity"
            )

            if quantity is None:

                raise serializers.ValidationError({
                    "quantity":
                    "Quantity is required for custom calculation."
                })

        else:

            raise serializers.ValidationError({
                "service_type":
                f"Unsupported calculation type: "
                f"{calculation_type}"
            })

        quantity = Decimal(
            quantity or 0
        )

        if quantity <= 0:

            raise serializers.ValidationError({
                "quantity":
                "Calculated quantity must be greater than zero."
            })

        amount = (
            quantity * rate
        ).quantize(
            Decimal("0.01")
        )

        return quantity, amount

    # =====================================================
    # CALCULATE TOTALS
    # =====================================================

    def calculate_totals(
        self,
        quotation
    ):

        items = quotation.items.all()

        # -------------------------------------------------
        # SUBTOTAL
        # -------------------------------------------------

        subtotal = Decimal("0")

        for item in items:

            subtotal += Decimal(
                item.amount or 0
            )

        subtotal = subtotal.quantize(
            Decimal("0.01")
        )

        # -------------------------------------------------
        # DISCOUNT
        # -------------------------------------------------

        discount_type = (
            quotation.discount_type
        )

        discount_value = Decimal(
            quotation.discount_value or 0
        )

        if discount_value < 0:

            discount_value = Decimal("0")

        # Percentage discount

        if discount_type == "PERCENTAGE":

            if discount_value > 100:

                discount_value = Decimal("100")

            discount = (
                subtotal
                * discount_value
                / Decimal("100")
            )

        # Fixed discount

        else:

            discount = discount_value

        # Discount cannot exceed subtotal

        if discount > subtotal:

            discount = subtotal

        discount = discount.quantize(
            Decimal("0.01")
        )

        # -------------------------------------------------
        # TAXABLE AMOUNT
        # -------------------------------------------------

        taxable_amount = (
            subtotal - discount
        )

        taxable_amount = taxable_amount.quantize(
            Decimal("0.01")
        )

        # -------------------------------------------------
        # GST
        # -------------------------------------------------

        gst_percentage = Decimal(
            quotation.gst_percentage or 0
        )

        if gst_percentage < 0:

            gst_percentage = Decimal("0")

        gst_mode = quotation.gst_mode

        gst_amount = Decimal("0")

        grand_total = taxable_amount

        # -------------------------------------------------
        # GST EXTRA
        # -------------------------------------------------

        if gst_mode == "GST_EXTRA":

            gst_amount = (
                taxable_amount
                * gst_percentage
                / Decimal("100")
            )

            gst_amount = gst_amount.quantize(
                Decimal("0.01")
            )

            grand_total = (
                taxable_amount
                + gst_amount
            )

        # -------------------------------------------------
        # GST INCLUDED
        # -------------------------------------------------

        elif gst_mode == "GST_INCLUDED":

            if gst_percentage > 0:

                gst_amount = (
                    taxable_amount
                    * gst_percentage
                    / (
                        Decimal("100")
                        + gst_percentage
                    )
                )

                gst_amount = gst_amount.quantize(
                    Decimal("0.01")
                )

            grand_total = taxable_amount

        # -------------------------------------------------
        # NO GST
        # -------------------------------------------------

        elif gst_mode == "NO_GST":

            gst_amount = Decimal("0")

            grand_total = taxable_amount

        # -------------------------------------------------
        # FALLBACK
        # -------------------------------------------------

        else:

            gst_amount = Decimal("0")

            grand_total = taxable_amount

        grand_total = grand_total.quantize(
            Decimal("0.01")
        )

        # -------------------------------------------------
        # SAVE TOTALS
        # -------------------------------------------------

        quotation.subtotal = subtotal

        quotation.discount = discount

        quotation.gst_amount = gst_amount

        quotation.grand_total = grand_total

        quotation.save(
            update_fields=[
                "subtotal",
                "discount",
                "gst_amount",
                "grand_total",
                "updated_at",
            ]
        )

        return quotation

    # =====================================================
    # CREATE
    # =====================================================

    @transaction.atomic
    def create(
        self,
        validated_data
    ):

        rooms_data = validated_data.pop(
            "rooms",
            []
        )

        items_data = validated_data.pop(
            "items",
            []
        )

        # -------------------------------------------------
        # GENERATE UNIQUE QUOTATION NUMBER
        # -------------------------------------------------

        validated_data["quotation_number"] = (
            generate_quotation_number()
        )

        # -------------------------------------------------
        # CREATE QUOTATION
        # -------------------------------------------------

        quotation = Quotation.objects.create(
            **validated_data
        )

        created_rooms = []

        # -------------------------------------------------
        # CREATE ROOMS
        # -------------------------------------------------

        for room_data in rooms_data:

            room_data = room_data.copy()

            room_data.pop(
                "id",
                None
            )

            room = QuotationRoom.objects.create(
                quotation=quotation,
                **room_data
            )

            created_rooms.append(
                room
            )

        # -------------------------------------------------
        # CREATE ITEMS
        # -------------------------------------------------

        for item_data in items_data:

            item_data = item_data.copy()
            item_data = self.resolve_item_masters(item_data)

            item_data.pop(
                "id",
                None
            )

            room_index = item_data.pop(
                "room_index",
                None
            )

            room = item_data.get(
                "room"
            )

            # Resolve room using room_index

            if room is None and room_index is not None:

                try:

                    room = created_rooms[
                        int(room_index)
                    ]

                except (
                    ValueError,
                    TypeError,
                    IndexError
                ):

                    raise serializers.ValidationError({
                        "room_index":
                        "Invalid room index."
                    })

                item_data["room"] = room

            # Calculate quantity and amount

            quantity, amount = (
                self.calculate_item_amount(
                    item_data,
                    room
                )
            )

            item_data["quantity"] = quantity

            item_data["amount"] = amount

            QuotationItem.objects.create(
                quotation=quotation,
                **item_data
            )

        # -------------------------------------------------
        # CALCULATE TOTALS
        # -------------------------------------------------

        self.calculate_totals(
            quotation
        )

        if quotation.measurement_record_id:
            PropertyMeasurement.objects.filter(pk=quotation.measurement_record_id).update(
                status=PropertyMeasurement.Status.LOCKED
            )

        return quotation

    # =====================================================
    # UPDATE / PATCH
    # =====================================================

    def update(
        self,
        instance,
        validated_data
    ):

        rooms_data = validated_data.pop(
            "rooms",
            None
        )

        items_data = validated_data.pop(
            "items",
            None
        )

        # -------------------------------------------------
        # UPDATE QUOTATION FIELDS
        # -------------------------------------------------

        for attr, value in validated_data.items():

            setattr(
                instance,
                attr,
                value
            )

        instance.save()

        # -------------------------------------------------
        # UPDATE ROOMS
        # -------------------------------------------------

        rooms = list(
            instance.rooms.all()
        )

        if rooms_data is not None:

            for room_data in rooms_data:

                room_data = room_data.copy()

                room_id = room_data.pop(
                    "id",
                    None
                )

                if room_id:

                    room = (
                        instance.rooms
                        .filter(
                            id=room_id
                        )
                        .first()
                    )

                    if not room:

                        raise serializers.ValidationError({
                            "rooms":
                            f"Room {room_id} does not belong "
                            f"to this quotation."
                        })

                    for attr, value in (
                        room_data.items()
                    ):

                        setattr(
                            room,
                            attr,
                            value
                        )

                    room.save()

                else:

                    room = (
                        QuotationRoom.objects.create(
                            quotation=instance,
                            **room_data
                        )
                    )

                    rooms.append(
                        room
                    )

        # -------------------------------------------------
        # UPDATE ITEMS
        # -------------------------------------------------

        if items_data is not None:

            retained_item_ids = set()

            for item_data in items_data:

                item_data = item_data.copy()
                item_data = self.resolve_item_masters(item_data)

                item_id = item_data.pop(
                    "id",
                    None
                )

                room_index = item_data.pop(
                    "room_index",
                    None
                )

                item = None

                # -------------------------------------------------
                # FIND EXISTING ITEM
                # -------------------------------------------------

                if item_id:

                    retained_item_ids.add(item_id)

                    item = (
                        instance.items
                        .filter(
                            id=item_id
                        )
                        .first()
                    )

                    if not item:

                        raise serializers.ValidationError({
                            "items":
                            f"Item {item_id} does not belong "
                            f"to this quotation."
                        })

                # -------------------------------------------------
                # RESOLVE ROOM
                # -------------------------------------------------

                room = item_data.get(
                    "room"
                )

                if room is None and room_index is not None:

                    try:

                        room = rooms[
                            int(room_index)
                        ]

                    except (
                        ValueError,
                        TypeError,
                        IndexError
                    ):

                        raise serializers.ValidationError({
                            "room_index":
                            "Invalid room index."
                        })

                    item_data["room"] = room

                elif room is None and item:

                    room = item.room

                    if room:

                        item_data["room"] = room

                # -------------------------------------------------
                # EXISTING ITEM DEFAULTS
                # -------------------------------------------------

                if item:

                    if "calculation_method" not in item_data:

                        item_data[
                            "calculation_method"
                        ] = item.calculation_method

                    if "rate" not in item_data:

                        item_data[
                            "rate"
                        ] = item.rate

                    if "quantity" not in item_data:

                        item_data[
                            "quantity"
                        ] = item.quantity

                    if "service_type" not in item_data:

                        item_data[
                            "service_type"
                        ] = item.service_type

                # -------------------------------------------------
                # CALCULATE ITEM
                # -------------------------------------------------

                quantity, amount = (
                    self.calculate_item_amount(
                        item_data,
                        room
                    )
                )

                item_data["quantity"] = quantity

                item_data["amount"] = amount

                # -------------------------------------------------
                # SAVE EXISTING ITEM
                # -------------------------------------------------

                if item:

                    for attr, value in (
                        item_data.items()
                    ):

                        setattr(
                            item,
                            attr,
                            value
                        )

                    item.save()

                # -------------------------------------------------
                # CREATE NEW ITEM
                # -------------------------------------------------

                else:

                    created_item = QuotationItem.objects.create(
                        quotation=instance,
                        **item_data
                    )

                    retained_item_ids.add(created_item.id)

            instance.items.exclude(
                id__in=retained_item_ids
            ).delete()

        # -------------------------------------------------
        # RECALCULATE TOTALS
        # -------------------------------------------------

        self.calculate_totals(
            instance
        )

        return instance



class CustomerFollowUpSerializer(
    serializers.ModelSerializer
):

    class Meta:
        model = CustomerFollowUp

        fields = "__all__"

        read_only_fields = (
            "customer",
            "created_by",
            "follow_up_date",
            "created_at",
        )


class WorkPhotoSerializer(
    serializers.ModelSerializer
):

    class Meta:
        model = WorkPhoto

        fields = "__all__"

        read_only_fields = (
            "created_at",
        )


class CustomerWorkHistorySerializer(
    serializers.ModelSerializer
):

    photos = WorkPhotoSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = CustomerWorkHistory

        fields = (
            "id",
            "customer",
            "connection",
            "property",
            "service_name",
            "work_date",
            "amount",
            "description",
            "photos",
            "created_at",
        )

        read_only_fields = (
            "customer",
            "connection",
            "created_at",
            "photos",
        )

class CustomerDetailSerializer(
    ConnectionScopedCustomerMixin, serializers.ModelSerializer
):

    follow_ups = CustomerFollowUpSerializer(
        many=True,
        read_only=True
    )

    properties = PropertySerializer(
        many=True,
        read_only=True
    )

    quotations = QuotationSerializer(
        many=True,
        read_only=True
    )

    work_history = CustomerWorkHistorySerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Customer

        fields = (
            "id",
            "name",
            "mobile",
            "email",
            "whatsapp",
            "address",
            "city",
            "pincode",

            "status",
            "source",
            "requirement",
            "notes",
            "next_follow_up",

            "created_at",
            "updated_at",

            "follow_ups",
            "properties",
            "quotations",
            "work_history",
        )

        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "follow_ups",
            "properties",
            "quotations",
            "work_history",
        )


class CustomerTaskSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_mobile = serializers.CharField(source="customer.mobile", read_only=True)
    customer_bharath_id = serializers.CharField(source="customer.bharath_id", read_only=True)

    class Meta:
        model = CustomerFollowUp
        fields = (
            "id", "customer", "customer_bharath_id", "customer_name", "customer_mobile",
            "follow_up_type", "comment", "follow_up_date", "next_follow_up",
            "is_completed", "completed_at",
        )
        read_only_fields = fields

    def get_contractor_details(self, quotation):
        contractor = quotation.contractor
        try:
            profile = contractor.contractor_profile
        except ContractorProfile.DoesNotExist:
            profile = None

        request = self.context.get("request")
        logo = None
        if profile and profile.company_logo:
            logo = profile.company_logo.url
            if request:
                logo = request.build_absolute_uri(logo)

        return {
            "id": contractor.id,
            "bharath_id": contractor.bharath_id,
            "company_name": profile.company_name if profile else contractor.get_full_name(),
            "owner_name": profile.owner_name if profile else contractor.get_full_name(),
            "mobile": contractor.mobile,
            "email": contractor.email,
            "company_logo": logo,
            "company_logo_shape": profile.company_logo_shape if profile else "RECTANGLE",
            "office_address": profile.office_address if profile else "",
            "service_areas": profile.service_areas if profile else "",
            "gst_number": profile.gst_number if profile else "",
            "is_verified": contractor.is_verified,
            "verification_status": contractor.verification_status,
        }

    def validate(self, attrs):
        request = self.context.get("request")
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        property_obj = attrs.get("property", getattr(self.instance, "property", None))

        if request and customer and customer.contractor_id != request.user.id:
            raise serializers.ValidationError({
                "customer": "You cannot use another contractor's customer."
            })

        if request and property_obj:
            if property_obj.customer.contractor_id != request.user.id:
                raise serializers.ValidationError({
                    "property": "You cannot use another contractor's property."
                })
            if customer and property_obj.customer_id != customer.id:
                raise serializers.ValidationError({
                    "property": "The property must belong to the selected customer."
                })

        return attrs





class WorkPhotoSerializer(serializers.ModelSerializer):

    class Meta:
        model = WorkPhoto
        fields = "__all__"

        read_only_fields = (
            "created_at",
        )


class CustomerWorkHistorySerializer(
    serializers.ModelSerializer
):

    photos = WorkPhotoSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = CustomerWorkHistory

        fields = (
            "id",
            "customer",
            "connection",
            "property",
            "service_name",
            "work_date",
            "amount",
            "description",
            "photos",
            "created_at",
        )

        read_only_fields = (
            "customer",
            "connection",
            "created_at",
            "photos",
        )


class CustomerDetailSerializer(
    ConnectionScopedCustomerMixin, serializers.ModelSerializer
):

    follow_ups = CustomerFollowUpSerializer(
        many=True,
        read_only=True
    )

    properties = PropertySerializer(
        many=True,
        read_only=True
    )

    quotations = QuotationSerializer(
        many=True,
        read_only=True
    )

    work_history = CustomerWorkHistorySerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Customer

        fields = (
            "id",
            "name",
            "mobile",
            "email",
            "whatsapp",
            "address",
            "city",
            "pincode",
            "status",
            "source",
            "requirement",
            "notes",
            "next_follow_up",
            "created_at",
            "updated_at",

            "follow_ups",
            "properties",
            "quotations",
            "work_history",
        )

        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "follow_ups",
            "properties",
            "quotations",
            "work_history",
        )



class WorkPhotoSerializer(serializers.ModelSerializer):

    class Meta:
        model = WorkPhoto

        fields = "__all__"

        read_only_fields = (
            "work_history",
            "created_at",
        )


class WorkPhotoListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = WorkPhotoSerializer

    def get_queryset(self):

        work_history_id = self.kwargs.get(
            "work_history_id"
        )

        return WorkPhoto.objects.filter(
            work_history_id=work_history_id,
            work_history__customer__contractor=self.request.user
        ).order_by("-created_at")

    def perform_create(self, serializer):

        work_history_id = self.kwargs.get(
            "work_history_id"
        )

        work_history = CustomerWorkHistory.objects.filter(
            id=work_history_id,
            customer__contractor=self.request.user
        ).first()

        if not work_history:
            raise ValidationError({
                "work_history":
                    "Previous work record not found."
            })

        serializer.save(
            work_history=work_history
        )



class PropertyRoomSerializer(serializers.ModelSerializer):

    measurement_totals = serializers.SerializerMethodField()
    room_type_name = serializers.CharField(source="room_type.name", read_only=True)

    class Meta:
        model = PropertyRoom

        fields = "__all__"

        read_only_fields = (
            "property",
            "measurement_record",
            "wall_area",
            "ceiling_area",
            "window_area",
            "door_area",
            "paintable_area",
            "created_at",
            "updated_at",
        )

    def get_measurement_totals(self, room):
        surfaces = list(room.measurement_surfaces.prefetch_related("openings"))
        walls = [surface for surface in surfaces if surface.surface_type == "WALL"]
        ceilings = [surface for surface in surfaces if surface.surface_type == "CEILING"]
        openings = [opening for surface in surfaces for opening in surface.openings.all()]
        value = lambda amount: str(amount.quantize(Decimal("0.01")))
        wall_gross = sum((surface.gross_area for surface in walls), Decimal("0"))
        wall_deductions = sum((surface.deduction_area for surface in walls), Decimal("0"))
        deductions = wall_deductions + sum((surface.deduction_area for surface in ceilings), Decimal("0"))
        wall_additions = sum((surface.addition_area for surface in walls), Decimal("0"))
        additions = wall_additions + sum((surface.addition_area for surface in ceilings), Decimal("0"))
        wall_net = max(wall_gross - wall_deductions + wall_additions, Decimal("0"))
        ceiling = sum((surface.net_area for surface in ceilings), Decimal("0"))
        return {
            "has_measurements": bool(surfaces),
            "wall_gross": value(wall_gross),
            "deductions": value(deductions),
            "additions": value(additions),
            "wall_net": value(wall_net),
            "ceiling": value(ceiling),
            "door": value(sum((item.area for item in openings if item.opening_type == "DOOR"), Decimal("0"))),
            "window": value(sum((item.area for item in openings if item.opening_type == "WINDOW"), Decimal("0"))),
            "wardrobe": value(sum((item.area for item in openings if item.opening_type == "WARDROBE"), Decimal("0"))),
        }

    def validate_room_type(self, room_type):
        request = self.context.get("request")
        owner = room_type.created_by if room_type else None
        is_shared_master = owner is None or getattr(owner, "role", None) == "ADMIN"
        if room_type and request and room_type.created_by_id != request.user.id and not is_shared_master:
            raise serializers.ValidationError("Select one of your available room types.")
        return room_type


from .models import MeasurementOpening, MeasurementSurface


class MeasurementOpeningSerializer(serializers.ModelSerializer):
    area = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_deduction = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    separate_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = MeasurementOpening
        fields = "__all__"
        read_only_fields = ("surface",)

    def validate(self, attrs):
        surface = self.context.get("surface") or getattr(self.instance, "surface", None)
        target_type = attrs.get(
            "deduct_from_surface_type",
            getattr(self.instance, "deduct_from_surface_type", ""),
        )
        target_group = attrs.get(
            "deduct_from_group_name",
            getattr(self.instance, "deduct_from_group_name", ""),
        )
        if surface and target_type and target_type != surface.surface_type:
            raise serializers.ValidationError({
                "deduct_from_surface_type": "The deduction target must match the selected surface group."
            })
        if surface and surface.surface_type == "OTHER" and target_group and target_group != surface.area_group_name:
            raise serializers.ValidationError({
                "deduct_from_group_name": "The deduction target must match the selected custom surface group."
            })
        return attrs


class MeasurementSurfaceSerializer(serializers.ModelSerializer):
    openings = MeasurementOpeningSerializer(many=True, read_only=True)
    is_adjustment_anchor = serializers.SerializerMethodField()
    gross_area = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    deduction_area = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    addition_area = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_area = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = MeasurementSurface
        fields = "__all__"
        read_only_fields = ("property", "measurement_record", "created_at", "updated_at")

    def get_is_adjustment_anchor(self, obj):
        return obj.name == "__ROOM_ADJUSTMENTS__"

    def validate(self, attrs):
        property_obj = self.context["property_obj"]
        room = attrs.get("room", getattr(self.instance, "room", None))
        work_area = attrs.get("work_area", getattr(self.instance, "work_area", None))
        if room and room.property_id != property_obj.id:
            raise serializers.ValidationError({"room": "Room must belong to this property."})
        if work_area == MeasurementSurface.WorkArea.INTERIOR and not room:
            raise serializers.ValidationError({"room": "Interior surfaces require a room."})
        return attrs


    
