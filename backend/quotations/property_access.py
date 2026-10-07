"""Central authorization policy for property-level customer access.

Resource views should call this module rather than infer access from the
legacy ``Property.customer`` relationship. ``Property.customer`` remains a
compatibility fallback only when a property has no contact rows yet.
"""

from django.db.models import Q, Subquery
from rest_framework.exceptions import PermissionDenied

from accounts.models import BharathUser

from .models import ContractorCustomerConnection, Property, PropertyContact


class PropertyPermission:
    VIEW_PROPERTY = "view_property"
    EDIT_PROPERTY = "edit_property"
    VIEW_MEASUREMENTS = "view_measurements"
    EDIT_MEASUREMENTS = "edit_measurements"
    VIEW_QUOTATIONS = "view_quotations"
    APPROVE_QUOTATIONS = "approve_quotations"
    REQUEST_QUOTATION_CHANGES = "request_quotation_changes"
    VIEW_JOBS = "view_jobs"
    VIEW_SCHEDULES = "view_schedules"
    VIEW_PROGRESS = "view_progress"
    VIEW_INVOICES = "view_invoices"
    VIEW_PAYMENTS = "view_payments"
    MAKE_PAYMENT = "make_payment"
    MANAGE_CONTACTS = "manage_contacts"
    INVITE_CONTACTS = "invite_contacts"
    TRANSFER_PRIMARY = "transfer_primary"
    LEAVE_PROPERTY = "leave_property"


_ALL_CUSTOMER_PERMISSIONS = frozenset(
    value for name, value in vars(PropertyPermission).items() if name.isupper()
)
_NON_PRIMARY_PERMISSIONS = _ALL_CUSTOMER_PERMISSIONS - {PropertyPermission.TRANSFER_PRIMARY}

# Keep the permissions explicit by role. Secondary contacts do not inherit
# financial approval or contact-management rights merely from property access.
_ACCESS_PERMISSIONS = {
    PropertyContact.AccessLevel.VIEW_ONLY: frozenset({
        PropertyPermission.VIEW_PROPERTY,
        PropertyPermission.LEAVE_PROPERTY,
    }),
    PropertyContact.AccessLevel.SITE_COORDINATION: frozenset({
        PropertyPermission.VIEW_PROPERTY,
        PropertyPermission.VIEW_MEASUREMENTS,
        PropertyPermission.VIEW_JOBS,
        PropertyPermission.VIEW_SCHEDULES,
        PropertyPermission.VIEW_PROGRESS,
        PropertyPermission.LEAVE_PROPERTY,
    }),
    PropertyContact.AccessLevel.QUOTATION_APPROVAL: frozenset({
        PropertyPermission.VIEW_PROPERTY,
        PropertyPermission.VIEW_MEASUREMENTS,
        PropertyPermission.VIEW_QUOTATIONS,
        PropertyPermission.APPROVE_QUOTATIONS,
        PropertyPermission.REQUEST_QUOTATION_CHANGES,
        PropertyPermission.VIEW_JOBS,
        PropertyPermission.VIEW_SCHEDULES,
        PropertyPermission.VIEW_PROGRESS,
        PropertyPermission.LEAVE_PROPERTY,
    }),
    PropertyContact.AccessLevel.FINANCE: frozenset({
        PropertyPermission.VIEW_PROPERTY,
        PropertyPermission.VIEW_QUOTATIONS,
        PropertyPermission.VIEW_INVOICES,
        PropertyPermission.VIEW_PAYMENTS,
        PropertyPermission.MAKE_PAYMENT,
        PropertyPermission.LEAVE_PROPERTY,
    }),
    PropertyContact.AccessLevel.PROPERTY_MANAGEMENT: frozenset({
        PropertyPermission.VIEW_PROPERTY,
        PropertyPermission.EDIT_PROPERTY,
        PropertyPermission.VIEW_MEASUREMENTS,
        PropertyPermission.EDIT_MEASUREMENTS,
        PropertyPermission.VIEW_QUOTATIONS,
        PropertyPermission.VIEW_JOBS,
        PropertyPermission.VIEW_SCHEDULES,
        PropertyPermission.VIEW_PROGRESS,
        PropertyPermission.MANAGE_CONTACTS,
        PropertyPermission.INVITE_CONTACTS,
        PropertyPermission.LEAVE_PROPERTY,
    }),
    PropertyContact.AccessLevel.FULL_ACCESS: _ALL_CUSTOMER_PERMISSIONS - {PropertyPermission.TRANSFER_PRIMARY},
}

