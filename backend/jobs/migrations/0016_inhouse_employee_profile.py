from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0015_inhouse_applicator_workforce")]
    operations = [
        migrations.AddField(model_name="contractorapplicatorteam", name="blood_group", field=models.CharField(blank=True, max_length=5)),
        migrations.AddField(model_name="contractorapplicatorteam", name="date_of_birth", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="contractorapplicatorteam", name="esi_applicable", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="contractorapplicatorteam", name="pf_applicable", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="contractorapplicatorteam", name="salary_amount", field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="contractorapplicatorteam", name="salary_basis", field=models.CharField(choices=[("MONTHLY", "Fixed monthly salary"), ("WEEKLY", "Weekly wage"), ("DAILY", "Daily wage")], default="DAILY", max_length=20)),
    ]
