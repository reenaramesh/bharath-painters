from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0035_role_menu_visibility")]

    operations = [
        migrations.AddField(
            model_name="contractorprofile",
            name="profile_background",
            field=models.ImageField(blank=True, null=True, upload_to="contractors/backgrounds/"),
        ),
        migrations.AddField(
            model_name="contractorprofile",
            name="profile_background_position",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
