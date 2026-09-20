from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0015_propertyroom_room_type")]

    operations = [
        migrations.AddField(
            model_name="customerfollowup",
            name="is_completed",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="customerfollowup",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
