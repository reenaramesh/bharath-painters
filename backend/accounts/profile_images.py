"""Serve only images already used by public digital profiles."""
import mimetypes

from django.http import FileResponse, Http404
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET

from .models import BharathUser, ContractorProfile, ContractorCompletedProject


@require_GET
def profile_image(request, kind, object_id):
    fields = {
        "owner": (BharathUser, "profile_photo"),
        "logo": (ContractorProfile, "company_logo"),
        "project": (ContractorCompletedProject, "photo"),
    }
    if kind not in fields:
        raise Http404
    model, field = fields[kind]
    record = get_object_or_404(model, pk=object_id)
    if kind == "owner" and record.role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
        raise Http404
    image = getattr(record, field)
    if not image:
        raise Http404
    content_type = mimetypes.guess_type(image.name)[0] or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"}:
        raise Http404
    try:
        response = FileResponse(image.storage.open(image.name, "rb"), content_type=content_type)
    except (FileNotFoundError, OSError):
        raise Http404
    response["X-Content-Type-Options"] = "nosniff"
    return response


def public_profile_image_url(request, image):
    if not image:
        return None
    # External storage delivers its own public URL. Local media needs a production route.
    if image.url.startswith(settings.MEDIA_URL):
        from django.urls import reverse
        kinds = {"profile_photo": "owner", "company_logo": "logo", "photo": "project"}
        kind = kinds.get(image.field.name)
        if kind and isinstance(image.instance, (BharathUser, ContractorProfile, ContractorCompletedProject)):
            return request.build_absolute_uri(reverse("profile-image", kwargs={"kind": kind, "object_id": image.instance.pk}))
    return request.build_absolute_uri(image.url)

