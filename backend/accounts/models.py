from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from .mobile import normalize_mobile, matching_mobile_users


class BharathUserManager(BaseUserManager):

    def create_user(self, mobile, email=None, password=None, **extra_fields):
        if not mobile:
            raise ValueError("Mobile number is required")

        mobile = normalize_mobile(mobile)
        if not mobile:
            raise ValueError("Enter a valid mobile number. Include + and the country code for international numbers.")
        if matching_mobile_users(mobile, self.model.objects.using(self._db)):
            raise ValueError("An account with this mobile number already exists.")
        email = self.normalize_email(email)

        user = self.model(
            mobile=mobile,
            email=email,
            **extra_fields
        )

        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, mobile, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        extra_fields["role"] = "ADMIN"
        extra_fields["is_verified"] = True
        extra_fields["verification_status"] = "VERIFIED"

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")

        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")

        return self.create_user(
            mobile=mobile,
            email=email,
            password=password,
            **extra_fields
        )


class BharathUser(AbstractUser):

    class Languages(models.TextChoices):
        ENGLISH = "en", "English"
        KANNADA = "kn", "Kannada"
        HINDI = "hi", "Hindi"
        TELUGU = "te", "Telugu"
        TAMIL = "ta", "Tamil"
        MALAYALAM = "ml", "Malayalam"
        MARATHI = "mr", "Marathi"
        BENGALI = "bn", "Bengali"
        GUJARATI = "gu", "Gujarati"
        PUNJABI = "pa", "Punjabi"
        ODIA = "or", "Odia"
        ASSAMESE = "as", "Assamese"

    class Roles(models.TextChoices):
        PAINTER = "PAINTER", "Painter"
        CONTRACTOR = "CONTRACTOR", "Contractor"
        CUSTOMER = "CUSTOMER", "Customer"
        ADMIN = "ADMIN", "Admin"
        SUPPORT = "SUPPORT", "Support staff"

    class VerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        SUSPENDED = "SUSPENDED", "Suspended"

    username = None

    mobile = models.CharField(
        max_length=15,
        unique=True
    )

    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.CUSTOMER
    )

    profile_photo = models.ImageField(
        upload_to="profiles/",
        blank=True,
        null=True
    )
    profile_photo_position = models.JSONField(default=dict, blank=True)

    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING
    )

    is_verified = models.BooleanField(
        default=False
    )

    verified_at = models.DateTimeField(
        blank=True,
        null=True
    )

    bharath_id = models.CharField(
        max_length=30,
        unique=True,
        blank=True,
        null=True
    )

    bharath_qr = models.ImageField(
        upload_to="badges/qr/",
        blank=True,
        null=True
    )

    badge_issued_at = models.DateTimeField(
        blank=True,
        null=True
    )

    verification_notes = models.TextField(
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    preferred_language = models.CharField(
        max_length=5, choices=Languages.choices, default=Languages.ENGLISH,
    )
    app_primary_color = models.CharField(max_length=7, default="#176B9B")
    app_accent_color = models.CharField(max_length=7, default="#508398")

    # Kept separate from the ordinary contact email because contact details are
    # editable in several portals. Password recovery must only use an address
    # that has completed the verification flow below.
    recovery_email = models.EmailField(blank=True, null=True, unique=True)
    recovery_email_verified = models.BooleanField(default=False)
    recovery_email_verified_at = models.DateTimeField(blank=True, null=True)
    recovery_email_added_at = models.DateTimeField(blank=True, null=True)
    recovery_email_added_by = models.ForeignKey(
        "self",
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name="recovery_emails_added",
    )

    # Stable Google identity binding. Email is retained as an audit/display
    # value, but future sign-ins use the immutable Google subject identifier.
    google_subject = models.CharField(max_length=255, unique=True, blank=True, null=True)
    google_email = models.EmailField(blank=True)
    google_linked_at = models.DateTimeField(blank=True, null=True)

    last_activity_at = models.DateTimeField(blank=True, null=True)

    objects = BharathUserManager()

    USERNAME_FIELD = "mobile"

    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return f"{self.get_full_name()} - {self.mobile}"


class PasswordResetOTP(models.Model):
    class Purpose(models.TextChoices):
        PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
        RECOVERY_EMAIL = "RECOVERY_EMAIL", "Recovery email verification"
        REGISTRATION_EMAIL = "REGISTRATION_EMAIL", "Registration email verification"
        CUSTOMER_ACTIVATION = "CUSTOMER_ACTIVATION", "Customer activation email verification"
        ADMIN_TEST = "ADMIN_TEST", "Admin test (no authentication access)"

    user = models.ForeignKey(BharathUser, on_delete=models.CASCADE, related_name="password_reset_otps")
    purpose = models.CharField(max_length=30, choices=Purpose.choices, default=Purpose.PASSWORD_RESET)
    target_email = models.EmailField(blank=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    is_used = models.BooleanField(default=False)
    verified_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class EmailOTPSetup(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    provider = models.CharField(max_length=20, choices=[("DJANGO", "Django email / SMTP"), ("RESEND", "Resend"), ("SENDGRID", "SendGrid")], default="DJANGO")
    encrypted_api_key = models.TextField(blank=True, editable=False)
    sender_domain = models.CharField(max_length=253, blank=True)
    from_email = models.EmailField(blank=True)
    from_name = models.CharField(max_length=150, default="Bharath Painters")
    frontend_url = models.URLField(blank=True)
    backend_url = models.URLField(blank=True)
    otp_length = models.PositiveSmallIntegerField(default=6)
    expiry_minutes = models.PositiveSmallIntegerField(default=10)
    resend_seconds = models.PositiveIntegerField(default=60)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    max_per_hour = models.PositiveSmallIntegerField(default=5)
    is_active = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Email & OTP Setup"
        verbose_name_plural = "Email & OTP Setup"
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="email_setup_singleton")]

    def __str__(self):
        return "Email & OTP Setup"

    def clean(self):
        from django.core.exceptions import ValidationError
        from urllib.parse import urlsplit
        errors = {}
        for field, low, high in [("otp_length", 6, 10), ("expiry_minutes", 1, 60), ("resend_seconds", 1, 3600), ("max_attempts", 1, 20), ("max_per_hour", 1, 100)]:
            if not low <= getattr(self, field) <= high:
                errors[field] = f"Choose a value between {low} and {high}."
        if any(c in self.from_name for c in "\r\n"):
            errors["from_name"] = "Line breaks are not allowed."
        if self.sender_domain and self.from_email and self.from_email.rsplit("@", 1)[-1].lower() != self.sender_domain.lower():
            errors["from_email"] = "The from email must belong to the sender domain."
        if self.is_active:
            for field in ("sender_domain", "from_email", "frontend_url", "backend_url"):
                if not getattr(self, field):
                    errors[field] = "Required before activation."
            for field in ("frontend_url", "backend_url"):
                url = urlsplit(getattr(self, field))
                if url.username or url.password or url.query or url.fragment:
                    errors[field] = "Use a public URL without credentials, query or fragment."
            if self.provider != "DJANGO":
                from .email_setup import decrypt_api_key
                try:
                    if not decrypt_api_key(self.encrypted_api_key):
                        raise ValueError()
                except Exception:
                    errors["provider"] = "A valid encrypted API key and server encryption key are required."
        if errors:
            raise ValidationError(errors)


class EmailDeliveryLog(models.Model):
    recipient = models.EmailField()
    purpose = models.CharField(max_length=30)
    provider = models.CharField(max_length=20)
    status = models.CharField(max_length=12, choices=[("ACCEPTED", "Accepted by provider"), ("FAILED", "Failed")])
    error_code = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class UserLegalConsent(models.Model):
    user = models.ForeignKey(
        BharathUser,
        on_delete=models.CASCADE,
        related_name="legal_consents",
    )
    policy_version = models.CharField(max_length=30)
    role_at_acceptance = models.CharField(max_length=20, choices=BharathUser.Roles.choices)
    terms_hash = models.CharField(max_length=64)
    privacy_hash = models.CharField(max_length=64)
    terms_accepted = models.BooleanField(default=False)
    privacy_notice_acknowledged = models.BooleanField(default=False)
    document_scrolled = models.BooleanField(default=False)
    acceptance_method = models.CharField(max_length=40, default="REGISTRATION_CHECKBOX")
    ip_address = models.CharField(max_length=45, blank=True)
    user_agent = models.TextField(blank=True)
    accepted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-accepted_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("user", "policy_version"),
                name="unique_user_legal_policy_acceptance",
            ),
        ]

    def __str__(self):
        return f"{self.user_id} accepted {self.policy_version}"


