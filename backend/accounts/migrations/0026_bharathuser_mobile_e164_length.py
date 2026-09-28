from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0025_contractor_customer_review")]

    operations = [
        migrations.AlterField(
            model_name="bharathuser",
            name="mobile",
            field=models.CharField(max_length=16, unique=True),
        ),
    ]
