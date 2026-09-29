from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0026_bharathuser_mobile_e164_length")]

    operations = [
        migrations.AlterField(
            model_name="passwordresetotp",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("PASSWORD_RESET", "Password reset"),
                    ("RECOVERY_EMAIL", "Recovery email verification"),
                    ("REGISTRATION_EMAIL", "Registration email verification"),
                    ("CUSTOMER_ACTIVATION", "Customer activation email verification"),
                ],
                default="PASSWORD_RESET",
                max_length=30,
            ),
        ),
    ]
