"""Revocable photo links: rendering images must recheck current project access."""
import mimetypes
from pathlib import PurePosixPath
from pathlib import Path
from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404
from django.urls import reverse
from django.views.static import serve
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from accounts.models import BharathUser
from .models import WorkPhoto

PHOTO_LINK_SALT = "jobs.work-photo-access.v1"
PHOTO_LINK_MAX_AGE = 900


def photo_delivery_url(request, photo):
    token = signing.dumps({"photo": photo.pk, "viewer": request.user.pk}, salt=PHOTO_LINK_SALT)
    path = reverse("work-photo-image", args=[photo.pk])
    return request.build_absolute_uri(f"{path}?access={token}")


def deny_public_work_photo(request, filename):
    # This route must precede the development media-file handler. A former
    # public URL must not bypass the same policy applied to the photo API.
    raise Http404


def guarded_media(request, path, document_root=None, **kwargs):
    root = Path(document_root or settings.MEDIA_ROOT).resolve()
    try:
        relative = (root / path.replace("\\", "/")).resolve().relative_to(root)
    except (ValueError, OSError):
        raise Http404
    if relative.parts and relative.parts[0].rstrip(" .").casefold() == "work_photos":
        raise Http404
    return serve(request, relative.as_posix(), document_root=root, **kwargs)


class WorkPhotoImageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, pk):
        from .views import work_photo_access
        token = request.query_params.get("access", "")
        if not token or len(token) > 2048:
            raise Http404
        try:
            payload = signing.loads(token, salt=PHOTO_LINK_SALT, max_age=PHOTO_LINK_MAX_AGE)
        except signing.BadSignature:
            raise Http404
        if not isinstance(payload, dict) or payload.get("photo") != pk:
            raise Http404
        viewer = BharathUser.objects.filter(pk=payload.get("viewer"), is_active=True).first()
        photo = WorkPhoto.objects.select_related("schedule__quotation__customer", "schedule__quotation__property").filter(pk=pk).first()
        if not viewer or not photo or not work_photo_access(viewer, photo.schedule):
            raise Http404
        try:
            handle = photo.image.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404
        content_type = mimetypes.guess_type(photo.image.name)[0]
        safe_image = content_type in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"}
        response = FileResponse(handle, content_type=content_type if safe_image else "application/octet-stream",
            as_attachment=not safe_image, filename=PurePosixPath(photo.image.name).name)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        return response
