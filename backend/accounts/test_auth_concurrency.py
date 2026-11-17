"""Real row-lock regressions; skipped on SQLite, exercised by the owned PG runner."""
from concurrent.futures import ThreadPoolExecutor
import re
from threading import Barrier

from django.core import mail
from django.core.cache import cache
from django.db import close_old_connections, connections
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from django.urls import reverse
from rest_framework.test import APIClient

from .models import BharathUser, PasswordResetOTP


@override_settings(DEBUG=True, AUTH_EMAIL_ENABLED=True, PASSWORD_RECOVERY_DELIVERY_MODE="sync",
                   EMAIL_PROVIDER="DJANGO", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthenticationConcurrencyTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.password = "Concurrent-original-password-2026!"
        self.user = BharathUser.objects.create_user(mobile="9876550021", password=self.password, role="CUSTOMER",
            recovery_email="concurrent@example.invalid", recovery_email_verified=True)
        self.client = APIClient()

    def request(self):
        result = self.client.post(reverse("forgot-password-request"), {"mobile": self.user.mobile, "role": "CUSTOMER"}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        code = re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)
        return {"challenge_id": result.data["challenge_id"], "otp": code}

    def simultaneously(self, route, payload):
        barrier = Barrier(2)
        def perform():
            close_old_connections()
            try:
                barrier.wait(timeout=15)
                return APIClient().post(reverse(route), payload, format="json").status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(perform) for _ in range(2)]
            return sorted(future.result(timeout=30) for future in futures)

    @skipUnlessDBFeature("has_select_for_update")
    def test_only_one_simultaneous_code_verification_succeeds(self):
        self.assertEqual(self.simultaneously("forgot-password-verify", self.request()), [200, 400])

    @skipUnlessDBFeature("has_select_for_update")
    def test_only_one_simultaneous_reset_consumes_the_token(self):
        verified = self.client.post(reverse("forgot-password-verify"), self.request(), format="json")
        payload = {"reset_token": verified.data["reset_token"], "new_password": "Concurrent-new-password-2026!",
                   "confirm_password": "Concurrent-new-password-2026!"}
        self.assertEqual(self.simultaneously("forgot-password-confirm", payload), [200, 400])
        self.assertFalse(PasswordResetOTP.objects.filter(is_used=False).exists())

    @skipUnlessDBFeature("has_select_for_update_skip_locked")
    @override_settings(PASSWORD_RECOVERY_DELIVERY_MODE="queued")
    def test_two_workers_process_one_queued_request_only_once(self):
        from .recovery_queue import process_recovery_request
        result = self.client.post(reverse("forgot-password-request"),
            {"mobile": self.user.mobile, "role": "CUSTOMER"}, format="json")
        self.assertEqual(result.status_code, 200)
        barrier = Barrier(2)
        def perform():
            close_old_connections()
            try:
                barrier.wait(timeout=15)
                return process_recovery_request()
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(perform) for _ in range(2)]
            self.assertEqual(sorted(future.result(timeout=30) for future in futures), [False, True])
        self.assertEqual(PasswordResetOTP.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)
