from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0057_projectreceipt")]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
