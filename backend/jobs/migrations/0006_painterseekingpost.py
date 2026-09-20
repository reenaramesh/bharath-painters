from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("jobs", "0005_workschedule_work_progress"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name="PainterSeekingPost", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("title", models.CharField(max_length=180)), ("description", models.TextField(blank=True)), ("skills", models.TextField(blank=True)),
        ("preferred_location", models.CharField(max_length=180)), ("available_from", models.DateField()), ("available_until", models.DateField(blank=True, null=True)),
        ("wage_type", models.CharField(choices=[("DAILY", "Daily"), ("WEEKLY", "Weekly"), ("NEGOTIABLE", "Negotiable")], default="DAILY", max_length=20)),
        ("expected_wage", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)), ("willing_to_travel", models.BooleanField(default=False)),
        ("status", models.CharField(choices=[("ACTIVE", "Active"), ("CLOSED", "Closed")], default="ACTIVE", max_length=20)),
        ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
        ("painter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="seeking_posts", to=settings.AUTH_USER_MODEL)),
    ], options={"ordering": ("-updated_at",)})]
