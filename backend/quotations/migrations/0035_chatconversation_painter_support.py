from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0034_supportticket_requester_and_optional_customer"),
    ]

    operations = [
        migrations.AlterField(
            model_name="chatconversation", name="customer",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="conversation", to="quotations.customer"),
        ),
        migrations.AddField(
            model_name="chatconversation", name="contractor",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="contractor_conversations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="chatconversation", name="painter",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="painter_conversations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name="chatconversation",
            constraint=models.UniqueConstraint(fields=("contractor", "painter"), name="unique_contractor_painter_conversation"),
        ),
    ]
