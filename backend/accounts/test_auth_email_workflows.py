"""Authentication workflows use real OTP records and the in-memory email outbox."""
import re
from datetime import timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth.hashers import check_password, make_password
from django.core import mail, signing
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .legal import POLICY_VERSION
from .models import BharathUser, EmailOTPSetup, PasswordResetOTP


@override_settings(DEBUG=True, EMAIL_PROVIDER="DJANGO",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthEmailWorkflowTests(APITestCase):
    def setUp(self):
        cache.clear()
        media = TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)
        self.password = "River-stone-password-2026!"
        self.user = BharathUser.objects.create_user(
            mobile="9876500123", password=self.password, role="CONTRACTOR",
            email="owner@example.com", recovery_email="owner@example.com",
            recovery_email_verified=True,
        )

    def post(self, route, payload):
        return self.client.post(reverse(route), payload, format="json")

    def request_reset(self, mobile=None, role="CONTRACTOR"):
        return self.post("forgot-password-request", {"mobile": mobile or self.user.mobile, "role": role})

    def email_code(self):
        return re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)

    def reset_session(self):
        requested = self.request_reset()
        self.assertEqual(requested.status_code, 200, requested.data)
        verified = self.post("forgot-password-verify", {
            "challenge_id": requested.data["challenge_id"], "otp": self.email_code(),
        })
        self.assertEqual(verified.status_code, 200, verified.data)
        return verified.data["reset_token"]

    def confirm(self, token, password="Updated-river-password-2026!"):
        return self.post("forgot-password-confirm", {
            "reset_token": token, "new_password": password, "confirm_password": password,
        })

    def registration_payload(self, mobile="9876500124"):
        return {"mobile": mobile, "email": "new@example.com", "password": self.password,
                "owner_name": "New Owner", "company_name": "New Company", "name": "New Customer",
                "policy_version": POLICY_VERSION, "document_scrolled": True,
                "terms_accepted": True, "privacy_notice_acknowledged": True}

    def test_lookup_never_discloses_account_or_recovery_status(self):
        payload = {"mobile": self.user.mobile, "role": "CONTRACTOR"}
        known = self.post("forgot-password-lookup", payload)
        unknown = self.post("forgot-password-lookup", {**payload, "mobile": "9876500199"})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        self.assertNotIn("owner", str(known.data))
        self.assertEqual(known.data["masked_email"], "")
        self.assertEqual(known.data["bharath_id"], "")

    def test_reset_request_has_same_shape_for_known_and_unknown_accounts(self):
        known = self.request_reset()
        unknown = self.request_reset("9876500199")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(set(known.data), set(unknown.data))
        for key in set(known.data) - {"challenge_id"}:
            self.assertEqual(known.data[key], unknown.data[key])
        self.assertIsInstance(known.data["challenge_id"], str)
        self.assertNotIn("test_otp", known.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_unknown_and_ineligible_accounts_never_send_reset_email(self):
        for changes in ({"is_active": False}, {"recovery_email_verified": False}, {"recovery_email": ""}):
            cache.clear()
            self.user.is_active = True
            self.user.recovery_email_verified = True
            self.user.recovery_email = "owner@example.com"
            for field, value in changes.items():
                setattr(self.user, field, value)
            self.user.save()
            result = self.request_reset()
            self.assertEqual(result.status_code, 200, result.data)
            self.assertEqual(result.data["masked_email"], "")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(PasswordResetOTP.objects.count(), 0)

    def test_resend_cooldown_also_applies_to_unknown_accounts(self):
        for mobile in (self.user.mobile, "9876500199"):
            self.assertEqual(self.request_reset(mobile).status_code, 200)
            second = self.request_reset(mobile)
            self.assertEqual(second.status_code, 429)
            self.assertIn("Retry-After", second)

    def test_delivery_failure_stays_generic_and_invalidates_challenge(self):
        with patch("accounts.views.send_configured_email", return_value=False):
            result = self.request_reset()
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("could not", result.data["message"])
        self.assertTrue(PasswordResetOTP.objects.get().is_used)

    def test_reset_code_is_hashed_and_password_reset_is_one_time(self):
        token = self.reset_session()
        reset = PasswordResetOTP.objects.get()
        self.assertTrue(check_password(self.email_code(), reset.code_hash))
        self.assertNotEqual(self.email_code(), reset.code_hash)
        self.assertEqual(self.confirm(token).status_code, 200)
        self.assertEqual(self.confirm(token).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Updated-river-password-2026!"))
        self.assertEqual(self.post("login", {"mobile": self.user.mobile, "password": self.password}).status_code, 401)
        self.assertEqual(self.post("login", {"mobile": self.user.mobile, "password": "Updated-river-password-2026!"}).status_code, 200)

    def test_reset_is_rejected_after_account_disabled(self):
        token = self.reset_session()
        self.user.is_active = False
        self.user.save(update_fields=("is_active",))
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_reset_is_rejected_after_recovery_email_changes(self):
        token = self.reset_session()
        self.user.recovery_email = "changed@example.com"
        self.user.save(update_fields=("recovery_email",))
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_reset_is_rejected_after_another_password_change(self):
        token = self.reset_session()
        self.user.set_password("Independent-password-change-2026!")
        self.user.save(update_fields=("password",))
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_malformed_challenges_do_not_raise_server_errors(self):
        for value in ("abc", -1, 2**100, True, 1.5, {}, [], None):
            with self.subTest(value=value):
                result = self.post("forgot-password-verify", {"challenge_id": value, "otp": "123456"})
                self.assertEqual(result.status_code, 400)

    def test_expired_and_tampered_reset_sessions_are_rejected(self):
        token = self.reset_session()
        self.assertEqual(self.confirm(token + "tampered").status_code, 400)
        PasswordResetOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_expired_otp_is_rejected(self):
        requested = self.request_reset()
        PasswordResetOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.post("forgot-password-verify", {
            "challenge_id": requested.data["challenge_id"], "otp": self.email_code(),
        })
        self.assertEqual(response.status_code, 400)

    def test_rejected_reset_codes_perform_one_hash_without_consuming_attempts(self):
        requested = self.request_reset()
        challenge = PasswordResetOTP.objects.get()
        cases = (
            ("unknown", "invalid", {}, {}),
            ("expired", requested.data["challenge_id"], {"expires_at": timezone.now() - timedelta(seconds=1)}, {}),
            ("used", requested.data["challenge_id"], {"is_used": True}, {}),
            ("attempt_limit", requested.data["challenge_id"], {"attempts": challenge.max_attempts}, {}),
            ("verified", requested.data["challenge_id"], {"verified_at": timezone.now()}, {}),
            ("disabled", requested.data["challenge_id"], {}, {"is_active": False}),
            ("changed_email", requested.data["challenge_id"], {}, {"recovery_email": "changed@example.com"}),
        )
        for label, public_id, otp_changes, user_changes in cases:
            with self.subTest(label=label):
                cache.clear()
                PasswordResetOTP.objects.filter(pk=challenge.pk).update(
                    **{"expires_at": timezone.now() + timedelta(minutes=5), "is_used": False,
                       "attempts": 0, "verified_at": None, **otp_changes})
                BharathUser.objects.filter(pk=self.user.pk).update(
                    **{"is_active": True, "recovery_email": "owner@example.com", **user_changes})
                with patch("accounts.views.make_password", wraps=make_password) as dummy_hash:
                    response = self.post("forgot-password-verify", {"challenge_id": public_id, "otp": "123456"})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": "The verification code is invalid or expired."})
                dummy_hash.assert_called_once_with("123456")
                challenge.refresh_from_db()
                self.assertEqual(challenge.attempts, otp_changes.get("attempts", 0))

    def test_password_validation_does_not_consume_reset_session(self):
        token = self.reset_session()
        self.assertEqual(self.confirm(token, "123").status_code, 400)
        self.assertFalse(PasswordResetOTP.objects.get().is_used)
        self.assertEqual(self.confirm(token).status_code, 200)

    def test_customer_registration_email_can_be_verified(self):
        payload = self.registration_payload()
        response = self.post("register-customer", payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["email_verification_pending"])
        self.assertNotIn("test_otp", response.data)
        verified = self.post("registration-email-verify", {
            "mobile": payload["mobile"], "password": payload["password"],
            "challenge_id": response.data["challenge_id"], "otp": self.email_code(),
        })
        self.assertEqual(verified.status_code, 200, verified.data)
        user = BharathUser.objects.get(mobile="+91" + payload["mobile"])
        self.assertEqual(user.recovery_email, payload["email"])
        self.assertTrue(user.recovery_email_verified)
        self.assertEqual(self.post("login", {"email": payload["email"], "password": payload["password"]}).status_code, 200)
        self.assertEqual(self.post("registration-email-verify", {
            "mobile": payload["mobile"], "password": payload["password"],
            "challenge_id": response.data["challenge_id"], "otp": self.email_code(),
        }).status_code, 400)

    def test_registration_resend_cooldown_replaces_only_registration_code(self):
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        credentials = {"mobile": self.user.mobile, "password": self.password}
        first = self.post("registration-email-request", credentials)
        self.assertEqual(first.status_code, 200)
        self.assertIn("resend_after_seconds", first.data)
        second = self.post("registration-email-request", credentials)
        self.assertEqual(second.status_code, 429)
        PasswordResetOTP.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        third = self.post("registration-email-request", credentials)
        self.assertEqual(third.status_code, 200)
        self.assertNotEqual(first.data["challenge_id"], third.data["challenge_id"])
        self.assertTrue(PasswordResetOTP.objects.get(pk=first.data["challenge_id"]).is_used)

    def test_registration_code_is_bound_to_user_and_current_email_and_expiry(self):
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        credentials = {"mobile": self.user.mobile, "password": self.password}
        issued = self.post("registration-email-request", credentials)
        payload = {**credentials, "challenge_id": issued.data["challenge_id"], "otp": self.email_code()}
        other = BharathUser.objects.create_user(mobile="9876500191", password=self.password, role="CUSTOMER", email="other@example.com")
        self.assertEqual(self.post("registration-email-verify", {**payload, "mobile": other.mobile}).status_code, 400)
        self.user.email = "changed@example.com"
        self.user.save(update_fields=("email",))
        self.assertEqual(self.post("registration-email-verify", payload).status_code, 400)
        self.user.email = "owner@example.com"
        self.user.save(update_fields=("email",))
        PasswordResetOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("registration-email-verify", payload).status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.recovery_email_verified)

    @override_settings(CORS_ALLOWED_ORIGINS=["https://customers.example.com"])
    def test_real_cors_preflight_allows_only_configured_frontend(self):
        for origin, allowed in (("https://customers.example.com", True), ("https://untrusted.example.com", False)):
            response = self.client.options(reverse("forgot-password-request"), HTTP_ORIGIN=origin,
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST", HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get("Access-Control-Allow-Origin"), origin if allowed else None)

    @override_settings(DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.filebased.EmailBackend")
    def test_public_registration_cannot_use_development_email_backend(self):
        before = BharathUser.objects.count()
        for route in ("register-contractor", "register-painter", "register-customer"):
            result = self.post(route, self.registration_payload())
            self.assertEqual(result.status_code, 503, result.data)
        self.assertEqual(BharathUser.objects.count(), before)

    @override_settings(DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.filebased.EmailBackend")
    def test_unconfigured_production_recovery_is_explicitly_unavailable_for_everyone(self):
        responses = [self.request_reset(number) for number in (self.user.mobile, "9876500199")]
        self.assertEqual([response.status_code for response in responses], [503, 503])
        self.assertEqual(responses[0].data, responses[1].data)
        self.assertEqual(PasswordResetOTP.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(FRONTEND_URL="https://customers.example.com")
    def test_saved_admin_url_cannot_override_validated_authentication_email_links(self):
        EmailOTPSetup.objects.create(is_active=True, frontend_url="http://stale-admin-link.example.com")
        self.request_reset()
        self.assertIn("https://customers.example.com/forgot-password", mail.outbox[-1].body)
        self.assertNotIn("stale-admin-link", mail.outbox[-1].body)

    def test_registration_rejects_disabled_account_for_resend_and_verify(self):
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        credentials = {"mobile": self.user.mobile, "password": self.password}
        issued = self.post("registration-email-request", credentials)
        self.user.is_active = False
        self.user.save(update_fields=("is_active",))
        verified = self.post("registration-email-verify", {
            **credentials, "challenge_id": issued.data["challenge_id"], "otp": self.email_code(),
        })
        self.assertEqual(verified.status_code, 400)
        self.assertEqual(self.post("registration-email-request", credentials).status_code, 400)

    def test_contractor_and_painter_registration_verify_then_recover(self):
        for route, role, mobile in (("register-contractor", "CONTRACTOR", "9876500131"),
                                    ("register-painter", "PAINTER", "9876500132")):
            with self.subTest(role=role):
                cache.clear()
                payload = self.registration_payload(mobile)
                payload["email"] = f"{role.lower()}@example.com"
                response = self.post(route, payload)
                self.assertEqual(response.status_code, 201, response.data)
                self.assertNotIn("test_otp", response.data)
                verified = self.post("registration-email-verify", {
                    "mobile": mobile, "password": self.password,
                    "challenge_id": response.data["challenge_id"], "otp": self.email_code(),
                })
                self.assertEqual(verified.status_code, 200, verified.data)
                requested = self.request_reset(mobile, role)
                reset = self.post("forgot-password-verify", {
                    "challenge_id": requested.data["challenge_id"], "otp": self.email_code(),
                })
                self.assertEqual(reset.status_code, 200, reset.data)
                self.assertEqual(self.confirm(reset.data["reset_token"]).status_code, 200)

    def test_weak_registration_passwords_are_rejected_without_creating_users(self):
        for route in ("register-contractor", "register-painter", "register-customer"):
            cache.clear()
            payload = self.registration_payload()
            payload["password"] = "12345678"
            result = self.post(route, payload)
            self.assertEqual(result.status_code, 400, result.data)
            self.assertIn("password", result.data)
        self.assertEqual(BharathUser.objects.count(), 1)

    def test_wrong_codes_have_the_same_public_response_for_unknown_and_known(self):
        known = self.request_reset()
        unknown = self.request_reset("9876500199")
        results = [self.post("forgot-password-verify", {"challenge_id": response.data["challenge_id"], "otp": "wrong"})
                   for response in (known, unknown)]
        self.assertEqual(results[0].status_code, 400)
        self.assertEqual(results[0].data, results[1].data)

    def test_resending_invalidates_the_previous_public_challenge(self):
        first = self.request_reset()
        old_code = self.email_code()
        cache.clear()
        PasswordResetOTP.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        second = self.request_reset()
        rejected = self.post("forgot-password-verify", {"challenge_id": first.data["challenge_id"], "otp": old_code})
        self.assertEqual(rejected.status_code, 400)
        accepted = self.post("forgot-password-verify", {"challenge_id": second.data["challenge_id"], "otp": self.email_code()})
        self.assertEqual(accepted.status_code, 200, accepted.data)

    def test_reset_code_verification_is_one_time(self):
        request = self.request_reset()
        payload = {"challenge_id": request.data["challenge_id"], "otp": self.email_code()}
        first = self.post("forgot-password-verify", payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.post("forgot-password-verify", payload).status_code, 400)
        self.assertEqual(self.confirm(first.data["reset_token"]).status_code, 200)

    def test_old_registration_code_cannot_replace_a_later_verified_recovery_email(self):
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        credentials = {"mobile": self.user.mobile, "password": self.password}
        issued = self.post("registration-email-request", credentials)
        code = self.email_code()
        self.user.recovery_email = "later-verified@example.com"
        self.user.recovery_email_verified = True
        self.user.save(update_fields=("recovery_email", "recovery_email_verified"))
        response = self.post("registration-email-verify", {**credentials, "challenge_id": issued.data["challenge_id"], "otp": code})
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.recovery_email, "later-verified@example.com")

    def test_request_challenge_expires_and_tampering_is_rejected(self):
        import time
        requested = self.request_reset()
        payload = {"challenge_id": requested.data["challenge_id"] + "altered", "otp": self.email_code()}
        self.assertEqual(self.post("forgot-password-verify", payload).status_code, 400)
        payload["challenge_id"] = requested.data["challenge_id"]
        with patch("django.core.signing.time.time", return_value=time.time() + 3601):
            self.assertEqual(self.post("forgot-password-verify", payload).status_code, 400)

    def test_existing_integer_challenge_contract_remains_accepted(self):
        self.request_reset()
        challenge = PasswordResetOTP.objects.get()
        response = self.post("forgot-password-verify", {"challenge_id": challenge.pk, "otp": self.email_code()})
        self.assertEqual(response.status_code, 200, response.data)

    def test_verify_rechecks_account_and_email_before_issuing_a_reset_token(self):
        requested = self.request_reset()
        code = self.email_code()
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        result = self.post("forgot-password-verify", {"challenge_id": requested.data["challenge_id"], "otp": code})
        self.assertEqual(result.status_code, 400)
        self.assertNotIn("reset_token", result.data)

    def test_ip_rate_limit_is_enforced_for_unknown_accounts(self):
        for index in range(5):
            self.assertEqual(self.request_reset(f"98765002{index:02d}").status_code, 200)
        self.assertEqual(self.request_reset("9876500299").status_code, 429)

    def test_signed_reset_payload_cannot_select_a_different_user(self):
        from .views import PASSWORD_RESET_SIGNING_SALT
        self.reset_session()
        for payload in ([], "text", {"challenge_id": True, "user_id": 1}, {"challenge_id": 2**90, "user_id": 1}):
            token = signing.dumps(payload, salt=PASSWORD_RESET_SIGNING_SALT)
            self.assertEqual(self.confirm(token).status_code, 400)
