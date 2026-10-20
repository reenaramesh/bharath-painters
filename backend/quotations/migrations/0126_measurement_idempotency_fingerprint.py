from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0125_quotation_item_ordering")]

    operations = [
        migrations.AddField(model_name="propertyroom", name="idempotency_fingerprint", field=models.CharField(max_length=64, null=True, blank=True)),
        migrations.AddField(model_name="measurementsurface", name="idempotency_fingerprint", field=models.CharField(max_length=64, null=True, blank=True)),
    ]
