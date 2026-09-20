import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0011_bharathuser_preferred_language")]

    operations = [
        migrations.AddField(
            model_name="bharathuser",
            name="recovery_email",
            field=models.EmailField(blank=True, max_length=254, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="recovery_email_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="recovery_email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="recovery_email_added_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="recovery_email_added_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="recovery_emails_added", to="accounts.bharathuser"),
        ),
        migrations.AddField(
            model_name="passwordresetotp",
            name="purpose",
            field=models.CharField(choices=[("PASSWORD_RESET", "Password reset"), ("RECOVERY_EMAIL", "Recovery email verification")], default="PASSWORD_RESET", max_length=30),
        ),
        migrations.AddField(
            model_name="passwordresetotp",
            name="target_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="passwordresetotp",
            name="verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
