from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0027_registration_email_otp_purposes")]

    operations = [
        migrations.AlterField(
            model_name="bharathuser", name="role",
            field=models.CharField(
                max_length=20, default="CUSTOMER",
                choices=[
                    ("PAINTER", "Painter"), ("CONTRACTOR", "Contractor"),
                    ("CUSTOMER", "Customer"), ("ADMIN", "Admin"),
                    ("SUPPORT", "Support staff"),
                ],
            ),
        ),
        migrations.AlterField(
            model_name="userlegalconsent", name="role_at_acceptance",
            field=models.CharField(max_length=20, choices=[
                ("PAINTER", "Painter"), ("CONTRACTOR", "Contractor"),
                ("CUSTOMER", "Customer"), ("ADMIN", "Admin"),
                ("SUPPORT", "Support staff"),
            ]),
        ),
    ]
