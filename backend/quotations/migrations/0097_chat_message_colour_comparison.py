from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0096_customer_share_link")]

    operations = [
        migrations.AddField(
            model_name="chatmessage",
            name="colour_comparison",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
