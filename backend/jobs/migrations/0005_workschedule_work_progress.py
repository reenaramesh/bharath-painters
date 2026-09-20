from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("jobs", "0004_workschedule_advance_payment")]
    operations = [
        migrations.AddField(model_name="workschedule", name="work_started_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="work_completed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="customer_seen_update_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AlterField(model_name="workschedule", name="status", field=models.CharField(choices=[("PENDING", "Awaiting approval"), ("CONFIRMED", "Confirmed"), ("IN_PROGRESS", "Work in progress"), ("COMPLETED", "Completed"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=20)),
    ]
