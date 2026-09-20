from django.db import migrations, models

def sync_confirmed_schedules(apps, schema_editor):
    WorkSchedule = apps.get_model("jobs", "WorkSchedule")
    Quotation = apps.get_model("quotations", "Quotation")
    quotation_ids = WorkSchedule.objects.filter(status="CONFIRMED").values_list("quotation_id", flat=True)
    Quotation.objects.filter(id__in=quotation_ids, status="ACCEPTED").update(status="SCHEDULED")

class Migration(migrations.Migration):
    dependencies = [("quotations", "0021_quotation_customer_response"), ("jobs", "0004_workschedule_advance_payment")]
    operations = [
        migrations.AlterField(
            model_name="quotation", name="status",
            field=models.CharField(choices=[("DRAFT", "Draft"), ("SENT", "Sent"), ("VIEWED", "Viewed"), ("ACCEPTED", "Accepted"), ("SCHEDULED", "Scheduled"), ("REJECTED", "Rejected"), ("EXPIRED", "Expired"), ("CONVERTED", "Converted"), ("CANCELLED", "Cancelled"), ("REVISION_REQUESTED", "Revision Requested")], default="DRAFT", max_length=20),
        ),
        migrations.RunPython(sync_confirmed_schedules, migrations.RunPython.noop),
    ]
