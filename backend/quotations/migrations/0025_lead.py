from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

def create_leads_for_requests(apps, schema_editor):
    ServiceRequest = apps.get_model("quotations", "ServiceRequest")
    Lead = apps.get_model("quotations", "Lead")
    for request in ServiceRequest.objects.select_related("customer").all():
        Lead.objects.get_or_create(service_request=request, defaults={"contractor_id": request.customer.contractor_id, "customer_id": request.customer_id, "service_type_id": request.service_type_id, "title": request.title, "description": request.description, "stage": "NEW"})

class Migration(migrations.Migration):
    dependencies = [("quotations", "0024_alter_quotation_status_alter_servicerequest_status"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="Lead", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("title", models.CharField(max_length=180)), ("description", models.TextField(blank=True)),
            ("stage", models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("FOLLOW_UP", "Follow Up"), ("SITE_VISIT", "Site Visit"), ("QUOTATION", "Quotation"), ("NEGOTIATION", "Negotiation"), ("WON", "Won"), ("LOST", "Lost"), ("CANCELLED", "Cancelled")], default="NEW", max_length=20)),
            ("estimated_value", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)), ("next_follow_up", models.DateTimeField(blank=True, null=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_leads", to=settings.AUTH_USER_MODEL)),
            ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="leads", to="quotations.customer")),
            ("service_request", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="lead", to="quotations.servicerequest")),
            ("service_type", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="leads", to="quotations.servicetype")),
        ], options={"ordering": ("-updated_at",)}),
        migrations.RunPython(create_leads_for_requests, migrations.RunPython.noop),
    ]
