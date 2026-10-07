from django.contrib import admin

from .models import (
    AdditionalWorkRequest,
    CorrectionRequest,
    OutsourcingReferenceSequence,
    SubcontractInvoice,
    SubcontractInvoicePayment,
    SubcontractQuote,
    SubcontractQuoteLine,
    SubcontractWorkOrder,
    SubcontractWorkOrderScope,
    WageRecord,
    WorkOrderAssignment,
    WorkOrderCompletion,
    WorkOrderEvent,
)


class SubcontractQuoteLineInline(admin.TabularInline):
    model = SubcontractQuoteLine
    extra = 0


class SubcontractQuoteInline(admin.TabularInline):
    model = SubcontractQuote
    extra = 0
    show_change_link = True


class SubcontractInvoicePaymentInline(admin.TabularInline):
    model = SubcontractInvoicePayment
    extra = 0


@admin.register(SubcontractWorkOrder)
class SubcontractWorkOrderAdmin(admin.ModelAdmin):
    list_display = ("reference", "project_title", "main_contractor", "receiving_contractor", "status", "agreed_amount")
    list_filter = ("status",)
    search_fields = ("reference", "project_title")
    raw_id_fields = ("quotation", "main_contractor", "receiving_contractor", "connection", "created_by")
    date_hierarchy = "created_at"


@admin.register(SubcontractWorkOrderScope)
class SubcontractWorkOrderScopeAdmin(admin.ModelAdmin):
    list_display = ("work_order", "title_snapshot", "work_description_snapshot", "is_included")
    raw_id_fields = ("work_order", "project_scope", "category")


@admin.register(SubcontractQuote)
class SubcontractQuoteAdmin(admin.ModelAdmin):
    list_display = ("reference", "work_order", "status", "total", "is_current")
    list_filter = ("status", "is_current")
    inlines = [SubcontractQuoteLineInline]
    raw_id_fields = ("work_order", "supersedes", "created_by")


@admin.register(SubcontractQuoteLine)
class SubcontractQuoteLineAdmin(admin.ModelAdmin):
    list_display = ("quote", "description_snapshot", "quantity", "unit_rate", "amount")
    raw_id_fields = ("quote", "work_description", "category")


@admin.register(WorkOrderAssignment)
class WorkOrderAssignmentAdmin(admin.ModelAdmin):
    list_display = ("work_order", "employee", "status", "assigned_at")
    list_filter = ("status",)
    raw_id_fields = ("work_order", "employee", "assigned_by")


@admin.register(WorkOrderCompletion)
class WorkOrderCompletionAdmin(admin.ModelAdmin):
    list_display = ("work_order", "submission_number", "submitted_by", "is_current", "open_correction_count")
    raw_id_fields = ("work_order", "submitted_by")


@admin.register(CorrectionRequest)
class CorrectionRequestAdmin(admin.ModelAdmin):
    list_display = ("work_order", "requested_by", "created_at", "resolved_at")
    raw_id_fields = ("work_order", "completion", "requested_by")


@admin.register(AdditionalWorkRequest)
class AdditionalWorkRequestAdmin(admin.ModelAdmin):
    list_display = ("work_order", "status", "estimated_amount", "approved_amount", "created_at")
    list_filter = ("status",)
    raw_id_fields = ("work_order", "requested_by", "decided_by")


@admin.register(SubcontractInvoice)
class SubcontractInvoiceAdmin(admin.ModelAdmin):
    list_display = ("reference", "work_order", "status", "total", "amount_paid", "balance")
    list_filter = ("status",)
    inlines = [SubcontractInvoicePaymentInline]
    raw_id_fields = ("work_order", "created_by")


@admin.register(SubcontractInvoicePayment)
class SubcontractInvoicePaymentAdmin(admin.ModelAdmin):
    list_display = ("invoice", "amount", "payment_mode", "received_date")
    raw_id_fields = ("invoice", "recorded_by")


@admin.register(WageRecord)
class WageRecordAdmin(admin.ModelAdmin):
    list_display = ("work_order", "employee", "wage_type", "amount", "accrued_on", "is_paid")
    list_filter = ("wage_type", "is_paid")
    raw_id_fields = ("work_order", "employee", "recorded_by")


@admin.register(WorkOrderEvent)
class WorkOrderEventAdmin(admin.ModelAdmin):
    list_display = ("work_order", "from_status", "to_status", "actor", "created_at")
    raw_id_fields = ("work_order", "actor")


admin.site.register(OutsourcingReferenceSequence)
