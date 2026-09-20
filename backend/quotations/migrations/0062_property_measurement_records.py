from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def create_initial_records(apps, schema_editor):
    Property = apps.get_model("quotations", "Property")
    PropertyMeasurement = apps.get_model("quotations", "PropertyMeasurement")
    PropertyRoom = apps.get_model("quotations", "PropertyRoom")
    MeasurementSurface = apps.get_model("quotations", "MeasurementSurface")
    for property_obj in Property.objects.select_related("customer").all().iterator():
        if not MeasurementSurface.objects.filter(property=property_obj).exists():
            continue
        measured_on = property_obj.updated_at.date() if property_obj.updated_at else django.utils.timezone.localdate()
        record = PropertyMeasurement.objects.create(
            property=property_obj,
            contractor_id=property_obj.customer.contractor_id,
            reference_no=f"BPM-{measured_on.year}-{property_obj.id:05d}",
            measured_on=measured_on,
            status="COMPLETED",
        )
        PropertyRoom.objects.filter(property=property_obj).update(measurement_record=record)
        MeasurementSurface.objects.filter(property=property_obj).update(measurement_record=record)


class Migration(migrations.Migration):
    dependencies = [("quotations", "0061_quotation_revision_version")]

    operations = [
        migrations.CreateModel(
            name="PropertyMeasurement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference_no", models.CharField(blank=True, max_length=40, unique=True)),
                ("measured_on", models.DateField(default=django.utils.timezone.localdate)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("IN_PROGRESS", "In progress"), ("COMPLETED", "Completed"), ("LOCKED", "Used in quotation")], default="DRAFT", max_length=20)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contractor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="property_measurements", to=settings.AUTH_USER_MODEL)),
                ("property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="measurement_records", to="quotations.property")),
            ],
            options={"ordering": ("-measured_on", "-id")},
        ),
        migrations.AddField(
            model_name="propertyroom",
            name="measurement_record",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="rooms", to="quotations.propertymeasurement"),
        ),
        migrations.AddField(
            model_name="measurementsurface",
            name="measurement_record",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="surfaces", to="quotations.propertymeasurement"),
        ),
        migrations.RunPython(create_initial_records, migrations.RunPython.noop),
    ]
