from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class BharathUserManager(BaseUserManager):

    def create_user(self, mobile, email=None, password=None, **extra_fields):
        if not mobile:
            raise ValueError("Mobile number is required")

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

    user = models.ForeignKey(BharathUser, on_delete=models.CASCADE, related_name="password_reset_otps")
    purpose = models.CharField(max_length=30, choices=Purpose.choices, default=Purpose.PASSWORD_RESET)
    target_email = models.EmailField(blank=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    verified_at = models.DateTimeField(blank=True, null=True)
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
        max_length=15,
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
        return f"Contractor - {self.company_name}"
