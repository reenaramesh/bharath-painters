from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("jobs", "0001_initial"), ("quotations", "0021_quotation_customer_response"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="WorkSchedule", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("proposed_start_date", models.DateField()), ("proposed_end_date", models.DateField()),
            ("customer_accepted", models.BooleanField(default=False)), ("contractor_accepted", models.BooleanField(default=False)),
            ("status", models.CharField(choices=[("PENDING", "Awaiting approval"), ("CONFIRMED", "Confirmed"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=20)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("proposed_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="work_schedule_proposals", to=settings.AUTH_USER_MODEL)),
            ("quotation", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="work_schedule", to="quotations.quotation")),
        ]),
        migrations.CreateModel(name="WorkSchedulePainter", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("assigned_at", models.DateTimeField(auto_now_add=True)),
            ("painter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="scheduled_work", to=settings.AUTH_USER_MODEL)),
            ("schedule", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="painter_assignments", to="jobs.workschedule")),
        ], options={"unique_together": {("schedule", "painter")}}),
    ]
