from django.db import migrations


def restore_active_leads(apps, schema_editor):
    Lead = apps.get_model("quotations", "Lead")
    FollowUp = apps.get_model("quotations", "CustomerFollowUp")
    # Old quotation signals archived all stages. Restore working records only;
    # preserve lost/cancelled history and all original references and events.
    Lead.objects.exclude(stage__in=("LOST", "CANCELLED", "COMPLETED")).update(archived_at=None)
    for lead in Lead.objects.filter(next_follow_up__isnull=False).iterator():
        if not FollowUp.objects.filter(opportunity_id=lead.pk, created_by_id=lead.contractor_id,
                                       customer_id=lead.customer_id, is_completed=False, next_follow_up__isnull=False).exists():
            FollowUp.objects.create(opportunity_id=lead.pk, created_by_id=lead.contractor_id,
                customer_id=lead.customer_id, follow_up_type="CALL", comment="Existing lead follow-up preserved", next_follow_up=lead.next_follow_up)
    Quote = apps.get_model("quotations", "Quotation")
    Invoice = apps.get_model("quotations", "Invoice")
    for lead in Lead.objects.filter(stage="COMPLETED", archived_at__isnull=False).iterator():
        work = Quote.objects.filter(lead_id=lead.pk, contractor_id=lead.contractor_id, customer_id=lead.customer_id,
                                    deleted_at__isnull=True, status="COMPLETED")
        invoices = Invoice.objects.filter(quotation__in=work, contractor_id=lead.contractor_id,
                                         customer_id=lead.customer_id).exclude(status="CANCELLED")
        if not work.exists() or invoices.count() < work.count() or any(i.grand_total > i.amount_paid for i in invoices):
            Lead.objects.filter(pk=lead.pk).update(archived_at=None)


class Migration(migrations.Migration):
    dependencies = [("quotations", "0129_lead_workspace_fields")]
    operations = [migrations.RunPython(restore_active_leads, migrations.RunPython.noop)]
