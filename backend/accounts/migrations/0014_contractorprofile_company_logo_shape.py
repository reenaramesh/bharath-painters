from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_auto_verify_business_accounts"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="company_logo_shape",
            field=models.CharField(
                choices=[("RECTANGLE", "Rectangle"), ("ROUND", "Round")],
                default="RECTANGLE",
                max_length=12,
            ),
        ),
    ]
