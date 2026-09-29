from rest_framework import serializers
from .models import (
    BharathUser,
    PainterProfile,
    ContractorProfile,
    ContractorCompletedProject,
)
from .mobile import normalize_mobile, matching_mobile_users


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
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    company_name = serializers.CharField(required=False, allow_blank=True)
    owner_name = serializers.CharField(required=False)
    profile_completion = serializers.SerializerMethodField()

    class Meta:
        model = ContractorProfile
        fields = [
            "mobile", "email", "password", "profile_photo", "company_name", "owner_name", "profile_completion",
            "company_logo", "company_logo_shape", "pdf_color_template", "pdf_font_template",
            "pdf_custom_primary_color", "pdf_custom_accent_color", "pdf_custom_text_color",
            "app_primary_color", "app_accent_color",
            "office_address", "service_areas", "work_skills", "gst_number",
            "pan_number", "years_in_business", "number_of_painters",
            "default_measurement_unit",
            "quotation_terms_conditions", "quotation_prepared_by",
            "quotation_inspected_by", "quotation_work_duration",
            "quotation_payment_terms", "quotation_product_details",
            "quotation_work_procedures",
        ]
        read_only_fields = ["profile_completion"]

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

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", "")
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
        if password:
            user.set_password(password)
        user.save()
        return super().update(instance, validated_data)


class ContractorCompletedProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractorCompletedProject
        fields = ["id", "title", "apartment_community", "location", "address", "description", "work_completed", "photo", "created_at"]
        read_only_fields = ["id", "created_at"]
