from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0112_property_share_search_access")]

    operations = [
        migrations.AddField(
            model_name="quotationitem",
            name="included_areas",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
