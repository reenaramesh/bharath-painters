from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("quotations", "0124_measurement_edit_revision")]

    operations = [
        migrations.AlterModelOptions(
            name="quotationitem",
            options={"ordering": ("id",)},
        ),
    ]