_LEGACY_ROLE_PERMISSIONS = {
    PropertyContact.Role.OWNER: _ACCESS_PERMISSIONS[PropertyContact.AccessLevel.FULL_ACCESS],
    PropertyContact.Role.PROPERTY_MANAGER: _ACCESS_PERMISSIONS[PropertyContact.AccessLevel.PROPERTY_MANAGEMENT],
    PropertyContact.Role.TENANT: _ACCESS_PERMISSIONS[PropertyContact.AccessLevel.SITE_COORDINATION],
    PropertyContact.Role.AUTHORIZED_CONTACT: _ACCESS_PERMISSIONS[PropertyContact.AccessLevel.SITE_COORDINATION],
}


def contact_permissions(contact):
    if contact.is_primary:
        return _ALL_CUSTOMER_PERMISSIONS
    if contact.access_level == PropertyContact.AccessLevel.CUSTOM:
        return (frozenset(contact.custom_permissions or ()) & _NON_PRIMARY_PERMISSIONS) | {PropertyPermission.LEAVE_PROPERTY}
    return _ACCESS_PERMISSIONS.get(contact.access_level) or _LEGACY_ROLE_PERMISSIONS.get(contact.role, frozenset())


def get_property_contact(user, property_obj):
    """Return the active contact row for a customer's login, if any."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "role", None) != BharathUser.Roles.CUSTOMER:
        return None
    return PropertyContact.objects.filter(
        property_id=property_obj.pk,
        customer__portal_user_id=user.pk,
        status=PropertyContact.Status.ACTIVE,
    ).select_related("customer", "property").first()


def ensure_legacy_primary_contact(property_obj):
    """Materialize the legacy Property.customer authority when first needed."""
    contacts = PropertyContact.objects.filter(property_id=property_obj.pk)
    primary = contacts.filter(is_primary=True, status=PropertyContact.Status.ACTIVE).first()
    if primary:
        return primary

    legacy_contact = contacts.filter(customer_id=property_obj.customer_id).first()
    if legacy_contact:
        legacy_contact.role = PropertyContact.Role.PRIMARY
        legacy_contact.is_primary = True
        legacy_contact.access_level = PropertyContact.AccessLevel.FULL_ACCESS
        legacy_contact.status = PropertyContact.Status.ACTIVE
        legacy_contact.save(update_fields=("role", "is_primary", "access_level", "status", "updated_at"))
        return legacy_contact

    contact, created = PropertyContact.objects.get_or_create(
        property_id=property_obj.pk,
        customer_id=property_obj.customer_id,
        defaults={
            "role": PropertyContact.Role.PRIMARY,
            "is_primary": True,
            "access_level": PropertyContact.AccessLevel.FULL_ACCESS,
            "status": PropertyContact.Status.ACTIVE,
        },
    )
    if not created:
        contact.role = PropertyContact.Role.PRIMARY
        contact.is_primary = True
        contact.access_level = PropertyContact.AccessLevel.FULL_ACCESS
        contact.status = PropertyContact.Status.ACTIVE
        contact.save(update_fields=("role", "is_primary", "access_level", "status", "updated_at"))
    return contact


def customer_has_property_permission(user, property_obj, permission):
    if property_obj.connection_id and property_obj.connection.status != ContractorCustomerConnection.Status.CONNECTED:
        return False
    contact = get_property_contact(user, property_obj)
    if contact:
        return permission in contact_permissions(contact)

    # Compatibility for rows not yet backfilled in environments that have not
    # applied the contact migration. Once contacts exist, the contact role is
    # authoritative, allowing primary succession to revoke the old customer's
    # elevated rights.
    if not property_obj.contacts.exists() and property_obj.customer.portal_user_id == user.pk:
        return permission in _ALL_CUSTOMER_PERMISSIONS
    return False


def contractor_has_property_access(user, property_obj):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "role", None) != BharathUser.Roles.CONTRACTOR:
        return False

    if property_obj.contractor_id == user.pk:
        if property_obj.connection_id:
            return (
                property_obj.connection.contractor_id == user.pk
                and property_obj.connection.status == ContractorCustomerConnection.Status.CONNECTED
            )
        return ContractorCustomerConnection.objects.filter(
            customer_id=property_obj.customer_id,
            contractor_id=user.pk,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).exists()

    if property_obj.connection_id:
        return (
            property_obj.connection.contractor_id == user.pk
            and property_obj.connection.status == ContractorCustomerConnection.Status.CONNECTED
        )
    return ContractorCustomerConnection.objects.filter(
        customer_id=property_obj.customer_id,
        contractor_id=user.pk,
        status=ContractorCustomerConnection.Status.CONNECTED,
    ).exists()


def has_property_access(user, property_obj, permission=PropertyPermission.VIEW_PROPERTY):
    """Return whether an authenticated user has the requested property right."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "role", None) == BharathUser.Roles.ADMIN:
        return True
    if getattr(user, "role", None) == BharathUser.Roles.CUSTOMER:
        return customer_has_property_permission(user, property_obj, permission)
    if getattr(user, "role", None) == BharathUser.Roles.CONTRACTOR:
        return contractor_has_property_access(user, property_obj)
    return False


