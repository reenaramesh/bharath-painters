"""Retire login identifiers while retaining referenced business records."""

from .models import BharathUser


def retire_business_account(user):
    if user.role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
        raise ValueError("Only contractor and painter accounts can be retired here.")
    user.mobile = f"D{user.pk}"
    user.email = ""
    user.recovery_email = None
    user.recovery_email_verified = False
    user.google_email = ""
    user.google_subject = None
    user.is_active = False
    user.is_verified = False
    user.verification_status = BharathUser.VerificationStatus.SUSPENDED
    user.set_unusable_password()
    user.save(update_fields=(
        "mobile", "email", "recovery_email", "recovery_email_verified",
        "google_email", "google_subject", "is_active", "is_verified",
        "verification_status", "password", "updated_at",
    ))
