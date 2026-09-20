from django.contrib import admin

from .models import (
    Area,
    ServiceType,
    PaintType,
    PaintBrand,
    PaintColor,
    Unit,
    Customer,
    Property,
    ApartmentCommunity,
    Quotation,
    QuotationRoom,
    QuotationItem,
    WorkChange,
    WorkChangeItem,
    ActivityLog,
)


class WorkChangeItemInline(admin.TabularInline):
    model = WorkChangeItem
    extra = 0
    readonly_fields = ("old_amount", "new_amount", "price_difference", "created_at", "updated_at")


@admin.register(WorkChange)
class WorkChangeAdmin(admin.ModelAdmin):
    list_display = ("change_number", "quotation", "customer", "status", "requested_date", "price_difference")
    list_filter = ("status", "requested_date")
    search_fields = ("change_number", "quotation__quotation_number", "customer__name", "customer__mobile")
    readonly_fields = ("change_number", "sent_at", "approved_at", "rejected_at", "cancelled_at", "created_at", "updated_at")
    inlines = (WorkChangeItemInline,)


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor_name", "actor_role", "action", "module", "description", "is_flagged", "reviewed_at")
    list_filter = ("actor_role", "action", "module", "is_flagged")
    search_fields = ("actor_name", "description", "object_id")
    readonly_fields = ("actor", "actor_name", "actor_role", "action", "module", "description", "method", "path", "object_id", "status_code", "ip_address", "metadata", "created_at", "reviewed_at", "reviewed_by")


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
    )

    search_fields = (
        "name",
        "created_by__mobile",
    )


@admin.register(ServiceType)
class ServiceTypeAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
    )

    search_fields = (
        "name",
        "created_by__mobile",
    )


@admin.register(PaintType)
class PaintTypeAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "service_category",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
    )

    search_fields = (
        "name",
        "key_features",
        "created_by__mobile",
    )


@admin.register(PaintBrand)
class PaintBrandAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
    )

    search_fields = (
        "name",
        "created_by__mobile",
    )


@admin.register(PaintColor)
class PaintColorAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "brand",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "brand",
        "is_active",
    )

    search_fields = (
        "name",
        "code",
        "brand__name",
        "created_by__mobile",
    )


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "created_by",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
    )

    search_fields = (
        "name",
        "created_by__mobile",
    )


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "bharath_id",
        "name",
        "mobile",
        "email",
        "city",
        "contractor",
        "created_at",
    )

    search_fields = (
        "bharath_id",
        "name",
        "mobile",
        "email",
        "city",
        "contractor__mobile",
    )


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "flat_number",
        "block_name",
        "property_type",
        "customer",
        "city",
        "approximate_area",
        "created_at",
    )

    list_filter = (
        "property_type",
        "city",
    )

    search_fields = (
        "name",
        "flat_number",
        "block_name",
        "address",
        "city",
        "customer__name",
        "customer__mobile",
    )


class QuotationRoomInline(admin.TabularInline):
    model = QuotationRoom
    extra = 0


class QuotationItemInline(admin.TabularInline):
    model = QuotationItem
    extra = 0


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = (
        "quotation_number",
        "contractor",
        "customer",
        "property",
        "status",
        "subtotal",
        "gst_amount",
        "grand_total",
        "quotation_date",
    )

    list_filter = (
        "status",
        "quotation_date",
    )

    search_fields = (
        "quotation_number",
        "customer__name",
        "customer__mobile",
        "contractor__mobile",
    )

    readonly_fields = (
        "quotation_number",
        "quotation_date",
        "created_at",
        "updated_at",
    )

    inlines = (
        QuotationRoomInline,
        QuotationItemInline,
    )


@admin.register(QuotationRoom)
class QuotationRoomAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "quotation",
        "area",
        "paintable_area",
        "created_at",
    )

    search_fields = (
        "name",
        "quotation__quotation_number",
    )


@admin.register(QuotationItem)
class QuotationItemAdmin(admin.ModelAdmin):
    list_display = (
        "quotation",
        "room",
        "description",
        "service_type",
        "paint_type",
        "paint_brand",
        "color",
        "quantity",
        "unit",
        "rate",
        "amount",
    )

    list_filter = (
        "service_type",
        "paint_type",
        "paint_brand",
    )

    search_fields = (
        "description",
        "quotation__quotation_number",
        "room__name",
    )


@admin.register(ApartmentCommunity)
class ApartmentCommunityAdmin(admin.ModelAdmin):
    list_display = ("name", "locality", "zone", "pincode", "is_active")
    list_filter = ("zone", "locality", "is_active")
    search_fields = ("name", "locality", "zone", "pincode")
    list_per_page = 50
