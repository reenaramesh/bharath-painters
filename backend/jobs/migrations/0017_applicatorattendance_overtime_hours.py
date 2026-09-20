from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0016_inhouse_employee_profile")]
    operations = [migrations.AddField(model_name="applicatorattendance", name="overtime_hours", field=models.DecimalField(decimal_places=2, default=0, max_digits=5))]
