"""Transport contracts: local mail is inspectable and production delivery is real."""
import os
import runpy
import smtplib
import ssl
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import requests
from cryptography.fernet import Fernet
from django.conf import settings
from django.core import mail
from django.db import OperationalError
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase, override_settings

from . import email_setup
from .checks import production_recovery_email_delivery_check
from .models import EmailDeliveryLog, EmailOTPSetup


LOCAL_BACKENDS = [f"django.core.mail.backends.{name}.EmailBackend" for name in (
    "console", "filebased", "locmem", "dummy",
)]


class EmailDefaultSettingsTests(SimpleTestCase):
    def setUp(self):
        # These test defaults, never the developer's real secret file.
        loader = patch("dotenv.load_dotenv")
        loader.start()
        self.addCleanup(loader.stop)

    def production_settings(self, **extra):
        with patch.dict(os.environ, {"DJANGO_DEBUG": "false", "DJANGO_SECRET_KEY": "synthetic-check-only-secret", **extra}, clear=True):
            return runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))

    def test_production_origins_exclude_local_development(self):
        config = self.production_settings()
        self.assertTrue(all(origin.startswith("https://") for origin in config["CORS_ALLOWED_ORIGINS"]))
        self.assertTrue(all(origin.startswith("https://") for origin in config["CSRF_TRUSTED_ORIGINS"]))

    def test_custom_frontend_cors_can_be_configured_by_environment(self):
        origin = "https://customers.example.com"
        config = self.production_settings(FRONTEND_URL=origin, CORS_ALLOWED_ORIGINS=origin,
                                          CSRF_TRUSTED_ORIGINS=origin)
        self.assertIn(origin, config["CORS_ALLOWED_ORIGINS"])
        self.assertIn(origin, config["CSRF_TRUSTED_ORIGINS"])

    def test_render_cannot_accidentally_start_in_debug_mode(self):
        with patch.dict(os.environ, {"RENDER": "true", "DJANGO_DEBUG": "true"}, clear=True):
            with self.assertRaises(ImproperlyConfigured):
                runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))

    def test_debug_default_writes_private_backend_directory(self):
        with patch.dict(os.environ, {"DJANGO_DEBUG": "true", "PYTHON_DOTENV_DISABLED": "1"}, clear=True):
            config = runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))
        self.assertEqual(config["EMAIL_BACKEND"], "django.core.mail.backends.filebased.EmailBackend")
        self.assertEqual(Path(config["EMAIL_FILE_PATH"]), settings.BASE_DIR / ".email-output")
        self.assertEqual(config["EMAIL_PROVIDER"], "DJANGO")

    def test_debug_default_links_target_local_frontend(self):
        with patch.dict(os.environ, {"DJANGO_DEBUG": "true"}, clear=True):
            config = runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))
        self.assertEqual(config["FRONTEND_URL"], "http://localhost:5173")

    def test_frontend_named_brevo_key_is_never_used_as_backend_credential(self):
        with patch.dict(os.environ, {"DJANGO_DEBUG": "true", "VITE_BREVO_API_KEY": "frontend-placeholder"}, clear=True):
            config = runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))
        self.assertEqual(config["BREVO_API_KEY"], "")


@override_settings(DEBUG=True, EMAIL_PROVIDER="AUTO",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
                   EMAIL_SETUP_ENCRYPTION_KEY=Fernet.generate_key().decode(),
                   BREVO_API_KEY="", BREVO_SANDBOX=False,
                   FRONTEND_URL="https://bharath-painters-chi.vercel.app",
                   DEFAULT_FROM_EMAIL="Bharath Painters <sender@example.com>")
