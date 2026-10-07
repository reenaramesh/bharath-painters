from django.urls import reverse
from rest_framework.test import APITestCase
from accounts.models import BharathUser


class ScriptPreferenceTests(APITestCase):
    def test_per_account_script_persistence_and_validation(self):
        first = BharathUser.objects.create_user(mobile='9000000991', password='Test123!', role='CONTRACTOR')
        second = BharathUser.objects.create_user(mobile='9000000992', password='Test123!', role='CUSTOMER')
        self.client.force_authenticate(first)
        response = self.client.patch('/api/accounts/me/', {'preferred_language': 'te'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.preferred_language, 'te')
        self.assertEqual(second.preferred_language, 'en')
        restored = self.client.get('/api/accounts/me/')
        self.assertEqual(restored.data['preferred_language'], 'te')
        self.assertEqual(self.client.patch('/api/accounts/me/', {'preferred_language': 'invalid'}, format='json').status_code, 400)
        first.refresh_from_db()
        self.assertEqual(first.preferred_language, 'te')
        self.client.force_authenticate(second)
        self.assertEqual(self.client.get('/api/accounts/me/').data['preferred_language'], 'en')
