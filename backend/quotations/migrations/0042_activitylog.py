from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0041_product_masters_by_service_category"),
    ]

    operations = [
        migrations.CreateModel(
            name="ActivityLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("actor_name", models.CharField(blank=True, max_length=160)),
                ("actor_role", models.CharField(blank=True, max_length=30)),
                ("action", models.CharField(choices=[("CREATE", "Created"), ("UPDATE", "Updated"), ("DELETE", "Deleted")], max_length=20)),
                ("module", models.CharField(max_length=80)),
                ("description", models.CharField(max_length=255)),
                ("method", models.CharField(max_length=10)),
                ("path", models.CharField(max_length=255)),
                ("object_id", models.CharField(blank=True, max_length=80)),
                ("status_code", models.PositiveSmallIntegerField(default=200)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="activity_logs", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddIndex(
            model_name="activitylog",
            index=models.Index(fields=["module", "action", "created_at"], name="quotations_module_42f2d9_idx"),
        ),
    ]
