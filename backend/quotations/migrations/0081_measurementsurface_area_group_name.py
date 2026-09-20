import re

from django.db import migrations, models


def populate_existing_custom_area_groups(apps, schema_editor):
    MeasurementSurface = apps.get_model("quotations", "MeasurementSurface")
    for surface in MeasurementSurface.objects.filter(surface_type="OTHER").iterator():
        group_name = re.sub(r"\s+\d+$", "", (surface.name or "").strip()).strip()
        surface.area_group_name = group_name or "Custom Area"
        surface.save(update_fields=["area_group_name"])


class Migration(migrations.Migration):
    dependencies = [("quotations", "0080_customer_gst_number")]

    operations = [
        migrations.AddField(
            model_name="measurementsurface",
            name="area_group_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.RunPython(
            populate_existing_custom_area_groups,
            migrations.RunPython.noop,
        ),
    ]
