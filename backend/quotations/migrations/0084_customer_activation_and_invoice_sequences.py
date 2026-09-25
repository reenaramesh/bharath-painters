from django.db import migrations, models
import django.db.models.deletion


def populate_invoice_relations(apps, schema_editor):
    Invoice = apps.get_model("quotations", "Invoice")
    for invoice in Invoice.objects.select_related("quotation").filter(quotation__isnull=False).iterator():
        invoice.customer_id = invoice.quotation.customer_id
        invoice.site_property_id = invoice.quotation.property_id
        invoice.tax_mode = "GST" if invoice.gst_percentage > 0 else "NON_GST"
        invoice.save(update_fields=("customer_id", "site_property_id", "tax_mode"))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0083_measurementsurfacetype")]

    operations = [
        migrations.AlterField(model_name="invoice", name="quotation", field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="invoice", to="quotations.quotation")),
        migrations.AddField(model_name="invoice", name="customer", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="invoices", to="quotations.customer")),
        migrations.AddField(model_name="invoice", name="site_property", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="invoices", to="quotations.property")),
        migrations.AddField(model_name="invoice", name="tax_mode", field=models.CharField(choices=[("GST", "With GST"), ("NON_GST", "Without GST")], default="NON_GST", max_length=10)),
        migrations.CreateModel(name="InvoiceNumberSequence", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("tax_mode", models.CharField(choices=[("GST", "With GST"), ("NON_GST", "Without GST")], max_length=10)), ("financial_year", models.CharField(max_length=9)), ("last_number", models.PositiveIntegerField(default=0)), ("updated_at", models.DateTimeField(auto_now=True))]),
        migrations.AddConstraint(model_name="invoicenumbersequence", constraint=models.UniqueConstraint(fields=("tax_mode", "financial_year"), name="unique_invoice_sequence_by_tax_fy")),
        migrations.RunPython(populate_invoice_relations, migrations.RunPython.noop),
    ]
