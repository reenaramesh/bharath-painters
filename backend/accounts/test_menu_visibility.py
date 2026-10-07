from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .models import BharathUser

@override_settings(SECURE_SSL_REDIRECT=False)
class MenuVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = BharathUser.objects.create_user(mobile="9888000941", password="test", role="ADMIN")
        self.worker = BharathUser.objects.create_user(mobile="9888000942", password="test", role="CONTRACTOR")
        self.url = "/api/accounts/menu-visibility/"

    def test_admin_changes_are_persisted_separately_by_role(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(self.url, {"role": "CONTRACTOR", "disabled": ["jobs", "messages"]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(self.worker)
        response = self.client.get(self.url)
        self.assertEqual(response.data["CONTRACTOR"], ["jobs", "messages"])
        self.assertEqual(response.data["PAINTER"], [])
        self.assertEqual(self.client.patch(self.url, {"role": "PAINTER", "disabled": []}, format="json").status_code, 403)

    def test_requires_authentication_and_rejects_invalid_changes(self):
        self.assertIn(self.client.get(self.url).status_code, [401, 403])
        self.client.force_authenticate(self.admin)
        for payload in [{"role": "ADMIN", "disabled": []}, {"role": "PAINTER", "disabled": ["dashboard"]}, {"role": "PAINTER", "disabled": "jobs"}, {"role": "PAINTER", "disabled": ["bad/id"]}]:
            self.assertEqual(self.client.patch(self.url, payload, format="json").status_code, 400)
