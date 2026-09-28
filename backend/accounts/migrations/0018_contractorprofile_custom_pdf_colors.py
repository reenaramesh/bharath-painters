from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0017_contractorprofile_pdf_color_template"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contractorprofile",
            name="pdf_color_template",
            field=models.CharField(
                choices=[
                    ("STUDIO", "Studio navy and orange"),
                    ("INDIGO", "Indigo and violet"),
                    ("FOREST", "Forest and gold"),
                    ("CHARCOAL", "Charcoal and copper"),
                    ("COASTAL", "Coastal blue and silver"),
                    ("CORAL", "Deep teal and coral"),
                    ("MIST", "Slate and ice blue"),
                    ("CUSTOM", "Custom colors"),
                ],
                default="STUDIO",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="contractorprofile",
            name="pdf_custom_primary_color",
            field=models.CharField(default="#142743", max_length=7),
        ),
        migrations.AddField(
            model_name="contractorprofile",
            name="pdf_custom_accent_color",
            field=models.CharField(default="#FF991F", max_length=7),
        ),
    ]
