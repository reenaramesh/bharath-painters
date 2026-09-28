from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0090_chat_attachments_replies_and_edit_window"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="blocked_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="blocked_chat_conversations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="chatconversation",
            name="blocked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
