"""Commercial identity for quotation displays, without rewriting saved records."""
from django.conf import settings


def quotation_contractor_identity(quotation, request=None):
    contractor = quotation.contractor
    profile = getattr(contractor, "contractor_profile", None)
    snapshot = quotation.contractor_snapshot or {}
    issued = quotation.status != "DRAFT"

    def value(field, fallback=""):
        # Empty saved values are intentional; only absent legacy keys fall back.
        if issued and field in snapshot:
            return snapshot[field]
        return getattr(profile, field, fallback) if profile else fallback

    def account(field, fallback=""):
        if issued and field in snapshot:
            return snapshot[field]
        return getattr(contractor, field, fallback)

    if issued and "company_logo" in snapshot:
        name = snapshot["company_logo"]
        logo = f"{settings.MEDIA_URL.rstrip('/')}/{name.lstrip('/')}" if name else None
    else:
        file = getattr(profile, "company_logo", None)
        logo = file.url if file else None
    if logo and request:
        logo = request.build_absolute_uri(logo)
    return {
        "id": contractor.pk,
        "bharath_id": account("bharath_id"),
        "company_name": value("company_name", contractor.get_full_name()),
        "owner_name": value("owner_name", contractor.get_full_name()),
        "mobile": account("mobile"), "email": account("email"),
        "company_logo": logo,
        "company_logo_shape": value("company_logo_shape", "RECTANGLE"),
        "company_logo_position": value("company_logo_position", {"x": 50, "y": 50, "zoom": 1}),
        "office_address": value("office_address"), "service_areas": value("service_areas"),
        "gst_number": value("gst_number"), "pan_number": value("pan_number"),
        "is_verified": account("is_verified", False),
        "verification_status": account("verification_status"),
    }
