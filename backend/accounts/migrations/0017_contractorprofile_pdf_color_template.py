from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_bharathuser_google_identity"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="pdf_color_template",
            field=models.CharField(
                choices=[
                    ("STUDIO", "Studio navy and orange"),
                    ("INDIGO", "Indigo and violet"),
                    ("FOREST", "Forest and gold"),
                    ("CHARCOAL", "Charcoal and copper"),
                ],
                default="STUDIO",
                max_length=12,
            ),
        ),
    ]
