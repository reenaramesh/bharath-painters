from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("outsourcing", "0005_workordercompletionscope_completion_scope_accepted_lte_reported"),
    ]

    operations = [
        migrations.AddField(
            model_name="subcontractinvoicepayment",
            name="idempotency_key",
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
