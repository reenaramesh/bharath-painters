from django.db import migrations, models


def backfill(apps, schema_editor):
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    for connection in Connection.objects.all().iterator():
        connection.last_request_at = connection.requested_at
        connection.accepted_at = connection.approved_at or connection.connected_at
        connection.save(update_fields=("last_request_at", "accepted_at"))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0094_chat_message_forward")]

    operations = [
        migrations.AddField(model_name="contractorcustomerconnection", name="accepted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="contractorcustomerconnection", name="last_request_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="contractorcustomerconnection", name="request_count", field=models.PositiveIntegerField(default=1)),
        migrations.AlterField(model_name="contractorcustomerconnection", name="status", field=models.CharField(choices=[("PENDING", "Pending"), ("CONNECTED", "Connected"), ("REJECTED", "Rejected"), ("RECONNECT_PENDING", "Reconnect pending"), ("DISCONNECTED", "Disconnected"), ("BLOCKED", "Blocked")], default="PENDING", max_length=20)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
