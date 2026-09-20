from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("jobs", "0002_workschedule_workschedulepainter")]
    operations = [
        migrations.AddField(model_name="workschedule", name="previous_start_date", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="previous_end_date", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="reschedule_reason", field=models.TextField(blank=True)),
    ]
