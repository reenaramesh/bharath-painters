from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0012_applicatorbooking")]
    operations = [
        migrations.AddField(
            model_name="applicatorbooking",
            name="contractor_seen_response",
            field=models.BooleanField(default=False),
        ),
    ]
