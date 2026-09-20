from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0017_applicatorattendance_overtime_hours")]
    operations = [migrations.AlterField(model_name="applicatorledgerentry", name="entry_type", field=models.CharField(choices=[("EARNING", "Earning"), ("BONUS", "Bonus"), ("PAYMENT", "Payment"), ("ADVANCE", "Advance"), ("DEBIT_ADJUSTMENT", "Add to balance"), ("CREDIT_ADJUSTMENT", "Reduce balance")], max_length=30))]
