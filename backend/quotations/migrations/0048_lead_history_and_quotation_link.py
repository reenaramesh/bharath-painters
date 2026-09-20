from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0047_service_request_support_seen_at")]

    operations = [
        migrations.AddField(
            model_name="lead",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="quotation",
            name="lead",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="quotations", to="quotations.lead"),
        ),
        migrations.CreateModel(
            name="LeadStageHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("from_stage", models.CharField(blank=True, max_length=20)),
                ("to_stage", models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("FOLLOW_UP", "Follow Up"), ("SITE_VISIT", "Site Visit"), ("QUOTATION", "Quotation"), ("NEGOTIATION", "Negotiation"), ("WON", "Won"), ("LOST", "Lost"), ("CANCELLED", "Cancelled")], max_length=20)),
                ("note", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("changed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("lead", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stage_history", to="quotations.lead")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
