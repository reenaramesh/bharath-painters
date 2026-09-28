from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0092_support_ticket_chat_conversation")]

    operations = [
        migrations.AddField(model_name="chatmessage", name="colour_brand", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name="chatmessage", name="colour_name", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="chatmessage", name="colour_code", field=models.CharField(blank=True, max_length=32)),
        migrations.AddField(model_name="chatmessage", name="colour_hex", field=models.CharField(blank=True, max_length=7)),
    ]
