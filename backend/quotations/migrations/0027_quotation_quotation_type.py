from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0026_customer_bharath_id")]
    operations = [
        migrations.AddField(
            model_name="quotation",
            name="quotation_type",
            field=models.CharField(
                choices=[
                    ("MEASUREMENT", "Measurement based"),
                    ("MANUAL_LUMPSUM", "Manual lump sum"),
                ],
                default="MEASUREMENT",
                max_length=20,
            ),
        ),
    ]
