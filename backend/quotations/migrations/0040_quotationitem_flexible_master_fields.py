from django.db import migrations, models
import django.db.models.deletion


def seed_quotation_masters(apps, schema_editor):
    ServiceCategory = apps.get_model("quotations", "ServiceCategory")
    Unit = apps.get_model("quotations", "Unit")
    for name in ("Painting", "Cleaning", "Plumbing", "Carpentry"):
        ServiceCategory.objects.get_or_create(name=name, created_by=None, defaults={"is_active": True})
    for name in ("Sq ft", "Nos", "Litres", "Kg", "Packet", "Box"):
        Unit.objects.get_or_create(name=name, created_by=None, defaults={"is_active": True})


class Migration(migrations.Migration):
    dependencies = [("quotations", "0039_quotation_estimation_fields")]

    operations = [
        migrations.AddField(model_name="quotationitem", name="service_category", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="quotations.servicecategory")),
        migrations.AddField(model_name="quotationitem", name="line_type", field=models.CharField(choices=[("SERVICE_MATERIAL", "Service + Material"), ("SERVICE", "Service"), ("MATERIAL", "Material"), ("REPAIR", "Repair")], default="SERVICE_MATERIAL", max_length=30)),
        migrations.AddField(model_name="quotationitem", name="custom_service_category", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotationitem", name="custom_service_type", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotationitem", name="custom_product_type", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="quotationitem", name="custom_brand", field=models.CharField(blank=True, max_length=150)),
        migrations.RunPython(seed_quotation_masters, migrations.RunPython.noop),
    ]
