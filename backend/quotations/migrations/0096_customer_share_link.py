from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0095_customer_connection_reconnect")]

    operations = [
        migrations.CreateModel(
            name="CustomerShareLink",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("purpose", models.CharField(choices=[("ACTIVATION", "Activation"), ("CONNECTION", "Connection request")], max_length=20)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("connection", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="share_links", to="quotations.contractorcustomerconnection")),
            ],
        ),
    ]
