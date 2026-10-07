from django.conf import settings
from django.db import models
from django.utils import timezone
from decimal import Decimal

TWO_PLACES = Decimal("0.01")


class OutsourcingReferenceSequence(models.Model):
    scope = models.CharField(max_length=30)
    financial_year = models.CharField(max_length=9)
    last_number = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("scope", "financial_year"),
                name="unique_outsourcing_reference_sequence",
            ),
        ]

    def __str__(self):
        return f"{self.scope} {self.financial_year}: {self.last_number}"


def financial_year(moment=None):
    moment = moment or timezone.localdate()
    start_year = moment.year if moment.month >= 4 else moment.year - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def next_reference(prefix, scope):
    """Allocate the next per-financial-year reference for a document family."""
    year = financial_year()
    sequence, _ = OutsourcingReferenceSequence.objects.select_for_update().get_or_create(
        scope=scope,
        financial_year=year,
    )
    sequence.last_number += 1
    sequence.save(update_fields=["last_number", "updated_at"])
    return f"{prefix}/{year}/{sequence.last_number:05d}"


class SubcontractWorkOrder(models.Model):
    """Work a main contractor hands to a receiving contractor.

    Money on this record belongs to the main -> receiving relationship only.
    Whatever the receiving contractor pays their own people is tracked
    separately in WageRecord so the two ledgers never mix.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        SUBMITTED_FOR_REVIEW = "SUBMITTED_FOR_REVIEW", "Submitted for review"
        CORRECTION_REQUESTED = "CORRECTION_REQUESTED", "Correction requested"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    reference = models.CharField(max_length=40, unique=True)
    quotation = models.ForeignKey(
        "quotations.Quotation",
        on_delete=models.PROTECT,
        related_name="subcontract_work_orders",
    )
    main_contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="subcontract_work_orders_issued",
    )
    receiving_contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="subcontract_work_orders_received",
    )
    connection = models.ForeignKey(
        "quotations.ContractorConnection",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_work_orders",
    )

    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)

    project_title = models.CharField(max_length=200)
    site_address = models.TextField(blank=True)
    agreed_scope_summary = models.TextField(
        blank=True,
        help_text="Snapshot of what was shared with the receiving contractor.",
    )
    instructions = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    agreed_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    required_start_date = models.DateField(null=True, blank=True)
    required_end_date = models.DateField(null=True, blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.CharField(max_length=250, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_work_orders_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"{self.reference} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("WO", "work_order")
        super().save(*args, **kwargs)

    def involved_user(self, user):
        return user.id in {self.main_contractor_id, self.receiving_contractor_id}


class SubcontractWorkOrderScope(models.Model):
    """Immutable snapshot of a project scope shared on a work order.

    The live project scope can change later, so the receiving contractor keeps
    working from the copy that was agreed at the time.
    """

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="scopes",
    )
    project_scope = models.ForeignKey(
        "quotations.ProjectScope",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shared_on_work_orders",
    )
    category = models.ForeignKey(
        "quotations.ServiceCategory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order_scopes",
    )

    title_snapshot = models.CharField(max_length=200, blank=True)
    category_name_snapshot = models.CharField(max_length=150, blank=True)
    work_description_snapshot = models.CharField(max_length=200, blank=True)
    unit_name_snapshot = models.CharField(max_length=40, blank=True)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    is_included = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return self.title_snapshot or self.work_description_snapshot or f"Scope {self.pk}"


class SubcontractQuote(models.Model):
    """Price a receiving contractor proposes for a work order."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED = "EXPIRED", "Expired"

    reference = models.CharField(max_length=40, unique=True)
    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="quotes",
    )
    supersedes = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revisions",
    )

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    valid_days = models.PositiveSmallIntegerField(default=15)
    expires_at = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)
    is_current = models.BooleanField(default=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=250, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_quotes_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"{self.reference} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("SQ", "subcontract_quote")
        super().save(*args, **kwargs)

    def recalculate(self, save=True):
        subtotal = sum((line.amount for line in self.quote_lines.all()), Decimal("0"))
        self.subtotal = subtotal.quantize(TWO_PLACES)
        self.total = (self.subtotal + (self.tax_amount or Decimal("0"))).quantize(TWO_PLACES)
        if save:
            self.save(update_fields=["subtotal", "total", "updated_at"])
        return self


class SubcontractQuoteLine(models.Model):
    quote = models.ForeignKey(
        SubcontractQuote,
        on_delete=models.CASCADE,
        related_name="quote_lines",
    )
    work_description = models.ForeignKey(
        "quotations.WorkDescription",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_quote_lines",
    )
    category = models.ForeignKey(
        "quotations.ServiceCategory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_quote_lines",
    )

    description_snapshot = models.CharField(max_length=200, blank=True)
    unit_name_snapshot = models.CharField(max_length=40, blank=True)
    specification = models.TextField(blank=True)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_optional = models.BooleanField(default=False)

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return self.description_snapshot or f"Line {self.pk}"

    def save(self, *args, **kwargs):
        if self.work_description_id and not self.description_snapshot:
            self.description_snapshot = self.work_description.name
        if not self.category_id and self.work_description_id:
            self.category_id = self.work_description.service_category_id
        self.amount = (self.quantity * self.unit_rate).quantize(TWO_PLACES)
        super().save(*args, **kwargs)


class WorkOrderAssignment(models.Model):
    """A receiving contractor putting one of their employees on a work order."""

    class Status(models.TextChoices):
        PROPOSED = "PROPOSED", "Proposed"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        RELEASED = "RELEASED", "Released"

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="work_order_assignments",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order_assignments_made",
    )

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROPOSED)
    assigned_at = models.DateTimeField(default=timezone.now)
    responded_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ("-assigned_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("work_order", "employee"),
                name="unique_work_order_employee_assignment",
            ),
        ]

    def __str__(self):
        return f"{self.employee_id} on {self.work_order_id} ({self.status})"


