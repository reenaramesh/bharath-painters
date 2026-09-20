from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0038_measurementaccessrequest_target_property")]

    operations = [
        migrations.AddField(model_name="quotation", name="prepared_by", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotation", name="inspected_by", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotation", name="payment_terms", field=models.TextField(blank=True)),
        migrations.AddField(model_name="quotation", name="product_details", field=models.TextField(blank=True)),
        migrations.AddField(model_name="quotation", name="work_duration", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotation", name="work_procedures", field=models.TextField(blank=True)),
    ]
