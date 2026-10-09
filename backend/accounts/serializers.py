from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from .mobile import normalize_mobile, matching_mobile_users
from .profile_field_ownership import (
    CONTRACTOR_OWNS,
    mirror_contractor_to_provider,
    mirror_provider_to_contractor,
)
from .models import (
    BharathUser,
    PainterProfile,
    ContractorProfile,
    ContractorCompletedProject,
    ProviderProfile,
    ProviderServiceClaim,
)


class ProfileImagePositionField(serializers.JSONField):
    """Normalized pan/zoom applied to profile photos and company logos."""

    DEFAULT = {"x": 50, "y": 50, "zoom": 1}

    def to_representation(self, value):
        position = dict(value or {})
        return {
            "x": position.get("x", 50),
            "y": position.get("y", 50),
            "zoom": position.get("zoom", 1),
        }

    def to_internal_value(self, data):
        if isinstance(data, str):
            import json
            try:
                data = json.loads(data)
            except (TypeError, ValueError):
                raise serializers.ValidationError("Enter an image position object.")
        if not isinstance(data, dict):
            self.fail("invalid")
        result = {}
        for key, minimum, maximum, default in (
            ("x", 0, 100, 50),
            ("y", 0, 100, 50),
            ("zoom", 1, 3, 1),
        ):
            try:
                value = float(data.get(key, default))
            except (TypeError, ValueError):
                raise serializers.ValidationError({key: "Enter a number."})
            if not minimum <= value <= maximum:
                raise serializers.ValidationError({key: f"Enter a value from {minimum} to {maximum}."})
            result[key] = value
        return result


def validate_account_mobile(value, exclude_pk=None):
    normalized = normalize_mobile(value)
    if not normalized:
        raise serializers.ValidationError("Enter a valid mobile number. Include + and the country code for international numbers.")
    if matching_mobile_users(normalized, exclude_pk=exclude_pk):
        raise serializers.ValidationError("An account with this mobile number already exists.")
    return normalized


def validate_registration_email(value):
    email = value.strip().lower()
    if BharathUser.objects.filter(recovery_email__iexact=email).exists():
        raise serializers.ValidationError("This email is already linked to another account.")
    return email


class PainterRegistrationSerializer(serializers.ModelSerializer):

    mobile = serializers.CharField(max_length=32)

    name = serializers.CharField(write_only=True, required=False)
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=8)

    experience_years = serializers.IntegerField(required=False, min_value=0, default=0)
    skills = serializers.CharField(required=False, allow_blank=True)
    daily_wage = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False
    )
    weekly_wage = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False
    )
    preferred_locations = serializers.CharField(
        required=False,
        allow_blank=True
    )

    class Meta:
        model = BharathUser
        fields = [
            "mobile",
            "email",
            "password",
            "name",
            "first_name",
            "last_name",
            "profile_photo",
            "experience_years",
            "skills",
            "daily_wage",
            "weekly_wage",
            "preferred_locations",
        ]

    def validate(self, attrs):
        if not (attrs.get("name") or attrs.get("first_name")):
            raise serializers.ValidationError({"name": "Enter your name."})
        return attrs

    def validate_mobile(self, value):
        return validate_account_mobile(value)

    def validate_email(self, value):
        return validate_registration_email(value)

    def create(self, validated_data):

        name = validated_data.pop("name", "").strip()
        if name:
            name_parts = name.split(maxsplit=1)
            validated_data["first_name"] = name_parts[0]
            validated_data["last_name"] = name_parts[1] if len(name_parts) > 1 else ""
        experience_years = validated_data.pop("experience_years", 0)
        skills = validated_data.pop("skills", "")
        daily_wage = validated_data.pop("daily_wage", None)
        weekly_wage = validated_data.pop("weekly_wage", None)
        preferred_locations = validated_data.pop(
            "preferred_locations",
            ""
        )

        password = validated_data.pop("password")

        user = BharathUser.objects.create_user(
            password=password,
            role=BharathUser.Roles.PAINTER,
            **validated_data
        )

        PainterProfile.objects.create(
            user=user,
            experience_years=experience_years,
            skills=skills,
            daily_wage=daily_wage,
            weekly_wage=weekly_wage,
            preferred_locations=preferred_locations,
        )

        return user


