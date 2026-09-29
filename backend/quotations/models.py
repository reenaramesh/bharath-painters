from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone
from decimal import Decimal
from builtins import property as python_property
from accounts.mobile import normalize_mobile


class MasterDataBase(models.Model):

    name = models.CharField(
        max_length=150
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="%(class)s_created"
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        abstract = True

    def __str__(self):
        return self.name


class Area(MasterDataBase):

    def __str__(self):
        return self.name


class MeasurementSurfaceType(MasterDataBase):
    class Meta:
        verbose_name = "Measurement surface type"
        verbose_name_plural = "Measurement surface types"


class ServiceCategory(MasterDataBase):
    class Meta:
        verbose_name_plural = "Service categories"



class ServiceType(MasterDataBase):

    class CalculationType(models.TextChoices):
        WALL = "WALL", "Wall Area"
        CEILING = "CEILING", "Ceiling Area"
        WALL_CEILING = "WALL_CEILING", "Wall + Ceiling Area"
        DOOR = "DOOR", "Door Area"
        WINDOW = "WINDOW", "Window Area"
        WARDROBE = "WARDROBE", "Wardrobe Area"
        WATERPROOFING = "WATERPROOFING", "Waterproofing Area"
        CUSTOM = "CUSTOM", "Custom Quantity"

    calculation_type = models.CharField(
        max_length=20,
        choices=CalculationType.choices,
        default=CalculationType.CUSTOM
    )
    category = models.CharField(max_length=100, default="Painting")
    category_master = models.ForeignKey(ServiceCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="services")

    def __str__(self):
        return self.name


class WorkDescription(MasterDataBase):
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, related_name="work_descriptions", null=True, blank=True)
    service_category = models.ForeignKey(ServiceCategory, on_delete=models.CASCADE, related_name="product_descriptions", null=True, blank=True)

    class Meta:
        ordering = ("service_type__name", "name")



class PaintType(MasterDataBase):

    service_category = models.ForeignKey(ServiceCategory, on_delete=models.CASCADE, related_name="product_types", null=True, blank=True)
    key_features = models.TextField(blank=True)
    default_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return self.name


class PaintBrand(MasterDataBase):

    def __str__(self):
        return self.name


class Unit(MasterDataBase):

    def __str__(self):
        return self.name


class PaintColor(models.Model):

    name = models.CharField(
        max_length=150
    )

    code = models.CharField(
        max_length=50,
        blank=True
    )

    hex_code = models.CharField(
        max_length=7,
        blank=True
    )

    brand = models.ForeignKey(
        PaintBrand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="colors"
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="created_paint_colors"
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        if self.code:
            return f"{self.name} - {self.code}"

        return self.name



def normalize_indian_mobile(value):
    # Retain the existing helper name for callers while accepting explicit
    # international prefixes and rejecting unrelated country codes as India.
    return normalize_mobile(value)


class Customer(models.Model):

    class ClientType(models.TextChoices):
        HOMEOWNER = "HOMEOWNER", "Homeowner"
        TENANT = "TENANT", "Tenant"
        COMPANY = "COMPANY", "Company"
        PROPERTY_MANAGER = "PROPERTY_MANAGER", "Property Manager"
        INTERIOR_DESIGNER = "INTERIOR_DESIGNER", "Interior Designer"
        ARCHITECT = "ARCHITECT", "Architect"
        BUILDER = "BUILDER", "Builder"
        REAL_ESTATE_AGENT = "REAL_ESTATE_AGENT", "Real Estate Agent"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        FOLLOW_UP = "FOLLOW_UP", "Follow Up"
        SITE_VISIT = "SITE_VISIT", "Site Visit"
        QUOTATION_SENT = "QUOTATION_SENT", "Quotation Sent"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"
        CANCELLED = "CANCELLED", "Cancelled"

    class Source(models.TextChoices):
        WEBSITE = "WEBSITE", "Website"
        PHONE = "PHONE", "Phone"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        FACEBOOK = "FACEBOOK", "Facebook"
        INSTAGRAM = "INSTAGRAM", "Instagram"
        GOOGLE = "GOOGLE", "Google"
        REFERRAL = "REFERRAL", "Referral"
        WALK_IN = "WALK_IN", "Walk In"
        OTHER = "OTHER", "Other"

    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="quotation_customers",
        null=True,
        blank=True,
    )

    bharath_id = models.CharField(max_length=30, unique=True, blank=True, null=True)

    name = models.CharField(
        max_length=150
    )

    mobile = models.CharField(
        max_length=16
    )

    normalized_mobile = models.CharField(max_length=16, unique=True)

    email = models.EmailField(
        blank=True
    )

    gst_number = models.CharField(
        max_length=30,
        blank=True
    )

    whatsapp = models.CharField(
        max_length=15,
        blank=True
    )

    address = models.TextField(
        blank=True
    )

    city = models.CharField(
        max_length=100,
        blank=True
    )

    pincode = models.CharField(
        max_length=10,
        blank=True
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.NEW
    )

    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.OTHER
    )

    client_type = models.CharField(
        max_length=30,
        choices=ClientType.choices,
        blank=True
    )

    alternate_mobile = models.CharField(
        max_length=15,
        blank=True
    )

    requirement = models.TextField(
        blank=True
    )

    notes = models.TextField(
        blank=True
    )

    next_follow_up = models.DateTimeField(
        null=True,
        blank=True
    )

    portal_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customer_profiles",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"{self.name} - {self.bharath_id or self.mobile}"

    def save(self, *args, **kwargs):
        self.normalized_mobile = normalize_indian_mobile(self.mobile)
        if not self.normalized_mobile:
            raise ValueError("Enter a valid Indian mobile number.")
        super().save(*args, **kwargs)


class SavedCustomerContact(models.Model):
    """Details entered by a contractor, independent of account connection consent."""
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="saved_contacts")
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_customer_contacts")
    details = models.JSONField(default=dict, encoder=DjangoJSONEncoder)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("customer", "contractor"), name="unique_saved_customer_contact")]


