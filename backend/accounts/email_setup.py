"""Server-only configuration, secret handling and sanitized delivery auditing."""
from email.utils import formataddr, parseaddr
from ipaddress import ip_address
import re
import smtplib
import ssl
from urllib.parse import urlsplit

import requests
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import get_connection, send_mail
from django.core.validators import validate_email

from .models import EmailDeliveryLog, EmailOTPSetup

LOCAL_EMAIL_BACKENDS = {
    f"django.core.mail.backends.{name}.EmailBackend"
    for name in ("console", "filebased", "locmem", "dummy")
}
SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
CONTROLLED_BREVO_TEST_PURPOSE = "CONTROLLED_BREVO_TEST"


def _single_gmail_address(value):
    """Bare exact address only: no lists, display names or alias expansion."""
    if not isinstance(value, str) or any(char in value for char in "\r\n\x00"):
        return ""
    address = value.strip().lower()
    try:
        validate_email(address)
    except ValidationError:
        return ""
    if address.count("@") != 1 or address.rsplit("@", 1)[1] != "gmail.com":
        return ""
    return address


def controlled_brevo_configuration_error():
    """Pure local readiness check; never contacts Brevo or resolves accounts."""
    if not settings.BREVO_CONTROLLED_TEST_ENABLED:
        return "CONTROLLED_MODE_DISABLED"
    if (settings.AUTH_EMAIL_ENABLED or settings.EMAIL_PROVIDER != "BREVO"
            or not _single_gmail_address(settings.BREVO_TEST_RECIPIENT)
            or settings.BREVO_SANDBOX):
        return "CONTROLLED_CONFIG_INVALID"
    return email_configuration_error("BREVO")


def authentication_email_enabled():
    if settings.BREVO_CONTROLLED_TEST_ENABLED:
        return bool(settings.BREVO_TEST_OTP_ENABLED and not controlled_brevo_configuration_error())
    return settings.AUTH_EMAIL_ENABLED


def production_frontend_url_valid(value=None):
    """Auth emails append fixed routes; production needs a public HTTPS origin."""
    try:
        url = urlsplit(settings.FRONTEND_URL if value is None else value)
        host = url.hostname or ""
        if (url.scheme != "https" or not host or url.username or url.password
                or url.path or url.query or url.fragment or not url.port in {None, 443}
                or host == "localhost" or host.endswith((".", ".localhost", ".local"))):
            return False
        try:
            return ip_address(host).is_global
        except ValueError:
            # Browsers treat short/hex numeric hosts (e.g. 127.1) as IPv4,
            # while ip_address deliberately accepts only canonical IP syntax.
            return "." in host and not re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", host.rsplit(".", 1)[-1], re.I)
    except (ValueError, TypeError):
        return False


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
    return (settings.EMAIL_PROVIDER in {"AUTO", "DJANGO"} and not active_setup()
            and settings.DEBUG and settings.EMAIL_BACKEND in {
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
    })


def email_transport_configuration(setup=None):
    """Explicit server configuration wins; AUTO retains legacy admin settings."""
    provider = settings.EMAIL_PROVIDER
    config = (setup or active_setup()) if provider == "AUTO" else None
    return (config.provider if config else "DJANGO", config) if provider == "AUTO" else (provider, None)


def email_configuration_error(provider, config=None, production=None):
    """Return a fixed diagnostic code, never credentials or provider responses."""
    if production is None:
        production = not settings.DEBUG
    if provider not in {"DJANGO", "SMTP", "BREVO", "RESEND", "SENDGRID"}:
        return "EMAIL_CONFIG_INVALID"
    sender = config.from_email if config else parseaddr(settings.DEFAULT_FROM_EMAIL)[1]
    try:
        validate_email(sender)
    except ValidationError:
        return "EMAIL_CONFIG_INVALID"
    if provider == "BREVO":
        if not settings.BREVO_API_KEY:
            return "EMAIL_CONFIG_INVALID"
        if production and settings.BREVO_SANDBOX:
            return "SANDBOX_ONLY"
        if not settings.BREVO_SANDBOX and not settings.BREVO_LIVE_ENABLED:
            return "LIVE_DELIVERY_DISABLED"
    elif provider in {"RESEND", "SENDGRID"}:
        try:
            if config is None or not decrypt_api_key(config.encrypted_api_key):
                return "EMAIL_CONFIG_INVALID"
        except Exception:
            return "EMAIL_CONFIG_INVALID"
    else:
        backend = SMTP_BACKEND if provider == "SMTP" else settings.EMAIL_BACKEND
        if production and backend in LOCAL_EMAIL_BACKENDS:
            return "LOCAL_BACKEND_DISABLED"
        if backend == SMTP_BACKEND:
            if not all((settings.EMAIL_HOST, settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)):
                return "EMAIL_CONFIG_INVALID"
            if settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL:
                return "EMAIL_CONFIG_INVALID"
    if production and not production_frontend_url_valid():
        return "FRONTEND_URL_INVALID"
    return ""


