from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("jobs", "0014_applicatoravailabilityblock")]
    operations = [
        migrations.AddField(model_name="contractorapplicatorteam", name="employee_code", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name="contractorapplicatorteam", name="employment_type", field=models.CharField(choices=[("FLEXIBLE", "Flexible team member"), ("IN_HOUSE", "Permanent in-house employee")], default="FLEXIBLE", max_length=20)),
        migrations.AddField(model_name="contractorapplicatorteam", name="is_active", field=models.BooleanField(default=True)),
        migrations.AddField(model_name="contractorapplicatorteam", name="joined_on", field=models.DateField(blank=True, null=True)),
        migrations.CreateModel(name="ApplicatorAttendance", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("date", models.DateField()),
            ("status", models.CharField(choices=[("PRESENT", "Present"), ("ABSENT", "Absent"), ("HALF_DAY", "Half day"), ("LEAVE", "Leave")], max_length=20)),
            ("note", models.CharField(blank=True, max_length=180)), ("marked_at", models.DateTimeField(auto_now=True)),
            ("membership", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attendance_records", to="jobs.contractorapplicatorteam")),
            ("schedule", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="applicator_attendance", to="jobs.workschedule")),
        ], options={"ordering": ("-date",)}),
        migrations.AddConstraint(model_name="applicatorattendance", constraint=models.UniqueConstraint(fields=("membership", "date"), name="unique_inhouse_attendance_day")),
        migrations.CreateModel(name="ApplicatorLedgerEntry", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("date", models.DateField()),
            ("entry_type", models.CharField(choices=[("EARNING", "Earning"), ("PAYMENT", "Payment"), ("ADVANCE", "Advance"), ("DEBIT_ADJUSTMENT", "Add to balance"), ("CREDIT_ADJUSTMENT", "Reduce balance")], max_length=30)),
            ("amount", models.DecimalField(decimal_places=2, max_digits=12)), ("payment_mode", models.CharField(blank=True, max_length=20)),
            ("reference", models.CharField(blank=True, max_length=100)), ("note", models.CharField(blank=True, max_length=255)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("membership", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ledger_entries", to="jobs.contractorapplicatorteam")),
            ("schedule", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="applicator_ledger_entries", to="jobs.workschedule")),
        ], options={"ordering": ("-date", "-created_at")}),
    ]
