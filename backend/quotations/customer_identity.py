"""Release a deleted customer's old contact number during account creation."""

from accounts.mobile import matching_mobile_users, normalize_mobile
from accounts.models import BharathUser

from .models import Customer, CustomerShareLink, SavedCustomerContact


def release_deleted_customer_mobile(normalized_mobile):
    """Handle deployments where the cleanup data migration has not run yet."""
    cancelled = Customer.objects.select_for_update().filter(
        status=Customer.Status.CANCELLED, normalized_mobile=normalized_mobile,
    )
    for customer in cancelled:
        Customer.objects.filter(pk=customer.pk).update(
            mobile=f"D{customer.pk}", normalized_mobile=f"D{customer.pk}",
            email="", whatsapp="", alternate_mobile="",
        )
        CustomerShareLink.objects.filter(connection__customer_id=customer.pk).delete()
        for contact in SavedCustomerContact.objects.filter(customer_id=customer.pk):
            details = dict(contact.details or {})
            for key in ("mobile", "phone", "email", "whatsapp", "alternate_mobile"):
                details.pop(key, None)
            SavedCustomerContact.objects.filter(pk=contact.pk).update(details=details)

    users = matching_mobile_users(
        normalized_mobile,
        BharathUser.objects.select_for_update().filter(
            role=BharathUser.Roles.CUSTOMER, is_active=False,
            verification_status=BharathUser.VerificationStatus.SUSPENDED,
        ),
    )
    for user in users:
        if Customer.objects.filter(portal_user=user).exclude(status=Customer.Status.CANCELLED).exists():
            continue
        BharathUser.objects.filter(pk=user.pk).update(
            mobile=f"D{user.pk}", email="", recovery_email=None,
            recovery_email_verified=False, google_email="", google_subject=None,
        )


def release_all_deleted_customer_mobiles():
    """Admin repair action for production hosts without an interactive shell."""
    retired = Customer.objects.filter(status=Customer.Status.CANCELLED).exclude(mobile__startswith="D")
    customer_count = retired.count()
    numbers = set(retired.values_list("normalized_mobile", flat=True))
    orphan_accounts = BharathUser.objects.filter(
        role=BharathUser.Roles.CUSTOMER, is_active=False,
        verification_status=BharathUser.VerificationStatus.SUSPENDED,
    ).exclude(mobile__startswith="D")
    user_count = 0
    for user in orphan_accounts:
        if Customer.objects.filter(portal_user=user).exclude(status=Customer.Status.CANCELLED).exists():
            continue
        user_count += 1
        numbers.add(user.mobile)
    for number in numbers:
        normalized = normalize_mobile(number)
        if normalized:
            release_deleted_customer_mobile(normalized)
    return customer_count, user_count
