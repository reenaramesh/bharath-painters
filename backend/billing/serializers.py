from rest_framework import serializers
from .models import BillingPlan


class BillingPlanSerializer(serializers.ModelSerializer):
    features_list = serializers.SerializerMethodField(read_only=True)
    discounted_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = BillingPlan
        fields = ("id", "name", "audience", "billing_cycle", "price", "discount_percentage", "discounted_price", "validity", "job_post_limit", "quotation_limit", "employee_limit", "applicator_access", "measurement_access", "register_applicator_access", "ratings_reviews_access", "work_schedules_access", "seeking_applicators_access", "property_creation_access", "messages_access", "job_seeking_post_limit", "contractor_job_access", "contractor_visibility", "booking_requests", "availability_calendar", "location_limit", "features", "features_list", "is_active", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

    def get_features_list(self, obj):
        return [line.strip() for line in obj.features.splitlines() if line.strip()]

    def validate(self, attrs):
        discount = attrs.get("discount_percentage", getattr(self.instance, "discount_percentage", 0))
        if discount < 0 or discount > 100:
            raise serializers.ValidationError({"discount_percentage": "Discount must be between 0% and 100%."})
        audience = attrs.get("audience", getattr(self.instance, "audience", None))
        if audience == BillingPlan.Audience.PAINTER:
            attrs["job_post_limit"] = None
            attrs["quotation_limit"] = None
            attrs["employee_limit"] = None
            attrs["applicator_access"] = BillingPlan.ApplicatorAccess.NONE
            attrs["measurement_access"] = False
            attrs["register_applicator_access"] = False
            attrs["ratings_reviews_access"] = False
            attrs["work_schedules_access"] = False
            attrs["seeking_applicators_access"] = False
            attrs["property_creation_access"] = False
            attrs["messages_access"] = False
        elif audience == BillingPlan.Audience.CONTRACTOR:
            attrs["job_seeking_post_limit"] = None
            attrs["contractor_job_access"] = False
            attrs["contractor_visibility"] = False
            attrs["booking_requests"] = False
            attrs["availability_calendar"] = False
            attrs["location_limit"] = None
        return attrs
