from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db import transaction
from django.utils import timezone

from .models import (
    Lead, LeadStageHistory, Quotation, ServiceRequest,
    PropertyMeasurement, PropertyRoom, MeasurementSurface, MeasurementOpening,
    PortalNotification, Property, PropertyContact, CustomerFollowUp, Invoice, ProjectReceipt, SiteVisit,
)


@receiver(post_save, sender=PortalNotification)
def deliver_browser_push(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    from .web_push import send_portal_push
    transaction.on_commit(lambda: send_portal_push(instance.pk))


@receiver(post_save, sender=Property)
def create_primary_property_contact(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    PropertyContact.objects.get_or_create(
        property_id=instance.pk,
        customer_id=instance.customer_id,
        defaults={
            "role": PropertyContact.Role.PRIMARY,
            "is_primary": True,
            "access_level": PropertyContact.AccessLevel.FULL_ACCESS,
        },
    )


QUOTATION_TO_LEAD = {
    "DRAFT": ("QUOTATION", "Quotation prepared"),
    "SENT": ("QUOTATION", "Quotation sent to customer"),
    "VIEWED": ("QUOTATION", "Quotation viewed by customer"),
    "REVISION_REQUESTED": ("NEGOTIATION", "Quotation revision requested"),
    "ACCEPTED": ("WON", "Quotation accepted"),
    "SCHEDULED": ("WON", "Work scheduled"),
    "CONVERTED": ("WON", "Quotation converted to project"),
    "IN_PROGRESS": ("IN_PROGRESS", "Work started"),
    "COMPLETED": ("COMPLETED", "Work completed"),
    "REJECTED": ("NEGOTIATION", "Quotation rejected; follow-up required"),
    "EXPIRED": ("NEGOTIATION", "Quotation expired; follow-up required"),
    "CANCELLED": ("NEGOTIATION", "Quotation cancelled; review enquiry"),
}


@receiver(post_save, sender=Quotation)
@transaction.atomic
def sync_linked_lead(sender, instance, raw=False, **kwargs):
    if raw or not instance.lead_id or instance.status not in QUOTATION_TO_LEAD:
        return
    lead = Lead.objects.select_for_update().filter(pk=instance.lead_id, contractor_id=instance.contractor_id, customer_id=instance.customer_id).first()
    if not lead or lead.stage in {"LOST", "CANCELLED"}:
        return
    from .lead_workflow import workflow_data
    next_stage, note = QUOTATION_TO_LEAD[instance.status]
    workflow = workflow_data(lead)
    if workflow["workflow_stage"] in {"WON", "IN_PROGRESS", "COMPLETED"}:
        next_stage = workflow["workflow_stage"]
    full_note = f"{note}: {instance.quotation_number}"
    previous_stage = lead.stage
    if previous_stage == next_stage and lead.stage_history.filter(note=full_note).exists():
        return
    lead.stage = next_stage
    lead.archived_at = timezone.now() if workflow["is_closed"] else None
    lead.save(update_fields=("stage", "archived_at", "updated_at"))
    LeadStageHistory.objects.create(lead=lead, from_stage=previous_stage, to_stage=next_stage, note=full_note)
    if lead.service_request_id:
        mapping = {"QUOTATION": "QUOTATION", "NEGOTIATION": "QUOTATION", "WON": "ACCEPTED", "IN_PROGRESS": "ACCEPTED", "COMPLETED": "COMPLETED"}
        ServiceRequest.objects.filter(pk=lead.service_request_id, connection__contractor_id=lead.contractor_id).update(status=mapping.get(next_stage, "REVIEWING"), contractor_seen_at=timezone.now(), customer_seen_at=None)


@receiver(post_save, sender=CustomerFollowUp)
@receiver(post_delete, sender=CustomerFollowUp)
def sync_lead_followup(sender, instance, raw=False, **kwargs):
    if not raw and instance.opportunity_id:
        from .lead_workflow import sync_next_follow_up
        sync_next_follow_up(instance.opportunity_id)
        if sender is CustomerFollowUp and kwargs.get("created") is False:
            lead = Lead.objects.filter(pk=instance.opportunity_id, contractor_id=instance.created_by_id, customer_id=instance.customer_id).first()
            if lead:
                LeadStageHistory.objects.create(lead=lead, from_stage=lead.stage, to_stage=lead.stage,
                    note=("Follow-up completed" if instance.is_completed else "Follow-up updated") + f": #{instance.pk}",
                    changed_by=getattr(instance, "_lead_change_actor", None) or instance.created_by)


@receiver(post_save, sender=Invoice)
@receiver(post_save, sender=ProjectReceipt)
def sync_lead_settlement(sender, instance, raw=False, **kwargs):
    if raw or not instance.quotation_id:
        return
    quote = instance.quotation
    if not quote.lead_id or quote.contractor_id != instance.contractor_id:
        return
    lead = Lead.objects.filter(pk=quote.lead_id, contractor_id=instance.contractor_id, customer_id=quote.customer_id).first()
    if lead:
        from .lead_workflow import workflow_data
        closed = workflow_data(lead)["is_closed"]
        Lead.objects.filter(pk=lead.pk).update(archived_at=(lead.archived_at or timezone.now()) if closed else None)


@receiver(post_save, sender=SiteVisit)
def sync_lead_visit(sender, instance, raw=False, **kwargs):
    if raw:
        return
    lead = Lead.objects.filter(pk=instance.opportunity_id, contractor_id=instance.contractor_id, customer_id=instance.customer_id).first()
    if lead and lead.stage in {"NEW", "CONTACTED", "FOLLOW_UP"} and instance.status in {"SCHEDULED", "RESCHEDULED"}:
        previous = lead.stage
        lead.stage, lead.archived_at = "SITE_VISIT", None
        lead.save(update_fields=("stage", "archived_at", "updated_at"))
        LeadStageHistory.objects.create(lead=lead, from_stage=previous, to_stage=lead.stage, note="Site visit scheduled", changed_by=instance.created_by)


@receiver(post_save, sender=PropertyRoom)
@receiver(post_delete, sender=PropertyRoom)
@receiver(post_save, sender=MeasurementSurface)
@receiver(post_delete, sender=MeasurementSurface)
@receiver(post_save, sender=MeasurementOpening)
@receiver(post_delete, sender=MeasurementOpening)
def unpublish_edited_measurement(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return
    if sender is MeasurementOpening:
        record_id = MeasurementSurface.objects.filter(pk=instance.surface_id).values_list("measurement_record_id", flat=True).first()
    else:
        record_id = instance.measurement_record_id
    if record_id:
        PropertyMeasurement.objects.filter(pk=record_id, submitted_at__isnull=False).update(submitted_at=None)
