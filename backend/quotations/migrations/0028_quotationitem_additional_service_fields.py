from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0027_quotation_quotation_type")]
    operations = [
        migrations.AddField(model_name="quotationitem", name="is_additional_service", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="quotationitem", name="custom_unit", field=models.CharField(blank=True, max_length=40)),
    ]
