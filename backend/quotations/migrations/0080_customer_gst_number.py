from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quotations", "0079_workchange_workchangeitem"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="gst_number",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
