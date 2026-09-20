from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0037_supportticketmessage")]

    operations = [
        migrations.AddField(
            model_name="measurementaccessrequest", name="target_property",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="imported_measurement_access", to="quotations.property"),
        ),
    ]