class ContractorCustomerConnection(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CONNECTED = "CONNECTED", "Connected"
        REJECTED = "REJECTED", "Rejected"
        RECONNECT_PENDING = "RECONNECT_PENDING", "Reconnect pending"
        DISCONNECTED = "DISCONNECTED", "Disconnected"
        BLOCKED = "BLOCKED", "Blocked"

    class ApprovalMethod(models.TextChoices):
        CUSTOMER_PORTAL = "CUSTOMER_PORTAL", "Customer portal"
        INITIAL_CREATOR = "INITIAL_CREATOR", "Initial creator"
        ADMIN = "ADMIN", "Admin"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="contractor_connections")
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="customer_connections")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    status_before_block = models.CharField(max_length=20, choices=Status.choices, blank=True)
    requested_at = models.DateTimeField(default=timezone.now)
    accepted_at = models.DateTimeField(null=True, blank=True)
    last_request_at = models.DateTimeField(null=True, blank=True)
    request_count = models.PositiveIntegerField(default=1)
    connected_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
    blocked_at = models.DateTimeField(null=True, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="customer_connections_requested")
    approval_method = models.CharField(max_length=30, choices=ApprovalMethod.choices, blank=True)
    rejection_reason = models.CharField(max_length=80, blank=True)
    customer_status = models.CharField(max_length=30, choices=Customer.Status.choices, default=Customer.Status.NEW)
    customer_source = models.CharField(max_length=20, choices=Customer.Source.choices, default=Customer.Source.OTHER)
    customer_client_type = models.CharField(max_length=30, choices=Customer.ClientType.choices, blank=True)
    requirement = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    next_follow_up = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-requested_at", "-id")
        constraints = [
            models.UniqueConstraint(fields=("customer", "contractor"), name="unique_customer_contractor_connection"),
        ]


class CustomerShareLink(models.Model):
    class Purpose(models.TextChoices):
        ACTIVATION = "ACTIVATION", "Activation"
        CONNECTION = "CONNECTION", "Connection request"

    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.CASCADE, related_name="share_links")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CustomerConnectionAudit(models.Model):
    class Actions(models.TextChoices):
        REQUESTED = "CONNECTION_REQUESTED", "Connection requested"
        ACCEPTED = "CONNECTION_ACCEPTED", "Connection accepted"
        REJECTED = "CONNECTION_REJECTED", "Connection rejected"
        DISCONNECTED = "CONNECTION_DISCONNECTED", "Connection disconnected"
        BLOCKED = "CONTRACTOR_BLOCKED", "Contractor blocked"
        UNBLOCKED = "CONTRACTOR_UNBLOCKED", "Contractor unblocked"
        RESENT = "CONNECTION_REQUEST_RESENT", "Connection request resent"

    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.CASCADE, related_name="audit_entries")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="connection_audits")
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="customer_connection_audits")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="performed_connection_audits")
    performed_by_role = models.CharField(max_length=30, blank=True)
    action = models.CharField(max_length=40, choices=Actions.choices)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("-timestamp",)


class ChatConversation(models.Model):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="conversations",
        null=True,
        blank=True,
    )
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="contractor_conversations", null=True, blank=True)
    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.CASCADE, related_name="conversations", null=True, blank=True)
    painter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="painter_conversations", null=True, blank=True)
    blocked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="blocked_chat_conversations", null=True, blank=True)
    blocked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("contractor", "painter"), name="unique_contractor_painter_conversation"),
            models.UniqueConstraint(fields=("customer", "contractor"), condition=models.Q(customer__isnull=False, contractor__isnull=False), name="unique_customer_contractor_conversation"),
        ]

    def __str__(self):
        return f"Chat - {self.customer.name if self.customer else self.painter}"


class ColourComparisonDraft(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="colour_comparison_draft")
    shade_ids = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class ChatMessage(models.Model):
    conversation = models.ForeignKey(
        ChatConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    text = models.TextField(blank=True)
    reply_to = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="replies")
    forwarded_from = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="forwards")
    contact_name = models.CharField(max_length=120, blank=True)
    contact_mobile = models.CharField(max_length=16, blank=True)
    colour_brand = models.CharField(max_length=40, blank=True)
    colour_name = models.CharField(max_length=120, blank=True)
    colour_code = models.CharField(max_length=32, blank=True)
    colour_hex = models.CharField(max_length=7, blank=True)
    colour_comparison = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)