class EmailTransportTests(TestCase):
    def setUp(self):
        # All transport tests are offline, including the sender readiness lookup.
        sender_lookup = patch("accounts.email_setup.requests.get", return_value=Mock(
            status_code=200, json=Mock(return_value={"senders": [
                {"email": "sender@example.com", "active": True},
            ]})))
        self.sender_lookup = sender_lookup.start()
        self.addCleanup(sender_lookup.stop)
        live = override_settings(BREVO_LIVE_ENABLED=True)
        live.enable()
        self.addCleanup(live.disable)

    def send(self, purpose="REGISTRATION"):
        return email_setup.send_configured_email("Subject", "OTP 654321", "recipient@example.com", purpose)

    def activate(self, provider="RESEND", encrypted_api_key=None):
        return EmailOTPSetup.objects.create(
            provider=provider, is_active=True, from_email="legacy@example.com", from_name="Legacy Sender",
            encrypted_api_key=encrypted_api_key or email_setup.encrypt_api_key("legacy-key"),
        )

    def test_local_locmem_messages_keep_boolean_contract(self):
        self.assertTrue(self.send())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["recipient@example.com"])

    def test_file_delivery_can_be_inspected_without_api_code_leak(self):
        with tempfile.TemporaryDirectory() as directory:
            with override_settings(EMAIL_BACKEND=LOCAL_BACKENDS[1], EMAIL_FILE_PATH=directory):
                self.assertTrue(self.send())
                messages = list(Path(directory).glob("*.log"))
                self.assertEqual(len(messages), 1)
                self.assertIn("654321", messages[0].read_text())
                self.assertFalse(email_setup.development_otp_visible())

    @override_settings(DEBUG=False)
    @patch("accounts.email_setup.send_mail")
    def test_every_local_backend_is_blocked_in_production(self, send):
        for backend in LOCAL_BACKENDS:
            with self.subTest(backend=backend), override_settings(EMAIL_BACKEND=backend):
                self.assertFalse(self.send())
                self.assertFalse(email_setup.public_email_delivery_available())
        send.assert_not_called()
        self.assertEqual(set(EmailDeliveryLog.objects.values_list("error_code", flat=True)), {"LOCAL_BACKEND_DISABLED"})

    @patch("accounts.email_setup.requests.post", return_value=Mock(status_code=202))
    def test_auto_preserves_active_legacy_api_transport(self, post):
        self.activate()
        with override_settings(DEBUG=False):
            self.assertTrue(email_setup.public_email_delivery_available())
            self.assertTrue(self.send())
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer legacy-key")

    def test_invalid_legacy_key_is_not_production_ready(self):
        self.activate(encrypted_api_key="corrupt-ciphertext")
        with override_settings(DEBUG=False):
            self.assertFalse(email_setup.public_email_delivery_available())

    @override_settings(EMAIL_PROVIDER="DJANGO")
    @patch("accounts.email_setup.requests.post")
    def test_explicit_django_provider_ignores_active_legacy_transport(self, post):
        self.activate()
        self.assertTrue(self.send())
        self.assertEqual(mail.outbox[0].from_email, settings.DEFAULT_FROM_EMAIL)
        post.assert_not_called()

    @patch("accounts.email_setup.requests.post")
    def test_debug_defaults_ignore_active_legacy_transport(self, post):
        self.activate()
        with patch.dict(os.environ, {"DJANGO_DEBUG": "true", "PYTHON_DOTENV_DISABLED": "1"}, clear=True):
            config = runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))
        with tempfile.TemporaryDirectory() as directory:
            with override_settings(EMAIL_PROVIDER=config["EMAIL_PROVIDER"],
                                   EMAIL_BACKEND=config["EMAIL_BACKEND"], EMAIL_FILE_PATH=directory):
                self.assertTrue(self.send())
                self.assertEqual(len(list(Path(directory).glob("*.log"))), 1)
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post", return_value=Mock(status_code=201, json=Mock(return_value={"messageId": "<test@example.com>"})))
    def test_brevo_uses_backend_environment_key_and_plain_text_payload(self, post):
        self.activate()
        self.assertTrue(self.send())
        self.assertEqual(post.call_args.args[0], "https://api.brevo.com/v3/smtp/email")
        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs["headers"]["api-key"], "server-only-key")
        self.assertEqual(kwargs["json"]["sender"], {"name": "Bharath Painters", "email": "sender@example.com"})
        self.assertEqual(kwargs["json"]["to"], [{"email": "recipient@example.com"}])
        self.assertEqual(kwargs["json"]["textContent"], "OTP 654321")
        self.assertNotIn("headers", kwargs["json"])
        self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(kwargs["timeout"], settings.EMAIL_TIMEOUT)

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key", BREVO_SANDBOX=True)
    @patch("accounts.email_setup.requests.post", return_value=Mock(status_code=201, json=Mock(return_value={"messageId": "<test@example.com>"})))
    def test_brevo_sandbox_is_explicitly_not_real_delivery(self, post):
        self.assertFalse(self.send())
        self.assertEqual(post.call_args.kwargs["json"]["headers"], {"X-Sib-Sandbox": "drop"})
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, "SANDBOX_ONLY")
        self.assertEqual(EmailDeliveryLog.objects.get().status, "FAILED")
        with override_settings(DEBUG=False):
            self.assertFalse(email_setup.public_email_delivery_available())
            post.reset_mock()
            self.assertFalse(self.send())
            post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_brevo_requires_documented_provider_acknowledgement(self, post):
        for response in (
            Mock(status_code=200, json=Mock(return_value={"messageId": "<test@example.com>"})),
            Mock(status_code=204, json=Mock(return_value={})),
            Mock(status_code=201, json=Mock(return_value={})),
            Mock(status_code=201, json=Mock(return_value={"messageId": ""})),
            Mock(status_code=201, json=Mock(return_value={"messageId": ["bad-type"]})),
            Mock(status_code=201, json=Mock(return_value=[])),
            Mock(status_code=201, json=Mock(side_effect=ValueError("secret OTP 654321"))),
            Mock(status_code=201, json=Mock(side_effect=requests.exceptions.JSONDecodeError("secret OTP 654321", "x", 0))),
        ):
            with self.subTest(response=response.status_code):
                post.return_value = response
                self.assertFalse(self.send())
                self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code, "PROVIDER_INVALID_RESPONSE")
        self.assertFalse(EmailDeliveryLog.objects.filter(status="ACCEPTED").exists())

    @override_settings(EMAIL_PROVIDER="BREVO")
    @patch("accounts.email_setup.requests.post")
    def test_missing_brevo_key_fails_closed_without_http(self, post):
        self.assertFalse(self.send())
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, "EMAIL_CONFIG_INVALID")
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key", BREVO_LIVE_ENABLED=False)
    @patch("accounts.email_setup.requests.post")
    def test_live_brevo_requires_explicit_opt_in(self, post):
        self.assertFalse(self.send())
        self.assertFalse(email_setup.public_email_delivery_available())
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, "LIVE_DELIVERY_DISABLED")
        self.sender_lookup.assert_not_called()
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_brevo_never_sends_without_an_active_matching_sender(self, post):
        for senders in ([], [{"email": "other@example.com", "active": True}],
                        [{"email": "sender@example.com", "active": False}],
                        [{"email": "sender@example.com", "active": "true"}],
                        [None], "invalid"):
            with self.subTest(senders=senders):
                self.sender_lookup.return_value = Mock(status_code=200, json=Mock(return_value={"senders": senders}))
                self.assertFalse(self.send())
                self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code,
                                 "SENDER_NOT_VERIFIED" if isinstance(senders, list) else "SENDER_LOOKUP_INVALID_RESPONSE")
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_sender_lookup_http_errors_report_their_status_without_claiming_unverified(self, post):
        for status in (401, 403, 429, 500, 302):
            with self.subTest(status=status):
                self.sender_lookup.return_value = Mock(status_code=status)
                receipt = {}
                self.assertFalse(email_setup.send_configured_email(
                    "Subject", "No secrets", "recipient@example.com", "REGISTRATION", delivery_receipt=receipt))
                self.assertEqual(receipt["http_status"], status)
                self.assertEqual(receipt["error_code"], "SENDER_LOOKUP_UNAUTHORIZED" if status in {401, 403} else "SENDER_LOOKUP_REJECTED")
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_sender_lookup_malformed_response_is_not_a_sender_verification_result(self, post):
        for response in (Mock(status_code=200, json=Mock(return_value=[])),
                         Mock(status_code=200, json=Mock(side_effect=ValueError("private response")))):
            self.sender_lookup.return_value = response
            receipt = {}
            self.assertFalse(email_setup.send_configured_email(
                "Subject", "No secrets", "recipient@example.com", "REGISTRATION", delivery_receipt=receipt))
            self.assertEqual(receipt["http_status"], 200)
            self.assertEqual(receipt["error_code"], "SENDER_LOOKUP_INVALID_RESPONSE")
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_brevo_sender_lookup_failure_fails_closed(self, post):
        for response in (Mock(status_code=401), Mock(status_code=302),
                         Mock(status_code=200, json=Mock(return_value=[])),
                         Mock(status_code=200, json=Mock(side_effect=ValueError("private response")))):
            self.sender_lookup.return_value = response
            self.assertFalse(self.send())
        self.sender_lookup.side_effect = requests.Timeout("server-only-key")
        self.assertFalse(self.send())
        self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code, "PROVIDER_TIMEOUT")
        post.assert_not_called()

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-only-key")
    @patch("accounts.email_setup.requests.post")
    def test_provider_rejection_and_timeout_log_only_diagnostic_codes(self, post):
        for outcome in (Mock(status_code=401, text="server-only-key 654321"),
                        Mock(status_code=429), Mock(status_code=500), Mock(status_code=302)):
            post.return_value = outcome
            self.assertFalse(self.send())
            self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code, "PROVIDER_REJECTED")
        post.side_effect = requests.Timeout("server-only-key OTP 654321")
        self.assertFalse(self.send())
        self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code, "PROVIDER_TIMEOUT")
        logs = str(list(EmailDeliveryLog.objects.values()))
        self.assertNotIn("server-only-key", logs)
        self.assertNotIn("654321", logs)

    @override_settings(EMAIL_PROVIDER="typo")
    @patch("accounts.email_setup.send_mail")
    def test_unknown_provider_does_not_fall_back_to_django(self, send):
        self.assertFalse(self.send())
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, "EMAIL_CONFIG_INVALID")
        send.assert_not_called()

    @override_settings(EMAIL_PROVIDER="SMTP", EMAIL_HOST="smtp.example.com", EMAIL_HOST_USER="user",
                       EMAIL_HOST_PASSWORD="password", EMAIL_USE_TLS=True, EMAIL_USE_SSL=False, DEBUG=False)
    @patch("accounts.email_setup.send_mail", return_value=1)
    def test_explicit_smtp_uses_smtp_even_if_django_backend_is_local(self, send):
        self.assertTrue(email_setup.public_email_delivery_available())
        with patch("accounts.email_setup.get_connection") as connection:
            self.assertTrue(self.send())
        connection.assert_called_once_with("django.core.mail.backends.smtp.EmailBackend")
        self.assertEqual(send.call_args.kwargs["connection"], connection.return_value)

    @override_settings(EMAIL_PROVIDER="SMTP", EMAIL_HOST="smtp.example.com", EMAIL_HOST_USER="user",
                       EMAIL_HOST_PASSWORD="password", EMAIL_USE_TLS=True, EMAIL_USE_SSL=False, DEBUG=False)
    @patch("accounts.email_setup.get_connection")
    @patch("accounts.email_setup.send_mail")
    def test_smtp_failures_produce_safe_actionable_diagnostics(self, send, connection):
        failures = (
            (smtplib.SMTPAuthenticationError(535, b"secret-password OTP 654321"), "SMTP_AUTH_FAILED"),
            (smtplib.SMTPRecipientsRefused({"recipient@example.com": (550, b"secret-password")}), "SMTP_RECIPIENT_REJECTED"),
            (smtplib.SMTPSenderRefused(550, b"secret-password", "sender@example.com"), "SMTP_SENDER_REJECTED"),
            (smtplib.SMTPConnectError(421, b"secret-password"), "SMTP_UNAVAILABLE"),
            (smtplib.SMTPServerDisconnected("secret-password"), "SMTP_UNAVAILABLE"),
            (ConnectionRefusedError("secret-password"), "SMTP_UNAVAILABLE"),
            (TimeoutError("secret-password"), "SMTP_TIMEOUT"),
            (ssl.SSLError("secret-password"), "SMTP_TLS_FAILED"),
            (smtplib.SMTPException("secret-password"), "SMTP_DELIVERY_FAILED"),
        )
        for failure, code in failures:
            with self.subTest(code=code):
                send.side_effect = failure
                self.assertFalse(self.send())
                self.assertEqual(EmailDeliveryLog.objects.order_by("-pk").first().error_code, code)
        logs = str(list(EmailDeliveryLog.objects.values()))
        self.assertNotIn("secret-password", logs)
        self.assertNotIn("654321", logs)
        self.assertFalse(EmailDeliveryLog.objects.filter(status="ACCEPTED").exists())


