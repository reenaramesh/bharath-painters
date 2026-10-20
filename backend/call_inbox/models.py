from django.conf import settings
from django.db import models


class CallInboxEvent(models.Model):
    class NameSource(models.TextChoices):
        UNKNOWN = "UNKNOWN", "Unknown"
        PHONE_CONTACTS = "PHONE_CONTACTS", "Phone contacts"
        USER_ENTRY = "USER_ENTRY", "User entry"
        AUTHORIZED_PROVIDER = "AUTHORIZED_PROVIDER", "Authorized provider"

    class CallStatus(models.TextChoices):
        ANSWERED = "ANSWERED", "Answered"
        MISSED = "MISSED", "Missed"
        REJECTED = "REJECTED", "Rejected"
        UNKNOWN = "UNKNOWN", "Unknown"

    class CaptureSource(models.TextChoices):
        MANUAL = "MANUAL", "Manual entry"
        ANDROID = "ANDROID", "Android companion"

    class ReviewStatus(models.TextChoices):
        PENDING = "PENDING", "Pending approval"
        MATCHED = "MATCHED", "Existing customer"
        CUSTOMER_LINKED = "CUSTOMER_LINKED", "Added to customer"
        LEAD_CREATED = "LEAD_CREATED", "Lead created"
        DISMISSED = "DISMISSED", "Dismissed"
        BLOCKED = "BLOCKED", "Blocked caller"

    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="call_inbox_events")
    phone_number = models.CharField(max_length=32)
    normalized_mobile = models.CharField(max_length=16)
    caller_name = models.CharField(max_length=150, blank=True)
    name_source = models.CharField(max_length=24, choices=NameSource.choices, default=NameSource.UNKNOWN)
    occurred_at = models.DateTimeField()
    call_status = models.CharField(max_length=12, choices=CallStatus.choices, blank=True)
    capture_source = models.CharField(max_length=12, choices=CaptureSource.choices, default=CaptureSource.MANUAL)
    idempotency_key = models.CharField(max_length=128)
    matched_customer = models.ForeignKey("quotations.Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="call_events")
    created_lead = models.ForeignKey("quotations.Lead", on_delete=models.SET_NULL, null=True, blank=True, related_name="source_call_events")
    booked_follow_up = models.OneToOneField("quotations.CustomerFollowUp", on_delete=models.SET_NULL, null=True, blank=True, related_name="source_call_event")
    review_status = models.CharField(max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at", "-id")
        constraints = [models.UniqueConstraint(fields=("contractor", "idempotency_key"), name="call_event_contractor_idempotency")]
        indexes = [models.Index(fields=("contractor", "occurred_at"), name="call_event_owner_date"), models.Index(fields=("contractor", "normalized_mobile"), name="call_event_owner_phone")]


class BlockedCaller(models.Model):
    contractor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blocked_callers")
    normalized_mobile = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("contractor", "normalized_mobile"), name="blocked_caller_owner_phone")]