class ChatAttachment(models.Model):
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="chat_attachments/%Y/%m/")
    file_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class PortalNotification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portal_notifications")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="portal_notifications_sent", null=True, blank=True)
    event_type = models.CharField(max_length=50)
    title = models.CharField(max_length=180)
    message = models.TextField()
    link = models.CharField(max_length=240, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class WebPushSubscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="web_push_subscriptions")
    endpoint = models.URLField(max_length=2048, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ServiceRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "New"
        REVIEWING = "REVIEWING", "Reviewing"
        SITE_VISIT = "SITE_VISIT", "Site Visit"
        QUOTATION = "QUOTATION", "Quotation"
        ACCEPTED = "ACCEPTED", "Accepted"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="service_requests")
    connection = models.ForeignKey(
        ContractorCustomerConnection,
        on_delete=models.PROTECT,
        related_name="service_requests",
        null=True,
        blank=True,
    )
    service_type = models.ForeignKey(ServiceType, on_delete=models.SET_NULL, related_name="customer_requests", null=True, blank=True)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    preferred_date = models.DateField(null=True, blank=True)
    address = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    contractor_seen_at = models.DateTimeField(null=True, blank=True)
    customer_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class Lead(models.Model):
    class Stage(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        FOLLOW_UP = "FOLLOW_UP", "Follow Up"
        SITE_VISIT = "SITE_VISIT", "Site Visit"
        MEASUREMENT = "MEASUREMENT", "Measurement"
        QUOTATION = "QUOTATION", "Quotation"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        IN_PROGRESS = "IN_PROGRESS", "Work In Progress"
        COMPLETED = "COMPLETED", "Completed"
        LOST = "LOST", "Lost"
        CANCELLED = "CANCELLED", "Cancelled"

    class Source(models.TextChoices):
        GOOGLE_SEARCH = "GOOGLE_SEARCH", "Google Search"
        GOOGLE_PROFILE = "GOOGLE_PROFILE", "Google Business Profile"
        GOOGLE_ADS = "GOOGLE_ADS", "Google Ads"
        WEBSITE = "WEBSITE", "Website"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        PHONE = "PHONE", "Phone Call"
        FACEBOOK = "FACEBOOK", "Facebook"
        INSTAGRAM = "INSTAGRAM", "Instagram"
        REFERRAL = "REFERRAL", "Referral"
        EXISTING_CUSTOMER = "EXISTING_CUSTOMER", "Existing Customer"
        WALK_IN = "WALK_IN", "Walk-in"
        OTHER = "OTHER", "Other"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class LostReason(models.TextChoices):
        PRICE = "PRICE", "Price Too High"
        COMPETITOR = "COMPETITOR", "Competitor Selected"
        POSTPONED = "POSTPONED", "Customer Postponed"
        NO_RESPONSE = "NO_RESPONSE", "No Response"
        BUDGET = "BUDGET", "Budget Issue"
        SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE", "Service Not Available"
        DUPLICATE = "DUPLICATE", "Duplicate Enquiry"
        INVALID = "INVALID", "Invalid Enquiry"
        OTHER = "OTHER", "Other"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sales_leads")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="leads")
    service_request = models.OneToOneField(ServiceRequest, on_delete=models.SET_NULL, related_name="lead", null=True, blank=True)
    service_type = models.ForeignKey(ServiceType, on_delete=models.SET_NULL, related_name="leads", null=True, blank=True)
    property = models.ForeignKey("Property", on_delete=models.SET_NULL, related_name="leads", null=True, blank=True)
    assigned_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="assigned_opportunities", null=True, blank=True)
    reference_no = models.CharField(max_length=40, unique=True, blank=True)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.NEW)
    source = models.CharField(max_length=30, choices=Source.choices, default=Source.OTHER)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    estimated_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expected_start_date = models.DateField(null=True, blank=True)
    site_visit_required = models.BooleanField(default=False)
    next_follow_up = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    lost_reason = models.CharField(max_length=30, choices=LostReason.choices, blank=True)
    lost_note = models.TextField(blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def save(self, *args, **kwargs):
        if not self.reference_no:
            year = timezone.localdate().year
            prefix = f"OPP-{year}-"
            numbers = []
            for value in Lead.objects.filter(reference_no__startswith=prefix).values_list("reference_no", flat=True):
                try:
                    numbers.append(int(value.replace(prefix, "")))
                except (TypeError, ValueError):
                    continue
            self.reference_no = f"{prefix}{max(numbers, default=0) + 1:06d}"
        super().save(*args, **kwargs)


class LeadStageHistory(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="stage_history")
    from_stage = models.CharField(max_length=20, blank=True)
    to_stage = models.CharField(max_length=20, choices=Lead.Stage.choices)
    note = models.CharField(max_length=240, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class SiteVisit(models.Model):

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        COMPLETED = "COMPLETED", "Completed"
        RESCHEDULED = "RESCHEDULED", "Rescheduled"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No Show"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="site_visits")
    opportunity = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="site_visits")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="site_visits")
    property = models.ForeignKey("Property", on_delete=models.SET_NULL, related_name="site_visits", null=True, blank=True)
    reference_no = models.CharField(max_length=40, unique=True, blank=True)
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField(null=True, blank=True)
    assigned_person = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="assigned_site_visits", null=True, blank=True)
    contact_person = models.CharField(max_length=150, blank=True)
    contact_mobile = models.CharField(max_length=15, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="created_site_visits", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-scheduled_date", "-created_at")

    def save(self, *args, **kwargs):
        if not self.reference_no:
            prefix = "SV-"
            numbers = []
            for value in SiteVisit.objects.filter(reference_no__startswith=prefix).values_list("reference_no", flat=True):
                try:
                    numbers.append(int(value.replace(prefix, "")))
                except (TypeError, ValueError):
                    continue
            self.reference_no = f"{prefix}{max(numbers, default=0) + 1:05d}"
        super().save(*args, **kwargs)


class SupportTicket(models.Model):
    class Category(models.TextChoices):
        SERVICE = "SERVICE", "Service Issue"
        QUOTATION = "QUOTATION", "Quotation"
        BILLING = "BILLING", "Billing"
        QUALITY = "QUALITY", "Quality Complaint"
        SCHEDULE = "SCHEDULE", "Schedule"
        OTHER = "OTHER", "Other"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="support_tickets", null=True, blank=True)
    chat_conversation = models.ForeignKey(ChatConversation, on_delete=models.SET_NULL, related_name="safety_reports", null=True, blank=True)
    connection = models.ForeignKey(
        ContractorCustomerConnection,
        on_delete=models.PROTECT,
        related_name="support_tickets",
        null=True,
        blank=True,
    )
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="raised_support_tickets", null=True, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    subject = models.CharField(max_length=180)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    contractor_response = models.TextField(blank=True)
    handler_seen_at = models.DateTimeField(null=True, blank=True)
    requester_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class SupportTicketMessage(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_ticket_messages")
    message = models.TextField()
    status_snapshot = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)


class MeasurementAccessRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        FRESH_REQUESTED = "FRESH_REQUESTED", "Fresh Measurement Requested"
        REJECTED = "REJECTED", "Rejected"

    requesting_contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="measurement_access_requests")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="measurement_access_requests")
    source_property = models.ForeignKey("Property", on_delete=models.CASCADE, related_name="measurement_access_requests")
    target_property = models.ForeignKey("Property", on_delete=models.SET_NULL, related_name="imported_measurement_access", null=True, blank=True)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.PENDING)
    request_message = models.TextField(blank=True)
    customer_note = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    contractor_seen_at = models.DateTimeField(null=True, blank=True)
    customer_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class CustomerFollowUp(models.Model):

    class FollowUpType(models.TextChoices):
        CALL = "CALL", "Call"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        NOTE = "NOTE", "Note"
        SITE_VISIT = "SITE_VISIT", "Site Visit"
        MEETING = "MEETING", "Meeting"
        EMAIL = "EMAIL", "Email"
        OFFICE_MEETING = "OFFICE_MEETING", "Office Meeting"

    class Outcome(models.TextChoices):
        INTERESTED = "INTERESTED", "Interested"
        CALL_LATER = "CALL_LATER", "Call Later"
        WAITING_DECISION = "WAITING_DECISION", "Waiting for Decision"
        REVISED_QUOTE = "REVISED_QUOTE", "Need Revised Quote"
        NEGOTIATION = "NEGOTIATION", "Price Negotiation"
        SITE_VISIT_REQUIRED = "SITE_VISIT_REQUIRED", "Site Visit Required"
        NOT_INTERESTED = "NOT_INTERESTED", "Not Interested"
        COMPETITOR = "COMPETITOR", "Competitor Selected"
        NO_RESPONSE = "NO_RESPONSE", "No Response"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="follow_ups"
    )

    opportunity = models.ForeignKey(
        "Lead",
        on_delete=models.SET_NULL,
        related_name="follow_ups",
        null=True,
        blank=True,
    )

    outcome = models.CharField(
        max_length=30,
        choices=Outcome.choices,
        blank=True
    )

    follow_up_type = models.CharField(
        max_length=20,
        choices=FollowUpType.choices
    )

    comment = models.TextField(
        blank=True
    )

    follow_up_date = models.DateTimeField(
        auto_now_add=True
    )

    next_follow_up = models.DateTimeField(
        null=True,
        blank=True
    )

    is_completed = models.BooleanField(default=False)

    completed_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_follow_ups"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return (
            f"{self.customer.name} - "
            f"{self.follow_up_type}"
        )


