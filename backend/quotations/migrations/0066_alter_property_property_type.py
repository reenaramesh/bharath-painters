from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quotations", "0065_property_flat_number_property_block_name"),
    ]

    operations = [
        migrations.AlterField(
            model_name="property",
            name="property_type",
            field=models.CharField(
                choices=[
                    ("1RK", "1 RK"),
                    ("1BHK", "1 BHK"),
                    ("2BHK", "2 BHK"),
                    ("3BHK", "3 BHK"),
                    ("4BHK", "4 BHK"),
                    ("VILLA", "Villa"),
                    ("OFFICE", "Office"),
                    ("COMMERCIAL", "Commercial"),
                    ("INTERIOR", "Interior"),
                    ("EXTERIOR", "Exterior"),
                    ("OTHER", "Other"),
                ],
                default="OTHER",
                max_length=30,
            ),
        ),
    ]
