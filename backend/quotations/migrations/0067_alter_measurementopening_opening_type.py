from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0066_alter_property_property_type")]

    operations = [
        migrations.AlterField(
            model_name="measurementopening",
            name="opening_type",
            field=models.CharField(
                choices=[
                    ("DOOR", "Door"),
                    ("WINDOW", "Window"),
                    ("GATE", "Gate"),
                    ("GRILL", "Grill"),
                    ("WARDROBE", "Wardrobe"),
                    ("CEILING", "Ceiling deduction"),
                    ("OTHER", "Other"),
                ],
                max_length=20,
            ),
        ),
    ]
