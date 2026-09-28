from rest_framework import serializers
from .models import (
    BharathUser,
    PainterProfile,
    ContractorProfile,
    ContractorCompletedProject,
)


class PainterRegistrationSerializer(serializers.ModelSerializer):

    first_name = serializers.CharField()
    last_name = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    experience_years = serializers.IntegerField()
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
            "first_name",
            "last_name",
            "profile_photo",
            "experience_years",
            "skills",
            "daily_wage",
            "weekly_wage",
            "preferred_locations",
        ]

    def create(self, validated_data):

        experience_years = validated_data.pop("experience_years")
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

    password = serializers.CharField(write_only=True)

    company_name = serializers.CharField()
    owner_name = serializers.CharField()
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

    def create(self, validated_data):

        company_name = validated_data.pop("company_name")
        owner_name = validated_data.pop("owner_name")
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

    class Meta:
        model = ContractorProfile
        fields = [
            "mobile", "email", "password", "profile_photo", "company_name", "owner_name",
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
        read_only_fields = ["company_name", "owner_name"]

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
