from django.conf import settings
from django.db import models


class Job(models.Model):

    class JobType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        PARTIALLY_FILLED = "PARTIALLY_FILLED", "Partially Filled"
        FILLED = "FILLED", "Filled"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posted_jobs"
    )

    title = models.CharField(
        max_length=200
    )

    description = models.TextField(
        blank=True
    )

    service_type = models.CharField(
        max_length=100
    )

    location = models.CharField(
        max_length=255
    )

    city = models.CharField(
        max_length=100
    )

    pincode = models.CharField(max_length=6, blank=True)
    state = models.CharField(max_length=100, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    radius_km = models.PositiveSmallIntegerField(default=10)
    location_source = models.CharField(max_length=12, default="MANUAL")

    job_type = models.CharField(
        max_length=20,
        choices=JobType.choices
    )

    number_of_painters = models.PositiveIntegerField(
        default=1
    )

    required_experience = models.PositiveIntegerField(
        default=0
    )

    required_skills = models.TextField(
        blank=True
    )

    daily_wage = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True
    )

    weekly_wage = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True
    )

    start_date = models.DateField()

    estimated_days = models.PositiveIntegerField(
        default=1
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.OPEN
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"{self.title} - {self.city}"


class WorkSchedule(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Awaiting approval"
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "Work in progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentStatus(models.TextChoices):
        NOT_REQUESTED = "NOT_REQUESTED", "Not requested"
        AWAITING_PAYMENT = "AWAITING_PAYMENT", "Awaiting payment"
        PENDING_CONFIRMATION = "PENDING_CONFIRMATION", "Pending contractor confirmation"
        CONFIRMED = "CONFIRMED", "Payment confirmed"

    quotation = models.OneToOneField("quotations.Quotation", on_delete=models.CASCADE, related_name="work_schedule")
    customer_contact = models.ForeignKey(
        "quotations.PropertyContact",
        on_delete=models.SET_NULL,
        related_name="work_schedules_as_contact",
        null=True,
        blank=True,
    )
    proposed_start_date = models.DateField()
    proposed_end_date = models.DateField()
    previous_start_date = models.DateField(null=True, blank=True)
    previous_end_date = models.DateField(null=True, blank=True)
    reschedule_reason = models.TextField(blank=True)
    advance_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    payment_status = models.CharField(max_length=30, choices=PaymentStatus.choices, default=PaymentStatus.NOT_REQUESTED)
    payment_mode = models.CharField(max_length=20, blank=True)
    payment_reference = models.CharField(max_length=120, blank=True)
    payment_note = models.TextField(blank=True)
    payment_submitted_at = models.DateTimeField(null=True, blank=True)
    payment_confirmed_at = models.DateTimeField(null=True, blank=True)
    advance_receipt_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    work_started_at = models.DateTimeField(null=True, blank=True)
    work_completed_at = models.DateTimeField(null=True, blank=True)
    customer_seen_update_at = models.DateTimeField(null=True, blank=True)
    proposed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="work_schedule_proposals")
    customer_accepted = models.BooleanField(default=False)
    contractor_accepted = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class WorkScheduleAuthorization(models.Model):
    """Current date authorization; customer acceptance remains on the schedule."""
    class Mode(models.TextChoices):
        PORTAL = "PORTAL", "Customer portal approval"
        CONTRACTOR = "CONTRACTOR", "Contractor-authorized"

    schedule = models.OneToOneField(WorkSchedule, on_delete=models.CASCADE, related_name="date_authorization")
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.PORTAL)
    authorized_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="authorized_work_schedules")
    authorized_at = models.DateTimeField(null=True, blank=True)


class WorkScheduleRescheduleHistory(models.Model):
    """Immutable date-change events; legacy previous_* fields remain for old clients."""
    schedule = models.ForeignKey(WorkSchedule, on_delete=models.PROTECT, related_name="reschedule_history")
    previous_start_date = models.DateField()
    previous_end_date = models.DateField()
    proposed_start_date = models.DateField()
    proposed_end_date = models.DateField()
    reason = models.TextField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="work_schedule_reschedules")
    changed_at = models.DateTimeField(auto_now_add=True)


