from django.db import migrations, models
import django.db.models.deletion


def backfill_work_history(apps, schema_editor):
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    WorkHistory = apps.get_model("quotations", "CustomerWorkHistory")
    for item in WorkHistory.objects.filter(connection__isnull=True).select_related("customer", "property"):
        connection_id = item.property.connection_id if item.property_id else None
        if not connection_id and item.customer.contractor_id:
            connection_id = Connection.objects.filter(
                customer_id=item.customer_id,
                contractor_id=item.customer.contractor_id,
            ).values_list("id", flat=True).first()
        if connection_id:
            item.connection_id = connection_id
            item.save(update_fields=("connection",))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0073_connection_scoped_customer_crm")]

    operations = [
        migrations.AddField(
            model_name="customerworkhistory",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="work_history", to="quotations.contractorcustomerconnection"),
        ),
        migrations.RunPython(backfill_work_history, migrations.RunPython.noop),
    ]
