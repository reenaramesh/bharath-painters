import django.db.models.deletion
from django.db import migrations, models


def assign_primary_property_contacts(apps, schema_editor):
    Quotation = apps.get_model("quotations", "Quotation")
    PropertyContact = apps.get_model("quotations", "PropertyContact")

    batch = []
    for quotation in Quotation.objects.filter(property__isnull=False).only("id", "property_id").iterator():
        contact_id = PropertyContact.objects.filter(
            property_id=quotation.property_id,
            is_primary=True,
        ).values_list("id", flat=True).first()
        if contact_id:
            quotation.customer_contact_id = contact_id
            batch.append(quotation)
        if len(batch) >= 500:
            Quotation.objects.bulk_update(batch, ("customer_contact",))
            batch = []
    if batch:
        Quotation.objects.bulk_update(batch, ("customer_contact",))

def clear_property_contact_assignments(apps, schema_editor):
    apps.get_model("quotations", "Quotation").objects.update(customer_contact=None)


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0110_property_multi_contact_access"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="customer_contact",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="quotations_as_contact", to="quotations.propertycontact"),
        ),
        migrations.RunPython(assign_primary_property_contacts, clear_property_contact_assignments),
    ]
