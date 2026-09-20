from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0049_archive_existing_completed_leads")]

    operations = [
        migrations.AlterField(
            model_name="lead",
            name="stage",
            field=models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("FOLLOW_UP", "Follow Up"), ("SITE_VISIT", "Site Visit"), ("QUOTATION", "Quotation"), ("NEGOTIATION", "Negotiation"), ("WON", "Won"), ("IN_PROGRESS", "Work In Progress"), ("COMPLETED", "Completed"), ("LOST", "Lost"), ("CANCELLED", "Cancelled")], default="NEW", max_length=20),
        ),
        migrations.AlterField(
            model_name="leadstagehistory",
            name="to_stage",
            field=models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("FOLLOW_UP", "Follow Up"), ("SITE_VISIT", "Site Visit"), ("QUOTATION", "Quotation"), ("NEGOTIATION", "Negotiation"), ("WON", "Won"), ("IN_PROGRESS", "Work In Progress"), ("COMPLETED", "Completed"), ("LOST", "Lost"), ("CANCELLED", "Cancelled")], max_length=20),
        ),
    ]
