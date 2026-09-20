from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0028_quotationitem_additional_service_fields")]
    operations = [migrations.AddField(model_name="servicetype", name="category", field=models.CharField(default="Painting", max_length=100))]