class PainterProfile(models.Model):

    class Availability(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BUSY = "BUSY", "Busy"
        OFFLINE = "OFFLINE", "Offline"

    user = models.OneToOneField(
        BharathUser,
        on_delete=models.CASCADE,
        related_name="painter_profile"
    )

    experience_years = models.PositiveIntegerField(
        default=0
    )

    skills = models.TextField(
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

    preferred_locations = models.TextField(
        blank=True
    )

    willing_to_travel = models.BooleanField(
        default=False
    )

    availability = models.CharField(
        max_length=20,
        choices=Availability.choices,
        default=Availability.AVAILABLE
    )

    aadhaar_number = models.CharField(
        max_length=12,
        blank=True
    )

    aadhaar_document = models.FileField(
        upload_to="verification/painters/aadhaar/",
        blank=True,
        null=True
    )

    pan_number = models.CharField(
        max_length=10,
        blank=True
    )

    experience_document = models.FileField(
        upload_to="verification/painters/experience/",
        blank=True,
        null=True
    )

    emergency_contact_name = models.CharField(
        max_length=150,
        blank=True
    )

    emergency_contact_number = models.CharField(
        max_length=16,
        blank=True
    )

    blood_group = models.CharField(max_length=5, blank=True)

    permanent_address = models.TextField(blank=True)

    current_location = models.CharField(max_length=180, blank=True)

    upi_id = models.CharField(
        max_length=100,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"Painter - {self.user.get_full_name()}"


class ContractorProfile(models.Model):
    class PdfFontTemplate(models.TextChoices):
        MODERN = "MODERN", "Modern sans"
        CLASSIC = "CLASSIC", "Classic serif"
        CLEAN = "CLEAN", "Clean sans"
        COMPACT = "COMPACT", "Compact sans"

    class PdfColorTemplate(models.TextChoices):
        STUDIO = "STUDIO", "Studio navy and orange"
        INDIGO = "INDIGO", "Indigo and violet"
        FOREST = "FOREST", "Forest and gold"
        CHARCOAL = "CHARCOAL", "Charcoal and copper"
        COASTAL = "COASTAL", "Coastal blue and silver"
        CORAL = "CORAL", "Deep teal and coral"
        MIST = "MIST", "Slate and ice blue"
        CUSTOM = "CUSTOM", "Custom colors"

    class LogoShape(models.TextChoices):
        RECTANGLE = "RECTANGLE", "Rectangle"
        ROUND = "ROUND", "Round"

    class MeasurementUnit(models.TextChoices):
        FEET = "FEET", "Feet"
        METRES = "METRES", "Metres"

    user = models.OneToOneField(
        BharathUser,
        on_delete=models.CASCADE,
        related_name="contractor_profile"
    )

    company_name = models.CharField(
        max_length=200
    )

    owner_name = models.CharField(
        max_length=150
    )

    company_logo = models.ImageField(
        upload_to="contractors/logos/",
        blank=True,
        null=True
    )
    company_logo_shape = models.CharField(
        max_length=12,
        choices=LogoShape.choices,
        default=LogoShape.RECTANGLE,
    )
    company_logo_position = models.JSONField(default=dict, blank=True)
    pdf_color_template = models.CharField(
        max_length=12,
        choices=PdfColorTemplate.choices,
        default=PdfColorTemplate.STUDIO,
    )
    pdf_custom_primary_color = models.CharField(max_length=7, default="#142743")
    pdf_custom_accent_color = models.CharField(max_length=7, default="#FF991F")
    pdf_custom_text_color = models.CharField(max_length=7, default="#172033")
    app_primary_color = models.CharField(max_length=7, default="#176B9B")
    app_accent_color = models.CharField(max_length=7, default="#508398")
    pdf_font_template = models.CharField(
        max_length=12,
        choices=PdfFontTemplate.choices,
        default=PdfFontTemplate.MODERN,
    )

    years_in_business = models.PositiveIntegerField(
        default=0
    )

    default_measurement_unit = models.CharField(
        max_length=10,
        choices=MeasurementUnit.choices,
        default=MeasurementUnit.FEET,
    )

    quotation_terms_conditions = models.TextField(blank=True)
    quotation_prepared_by = models.CharField(max_length=150, blank=True)
    quotation_inspected_by = models.CharField(max_length=150, blank=True)
    quotation_work_duration = models.CharField(max_length=150, blank=True)
    quotation_payment_terms = models.TextField(blank=True)
    quotation_product_details = models.TextField(blank=True)
    quotation_work_procedures = models.TextField(blank=True)

    service_areas = models.TextField(
        blank=True
    )
    work_skills = models.TextField(blank=True)

    office_address = models.TextField(
        blank=True
    )

    gst_number = models.CharField(
        max_length=15,
        blank=True
    )

    pan_number = models.CharField(
        max_length=10,
        blank=True
    )

    gst_document = models.FileField(
        upload_to="verification/contractors/gst/",
        blank=True,
        null=True
    )

    business_document = models.FileField(
        upload_to="verification/contractors/business/",
        blank=True,
        null=True
    )

    number_of_painters = models.PositiveIntegerField(
        default=0
    )

    bank_account_name = models.CharField(
        max_length=150,
        blank=True
    )

    bank_account_number = models.CharField(
        max_length=50,
        blank=True
    )

    bank_ifsc = models.CharField(
        max_length=20,
        blank=True
    )

    bank_name = models.CharField(
        max_length=150,
        blank=True
    )

    bank_branch = models.CharField(
        max_length=150,
        blank=True
    )

    upi_id = models.CharField(
        max_length=100,
        blank=True
    )

    website = models.CharField(
        max_length=300,
        blank=True
    )

    google_business_url = models.CharField(
        max_length=300,
        blank=True
    )

    facebook_url = models.CharField(
        max_length=300,
        blank=True
    )

    instagram_url = models.CharField(
        max_length=300,
        blank=True
    )

    pinterest_url = models.CharField(
        max_length=300,
        blank=True
    )

    whatsapp_number = models.CharField(
        max_length=25,
        blank=True
    )

    extra_social_links = models.JSONField(
        default=list,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"Contractor - {self.company_name}"


class ContractorCompletedProject(models.Model):
    contractor = models.ForeignKey(ContractorProfile, on_delete=models.CASCADE, related_name="completed_projects")
    title = models.CharField(max_length=160)
    apartment_community = models.CharField(max_length=160, blank=True)
    location = models.CharField(max_length=160, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    address = models.TextField(blank=True)
    description = models.TextField(blank=True)
    work_completed = models.TextField(blank=True)
    completed_on = models.DateField(null=True, blank=True)
    photo = models.ImageField(upload_to="contractors/projects/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title


class ContractorCustomerReview(models.Model):
    contractor = models.ForeignKey(ContractorProfile, on_delete=models.CASCADE, related_name="customer_reviews")
    customer = models.ForeignKey(BharathUser, on_delete=models.CASCADE, related_name="contractor_reviews_written")
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [models.UniqueConstraint(fields=("contractor", "customer"), name="unique_customer_contractor_review")]

    def __str__(self):
        return f"{self.customer_id} rated {self.contractor_id}: {self.rating}/5"


class ProviderProfile(models.Model):
    """Multi-trade layer shared by contractors and employees.

    A provider has one core service, which is the only thing that sets the
    workspace name and role labels, plus any number of additional services.
    Additional services never rename the workspace, so a cleaning contractor
    who also takes painting work keeps the Cleaning workspace and role labels.
    """

    class SetupStep(models.TextChoices):
        CORE_SERVICE = "CORE_SERVICE", "Core service"
        ADDITIONAL_SERVICES = "ADDITIONAL_SERVICES", "Additional services"
        ABOUT = "ABOUT", "About"
        SERVICE_AREAS = "SERVICE_AREAS", "Service areas"
        PUBLISH = "PUBLISH", "Publish"

    user = models.OneToOneField(
        BharathUser,
        on_delete=models.CASCADE,
        related_name="provider_profile",
    )

    core_service = models.ForeignKey(
        "quotations.ServiceCategory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="provider_core_services",
    )
    additional_services = models.ManyToManyField(
        "quotations.ServiceCategory",
        blank=True,
        related_name="provider_additional_services",
    )

    headline = models.CharField(max_length=180, blank=True)
    about = models.TextField(blank=True)
    service_areas = models.TextField(blank=True)
    base_location = models.CharField(max_length=180, blank=True)
    years_in_business = models.PositiveIntegerField(default=0)
    team_size = models.PositiveIntegerField(default=0)

    workspace_name_override = models.CharField(max_length=150, blank=True)
    tagline = models.CharField(max_length=180, blank=True)

    accepts_subcontract_work = models.BooleanField(default=False)
    network_opt_in = models.BooleanField(default=True)
    is_draft = models.BooleanField(default=True)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)

    brand_snapshot = models.JSONField(default=dict, blank=True)
    rating_average = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    completed_work_orders = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return f"Provider profile for {self.user_id}"

    @property
    def completion_percent(self):
        checks = (
            bool(self.core_service_id),
            self.additional_services.exists() or bool(self.core_service_id),
            bool(self.about.strip()),
            bool(self.service_areas.strip() or self.base_location.strip()),
        )
        return round(100 * sum(1 for check in checks if check) / len(checks))

    def resolved_branding(self):
        """Workspace labels, always derived from the core service."""
        from quotations.models import ServiceCategory

        if not self.core_service_id:
            return {
                "platform_name": "Bharath Apps",
                "workspace_name": "Bharath Apps",
                "contractor_label": "Contractor",
                "employee_singular_label": "Employee",
                "employee_plural_label": "Employees",
                "icon": ServiceCategory.Icon.GENERAL,
            }
        branding = dict(self.core_service.branding())
        branding.setdefault("platform_name", "Bharath Apps")
        if self.workspace_name_override.strip():
            branding["workspace_name"] = self.workspace_name_override.strip()
        return branding

    def offered_service_ids(self):
        ids = set()
        if self.core_service_id:
            ids.add(self.core_service_id)
        ids.update(self.additional_services.values_list("id", flat=True))
        return ids


class ProviderServiceClaim(models.Model):
    """Sub-service a provider offers inside one of their categories."""

    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name="service_claims",
    )
    category = models.ForeignKey(
        "quotations.ServiceCategory",
        on_delete=models.CASCADE,
        related_name="provider_claims",
    )
    work_description = models.ForeignKey(
        "quotations.WorkDescription",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="provider_claims",
    )
    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category__sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=("provider", "category", "work_description"),
                name="unique_provider_service_claim",
            ),
        ]

    def __str__(self):
        return f"{self.provider_id} offers {self.work_description_id or self.category_id}"

    def clean(self):
        if not self.provider_id or not self.category_id:
            return
        offered = self.provider.offered_service_ids()
        if self.category_id not in offered:
            from django.core.exceptions import ValidationError

            raise ValidationError(
                {"category": "This service is not part of the provider's profile."}
            )
        if self.work_description_id and self.work_description.service_category_id != self.category_id:
            from django.core.exceptions import ValidationError

            raise ValidationError(
                {"work_description": "The sub-service does not belong to this service category."}
            )