class CustomerWorkHistory(models.Model):

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="work_history"
    )

    connection = models.ForeignKey(
        ContractorCustomerConnection,
        on_delete=models.PROTECT,
        related_name="work_history",
        null=True,
        blank=True,
    )

    property = models.ForeignKey(
        "Property",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_history"
    )

    service_name = models.CharField(
        max_length=150
    )

    work_date = models.DateField(
        null=True,
        blank=True
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    description = models.TextField(
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return (
            f"{self.customer.name} - "
            f"{self.service_name}"
        )


class WorkPhoto(models.Model):

    work_history = models.ForeignKey(
        CustomerWorkHistory,
        on_delete=models.CASCADE,
        related_name="photos"
    )

    image = models.ImageField(
        upload_to="customer_work/"
    )

    caption = models.CharField(
        max_length=255,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return self.caption or "Work Photo"




class ApartmentCommunity(models.Model):
    name = models.CharField(max_length=200)
    zone = models.CharField(max_length=120, blank=True)
    locality = models.CharField(max_length=160, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    map_url = models.URLField(max_length=1000, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "locality")
        constraints = [
            models.UniqueConstraint(
                fields=("name", "pincode"),
                name="unique_apartment_community_name_pincode",
            ),
        ]
        verbose_name_plural = "Apartment communities"

    def __str__(self):
        location = self.locality or self.zone or self.pincode
        return f"{self.name} - {location}" if location else self.name


class Property(models.Model):

    SQ_METRE_TO_SQ_FT = Decimal("10.7639104167")

    class MeasurementUnit(models.TextChoices):
        FEET = "FEET", "Feet"
        METRES = "METRES", "Metres"

    class MeasurementType(models.TextChoices):
        INTERIOR = "INTERIOR", "Interior"
        EXTERIOR = "EXTERIOR", "Exterior"

    class PropertyType(models.TextChoices):
        ONE_RK = "1RK", "1 RK"
        ONE_BHK = "1BHK", "1 BHK"
        TWO_BHK = "2BHK", "2 BHK"
        THREE_BHK = "3BHK", "3 BHK"
        FOUR_BHK = "4BHK", "4 BHK"
        VILLA = "VILLA", "Villa"
        OFFICE = "OFFICE", "Office"
        COMMERCIAL = "COMMERCIAL", "Commercial"
        INTERIOR = "INTERIOR", "Interior"
        EXTERIOR = "EXTERIOR", "Exterior"
        OTHER = "OTHER", "Other"

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="properties"
    )

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="customer_properties", null=True, blank=True)
    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.PROTECT, related_name="properties", null=True, blank=True)

    property_type = models.CharField(
        max_length=30,
        choices=PropertyType.choices,
        default=PropertyType.OTHER
    )

    measurement_type = models.CharField(
        max_length=10,
        choices=MeasurementType.choices,
        default=MeasurementType.INTERIOR,
    )

    measurement_unit = models.CharField(
        max_length=10,
        choices=MeasurementUnit.choices,
        default=MeasurementUnit.FEET,
    )

    name = models.CharField(
        max_length=150,
        blank=True
    )

    flat_number = models.CharField(
        max_length=50,
        blank=True
    )

    block_name = models.CharField(
        max_length=100,
        blank=True
    )

    address = models.TextField(
        blank=True
    )

    city = models.CharField(
        max_length=100,
        blank=True
    )

    pincode = models.CharField(
        max_length=10,
        blank=True
    )

    approximate_area = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def save(self, *args, **kwargs):
        if self._state.adding and not self.contractor_id and self.customer_id:
            self.contractor_id = self.customer.contractor_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.property_type} - {self.city}"

    def area_to_sqft(self, value):
        value = Decimal(value or 0)
        if self.measurement_unit == self.MeasurementUnit.METRES:
            return value * self.SQ_METRE_TO_SQ_FT
        return value

    @property
    def linear_unit_label(self):
        return "m" if self.measurement_unit == self.MeasurementUnit.METRES else "ft"

    @property
    def input_area_unit_label(self):
        return "m²" if self.measurement_unit == self.MeasurementUnit.METRES else "sq ft"



# =========================================================
# QUOTATION
# =========================================================

class PropertyMeasurement(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"
        LOCKED = "LOCKED", "Used in quotation"

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name="measurement_records"
    )
    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="property_measurements",
        null=True,
        blank=True,
    )
    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.PROTECT, related_name="measurements", null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="area_calculations_created", null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reference_no = models.CharField(max_length=40, unique=True, blank=True)
    measured_on = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-measured_on", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("property", "contractor", "version"),
                condition=models.Q(contractor__isnull=False),
                name="unique_area_calculation_version_per_contractor",
            ),
        ]

    def save(self, *args, **kwargs):
        if self._state.adding and self.contractor_id:
            if PropertyMeasurement.objects.filter(
                property_id=self.property_id,
                contractor_id=self.contractor_id,
                version=self.version,
            ).exists():
                self.version = (PropertyMeasurement.objects.filter(
                    property_id=self.property_id,
                    contractor_id=self.contractor_id,
                ).aggregate(max_version=models.Max("version"))["max_version"] or 0) + 1
        if not self.reference_no:
            year = self.measured_on.year if self.measured_on else timezone.localdate().year
            sequence = (PropertyMeasurement.objects.order_by("-id").values_list("id", flat=True).first() or 0) + 1
            candidate = f"BPM-{year}-{sequence:05d}"
            while PropertyMeasurement.objects.filter(reference_no=candidate).exists():
                sequence += 1
                candidate = f"BPM-{year}-{sequence:05d}"
            self.reference_no = candidate
        super().save(*args, **kwargs)

    @python_property
    def total_sqft(self):
        return sum((surface.net_area for surface in self.surfaces.prefetch_related("openings").all()), Decimal("0"))


