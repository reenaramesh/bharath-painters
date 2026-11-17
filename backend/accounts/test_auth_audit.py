"""Role/expiry/security regressions found in the complete auth audit."""
import re
import time
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core import mail, signing
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser, ContractorProfile, PainterProfile, PasswordResetOTP
from accounts.serializers import ContractorProfileSerializer
from jobs.employee_accounts import employee_activation_url, IN_HOUSE_EMPLOYEE_ACTIVATION_SALT
from jobs.models import ContractorApplicatorTeam


@override_settings(DEBUG=True, EMAIL_PROVIDER="DJANGO",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthAuditTests(APITestCase):
    def setUp(self):
        cache.clear()
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        settings_override = override_settings(MEDIA_ROOT=temporary.name)
        settings_override.enable()
        self.addCleanup(settings_override.disable)
        self.password = "Mountain-river-2026!"
        self.owner = self.user("9876510101", "CONTRACTOR", "owner")
        self.profile = ContractorProfile.objects.create(user=self.owner, company_name="Original company")

    def user(self, mobile, role, email_key, **fields):
        return BharathUser.objects.create_user(mobile=mobile, role=role, password=self.password,
            email=f"{email_key}@example.com", recovery_email=f"{email_key}@example.com",
            recovery_email_verified=True, is_verified=True, verification_status="VERIFIED", **fields)

    def post(self, route, payload):
        return self.client.post(reverse(route), payload, format="json")

    def request_code(self, user):
        response = self.post("forgot-password-request", {"mobile": user.mobile, "role": user.role})
        self.assertEqual(response.status_code, 200, response.data)
        code = re.search(r"code is (\d{6,10})", mail.outbox[-1].body).group(1)
        return {"challenge_id": response.data["challenge_id"], "otp": code}

    def test_password_saved_elsewhere_invalidates_a_code_before_verification(self):
        payload = self.request_code(self.owner)
        self.owner.set_password("Changed-through-another-screen-2026!")
        self.owner.save(update_fields=("password",))
        response = self.post("forgot-password-verify", payload)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(PasswordResetOTP.objects.get().is_used)

    def test_stale_profile_save_cannot_restore_credentials(self):
        stale_profile = ContractorProfile.objects.select_related("user").get(pk=self.profile.pk)
        updated_user = BharathUser.objects.get(pk=self.owner.pk)
        updated_user.set_password("Changed-concurrently-2026!")
        updated_user.recovery_email = "changed@example.com"
        updated_user.save(update_fields=("password", "recovery_email"))
        serializer = ContractorProfileSerializer(stale_profile, data={"company_name": "Updated company"}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        updated_user.refresh_from_db()
        self.assertTrue(updated_user.check_password("Changed-concurrently-2026!"))
        self.assertEqual(updated_user.recovery_email, "changed@example.com")

    def test_profile_password_change_requires_current_password_and_strength(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(reverse("contractor-profile"), {"password": "New-profile-password-2026!"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)
        response = self.client.patch(reverse("contractor-profile"), {
            "password": "12345678", "current_password": self.password}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_another_contractor_cannot_claim_a_pending_employee_activation(self):
        pending = BharathUser.objects.create_user(mobile="9876510108", role="PAINTER", password=None,
            first_name="Pending employee", is_verified=True, verification_status="VERIFIED")
        PainterProfile.objects.create(user=pending)
        ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=pending, employment_type="IN_HOUSE")
        attacker = self.user("9876510109", "CONTRACTOR", "other-contractor")
        self.client.force_authenticate(attacker)
        response = self.post("contractor-create-applicator", {
            "name": "Pending employee", "mobile": pending.mobile, "employment_type": "IN_HOUSE"})
        self.assertIn(response.status_code, (400, 409))
        self.assertNotIn("activation_url", response.data)
        self.assertEqual(ContractorApplicatorTeam.objects.filter(painter=pending).count(), 1)
        pending.refresh_from_db()
        self.assertFalse(pending.has_usable_password())

    def test_generic_team_link_cannot_claim_unregistered_employee(self):
        pending = BharathUser.objects.create_user(mobile="9876510110", role="PAINTER", password=None,
            first_name="Pending employee", is_verified=True, verification_status="VERIFIED")
        PainterProfile.objects.create(user=pending)
        ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=pending, employment_type="IN_HOUSE")
        other = self.user("9876510111", "CONTRACTOR", "other-owner")
        self.client.force_authenticate(other)
        result = self.client.post("/api/jobs/my-team/", {"painter_id": pending.pk}, format="json")
        self.assertIn(result.status_code, (400, 409))
        self.assertEqual(ContractorApplicatorTeam.objects.filter(painter=pending).count(), 1)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="audit-client.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_google_first_link_requires_previously_verified_email(self, verify):
        self.owner.recovery_email_verified = False
        self.owner.save(update_fields=("recovery_email_verified",))
        verify.return_value = {"sub": "google-subject", "email": self.owner.email, "email_verified": True}
        response = self.post("google-login", {"credential": "mock-google-credential"})
        self.assertEqual(response.status_code, 409)
        self.owner.refresh_from_db()
        self.assertIsNone(self.owner.google_subject)

    def test_all_existing_account_types_keep_identity_and_permissions_after_reset(self):
        painter = self.user("9876510121", "PAINTER", "painter")
        employee = self.user("9876510122", "PAINTER", "employee")
        customer = self.user("9876510123", "CUSTOMER", "customer")
        PainterProfile.objects.create(user=painter)
        PainterProfile.objects.create(user=employee)
        member = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=employee, employment_type="IN_HOUSE")
        for user in (self.owner, painter, employee, customer):
            with self.subTest(role=user.role, employee=user.pk == employee.pk):
                cache.clear()
                self.client.force_authenticate(None)
                before = (user.pk, user.role, user.is_staff, user.is_superuser)
                challenge = self.request_code(user)
                verified = self.post("forgot-password-verify", challenge)
                self.assertEqual(verified.status_code, 200, verified.data)
                new_password = "Changed-for-role-audit-2026!"
                confirmed = self.post("forgot-password-confirm", {"reset_token": verified.data["reset_token"],
                    "new_password": new_password, "confirm_password": new_password})
                self.assertEqual(confirmed.status_code, 200)
                login = self.post("login", {"mobile": user.mobile, "password": new_password})
                self.assertEqual(login.status_code, 200, login.data)
                user.refresh_from_db()
                self.assertEqual(before, (user.pk, user.role, user.is_staff, user.is_superuser))
                self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
                self.assertEqual(self.client.get(reverse("current-user")).status_code, 200)
                if user.role != "CONTRACTOR":
                    self.assertIn(self.client.get(reverse("contractor-profile")).status_code, (403, 404))
                self.client.credentials()
        self.assertEqual(ContractorApplicatorTeam.objects.get(pk=member.pk).painter_id, employee.pk)

    def test_employee_activation_expiry_invalid_and_reused_links(self):
        employee = BharathUser.objects.create_user(mobile="9876510130", role="PAINTER", password=None,
            first_name="Employee", is_verified=True, verification_status="VERIFIED")
        member = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=employee, employment_type="IN_HOUSE")
        token = employee_activation_url(member).rsplit("/", 1)[-1]
        endpoint = lambda value: reverse("in-house-employee-activation", args=[value])
        self.assertEqual(self.client.get(endpoint("invalid-token")).status_code, 410)
        with patch("django.core.signing.time.time", return_value=time.time() + 8 * 86400):
            self.assertEqual(self.client.get(endpoint(token)).status_code, 410)
        self.assertEqual(self.client.get(endpoint(token)).status_code, 200)
        data = {"password": self.password, "confirm_password": self.password}
        self.assertEqual(self.client.post(endpoint(token), data, format="json").status_code, 200)
        self.assertEqual(self.client.post(endpoint(token), data, format="json").status_code, 410)
        self.assertEqual(self.client.get(endpoint(token)).status_code, 410)

    def test_login_throttle_cannot_be_bypassed_by_rotating_forwarded_header(self):
        for index in range(10):
            response = self.client.post(reverse("login"), {"mobile": self.owner.mobile, "password": "wrong"},
                format="json", HTTP_X_FORWARDED_FOR=f"198.51.100.{index}")
            self.assertEqual(response.status_code, 401)
        response = self.client.post(reverse("login"), {"mobile": self.owner.mobile, "password": "wrong"},
            format="json", HTTP_X_FORWARDED_FOR="203.0.113.10")
        self.assertEqual(response.status_code, 429)

    def test_non_object_auth_payloads_return_validation_errors(self):
        for route in ("login", "register-contractor", "register-painter", "register-customer",
                      "registration-email-request", "registration-email-verify", "forgot-password-lookup",
                      "forgot-password-request", "forgot-password-verify", "forgot-password-confirm"):
            with self.subTest(route=route):
                self.assertEqual(self.post(route, []).status_code, 400)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="audit-client.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_existing_google_subject_binding_remains_usable(self, verify):
        self.owner.google_subject = "existing-google-subject"
        self.owner.recovery_email_verified = False
        self.owner.save(update_fields=("google_subject", "recovery_email_verified"))
        verify.return_value = {"sub": "existing-google-subject", "email": "new-contact@example.com", "email_verified": True}
        response = self.post("google-login", {"credential": "mock-existing-google-credential"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["id"], self.owner.pk)

    def test_invalid_employee_links_are_rate_limited(self):
        route = reverse("in-house-employee-activation", args=["invalid"])
        for _ in range(10):
            self.assertEqual(self.client.get(route).status_code, 410)
        self.assertEqual(self.client.get(route).status_code, 429)

    def test_preexisting_secondary_membership_cannot_issue_or_use_activation(self):
        pending = BharathUser.objects.create_user(mobile="9876510190", role="PAINTER", password=None,
            is_verified=True, verification_status="VERIFIED")
        original = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=pending, employment_type="IN_HOUSE")
        other = self.user("9876510191", "CONTRACTOR", "secondary-owner")
        secondary = ContractorApplicatorTeam.objects.create(contractor=other, painter=pending, employment_type="IN_HOUSE")
        token = employee_activation_url(secondary).rsplit("/", 1)[-1]
        self.assertEqual(self.client.get(reverse("in-house-employee-activation", args=[token])).status_code, 410)
        self.client.force_authenticate(other)
        result = self.client.post(reverse("in-house-employee-activation-link", args=[secondary.pk]), {}, format="json")
        self.assertEqual(result.status_code, 409)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(reverse("in-house-employee-activation-link", args=[original.pk]), {}, format="json").status_code, 200)
