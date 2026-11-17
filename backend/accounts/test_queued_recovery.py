"""Durable recovery work uses the same public path for known/unknown accounts."""
import re
from datetime import timedelta
from unittest.mock import patch

from django.apps import apps
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import BharathUser, PasswordResetOTP


@override_settings(DEBUG=True, AUTH_EMAIL_ENABLED=True, PASSWORD_RECOVERY_DELIVERY_MODE="queued",
                   EMAIL_PROVIDER="DJANGO", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class QueuedRecoveryTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.password = "Queued-original-password-2026!"
        self.user = BharathUser.objects.create_user(mobile="9876550011", password=self.password, role="CUSTOMER",
            email="queued@example.invalid", recovery_email="queued@example.invalid", recovery_email_verified=True)

    def request_code(self, mobile=None):
        return self.client.post(reverse("forgot-password-request"), {"mobile": mobile or self.user.mobile, "role": "CUSTOMER"}, format="json")

    def job_model(self):
        return apps.get_model("accounts", "PasswordRecoveryRequest")

    def worker(self):
        from .recovery_queue import process_recovery_request
        return process_recovery_request()

    def test_public_requests_do_not_resolve_accounts_hash_codes_or_contact_provider(self):
        from .views import _recovery_user
        with patch("accounts.views._recovery_user", wraps=_recovery_user) as lookup, patch("accounts.views._issue_email_otp") as issue:
            known = self.request_code()
            unknown = self.request_code("9876550012")
        self.assertEqual([known.status_code, unknown.status_code], [200, 200])
        lookup.assert_not_called()
        issue.assert_not_called()
        self.assertEqual(PasswordResetOTP.objects.count(), 0)
        self.assertEqual(self.job_model().objects.count(), 2)
        self.assertEqual({k:v for k,v in known.data.items() if k != "challenge_id"},
                         {k:v for k,v in unknown.data.items() if k != "challenge_id"})

    def test_worker_delivers_and_existing_verification_and_reset_routes_work_once(self):
        response = self.request_code()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.worker())
        self.assertFalse(self.worker())
        code = re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)
        payload = {"challenge_id": response.data["challenge_id"], "otp": code}
        verified = self.client.post(reverse("forgot-password-verify"), payload, format="json")
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertEqual(self.client.post(reverse("forgot-password-verify"), payload, format="json").status_code, 400)
        new_password = "Queued-new-password-2026!"
        reset = {"reset_token": verified.data["reset_token"], "new_password": new_password, "confirm_password": new_password}
        self.assertEqual(self.client.post(reverse("forgot-password-confirm"), reset, format="json").status_code, 200)
        self.assertEqual(self.client.post(reverse("forgot-password-confirm"), reset, format="json").status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))

    def test_unknown_and_disabled_accounts_are_processed_without_a_message(self):
        self.user.is_active = False
        self.user.save(update_fields=("is_active",))
        self.request_code()
        self.request_code("9876550012")
        self.assertTrue(self.worker())
        self.assertTrue(self.worker())
        self.assertEqual(PasswordResetOTP.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_email_disable_leaves_jobs_pending_without_provider_access(self):
        self.request_code()
        with override_settings(AUTH_EMAIL_ENABLED=False):
            self.assertFalse(self.worker())
        self.assertIsNone(self.job_model().objects.get().processed_at)
        self.assertEqual(PasswordResetOTP.objects.count(), 0)

    def test_expired_jobs_never_send_and_pending_jobs_do_not_verify(self):
        response = self.request_code()
        payload = {"challenge_id": response.data["challenge_id"], "otp": "123456"}
        self.assertEqual(self.client.post(reverse("forgot-password-verify"), payload, format="json").status_code, 400)
        self.job_model().objects.update(created_at=timezone.now() - timedelta(hours=2))
        self.assertTrue(self.worker())
        self.assertEqual(PasswordResetOTP.objects.count(), 0)

    def test_unsupported_delivery_modes_fail_uniformly_before_account_lookup(self):
        with override_settings(PASSWORD_RECOVERY_DELIVERY_MODE="typo"):
            known = self.request_code()
            unknown = self.request_code("9876550012")
        self.assertEqual([known.status_code, unknown.status_code], [503, 503])
        self.assertEqual(known.data, unknown.data)

    def test_worker_lag_defers_resend_instead_of_stranding_the_latest_challenge(self):
        self.request_code()
        self.assertTrue(self.worker())
        # Request B passes its request-time cooldown, but delayed delivery A
        # occurred only two seconds earlier. Issuer cooldown is still active.
        cache.clear()
        PasswordResetOTP.objects.update(created_at=timezone.now() - timedelta(seconds=2))
        latest = self.request_code()
        self.assertTrue(self.worker())
        job = self.job_model().objects.order_by("-created_at").first()
        self.assertIsNone(job.processed_at)
        self.assertFalse(self.worker())
        later = timezone.now() + timedelta(seconds=65)
        with patch("django.utils.timezone.now", return_value=later):
            self.assertTrue(self.worker())
        job.refresh_from_db()
        self.assertEqual(job.status, "COMPLETE")
        code = re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)
        verified = self.client.post(reverse("forgot-password-verify"),
            {"challenge_id": latest.data["challenge_id"], "otp": code}, format="json")
        self.assertEqual(verified.status_code, 200, verified.data)

    def test_hourly_limit_preserves_a_valid_code_without_sending_or_accepting_it_twice(self):
        original = self.request_code()
        self.assertTrue(self.worker())
        code = re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)
        for _ in range(4):
            old = PasswordResetOTP.objects.create(user=self.user, target_email=self.user.recovery_email,
                purpose="PASSWORD_RESET", code_hash="unused-test-hash", is_used=True,
                expires_at=timezone.now() + timedelta(minutes=10))
            PasswordResetOTP.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(minutes=5))
        cache.clear()  # Next request window / different IP; issuer still has five sends/hour.
        latest = self.request_code()
        self.assertTrue(self.worker())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(PasswordResetOTP.objects.count(), 5)
        for response, expected in ((latest, 200), (original, 400)):
            verified = self.client.post(reverse("forgot-password-verify"),
                {"challenge_id": response.data["challenge_id"], "otp": code}, format="json")
            self.assertEqual(verified.status_code, expected, verified.data)
