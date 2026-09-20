from django.db import migrations


def create_default_plans(apps, schema_editor):
    Plan = apps.get_model("billing", "BillingPlan")
    plans = [
        {"name": "Contractor Free", "audience": "CONTRACTOR", "billing_cycle": "FREE", "price": 0, "quotation_limit": 5, "employee_limit": 2, "features": "Create up to 5 quotations\nRegister up to 2 employees"},
        {"name": "Contractor Customized", "audience": "CONTRACTOR", "billing_cycle": "CUSTOM", "price": 0, "features": "Limits and price set by administrator"},
        {"name": "Applicator Free", "audience": "PAINTER", "billing_cycle": "FREE", "price": 0, "features": "Basic Paint Applicator portal access"},
        {"name": "Applicator Monthly", "audience": "PAINTER", "billing_cycle": "MONTHLY", "price": 0, "features": "Monthly access; price and benefits set by administrator"},
        {"name": "Applicator Selected Dates", "audience": "PAINTER", "billing_cycle": "DATE_RANGE", "price": 0, "features": "Access for administrator-selected start and end dates"},
        {"name": "Applicator Customized", "audience": "PAINTER", "billing_cycle": "CUSTOM", "price": 0, "features": "Price and benefits set by administrator"},
    ]
    for values in plans:
        Plan.objects.get_or_create(name=values["name"], audience=values["audience"], defaults=values)


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(create_default_plans, migrations.RunPython.noop)]