class Quotation(models.Model):

    class QuotationType(models.TextChoices):
        MEASUREMENT = "MEASUREMENT", "Measurement based"
        MANUAL_LUMPSUM = "MANUAL_LUMPSUM", "Manual lump sum"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"
        VIEWED = "VIEWED", "Viewed"
        ACCEPTED = "ACCEPTED", "Accepted"
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "Work in progress"
        COMPLETED = "COMPLETED", "Completed"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED = "EXPIRED", "Expired"
        CONVERTED = "CONVERTED", "Converted"
        CANCELLED = "CANCELLED", "Cancelled"
        REVISION_REQUESTED = "REVISION_REQUESTED", "Revision Requested"

    class GSTMode(models.TextChoices):
        EXTRA = "GST_EXTRA", "GST Extra"
        INCLUDED = "GST_INCLUDED", "GST Included"
        NONE = "NO_GST", "No GST"

    class DiscountType(models.TextChoices):
        FIXED = "FIXED", "Fixed Amount"
        PERCENTAGE = "PERCENTAGE", "Percentage"

    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quotations"
    )

    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="quotations"
    )

    connection = models.ForeignKey(ContractorCustomerConnection, on_delete=models.PROTECT, related_name="quotations", null=True, blank=True)

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="quotations"
    )

    measurement_record = models.ForeignKey(
        PropertyMeasurement,
        on_delete=models.SET_NULL,
        related_name="quotations",
        null=True,
        blank=True,
    )

    quotation_number = models.CharField(
        max_length=40,
        unique=True,
        blank=True
    )

    revision_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="revisions",
        null=True,
        blank=True,
    )

    version_number = models.PositiveIntegerField(default=1)

    quotation_date = models.DateField(
        auto_now_add=True
    )

    sent_at = models.DateTimeField(
        null=True,
        blank=True
    )

    valid_until = models.DateField(
        null=True,
        blank=True
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    # -----------------------------------------------------
    # CALCULATION SETTINGS
    # -----------------------------------------------------

    gst_mode = models.CharField(
        max_length=20,
        choices=GSTMode.choices,
        default=GSTMode.EXTRA
    )

    gst_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0
    )

    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.FIXED
    )

    discount_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    # Computed discount amount
    discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    gst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    grand_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    notes = models.TextField(
        blank=True
    )

    lead = models.ForeignKey(
        "Lead", on_delete=models.SET_NULL, related_name="quotations", null=True, blank=True
    )

    quotation_type = models.CharField(
        max_length=20,
        choices=QuotationType.choices,
        default=QuotationType.MEASUREMENT,
    )

    customer_response_note = models.TextField(blank=True)

    customer_responded_at = models.DateTimeField(null=True, blank=True)

    terms_conditions = models.TextField(
        blank=True
    )

    prepared_by = models.CharField(max_length=150, blank=True)

    inspected_by = models.CharField(max_length=150, blank=True)

    payment_terms = models.TextField(blank=True)

    product_details = models.TextField(blank=True)

    show_product_key_features = models.BooleanField(default=True)

    work_duration = models.CharField(max_length=150, blank=True)

    work_procedures = models.TextField(blank=True)

    # Immutable display data captured when the quotation is created.  Foreign
    # keys remain in place for relationships, while these snapshots prevent a
    # later profile/customer/property edit from rewriting an older document.
    contractor_snapshot = models.JSONField(default=dict, blank=True)
    customer_snapshot = models.JSONField(default=dict, blank=True)
    property_snapshot = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return self.quotation_number or "Draft Quotation"

    def capture_document_snapshot(self):
        if self.contractor_id and not self.contractor_snapshot:
            profile = getattr(self.contractor, "contractor_profile", None)
            logo_name = ""
            if profile and profile.company_logo:
                logo_name = profile.company_logo.name
            self.contractor_snapshot = {
                "bharath_id": self.contractor.bharath_id,
                "company_name": profile.company_name if profile else self.contractor.get_full_name(),
                "owner_name": profile.owner_name if profile else self.contractor.get_full_name(),
                "mobile": self.contractor.mobile,
                "email": self.contractor.email,
                "company_logo": logo_name,
                "company_logo_shape": profile.company_logo_shape if profile else "RECTANGLE",
                "office_address": profile.office_address if profile else "",
                "service_areas": profile.service_areas if profile else "",
                "gst_number": profile.gst_number if profile else "",
                "pan_number": profile.pan_number if profile else "",
                "is_verified": self.contractor.is_verified,
                "verification_status": self.contractor.verification_status,
            }
        if self.customer_id and not self.customer_snapshot:
            self.customer_snapshot = {
                "bharath_id": self.customer.bharath_id,
                "name": self.customer.name,
                "mobile": self.customer.mobile,
                "email": self.customer.email,
                "gst_number": self.customer.gst_number,
            }
        if self.property_id and not self.property_snapshot:
            self.property_snapshot = {
                "name": self.property.name or self.property.property_type,
                "property_type": self.property.property_type,
                "measurement_type": self.property.measurement_type,
                "flat_number": self.property.flat_number,
                "block_name": self.property.block_name,
                "address": self.property.address,
                "city": self.property.city,
                "pincode": self.property.pincode,
            }

    def save(self, *args, **kwargs):
        self.capture_document_snapshot()
        update_fields = kwargs.get("update_fields")
        if update_fields:
            snapshot_fields = {
                "contractor_snapshot", "customer_snapshot", "property_snapshot"
            }
            kwargs["update_fields"] = tuple(set(update_fields) | snapshot_fields)
        super().save(*args, **kwargs)



