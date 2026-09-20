from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0018_service_request")]

    operations = [
        migrations.CreateModel(
            name="SupportTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(choices=[("SERVICE", "Service Issue"), ("QUOTATION", "Quotation"), ("BILLING", "Billing"), ("QUALITY", "Quality Complaint"), ("SCHEDULE", "Schedule"), ("OTHER", "Other")], default="OTHER", max_length=20)),
                ("priority", models.CharField(choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("URGENT", "Urgent")], default="MEDIUM", max_length=10)),
                ("subject", models.CharField(max_length=180)),
                ("description", models.TextField()),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("IN_PROGRESS", "In Progress"), ("RESOLVED", "Resolved"), ("CLOSED", "Closed")], default="OPEN", max_length=20)),
                ("contractor_response", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="support_tickets", to="quotations.customer")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
