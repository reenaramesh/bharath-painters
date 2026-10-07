from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0113_quotationitem_included_areas")]
    operations = [migrations.AddField(
        model_name="quotationitem",
        name="specification_details",
        field=models.JSONField(blank=True, default=dict),
    )]