class WorkOrderCompletion(models.Model):
    """A completion submission from the receiving contractor."""

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="completions",
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order_completions",
    )
    submission_number = models.PositiveSmallIntegerField(default=1)
    summary = models.TextField(blank=True)
    labour_days = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    evidence = models.JSONField(default=list, blank=True)
    is_current = models.BooleanField(default=True)
    open_correction_count = models.PositiveSmallIntegerField(default=0)
    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-submission_number", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("work_order", "submission_number"),
                name="unique_work_order_completion_number",
            ),
        ]

    def __str__(self):
        return f"{self.work_order_id} submission {self.submission_number}"


class CorrectionRequest(models.Model):
    """Raised by the main contractor against a completion submission."""

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="correction_requests",
    )
    completion = models.ForeignKey(
        WorkOrderCompletion,
        on_delete=models.CASCADE,
        related_name="correction_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="correction_requests_raised",
    )
    note = models.TextField()
    resolution_note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"Correction on {self.work_order_id}"


class AdditionalWorkRequest(models.Model):
    """Extra work the receiving contractor wants priced by the main contractor."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        DECLINED = "DECLINED", "Declined"

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="additional_work_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="additional_work_requests_raised",
    )
    description = models.TextField()
    estimated_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    approved_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="additional_work_requests_decided",
    )
    decision_note = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"Additional work on {self.work_order_id} ({self.status})"


class SubcontractInvoice(models.Model):
    """Main contractor billing the receiving contractor. Never the customer."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PART_PAID = "PART_PAID", "Part paid"
        PAID = "PAID", "Paid"
        VOID = "VOID", "Void"

    class PaymentMode(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        CARD = "CARD", "Card"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    reference = models.CharField(max_length=40, unique=True)
    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)

    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    notes = models.CharField(max_length=250, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_invoices_created",
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-issue_date", "-id")

    def __str__(self):
        return f"{self.reference} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("SI", "subcontract_invoice")
        self.balance = (self.total - self.amount_paid).quantize(TWO_PLACES)
        if self.status != self.Status.VOID:
            if self.amount_paid <= 0:
                if self.status in {self.Status.PART_PAID, self.Status.PAID}:
                    self.status = self.Status.ISSUED if self.issued_at else self.Status.DRAFT
            elif self.balance <= 0:
                self.status = self.Status.PAID
            else:
                self.status = self.Status.PART_PAID
        super().save(*args, **kwargs)


class SubcontractInvoicePayment(models.Model):
    invoice = models.ForeignKey(
        SubcontractInvoice,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    received_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_mode = models.CharField(
        max_length=20,
        choices=SubcontractInvoice.PaymentMode.choices,
    )
    payment_reference = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=250, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcontract_invoice_payments_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("received_date", "id")

    def __str__(self):
        return f"{self.amount} against {self.invoice_id}"


class WageRecord(models.Model):
    """What the receiving contractor owes their own employee.

    Only the receiving contractor writes or reads this ledger; the main
    contractor has no route to it.
    """

    class WageType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"
        PIECE = "PIECE", "Piece"

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="wage_records",
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wage_records",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wage_records_recorded",
    )

    wage_type = models.CharField(max_length=16, choices=WageType.choices, default=WageType.DAILY)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    days_worked = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    accrued_on = models.DateField(default=timezone.localdate)

    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_mode = models.CharField(
        max_length=20,
        choices=SubcontractInvoice.PaymentMode.choices,
        blank=True,
    )
    note = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-accrued_on", "-id")

    def __str__(self):
        return f"{self.employee_id} wage {self.amount} on {self.work_order_id}"


class WorkOrderEvent(models.Model):
    """Append-only audit of every work order transition."""

    work_order = models.ForeignKey(
        SubcontractWorkOrder,
        on_delete=models.CASCADE,
        related_name="events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order_events",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24, blank=True)
    event_type = models.CharField(max_length=40, default="STATUS_CHANGE")
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"{self.work_order_id}: {self.from_status} -> {self.to_status}"