def effective_property_permissions(user, property_obj):
    """Describe the viewer's property contact and resolved permission flags."""
    contact = get_property_contact(user, property_obj)
    if contact:
        permissions = contact_permissions(contact)
        return {
            "is_primary": contact.is_primary,
            "relationship": contact.relationship,
            "access_level": contact.access_level,
            "permissions": {permission: permission in permissions for permission in _ALL_CUSTOMER_PERMISSIONS},
        }
    if (
        getattr(user, "is_authenticated", False)
        and getattr(user, "role", None) == BharathUser.Roles.CUSTOMER
        and property_obj.customer.portal_user_id == user.pk
        and not property_obj.contacts.exists()
    ):
        return {
            "is_primary": True,
            "relationship": "",
            "access_level": PropertyContact.AccessLevel.FULL_ACCESS,
            "permissions": {permission: True for permission in _ALL_CUSTOMER_PERMISSIONS},
        }
    return {
        "is_primary": False,
        "relationship": "",
        "access_level": "",
        "permissions": {permission: False for permission in _ALL_CUSTOMER_PERMISSIONS},
    }


def property_permissions(user, property_obj):
    """Return the canonical permission-flag map for a property resource view."""
    return effective_property_permissions(user, property_obj)["permissions"]


def require_property_access(user, property_obj, permission=PropertyPermission.VIEW_PROPERTY):
    """Raise DRF PermissionDenied unless the user has the requested right."""
    if not has_property_access(user, property_obj, permission):
        raise PermissionDenied("You do not have permission to access this property.")
    return property_obj


def accessible_properties(user, permission=PropertyPermission.VIEW_PROPERTY):
    """Return a Property queryset limited to properties visible to ``user``."""
    if not user or not getattr(user, "is_authenticated", False):
        return Property.objects.none()
    if getattr(user, "is_superuser", False) or getattr(user, "role", None) == BharathUser.Roles.ADMIN:
        return Property.objects.all()

    if getattr(user, "role", None) == BharathUser.Roles.CUSTOMER:
        contact_rows = PropertyContact.objects.filter(
            customer__portal_user_id=user.pk,
            status=PropertyContact.Status.ACTIVE,
        ).only("property_id", "is_primary", "role", "access_level", "custom_permissions")
        contact_property_ids = [
            contact.property_id for contact in contact_rows
            if permission in contact_permissions(contact)
        ]
        # Preserve pre-migration/partially backfilled visibility only when no
        # contact records exist for that property.
        legacy_property_ids = Property.objects.filter(
            customer__portal_user_id=user.pk,
            contacts__isnull=True,
        ).values("pk")
        return Property.objects.filter(
            Q(pk__in=contact_property_ids) | Q(pk__in=Subquery(legacy_property_ids))
        ).filter(
            Q(connection__isnull=True)
            | Q(connection__status=ContractorCustomerConnection.Status.CONNECTED)
        ).distinct()

    if getattr(user, "role", None) == BharathUser.Roles.CONTRACTOR:
        connected_customer_ids = ContractorCustomerConnection.objects.filter(
            contractor_id=user.pk,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).values("customer_id")
        return Property.objects.filter(
            Q(contractor_id=user.pk, connection__contractor_id=user.pk, connection__status=ContractorCustomerConnection.Status.CONNECTED)
            | Q(contractor_id=user.pk, connection__isnull=True, customer_id__in=Subquery(connected_customer_ids))
            | Q(connection__contractor_id=user.pk, connection__status=ContractorCustomerConnection.Status.CONNECTED)
        ).distinct()

    return Property.objects.none()
