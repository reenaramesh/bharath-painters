from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("quotations", "0107_masterdatasortpreference")]

    operations = [
        migrations.AddField("supportticket", "attachment", models.FileField(blank=True, upload_to="support/tickets/")),
        migrations.AddField("supportticketmessage", "attachment", models.FileField(blank=True, upload_to="support/messages/")),
    ]

