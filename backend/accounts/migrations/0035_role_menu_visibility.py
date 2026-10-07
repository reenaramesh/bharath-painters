from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("accounts", "0034_profile_image_positions")]
    operations = [migrations.CreateModel(name="RoleMenuVisibility", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("role", models.CharField(choices=[("CONTRACTOR", "Contractor"), ("PAINTER", "Painter")], max_length=20, unique=True)), ("disabled", models.JSONField(blank=True, default=list))])]
