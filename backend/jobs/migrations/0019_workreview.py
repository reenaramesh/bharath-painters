from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("jobs", "0018_alter_applicatorledgerentry_entry_type"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name="WorkReview", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("rating", models.PositiveSmallIntegerField()), ("comment", models.TextField(blank=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reviews", to="jobs.workschedulepainter")), ("reviewee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="work_reviews_received", to=settings.AUTH_USER_MODEL)), ("reviewer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="work_reviews_written", to=settings.AUTH_USER_MODEL))], options={"ordering":("-created_at",)}), migrations.AddConstraint(model_name="workreview", constraint=models.UniqueConstraint(fields=("assignment","reviewer"), name="one_review_per_assignment_reviewer"))]
