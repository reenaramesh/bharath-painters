import io

import qrcode

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone


def bharath_profile_url(user, base_url=None):
    root = (base_url or settings.BHARATH_PUBLIC_BACKEND_URL).rstrip("/")
    return f"{root}/api/accounts/verify-page/{user.bharath_id}/"


def generate_bharath_qr(user, base_url=None):

    if not user.bharath_id:
        return

    verification_url = bharath_profile_url(user, base_url)

    qr_image = qrcode.make(verification_url)

    buffer = io.BytesIO()

    qr_image.save(
        buffer,
        format="PNG"
    )

    filename = f"{user.bharath_id}.png"

    user.bharath_qr.save(
        filename,
        ContentFile(buffer.getvalue()),
        save=False
    )


def activate_business_identity(user, base_url=None):
    """Immediately issue the verified identity used by business accounts."""
    from .models import BharathUser

    prefixes = {
        BharathUser.Roles.CONTRACTOR: "BP-C-",
        BharathUser.Roles.PAINTER: "BP-P-",
    }
    prefix = prefixes.get(user.role)
    if not prefix or user.verification_status == BharathUser.VerificationStatus.SUSPENDED:
        return user

    if not user.bharath_id:
        serial = user.pk
        candidate = f"{prefix}{serial:06d}"
        while BharathUser.objects.exclude(pk=user.pk).filter(bharath_id=candidate).exists():
            serial += 1
            candidate = f"{prefix}{serial:06d}"
        user.bharath_id = candidate

    now = timezone.now()
    user.is_verified = True
    user.verification_status = BharathUser.VerificationStatus.VERIFIED
    user.verified_at = user.verified_at or now
    user.badge_issued_at = user.badge_issued_at or now
    if not user.bharath_qr:
        generate_bharath_qr(user, base_url)
    user.save(update_fields=(
        "bharath_id", "is_verified", "verification_status", "verified_at",
        "badge_issued_at", "bharath_qr", "updated_at",
    ))
    return user
