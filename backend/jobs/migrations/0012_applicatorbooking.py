from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("jobs", "0011_alter_painterseekingpost_pincode"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="ApplicatorBooking",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("work_type", models.CharField(max_length=180)),
                ("pincode", models.CharField(max_length=6)),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("wage_type", models.CharField(choices=[("DAILY", "Daily"), ("WEEKLY", "Weekly"), ("NEGOTIABLE", "Negotiable")], default="DAILY", max_length=20)),
                ("agreed_wage", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("notes", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("CONFIRMED", "Confirmed"), ("REJECTED", "Rejected"), ("CANCELLED", "Cancelled"), ("COMPLETED", "Completed")], default="PENDING", max_length=20)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("applicator", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applicator_booking_requests", to=settings.AUTH_USER_MODEL)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applicator_bookings_made", to=settings.AUTH_USER_MODEL)),
                ("seeking_post", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bookings", to="jobs.painterseekingpost")),
            ],
            options={"ordering": ("-updated_at",)},
        ),
    ]
