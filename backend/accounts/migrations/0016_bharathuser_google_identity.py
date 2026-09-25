from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0015_userlegalconsent")]

    operations = [
        migrations.AddField(
            model_name="bharathuser",
            name="google_subject",
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="google_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="bharathuser",
            name="google_linked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
