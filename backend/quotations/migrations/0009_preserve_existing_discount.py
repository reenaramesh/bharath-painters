
from django.db import migrations


def preserve_existing_discount(apps, schema_editor):

    Quotation = apps.get_model(
        "quotations",
        "Quotation"
    )

    for quotation in Quotation.objects.all():

        quotation.discount_value = (
            quotation.discount or 0
        )

        quotation.save(
            update_fields=[
                "discount_value"
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        (
            "quotations",
            "0008_quotation_discount_type_quotation_discount_value_and_more",
        ),
    ]

    operations = [
        migrations.RunPython(
            preserve_existing_discount,
            migrations.RunPython.noop,
        ),
    ]

