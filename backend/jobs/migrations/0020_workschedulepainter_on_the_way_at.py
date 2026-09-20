from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("jobs", "0019_workreview")]
    operations = [migrations.AddField(model_name="workschedulepainter", name="on_the_way_at", field=models.DateTimeField(blank=True, null=True))]
