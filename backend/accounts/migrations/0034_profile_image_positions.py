from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0033_email_otp_setup"),
    ]

    operations = [
        migrations.AddField(
            model_name="bharathuser",
            name="profile_photo_position",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractorprofile",
            name="company_logo_position",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