class QuotationRoom(models.Model):

    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name="rooms"
    )

    property_room = models.ForeignKey(
        "PropertyRoom",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotation_rooms"
    )

    area = models.ForeignKey(
        Area,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    name = models.CharField(
        max_length=150
    )

    room_type_name_snapshot = models.CharField(max_length=150, blank=True)

    length = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    wall_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    ceiling_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    window_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    door_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    window_count = models.PositiveIntegerField(
        default=0
    )

    window_width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    window_height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    door_count = models.PositiveIntegerField(
        default=0
    )

    door_width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    door_height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    paintable_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def save(self, *args, **kwargs):
        if not self.room_type_name_snapshot:
            if self.property_room_id and self.property_room.room_type_id:
                self.room_type_name_snapshot = self.property_room.room_type.name
            elif self.quotation_id and self.quotation.property.measurement_type == "EXTERIOR":
                self.room_type_name_snapshot = "Exterior"
            else:
                self.room_type_name_snapshot = self.name
        super().save(*args, **kwargs)

    def calculate_areas(self):

        from decimal import Decimal

        length = Decimal(self.length or 0)
        width = Decimal(self.width or 0)
        height = Decimal(self.height or 0)

        window_count = Decimal(self.window_count or 0)
        window_width = Decimal(self.window_width or 0)
        window_height = Decimal(self.window_height or 0)

        door_count = Decimal(self.door_count or 0)
        door_width = Decimal(self.door_width or 0)
        door_height = Decimal(self.door_height or 0)

        # ---------------------------------------------
        # WALL AREA
        # ---------------------------------------------

        wall_area = (
            Decimal("2")
            * (length + width)
            * height
        )

        # ---------------------------------------------
        # CEILING AREA
        # ---------------------------------------------

        ceiling_area = (
            length * width
        )

        # ---------------------------------------------
        # WINDOW AREA
        # ---------------------------------------------

        window_area = (
            window_count
            * window_width
            * window_height
        )

        # ---------------------------------------------
        # DOOR AREA
        # ---------------------------------------------

        door_area = (
            door_count
            * door_width
            * door_height
        )

        # ---------------------------------------------
        # PAINTABLE WALL AREA
        # ---------------------------------------------

        paintable_area = (
            wall_area
            - window_area
            - door_area
        )

        if paintable_area < 0:
            paintable_area = Decimal("0")

        self.wall_area = wall_area.quantize(
            Decimal("0.01")
        )

        self.ceiling_area = ceiling_area.quantize(
            Decimal("0.01")
        )

        self.window_area = window_area.quantize(
            Decimal("0.01")
        )

        self.door_area = door_area.quantize(
            Decimal("0.01")
        )

        self.paintable_area = paintable_area.quantize(
            Decimal("0.01")
        )

    def save(self, *args, **kwargs):

        self.calculate_areas()

        super().save(
            *args,
            **kwargs
        )

    def __str__(self):
        return self.name





# =========================================================
# QUOTATION ITEM
# =========================================================

class QuotationItem(models.Model):

    class LineType(models.TextChoices):
        SERVICE_MATERIAL = "SERVICE_MATERIAL", "Service + Material"
        SERVICE = "SERVICE", "Service"
        MATERIAL = "MATERIAL", "Material"
        REPAIR = "REPAIR", "Repair"

    class CalculationMethod(models.TextChoices):
        AREA = "AREA", "Area Based"
        LUMPSUM = "LUMPSUM", "Lumpsum"
        MANUAL = "MANUAL", "Manual Quantity"

    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name="items"
    )

    room = models.ForeignKey(
        QuotationRoom,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="items"
    )

    service_type = models.ForeignKey(
        ServiceType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    paint_type = models.ForeignKey(
        PaintType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    paint_brand = models.ForeignKey(
        PaintBrand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    color = models.ForeignKey(
        PaintColor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    description = models.CharField(
        max_length=255
    )

    calculation_method = models.CharField(
        max_length=20,
        choices=CalculationMethod.choices,
        default=CalculationMethod.AREA
    )

    service_category = models.ForeignKey(
        ServiceCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    line_type = models.CharField(
        max_length=30,
        choices=LineType.choices,
        default=LineType.SERVICE_MATERIAL,
    )

    custom_service_category = models.CharField(max_length=150, blank=True)
    custom_service_type = models.CharField(max_length=150, blank=True)
    custom_product_type = models.CharField(max_length=150, blank=True)
    custom_brand = models.CharField(max_length=150, blank=True)

    is_additional_service = models.BooleanField(default=False)
    custom_unit = models.CharField(max_length=40, blank=True)

    coats = models.PositiveIntegerField(
        default=1
    )

    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    unit = models.ForeignKey(
        Unit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    rate = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    service_category_name_snapshot = models.CharField(max_length=150, blank=True)
    service_name_snapshot = models.CharField(max_length=150, blank=True)
    product_type_name_snapshot = models.CharField(max_length=150, blank=True)
    product_type_features_snapshot = models.TextField(blank=True)
    brand_name_snapshot = models.CharField(max_length=150, blank=True)
    unit_name_snapshot = models.CharField(max_length=40, blank=True)

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return self.description

    def save(self, *args, **kwargs):
        previous = None
        if self.pk:
            previous = type(self).objects.filter(pk=self.pk).values(
                "service_category_id", "service_type_id", "paint_type_id",
                "paint_brand_id", "unit_id", "custom_service_category",
                "custom_service_type", "custom_product_type", "custom_brand",
                "custom_unit",
            ).first()

        def changed(field):
            return previous is None or previous.get(f"{field}_id") != getattr(self, f"{field}_id")

        def text_changed(field):
            return previous is None or previous.get(field) != getattr(self, field)

        if not self.service_category_name_snapshot or changed("service_category") or text_changed("custom_service_category"):
            self.service_category_name_snapshot = self.custom_service_category or (
                self.service_category.name if self.service_category else ""
            )
        if not self.service_name_snapshot or changed("service_type") or text_changed("custom_service_type"):
            self.service_name_snapshot = self.custom_service_type or (
                self.service_type.name if self.service_type else ""
            )
        if not self.product_type_name_snapshot or changed("paint_type") or text_changed("custom_product_type"):
            self.product_type_name_snapshot = self.custom_product_type or (
                self.paint_type.name if self.paint_type else ""
            )
            self.product_type_features_snapshot = (
                self.paint_type.key_features if self.paint_type else ""
            )
        if not self.brand_name_snapshot or changed("paint_brand") or text_changed("custom_brand"):
            self.brand_name_snapshot = self.custom_brand or (
                self.paint_brand.name if self.paint_brand else ""
            )
        if not self.unit_name_snapshot or changed("unit") or text_changed("custom_unit"):
            self.unit_name_snapshot = self.custom_unit or (
                self.unit.name if self.unit else ""
            )
        super().save(*args, **kwargs)


class WorkChange(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT_TO_CUSTOMER = "SENT_TO_CUSTOMER", "Sent to customer"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    quotation = models.ForeignKey(Quotation, on_delete=models.PROTECT, related_name="work_changes")
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="work_changes_created")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="work_changes")
    change_number = models.CharField(max_length=40, unique=True, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
    reason = models.TextField(blank=True)
    customer_response_note = models.TextField(blank=True)
    requested_date = models.DateField(default=timezone.localdate)
    sent_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-requested_date", "-id")

    @property
    def price_difference(self):
        return sum((line.price_difference for line in self.lines.all()), Decimal("0"))

    def __str__(self):
        return self.change_number or f"Work change {self.pk or ''}".strip()


class WorkChangeItem(models.Model):
    class ChangeType(models.TextChoices):
        ADD_WORK = "ADD_WORK", "Add work"
        REMOVE_WORK = "REMOVE_WORK", "Remove work"
        CHANGE_SERVICE = "CHANGE_SERVICE", "Change service"
        CHANGE_MATERIAL = "CHANGE_MATERIAL", "Change material"
        CHANGE_QUANTITY = "CHANGE_QUANTITY", "Change quantity"

    work_change = models.ForeignKey(WorkChange, on_delete=models.CASCADE, related_name="lines")
    change_type = models.CharField(max_length=24, choices=ChangeType.choices)
    original_item = models.ForeignKey(QuotationItem, on_delete=models.PROTECT, related_name="work_change_lines", null=True, blank=True)
    room = models.ForeignKey(QuotationRoom, on_delete=models.SET_NULL, related_name="work_change_lines", null=True, blank=True)
    area_name = models.CharField(max_length=150, blank=True)

    original_service_type = models.ForeignKey(ServiceType, on_delete=models.SET_NULL, related_name="work_changes_from_service", null=True, blank=True)
    new_service_type = models.ForeignKey(ServiceType, on_delete=models.SET_NULL, related_name="work_changes_to_service", null=True, blank=True)
    original_product_type = models.ForeignKey(PaintType, on_delete=models.SET_NULL, related_name="work_changes_from_product", null=True, blank=True)
    new_product_type = models.ForeignKey(PaintType, on_delete=models.SET_NULL, related_name="work_changes_to_product", null=True, blank=True)
    original_brand = models.ForeignKey(PaintBrand, on_delete=models.SET_NULL, related_name="work_changes_from_brand", null=True, blank=True)
    new_brand = models.ForeignKey(PaintBrand, on_delete=models.SET_NULL, related_name="work_changes_to_brand", null=True, blank=True)
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, related_name="work_change_lines", null=True, blank=True)

    original_service_snapshot = models.CharField(max_length=180, blank=True)
    new_service_snapshot = models.CharField(max_length=180, blank=True)
    original_material_snapshot = models.CharField(max_length=180, blank=True)
    new_material_snapshot = models.CharField(max_length=180, blank=True)
    original_brand_snapshot = models.CharField(max_length=180, blank=True)
    new_brand_snapshot = models.CharField(max_length=180, blank=True)
    unit_snapshot = models.CharField(max_length=40, blank=True)
    description = models.CharField(max_length=255, blank=True)

    original_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    completed_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    changed_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    old_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    new_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    old_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    new_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    price_difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.CheckConstraint(condition=models.Q(changed_quantity__gte=0), name="work_change_quantity_nonnegative"),
            models.CheckConstraint(condition=models.Q(completed_quantity__gte=0), name="work_change_completed_nonnegative"),
        ]

    def calculate_amounts(self):
        quantity = self.changed_quantity or Decimal("0")
        if self.change_type == self.ChangeType.ADD_WORK:
            self.old_amount = Decimal("0")
            self.new_amount = quantity * self.new_rate
        elif self.change_type == self.ChangeType.REMOVE_WORK:
            self.old_amount = quantity * self.old_rate
            self.new_amount = Decimal("0")
        elif self.change_type == self.ChangeType.CHANGE_QUANTITY:
            self.old_amount = self.original_quantity * self.old_rate
            self.new_amount = quantity * self.new_rate
        else:
            self.old_amount = quantity * self.old_rate
            self.new_amount = quantity * self.new_rate
        self.old_amount = self.old_amount.quantize(Decimal("0.01"))
        self.new_amount = self.new_amount.quantize(Decimal("0.01"))
        self.price_difference = (self.new_amount - self.old_amount).quantize(Decimal("0.01"))

    def save(self, *args, **kwargs):
        original = self.original_item
        if original:
            self.room = self.room or original.room
            self.area_name = self.area_name or (original.room.name if original.room else "General")
            self.original_quantity = original.quantity
            self.old_rate = original.rate
            self.original_service_type = self.original_service_type or original.service_type
            self.original_product_type = self.original_product_type or original.paint_type
            self.original_brand = self.original_brand or original.paint_brand
            self.unit = self.unit or original.unit
            self.original_service_snapshot = self.original_service_snapshot or original.service_name_snapshot or original.custom_service_type
            self.original_material_snapshot = self.original_material_snapshot or original.product_type_name_snapshot or original.custom_product_type
            self.original_brand_snapshot = self.original_brand_snapshot or original.brand_name_snapshot or original.custom_brand
            self.unit_snapshot = self.unit_snapshot or original.unit_name_snapshot or original.custom_unit
        self.new_service_snapshot = self.new_service_snapshot or (self.new_service_type.name if self.new_service_type else "")
        self.new_material_snapshot = self.new_material_snapshot or (self.new_product_type.name if self.new_product_type else "")
        self.new_brand_snapshot = self.new_brand_snapshot or (self.new_brand.name if self.new_brand else "")
        self.unit_snapshot = self.unit_snapshot or (self.unit.name if self.unit else "")
        self.calculate_amounts()
        super().save(*args, **kwargs)





class PropertyRoom(models.Model):

    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="rooms"
    )

    measurement_record = models.ForeignKey(
        PropertyMeasurement,
        on_delete=models.CASCADE,
        related_name="rooms",
        null=True,
        blank=True,
    )

    room_type = models.ForeignKey(
        Area,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="property_rooms",
    )

    name = models.CharField(
        max_length=150
    )

    section = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)

    length = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    window_count = models.PositiveIntegerField(
        default=0
    )

    window_width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    window_height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    door_count = models.PositiveIntegerField(
        default=0
    )

    door_width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    door_height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )

    wall_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    ceiling_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    window_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    door_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    paintable_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def calculate_areas(self):

        length = self.length or 0
        width = self.width or 0
        height = self.height or 0

        self.wall_area = (
            2 * (length + width) * height
        )

        self.ceiling_area = (
            length * width
        )

        self.window_area = (
            self.window_count
            * (self.window_width or 0)
            * (self.window_height or 0)
        )

        self.door_area = (
            self.door_count
            * (self.door_width or 0)
            * (self.door_height or 0)
        )

        self.paintable_area = (
            self.wall_area
            - self.window_area
            - self.door_area
            + self.ceiling_area
        )

        if self.paintable_area < 0:
            self.paintable_area = 0

    def save(self, *args, **kwargs):

        self.calculate_areas()

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} - {self.property}"