class ContractorRegistrationSerializer(serializers.ModelSerializer):

    mobile = serializers.CharField(max_length=32)

    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True)

    name = serializers.CharField(write_only=True, required=False)
    company_name = serializers.CharField(required=False, allow_blank=True)
    owner_name = serializers.CharField(required=False, allow_blank=True)
    years_in_business = serializers.IntegerField(required=False)
    company_logo = serializers.ImageField(required=False, allow_null=True)
    office_address = serializers.CharField(required=False, allow_blank=True)
    service_areas = serializers.CharField(required=False, allow_blank=True)
    gst_number = serializers.CharField(required=False, allow_blank=True)
    pan_number = serializers.CharField(required=False, allow_blank=True)
    number_of_painters = serializers.IntegerField(required=False)

    class Meta:
        model = BharathUser
        fields = [
            "mobile",
            "email",
            "password",
            "name",
            "profile_photo",
            "company_name",
            "owner_name",
            "years_in_business",
            "company_logo",
            "office_address",
            "service_areas",
            "gst_number",
            "pan_number",
            "number_of_painters",
        ]

    def validate_mobile(self, value):
        return validate_account_mobile(value)

    def validate_email(self, value):
        return validate_registration_email(value)

    def create(self, validated_data):

        name = validated_data.pop("name", "").strip()
        company_name = validated_data.pop("company_name", "").strip()
        owner_name = validated_data.pop("owner_name", "").strip() or name
        if not owner_name:
            raise serializers.ValidationError({"name": "Enter your name."})
        name_parts = owner_name.split(maxsplit=1)
        validated_data["first_name"] = name_parts[0]
        validated_data["last_name"] = name_parts[1] if len(name_parts) > 1 else ""
        years_in_business = validated_data.pop(
            "years_in_business",
            0
        )
        profile_data = {
            field: validated_data.pop(field, default)
            for field, default in (
                ("company_logo", None),
                ("office_address", ""),
                ("service_areas", ""),
                ("gst_number", ""),
                ("pan_number", ""),
                ("number_of_painters", 0),
            )
        }

        password = validated_data.pop("password")

        user = BharathUser.objects.create_user(
            password=password,
            role=BharathUser.Roles.CONTRACTOR,
            **validated_data
        )

        ContractorProfile.objects.create(
            user=user,
            company_name=company_name,
            owner_name=owner_name,
            years_in_business=years_in_business,
            **profile_data,
        )

        return user


