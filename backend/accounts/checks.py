from django.conf import settings
from django.core.checks import Error, Warning, register
from django.db import DatabaseError
from ipaddress import ip_network
from urllib.parse import urlsplit
from .auth_infrastructure import shared_security_cache_configured

from .email_setup import (LOCAL_EMAIL_BACKENDS, SMTP_BACKEND, email_configuration_error,
                          email_transport_configuration, production_frontend_url_valid,
                          controlled_brevo_configuration_error)


@register("security")
def recovery_email_delivery_check(app_configs, **kwargs):
    messages = []
    if (settings.DEBUG and settings.EMAIL_PROVIDER in {"AUTO", "DJANGO"}
            and settings.EMAIL_BACKEND in LOCAL_EMAIL_BACKENDS):
        messages.append(Warning(
            "Recovery OTP emails are using a development-only email backend.",
            hint="This is expected locally; configure SMTP or BREVO before deployment.",
            id="accounts.W001",
        ))
    return messages


@register("security", deploy=True)
def production_recovery_email_delivery_check(app_configs, **kwargs):
    messages = []
    if settings.BREVO_CONTROLLED_TEST_ENABLED:
        if controlled_brevo_configuration_error():
            return [Error(
                "Controlled Brevo delivery requires one Gmail recipient, explicit BREVO transport/live opt-in, sandbox off and public email off.",
                hint="Keep AUTH_EMAIL_ENABLED=false; check server-only controlled test configuration.", id="accounts.E013")]
        return [Warning(
            "Controlled Brevo delivery is restricted to one configured test recipient; public email remains disabled.",
            hint="Only enable the separate OTP test switch after confirming the harmless message in Brevo logs and Gmail.",
            id="accounts.W006")]
    try:
        provider, config = email_transport_configuration()
    except DatabaseError:
        # Explicit EMAIL_PROVIDER skips DB lookup. AUTO must inspect the active
        # legacy provider to avoid falsely rejecting working API deployments.
        provider, config = "DJANGO", None
        messages.append(Warning(
            "The active admin email provider could not be inspected; checking the Django fallback.",
            hint="Run migrations and repeat this check, or set EMAIL_PROVIDER explicitly.",
            id="accounts.W003",
        ))
    error = email_configuration_error(provider, config, production=True)
    if not settings.AUTH_EMAIL_ENABLED and error != "LOCAL_BACKEND_DISABLED":
        return [Warning(
            "Authentication email is explicitly disabled; registration and recovery email are unavailable.",
            hint="Keep disabled until sender, worker and delivery are validated. Existing sign-in remains available.",
            id="accounts.W004",
        )]
    if error == "LOCAL_BACKEND_DISABLED":
        messages.append(Error(
            "Recovery OTP emails are not configured for external delivery.",
            hint="Configure SMTP or BREVO before production; local email backends cannot deliver authentication codes.",
            id="accounts.E001",
        ))
    backend = SMTP_BACKEND if provider == "SMTP" else settings.EMAIL_BACKEND
    if provider in {"SMTP", "DJANGO"} and backend == SMTP_BACKEND:
        missing = [
            name for name, value in (
                ("EMAIL_HOST", settings.EMAIL_HOST),
                ("EMAIL_HOST_USER", settings.EMAIL_HOST_USER),
                ("EMAIL_HOST_PASSWORD", settings.EMAIL_HOST_PASSWORD),
                ("DEFAULT_FROM_EMAIL", config.from_email if config else settings.DEFAULT_FROM_EMAIL),
            )
            if not value
        ]
        if missing:
            messages.append(Error(
                "Recovery email SMTP configuration is incomplete.",
                hint=f"Set the following environment variables: {', '.join(missing)}.",
                id="accounts.E002",
            ))
        if settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL:
            messages.append(Error(
                "EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled.",
                hint="For SMTP on port 587 use EMAIL_USE_TLS=true and EMAIL_USE_SSL=false.",
                id="accounts.E003",
            ))
    if error == "SANDBOX_ONLY":
        messages.append(Error(
            "Brevo sandbox does not deliver authentication emails.",
            hint="Set BREVO_SANDBOX=false and verify the sender before production.",
            id="accounts.E005",
        ))
    elif error == "LIVE_DELIVERY_DISABLED":
        messages.append(Error(
            "Brevo live authentication email is explicitly disabled.",
            hint="Verify the sender in Brevo, then set BREVO_LIVE_ENABLED=true; each send also checks sender status.",
            id="accounts.E006",
        ))
    elif error == "FRONTEND_URL_INVALID":
        messages.append(Error(
            "Authentication email links require a public HTTPS frontend origin.",
            hint="Set FRONTEND_URL to the frontend origin without a path, query, credentials or fragment.",
            id="accounts.E007",
        ))
    elif error == "EMAIL_CONFIG_INVALID" and not any(message.id in {"accounts.E002", "accounts.E003"} for message in messages):
        messages.append(Error(
            "The selected authentication email provider configuration is incomplete or invalid.",
            hint="Set EMAIL_PROVIDER to AUTO, DJANGO, SMTP or BREVO; configure its sender and backend-only credentials.",
            id="accounts.E004",
        ))
    return messages


