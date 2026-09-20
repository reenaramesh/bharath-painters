from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("quotations", "0051_exterior_components"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name="Invoice", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("invoice_number", models.CharField(max_length=40, unique=True)), ("invoice_date", models.DateField(default=django.utils.timezone.localdate)),
        ("due_date", models.DateField(blank=True, null=True)), ("status", models.CharField(choices=[("DRAFT","Draft"),("ISSUED","Issued"),("PART_PAID","Part paid"),("PAID","Paid"),("CANCELLED","Cancelled")], default="DRAFT", max_length=20)),
        ("customer_name", models.CharField(max_length=180)), ("customer_mobile", models.CharField(blank=True, max_length=20)), ("billing_address", models.TextField(blank=True)), ("property_name", models.CharField(blank=True, max_length=200)),
        ("items", models.JSONField(default=list)), ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=14)), ("discount", models.DecimalField(decimal_places=2, default=0, max_digits=14)), ("gst_percentage", models.DecimalField(decimal_places=2, default=0, max_digits=5)), ("gst_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)), ("grand_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)), ("amount_paid", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        ("notes", models.TextField(blank=True)), ("terms_conditions", models.TextField(blank=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
        ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="project_invoices", to=settings.AUTH_USER_MODEL)), ("quotation", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="invoice", to="quotations.quotation")),
    ], options={"ordering": ("-invoice_date", "-id")})]
