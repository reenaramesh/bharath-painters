from rest_framework import serializers
from decimal import Decimal

from accounts.models import BharathUser

from .models import (
    AdditionalWorkRequest,
    CorrectionRequest,
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


def user_label(user):
    if user is None:
        return ""
    return user.get_full_name() or user.username


class SubcontractWorkOrderScopeSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = self.context.get("viewer")
        privileged = viewer and (viewer.id == instance.work_order.main_contractor_id or viewer.role == BharathUser.Roles.ADMIN or viewer.is_superuser)
        if not instance.work_order.material_mode and not privileged:
            data.pop("unit_rate", None)
        if not privileged:
            data.pop("source_quotation_item",None)
        return data

    class Meta:
        model = SubcontractWorkOrderScope
        fields = [
            "id",
            "project_scope",
            "category",
            "title_snapshot",
            "category_name_snapshot",
            "work_description_snapshot",
            "unit_name_snapshot",
            "quantity",
            "unit_rate",
            "is_included",
            "sort_order",
            "source_quotation_item",
            "specification_snapshot",
        ]
        read_only_fields = ["id", "category", "title_snapshot","source_quotation_item","specification_snapshot"]


class WorkOrderAssignmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderAssignment
        fields = [
            "id",
            "employee",
            "employee_name",
            "status",
            "assigned_at",
            "responded_at",
            "released_at",
            "note",
        ]
        read_only_fields = ["id", "employee_name", "assigned_at", "responded_at", "released_at"]

    def get_employee_name(self, obj):
        return user_label(obj.employee)

    def validate_employee(self, value):
        if value.role != BharathUser.Roles.PAINTER:
            raise serializers.ValidationError("Only employees can be assigned to a work order.")
        return value


class CorrectionRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CorrectionRequest
        fields = [
            "id",
            "completion",
            "requested_by_name",
            "note",
            "resolution_note",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        return user_label(obj.requested_by)


class WorkOrderCompletionSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.SerializerMethodField()
    correction_requests = CorrectionRequestSerializer(many=True, read_only=True)

    class Meta:
        model = WorkOrderCompletion
        fields = [
            "id",
            "submission_number",
            "submitted_by_name",
            "summary",
            "labour_days",
            "evidence",
            "is_current",
            "open_correction_count",
            "correction_requests",
            "submitted_at",
        ]
        read_only_fields = fields

    def get_submitted_by_name(self, obj):
        return user_label(obj.submitted_by)


class AdditionalWorkRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AdditionalWorkRequest
        fields = [
            "id",
            "description",
            "estimated_amount",
            "approved_amount",
            "status",
            "requested_by_name",
            "decided_by_name",
            "decision_note",
            "created_at",
            "decided_at",
        ]
        read_only_fields = [
            "id",
            "approved_amount",
            "status",
            "requested_by_name",
            "decided_by_name",
            "decision_note",
            "created_at",
            "decided_at",
        ]

    def get_requested_by_name(self, obj):
        return user_label(obj.requested_by)

    def get_decided_by_name(self, obj):
        return user_label(obj.decided_by)

    def validate_estimated_amount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Enter zero or more.")
        return value


class SubcontractQuoteLineSerializer(serializers.ModelSerializer):
    discount_amount = serializers.SerializerMethodField()
    net_amount = serializers.SerializerMethodField()

    def get_discount_amount(self, obj):
        from quotations.discounts import discount_amount
        return str(discount_amount(obj.amount,obj.discount_type,obj.discount_value) if obj.quote.pricing.get("discount_mode") == "LINE" else Decimal("0.00"))

    def get_net_amount(self, obj):
        return str(obj.amount-Decimal(self.get_discount_amount(obj)))

    class Meta:
        model = SubcontractQuoteLine
        fields = [
            "id",
            "work_description",
            "category",
            "description_snapshot",
            "unit_name_snapshot",
            "specification",
            "quantity",
            "unit_rate",
            "amount",
            "is_optional",
            "sort_order",
            "source_scope","discount_type","discount_value","discount_amount","net_amount",
        ]
        read_only_fields = ["id", "amount","source_scope","discount_type","discount_value"]

    def validate(self, attrs):
        quantity = attrs.get("quantity") or 0
        unit_rate = attrs.get("unit_rate") or 0
        if quantity <= 0:
            raise serializers.ValidationError({"quantity": "Enter a quantity above zero."})
        if unit_rate < 0:
            raise serializers.ValidationError({"unit_rate": "Enter a rate of zero or more."})
        # A linked master description fills the snapshot in, so only a hand
        # written line has to carry its own text.
        if not (attrs.get("description_snapshot") or "").strip() and not attrs.get(
            "work_description"
        ):
            raise serializers.ValidationError(
                {"description_snapshot": "Say what this line covers."}
            )
        return attrs


class SubcontractQuoteSerializer(serializers.ModelSerializer):
    quote_lines = SubcontractQuoteLineSerializer(many=True)
    created_by_name = serializers.SerializerMethodField()
    work_order_reference = serializers.CharField(source="work_order.reference", read_only=True)

    class Meta:
        model = SubcontractQuote
        fields = [
            "id",
            "reference",
            "work_order",
            "work_order_reference",
            "supersedes",
            "status",
            "quote_lines",
            "subtotal",
            "tax_amount",
            "total",
            "valid_days",
            "expires_at",
            "notes",
            "terms",
            "is_current",
            "sent_at",
            "decided_at",
            "decision_note",
            "created_by_name",
            "created_at",
            "updated_at",
            "pricing",
        ]
        read_only_fields = [
            "id",
            "reference",
            "supersedes",
            "status",
            "subtotal",
            "total",
            "is_current",
            "sent_at",
            "decided_at",
            "decision_note",
            "created_at",
            "updated_at",
            "pricing",
        ]

    def get_created_by_name(self, obj):
        return user_label(obj.created_by)

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != SubcontractQuote.Status.DRAFT:
            raise serializers.ValidationError("Only a draft quote can be edited.")
        lines = attrs.get("quote_lines")
        if not lines:
            raise serializers.ValidationError({"quote_lines": "Add at least one line."})
        if attrs.get("tax_amount") is not None and attrs["tax_amount"] < 0:
            raise serializers.ValidationError({"tax_amount": "Enter zero or more."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("quote_lines")
        quote = SubcontractQuote.objects.create(**validated_data)
        self._write_lines(quote, lines)
        quote.recalculate()
        return quote

    def update(self, instance, validated_data):
        lines = validated_data.pop("quote_lines", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if lines is not None:
            instance.quote_lines.all().delete()
            self._write_lines(instance, lines)
            instance.recalculate()
        return instance

    @staticmethod
    def _write_lines(quote, lines):
        rows = []
        for index, line in enumerate(lines):
            data = dict(line)
            data.pop("id", None)
            row = SubcontractQuoteLine(quote=quote, sort_order=data.pop("sort_order", 0) or (index + 1) * 10, **data)
            # Saved one by one because bulk_create skips save(), and the amount
            # is derived there from quantity x rate.
            row.save()
            rows.append(row)
        return rows


class SubcontractInvoicePaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SubcontractInvoicePayment
        fields = [
            "id",
            "received_date",
            "amount",
            "payment_mode",
            "payment_reference",
            "notes",
            "recorded_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "recorded_by_name", "created_at"]

    def get_recorded_by_name(self, obj):
        return user_label(obj.recorded_by)


class SubcontractInvoiceSerializer(serializers.ModelSerializer):
    payments = SubcontractInvoicePaymentSerializer(many=True, read_only=True)
    work_order_reference = serializers.CharField(source="work_order.reference", read_only=True)
    receiving_contractor_name = serializers.SerializerMethodField()

    class Meta:
        model = SubcontractInvoice
        fields = [
            "id",
            "reference",
            "work_order",
            "work_order_reference",
            "receiving_contractor_name",
            "status",
            "issue_date",
            "due_date",
            "subtotal",
            "tax_amount",
            "total",
            "amount_paid",
            "balance",
            "notes",
            "payments",
            "issued_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "work_order",
            "work_order_reference",
            "receiving_contractor_name",
            "amount_paid",
            "balance",
            "status",
            "issued_at",
            "created_at",
        ]

    def get_receiving_contractor_name(self, obj):
        return user_label(obj.work_order.receiving_contractor)


class WageRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = WageRecord
        fields = [
            "id",
            "work_order",
            "employee",
            "employee_name",
            "wage_type",
            "amount",
            "days_worked",
            "accrued_on",
            "is_paid",
            "paid_at",
            "payment_mode",
            "note",
            "created_at",
        ]
        read_only_fields = ["id", "employee_name", "work_order", "created_at"]

    def get_employee_name(self, obj):
        return user_label(obj.employee)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter an amount above zero.")
        return value

    def validate_employee(self, value):
        if value.role != BharathUser.Roles.PAINTER:
            raise serializers.ValidationError("Wages can only be recorded for employees.")
        return value


class WorkOrderEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderEvent
        fields = [
            "id",
            "from_status",
            "to_status",
            "event_type",
            "note",
            "actor_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return user_label(obj.actor)


class SubcontractWorkOrderSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = self.context.get("viewer")
        owner_or_admin = viewer and (viewer.id == instance.main_contractor_id or
                                    viewer.role == BharathUser.Roles.ADMIN or viewer.is_superuser)
        # Older offers could have copied customer totals into this field.
        # Reveal it to recipients only once the subcontract price is confirmed.
        if not owner_or_admin:
            data.pop("private_pricing",None)
            accepted = instance.quotes.filter(status=SubcontractQuote.Status.ACCEPTED, is_current=True).first()
            if not instance.material_mode:
                data["agreed_amount"] = self.fields["agreed_amount"].to_representation(accepted.total) if accepted else None
        return data

    scopes = SubcontractWorkOrderScopeSerializer(many=True, read_only=True)
    assignments = WorkOrderAssignmentSerializer(many=True, read_only=True)
    completions = WorkOrderCompletionSerializer(many=True, read_only=True)
    correction_requests = CorrectionRequestSerializer(many=True, read_only=True)
    additional_work_requests = AdditionalWorkRequestSerializer(many=True, read_only=True)
    quotes = SubcontractQuoteSerializer(many=True, read_only=True)
    invoices = SubcontractInvoiceSerializer(many=True, read_only=True)
    events = WorkOrderEventSerializer(many=True, read_only=True)

    main_contractor_name = serializers.SerializerMethodField()
    receiving_contractor_name = serializers.SerializerMethodField()
    quotation_reference = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    viewer_authority = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    can_manage_people = serializers.SerializerMethodField()
    pricing_quote = serializers.SerializerMethodField()
    source_revision_number = serializers.SerializerMethodField()

    class Meta:
        model = SubcontractWorkOrder
        fields = [
            "id",
            "reference",
            "quotation",
            "quotation_reference",
            "main_contractor",
            "main_contractor_name",
            "receiving_contractor",
            "receiving_contractor_name",
            "connection",
            "status",
            "status_display",
            "project_title",
            "site_address",
            "agreed_scope_summary",
            "instructions",
            "terms",
            "agreed_amount",
            "required_start_date",
            "required_end_date",
            "sent_at",
            "accepted_at",
            "declined_at",
            "started_at",
            "completed_at",
            "closed_at",
            "close_reason",
            "scopes",
            "assignments",
            "completions",
            "correction_requests",
            "additional_work_requests",
            "quotes",
            "invoices",
            "events",
            "viewer_authority",
            "allowed_transitions",
            "can_manage_people",
            "created_at",
            "updated_at",
            "material_mode","private_pricing","pricing_quote","source_revision_number",
        ]
        read_only_fields = [
            "id",
            "reference",
            "main_contractor",
            "main_contractor_name",
            "status",
            "status_display",
            "sent_at",
            "accepted_at",
            "declined_at",
            "started_at",
            "completed_at",
            "closed_at",
            "close_reason",
            "scopes",
            "assignments",
            "completions",
            "correction_requests",
            "additional_work_requests",
            "quotes",
            "invoices",
            "events",
            "viewer_authority",
            "allowed_transitions",
            "can_manage_people",
            "created_at",
            "updated_at",
            "material_mode","private_pricing","pricing_quote","source_revision_number",
        ]

    def get_main_contractor_name(self, obj):
        return user_label(obj.main_contractor)

    def get_receiving_contractor_name(self, obj):
        return user_label(obj.receiving_contractor)

    def get_quotation_reference(self, obj):
        return obj.private_pricing.get("source_reference") or obj.quotation.quotation_number or str(obj.quotation_id)

    def get_source_revision_number(self, obj):
        return obj.private_pricing.get("source_revision",obj.quotation.version_number)

    def get_pricing_quote(self, obj):
        if not obj.material_mode:
            return None
        quote=obj.quotes.filter(is_current=True,created_by=obj.main_contractor).prefetch_related("quote_lines").first()
        return SubcontractQuoteSerializer(quote,context=self.context).data if quote else None

    def get_viewer_authority(self, obj):
        from .workflow import authority_for

        return authority_for(self.context.get("viewer"), obj) if self.context.get("viewer") else None

    def get_allowed_transitions(self, obj):
        from .workflow import TRANSITIONS

        viewer = self.context.get("viewer")
        if not viewer:
            return []
        allowed = []
        for target in TRANSITIONS.get(obj.status, {}):
            reason = can_transition_safe(viewer, obj, target)
            if reason is None:
                allowed.append(target)
        return allowed

    def get_can_manage_people(self, obj):
        viewer = self.context.get("viewer")
        return bool(viewer and viewer.id == obj.receiving_contractor_id)


def can_transition_safe(viewer, work_order, target):
    from .workflow import can_transition

    try:
        return can_transition(viewer, work_order, target)
    except Exception:
        return "unavailable"
