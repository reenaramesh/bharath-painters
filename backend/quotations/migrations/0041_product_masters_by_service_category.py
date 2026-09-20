from django.db import migrations, models
import django.db.models.deletion


def map_existing_products(apps, schema_editor):
    Category = apps.get_model("quotations", "ServiceCategory")
    PaintType = apps.get_model("quotations", "PaintType")
    Description = apps.get_model("quotations", "WorkDescription")
    painting = Category.objects.filter(name__iexact="Painting").first()
    if painting:
        PaintType.objects.filter(service_category__isnull=True).update(service_category=painting)
        for item in Description.objects.filter(service_category__isnull=True).select_related("service_type"):
            item.service_category = item.service_type.category_master if item.service_type and item.service_type.category_master_id else painting
            item.save(update_fields=["service_category"])


class Migration(migrations.Migration):
    dependencies = [("quotations", "0040_quotationitem_flexible_master_fields")]
    operations = [
        migrations.AlterField(model_name="workdescription", name="service_type", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="work_descriptions", to="quotations.servicetype")),
        migrations.AddField(model_name="workdescription", name="service_category", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="product_descriptions", to="quotations.servicecategory")),
        migrations.AddField(model_name="painttype", name="service_category", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="product_types", to="quotations.servicecategory")),
        migrations.RunPython(map_existing_products, migrations.RunPython.noop),
    ]
