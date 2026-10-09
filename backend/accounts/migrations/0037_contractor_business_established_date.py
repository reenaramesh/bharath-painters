from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0036_contractor_profile_background")]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="business_established_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
