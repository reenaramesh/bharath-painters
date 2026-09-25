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
    messages = []
    if settings.EMAIL_BACKEND in {
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
    }:
        messages.append(Error(
            "Recovery OTP emails are not configured for external delivery.",
            hint="Configure EMAIL_BACKEND and SMTP environment variables before production.",
            id="accounts.E001",
        ))
    if settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend":
        missing = [
            name for name, value in (
                ("EMAIL_HOST", settings.EMAIL_HOST),
                ("EMAIL_HOST_USER", settings.EMAIL_HOST_USER),
                ("EMAIL_HOST_PASSWORD", settings.EMAIL_HOST_PASSWORD),
                ("DEFAULT_FROM_EMAIL", settings.DEFAULT_FROM_EMAIL),
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
                hint="For Amazon SES on port 587 use EMAIL_USE_TLS=true and EMAIL_USE_SSL=false.",
                id="accounts.E003",
            ))
    return messages


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
