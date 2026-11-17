"""Private contractor contact details and automatic CRM relationships."""
from django.utils import timezone

CONTACT_DETAIL_FIELDS = (
    "name", "mobile", "email", "gst_number", "whatsapp", "address", "city", "pincode",
    "status", "source", "client_type", "requirement", "notes", "next_follow_up", "alternate_mobile",
)


def contractor_customer_details(customer, contractor):
    from .models import SavedCustomerContact
    contact = SavedCustomerContact.objects.filter(customer=customer, contractor=contractor).first()
    if contact:
        # Missing values are intentionally blank: never fill another contractor's
        # contact from the shared customer's personal profile.
        return {field: contact.details.get(field, "") for field in CONTACT_DETAIL_FIELDS}
    return {field: getattr(customer, field, "") for field in CONTACT_DETAIL_FIELDS}


def save_contact_details(customer, contractor, values):
    from .models import SavedCustomerContact
    contact, created = SavedCustomerContact.objects.select_for_update().get_or_create(customer=customer, contractor=contractor)
    if created and customer.contractor_id == contractor.pk:
        contact.details = {field: getattr(customer, field, "") for field in CONTACT_DETAIL_FIELDS}
    contact.details = {**contact.details, **{
        key: value for key, value in values.items() if key in CONTACT_DETAIL_FIELDS
    }}
    contact.save(update_fields=("details", "updated_at"))
    return contact, created


def with_contractor_contact(queryset, contractor, customer_path=""):
    """Make searching/projection use local fields, including intentionally blank values."""
    from django.db.models import Case, CharField, Exists, F, OuterRef, Subquery, Value, When
    from django.db.models.fields.json import KeyTextTransform
    from django.db.models.functions import Coalesce
    from .models import SavedCustomerContact
    contacts = SavedCustomerContact.objects.filter(
        customer_id=OuterRef(f"{customer_path}pk"), contractor=contractor,
    )
    return queryset.annotate(**{
        f"crm_{field}": Case(
            When(Exists(contacts), then=Coalesce(Subquery(
                contacts.annotate(local_value=KeyTextTransform(field, "details")).values("local_value")[:1],
                output_field=CharField(),
            ), Value(""))),
            default=F(f"{customer_path}{field}"), output_field=CharField(),
        ) for field in ("name", "mobile", "email", "city", "address", "whatsapp", "alternate_mobile")
    })


def connect_saved_contact(customer, contractor, request):
    from .models import (
        ChatConversation, ContractorCustomerConnection, CustomerConnectionAudit, CustomerShareLink,
    )
    now = timezone.now()
    relation, created = ContractorCustomerConnection.objects.select_for_update().get_or_create(
        customer=customer, contractor=contractor,
        defaults={"requested_by": contractor, "status": "CONNECTED", "connected_at": now,
                  "origin": "CONTACT_SAVE"},
    )
    eligible = (
        relation.status in ("PENDING", "RECONNECT_PENDING")
        and not any((relation.blocked_at, relation.disconnected_at, relation.rejected_at))
    )
    if eligible:
        relation.status = ContractorCustomerConnection.Status.CONNECTED
        relation.origin = ContractorCustomerConnection.Origin.CONTACT_SAVE
        relation.connected_at = now
        relation.save(update_fields=("status", "origin", "connected_at", "updated_at"))
    if created or eligible:
        CustomerConnectionAudit.objects.create(
            connection=relation, customer=customer, contractor=contractor,
            performed_by=contractor, performed_by_role=contractor.role,
            action=CustomerConnectionAudit.Actions.CONTACT_SAVED,
            ip_address=request.META.get("REMOTE_ADDR") or None,
            user_agent=str(request.META.get("HTTP_USER_AGENT") or "")[:255],
        )
        CustomerShareLink.objects.filter(
            connection=relation, purpose=CustomerShareLink.Purpose.CONNECTION, used_at__isnull=True,
        ).update(used_at=now)
    if relation.status == ContractorCustomerConnection.Status.CONNECTED:
        ChatConversation.objects.get_or_create(
            customer=customer, contractor=contractor, defaults={"connection": relation},
        )
    return relation
