"""Pure configuration guards shared by deployment checks and auth requests."""
from urllib.parse import urlsplit
import ssl

from django.conf import settings
from rest_framework.exceptions import APIException


class AuthenticationUnavailable(APIException):
    status_code = 503
    default_detail = "Authentication is temporarily unavailable. Please try again later."
    default_code = "authentication_unavailable"


def shared_security_cache_configured():
    config = settings.CACHES.get("default", {})
    if config.get("BACKEND") != "django.core.cache.backends.redis.RedisCache":
        return False
    location = config.get("LOCATION")
    if not isinstance(location, str):
        return False  # Replica reads cannot enforce an authoritative limit.
    try:
        url = urlsplit(location)
        options = config.get("OPTIONS", {})
        if url.query or url.fragment or (url.port is not None and not 1 <= url.port <= 65535):
            return False
        if url.scheme == "rediss" and (
            options.get("ssl_cert_reqs", "required") not in {"required", ssl.CERT_REQUIRED}
            or options.get("ssl_check_hostname", True) is not True
        ):
            return False
        return bool(url.scheme in {"redis", "rediss"} and url.hostname)
    except ValueError:
        return False


def single_instance_cache_configured():
    config = settings.CACHES.get("default", {})
    return config.get("BACKEND") == "django.core.cache.backends.locmem.LocMemCache"


def security_cache_available():
    if shared_security_cache_configured():
        return True
    return bool(
        getattr(settings, "ALLOW_SINGLE_INSTANCE_AUTH_CACHE", False)
        and single_instance_cache_configured()
    )


def require_security_cache():
    if not settings.DEBUG and not security_cache_available():
        raise AuthenticationUnavailable()