def public_email_delivery_available():
    """Configuration readiness only; provider acceptance still must be checked."""
    try:
        if not authentication_email_enabled():
            return False
        provider, config = email_transport_configuration()
        return not email_configuration_error(provider, config) and not (
            provider == "BREVO" and settings.BREVO_SANDBOX
        )
    except Exception:
        return False


def send_configured_email(subject, body, recipient, purpose, setup=None, *, delivery_receipt=None):
    """Keep the boolean API; optional private receipt describes acceptance only."""
    provider = "UNKNOWN"
    error_code = "DELIVERY_FAILED"
    message_id = ""
    http_status = None
    if delivery_receipt is not None:
        delivery_receipt.clear()
    try:
        provider, config = email_transport_configuration(setup)
        if settings.BREVO_CONTROLLED_TEST_ENABLED:
            error_code = controlled_brevo_configuration_error()
            if error_code:
                raise ValueError()
            error_code = "RECIPIENT_NOT_ALLOWLISTED"
            if not _single_gmail_address(recipient) or _single_gmail_address(recipient) != _single_gmail_address(settings.BREVO_TEST_RECIPIENT):
                raise ValueError()
            # Use one canonical bare address in the outgoing JSON.
            recipient = _single_gmail_address(recipient)
            error_code = "CONTROLLED_PURPOSE_DISABLED"
            if purpose != CONTROLLED_BREVO_TEST_PURPOSE and not (
                settings.BREVO_TEST_OTP_ENABLED and purpose in {
                    "REGISTRATION_EMAIL", "RECOVERY_EMAIL", "PASSWORD_RESET",
                }
            ):
                raise ValueError()
        elif not settings.AUTH_EMAIL_ENABLED:
            error_code = "AUTH_EMAIL_DISABLED"
            raise ValueError()
        error_code = email_configuration_error(provider, config)
        if error_code:
            raise ValueError()
        error_code = "DELIVERY_FAILED"
        sender = formataddr((config.from_name, config.from_email)) if config else settings.DEFAULT_FROM_EMAIL
        if provider in {"DJANGO", "SMTP"}:
            options = {"connection": get_connection(SMTP_BACKEND)} if provider == "SMTP" else {}
            if send_mail(subject, body, sender, [recipient], fail_silently=False, **options) != 1:
                raise ValueError()
        else:
            headers = {"Content-Type": "application/json", "accept": "application/json"}
            if provider == "BREVO":
                name, address = parseaddr(sender)
                url = "https://api.brevo.com/v3/smtp/email"
                headers["api-key"] = settings.BREVO_API_KEY
                payload = {"sender": {"email": address, "name": name}, "to": [{"email": recipient}],
                           "subject": subject, "textContent": body}
                if settings.BREVO_SANDBOX:
                    # Brevo's sandbox example requires this in the JSON headers field.
                    # https://developers.brevo.com/docs/using-sandbox-mode
                    payload["headers"] = {"X-Sib-Sandbox": "drop"}
                else:
                    # Fail closed before sending: the configured sender must be
                    # active in this exact Brevo account. Never cache a positive
                    # result across revocation or API-key/sender changes.
                    error_code = "SENDER_LOOKUP_REJECTED"
                    senders_response = requests.get(
                        "https://api.brevo.com/v3/senders", headers=headers,
                        timeout=settings.EMAIL_TIMEOUT, allow_redirects=False,
                    )
                    http_status = senders_response.status_code
                    if http_status != 200:
                        error_code = "SENDER_LOOKUP_UNAUTHORIZED" if http_status in {401, 403} else "SENDER_LOOKUP_REJECTED"
                        raise ValueError()
                    error_code = "SENDER_LOOKUP_INVALID_RESPONSE"
                    try:
                        sender_data = senders_response.json()
                    except ValueError:
                        raise ValueError() from None
                    senders = sender_data.get("senders") if isinstance(sender_data, dict) else None
                    if not isinstance(senders, list):
                        raise ValueError()
                    error_code = "SENDER_NOT_VERIFIED"
                    if not any(
                        isinstance(item, dict) and item.get("active") is True
                        and str(item.get("email", "")).lower() == address.lower()
                        for item in senders
                    ):
                        raise ValueError()
                    # The send receipt must not confuse a successful GET's 200
                    # with acceptance of a later POST (including a timeout).
                    http_status = None
                    error_code = "DELIVERY_FAILED"
            elif provider == "RESEND":
                headers["Authorization"] = "Bearer " + decrypt_api_key(config.encrypted_api_key)
                url = "https://api.resend.com/emails"
                payload = {"from": sender, "to": [recipient], "subject": subject, "text": body}
            elif provider == "SENDGRID":
                headers["Authorization"] = "Bearer " + decrypt_api_key(config.encrypted_api_key)
                url = "https://api.sendgrid.com/v3/mail/send"
                payload = {"personalizations": [{"to": [{"email": recipient}]}],
                           "from": {"email": config.from_email, "name": config.from_name},
                           "subject": subject, "content": [{"type": "text/plain", "value": body}]}
            else:
                raise ValueError()
            response = requests.post(url, headers=headers, json=payload, timeout=settings.EMAIL_TIMEOUT, allow_redirects=False)
            http_status = response.status_code
            if not 200 <= response.status_code < 300:
                error_code = "PROVIDER_REJECTED"
                raise ValueError()
            if provider == "BREVO":
                # The single-email API acknowledges acceptance with 201 and a
                # messageId. A proxy's generic 2xx page is not acceptance.
                error_code = "PROVIDER_INVALID_RESPONSE"
                if response.status_code != 201:
                    raise ValueError()
                try:
                    acknowledgement = response.json()
                except ValueError:
                    # Requests' JSONDecodeError also subclasses RequestException;
                    # retain the invalid-response diagnosis instead of a network error.
                    raise ValueError() from None
                if not isinstance(acknowledgement, dict):
                    raise ValueError()
                message_id = acknowledgement.get("messageId")
                if (not isinstance(message_id, str) or not message_id.strip()
                        or len(message_id) > 255 or not re.fullmatch(r"[A-Za-z0-9_.@<>+\-]+", message_id)):
                    message_id = ""
                    raise ValueError()
                error_code = "DELIVERY_FAILED"
            if provider == "BREVO" and settings.BREVO_SANDBOX:
                # A sandbox success proves format validity, never email ownership.
                error_code = "SANDBOX_ONLY"
                raise ValueError()
    except requests.Timeout:
        error_code = "PROVIDER_TIMEOUT"
    except requests.RequestException:
        error_code = "PROVIDER_UNAVAILABLE"
    except smtplib.SMTPAuthenticationError:
        error_code = "SMTP_AUTH_FAILED"
    except smtplib.SMTPRecipientsRefused:
        error_code = "SMTP_RECIPIENT_REJECTED"
    except smtplib.SMTPSenderRefused:
        error_code = "SMTP_SENDER_REJECTED"
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected):
        error_code = "SMTP_UNAVAILABLE"
    except ssl.SSLError:
        error_code = "SMTP_TLS_FAILED"
    except TimeoutError:
        error_code = "SMTP_TIMEOUT" if provider in {"DJANGO", "SMTP"} else "DELIVERY_FAILED"
    except smtplib.SMTPException:
        error_code = "SMTP_DELIVERY_FAILED"
    except OSError:
        error_code = "SMTP_UNAVAILABLE" if provider in {"DJANGO", "SMTP"} else "DELIVERY_FAILED"
    except Exception:
        pass
    else:
        EmailDeliveryLog.objects.create(recipient=recipient, purpose=purpose, provider=provider, status="ACCEPTED")
        if delivery_receipt is not None:
            delivery_receipt.update(status="ACCEPTED", provider=provider, http_status=http_status,
                                    message_id=message_id, error_code="")
        return True
    # Never persist or return exceptions, request headers, bodies, or provider responses.
    EmailDeliveryLog.objects.create(recipient=recipient, purpose=purpose, provider=provider if provider in {
        "DJANGO", "SMTP", "BREVO", "RESEND", "SENDGRID"
    } else "UNKNOWN", status="FAILED", error_code=error_code)
    if delivery_receipt is not None:
        delivery_receipt.update(status="FAILED", provider=provider, http_status=http_status,
                                message_id="", error_code=error_code)
    return False
