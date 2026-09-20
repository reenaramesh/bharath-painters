from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Lead, LeadStageHistory, Quotation, ServiceRequest


QUOTATION_TO_LEAD = {
    Quotation.Status.DRAFT: (Lead.Stage.QUOTATION, "Quotation prepared"),
    Quotation.Status.SENT: (Lead.Stage.NEGOTIATION, "Quotation sent to customer"),
    Quotation.Status.VIEWED: (Lead.Stage.NEGOTIATION, "Quotation viewed by customer"),
    Quotation.Status.REVISION_REQUESTED: (Lead.Stage.NEGOTIATION, "Quotation revision requested"),
    Quotation.Status.ACCEPTED: (Lead.Stage.WON, "Quotation accepted — lead won"),
    Quotation.Status.SCHEDULED: (Lead.Stage.WON, "Work scheduled"),
    Quotation.Status.CONVERTED: (Lead.Stage.WON, "Quotation converted to project"),
    Quotation.Status.IN_PROGRESS: (Lead.Stage.IN_PROGRESS, "Work started"),
    Quotation.Status.COMPLETED: (Lead.Stage.COMPLETED, "Work completed — lifecycle finished"),
    Quotation.Status.REJECTED: (Lead.Stage.LOST, "Quotation rejected — lead lost"),
    Quotation.Status.EXPIRED: (Lead.Stage.LOST, "Quotation expired — lead lost"),
    Quotation.Status.CANCELLED: (Lead.Stage.CANCELLED, "Quotation cancelled"),
}


@receiver(post_save, sender=Quotation)
def sync_linked_lead(sender, instance, **kwargs):
    if not instance.lead_id or instance.status not in QUOTATION_TO_LEAD:
        return
    lead = Lead.objects.filter(pk=instance.lead_id).first()
    if not lead:
        return
    next_stage, note = QUOTATION_TO_LEAD[instance.status]
    previous_stage = lead.stage
    if previous_stage == next_stage and lead.stage_history.filter(note__startswith=note).exists():
        return
    lead.stage = next_stage
    lead.archived_at = lead.archived_at or timezone.now()
    lead.save(update_fields=("stage", "archived_at", "updated_at"))
    LeadStageHistory.objects.create(
        lead=lead, from_stage=previous_stage, to_stage=next_stage,
        note=f"{note}: {instance.quotation_number}",
    )
    if lead.service_request_id:
        request_status = {
            Lead.Stage.QUOTATION: ServiceRequest.Status.QUOTATION,
            Lead.Stage.NEGOTIATION: ServiceRequest.Status.QUOTATION,
            Lead.Stage.WON: ServiceRequest.Status.ACCEPTED,
            Lead.Stage.IN_PROGRESS: ServiceRequest.Status.ACCEPTED,
            Lead.Stage.COMPLETED: ServiceRequest.Status.COMPLETED,
            Lead.Stage.LOST: ServiceRequest.Status.CANCELLED,
            Lead.Stage.CANCELLED: ServiceRequest.Status.CANCELLED,
        }[next_stage]
        ServiceRequest.objects.filter(pk=lead.service_request_id).update(
            status=request_status, contractor_seen_at=timezone.now(), customer_seen_at=None
        )
