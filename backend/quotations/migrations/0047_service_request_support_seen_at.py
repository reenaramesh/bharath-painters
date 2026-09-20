from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0046_measurement_access_seen_at")]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="contractor_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="servicerequest",
            name="customer_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="handler_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="requester_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
