from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0010_bharathuser_last_activity_at")]
    operations = [
        migrations.AddField(
            model_name="bharathuser",
            name="preferred_language",
            field=models.CharField(
                choices=[("en", "English"), ("kn", "Kannada"), ("hi", "Hindi"), ("te", "Telugu"), ("ta", "Tamil"), ("ml", "Malayalam"), ("mr", "Marathi"), ("bn", "Bengali"), ("gu", "Gujarati"), ("pa", "Punjabi"), ("or", "Odia"), ("as", "Assamese")],
                default="en", max_length=5,
            ),
        ),
    ]
