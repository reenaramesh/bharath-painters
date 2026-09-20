from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0020_measurement_access_request")]
    operations = [
        migrations.AlterField(
            model_name="quotation", name="status",
            field=models.CharField(choices=[("DRAFT", "Draft"), ("SENT", "Sent"), ("VIEWED", "Viewed"), ("ACCEPTED", "Accepted"), ("REJECTED", "Rejected"), ("EXPIRED", "Expired"), ("CONVERTED", "Converted"), ("CANCELLED", "Cancelled"), ("REVISION_REQUESTED", "Revision Requested")], default="DRAFT", max_length=20),
        ),
        migrations.AddField(model_name="quotation", name="customer_response_note", field=models.TextField(blank=True)),
        migrations.AddField(model_name="quotation", name="customer_responded_at", field=models.DateTimeField(blank=True, null=True)),
    ]
