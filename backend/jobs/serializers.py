from rest_framework import serializers

from .models import Job, JobApplication
from accounts.models import PainterProfile


class JobSerializer(serializers.ModelSerializer):

    contractor_name = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            "id",
            "contractor",
            "contractor_name",
            "title",
            "description",
            "service_type",
            "location",
            "city",
            "pincode",
            "state",
            "latitude",
            "longitude",
            "radius_km",
            "location_source",
            "job_type",
            "number_of_painters",
            "required_experience",
            "required_skills",
            "daily_wage",
            "weekly_wage",
            "start_date",
            "estimated_days",
            "status",
            "created_at",
        ]

        read_only_fields = [
            "contractor",
            "status",
            "created_at",
        ]

    def get_contractor_name(self, obj):
        return obj.contractor.get_full_name()


class JobApplicationSerializer(serializers.ModelSerializer):

    painter_name = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = [
            "id",
            "job",
            "painter",
            "painter_name",
            "message",
            "status",
            "applied_at",
        ]

        read_only_fields = [
            "painter",
            "status",
            "applied_at",
        ]

    def get_painter_name(self, obj):
        return obj.painter.get_full_name()
