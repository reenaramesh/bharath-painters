from django.db import migrations, models


def assign_customer_ids(apps, schema_editor):
    Customer = apps.get_model("quotations", "Customer")
    for number, customer in enumerate(Customer.objects.order_by("created_at", "id"), start=1):
        customer.bharath_id = f"BP-CU-{number:06d}"
        customer.save(update_fields=("bharath_id",))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0025_lead")]
    operations = [
        migrations.AddField(model_name="customer", name="bharath_id", field=models.CharField(blank=True, max_length=30, null=True, unique=True)),
        migrations.RunPython(assign_customer_ids, migrations.RunPython.noop),
        migrations.AlterField(model_name="customer", name="bharath_id", field=models.CharField(blank=True, max_length=30, unique=True)),
    ]