@override_settings(DEBUG=False, EMAIL_PROVIDER="DJANGO", BREVO_API_KEY="", BREVO_SANDBOX=False,
                   FRONTEND_URL="https://bharath-painters-chi.vercel.app",
                   EMAIL_BACKEND=LOCAL_BACKENDS[0])
class ProductionEmailChecksTests(SimpleTestCase):
    def errors(self):
        return production_recovery_email_delivery_check(None)

    def test_deploy_rejects_all_development_backends(self):
        for backend in LOCAL_BACKENDS:
            with self.subTest(backend=backend), override_settings(EMAIL_BACKEND=backend):
                self.assertIn("accounts.E001", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-key", BREVO_LIVE_ENABLED=True)
    def test_brevo_does_not_require_unrelated_smtp_or_database(self):
        self.assertEqual(self.errors(), [])

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-key", BREVO_LIVE_ENABLED=False)
    def test_brevo_live_opt_in_is_required_for_deployment(self):
        self.assertIn("accounts.E006", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-key", BREVO_LIVE_ENABLED=True)
    def test_production_email_links_require_a_public_https_frontend_origin(self):
        for url in ("http://localhost:5173", "https://user:password@example.com", "https://app.example.com/subpath",
                    "https://app.example.com?redirect=1", "https://app.example.com#token", "https://127.0.0.1",
                    "https://localhost.", "https://127.1", "https://0x7f.0.0.1", "https://foo.local.",
                    "https://0x7f.0x0.0x0.0x1"):
            with self.subTest(url=url), override_settings(FRONTEND_URL=url):
                self.assertFalse(email_setup.public_email_delivery_available())
                self.assertIn("accounts.E007", [message.id for message in self.errors()])

    def test_deployment_requires_frontend_in_cors_and_csrf_origins(self):
        from .checks import production_auth_origin_check
        with override_settings(FRONTEND_URL="https://app.example.com", CORS_ALLOWED_ORIGINS=[], CSRF_TRUSTED_ORIGINS=[]):
            self.assertIn("accounts.E008", [message.id for message in production_auth_origin_check(None)])
        with override_settings(FRONTEND_URL="https://app.example.com", CORS_ALLOWED_ORIGINS=["https://app.example.com"],
                               CSRF_TRUSTED_ORIGINS=["https://app.example.com"]):
            self.assertEqual(production_auth_origin_check(None), [])

    @override_settings(EMAIL_PROVIDER="SMTP", EMAIL_HOST="smtp.example.com", EMAIL_HOST_USER="user",
                       EMAIL_HOST_PASSWORD="password", EMAIL_USE_TLS=True, EMAIL_USE_SSL=False,
                       DEFAULT_FROM_EMAIL="sender@example.com")
    def test_complete_synthetic_smtp_config_passes_without_database_or_sending(self):
        self.assertEqual(self.errors(), [])

    @override_settings(EMAIL_PROVIDER="SMTP", EMAIL_HOST="", EMAIL_HOST_USER="", EMAIL_HOST_PASSWORD="")
    def test_incomplete_smtp_reports_configuration_error(self):
        self.assertIn("accounts.E002", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="SMTP", EMAIL_HOST="smtp.example.com", EMAIL_HOST_USER="user",
                       EMAIL_HOST_PASSWORD="password", EMAIL_USE_TLS=True, EMAIL_USE_SSL=True)
    def test_conflicting_smtp_tls_modes_report_configuration_error(self):
        self.assertIn("accounts.E003", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="BREVO")
    def test_brevo_requires_server_key(self):
        self.assertIn("accounts.E004", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="BREVO", BREVO_API_KEY="server-key", BREVO_SANDBOX=True)
    def test_deploy_rejects_sandbox(self):
        self.assertIn("accounts.E005", [message.id for message in self.errors()])

    @override_settings(EMAIL_PROVIDER="AUTO", EMAIL_SETUP_ENCRYPTION_KEY=Fernet.generate_key().decode())
    @patch("accounts.email_setup.active_setup")
    def test_auto_valid_legacy_provider_does_not_report_local_backend_error(self, active):
        active.return_value = EmailOTPSetup(provider="SENDGRID", from_email="sender@example.com",
            encrypted_api_key=email_setup.encrypt_api_key("legacy-key"))
        self.assertEqual(self.errors(), [])

    @override_settings(EMAIL_PROVIDER="AUTO")
    @patch("accounts.email_setup.active_setup", side_effect=OperationalError("do not expose credentials"))
    def test_unmigrated_database_reports_sanitized_warning_and_checks_fallback(self, active):
        messages = self.errors()
        self.assertIn("accounts.W003", [message.id for message in messages])
        self.assertIn("accounts.E001", [message.id for message in messages])
        self.assertNotIn("credentials", str(messages))
