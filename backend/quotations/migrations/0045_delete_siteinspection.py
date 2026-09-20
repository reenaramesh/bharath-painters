from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("quotations", "0044_siteinspection")]
    operations = [migrations.DeleteModel(name="SiteInspection")]
