from django.db import migrations, models


def copy_existing_items(apps, schema_editor):
    Invoice = apps.get_model("quotations", "Invoice")
    for invoice in Invoice.objects.all().iterator():
        invoice.base_items = invoice.items
        invoice.save(update_fields=["base_items"])


class Migration(migrations.Migration):
    dependencies = [("quotations", "0053_mark_invoiced_quotations_converted")]
    operations = [
        migrations.AddField(model_name="invoice", name="base_items", field=models.JSONField(default=list)),
        migrations.AddField(model_name="invoice", name="measurement_adjustments", field=models.JSONField(default=list)),
        migrations.RunPython(copy_existing_items, migrations.RunPython.noop),
    ]
