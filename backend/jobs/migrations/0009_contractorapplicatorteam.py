from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0008_workschedulepainter_assignment_terms"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ContractorApplicatorTeam",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("added_at", models.DateTimeField(auto_now_add=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applicator_team_members", to=settings.AUTH_USER_MODEL)),
                ("painter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contractor_teams", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-added_at",)},
        ),
        migrations.AddConstraint(
            model_name="contractorapplicatorteam",
            constraint=models.UniqueConstraint(fields=("contractor", "painter"), name="unique_contractor_applicator_team_member"),
        ),
    ]
