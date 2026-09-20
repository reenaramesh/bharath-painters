from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0026_jobapplication_cancellation_reassignment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="JobTransferRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("PENDING", "Pending approval"), ("ACCEPTED", "Accepted"), ("REJECTED", "Rejected"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("requested_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="job_transfer_requests", to=settings.AUTH_USER_MODEL)),
                ("source_application", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="transfer_requests", to="jobs.jobapplication")),
                ("target_job", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="incoming_transfer_requests", to="jobs.job")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
