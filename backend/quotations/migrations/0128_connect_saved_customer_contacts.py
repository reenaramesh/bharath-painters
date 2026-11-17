from django.db import migrations, models
from django.utils import timezone


def connect_saved_contacts(apps, schema_editor):
    alias = schema_editor.connection.alias
    Relation = apps.get_model("quotations", "ContractorCustomerConnection")
    Contact = apps.get_model("quotations", "SavedCustomerContact")
    Audit = apps.get_model("quotations", "CustomerConnectionAudit")
    Chat = apps.get_model("quotations", "ChatConversation")
    Link = apps.get_model("quotations", "CustomerShareLink")
    Notification = apps.get_model("quotations", "PortalNotification")
    # Older first-creator saves kept only name/mobile locally. Freeze the details
    # that contractor already owned before switching all reads to private contacts.
    original_contacts = Contact.objects.using(alias).filter(
        customer__contractor_id=models.F("contractor_id"),
        customer__contractor_connections__contractor_id=models.F("contractor_id"),
        customer__contractor_connections__status="CONNECTED",
        customer__contractor_connections__approval_method="INITIAL_CREATOR",
    ).exclude(customer__status="CANCELLED").select_related("customer").distinct()
    fields = ("name", "mobile", "email", "gst_number", "whatsapp", "address", "city", "pincode",
              "client_type", "alternate_mobile")
    for contact in original_contacts.iterator():
        contact.details = {**{field: getattr(contact.customer, field, "") for field in fields}, **contact.details}
        contact.save(using=alias, update_fields=("details",))
    relations = Relation.objects.using(alias).filter(
        status__in=("PENDING", "RECONNECT_PENDING"),
        blocked_at__isnull=True, disconnected_at__isnull=True, rejected_at__isnull=True,
        contractor__is_active=True,
    ).exclude(customer__status="CANCELLED").exclude(customer__portal_user__is_active=False)
    mapping = {"status": "customer_status", "source": "customer_source", "client_type": "customer_client_type",
               "requirement": "requirement", "notes": "internal_notes", "next_follow_up": "next_follow_up"}
    for relation in relations.iterator():
        contact = Contact.objects.using(alias).filter(
            customer_id=relation.customer_id, contractor_id=relation.contractor_id,
        ).first()
        if not contact:
            continue
        now = timezone.now()
        values = {target: contact.details[source] for source, target in mapping.items() if source in contact.details}
        Relation.objects.using(alias).filter(pk=relation.pk).update(
            status="CONNECTED", origin="CONTACT_SAVE", connected_at=now, updated_at=now, **values,
        )
        Chat.objects.using(alias).get_or_create(
            customer_id=relation.customer_id, contractor_id=relation.contractor_id,
            defaults={"connection_id": relation.pk},
        )
        Audit.objects.using(alias).create(
            connection_id=relation.pk, customer_id=relation.customer_id,
            contractor_id=relation.contractor_id, action="CONTACT_SAVED",
        )
        Link.objects.using(alias).filter(
            connection_id=relation.pk, purpose="CONNECTION", used_at__isnull=True,
        ).update(used_at=now)
        Notification.objects.using(alias).filter(
            recipient_id=relation.customer.portal_user_id, actor_id=relation.contractor_id,
            event_type="CONNECTION_REQUEST", read_at__isnull=True,
        ).update(read_at=now)


class Migration(migrations.Migration):
    dependencies = [("quotations", "0127_customer_contact_save_origin")]
    operations = [migrations.RunPython(connect_saved_contacts, migrations.RunPython.noop)]
