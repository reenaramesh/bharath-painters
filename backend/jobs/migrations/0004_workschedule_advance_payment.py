from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("jobs", "0003_workschedule_reschedule_fields")]
    operations = [
        migrations.AddField(model_name="workschedule", name="advance_amount", field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="workschedule", name="payment_status", field=models.CharField(choices=[("NOT_REQUESTED", "Not requested"), ("AWAITING_PAYMENT", "Awaiting payment"), ("PENDING_CONFIRMATION", "Pending contractor confirmation"), ("CONFIRMED", "Payment confirmed")], default="NOT_REQUESTED", max_length=30)),
        migrations.AddField(model_name="workschedule", name="payment_mode", field=models.CharField(blank=True, max_length=20)),
        migrations.AddField(model_name="workschedule", name="payment_reference", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="workschedule", name="payment_note", field=models.TextField(blank=True)),
        migrations.AddField(model_name="workschedule", name="payment_submitted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="payment_confirmed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="workschedule", name="cancellation_reason", field=models.TextField(blank=True)),
    ]
