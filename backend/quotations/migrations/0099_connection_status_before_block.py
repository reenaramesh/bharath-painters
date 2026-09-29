from django.db import migrations, models


def restore_previous_status(apps, schema_editor):
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    Audit = apps.get_model("quotations", "CustomerConnectionAudit")
    actions = {
        "CONNECTION_REQUESTED": "PENDING",
        "CONNECTION_ACCEPTED": "CONNECTED",
        "CONNECTION_REJECTED": "REJECTED",
        "CONNECTION_DISCONNECTED": "DISCONNECTED",
        "CONNECTION_REQUEST_RESENT": "RECONNECT_PENDING",
    }
    for connection in Connection.objects.filter(status="BLOCKED"):
        previous = Audit.objects.filter(connection_id=connection.pk).exclude(action="CONTRACTOR_BLOCKED").order_by("-timestamp", "-pk").values_list("action", flat=True).first()
        connection.status_before_block = actions.get(previous) or (
            "DISCONNECTED" if connection.disconnected_at else
            "REJECTED" if connection.rejected_at else
            "CONNECTED" if connection.accepted_at else "PENDING"
        )
        connection.save(update_fields=["status_before_block"])


class Migration(migrations.Migration):
    dependencies = [("quotations", "0098_colour_comparison_draft")]

    operations = [
        migrations.AddField(
            model_name="contractorcustomerconnection",
            name="status_before_block",
            field=models.CharField(blank=True, choices=[("PENDING", "Pending"), ("CONNECTED", "Connected"), ("REJECTED", "Rejected"), ("RECONNECT_PENDING", "Reconnect pending"), ("DISCONNECTED", "Disconnected"), ("BLOCKED", "Blocked")], max_length=20),
        ),
        migrations.AlterField(
            model_name="customerconnectionaudit",
            name="action",
            field=models.CharField(choices=[("CONNECTION_REQUESTED", "Connection requested"), ("CONNECTION_ACCEPTED", "Connection accepted"), ("CONNECTION_REJECTED", "Connection rejected"), ("CONNECTION_DISCONNECTED", "Connection disconnected"), ("CONTRACTOR_BLOCKED", "Contractor blocked"), ("CONTRACTOR_UNBLOCKED", "Contractor unblocked"), ("CONNECTION_REQUEST_RESENT", "Connection request resent")], max_length=40),
        ),
        migrations.RunPython(restore_previous_status, migrations.RunPython.noop),
    ]
