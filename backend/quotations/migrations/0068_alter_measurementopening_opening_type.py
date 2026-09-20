from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0067_alter_measurementopening_opening_type")]

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
                    ("CEILING", "Ceiling"),
                    ("OTHER", "Other"),
                ],
                max_length=20,
            ),
        ),
    ]
