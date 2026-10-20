from tempfile import TemporaryDirectory
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from accounts.models import BharathUser, ContractorProfile


class SharedProfileRouteTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        setting = override_settings(MEDIA_ROOT=self.media.name, FRONTEND_URL='https://profiles.example.test', DEBUG=False, SECURE_SSL_REDIRECT=False)
        setting.enable()
        self.addCleanup(setting.disable)
        self.contractor = BharathUser.objects.create_user(mobile='9000000531', role='CONTRACTOR', is_verified=True, verification_status='VERIFIED', bharath_id='BP-C-905321')
        ContractorProfile.objects.create(user=self.contractor, company_name='Public painting company')
        self.client = APIClient()
        self.url = f'/api/accounts/verify-page/{self.contractor.bharath_id}/'

    def test_browser_profile_and_old_qr_links_open_the_shared_layout(self):
        response = self.client.get(self.url, HTTP_ACCEPT='text/html')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], f'https://profiles.example.test/contractor-profile/{self.contractor.bharath_id}')
        self.assertIn('Accept', response.get('Vary',''))

    def test_public_data_clients_keep_the_existing_safe_html_contract(self):
        response = self.client.get(self.url, HTTP_ACCEPT='application/json')
        self.assertEqual(response.status_code, 200)
        text = response.content.decode()
        self.assertIn('contractor-profile-data', text)
        self.assertIn('Public painting company', text)
        self.assertNotIn(self.contractor.password, text)
        self.assertIn('Accept', response.get('Vary',''))

    def test_unverified_profile_is_not_redirected_to_a_verified_presentation(self):
        self.contractor.verification_status='SUSPENDED'
        self.contractor.save(update_fields=['verification_status'])
        response=self.client.get(self.url, HTTP_ACCEPT='text/html')
        self.assertEqual(response.status_code,200)
        self.assertNotIn('contractor-profile-data',response.content.decode())
