from django.db import migrations


def archive_existing_leads(apps, schema_editor):
    Lead = apps.get_model("quotations", "Lead")
    LeadStageHistory = apps.get_model("quotations", "LeadStageHistory")
    completed = ("QUOTATION", "WON", "LOST", "CANCELLED")
    for lead in Lead.objects.filter(stage__in=completed, archived_at__isnull=True):
        lead.archived_at = lead.updated_at
        lead.save(update_fields=("archived_at",))
        LeadStageHistory.objects.get_or_create(
            lead_id=lead.id,
            to_stage=lead.stage,
            defaults={"from_stage": "", "note": "Existing lead moved to history"},
        )


class Migration(migrations.Migration):
    dependencies = [("quotations", "0048_lead_history_and_quotation_link")]

    operations = [migrations.RunPython(archive_existing_leads, migrations.RunPython.noop)]
