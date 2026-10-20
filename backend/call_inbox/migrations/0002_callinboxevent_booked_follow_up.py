import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("call_inbox", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="callinboxevent",
            name="booked_follow_up",
            field=models.OneToOneField(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="source_call_event", to="quotations.customerfollowup",
            ),
        ),
    ]
