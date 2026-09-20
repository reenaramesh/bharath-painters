from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0032_alter_measurementsurface_surface_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="measurementsurface",
            name="paintable_sides",
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
