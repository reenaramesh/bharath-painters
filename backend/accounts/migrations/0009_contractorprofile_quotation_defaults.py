from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0008_contractorprofile_default_measurement_unit")]

    operations = [
        migrations.AddField(model_name="contractorprofile", name="quotation_terms_conditions", field=models.TextField(blank=True)),
        migrations.AddField(model_name="contractorprofile", name="quotation_prepared_by", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="contractorprofile", name="quotation_inspected_by", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="contractorprofile", name="quotation_work_duration", field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name="contractorprofile", name="quotation_payment_terms", field=models.TextField(blank=True)),
        migrations.AddField(model_name="contractorprofile", name="quotation_product_details", field=models.TextField(blank=True)),
        migrations.AddField(model_name="contractorprofile", name="quotation_work_procedures", field=models.TextField(blank=True)),
    ]