class MeasurementSurface(models.Model):
    class WorkArea(models.TextChoices):
        INTERIOR = "INTERIOR", "Interior"
        EXTERIOR = "EXTERIOR", "Exterior"

    class SurfaceType(models.TextChoices):
        WALL = "WALL", "Wall"
        CEILING = "CEILING", "Ceiling"
        FLOOR = "FLOOR", "Floor"
        WOOD_WORK = "WOOD_WORK", "Wood Work"
        TILE = "TILE", "Tile / Tiling"
        WALLPAPER = "WALLPAPER", "Wallpaper"
        METAL = "METAL", "Metal"
        GLASS = "GLASS", "Glass"
        DOOR = "DOOR", "Paintable door"
        WINDOW = "WINDOW", "Paintable window"
        COLUMN = "COLUMN", "Column"
        BEAM = "BEAM", "Beam"
        GATE = "GATE", "Gate"
        GRILL = "GRILL", "Grill"
        BALCONY_SOFFIT = "BALCONY_SOFFIT", "Balcony ceiling"
        STAIR_SOFFIT = "STAIR_SOFFIT", "Staircase ceiling"
        PORCH_CEILING = "PORCH_CEILING", "Porch ceiling"
        WATERPROOFING = "WATERPROOFING", "Floor / terrace waterproofing"
        PARAPET = "PARAPET", "Parapet wall"
        OTHER = "OTHER", "Other / manual"

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name="measurement_surfaces"
    )

    measurement_record = models.ForeignKey(
        PropertyMeasurement,
        on_delete=models.CASCADE,
        related_name="surfaces",
        null=True,
        blank=True,
    )

    room = models.ForeignKey(
        PropertyRoom, on_delete=models.CASCADE, related_name="measurement_surfaces",
        null=True, blank=True,
    )
    work_area = models.CharField(max_length=10, choices=WorkArea.choices)
    surface_type = models.CharField(max_length=30, choices=SurfaceType.choices)
    name = models.CharField(max_length=120)
    area_group_name = models.CharField(max_length=120, blank=True)
    length = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    breadth = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    manual_area = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    paintable_sides = models.PositiveSmallIntegerField(default=1)
    finish = models.CharField(max_length=120, blank=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @python_property
    def gross_area(self):
        raw_area = (self.manual_area or (self.length * self.breadth)) * self.quantity * self.paintable_sides
        return self.property.area_to_sqft(raw_area)

    @python_property
    def deduction_area(self):
        return sum((opening.effective_deduction for opening in self.openings.all() if opening.effect == "DEDUCT"), Decimal("0"))

    @python_property
    def addition_area(self):
        return sum((opening.area for opening in self.openings.all() if opening.effect == "ADD"), Decimal("0"))

    @python_property
    def net_area(self):
        return max(self.gross_area - self.deduction_area + self.addition_area, Decimal("0"))

    @python_property
    def total(self):
        return self.net_area * self.rate

    def __str__(self):
        return f"{self.name} - {self.property}"


class MeasurementOpening(models.Model):
    class OpeningType(models.TextChoices):
        DOOR = "DOOR", "Door"
        WINDOW = "WINDOW", "Window"
        OPENING = "OPENING", "Opening"
        VENT = "VENT", "Vent"
        SKYLIGHT = "SKYLIGHT", "Skylight"
        STAIR_OPENING = "STAIR_OPENING", "Stair opening"
        GATE = "GATE", "Gate"
        GRILL = "GRILL", "Grill"
        WARDROBE = "WARDROBE", "Wardrobe"
        CEILING = "CEILING", "Ceiling"
        OTHER = "OTHER", "Other"

    class DeductionMode(models.TextChoices):
        FULL = "FULL", "Full deduction"
        IGNORE = "IGNORE", "Ignore deduction"
        PERCENTAGE = "PERCENTAGE", "Partial deduction"

    class Effect(models.TextChoices):
        DEDUCT = "DEDUCT", "Deduct"
        ADD = "ADD", "Add"

    surface = models.ForeignKey(
        MeasurementSurface, on_delete=models.CASCADE, related_name="openings"
    )
    linked_surface = models.OneToOneField(
        MeasurementSurface, on_delete=models.CASCADE, related_name="wall_deduction",
        null=True, blank=True,
    )
    opening_type = models.CharField(max_length=20, choices=OpeningType.choices)
    name = models.CharField(max_length=120, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    width = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    height = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deduction_mode = models.CharField(
        max_length=15, choices=DeductionMode.choices, default=DeductionMode.FULL
    )
    deduction_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    effect = models.CharField(max_length=10, choices=Effect.choices, default=Effect.DEDUCT)
    deduct_from_surface_type = models.CharField(max_length=30, blank=True)
    deduct_from_group_name = models.CharField(max_length=120, blank=True)
    separate_finish = models.CharField(max_length=120, blank=True)
    separate_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    @property
    def area(self):
        if self.linked_surface_id:
            return self.linked_surface.gross_area
        return self.surface.property.area_to_sqft(self.quantity * self.width * self.height)

    @property
    def effective_deduction(self):
        if self.deduction_mode == self.DeductionMode.IGNORE:
            return Decimal("0")
        percentage = Decimal("100") if self.deduction_mode == self.DeductionMode.FULL else self.deduction_percentage
        # A door/window may be painted on two sides, but its opening is deducted
        # from the exterior wall only once.
        opening_area = self.surface.property.area_to_sqft(self.quantity * self.width * self.height)
        return opening_area * percentage / Decimal("100")

    @property
    def separate_total(self):
        return self.area * self.separate_rate


class ActivityLog(models.Model):
    class Actions(models.TextChoices):
        CREATE = "CREATE", "Created"
        UPDATE = "UPDATE", "Updated"
        DELETE = "DELETE", "Deleted"
        STATUS_CHANGE = "STATUS_CHANGE", "Status changed"
        LOGIN = "LOGIN", "Signed in"
        LOGIN_FAILED = "LOGIN_FAILED", "Sign-in failed"
        DOWNLOAD = "DOWNLOAD", "Downloaded"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="activity_logs",
    )
    actor_name = models.CharField(max_length=160, blank=True)
    actor_role = models.CharField(max_length=30, blank=True)
    action = models.CharField(max_length=20, choices=Actions.choices)
    module = models.CharField(max_length=80)
    description = models.CharField(max_length=255)
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=255)
    object_id = models.CharField(max_length=80, blank=True)
    status_code = models.PositiveSmallIntegerField(default=200)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_flagged = models.BooleanField(default=False)
    review_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reviewed_activity_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("module", "action", "created_at"), name="quotations_module_42f2d9_idx")]

    def __str__(self):
        return f"{self.actor_name or 'User'} {self.action.lower()} {self.module}"


