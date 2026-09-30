"""Encryption and retrieval for administrator-managed integration credentials."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

from .models import PlatformIntegrationSecret


GOOGLE_MAPS_NAME = "GOOGLE_MAPS_API_KEY"


def _cipher():
    # Keep DJANGO_SECRET_KEY stable across deployments or stored keys cannot be read.
    digest = hashlib.sha256((settings.SECRET_KEY + ":integration-secrets:v1").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def save_google_maps_key(value, actor):
    PlatformIntegrationSecret.objects.update_or_create(
        name=GOOGLE_MAPS_NAME,
        defaults={
            "ciphertext": _cipher().encrypt(value.encode()).decode(),
            "key_hint": value[-4:],
            "updated_by": actor,
        },
    )


def get_google_maps_key():
    record = PlatformIntegrationSecret.objects.filter(name=GOOGLE_MAPS_NAME).first()
    if record:
        try:
            return _cipher().decrypt(record.ciphertext.encode()).decode()
        except (InvalidToken, ValueError):
            return ""
    return settings.GOOGLE_MAPS_API_KEY


def google_maps_key_status():
    record = PlatformIntegrationSecret.objects.filter(name=GOOGLE_MAPS_NAME).first()
    if record:
        return {"configured": bool(get_google_maps_key()), "source": "ADMIN", "hint": record.key_hint, "updated_at": record.updated_at}
    return {"configured": bool(settings.GOOGLE_MAPS_API_KEY), "source": "ENVIRONMENT" if settings.GOOGLE_MAPS_API_KEY else "NONE", "hint": "", "updated_at": None}