class WorkSchedulePainter(models.Model):
    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        RELEASED = "RELEASED", "Released"
        IN_PROGRESS = "IN_PROGRESS", "Work in progress"
        COMPLETED = "COMPLETED", "Completed"

    class WageType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"

    schedule = models.ForeignKey(WorkSchedule, on_delete=models.CASCADE, related_name="painter_assignments")
    painter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scheduled_work")
    source_application = models.ForeignKey(
        "JobApplication", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="schedule_assignments",
    )
    source_booking = models.ForeignKey(
        "ApplicatorBooking", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="schedule_assignments",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    wage_type = models.CharField(max_length=20, choices=WageType.choices, default=WageType.DAILY)
    agreed_wage = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    painter_note = models.TextField(blank=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    work_started_at = models.DateTimeField(null=True, blank=True)
    work_completed_at = models.DateTimeField(null=True, blank=True)
    on_the_way_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("schedule", "painter")
        constraints = [
            models.UniqueConstraint(
                fields=("source_application",), condition=models.Q(source_application__isnull=False),
                name="unique_schedule_assignment_job_application",
            ),
            models.UniqueConstraint(
                fields=("source_booking",), condition=models.Q(source_booking__isnull=False),
                name="unique_schedule_assignment_booking",
            ),
        ]


class WorkPhoto(models.Model):
    class Stage(models.TextChoices):
        BEFORE = "BEFORE", "Before work"
        PROGRESS = "PROGRESS", "Work in progress"
        AFTER = "AFTER", "After completion"

    schedule = models.ForeignKey(WorkSchedule, on_delete=models.CASCADE, related_name="work_photos")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="work_photos_uploaded")
    image = models.ImageField(upload_to="work_photos/%Y/%m/")
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.PROGRESS)
    area = models.CharField(max_length=120, blank=True)
    caption = models.CharField(max_length=255, blank=True)
    captured_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-captured_at",)


class WorkReview(models.Model):
    assignment = models.ForeignKey(WorkSchedulePainter, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="work_reviews_written")
    reviewee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="work_reviews_received")
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [models.UniqueConstraint(fields=("assignment", "reviewer"), name="one_review_per_assignment_reviewer")]


class ContractorApplicatorTeam(models.Model):
    class EmploymentType(models.TextChoices):
        FLEXIBLE = "FLEXIBLE", "Flexible team member"
        IN_HOUSE = "IN_HOUSE", "Permanent in-house employee"

    class SalaryBasis(models.TextChoices):
        MONTHLY = "MONTHLY", "Fixed monthly salary"
        WEEKLY = "WEEKLY", "Weekly wage"
        DAILY = "DAILY", "Daily wage"

    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="applicator_team_members",
    )
    painter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contractor_teams",
    )
    added_at = models.DateTimeField(auto_now_add=True)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, default=EmploymentType.FLEXIBLE)
    joined_on = models.DateField(null=True, blank=True)
    employee_code = models.CharField(max_length=40, blank=True)
    trade = models.CharField(max_length=80, blank=True)
    job_title = models.CharField(max_length=80, blank=True)
    emergency_contact_number = models.CharField(max_length=32, blank=True)
    is_active = models.BooleanField(default=True)
    date_of_birth = models.DateField(null=True, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)
    salary_basis = models.CharField(max_length=20, choices=SalaryBasis.choices, default=SalaryBasis.DAILY)
    salary_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Explicit hourly rate for overtime. If blank, derived from salary_daily_rate/8."
    )
    overtime_day_wage = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    esi_applicable = models.BooleanField(default=False)
    pf_applicable = models.BooleanField(default=False)

    class Meta:
        ordering = ("-added_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("contractor", "painter"),
                name="unique_contractor_applicator_team_member",
            ),
            models.UniqueConstraint(
                fields=("contractor", "employee_code"),
                condition=~models.Q(employee_code=""),
                name="unique_employee_code_per_contractor",
            ),
        ]


