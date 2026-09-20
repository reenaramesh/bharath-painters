from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("jobs", "0007_painterseekingpost_city_pincode")]
    operations = [
        migrations.AddField(model_name="workschedulepainter", name="status", field=models.CharField(choices=[("ASSIGNED", "Awaiting painter response"), ("ACCEPTED", "Accepted"), ("REJECTED", "Rejected")], default="ASSIGNED", max_length=20)),
        migrations.AddField(model_name="workschedulepainter", name="wage_type", field=models.CharField(choices=[("DAILY", "Daily"), ("WEEKLY", "Weekly")], default="DAILY", max_length=20)),
        migrations.AddField(model_name="workschedulepainter", name="agreed_wage", field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
        migrations.AddField(model_name="workschedulepainter", name="painter_note", field=models.TextField(blank=True)),
        migrations.AddField(model_name="workschedulepainter", name="responded_at", field=models.DateTimeField(blank=True, null=True)),
    ]
