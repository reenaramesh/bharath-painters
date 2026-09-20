from django.db import migrations, models
import django.db.models.deletion


def backfill_connections(apps, schema_editor):
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    ServiceRequest = apps.get_model("quotations", "ServiceRequest")
    SupportTicket = apps.get_model("quotations", "SupportTicket")

    for item in ServiceRequest.objects.filter(connection__isnull=True).select_related("customer"):
        contractor_id = None
        try:
            contractor_id = item.lead.contractor_id
        except Exception:
            contractor_id = item.customer.contractor_id
        if contractor_id:
            connection = Connection.objects.filter(
                customer_id=item.customer_id,
                contractor_id=contractor_id,
            ).first()
            if connection:
                item.connection_id = connection.id
                item.save(update_fields=("connection",))

    for item in SupportTicket.objects.filter(connection__isnull=True, customer__isnull=False).select_related("customer", "requester"):
        contractor_id = None
        if item.requester_id and getattr(item.requester, "role", "") == "CONTRACTOR":
            contractor_id = item.requester_id
        else:
            contractor_id = item.customer.contractor_id
        if contractor_id:
            connection = Connection.objects.filter(
                customer_id=item.customer_id,
                contractor_id=contractor_id,
            ).first()
            if connection:
                item.connection_id = connection.id
                item.save(update_fields=("connection",))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0071_backfill_relationship_scope")]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="service_requests", to="quotations.contractorcustomerconnection"),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="support_tickets", to="quotations.contractorcustomerconnection"),
        ),
        migrations.RunPython(backfill_connections, migrations.RunPython.noop),
    ]
