from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0043_activitylog_monitoring_fields"),
    ]
    operations = [
        migrations.CreateModel(
            name="SiteInspection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("inspection_date", models.DateField()),
                ("inspected_by", models.CharField(blank=True, max_length=160)),
                ("surface_condition", models.CharField(blank=True, max_length=40)),
                ("moisture_level", models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ("findings", models.JSONField(blank=True, default=dict)),
                ("recommendations", models.TextField(blank=True)),
                ("notes", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("COMPLETED", "Completed")], default="DRAFT", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="site_inspections", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="site_inspections", to="quotations.customer")),
                ("property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="site_inspections", to="quotations.property")),
            ], options={"ordering": ("-inspection_date", "-created_at")},
        ),
    ]
