from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import quotations.catalogue_storage


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0132_lead_employee_followup_actors"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ContractorCatalogue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=180)),
                ("category", models.CharField(default="Other", max_length=100)),
                ("brand_vendor", models.CharField(blank=True, max_length=160)),
                ("description", models.TextField(blank=True)),
                ("document_type", models.CharField(choices=[("PRODUCT_CATALOGUE", "Product catalogue"), ("OUR_WORK", "Our work"), ("BROCHURE", "Brochure")], default="PRODUCT_CATALOGUE", max_length=24)),
                ("is_archived", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="catalogues", to=settings.AUTH_USER_MODEL)),
                ("service_category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="catalogues", to="quotations.servicecategory")),
                ("product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="catalogues", to="quotations.painttype")),
            ],
            options={"ordering": ("-updated_at", "-id")},
        ),
        migrations.CreateModel(
            name="CatalogueVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveIntegerField()),
                ("file", models.FileField(storage=quotations.catalogue_storage.PrivateCatalogueStorage, upload_to=quotations.catalogue_storage.catalogue_upload_path)),
                ("file_name", models.CharField(max_length=255)),
                ("content_type", models.CharField(max_length=100)),
                ("size", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("catalogue", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="versions", to="quotations.contractorcatalogue")),
            ],
            options={"ordering": ("-version",), "constraints": [models.UniqueConstraint(fields=("catalogue", "version"), name="unique_catalogue_version")]},
        ),
        migrations.AddField(
            model_name="contractorcatalogue", name="current_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="current_for_catalogues", to="quotations.catalogueversion"),
        ),
        migrations.AddField(
            model_name="chatattachment", name="catalogue_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="chat_attachments", to="quotations.catalogueversion"),
        ),
        migrations.AddField(
            model_name="chatmessage", name="catalogue_send_key",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="chatmessage", name="catalogue_send_fingerprint",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddConstraint(
            model_name="chatmessage",
            constraint=models.UniqueConstraint(fields=("sender", "conversation", "catalogue_send_key"), condition=models.Q(catalogue_send_key__isnull=False), name="unique_chat_catalogue_send_key"),
        ),
    ]
