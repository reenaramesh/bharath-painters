from django.db import migrations, models
import django.db.models.deletion


def create_categories(apps, schema_editor):
    ServiceType = apps.get_model("quotations", "ServiceType")
    ServiceCategory = apps.get_model("quotations", "ServiceCategory")
    for service in ServiceType.objects.all():
        category, _ = ServiceCategory.objects.get_or_create(name=service.category or "Painting", created_by=service.created_by, defaults={"is_active": True})
        service.category_master = category
        service.save(update_fields=("category_master",))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0029_servicetype_category")]
    operations = [
        migrations.CreateModel(name="ServiceCategory", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("name", models.CharField(max_length=150)), ("is_active", models.BooleanField(default=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="%(class)s_created", to="accounts.bharathuser"))], options={"verbose_name_plural":"Service categories"}),
        migrations.AddField(model_name="servicetype", name="category_master", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="services", to="quotations.servicecategory")),
        migrations.CreateModel(name="WorkDescription", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("name", models.CharField(max_length=150)), ("is_active", models.BooleanField(default=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="%(class)s_created", to="accounts.bharathuser")), ("service_type", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="work_descriptions", to="quotations.servicetype"))], options={"ordering":("service_type__name","name")}),
        migrations.RunPython(create_categories, migrations.RunPython.noop),
    ]
