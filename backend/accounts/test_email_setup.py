from datetime import timedelta
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet
from django.contrib.auth.hashers import check_password
from django.core import mail
from django.core.exceptions import ValidationError
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .email_setup import decrypt_api_key, development_otp_visible, encrypt_api_key, send_configured_email
from .email_setup_admin import SetupForm
from .models import BharathUser, EmailDeliveryLog, EmailOTPSetup, PasswordResetOTP
from .views import _issue_email_otp, _verify_otp, _registration_email_response


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEBUG=True,
                   EMAIL_SETUP_ENCRYPTION_KEY=Fernet.generate_key().decode())
class EmailSetupTests(TestCase):
    def setUp(self):
        self.superuser = BharathUser.objects.create_superuser("9000000091", "admin@example.com", "Strong-test-password-2026")
        self.staff = BharathUser.objects.create_user("9000000092", "staff@example.com", "Strong-test-password-2026", is_staff=True)
        self.setup = EmailOTPSetup.objects.create(from_email="no-reply@example.com", sender_domain="example.com",
                                                 frontend_url="https://app.example.com", backend_url="https://api.example.com")

    def activate(self, **kwargs):
        for field, value in kwargs.items():
            setattr(self.setup, field, value)
        self.setup.is_active = True
        self.setup.full_clean()
        self.setup.save()

    def form_data(self, **kwargs):
        data = {field.name: getattr(self.setup, field.name) for field in self.setup._meta.fields if field.editable}
        data.update(kwargs)
        return data

    def test_encryption_and_write_only_admin(self):
        form = SetupForm(data=self.form_data(api_key="secret-provider-token"), instance=self.setup)
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        self.setup.refresh_from_db()
        self.assertNotIn("secret-provider-token", self.setup.encrypted_api_key)
        self.assertEqual(decrypt_api_key(self.setup.encrypted_api_key), "secret-provider-token")
        self.client.force_login(self.superuser)
        response = self.client.get(reverse("admin:accounts_emailotpsetup_change", args=[1]))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "secret-provider-token")
        self.assertNotContains(response, self.setup.encrypted_api_key)
        old_ciphertext = self.setup.encrypted_api_key
        form = SetupForm(data=self.form_data(api_key=""), instance=self.setup)
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        self.assertEqual(form.instance.encrypted_api_key, old_ciphertext)

    @override_settings(EMAIL_SETUP_ENCRYPTION_KEY="")
    def test_missing_encryption_key_cannot_save_secret(self):
        form = SetupForm(data=self.form_data(api_key="secret"), instance=self.setup)
        self.assertFalse(form.is_valid())
        self.assertIn("api_key", form.errors)

    def test_superuser_permissions_and_singleton(self):
        self.client.force_login(self.staff)
        for name, args in [("admin:accounts_emailotpsetup_changelist", []),
                           ("admin:accounts_emailotpsetup_change", [1]),
                           ("admin:accounts_emailotpsetup_test", [1, "email"]),
                           ("admin:accounts_emaildeliverylog_changelist", [])]:
            self.assertEqual(self.client.get(reverse(name, args=args)).status_code, 403)
        self.client.force_login(self.superuser)
        self.assertEqual(self.client.get(reverse("admin:accounts_emailotpsetup_add")).status_code, 403)

    def test_activation_validation(self):
        self.setup.is_active = True
        self.setup.provider = "RESEND"
        with self.assertRaises(ValidationError):
            self.setup.full_clean()
        self.setup.provider = "DJANGO"
        self.setup.from_email = "sender@other.example"
        with self.assertRaises(ValidationError):
            self.setup.full_clean()
        self.setup.from_email = "sender@example.com"
        self.setup.otp_length = 3
        with self.assertRaises(ValidationError):
            self.setup.full_clean()

    def test_configured_otp_hash_expiry_limits_and_purpose(self):
        self.activate(otp_length=8, expiry_minutes=3, max_attempts=2, resend_seconds=90)
        result, error = _issue_email_otp(self.superuser, PasswordResetOTP.Purpose.ADMIN_TEST, "test@example.com")
        self.assertIsNone(error)
        challenge, code = result
        self.assertEqual(len(code), 8)
        self.assertTrue(check_password(code, challenge.code_hash))
        self.assertNotEqual(challenge.code_hash, code)
        self.assertEqual(challenge.purpose, PasswordResetOTP.Purpose.ADMIN_TEST)
        self.assertAlmostEqual((challenge.expires_at - challenge.created_at).total_seconds(), 180, delta=2)
        self.assertFalse(development_otp_visible())
        self.assertEqual(EmailDeliveryLog.objects.get().status, "ACCEPTED")
        self.assertIn(code, mail.outbox[0].body)
        self.assertIsNone(_issue_email_otp(self.superuser, challenge.purpose, "test@example.com")[0])
        self.activate(max_attempts=10)
        self.assertIsNotNone(_verify_otp(challenge, "wrong"))
        self.assertIsNotNone(_verify_otp(challenge, "wrong"))
        self.assertTrue(PasswordResetOTP.objects.get(pk=challenge.pk).is_used)
        self.assertIsNotNone(_verify_otp(challenge, code))
        self.assertNotIn(code, str(list(EmailDeliveryLog.objects.values())))

    def test_expired_and_hourly_limits(self):
        self.activate(max_per_hour=1)
        (challenge, code), _ = _issue_email_otp(self.superuser, PasswordResetOTP.Purpose.ADMIN_TEST, "test@example.com")
        challenge.expires_at = timezone.now() - timedelta(seconds=1)
        challenge.save()
        self.assertIsNotNone(_verify_otp(challenge, code))
        self.assertIn("Too many", _issue_email_otp(self.superuser, challenge.purpose, "test@example.com")[1])

    def test_active_setup_hides_response_codes_and_uses_urls(self):
        self.activate()
        response = _registration_email_response(self.superuser)
        self.assertNotIn("test_otp", response)
        self.assertNotIn("encrypted_api_key", response)
        self.assertIn("https://app.example.com/account-security", mail.outbox[0].body)
        from .utils import bharath_profile_url
        self.superuser.bharath_id = "BP-C-TEST"
        self.assertEqual(bharath_profile_url(self.superuser), "https://api.example.com/api/accounts/verify-page/BP-C-TEST/")

    @patch("accounts.email_setup.requests.post")
    def test_provider_adapters_and_safe_failure_logs(self, post):
        self.activate(provider="RESEND", encrypted_api_key=encrypt_api_key("secret-key"))
        post.return_value = Mock(status_code=200)
        self.assertTrue(send_configured_email("Test", "Body", "test@example.com", "TEST"))
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer secret-key")
        self.assertFalse(post.call_args.kwargs["allow_redirects"])
        self.activate(provider="SENDGRID")
        self.assertTrue(send_configured_email("Test", "Body", "test@example.com", "TEST"))
        self.assertIn("personalizations", post.call_args.kwargs["json"])
        post.return_value = Mock(status_code=401)
        self.assertFalse(send_configured_email("Test", "Body", "test@example.com", "TEST"))
        self.assertEqual(EmailDeliveryLog.objects.first().error_code, "PROVIDER_REJECTED")
        post.side_effect = RuntimeError("secret-key OTP=123456")
        self.assertFalse(send_configured_email("Test", "OTP=123456", "test@example.com", "TEST"))
        logs = str(list(EmailDeliveryLog.objects.values()))
        self.assertNotIn("secret-key", logs)
        self.assertNotIn("123456", logs)

    @patch("accounts.email_setup.send_mail", return_value=0)
    def test_failed_delivery_invalidates_otp(self, send):
        self.activate()
        self.assertIsNone(_issue_email_otp(self.superuser, PasswordResetOTP.Purpose.ADMIN_TEST, "test@example.com")[0])
        self.assertTrue(PasswordResetOTP.objects.get().is_used)
        self.assertEqual(EmailDeliveryLog.objects.get().status, "FAILED")

    def test_admin_actions_csrf_and_separate_test_otp(self):
        self.activate()
        self.client.force_login(self.superuser)
        url = reverse("admin:accounts_emailotpsetup_test", args=[1, "email"])
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(EmailDeliveryLog.objects.count(), 0)
        guarded = Client(enforce_csrf_checks=True)
        guarded.force_login(self.superuser)
        self.assertEqual(guarded.post(url, {"recipient": "test@example.com"}).status_code, 403)
        self.assertEqual(self.client.post(url, {"recipient": "test@example.com"}).status_code, 302)
        otp_url = reverse("admin:accounts_emailotpsetup_test", args=[1, "otp"])
        self.assertEqual(self.client.post(otp_url, {"recipient": "test@example.com"}).status_code, 302)
        challenge = PasswordResetOTP.objects.get()
        self.assertEqual(challenge.purpose, PasswordResetOTP.Purpose.ADMIN_TEST)
        response = self.client.post(reverse("forgot-password-verify"), {"challenge_id": challenge.pk, "otp": "000000"})
        self.assertEqual(response.status_code, 400)
