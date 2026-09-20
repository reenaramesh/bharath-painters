from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_password_reset_otp")]
    operations = [
        migrations.AddField(model_name="painterprofile", name="blood_group", field=models.CharField(blank=True, max_length=5)),
        migrations.AddField(model_name="painterprofile", name="current_location", field=models.CharField(blank=True, max_length=180)),
        migrations.AddField(model_name="painterprofile", name="permanent_address", field=models.TextField(blank=True)),
    ]
