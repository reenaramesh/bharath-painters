from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0027_jobtransferrequest"),
    ]

    operations = [
        migrations.AlterField(
            model_name="applicatorbooking",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("CONFIRMED", "Confirmed"),
                    ("REJECTED", "Rejected"),
                    ("CANCELLED", "Cancelled"),
                    ("COMPLETED", "Completed"),
                    ("CLOSED", "Closed"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
