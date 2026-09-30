from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0028_support_role")]

    operations = [
        migrations.AddField(
            model_name="contractorcompletedproject",
            name="pincode",
            field=models.CharField(blank=True, max_length=10),
        ),
    ]
