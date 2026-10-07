from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser, ContractorProfile, ProviderProfile, ProviderServiceClaim
from quotations.models import ServiceCategory, WorkDescription


class ContractorDirectorySearchTests(APITestCase):
    def test_directory_includes_work_and_location_with_legacy_fallback(self):
        viewer = BharathUser.objects.create_user(mobile="9000000911", password="Test123!", role="CONTRACTOR")
        self.client.force_authenticate(viewer)
        target = BharathUser.objects.create_user(
            mobile="9000000912", password="Test123!", role="CONTRACTOR",
            is_verified=True, verification_status="VERIFIED",
        )
        ContractorProfile.objects.update_or_create(user=target, defaults={
            "company_name": "Water Works", "owner_name": "Owner",
            "office_address": "Whitefield 560037", "work_skills": "Terrace sealing",
        })
        painting = ServiceCategory.objects.create(name="Directory Painting")
        waterproofing = ServiceCategory.objects.create(name="Directory Waterproofing")
        description = WorkDescription.objects.create(name="Terrace membrane", service_category=waterproofing)
        inactive = WorkDescription.objects.create(name="Inactive service", service_category=waterproofing)
        provider, _ = ProviderProfile.objects.update_or_create(user=target, defaults={"core_service": painting, "base_location": "Bengaluru 560037"})
        provider.additional_services.add(waterproofing)
        ProviderServiceClaim.objects.create(provider=provider, category=waterproofing, work_description=description)
        ProviderServiceClaim.objects.create(provider=provider, category=waterproofing, work_description=inactive, is_active=False)
        response = self.client.get(reverse("contractor-directory"))
        self.assertEqual(response.status_code, 200)
        row = next(row for row in response.data if row["id"] == target.id)
        self.assertEqual(row["mobile"], target.mobile)
        self.assertEqual(row["base_location"], "Bengaluru 560037")
        self.assertEqual(row["work_skills"], "Terrace sealing")
        self.assertEqual(set(row["services"]), {painting.name, waterproofing.name, description.name})
        provider.delete()
        response = self.client.get(reverse("contractor-directory"))
        row = next(row for row in response.data if row["id"] == target.id)
        self.assertEqual(row["services"], [])
        self.assertEqual(row["base_location"], "")
