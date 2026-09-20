from django.conf import settings
from django.core.checks import Error, Warning, register


@register("security")
def recovery_email_delivery_check(app_configs, **kwargs):
    local_backends = {
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
    }
    messages = []
    if settings.DEBUG and settings.EMAIL_BACKEND in local_backends:
        messages.append(Warning(
            "Recovery OTP emails are using a development-only email backend.",
            hint="This is expected locally; configure SMTP before deployment.",
            id="accounts.W001",
        ))
    return messages


@register("security", deploy=True)
def production_recovery_email_delivery_check(app_configs, **kwargs):
    if settings.EMAIL_BACKEND in {
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
    }:
        return [Error(
            "Recovery OTP emails are not configured for external delivery.",
            hint="Configure EMAIL_BACKEND and SMTP environment variables before production.",
            id="accounts.E001",
        )]
    return []


@register("security", deploy=True)
def production_shared_cache_check(app_configs, **kwargs):
    backend = settings.CACHES.get("default", {}).get("BACKEND", "")
    if backend == "django.core.cache.backends.locmem.LocMemCache":
        return [Warning(
            "API throttles and recovery OTP limits are using a process-local cache.",
            hint=(
                "Configure DJANGO_CACHE_BACKEND and DJANGO_CACHE_LOCATION with "
                "a cache shared by all production workers."
            ),
            id="accounts.W002",
        )]
    return []
