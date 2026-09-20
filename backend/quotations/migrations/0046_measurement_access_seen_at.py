from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0045_delete_siteinspection")]
    operations = [
        migrations.AddField(model_name="measurementaccessrequest", name="contractor_seen_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="measurementaccessrequest", name="customer_seen_at", field=models.DateTimeField(blank=True, null=True)),
    ]
