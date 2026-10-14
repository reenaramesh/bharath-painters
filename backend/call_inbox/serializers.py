from rest_framework import serializers

from accounts.mobile import normalize_mobile
from .models import CallInboxEvent


class CallEventCreateSerializer(serializers.ModelSerializer):
    phone_number = serializers.CharField(max_length=32)

    class Meta:
        model = CallInboxEvent
        fields = ("phone_number", "caller_name", "name_source", "occurred_at", "call_status", "capture_source", "idempotency_key")

    def validate_phone_number(self, value):
        if not normalize_mobile(value):
            raise serializers.ValidationError("Enter a valid phone number with country code for non-Indian numbers.")
        return value.strip()

    def validate_caller_name(self, value):
        return value.strip()[:150]

    def validate_name_source(self, value):
        request = self.context.get("request")
        if value == CallInboxEvent.NameSource.AUTHORIZED_PROVIDER and not getattr(request.user, "is_staff", False):
            raise serializers.ValidationError("Authorized provider attribution requires a trusted integration account.")
        return value

    def validate(self, attrs):
        if not attrs.get("caller_name"):
            attrs["name_source"] = CallInboxEvent.NameSource.UNKNOWN
        if attrs.get("capture_source") == CallInboxEvent.CaptureSource.ANDROID and attrs.get("name_source") == CallInboxEvent.NameSource.AUTHORIZED_PROVIDER:
            raise serializers.ValidationError({"name_source": "Android capture cannot assert an authorized provider name."})
        return attrs
