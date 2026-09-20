from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0031_property_measurement_unit"),
    ]

    operations = [
        migrations.AlterField(
            model_name="measurementsurface",
            name="surface_type",
            field=models.CharField(
                choices=[
                    ("WALL", "Wall"),
                    ("CEILING", "Ceiling"),
                    ("DOOR", "Paintable door"),
                    ("WINDOW", "Paintable window"),
                    ("BALCONY_SOFFIT", "Balcony ceiling"),
                    ("STAIR_SOFFIT", "Staircase ceiling"),
                    ("PORCH_CEILING", "Porch ceiling"),
                    ("WATERPROOFING", "Floor / terrace waterproofing"),
                    ("PARAPET", "Parapet wall"),
                    ("OTHER", "Other / manual"),
                ],
                max_length=30,
            ),
        ),
    ]
