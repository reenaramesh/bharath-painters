from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL), ("quotations", "0019_support_ticket")]
    operations = [
        migrations.CreateModel(
            name="MeasurementAccessRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("FRESH_REQUESTED", "Fresh Measurement Requested"), ("REJECTED", "Rejected")], default="PENDING", max_length=25)),
                ("request_message", models.TextField(blank=True)),
                ("customer_note", models.TextField(blank=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="measurement_access_requests", to="quotations.customer")),
                ("requesting_contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="measurement_access_requests", to=settings.AUTH_USER_MODEL)),
                ("source_property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="measurement_access_requests", to="quotations.property")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