class ContractorEmployeeFieldDefinition(models.Model):
    class FieldType(models.TextChoices):
        TEXT = "TEXT", "Text"
        NUMBER = "NUMBER", "Number"
        DATE = "DATE", "Date"
        BOOLEAN = "BOOLEAN", "Yes / no"
        CHOICE = "CHOICE", "Single choice"

    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="employee_field_definitions",
    )
    label = models.CharField(max_length=80)
    field_type = models.CharField(max_length=12, choices=FieldType.choices)
    options = models.JSONField(default=list, blank=True)
    required = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")
        constraints = [
            models.UniqueConstraint(fields=("contractor", "label"), name="unique_employee_field_label_per_contractor"),
        ]


class EmployeeProfileChange(models.Model):
    membership = models.ForeignKey(ContractorApplicatorTeam, on_delete=models.PROTECT, related_name="profile_changes")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="employee_profile_changes")
    changes = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("Employee profile history is append-only.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Employee profile history is append-only.")


class ApplicatorSalaryRevision(models.Model):
    membership = models.ForeignKey(ContractorApplicatorTeam, on_delete=models.PROTECT, related_name="salary_revisions")
    previous_salary_basis = models.CharField(max_length=20, choices=ContractorApplicatorTeam.SalaryBasis.choices)
    previous_salary_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_basis = models.CharField(max_length=20, choices=ContractorApplicatorTeam.SalaryBasis.choices)
    salary_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    effective_from = models.DateField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="employee_salary_revisions")
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("effective_from", "recorded_at", "id")

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("Employee salary history is append-only.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Employee salary history is append-only.")


class ApplicatorOvertimeRateRevision(models.Model):
    membership = models.ForeignKey(ContractorApplicatorTeam, on_delete=models.PROTECT, related_name='overtime_rate_revisions')
    previous_day_wage = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    day_wage = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    legacy_hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    effective_from = models.DateField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='employee_overtime_rate_revisions')
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('effective_from', 'recorded_at', 'id')

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError('Employee overtime rate history is append-only.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Employee overtime rate history is append-only.')


class ApplicatorAttendance(models.Model):
    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending contractor review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        HALF_DAY = "HALF_DAY", "Half day"
        LEAVE = "LEAVE", "Leave"

    membership = models.ForeignKey(ContractorApplicatorTeam, on_delete=models.CASCADE, related_name="attendance_records")
    assignment = models.ForeignKey("WorkSchedulePainter", on_delete=models.SET_NULL, null=True, blank=True, related_name="attendance_records")
    date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices)
    approval_status = models.CharField(max_length=16, choices=ApprovalStatus.choices, default=ApprovalStatus.APPROVED)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="attendance_reviews")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    schedule = models.ForeignKey("WorkSchedule", on_delete=models.SET_NULL, null=True, blank=True, related_name="applicator_attendance")
    note = models.CharField(max_length=180, blank=True)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hourly_rate_snapshot = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    marked_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-date",)
        constraints = [
            models.UniqueConstraint(fields=("membership", "date"), name="unique_inhouse_attendance_day"),
            models.UniqueConstraint(fields=("assignment", "date"), condition=models.Q(assignment__isnull=False), name="unique_assignment_attendance_day"),
        ]


class ApplicatorAttendanceDecision(models.Model):
    """Append-only contractor approval and correction history for attendance."""

    attendance = models.ForeignKey(ApplicatorAttendance, on_delete=models.PROTECT, related_name="decisions")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="attendance_decisions_made")
    decision = models.CharField(max_length=20)
    previous_status = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20)
    previous_approval_status = models.CharField(max_length=16, blank=True)
    approval_status = models.CharField(max_length=16)
    previous_schedule_id = models.PositiveIntegerField(null=True, blank=True)
    schedule_id = models.PositiveIntegerField(null=True, blank=True)
    previous_assignment_id = models.PositiveIntegerField(null=True, blank=True)
    assignment_id = models.PositiveIntegerField(null=True, blank=True)
    note = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")


