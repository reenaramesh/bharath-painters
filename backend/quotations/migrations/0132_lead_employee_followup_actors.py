from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0131_followup_next_action"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="customerfollowup", name="performed_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="performed_customer_follow_ups", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="customerfollowup", name="completed_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="completed_customer_follow_ups", to=settings.AUTH_USER_MODEL)),
        migrations.AlterField(model_name="customerfollowup", name="outcome",
            field=models.CharField(blank=True, max_length=30, choices=[
                ("INTERESTED", "Interested"), ("QUOTATION_REQUIRED", "Quotation required"),
                ("CALL_LATER", "Call Later"), ("WAITING_DECISION", "Waiting for Decision"),
                ("REVISED_QUOTE", "Need Revised Quote"), ("NEGOTIATION", "Price Negotiation"),
                ("SITE_VISIT_REQUIRED", "Site Visit Required"), ("NOT_INTERESTED", "Not Interested"),
                ("COMPETITOR", "Competitor Selected"), ("NO_RESPONSE", "No Response"),
                ("WON", "Won"), ("LOST", "Lost"),
            ])),
    ]
