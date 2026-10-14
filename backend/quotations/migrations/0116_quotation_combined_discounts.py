from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0115_quotation_line_discounts")]
    operations = [
        migrations.AlterField(
            model_name="quotation",
            name="discount_mode",
            field=models.CharField(
                choices=[("OVERALL", "Overall"), ("LINE", "Per line"), ("BOTH", "Line and overall")],
                default="OVERALL", max_length=10,
            ),
        ),
    ]