class ApplicatorLedgerEntry(models.Model):
    class EntryType(models.TextChoices):
        EARNING = "EARNING", "Earning"
        BONUS = "BONUS", "Bonus"
        OVERTIME = "OVERTIME", "Overtime Pay"
        PAYMENT = "PAYMENT", "Payment"
        ADVANCE = "ADVANCE", "Advance"
        DEBIT_ADJUSTMENT = "DEBIT_ADJUSTMENT", "Add to balance"
        CREDIT_ADJUSTMENT = "CREDIT_ADJUSTMENT", "Reduce balance"

    membership = models.ForeignKey(ContractorApplicatorTeam, on_delete=models.CASCADE, related_name="ledger_entries")
    date = models.DateField()
    entry_type = models.CharField(max_length=30, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_mode = models.CharField(max_length=20, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    note = models.CharField(max_length=255, blank=True)
    schedule = models.ForeignKey("WorkSchedule", on_delete=models.SET_NULL, null=True, blank=True, related_name="applicator_ledger_entries")
    assignment = models.ForeignKey("WorkSchedulePainter", on_delete=models.SET_NULL, null=True, blank=True, related_name="ledger_entries")
    source_attendance = models.OneToOneField(
        ApplicatorAttendance, on_delete=models.PROTECT, null=True, blank=True,
        related_name="earning_posting",
    )
    source_overtime_attendance = models.OneToOneField(
        ApplicatorAttendance, on_delete=models.PROTECT, null=True, blank=True, related_name='overtime_posting',
    )
    attendance_component = models.CharField(max_length=8, choices=(('BASE', 'Base'), ('OVERTIME', 'Overtime')), default='BASE')
    source_attendance_adjustment = models.ForeignKey(
        ApplicatorAttendance, on_delete=models.PROTECT, null=True, blank=True,
        related_name="earning_adjustments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-date", "-created_at")


class PainterSeekingPost(models.Model):
    class WageType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        NEGOTIABLE = "NEGOTIABLE", "Negotiable"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    painter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="seeking_posts")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    skills = models.TextField(blank=True)
    preferred_location = models.CharField(max_length=180)
    city = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=255, blank=True)
    state = models.CharField(max_length=100, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    radius_km = models.PositiveSmallIntegerField(default=10)
    location_source = models.CharField(max_length=12, default="MANUAL")
    available_from = models.DateField()
    available_until = models.DateField(null=True, blank=True)
    wage_type = models.CharField(max_length=20, choices=WageType.choices, default=WageType.DAILY)
    expected_wage = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    willing_to_travel = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)


class ApplicatorBooking(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"
        CLOSED = "CLOSED", "Closed"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applicator_bookings_made")
    applicator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applicator_booking_requests")
    seeking_post = models.ForeignKey(PainterSeekingPost, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings")
    work_type = models.CharField(max_length=180)
    pincode = models.CharField(max_length=6)
    start_date = models.DateField()
    end_date = models.DateField()
    wage_type = models.CharField(max_length=20, choices=PainterSeekingPost.WageType.choices, default=PainterSeekingPost.WageType.DAILY)
    agreed_wage = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    responded_at = models.DateTimeField(null=True, blank=True)
    contractor_seen_response = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)


class ApplicatorAvailabilityBlock(models.Model):
    applicator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="applicator_availability_blocks",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("start_date", "end_date")


class JobTransferRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending approval"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    source_application = models.ForeignKey(
        "JobApplication", on_delete=models.CASCADE, related_name="transfer_requests",
    )
    target_job = models.ForeignKey(
        Job, on_delete=models.CASCADE, related_name="incoming_transfer_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="job_transfer_requests",
    )
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)


class JobApplication(models.Model):

    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        ACCEPTED = "ACCEPTED", "Accepted"
        CANCELLATION_REQUESTED = "CANCELLATION_REQUESTED", "Cancellation requested"
        CANCELLED = "CANCELLED", "Cancelled"
        REJECTED = "REJECTED", "Rejected"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        COMPLETED = "COMPLETED", "Completed"

    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="applications"
    )

    painter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="job_applications"
    )

    message = models.TextField(
        blank=True
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.APPLIED
    )

    cancellation_reason = models.TextField(blank=True)
    cancellation_requested_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_job_applications",
    )
    contractor_rating = models.PositiveSmallIntegerField(null=True, blank=True)
    contractor_review = models.TextField(blank=True)
    painter_rating = models.PositiveSmallIntegerField(null=True, blank=True)
    painter_review = models.TextField(blank=True)
    reassigned_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reassignments",
    )

    applied_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        unique_together = (
            "job",
            "painter",
        )

    def __str__(self):
        return f"{self.painter} → {self.job}"    
