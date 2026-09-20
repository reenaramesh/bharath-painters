from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0010_applicator_work_progress")]

    operations = [
        migrations.AlterField(
            model_name="painterseekingpost",
            name="pincode",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
