from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from .models import BharathUser, ContractorProfile, ContractorCompletedProject
from .views import _profile_image_url
from quotations.models import Customer, CustomerFollowUp, Lead, SiteVisit


class ProfileDashboardTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.directory.name, DEBUG=False, SECURE_SSL_REDIRECT=False)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.user = BharathUser.objects.create_user(mobile="9888000931", password="test", role="CONTRACTOR")
        self.profile = ContractorProfile.objects.create(user=self.user, company_name="Test Company")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_all_public_profile_images_load_without_debug_media_routes(self):
        project = ContractorCompletedProject.objects.create(contractor=self.profile, title="Completed home")
        content = BytesIO()
        Image.new("RGB", (4, 4), "blue").save(content, format="PNG")
        for kind, record, field in [("owner", self.user, "profile_photo"), ("logo", self.profile, "company_logo"), ("project", project, "photo")]:
            image = getattr(record, field)
            image.save(f"{kind}.png", ContentFile(content.getvalue()), save=True)
            response = self.client.get(reverse("profile-image", kwargs={"kind": kind, "object_id": record.pk}))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "image/png")
            self.assertEqual(b"".join(response.streaming_content), content.getvalue())
        from django.test import RequestFactory
        from .serializers import ContractorCompletedProjectSerializer, ContractorProfileSerializer
        request = RequestFactory().get("/")
        self.assertIn("/api/accounts/profile-images/project/", ContractorCompletedProjectSerializer(project, context={"request": request}).data["photo"])
        self.assertIn("/api/accounts/profile-images/logo/", ContractorProfileSerializer(self.profile, context={"request": request}).data["company_logo"])
        self.assertIn("/api/accounts/profile-images/logo/", _profile_image_url(RequestFactory().get("/"), self.profile.company_logo))

    def test_media_endpoint_rejects_private_and_missing_images(self):
        self.assertEqual(self.client.get(reverse("profile-image", kwargs={"kind": "verification", "object_id": self.user.pk})).status_code, 404)
        self.assertEqual(self.client.get(reverse("profile-image", kwargs={"kind": "owner", "object_id": self.user.pk})).status_code, 404)
        customer_user = BharathUser.objects.create_user(mobile="9888000932", password="test", role="CUSTOMER")
        self.assertEqual(self.client.get(reverse("profile-image", kwargs={"kind": "owner", "object_id": customer_user.pk})).status_code, 404)

    def test_dashboard_separates_followups_and_both_sources_of_site_visits(self):
        customer = Customer.objects.create(contractor=self.user, name="Customer", mobile="9888000933")
        when = timezone.now() - timedelta(hours=1)
        call = CustomerFollowUp.objects.create(customer=customer, created_by=self.user, follow_up_type="CALL", next_follow_up=when)
        typed_visit = CustomerFollowUp.objects.create(customer=customer, created_by=self.user, follow_up_type="SITE_VISIT", next_follow_up=when)
        opportunity = Lead.objects.create(contractor=self.user, customer=customer, title="Home painting")
        visit = SiteVisit.objects.create(contractor=self.user, customer=customer, opportunity=opportunity, scheduled_date=timezone.localdate())
        other = BharathUser.objects.create_user(mobile="9888000934", password="test", role="CONTRACTOR")
        CustomerFollowUp.objects.create(customer=customer, created_by=other, follow_up_type="SITE_VISIT", next_follow_up=when)
        response = self.client.get(reverse("contractor-crm-dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data["tasks"]], [call.pk])
        self.assertEqual(response.data["counts"]["due_tasks"], 1)
        self.assertEqual(response.data["counts"]["site_visits"], 2)
        self.assertEqual({item["id"] for item in response.data["site_visits"]}, {visit.pk, f"followup-{typed_visit.pk}"})
