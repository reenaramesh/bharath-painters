from django.db import migrations


def mark_invoiced_quotations_converted(apps, schema_editor):
    Quotation = apps.get_model("quotations", "Quotation")
    Invoice = apps.get_model("quotations", "Invoice")
    invoiced_ids = Invoice.objects.values_list("quotation_id", flat=True)
    Quotation.objects.filter(id__in=invoiced_ids).exclude(status="CONVERTED").update(status="CONVERTED")


def preserve_status(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("quotations", "0052_invoice")]

    operations = [migrations.RunPython(mark_invoiced_quotations_converted, preserve_status)]
