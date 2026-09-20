from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0017_internal_customer_chat")]

    operations = [
        migrations.CreateModel(
            name="ServiceRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=180)),
                ("description", models.TextField(blank=True)),
                ("preferred_date", models.DateField(blank=True, null=True)),
                ("address", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("NEW", "New"), ("REVIEWING", "Reviewing"), ("SITE_VISIT", "Site Visit"), ("QUOTATION", "Quotation"), ("ACCEPTED", "Accepted"), ("COMPLETED", "Completed"), ("CANCELLED", "Cancelled")], default="NEW", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="service_requests", to="quotations.customer")),
                ("service_type", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="customer_requests", to="quotations.servicetype")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
