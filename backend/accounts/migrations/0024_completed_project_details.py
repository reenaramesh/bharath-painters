from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0023_contractor_profile_card")]

    operations = [
        migrations.AddField(
            model_name="contractorcompletedproject",
            name="apartment_community",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="contractorcompletedproject",
            name="address",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="contractorcompletedproject",
            name="work_completed",
            field=models.TextField(blank=True),
        ),
    ]
