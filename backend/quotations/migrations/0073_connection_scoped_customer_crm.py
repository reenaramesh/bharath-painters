from django.db import migrations, models


def copy_legacy_crm_values(apps, schema_editor):
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    for connection in Connection.objects.select_related("customer"):
        customer = connection.customer
        connection.customer_status = customer.status
        connection.customer_source = customer.source
        connection.customer_client_type = customer.client_type
        connection.requirement = customer.requirement
        connection.internal_notes = customer.notes
        connection.next_follow_up = customer.next_follow_up
        connection.save(update_fields=(
            "customer_status", "customer_source", "customer_client_type",
            "requirement", "internal_notes", "next_follow_up",
        ))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0072_scope_requests_and_tickets_to_connection")]

    operations = [
        migrations.AddField(model_name="contractorcustomerconnection", name="customer_status", field=models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("FOLLOW_UP", "Follow Up"), ("SITE_VISIT", "Site Visit"), ("QUOTATION_SENT", "Quotation Sent"), ("NEGOTIATION", "Negotiation"), ("WON", "Won"), ("LOST", "Lost"), ("CANCELLED", "Cancelled")], default="NEW", max_length=30)),
        migrations.AddField(model_name="contractorcustomerconnection", name="customer_source", field=models.CharField(choices=[("WEBSITE", "Website"), ("PHONE", "Phone"), ("WHATSAPP", "WhatsApp"), ("FACEBOOK", "Facebook"), ("INSTAGRAM", "Instagram"), ("GOOGLE", "Google"), ("REFERRAL", "Referral"), ("WALK_IN", "Walk In"), ("OTHER", "Other")], default="OTHER", max_length=20)),
        migrations.AddField(model_name="contractorcustomerconnection", name="customer_client_type", field=models.CharField(blank=True, choices=[("HOMEOWNER", "Homeowner"), ("TENANT", "Tenant"), ("COMPANY", "Company"), ("PROPERTY_MANAGER", "Property Manager"), ("INTERIOR_DESIGNER", "Interior Designer"), ("ARCHITECT", "Architect"), ("BUILDER", "Builder"), ("REAL_ESTATE_AGENT", "Real Estate Agent"), ("OTHER", "Other")], max_length=30)),
        migrations.AddField(model_name="contractorcustomerconnection", name="requirement", field=models.TextField(blank=True)),
        migrations.AddField(model_name="contractorcustomerconnection", name="internal_notes", field=models.TextField(blank=True)),
        migrations.AddField(model_name="contractorcustomerconnection", name="next_follow_up", field=models.DateTimeField(blank=True, null=True)),
        migrations.RunPython(copy_legacy_crm_values, migrations.RunPython.noop),
    ]
