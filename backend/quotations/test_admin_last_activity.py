from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser, ContractorProfile, PainterProfile
from application_analytics.models import AnalyticsSession
from quotations.models import ActivityLog, Customer
from application_analytics.last_activity import last_activity_by_user


class AdminLastActivityTests(TestCase):
    def setUp(self):
        self.admin = BharathUser.objects.create_user(mobile='9000060000', role='ADMIN')
        self.contractor = BharathUser.objects.create_user(mobile='9000060001', role='CONTRACTOR')
        self.painter = BharathUser.objects.create_user(mobile='9000060002', role='PAINTER')
        self.customer_user = BharathUser.objects.create_user(mobile='9000060003', role='CUSTOMER')
        ContractorProfile.objects.get_or_create(user=self.contractor)
        PainterProfile.objects.get_or_create(user=self.painter)
        self.customer = Customer.objects.create(name='Linked customer', mobile='9000060003', portal_user=self.customer_user)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def dashboard(self):
        response = self.client.get('/api/quotations/admin-dashboard/')
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_latest_activity_uses_account_identity_for_all_directories(self):
        now = timezone.now()
        for user in (self.contractor, self.painter, self.customer_user):
            AnalyticsSession.objects.create(user=user, device='desktop', last_seen=now-timedelta(days=2))
            AnalyticsSession.objects.create(user=user, device='mobile', last_seen=now)
        result = self.dashboard()
        for section, identity in [('contractors', self.contractor.pk), ('applicators', self.painter.pk), ('customers', self.customer.pk)]:
            row = next(row for row in result[section] if row['id'] == identity)
            self.assertEqual(row['last_activity_at'], now)

    def test_successful_login_is_fallback_but_failed_login_is_not_activity(self):
        ActivityLog.objects.create(actor=self.customer_user, action='LOGIN', status_code=200)
        login = ActivityLog.objects.get(actor=self.customer_user)
        ActivityLog.objects.create(actor=self.customer_user, action='LOGIN_FAILED', status_code=401)
        result = self.dashboard()
        self.assertEqual(result['customers'][0]['last_activity_at'], login.created_at)
        self.assertIsNone(result['contractors'][0]['last_activity_at'])

    def test_customer_without_portal_never_inherits_contractor_activity(self):
        self.customer.portal_user = None
        self.customer.contractor = self.contractor
        self.customer.save()
        AnalyticsSession.objects.create(user=self.contractor, device='desktop')
        self.assertIsNone(self.dashboard()['customers'][0]['last_activity_at'])

    def test_normal_roles_and_support_cannot_read_directory_activity(self):
        for role in ['CUSTOMER', 'CONTRACTOR', 'PAINTER', 'SUPPORT']:
            self.customer_user.role = role
            self.client.force_authenticate(self.customer_user)
            self.assertEqual(self.client.get('/api/quotations/admin-dashboard/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/quotations/admin-dashboard/').status_code, 401)

    def test_employee_activity_is_shown_in_applicator_directory(self):
        from jobs.models import ContractorApplicatorTeam
        ContractorApplicatorTeam.objects.create(contractor=self.contractor, painter=self.painter, employment_type='IN_HOUSE')
        now = timezone.now()
        AnalyticsSession.objects.create(user=self.painter, device='mobile', last_seen=now)
        row = next(row for row in self.dashboard()['applicators'] if row['id'] == self.painter.pk)
        self.assertEqual(row['last_activity_at'], now)

    def test_summary_uses_two_bulk_queries_and_latest_login_can_win(self):
        now = timezone.now()
        self.contractor.last_login = now
        AnalyticsSession.objects.create(user=self.contractor, device='desktop', last_seen=now-timedelta(days=1))
        with self.assertNumQueries(2):
            result = last_activity_by_user([self.contractor, self.painter, self.customer_user, None])
        self.assertEqual(result[self.contractor.pk], now)
        self.assertIsNone(result[self.painter.pk])

    def test_authenticated_event_ingestion_updates_displayed_activity(self):
        import uuid
        self.client.force_authenticate(self.customer_user)
        response = self.client.post('/api/application-analytics/events/', {
            'session_id': str(uuid.uuid4()), 'device': 'mobile',
            'events': [{'id': str(uuid.uuid4()), 'kind': 'screen_viewed', 'module': 'customer-dashboard', 'screen': '/customer-dashboard'}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        session = AnalyticsSession.objects.get(user=self.customer_user)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.dashboard()['customers'][0]['last_activity_at'], session.last_seen)
