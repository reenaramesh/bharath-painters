from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("jobs", "0013_applicatorbooking_contractor_seen_response"),
    ]

    operations = [
        migrations.CreateModel(
            name="ApplicatorAvailabilityBlock",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("reason", models.CharField(blank=True, max_length=180)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("applicator", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applicator_availability_blocks", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("start_date", "end_date")},
        ),
    ]
