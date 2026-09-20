from django.conf import settings
from django.db import models


class BillingPlan(models.Model):
    class Audience(models.TextChoices):
        CONTRACTOR = "CONTRACTOR", "Contractor"
        PAINTER = "PAINTER", "Paint Applicator"

    class Cycle(models.TextChoices):
        FREE = "FREE", "Free"
        MONTHLY = "MONTHLY", "Monthly"
        DATE_RANGE = "DATE_RANGE", "Selected dates"
        CUSTOM = "CUSTOM", "Customized"

    class Validity(models.TextChoices):
        ONE_MONTH = "ONE_MONTH", "1 month"
        THREE_MONTHS = "THREE_MONTHS", "3 months"
        SIX_MONTHS = "SIX_MONTHS", "6 months"
        ONE_YEAR = "ONE_YEAR", "1 year"
        CUSTOM_DATES = "CUSTOM_DATES", "Custom dates"

    class ApplicatorAccess(models.TextChoices):
        NONE = "NONE", "No access"
        VIEW = "VIEW", "View availability"
        CONTACT = "CONTACT", "View and contact"
        BOOK = "BOOK", "View, contact and book"

    name = models.CharField(max_length=100)
    audience = models.CharField(max_length=20, choices=Audience.choices)
    billing_cycle = models.CharField(max_length=20, choices=Cycle.choices)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    validity = models.CharField(max_length=20, choices=Validity.choices, default=Validity.ONE_MONTH)
    job_post_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited.")
    quotation_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited.")
    employee_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited.")
    applicator_access = models.CharField(max_length=20, choices=ApplicatorAccess.choices, default=ApplicatorAccess.NONE)
    measurement_access = models.BooleanField(default=False)
    register_applicator_access = models.BooleanField(default=False)
    ratings_reviews_access = models.BooleanField(default=False)
    work_schedules_access = models.BooleanField(default=False)
    seeking_applicators_access = models.BooleanField(default=False)
    property_creation_access = models.BooleanField(default=False)
    messages_access = models.BooleanField(default=False)
    job_seeking_post_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited.")
    contractor_job_access = models.BooleanField(default=False)
    contractor_visibility = models.BooleanField(default=False)
    booking_requests = models.BooleanField(default=False)
    availability_calendar = models.BooleanField(default=False)
    location_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited.")
    features = models.TextField(blank=True, help_text="Enter one feature per line.")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("audience", "price", "name")

    def __str__(self):
        return f"{self.name} ({self.get_audience_display()})"

    @property
    def discounted_price(self):
        return self.price * (100 - self.discount_percentage) / 100


class Subscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="billing_subscriptions")
    plan = models.ForeignKey(BillingPlan, on_delete=models.PROTECT, related_name="subscriptions")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    auto_renew = models.BooleanField(default=False)
    activated_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    expiry_notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-start_date", "-created_at")

    def __str__(self):
        return f"{self.user} - {self.plan}"


class Advertisement(models.Model):
    class Placement(models.TextChoices):
        CUSTOMER_DASHBOARD = "CUSTOMER_DASHBOARD", "Customer dashboard"
        CUSTOMER_PORTAL = "CUSTOMER_PORTAL", "All customer portal pages"

    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    image_url = models.URLField(blank=True)
    target_url = models.URLField(blank=True)
    placement = models.CharField(max_length=30, choices=Placement.choices, default=Placement.CUSTOMER_DASHBOARD)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.title


class PackageRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        AWAITING_PAYMENT = "AWAITING_PAYMENT", "Awaiting payment"
        PAYMENT_SUBMITTED = "PAYMENT_SUBMITTED", "Payment submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentStatus(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        AWAITING = "AWAITING", "Awaiting payment"
        SUBMITTED = "SUBMITTED", "Submitted for confirmation"
        CONFIRMED = "CONFIRMED", "Confirmed"
        REJECTED = "REJECTED", "Rejected"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="package_requests")
    plan = models.ForeignKey(BillingPlan, on_delete=models.PROTECT, related_name="package_requests")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_package_requests")
    admin_note = models.TextField(blank=True)
    requested_start_date = models.DateField(null=True, blank=True)
    requested_end_date = models.DateField(null=True, blank=True)
    duration_months = models.PositiveSmallIntegerField(default=1)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_status = models.CharField(max_length=30, choices=PaymentStatus.choices, default=PaymentStatus.NOT_REQUIRED)
    payment_mode = models.CharField(max_length=30, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    payment_note = models.TextField(blank=True)
    payment_submitted_at = models.DateTimeField(null=True, blank=True)
    payment_confirmed_at = models.DateTimeField(null=True, blank=True)
    invoice_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    receipt_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    is_renewal = models.BooleanField(default=False)
    subscription = models.OneToOneField(Subscription, on_delete=models.SET_NULL, null=True, blank=True, related_name="billing_request")

    class Meta:
        ordering = ("-requested_at",)

    def __str__(self):
        return f"{self.user} - {self.plan} - {self.status}"


class BillingNotification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="billing_notifications")
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