class Invoice(models.Model):
    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        PART_PAID = "PART_PAID", "Part paid"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMode(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        CARD = "CARD", "Card"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    class TaxMode(models.TextChoices):
        GST = "GST", "With GST"
        NON_GST = "NON_GST", "Without GST"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_invoices")
    quotation = models.OneToOneField(Quotation, on_delete=models.PROTECT, related_name="invoice", null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices", null=True, blank=True)
    site_property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="invoices", null=True, blank=True)
    tax_mode = models.CharField(max_length=10, choices=TaxMode.choices, default=TaxMode.NON_GST)
    invoice_number = models.CharField(max_length=40, unique=True)
    invoice_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ISSUED)
    customer_name = models.CharField(max_length=180)
    customer_mobile = models.CharField(max_length=20, blank=True)
    billing_address = models.TextField(blank=True)
    property_name = models.CharField(max_length=200, blank=True)
    contractor_snapshot = models.JSONField(default=dict, blank=True)
    quotation_number_snapshot = models.CharField(max_length=40, blank=True)
    base_items = models.JSONField(default=list)
    measurement_adjustments = models.JSONField(default=list)
    items = models.JSONField(default=list)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices, blank=True)
    payment_reference = models.CharField(max_length=120, blank=True)
    payment_received_at = models.DateTimeField(null=True, blank=True)
    receipt_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    terms_conditions = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-invoice_date", "-id")

    @property
    def balance_due(self):
        return max(self.grand_total - self.amount_paid, Decimal("0"))

    def __str__(self):
        return self.invoice_number


class InvoiceNumberSequence(models.Model):
    tax_mode = models.CharField(max_length=10, choices=Invoice.TaxMode.choices)
    financial_year = models.CharField(max_length=9)
    last_number = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("tax_mode", "financial_year"), name="unique_invoice_sequence_by_tax_fy"),
        ]

    def __str__(self):
        return f"{self.tax_mode} {self.financial_year}: {self.last_number}"


class InvoicePayment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    received_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=Invoice.PaymentMode.choices)
    payment_reference = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("received_date", "id")


class ProjectReceipt(models.Model):
    class PaymentMode(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        CARD = "CARD", "Card"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_receipts")
    quotation = models.ForeignKey(Quotation, on_delete=models.PROTECT, related_name="project_receipts")
    receipt_number = models.CharField(max_length=40, unique=True)
    received_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices)
    payment_reference = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-received_date", "-id")
