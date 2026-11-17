"""Controlled live sending contracts; every provider request is mocked."""
from io import StringIO
import os
import runpy
from unittest.mock import Mock, patch

from django.conf import settings
from django.core.mail import send_mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .email_setup import public_email_delivery_available, send_configured_email
from .models import BharathUser, EmailDeliveryLog, PasswordRecoveryRequest, PasswordResetOTP
from .recovery_queue import process_recovery_request


@override_settings(DEBUG=True, AUTH_EMAIL_ENABLED=False, EMAIL_PROVIDER="BREVO",
                   BREVO_API_KEY="synthetic-server-only-key", BREVO_SANDBOX=False,
                   BREVO_LIVE_ENABLED=True, DEFAULT_FROM_EMAIL="Bharath Painters <approved@gmail.com>",
                   BREVO_CONTROLLED_TEST_ENABLED=True, BREVO_TEST_RECIPIENT="inbox@gmail.com",
                   BREVO_TEST_OTP_ENABLED=False, PASSWORD_RECOVERY_DELIVERY_MODE="queued")
class ControlledBrevoTests(TestCase):
    def setUp(self):
        self.lookup = patch("accounts.email_setup.requests.get", return_value=Mock(
            status_code=200, json=Mock(return_value={"senders": [{"email": "approved@gmail.com", "active": True}]}))).start()
        self.post = patch("accounts.email_setup.requests.post", return_value=Mock(
            status_code=201, json=Mock(return_value={"messageId": "<controlled-123@relay.brevo.com>"}))).start()
        self.addCleanup(patch.stopall)

    def send(self, recipient="inbox@gmail.com", purpose="CONTROLLED_BREVO_TEST", **kwargs):
        return send_configured_email("Harmless test", "No password or OTP.", recipient, purpose, **kwargs)

    def test_controlled_settings_block_direct_django_email_outside_shared_transport(self):
        with patch.dict(os.environ, {"DJANGO_DEBUG": "true", "BREVO_CONTROLLED_TEST_ENABLED": "true",
                                   "PYTHON_DOTENV_DISABLED": "1",
                                   "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend"}, clear=True):
            config = runpy.run_path(str(settings.BASE_DIR / "config" / "settings.py"))
        self.assertEqual(config["EMAIL_BACKEND"], "accounts.controlled_email_backend.EmailBackend")
        with override_settings(EMAIL_BACKEND=config["EMAIL_BACKEND"]), patch("smtplib.SMTP") as smtp:
            with self.assertRaisesMessage(RuntimeError, "Direct Django email is disabled"):
                send_mail("Unrelated mail", "No secrets", "approved@gmail.com", ["other@gmail.com"])
            smtp.assert_not_called()

    def test_allowlisted_harmless_test_works_while_public_email_stays_off(self):
        receipt = {}
        self.assertTrue(self.send(delivery_receipt=receipt))
        self.assertEqual(receipt, {"status": "ACCEPTED", "provider": "BREVO", "http_status": 201,
                                  "message_id": "<controlled-123@relay.brevo.com>", "error_code": ""})
        self.assertFalse(public_email_delivery_available())
        self.assertEqual(self.post.call_args.kwargs["json"]["to"], [{"email": "inbox@gmail.com"}])
        self.assertNotIn("X-Sib-Sandbox", str(self.post.call_args.kwargs["json"]))

    def test_no_other_address_alias_or_multiple_recipient_can_reach_provider(self):
        for recipient in ("other@gmail.com", "inbox+alias@gmail.com", "in.box@gmail.com",
                          "inbox@gmail.com,other@gmail.com", "Name <inbox@gmail.com>",
                          "inbox@gmail.com\r\nBcc: other@gmail.com", ["inbox@gmail.com"]):
            with self.subTest(recipient=recipient):
                self.assertFalse(self.send(recipient))
        self.lookup.assert_not_called()
        self.post.assert_not_called()

    def test_misconfiguration_fails_closed_before_provider_requests(self):
        for changes in ({"BREVO_TEST_RECIPIENT": ""}, {"BREVO_TEST_RECIPIENT": "inbox@gmail.com,other@gmail.com"},
                        {"BREVO_TEST_RECIPIENT": "Name <inbox@gmail.com>"}, {"BREVO_TEST_RECIPIENT": "inbox@example.com"},
                        {"AUTH_EMAIL_ENABLED": True}, {"EMAIL_PROVIDER": "SMTP"},
                        {"EMAIL_PROVIDER": "AUTO"}, {"BREVO_SANDBOX": True},
                        {"BREVO_LIVE_ENABLED": False}, {"BREVO_API_KEY": ""}):
            with self.subTest(changes=changes), override_settings(**changes):
                self.assertFalse(self.send())
                self.assertFalse(public_email_delivery_available())
        self.lookup.assert_not_called()
        self.post.assert_not_called()

    def test_deployment_check_rejects_unsafe_controlled_mode(self):
        from .checks import production_recovery_email_delivery_check
        with override_settings(BREVO_TEST_RECIPIENT="other@gmail.com,inbox@gmail.com"):
            self.assertIn("accounts.E013", [item.id for item in production_recovery_email_delivery_check(None)])

    def test_sender_preflight_still_rejects_wrong_or_inactive_sender(self):
        self.lookup.return_value.json.return_value = {"senders": [{"email": "approved@gmail.com", "active": False}]}
        self.assertFalse(self.send())
        self.post.assert_not_called()
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, "SENDER_NOT_VERIFIED")

    def test_otp_requires_separate_opt_in_and_other_purposes_remain_denied(self):
        self.assertFalse(self.send(purpose=PasswordResetOTP.Purpose.REGISTRATION_EMAIL))
        self.post.assert_not_called()
        with override_settings(BREVO_TEST_OTP_ENABLED=True):
            self.assertTrue(public_email_delivery_available())
            for purpose in (PasswordResetOTP.Purpose.REGISTRATION_EMAIL, PasswordResetOTP.Purpose.RECOVERY_EMAIL,
                            PasswordResetOTP.Purpose.PASSWORD_RESET):
                self.assertTrue(self.send(purpose=purpose))
            self.assertFalse(self.send("other@gmail.com", PasswordResetOTP.Purpose.PASSWORD_RESET))
            self.assertFalse(self.send(purpose="ADMIN_TEST_EMAIL"))
        self.assertEqual(self.post.call_count, 3)

    def test_command_is_dry_run_by_default_and_never_accepts_arbitrary_recipients(self):
        output = StringIO()
        call_command("send_controlled_brevo_test", stdout=output)
        self.assertIn("DRY_RUN", output.getvalue())
        self.lookup.assert_not_called()
        self.post.assert_not_called()
        with self.assertRaises(TypeError):
            call_command("send_controlled_brevo_test", to="other@gmail.com", stdout=StringIO())

    def test_confirmed_command_records_acceptance_without_claiming_delivery(self):
        output = StringIO()
        call_command("send_controlled_brevo_test", confirm_send=True, stdout=output)
        self.assertEqual(self.post.call_count, 1)
        self.assertIn('"status": "ACCEPTED"', output.getvalue())
        self.assertIn('"message_id": "<controlled-123@relay.brevo.com>"', output.getvalue())
        self.assertNotIn("synthetic-server-only-key", output.getvalue())
        self.assertNotIn("inbox@gmail.com", output.getvalue())
        self.assertEqual(EmailDeliveryLog.objects.get().status, "ACCEPTED")

    def test_provider_failure_is_sanitized_and_timeout_is_not_retried(self):
        import requests
        for response, code in ((Mock(status_code=401), "PROVIDER_REJECTED"),
                               (Mock(status_code=429), "PROVIDER_REJECTED"),
                               (Mock(status_code=201, json=Mock(return_value={"messageId": "bad\nsecret"})), "PROVIDER_INVALID_RESPONSE")):
            self.post.return_value = response
            receipt = {}
            self.assertFalse(self.send(delivery_receipt=receipt))
            self.assertEqual(receipt["error_code"], code)
            self.assertEqual(receipt["message_id"], "")
        self.post.side_effect = requests.Timeout("synthetic-server-only-key")
        receipt = {}
        self.assertFalse(self.send(delivery_receipt=receipt))
        self.assertEqual(receipt["error_code"], "PROVIDER_TIMEOUT")
        self.assertEqual(self.post.call_count, 4)
        self.assertNotIn("synthetic-server-only-key", str(list(EmailDeliveryLog.objects.values())))

    @override_settings(BREVO_TEST_OTP_ENABLED=True)
    def test_existing_queued_recovery_only_sends_for_allowlisted_account(self):
        for mobile, email in (("9876500801", "inbox@gmail.com"), ("9876500802", "other@gmail.com")):
            user = BharathUser.objects.create_user(mobile=mobile, password="Synthetic-test-password!", role="CONTRACTOR",
                email=email, recovery_email=email, recovery_email_verified=True)
            response = APIClient().post(reverse("forgot-password-request"), {"mobile": mobile, "role": "CONTRACTOR"}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(process_recovery_request())
            otp = PasswordResetOTP.objects.get(user=user)
            self.assertEqual(otp.is_used, email != "inbox@gmail.com")
        self.assertEqual(PasswordRecoveryRequest.objects.count(), 2)
        self.assertEqual(self.post.call_count, 1)

    @override_settings(BREVO_CONTROLLED_TEST_ENABLED=False)
    def test_controlled_command_cannot_become_a_public_send_when_mode_is_off(self):
        with self.assertRaises(CommandError):
            call_command("send_controlled_brevo_test", confirm_send=True, stdout=StringIO())
        self.post.assert_not_called()
