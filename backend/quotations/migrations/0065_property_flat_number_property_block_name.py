from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quotations", "0064_apartmentcommunity"),
    ]

    operations = [
        migrations.AddField(
            model_name="property",
            name="flat_number",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="property",
            name="block_name",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
