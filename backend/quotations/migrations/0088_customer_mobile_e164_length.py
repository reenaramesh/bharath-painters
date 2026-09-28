from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0087_webpushsubscription")]

    operations = [
        migrations.AlterField(
            model_name="customer",
            name="mobile",
            field=models.CharField(max_length=16),
        ),
    ]
