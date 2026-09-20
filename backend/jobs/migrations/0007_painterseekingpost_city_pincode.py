from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("jobs", "0006_painterseekingpost")]
    operations = [
        migrations.AddField(model_name="painterseekingpost", name="city", field=models.CharField(blank=True, max_length=100)),
        migrations.AddField(model_name="painterseekingpost", name="pincode", field=models.CharField(blank=True, max_length=10)),
    ]
