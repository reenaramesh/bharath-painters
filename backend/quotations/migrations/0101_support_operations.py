from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0028_support_role"),
        ("quotations", "0100_release_cancelled_customer_mobiles"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation", name="deleted_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AlterField(
            model_name="supportticket", name="category",
            field=models.CharField(max_length=20, default="OTHER", choices=[
                ("ACCOUNT", "Account and sign-in"), ("DATA", "Data correction or recovery"),
                ("MEASUREMENT", "Area calculation"), ("INVOICE", "Invoice or payment"),
                ("MESSAGES", "Messages and safety"), ("SERVICE", "Service Issue"),
                ("QUOTATION", "Quotation"), ("BILLING", "Billing"),
                ("QUALITY", "Quality Complaint"), ("SCHEDULE", "Schedule"),
                ("OTHER", "Other"),
            ]),
        ),
        migrations.AlterField(
            model_name="supportticket", name="status",
            field=models.CharField(max_length=20, default="OPEN", choices=[
                ("OPEN", "Open"), ("IN_PROGRESS", "In Progress"),
                ("NEEDS_ADMIN", "Needs administrator"),
                ("RESOLVED", "Resolved"), ("CLOSED", "Closed"),
            ]),
        ),
        migrations.AddField(
            model_name="supportticket", name="assigned_to",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_support_tickets", null=True, blank=True,
            ),
        ),
        migrations.CreateModel(
            name="SupportActionLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=60)),
                ("target_type", models.CharField(max_length=30)),
                ("target_id", models.PositiveIntegerField()),
                ("reason", models.TextField()),
                ("before", models.JSONField(default=dict)),
                ("after", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.PROTECT, related_name="support_actions")),
                ("ticket", models.ForeignKey(to="quotations.supportticket", on_delete=django.db.models.deletion.PROTECT, related_name="actions", null=True, blank=True)),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
