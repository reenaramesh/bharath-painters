from datetime import timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.urls import reverse
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BharathUser, ContractorProfile, PainterProfile, PasswordResetOTP, UserLegalConsent
from .legal import POLICY_VERSION


class AuthenticationApiTests(APITestCase):

    def setUp(self):
        self.password = "Strong-test-password-2026"
        self.user = BharathUser.objects.create_user(
            mobile="9000000001",
            email="contractor@example.com",
            password=self.password,
            first_name="Test",
            last_name="Contractor",
            role=BharathUser.Roles.CONTRACTOR,
            recovery_email="recovery@example.com",
            recovery_email_verified=True,
            recovery_email_verified_at=timezone.now(),
        )

    def login(self):
        return self.client.post(
            reverse("login"),
            {"mobile": self.user.mobile, "password": self.password},
            format="json",
        )

    def test_login_returns_user_and_jwt_pair(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        self.assertEqual(response.data["user"]["role"], BharathUser.Roles.CONTRACTOR)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_current_user_requires_and_accepts_access_token(self):
        anonymous = self.client.get(reverse("current-user"))
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(reverse("current-user"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mobile"], self.user.mobile)
        self.assertEqual(response.data["first_name"], "Test")

    def test_refresh_token_returns_new_access_token(self):
        login = self.login()
        response = self.client.post(
            reverse("token-refresh"),
            {"refresh": login.data["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_invalid_password_is_rejected(self):
        response = self.client.post(
            reverse("login"),
            {"mobile": self.user.mobile, "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_accepts_equivalent_ten_digit_mobile_format(self):
        self.user.mobile = "09000000001"
        self.user.save(update_fields=("mobile",))
        response = self.client.post(
            reverse("login"),
            {"mobile": "9000000001", "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="test-client.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_google_login_links_one_existing_email_and_returns_jwt(self, verify_token):
        verify_token.return_value = {
            "sub": "google-user-123",
            "email": "contractor@example.com",
            "email_verified": True,
        }
        response = self.client.post(reverse("google-login"), {"credential": "signed-google-token"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        self.assertIn("access", response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.google_subject, "google-user-123")

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="test-client.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_google_login_does_not_create_unknown_account(self, verify_token):
        verify_token.return_value = {
            "sub": "unknown-google-user",
            "email": "unknown@example.com",
            "email_verified": True,
        }
        response = self.client.post(reverse("google-login"), {"credential": "signed-google-token"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(BharathUser.objects.filter(google_subject="unknown-google-user").exists())

    def test_recovery_lookup_accepts_equivalent_ten_digit_mobile_format(self):
        self.user.mobile = "09000000001"
        self.user.save(update_fields=("mobile",))
        response = self.client.post(
            reverse("forgot-password-lookup"),
            {"mobile": "9000000001", "role": "CONTRACTOR"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_reset"])

    @override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_can_be_reset_with_one_time_code(self):
        lookup = self.client.post(
            reverse("forgot-password-lookup"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        self.assertTrue(lookup.data["can_reset"])
        self.assertNotIn("recovery@example.com", str(lookup.data))
        requested = self.client.post(
            reverse("forgot-password-request"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        self.assertEqual(requested.status_code, status.HTTP_200_OK)
        self.assertIn("test_otp", requested.data)
        verified = self.client.post(
            reverse("forgot-password-verify"),
            {"challenge_id": requested.data["challenge_id"], "otp": requested.data["test_otp"]},
            format="json",
        )
        self.assertEqual(verified.status_code, status.HTTP_200_OK)
        new_password = "New-strong-password-2026"
        confirmed = self.client.post(
            reverse("forgot-password-confirm"),
            {
                "reset_token": verified.data["reset_token"],
                "new_password": new_password,
                "confirm_password": new_password,
            },
            format="json",
        )
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        login = self.client.post(
            reverse("login"),
            {"mobile": self.user.mobile, "password": new_password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        reused = self.client.post(
            reverse("forgot-password-confirm"),
            {
                "reset_token": verified.data["reset_token"],
                "new_password": "Another-strong-password-2026",
                "confirm_password": "Another-strong-password-2026",
            },
            format="json",
        )
        self.assertEqual(reused.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unverified_email_cannot_reset_password(self):
        self.user.recovery_email_verified = False
        self.user.save(update_fields=("recovery_email_verified",))
        lookup = self.client.post(
            reverse("forgot-password-lookup"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        self.assertFalse(lookup.data["can_reset"])
        requested = self.client.post(
            reverse("forgot-password-request"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        self.assertEqual(requested.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_lookup_does_not_match_a_contractor(self):
        response = self.client.post(
            reverse("forgot-password-lookup"),
            {"mobile": self.user.mobile, "role": "CUSTOMER"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["detail"],
            "Account not found. Please check your registered mobile number.",
        )

    @override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_authenticated_user_can_verify_and_change_recovery_email(self):
        self.client.force_authenticate(self.user)
        requested = self.client.post(
            reverse("recovery-email-request"),
            {
                "recovery_email": "new-recovery@example.com",
                "confirm_recovery_email": "new-recovery@example.com",
                "current_password": self.password,
            },
            format="json",
        )
        self.assertEqual(requested.status_code, status.HTTP_200_OK)
        verified = self.client.post(
            reverse("recovery-email-verify"),
            {"challenge_id": requested.data["challenge_id"], "otp": requested.data["test_otp"]},
            format="json",
        )
        self.assertEqual(verified.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.recovery_email, "new-recovery@example.com")
        self.assertTrue(self.user.recovery_email_verified)

    def test_recovery_email_change_requires_current_password(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("recovery-email-request"),
            {
                "recovery_email": "new-recovery@example.com",
                "confirm_recovery_email": "new-recovery@example.com",
                "current_password": "wrong-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_recovery_otp_is_limited_per_account_and_hour(self):
        for index in range(5):
            PasswordResetOTP.objects.create(
                user=self.user,
                purpose=PasswordResetOTP.Purpose.PASSWORD_RESET,
                target_email=self.user.recovery_email,
                code_hash=f"hash-{index}",
                expires_at=timezone.now() + timedelta(minutes=10),
                is_used=True,
            )
        response = self.client.post(
            reverse("forgot-password-request"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_recovery_otp_is_invalidated_after_five_wrong_attempts(self):
        requested = self.client.post(
            reverse("forgot-password-request"),
            {"mobile": self.user.mobile, "role": "CONTRACTOR"},
            format="json",
        )
        challenge_id = requested.data["challenge_id"]
        for _ in range(5):
            self.client.post(
                reverse("forgot-password-verify"),
                {"challenge_id": challenge_id, "otp": "000000"},
                format="json",
            )
        challenge = PasswordResetOTP.objects.get(pk=challenge_id)
        self.assertTrue(challenge.is_used)
        self.assertEqual(challenge.attempts, 5)


class ContractorDirectoryTests(APITestCase):

    def setUp(self):
        self.viewer = BharathUser.objects.create_user(
            mobile="9000000040", email="viewer@example.com", password="test-password",
        )
        self.verified = BharathUser.objects.create_user(
            mobile="9000000041", email="verified@example.com", password="test-password",
            role=BharathUser.Roles.CONTRACTOR, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
            bharath_id="BP-C-999991",
        )
        self.pending = BharathUser.objects.create_user(
            mobile="9000000042", email="pending@example.com", password="test-password",
            role=BharathUser.Roles.CONTRACTOR,
        )
        ContractorProfile.objects.create(user=self.verified, company_name="Verified Co", owner_name="Owner")
        ContractorProfile.objects.create(user=self.pending, company_name="Pending Co", owner_name="Pending")
        self.client.force_authenticate(self.viewer)

    def test_directory_contains_only_verified_contractors(self):
        response = self.client.get(reverse("contractor-directory"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["company_name"], "Verified Co")

    def test_directory_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("contractor-directory"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PainterDirectoryTests(APITestCase):

    def setUp(self):
        self.viewer = BharathUser.objects.create_user(
            mobile="9000000050", email="painter-viewer@example.com", password="test-password",
        )
        self.verified = BharathUser.objects.create_user(
            mobile="9000000051", email="verified-painter@example.com", password="test-password",
            first_name="Verified", last_name="Painter", role=BharathUser.Roles.PAINTER,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
            bharath_id="BP-P-999991",
        )
        self.pending = BharathUser.objects.create_user(
            mobile="9000000052", email="pending-painter@example.com", password="test-password",
            role=BharathUser.Roles.PAINTER,
        )
        PainterProfile.objects.create(user=self.verified, experience_years=5, skills="Interior painting")
        PainterProfile.objects.create(user=self.pending, experience_years=1)
        self.client.force_authenticate(self.viewer)

    def test_directory_contains_only_verified_painters(self):
        response = self.client.get(reverse("painter-directory"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Verified Painter")
        self.assertEqual(response.data[0]["experience_years"], 5)

    def test_directory_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("painter-directory"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ProfileCardTests(APITestCase):
    def test_contractor_profile_card_contains_details_but_safe_share_text(self):
        user = BharathUser.objects.create_user(
            mobile="9000000060", email="company@example.com", password="test-password",
            role=BharathUser.Roles.CONTRACTOR, first_name="Owner", is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED, bharath_id="BP-C-999960",
        )
        ContractorProfile.objects.create(
            user=user, company_name="Colour Works", owner_name="Owner",
            office_address="Bengaluru", service_areas="560017", gst_number="29ABCDE1234F1Z5",
            bank_account_number="1234567890",
        )
        self.client.force_authenticate(user)
        response = self.client.get(reverse("profile-card"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Colour Works")
        self.assertIn("verify-page/BP-C-999960", response.data["profile_url"])
        self.assertTrue(response.data["qr_image"].endswith(".png"))
        self.assertNotIn("1234567890", response.data["share_text"])
        self.assertNotIn("29ABCDE1234F1Z5", response.data["share_text"])

    def test_painter_profile_card_contains_experience_and_skills(self):
        user = BharathUser.objects.create_user(
            mobile="9000000062", email="applicator@example.com", password="test-password",
            role=BharathUser.Roles.PAINTER, first_name="Rama", is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED, bharath_id="BP-P-999962",
        )
        PainterProfile.objects.create(user=user, experience_years=8, skills="Interior Painting, Wood Polish")
        self.client.force_authenticate(user)
        response = self.client.get(reverse("profile-card"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bharath_id"], "BP-P-999962")
        self.assertIn({"label": "Years of experience", "value": "8"}, response.data["details"])
        self.assertIn({"label": "Skills", "value": "Interior Painting, Wood Polish"}, response.data["details"])

    def test_customer_cannot_open_professional_qr_profile(self):
        user = BharathUser.objects.create_user(
            mobile="9000000063", password="test-password", role=BharathUser.Roles.CUSTOMER,
        )
        self.client.force_authenticate(user)
        response = self.client.get(reverse("profile-card"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

# Create your tests here.


class AutomaticBusinessVerificationTests(APITestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.media.name)
        self.media_settings.enable()

    def tearDown(self):
        self.media_settings.disable()
        self.media.cleanup()

    def assert_identity_ready(self, user, prefix):
        user.refresh_from_db()
        self.assertTrue(user.is_verified)
        self.assertEqual(user.verification_status, BharathUser.VerificationStatus.VERIFIED)
        self.assertTrue(user.bharath_id.startswith(prefix))
        self.assertTrue(user.bharath_qr.name)
        self.assertTrue(user.bharath_qr.storage.exists(user.bharath_qr.name))
        self.assertIsNotNone(user.verified_at)
        self.assertIsNotNone(user.badge_issued_at)

    def test_contractor_registration_issues_verified_badge_and_qr(self):
        response = self.client.post(reverse("register-contractor"), {
            "mobile": "9888777701", "email": "new-contractor@example.com",
            "password": "strong-password", "company_name": "Instant Paint Co",
            "owner_name": "Owner",
            "policy_version": POLICY_VERSION, "document_scrolled": True,
            "terms_accepted": True, "privacy_notice_acknowledged": True,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = BharathUser.objects.get(pk=response.data["user_id"])
        self.assert_identity_ready(user, "BP-C-")
        self.assertEqual(response.data["verification_status"], "VERIFIED")
        self.assertEqual(response.data["bharath_id"], user.bharath_id)
        self.assertTrue(UserLegalConsent.objects.filter(user=user, policy_version=POLICY_VERSION).exists())

    def test_applicator_registration_issues_verified_badge_and_qr(self):
        response = self.client.post(reverse("register-painter"), {
            "mobile": "9888777702", "email": "new-applicator@example.com",
            "password": "strong-password", "first_name": "Rama",
            "experience_years": 4, "skills": "Interior painting",
            "policy_version": POLICY_VERSION, "document_scrolled": True,
            "terms_accepted": True, "privacy_notice_acknowledged": True,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = BharathUser.objects.get(pk=response.data["user_id"])
        self.assert_identity_ready(user, "BP-P-")
        self.assertEqual(response.data["verification_status"], "VERIFIED")
        self.assertEqual(response.data["bharath_id"], user.bharath_id)
        self.assertTrue(UserLegalConsent.objects.filter(user=user, policy_version=POLICY_VERSION).exists())

    def test_registration_is_rejected_without_current_consent(self):
        response = self.client.post(reverse("register-contractor"), {
            "mobile": "9888777703", "email": "no-consent@example.com",
            "password": "strong-password", "company_name": "No Consent Co",
            "owner_name": "Owner",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("policy_version", response.data)
        self.assertFalse(BharathUser.objects.filter(mobile="9888777703").exists())

    def test_registration_legal_document_is_role_specific(self):
        response = self.client.get(reverse("registration-legal-document"), {"role": "PAINTER"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["policy_version"], POLICY_VERSION)
        combined = " ".join(section["title"] for section in response.data["terms_sections"])
        self.assertIn("Paint Applicator responsibilities", combined)


class CustomerSelfRegistrationTests(APITestCase):
    def setUp(self):
        media = TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)
        self.payload = {
            "name": "Independent customer", "mobile": "9888877777",
            "email": "customer@example.com", "password": "customer-pass",
            "policy_version": POLICY_VERSION, "document_scrolled": True,
            "terms_accepted": True, "privacy_notice_acknowledged": True,
        }

    def register(self):
        return self.client.post(reverse("register-customer"), self.payload, format="json")

    def test_customer_can_register_without_contractor_and_sign_in(self):
        from quotations.models import Customer, ChatConversation
        response = self.register()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        customer = Customer.objects.get(normalized_mobile="+919888877777")
        self.assertIsNone(customer.contractor_id)
        self.assertFalse(customer.contractor_connections.exists())
        self.assertFalse(ChatConversation.objects.filter(customer=customer).exists())
        self.assertEqual(customer.portal_user.role, BharathUser.Roles.CUSTOMER)
        self.assertEqual(customer.portal_user.bharath_id, customer.bharath_id)
        self.assertTrue(customer.bharath_id)
        self.assertTrue(UserLegalConsent.objects.filter(user=customer.portal_user).exists())
        login = self.client.post(reverse("login"), {
            "mobile": self.payload["mobile"], "password": self.payload["password"],
        }, format="json")
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        self.assertEqual(login.data["user"]["role"], BharathUser.Roles.CUSTOMER)

    def test_duplicate_registration_does_not_replace_password(self):
        self.assertEqual(self.register().status_code, status.HTTP_201_CREATED)
        self.payload.update(mobile="+919888877777", password="replacement-pass")
        self.assertEqual(self.register().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BharathUser.objects.count(), 1)
        self.assertTrue(BharathUser.objects.get().check_password("customer-pass"))

    def test_existing_other_role_is_rejected_without_creating_customer(self):
        from quotations.models import Customer
        BharathUser.objects.create_user(mobile="+919888877777", password="contractor-pass", role=BharathUser.Roles.CONTRACTOR)
        self.assertEqual(self.register().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Customer.objects.exists())

    def test_invalid_mobile_is_rejected_without_creating_customer(self):
        from quotations.models import Customer
        self.payload["mobile"] = "1234567890"
        self.assertEqual(self.register().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Customer.objects.exists())
