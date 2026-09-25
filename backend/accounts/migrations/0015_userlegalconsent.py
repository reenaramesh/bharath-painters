from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0014_contractorprofile_company_logo_shape"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserLegalConsent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("policy_version", models.CharField(max_length=30)),
                ("role_at_acceptance", models.CharField(choices=[("PAINTER", "Painter"), ("CONTRACTOR", "Contractor"), ("CUSTOMER", "Customer"), ("ADMIN", "Admin")], max_length=20)),
                ("terms_hash", models.CharField(max_length=64)),
                ("privacy_hash", models.CharField(max_length=64)),
                ("terms_accepted", models.BooleanField(default=False)),
                ("privacy_notice_acknowledged", models.BooleanField(default=False)),
                ("document_scrolled", models.BooleanField(default=False)),
                ("acceptance_method", models.CharField(default="REGISTRATION_CHECKBOX", max_length=40)),
                ("ip_address", models.CharField(blank=True, max_length=45)),
                ("user_agent", models.TextField(blank=True)),
                ("accepted_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="legal_consents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-accepted_at",)},
        ),
        migrations.AddConstraint(
            model_name="userlegalconsent",
            constraint=models.UniqueConstraint(fields=("user", "policy_version"), name="unique_user_legal_policy_acceptance"),
        ),
    ]
