from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0025_job_radius_location"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="jobapplication",
            name="status",
            field=models.CharField(
                choices=[
                    ("APPLIED", "Applied"),
                    ("ACCEPTED", "Accepted"),
                    ("CANCELLATION_REQUESTED", "Cancellation requested"),
                    ("CANCELLED", "Cancelled"),
                    ("REJECTED", "Rejected"),
                    ("WITHDRAWN", "Withdrawn"),
                    ("COMPLETED", "Completed"),
                ],
                default="APPLIED",
                max_length=30,
            ),
        ),
        migrations.AddField(model_name="jobapplication", name="cancellation_reason", field=models.TextField(blank=True)),
        migrations.AddField(model_name="jobapplication", name="cancellation_requested_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="jobapplication", name="cancelled_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(
            model_name="jobapplication",
            name="cancelled_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cancelled_job_applications", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(model_name="jobapplication", name="contractor_rating", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="jobapplication", name="contractor_review", field=models.TextField(blank=True)),
        migrations.AddField(model_name="jobapplication", name="painter_rating", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="jobapplication", name="painter_review", field=models.TextField(blank=True)),
        migrations.AddField(
            model_name="jobapplication",
            name="reassigned_from",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reassignments", to="jobs.jobapplication"),
        ),
    ]
