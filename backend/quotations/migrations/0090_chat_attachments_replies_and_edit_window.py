from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0089_seed_apartment_communities")]

    operations = [
        migrations.AlterField(model_name="chatmessage", name="text", field=models.TextField(blank=True)),
        migrations.AddField(model_name="chatmessage", name="contact_name", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="chatmessage", name="contact_mobile", field=models.CharField(blank=True, max_length=16)),
        migrations.AddField(model_name="chatmessage", name="edited_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="chatmessage", name="deleted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="chatmessage", name="reply_to", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="replies", to="quotations.chatmessage")),
        migrations.CreateModel(
            name="ChatAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to="chat_attachments/%Y/%m/")),
                ("file_name", models.CharField(max_length=255)),
                ("content_type", models.CharField(max_length=100)),
                ("size", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="quotations.chatmessage")),
            ],
        ),
    ]
