from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0033_measurementsurface_paintable_sides"),
    ]

    operations = [
        migrations.AlterField(
            model_name="supportticket",
            name="customer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="support_tickets", to="quotations.customer"),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="requester",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="raised_support_tickets", to=settings.AUTH_USER_MODEL),
        ),
    ]
