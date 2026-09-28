from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0091_chat_conversation_safety")]

    operations = [
        migrations.AddField(
            model_name="supportticket",
            name="chat_conversation",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="safety_reports", to="quotations.chatconversation"),
        ),
    ]