class ContractorProfileSerializer(serializers.ModelSerializer):
    mobile = serializers.CharField(source="user.mobile")
    email = serializers.EmailField(source="user.email")
    profile_photo = serializers.ImageField(source="user.profile_photo", required=False, allow_null=True)
    profile_photo_position = ProfileImagePositionField(source="user.profile_photo_position", required=False)
    company_logo_position = ProfileImagePositionField(required=False)
    profile_background_position = ProfileImagePositionField(required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    company_name = serializers.CharField(required=False, allow_blank=True)
    owner_name = serializers.CharField(required=False)
    profile_completion = serializers.SerializerMethodField()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request:
            from .profile_images import public_profile_image_url
            data["profile_photo"] = public_profile_image_url(request, instance.user.profile_photo)
            data["company_logo"] = public_profile_image_url(request, instance.company_logo)
            data["profile_background"] = public_profile_image_url(request, instance.profile_background)
        return data

    class Meta:
        model = ContractorProfile
        fields = [
            "mobile", "email", "password", "profile_photo", "profile_photo_position", "company_name", "owner_name", "profile_completion",
            "company_logo", "company_logo_shape", "company_logo_position", "pdf_color_template", "pdf_font_template",
            "profile_background", "profile_background_position",
            "business_established_date",
            "pdf_custom_primary_color", "pdf_custom_accent_color", "pdf_custom_text_color",
            "app_primary_color", "app_accent_color",
"office_address", "service_areas", "work_skills", "gst_number",
            "pan_number", "years_in_business", "number_of_painters",
            "default_measurement_unit",
            "bank_account_name", "bank_account_number", "bank_ifsc",
            "bank_name", "bank_branch", "upi_id",
            "website", "google_business_url", "facebook_url",
            "instagram_url", "pinterest_url", "whatsapp_number",
            "extra_social_links", "gst_document", "business_document",
            "quotation_terms_conditions", "quotation_prepared_by",
            "quotation_inspected_by", "quotation_work_duration",
            "quotation_payment_terms", "quotation_product_details",
            "quotation_work_procedures",
        ]
        read_only_fields = ["profile_completion"]

    url_fields = [
        "website",
        "google_business_url",
        "facebook_url",
        "instagram_url",
        "pinterest_url",
    ]

    def validate_business_established_date(self, value):
        from django.utils import timezone
        if value and value > timezone.localdate():
            raise serializers.ValidationError("Business established date cannot be in the future.")
        return value

    def validate_extra_social_links(self, value):
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Enter a list of social links.")
        cleaned = []
        for entry in value[:12]:
            if not isinstance(entry, dict):
                raise serializers.ValidationError("Each social link must be a name and URL.")
            label = str(entry.get("label", "")).strip()
            url = self._normalize_url(str(entry.get("url", "")).strip())
            if not label or not url:
                continue
            link = {"label": label[:60], "url": url}
            icon = entry.get("icon")
            if icon:
                import base64
                from io import BytesIO
                from PIL import Image
                import re
                if not isinstance(icon, str) or len(icon) > 24000 or not re.fullmatch(r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", icon):
                    raise serializers.ValidationError("Upload a small PNG, JPG or WebP social icon.")
                try:
                    image = Image.open(BytesIO(base64.b64decode(icon.split(",", 1)[1], validate=True)))
                    if image.format not in {"PNG", "JPEG", "WEBP"} or max(image.size) > 96:
                        raise ValueError("Icon exceeds supported size")
                    image.verify()
                except Exception:
                    raise serializers.ValidationError("This social icon is invalid. Upload it again.")
                link["icon"] = icon
            cleaned.append(link)
        return cleaned

    def validate(self, attrs):
        for field in self.url_fields:
            if field in attrs:
                attrs[field] = self._normalize_url(attrs[field])
        return attrs

    @staticmethod
    def _normalize_url(value):
        value = (value or "").strip()
        if not value:
            return ""
        if value.startswith(("http://", "https://")):
            return value
        if "." not in value.split("/")[0]:
            raise serializers.ValidationError("Enter a full link, such as https://facebook.com/yourpage.")
        return f"https://{value}"

    def get_profile_completion(self, instance):
        from .profile_completion import contractor_profile_completion
        return contractor_profile_completion(instance)

    def validate_mobile(self, value):
        return validate_account_mobile(value, exclude_pk=self.instance.user_id)

    def validate_pdf_custom_primary_color(self, value):
        return self._validate_pdf_color(value)

    def validate_pdf_custom_accent_color(self, value):
        return self._validate_pdf_color(value)

    def validate_pdf_custom_text_color(self, value):
        return self._validate_pdf_color(value)

    def validate_app_primary_color(self, value):
        return self._validate_pdf_color(value)

    def validate_app_accent_color(self, value):
        return self._validate_pdf_color(value)

    @staticmethod
    def _validate_pdf_color(value):
        import re
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise serializers.ValidationError("Enter a six-digit hex color, such as #395F6E.")
        return value.upper()

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", "")
        established = validated_data.get("business_established_date")
        if established:
            from django.utils import timezone
            today = timezone.localdate()
            validated_data["years_in_business"] = today.year - established.year - ((today.month, today.day) < (established.month, established.day))
        supplied = set(validated_data)
        workforce_supplied = "number_of_painters" in validated_data
        user = instance.user
        if "owner_name" in validated_data:
            parts = validated_data["owner_name"].strip().split(maxsplit=1)
            if parts:
                user.first_name = parts[0]
                user.last_name = parts[1] if len(parts) > 1 else ""
        if "mobile" in user_data:
            user.mobile = user_data["mobile"]
        if "email" in user_data:
            user.email = user_data["email"]
        if "profile_photo" in user_data:
            user.profile_photo = user_data["profile_photo"]
        if "profile_photo_position" in user_data:
            user.profile_photo_position = user_data["profile_photo_position"]
        if password:
            user.set_password(password)
        user.save()
        instance = super().update(instance, validated_data)
        mirror_contractor_to_provider(instance, supplied)
        # Keep the legacy company API writable. This is declared workforce,
        # never the count of registered employment relationships.
        if workforce_supplied:
            ProviderProfile.objects.filter(user=instance.user).update(team_size=instance.number_of_painters)
        return instance


class ContractorCompletedProjectSerializer(serializers.ModelSerializer):
    pincode = serializers.RegexField(r"^$|^[0-9]{6}$", required=False, allow_blank=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request:
            from .profile_images import public_profile_image_url
            data["photo"] = public_profile_image_url(request, instance.photo)
        return data

    class Meta:
        model = ContractorCompletedProject
        fields = ["id", "title", "apartment_community", "location", "address", "pincode", "description", "work_completed", "completed_on", "photo", "created_at"]
        read_only_fields = ["id", "created_at"]


class ProviderServiceClaimSerializer(serializers.ModelSerializer):
    work_description_name = serializers.CharField(source="work_description.name", read_only=True, default="")
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ProviderServiceClaim
        fields = ["id", "category", "category_name", "work_description", "work_description_name", "note", "is_active"]
        read_only_fields = ["id"]


class ProviderProfileSerializer(serializers.ModelSerializer):
    service_claims = ProviderServiceClaimSerializer(many=True, required=False)
    completion_percent = serializers.IntegerField(read_only=True)
    branding = serializers.SerializerMethodField()
    core_service_name = serializers.CharField(source="core_service.name", read_only=True, default="")
    additional_service_names = serializers.SerializerMethodField()
    is_employee = serializers.SerializerMethodField()

    class Meta:
        model = ProviderProfile
        fields = [
            "id",
            "core_service",
            "core_service_name",
            "additional_services",
            "additional_service_names",
            "service_claims",
            "headline",
            "about",
            "service_areas",
            "base_location",
            "years_in_business",
            "team_size",
            "workspace_name_override",
            "tagline",
            "accepts_subcontract_work",
            "network_opt_in",
            "is_draft",
            "is_published",
            "published_at",
            "brand_snapshot",
            "rating_average",
            "rating_count",
            "completed_work_orders",
            "completion_percent",
            "branding",
            "is_employee",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "published_at",
            "brand_snapshot",
            "rating_average",
            "rating_count",
            "completed_work_orders",
            "completion_percent",
            "created_at",
            "updated_at",
        ]

    def get_branding(self, obj):
        return obj.resolved_branding()

    def get_additional_service_names(self, obj):
        return list(obj.additional_services.values_list("name", flat=True))

    def get_is_employee(self, obj):
        return obj.user.role == BharathUser.Roles.PAINTER

    def validate(self, attrs):
        core = attrs.get("core_service", getattr(self.instance, "core_service", None))
        # A ManyRelatedManager is not a list, so an omitted field on a partial
        # update must be materialised before the membership checks below.
        if "additional_services" in attrs:
            additional = list(attrs["additional_services"] or [])
        elif self.instance is not None:
            additional = list(self.instance.additional_services.all())
        else:
            additional = []
        if core and additional and core in additional:
            raise serializers.ValidationError(
                {"additional_services": "The core service is already included."}
            )
        if core and not core.is_provider_selectable:
            raise serializers.ValidationError({"core_service": "This service cannot be chosen as a core service."})
        blocked = [service.name for service in additional if not service.is_provider_selectable]
        if blocked:
            raise serializers.ValidationError(
                {"additional_services": f"Not available as a service: {', '.join(blocked)}."}
            )
        offered = {service.pk for service in additional}
        if core:
            offered.add(core.pk)
        claims = attrs.get("service_claims")
        if claims is None and self.instance is not None:
            claims = [{"category": row.category, "work_description": row.work_description}
                      for row in self.instance.service_claims.select_related("category", "work_description")]
        seen = set()
        for claim in claims or []:
            category = claim["category"]
            work = claim.get("work_description")
            key = (category.pk, work.pk if work else None)
            if key in seen:
                raise serializers.ValidationError({"service_claims": "Duplicate sub-service selections are not allowed."})
            seen.add(key)
            if category.pk not in offered:
                raise serializers.ValidationError({"service_claims": "This service is not part of the offered services."})
            if work and work.service_category_id != category.pk:
                raise serializers.ValidationError({"service_claims": "The sub-service does not belong to this category."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        claims = validated_data.pop("service_claims", None)
        supplied = set(validated_data)
        if instance.user.role == BharathUser.Roles.CONTRACTOR:
            # Legacy provider clients may still send these aliases. Apply only
            # explicitly supplied values; PATCH omission must never reset them.
            contractor = ContractorProfile.objects.filter(user=instance.user).first()
            if contractor:
                changed = []
                for source, target in CONTRACTOR_OWNS.items():
                    if target in supplied:
                        setattr(contractor, source, validated_data[target])
                        changed.append(source)
                if changed:
                    contractor.save(update_fields=[*changed, "updated_at"])
        instance = super().update(instance, validated_data)
        if "team_size" in supplied:
            mirror_provider_to_contractor(instance)
        if claims is not None:
            instance.service_claims.all().delete()
            rows = [ProviderServiceClaim(provider=instance, **claim) for claim in claims]
            errors = []
            for row in rows:
                try:
                    # A Django ValidationError would surface as a 500, so an
                    # invalid claim is turned into a normal 400 here.
                    row.full_clean(exclude=["provider"])
                except DjangoValidationError as exc:
                    errors.extend(exc.messages)
            if errors:
                raise serializers.ValidationError({"service_claims": errors})
            ProviderServiceClaim.objects.bulk_create(rows)
        if instance.is_published and not instance.brand_snapshot:
            instance.brand_snapshot = instance.resolved_branding()
            instance.save(update_fields=["brand_snapshot", "updated_at"])
        return instance
