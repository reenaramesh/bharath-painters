from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0019_contractorprofile_pdf_font_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="pdf_custom_text_color",
            field=models.CharField(default="#172033", max_length=7),
        ),
    ]
