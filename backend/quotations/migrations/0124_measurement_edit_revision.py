from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0123_project_scope_source_references")]

    operations = [
        migrations.AddField(model_name="propertymeasurement", name="edit_revision", field=models.PositiveBigIntegerField(default=0)),
        migrations.AddField(model_name="propertyroom", name="idempotency_revision", field=models.PositiveBigIntegerField(null=True, blank=True)),
        migrations.AddField(model_name="measurementsurface", name="idempotency_revision", field=models.PositiveBigIntegerField(null=True, blank=True)),
    ]
