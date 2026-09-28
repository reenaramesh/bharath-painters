from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0093_chat_message_colour")]

    operations = [
        migrations.AddField(
            model_name="chatmessage",
            name="forwarded_from",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="forwards", to="quotations.chatmessage"),
        ),
    ]
