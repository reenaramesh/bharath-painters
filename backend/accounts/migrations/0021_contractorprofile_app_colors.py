from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0020_contractorprofile_pdf_custom_text_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="app_primary_color",
            field=models.CharField(default="#176B9B", max_length=7),
        ),
        migrations.AddField(
            model_name="contractorprofile",
            name="app_accent_color",
            field=models.CharField(default="#508398", max_length=7),
        ),
    ]
