import django.db.models.deletion
import django.core.serializers.json
from django.conf import settings
from django.db import migrations, models


def backfill_primary_property_contacts(apps, schema_editor):
    Property = apps.get_model("quotations", "Property")
    PropertyContact = apps.get_model("quotations", "PropertyContact")
    batch = []
    for property_id, customer_id in Property.objects.order_by("pk").values_list("pk", "customer_id").iterator():
        batch.append(PropertyContact(
            property_id=property_id,
            customer_id=customer_id,
            role="PRIMARY",
            is_primary=True,
        ))
        if len(batch) >= 1000:
            PropertyContact.objects.bulk_create(batch, ignore_conflicts=True)
            batch = []
    if batch:
        PropertyContact.objects.bulk_create(batch, ignore_conflicts=True)


def remove_backfilled_primary_property_contacts(apps, schema_editor):
    PropertyContact = apps.get_model("quotations", "PropertyContact")
    PropertyContact.objects.filter(is_primary=True, role="PRIMARY", added_by__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("quotations", "0109_servicecategory_contractor_label_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PropertyContact",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("PRIMARY", "Primary contact"), ("OWNER", "Owner"), ("TENANT", "Tenant"), ("PROPERTY_MANAGER", "Property manager"), ("AUTHORIZED_CONTACT", "Authorized contact")], default="AUTHORIZED_CONTACT", max_length=30)),
                ("is_primary", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("added_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="added_property_contacts", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="property_contacts", to="quotations.customer")),
                ("property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contacts", to="quotations.property")),
            ],
            options={"ordering": ("-is_primary", "created_at", "id")},
        ),
        migrations.CreateModel(
            name="PropertyInvitation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("invitee_name", models.CharField(blank=True, max_length=150)),
                ("invitee_mobile", models.CharField(blank=True, max_length=16)),
                ("invitee_email", models.EmailField(blank=True, max_length=254)),
                ("role", models.CharField(choices=[("PRIMARY", "Primary contact"), ("OWNER", "Owner"), ("TENANT", "Tenant"), ("PROPERTY_MANAGER", "Property manager"), ("AUTHORIZED_CONTACT", "Authorized contact")], default="AUTHORIZED_CONTACT", max_length=30)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("REVOKED", "Revoked"), ("EXPIRED", "Expired")], default="PENDING", max_length=20)),
                ("expires_at", models.DateTimeField()),
                ("accepted_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("invitee_customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="property_invitations", to="quotations.customer")),
                ("invited_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="property_invitations_sent", to=settings.AUTH_USER_MODEL)),
                ("property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="invitations", to="quotations.property")),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
        migrations.CreateModel(
            name="PropertyAccessAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=50)),
                ("details", models.JSONField(blank=True, default=dict, encoder=django.core.serializers.json.DjangoJSONEncoder)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("contact", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_entries", to="quotations.propertycontact")),
                ("invitation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_entries", to="quotations.propertyinvitation")),
                ("performed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="property_access_audit_entries", to=settings.AUTH_USER_MODEL)),
                ("property", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="access_audit_entries", to="quotations.property")),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
        migrations.AddConstraint(
            model_name="propertycontact",
            constraint=models.UniqueConstraint(fields=("property", "customer"), name="unique_property_customer_contact"),
        ),
        migrations.AddConstraint(
            model_name="propertycontact",
            constraint=models.UniqueConstraint(condition=models.Q(("is_primary", True)), fields=("property",), name="unique_primary_contact_per_property"),
        ),
        migrations.AddConstraint(
            model_name="propertycontact",
            constraint=models.CheckConstraint(condition=models.Q(("is_primary", False), ("role", "PRIMARY"), _connector="OR"), name="primary_property_contact_role_matches"),
        ),
        migrations.AddConstraint(
            model_name="propertyinvitation",
            constraint=models.CheckConstraint(condition=(~models.Q(invitee_customer__isnull=True) | ~models.Q(invitee_mobile="") | ~models.Q(invitee_email="")), name="property_invitation_has_target"),
        ),
        migrations.RunPython(backfill_primary_property_contacts, remove_backfilled_primary_property_contacts),
    ]
