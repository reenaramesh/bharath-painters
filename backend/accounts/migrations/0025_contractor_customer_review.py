from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("accounts", "0024_completed_project_details")]

    operations = [
        migrations.CreateModel(
            name="ContractorCustomerReview",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rating", models.PositiveSmallIntegerField()),
                ("comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="customer_reviews", to="accounts.contractorprofile")),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contractor_reviews_written", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="contractorcustomerreview",
            constraint=models.UniqueConstraint(fields=("contractor", "customer"), name="unique_customer_contractor_review"),
        ),
    ]
