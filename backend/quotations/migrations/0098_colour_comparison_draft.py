from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quotations", "0097_chat_message_colour_comparison"),
    ]

    operations = [
        migrations.CreateModel(
            name="ColourComparisonDraft",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("shade_ids", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="colour_comparison_draft", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