@register("security", deploy=True)
def production_auth_origin_check(app_configs, **kwargs):
    if not production_frontend_url_valid():
        return [Error("FRONTEND_URL must be a public HTTPS origin for authentication links.", id="accounts.E007")]
    origin = settings.FRONTEND_URL
    if origin not in settings.CORS_ALLOWED_ORIGINS or origin not in settings.CSRF_TRUSTED_ORIGINS:
        return [Error(
            "The authentication frontend origin is missing from CORS or CSRF settings.",
            hint="Include FRONTEND_URL in CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS.",
            id="accounts.E008",
        )]
    return []


@register("security", deploy=True)
def production_shared_cache_check(app_configs, **kwargs):
    if not shared_security_cache_configured():
        return [Error(
            "Production authentication requires one shared Redis primary for security limits.",
            hint="Set DJANGO_CACHE_BACKEND=django.core.cache.backends.redis.RedisCache and DJANGO_CACHE_LOCATION to its private URL.",
            id="accounts.E009",
        )]
    return []


@register("security", deploy=True)
def production_transport_security_check(app_configs, **kwargs):
    invalid = (
        not settings.SECURE_SSL_REDIRECT or not settings.SESSION_COOKIE_SECURE
        or not settings.CSRF_COOKIE_SECURE
        or settings.SECURE_PROXY_SSL_HEADER != ("HTTP_X_FORWARDED_PROTO", "https")
        or not settings.ALLOWED_HOSTS or any(host == "*" or "://" in host or "/" in host for host in settings.ALLOWED_HOSTS)
        or getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        or any(not production_frontend_url_valid(origin) for origin in (*settings.CORS_ALLOWED_ORIGINS, *settings.CSRF_TRUSTED_ORIGINS))
    )
    try:
        invalid |= any(ip_network(value).prefixlen == 0 for value in settings.AUTH_TRUSTED_PROXY_CIDRS)
    except (ValueError, TypeError):
        invalid = True
    messages = []
    if invalid:
        messages.append(Error(
            "Production authentication requires HTTPS, secure cookies, explicit origins/hosts and a restricted proxy policy.",
            hint="Do not use wildcard hosts/origins, HTTP trusted origins or all-address trusted proxy CIDRs.", id="accounts.E010"))
    backend_url = settings.BHARATH_PUBLIC_BACKEND_URL
    if (settings.DATABASES.get("default", {}).get("ENGINE") != "django.db.backends.postgresql"
            or not production_frontend_url_valid(backend_url)
            or urlsplit(backend_url).hostname not in settings.ALLOWED_HOSTS):
        messages.append(Error("Production requires PostgreSQL and an allowed public HTTPS backend origin.",
                              hint="Set DATABASE_URL, BHARATH_PUBLIC_BACKEND_URL and DJANGO_ALLOWED_HOSTS explicitly.", id="accounts.E011"))
    if settings.PASSWORD_RECOVERY_DELIVERY_MODE != "queued":
        messages.append(Error("Production password recovery must use durable queued delivery.",
                              hint="Set PASSWORD_RECOVERY_DELIVERY_MODE=queued; leave AUTH_EMAIL_ENABLED=false until the worker is ready.", id="accounts.E012"))
    return messages
