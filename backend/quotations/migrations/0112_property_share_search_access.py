from django.db import migrations, models
from django.db.models import Q
from django.utils import timezone


ACCESS_BY_LEGACY_ROLE = {
    "PRIMARY": "FULL_ACCESS",
    "OWNER": "FULL_ACCESS",
    "PROPERTY_MANAGER": "PROPERTY_MANAGEMENT",
    "TENANT": "SITE_COORDINATION",
    "AUTHORIZED_CONTACT": "SITE_COORDINATION",
}
RELATIONSHIP_BY_LEGACY_ROLE = {
    "OWNER": "OWNER",
    "TENANT": "TENANT",
    "PROPERTY_MANAGER": "PROPERTY_MANAGER",
}


def map_legacy_access_and_deduplicate_invites(apps, schema_editor):
    PropertyContact = apps.get_model("quotations", "PropertyContact")
    PropertyInvitation = apps.get_model("quotations", "PropertyInvitation")

    for contact in PropertyContact.objects.all().iterator():
        contact.access_level = ACCESS_BY_LEGACY_ROLE.get(contact.role, "SITE_COORDINATION")
        contact.relationship = RELATIONSHIP_BY_LEGACY_ROLE.get(contact.role, "")
        if contact.is_primary:
            contact.access_level = "FULL_ACCESS"
            contact.status = "ACTIVE"
        contact.save(update_fields=("access_level", "relationship", "status"))

    for invitation in PropertyInvitation.objects.all().iterator():
        invitation.access_level = ACCESS_BY_LEGACY_ROLE.get(invitation.role, "SITE_COORDINATION")
        invitation.relationship = RELATIONSHIP_BY_LEGACY_ROLE.get(invitation.role, "")
        invitation.save(update_fields=("access_level", "relationship"))

    latest_by_property_mobile = {}
    pending = PropertyInvitation.objects.filter(status="PENDING").exclude(invitee_mobile="").order_by(
        "-created_at", "-id",
    )
    for invitation in pending.iterator():
        key = (invitation.property_id, invitation.invitee_mobile)
        if key in latest_by_property_mobile:
            invitation.status = "REVOKED"
            invitation.revoked_at = timezone.now()
            invitation.save(update_fields=("status", "revoked_at", "updated_at"))
        else:
            latest_by_property_mobile[key] = invitation.pk


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("quotations", "0111_quotation_property_contact")]

    operations = [
        migrations.AddField(
            model_name="propertycontact",
            name="relationship",
            field=models.CharField(blank=True, choices=[("OWNER", "Owner"), ("TENANT", "Tenant"), ("PROPERTY_MANAGER", "Property manager"), ("FACILITY_MANAGER", "Facility manager"), ("OTHER", "Other")], default="", max_length=30),
        ),
        migrations.AddField(
            model_name="propertycontact",
            name="access_level",
            field=models.CharField(choices=[("VIEW_ONLY", "View only"), ("SITE_COORDINATION", "Site coordination"), ("QUOTATION_APPROVAL", "Quotation & approval"), ("FINANCE", "Finance"), ("PROPERTY_MANAGEMENT", "Property management"), ("FULL_ACCESS", "Full access"), ("CUSTOM", "Custom")], default="SITE_COORDINATION", max_length=30),
        ),
        migrations.AddField(
            model_name="propertycontact",
            name="custom_permissions",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="propertycontact",
            name="status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("ACTIVE", "Active"), ("DECLINED", "Declined"), ("REVOKED", "Revoked")], default="ACTIVE", max_length=20),
        ),
        migrations.AddField(
            model_name="propertyinvitation",
            name="relationship",
            field=models.CharField(blank=True, choices=[("OWNER", "Owner"), ("TENANT", "Tenant"), ("PROPERTY_MANAGER", "Property manager"), ("FACILITY_MANAGER", "Facility manager"), ("OTHER", "Other")], default="", max_length=30),
        ),
        migrations.AddField(
            model_name="propertyinvitation",
            name="access_level",
            field=models.CharField(choices=[("VIEW_ONLY", "View only"), ("SITE_COORDINATION", "Site coordination"), ("QUOTATION_APPROVAL", "Quotation & approval"), ("FINANCE", "Finance"), ("PROPERTY_MANAGEMENT", "Property management"), ("FULL_ACCESS", "Full access"), ("CUSTOM", "Custom")], default="SITE_COORDINATION", max_length=30),
        ),
        migrations.AddField(
            model_name="propertyinvitation",
            name="custom_permissions",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(map_legacy_access_and_deduplicate_invites, noop_reverse),
        migrations.AddConstraint(
            model_name="propertycontact",
            constraint=models.CheckConstraint(condition=(Q(is_primary=False) | Q(status="ACTIVE")), name="primary_property_contact_is_active"),
        ),
        migrations.AddConstraint(
            model_name="propertyinvitation",
            constraint=models.UniqueConstraint(condition=(Q(status="PENDING") & ~Q(invitee_mobile="")), fields=("property", "invitee_mobile"), name="unique_pending_property_invite_mobile"),
        ),
    ]
