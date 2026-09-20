from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quotations", "0074_scope_work_history_to_connection"),
    ]

    operations = [
        migrations.AddField(
            model_name="painttype",
            name="key_features",
            field=models.TextField(blank=True),
        ),
    ]
