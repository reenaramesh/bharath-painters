from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0022_bharathuser_app_colors"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="work_skills",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="ContractorCompletedProject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=160)),
                ("location", models.CharField(blank=True, max_length=160)),
                ("description", models.TextField(blank=True)),
                ("photo", models.ImageField(blank=True, null=True, upload_to="contractors/projects/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="completed_projects", to="accounts.contractorprofile")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
