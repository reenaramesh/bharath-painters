from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0042_activitylog"),
    ]

    operations = [
        migrations.AlterField(
            model_name="activitylog", name="action",
            field=models.CharField(choices=[("CREATE", "Created"), ("UPDATE", "Updated"), ("DELETE", "Deleted"), ("STATUS_CHANGE", "Status changed"), ("LOGIN", "Signed in"), ("LOGIN_FAILED", "Sign-in failed"), ("DOWNLOAD", "Downloaded")], max_length=20),
        ),
        migrations.AddField(model_name="activitylog", name="is_flagged", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="activitylog", name="review_note", field=models.TextField(blank=True)),
        migrations.AddField(model_name="activitylog", name="reviewed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="activitylog", name="reviewed_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_activity_logs", to=settings.AUTH_USER_MODEL)),
    ]
