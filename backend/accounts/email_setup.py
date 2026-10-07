"""Server-only configuration, secret handling and sanitized delivery auditing."""
from email.utils import formataddr

import requests
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.mail import send_mail

from .models import EmailDeliveryLog, EmailOTPSetup


def encrypt_api_key(value):
    return Fernet(settings.EMAIL_SETUP_ENCRYPTION_KEY.encode()).encrypt(value.encode()).decode()


def decrypt_api_key(value):
    if not value:
        return ""
    return Fernet(settings.EMAIL_SETUP_ENCRYPTION_KEY.encode()).decrypt(value.encode()).decode()


def active_setup():
    return EmailOTPSetup.objects.filter(pk=1, is_active=True).first()


def otp_policy():
    return active_setup() or EmailOTPSetup()


def development_otp_visible():
    return not active_setup() and settings.DEBUG and settings.EMAIL_BACKEND in {
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
    }


def send_configured_email(subject, body, recipient, purpose, setup=None):
    config = setup or active_setup()
    provider = config.provider if config else "DJANGO"
    error_code = "DELIVERY_FAILED"
    try:
        sender = formataddr((config.from_name, config.from_email)) if config else settings.DEFAULT_FROM_EMAIL
        if provider == "DJANGO":
            if not settings.DEBUG and settings.EMAIL_BACKEND in {
                "django.core.mail.backends.console.EmailBackend", "django.core.mail.backends.locmem.EmailBackend",
                "django.core.mail.backends.dummy.EmailBackend",
            }:
                raise ValueError()
            if send_mail(subject, body, sender, [recipient], fail_silently=False) != 1:
                raise ValueError()
        else:
            key = decrypt_api_key(config.encrypted_api_key)
            headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
            if provider == "RESEND":
                url = "https://api.resend.com/emails"
                payload = {"from": sender, "to": [recipient], "subject": subject, "text": body}
            elif provider == "SENDGRID":
                url = "https://api.sendgrid.com/v3/mail/send"
                payload = {"personalizations": [{"to": [{"email": recipient}]}],
                           "from": {"email": config.from_email, "name": config.from_name},
                           "subject": subject, "content": [{"type": "text/plain", "value": body}]}
            else:
                raise ValueError()
            response = requests.post(url, headers=headers, json=payload, timeout=15, allow_redirects=False)
            if not 200 <= response.status_code < 300:
                error_code = "PROVIDER_REJECTED"
                raise ValueError()
    except Exception:
        # Never persist or return exceptions, request headers, bodies, or provider responses.
        EmailDeliveryLog.objects.create(recipient=recipient, purpose=purpose, provider=provider, status="FAILED", error_code=error_code)
        return False
    EmailDeliveryLog.objects.create(recipient=recipient, purpose=purpose, provider=provider, status="ACCEPTED")
    return True
