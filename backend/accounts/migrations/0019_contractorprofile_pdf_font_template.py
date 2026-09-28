from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0018_contractorprofile_custom_pdf_colors"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="pdf_font_template",
            field=models.CharField(
                choices=[
                    ("MODERN", "Modern sans"),
                    ("CLASSIC", "Classic serif"),
                    ("CLEAN", "Clean sans"),
                    ("COMPACT", "Compact sans"),
                ],
                default="MODERN",
                max_length=12,
            ),
        ),
    ]
