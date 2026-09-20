from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quotations", "0075_painttype_key_features"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="show_product_key_features",
            field=models.BooleanField(default=True),
        ),
    ]
