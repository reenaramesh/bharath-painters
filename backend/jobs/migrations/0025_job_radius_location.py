from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0024_backfill_employee_codes")]

    operations = [
        migrations.AddField(model_name="job", name="pincode", field=models.CharField(blank=True, max_length=6)),
        migrations.AddField(model_name="job", name="state", field=models.CharField(blank=True, max_length=100)),
        migrations.AddField(model_name="job", name="latitude", field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
        migrations.AddField(model_name="job", name="longitude", field=models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
        migrations.AddField(model_name="job", name="radius_km", field=models.PositiveSmallIntegerField(default=10)),
        migrations.AddField(model_name="job", name="location_source", field=models.CharField(default="MANUAL", max_length=12)),
        migrations.AddField(model_name="painterseekingpost", name="state", field=models.CharField(blank=True, max_length=100)),
        migrations.AddField(model_name="painterseekingpost", name="latitude", field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
        migrations.AddField(model_name="painterseekingpost", name="longitude", field=models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
        migrations.AddField(model_name="painterseekingpost", name="radius_km", field=models.PositiveSmallIntegerField(default=10)),
        migrations.AddField(model_name="painterseekingpost", name="location_source", field=models.CharField(default="MANUAL", max_length=12)),
    ]
