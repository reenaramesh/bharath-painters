from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from application_analytics.models import AnalyticsSession
from quotations.models import Customer, ContractorCustomerConnection, SavedCustomerContact


class CustomerDirectoryActivityTests(TestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile='9000062001', role='CONTRACTOR')
        self.other = BharathUser.objects.create_user(mobile='9000062002', role='CONTRACTOR')
        self.user = BharathUser.objects.create_user(mobile='9000062003', role='CUSTOMER')
        self.customer = Customer.objects.create(name='Customer', mobile=self.user.mobile, portal_user=self.user, contractor=self.contractor)
        self.connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor, status='CONNECTED')
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)

    def rows(self):
        response = self.client.get('/api/quotations/customers/?include_saved=1')
        self.assertEqual(response.status_code, 200)
        return response.data.get('results', []) if isinstance(response.data, dict) else response.data

    def test_connected_customer_gets_actual_activity(self):
        now = timezone.now()
        AnalyticsSession.objects.create(user=self.user, device='mobile', last_seen=now)
        self.assertEqual(self.rows()[0]['last_activity_at'], now)

    def test_connected_customer_without_records_has_null(self):
        self.assertIsNone(self.rows()[0]['last_activity_at'])

    def test_saved_disconnected_contact_does_not_expose_activity(self):
        AnalyticsSession.objects.create(user=self.user, device='mobile')
        self.connection.status = 'DISCONNECTED'
        self.connection.save()
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.contractor, details={'name': 'Private contact'})
        self.assertIsNone(self.rows()[0].get('last_activity_at'))

    def test_unrelated_contractor_cannot_see_customer_or_activity(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.rows(), [])

    def test_persisted_account_activity_is_not_lost(self):
        now = timezone.now()
        self.user.last_activity_at = now
        self.user.save(update_fields=['last_activity_at'])
        self.assertEqual(self.rows()[0]['last_activity_at'], now)
