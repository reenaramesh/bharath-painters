from django.db import migrations, models


def reset_old_responses(apps, schema_editor):
    Assignment = apps.get_model("jobs", "WorkSchedulePainter")
    Assignment.objects.exclude(status__in=("ASSIGNED", "IN_PROGRESS", "COMPLETED")).update(status="ASSIGNED")


class Migration(migrations.Migration):
    dependencies = [("jobs", "0009_contractorapplicatorteam")]
    operations = [
        migrations.RunPython(reset_old_responses, migrations.RunPython.noop),
        migrations.AlterField(model_name="workschedulepainter", name="status", field=models.CharField(choices=[("ASSIGNED", "Assigned"), ("IN_PROGRESS", "Work in progress"), ("COMPLETED", "Completed")], default="ASSIGNED", max_length=20)),
        migrations.AddField(model_name="workschedulepainter", name="work_started_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="workschedulepainter", name="work_completed_at", field=models.DateTimeField(blank=True, null=True)),
    ]
