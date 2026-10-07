import json
from unittest.mock import patch

from django.urls import reverse
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from accounts.models import BharathUser, ContractorProfile, ProviderProfile, ProviderServiceClaim
from quotations.models import ServiceCategory, WorkDescription


class BusinessSettingsTests(APITestCase):
    def setUp(self):
        self.user = BharathUser.objects.create_user(mobile="9000000701", password="Pass123!", role="CONTRACTOR", first_name="Owner")
        self.company = ContractorProfile.objects.create(user=self.user, company_name="Original", owner_name="Owner", service_areas="Bengaluru", years_in_business=8, number_of_painters=12)
        self.service = ServiceCategory.objects.create(name="Painting")
        self.work = WorkDescription.objects.create(name="Interior", service_category=self.service)
        self.provider = ProviderProfile.objects.create(user=self.user, core_service=self.service, service_areas="Bengaluru", years_in_business=8, team_size=12)
        self.claim = ProviderServiceClaim.objects.create(provider=self.provider, category=self.service, work_description=self.work, note="Existing note", is_active=False)
        self.client.force_authenticate(self.user)
        self.url = reverse("business-settings")

    def test_get_returns_both_existing_profiles(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["company"]["company_name"], "Original")
        self.assertEqual(response.data["provider"]["team_size"], 12)
        self.assertEqual(response.data["provider"]["service_claims"][0]["note"], "Existing note")

    def test_company_and_provider_save_together(self):
        response = self.client.patch(self.url, {"company": {"company_name": "Updated", "service_areas": "Mysuru", "years_in_business": 9}, "provider": {"headline": "Specialist", "team_size": 15}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.company.refresh_from_db()
        self.provider.refresh_from_db()
        self.assertEqual(self.company.company_name, "Updated")
        self.assertEqual(self.company.number_of_painters, 15)
        self.assertEqual(self.provider.service_areas, "Mysuru")
        self.assertEqual(self.provider.years_in_business, 9)
        self.assertEqual(self.provider.headline, "Specialist")
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.note, "Existing note")
        self.assertFalse(self.claim.is_active)

    def test_unrelated_settings_save_omits_service_fields_and_preserves_core(self):
        response = self.client.patch(
            self.url,
            {"company": {"company_name": "Renamed"}, "provider": {"headline": "Updated"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.provider.refresh_from_db()
        self.assertEqual(self.provider.core_service_id, self.service.id)

    def test_profile_photo_and_logo_positions_round_trip_and_survive_unrelated_save(self):
        logo_position = {"x": 24, "y": 68, "zoom": 1.8}
        photo_position = {"x": 73, "y": 35, "zoom": 1.4}
        response = self.client.patch(self.url, {
            "company": {"company_logo_position": logo_position, "profile_photo_position": photo_position},
            "provider": {},
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["company"]["company_logo_position"], logo_position)
        self.assertEqual(response.data["company"]["profile_photo_position"], photo_position)
        response = self.client.patch(self.url, {
            "company": {"company_name": "Renamed"}, "provider": {"headline": "Specialist"},
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["company"]["company_logo_position"], logo_position)
        self.assertEqual(response.data["company"]["profile_photo_position"], photo_position)

    def test_patch_omission_preserves_existing_shared_conflicts(self):
        self.provider.team_size = 0
        self.provider.save(update_fields=["team_size"])
        response = self.client.patch(self.url, {"company": {"company_name": "Updated"}, "provider": {"headline": "Updated"}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.company.refresh_from_db()
        self.provider.refresh_from_db()
        self.assertEqual(self.company.number_of_painters, 12)
        self.assertEqual(self.provider.team_size, 0)
        self.assertEqual(self.provider.service_areas, "Bengaluru")

    def test_validation_error_does_not_partially_save_company(self):
        response = self.client.patch(self.url, {"company": {"company_name": "Must not save"}, "provider": {"additional_services": [self.service.pk]}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.company.refresh_from_db()
        self.assertEqual(self.company.company_name, "Original")

    def test_provider_save_error_rolls_back_company_and_user(self):
        with patch("accounts.views.ProviderProfileSerializer.save", side_effect=ValidationError({"detail": "Claim save failed"})):
            response = self.client.patch(self.url, {"company": {"company_name": "Must not save", "owner_name": "Changed Owner"}, "provider": {"headline": "Updated"}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.company.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(self.company.company_name, "Original")
        self.assertEqual(self.user.first_name, "Owner")

    def test_multipart_json_parts_and_document_clear(self):
        self.company.gst_document = "verification/contractors/gst/example.pdf"
        self.company.save(update_fields=["gst_document"])
        response = self.client.patch(self.url, {"company": json.dumps({"company_name": "Updated", "gst_document": None}), "provider": json.dumps({"team_size": 0})}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["company"]["gst_document"])
        self.assertEqual(response.data["company"]["number_of_painters"], 0)
        self.assertEqual(response.data["provider"]["team_size"], 0)

    def test_publish_uses_existing_branding_rules(self):
        response = self.client.patch(self.url, {"company": {"company_name": "Updated"}, "provider": {"workspace_name_override": "New workspace"}, "publish": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["provider"]["is_published"])
        self.assertFalse(response.data["provider"]["is_draft"])
        self.assertEqual(response.data["provider"]["brand_snapshot"]["workspace_name"], "New workspace")

    def test_failed_publish_rolls_back_all_changes(self):
        response = self.client.patch(self.url, {"company": {"company_name": "Must not save"}, "provider": {"core_service": None, "service_claims": []}, "publish": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.company.refresh_from_db()
        self.provider.refresh_from_db()
        self.assertEqual(self.company.company_name, "Original")
        self.assertEqual(self.provider.core_service_id, self.service.pk)
        self.assertTrue(self.provider.service_claims.filter(pk=self.claim.pk).exists())

    def test_conflicting_aliases_are_refused(self):
        response = self.client.patch(self.url, {"company": {"service_areas": "Mysuru"}, "provider": {"service_areas": "Bengaluru"}}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_employee_customer_admin_and_support_are_refused(self):
        for index, role in enumerate(("PAINTER", "CUSTOMER", "ADMIN", "SUPPORT")):
            user = BharathUser.objects.create_user(mobile=f"900000071{index}", role=role)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code, 403)
            self.assertEqual(self.client.patch(self.url, {"company": {}}, format="json").status_code, 403)

    def test_invalid_json_is_refused(self):
        response = self.client.patch(self.url, {"company": "{"}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_company_only_save_does_not_revalidate_unchanged_legacy_service(self):
        self.service.is_provider_selectable = False
        self.service.save(update_fields=["is_provider_selectable"])
        response = self.client.patch(self.url, {"company": {"company_name": "Updated"}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["provider"]["core_service"], self.service.pk)

    @override_settings(STORAGES={**settings.STORAGES, "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
    def test_multipart_document_upload_uses_existing_file_field(self):
        upload = SimpleUploadedFile("certificate.pdf", b"%PDF-1.4\nexample", content_type="application/pdf")
        response = self.client.patch(self.url, {"company": json.dumps({"company_name": "With certificate"}), "provider": json.dumps({"headline": "With document"}), "gst_document": upload}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("certificate.pdf", response.data["company"]["gst_document"])
        self.company.refresh_from_db()
        self.assertEqual(self.company.gst_document.read(), b"%PDF-1.4\nexample")
