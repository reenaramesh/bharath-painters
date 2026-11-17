import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class AnalyticsTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        User = get_user_model()
        self.user = User.objects.create_user(mobile="9000000101", password="test-password", role="CONTRACTOR", bharath_id="BP-TEST-101")
        self.other = User.objects.create_user(mobile="9000000102", password="test-password", role="CUSTOMER")
        self.admin = User.objects.create_user(mobile="9000000103", password="test-password", role="ADMIN")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.session = str(uuid.uuid4())

    def event(self, kind="module_opened", **extra):
        return {"id": str(uuid.uuid4()), "kind": kind, "module": "dashboard", "screen": "/dashboard", **extra}

    def send(self, events, **extra):
        return self.client.post("/api/application-analytics/events/", {"session_id": self.session, "device": "desktop", "events": events, **extra}, format="json")

    def report(self, **params):
        self.client.force_authenticate(self.admin)
        return self.client.get("/api/application-analytics/report/", params)

    def test_real_events_are_deduplicated_and_reported(self):
        events = [self.event(), self.event("screen_viewed"), self.event("engagement", duration_ms=1000), self.event("scroll", milestone=25)]
        self.assertEqual(self.send(events).status_code, 201)
        self.assertEqual(self.send(events).status_code, 201)
        data = self.report().json()
        self.assertEqual(data["overview"]["active_users"], 1)
        self.assertEqual(data["overview"]["sessions"], 1)
        self.assertEqual(data["overview"]["module_views"], 1)
        self.assertEqual(data["overview"]["engaged_ms"], 1000)
        self.assertEqual(data["modules"][0]["module"], "dashboard")

    def test_reports_are_admin_only_even_for_staff(self):
        self.assertEqual(self.client.get("/api/application-analytics/report/").status_code, 403)
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.client.get("/api/application-analytics/users/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/application-analytics/report/").status_code, 401)

    def test_rejects_identity_and_sensitive_payloads(self):
        self.assertEqual(self.send([self.event()], user_id=self.other.pk).status_code, 400)
        self.assertEqual(self.send([self.event(password="secret")]).status_code, 400)
        self.assertEqual(self.send([self.event(screen="/customers/123?otp=secret")]).status_code, 400)
        self.assertEqual(self.send([self.event("scroll", milestone=26)]).status_code, 400)
        self.assertEqual(self.send([self.event("engagement", duration_ms=999999)]).status_code, 400)

    def test_cannot_reuse_another_accounts_session(self):
        self.assertEqual(self.send([self.event()]).status_code, 201)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.send([self.event()]).status_code, 400)

    def test_limits_and_date_filters(self):
        self.assertEqual(self.send([self.event() for _ in range(51)]).status_code, 400)
        self.send([self.event()])
        self.assertEqual(self.report(role="CUSTOMER").json()["overview"]["active_users"], 0)
        self.assertEqual(self.report(start="invalid").status_code, 400)
        self.assertEqual(self.report(module="unknown").status_code, 400)

    def test_multiple_memberships_do_not_multiply_employee_usage(self):
        from jobs.models import ContractorApplicatorTeam
        self.other.role = 'PAINTER'
        self.other.save()
        ContractorApplicatorTeam.objects.create(contractor=self.user, painter=self.other, employment_type='IN_HOUSE')
        ContractorApplicatorTeam.objects.create(contractor=self.admin, painter=self.other, employment_type='IN_HOUSE')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.send([self.event()]).status_code, 201)
        result = self.report(role='EMPLOYEE').json()
        self.assertEqual(result['overview']['active_users'], 1)
        self.assertEqual(result['overview']['module_views'], 1)
        self.assertEqual(result['roles'][0]['role'], 'EMPLOYEE')

    def test_user_lookup_and_report_are_scoped(self):
        self.send([self.event()])
        self.client.force_authenticate(self.other)
        self.session = str(uuid.uuid4())
        self.send([self.event()])
        result = self.report(user=str(self.user.pk)).json()
        self.assertEqual(result['overview']['active_users'], 1)
        self.assertEqual(len(result['timeline']), 1)
        self.assertEqual(result['profile']['bharath_id'], self.user.bharath_id)
        found = self.client.get('/api/application-analytics/users/', {'q': 'BP-TEST'}).json()
        self.assertEqual([row['id'] for row in found], [self.user.pk])
        self.assertNotIn('mobile', found[0])

    def test_batch_validation_is_atomic(self):
        from .models import AnalyticsEvent, DailyModuleUsage
        self.assertEqual(self.send([self.event(), self.event('scroll', milestone=13)]).status_code, 400)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)
        self.assertEqual(DailyModuleUsage.objects.count(), 0)

    def test_payload_limit_and_throttle(self):
        response = self.client.post('/api/application-analytics/events/', data=' ' * 65537, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        for _ in range(11):
            self.send([self.event()])
        self.assertEqual(self.send([self.event()]).status_code, 429)

    def test_event_collision_cannot_move_or_reassign_event(self):
        from .models import AnalyticsEvent
        event = self.event()
        self.send([event])
        self.client.force_authenticate(self.other)
        self.session = str(uuid.uuid4())
        self.assertEqual(self.send([self.event(), event]).status_code, 400)
        self.assertEqual(AnalyticsEvent.objects.count(), 1)

    def test_date_boundary_and_ranking_use_actual_totals(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import AnalyticsEvent, DailyModuleUsage
        self.send([self.event(), self.event('module_opened', module='customers', screen='/customers')])
        yesterday = timezone.localdate() - timedelta(days=1)
        old_event = AnalyticsEvent.objects.get(module='dashboard')
        old_event.occurred_at = timezone.now() - timedelta(days=1)
        old_event.save()
        DailyModuleUsage.objects.filter(module='dashboard').update(date=yesterday)
        result = self.report(start=str(timezone.localdate()), end=str(timezone.localdate())).json()
        self.assertEqual(result['overview']['module_views'], 1)
        self.assertEqual(result['modules'][0]['module'], 'customers')

    def test_delayed_first_batch_preserves_legitimate_foreground_time(self):
        from datetime import timedelta
        from django.utils import timezone
        old = (timezone.now() - timedelta(minutes=1)).isoformat()
        self.assertEqual(self.send([self.event('session_started', occurred_at=old), self.event('engagement', duration_ms=15000), self.event('engagement', duration_ms=15000)]).status_code, 201)

    def test_retention_removes_all_identifiable_usage(self):
        from datetime import timedelta
        from django.core.management import call_command
        from django.utils import timezone
        from .models import AnalyticsEvent, AnalyticsSession, DailyModuleUsage
        self.send([self.event()])
        old = timezone.now() - timedelta(days=100)
        AnalyticsEvent.objects.update(occurred_at=old)
        AnalyticsSession.objects.update(last_seen=old)
        DailyModuleUsage.objects.update(date=timezone.localdate(old))
        call_command('cleanup_application_analytics')
        self.assertEqual(AnalyticsEvent.objects.count(), 0)
        self.assertEqual(AnalyticsSession.objects.count(), 0)
        self.assertEqual(DailyModuleUsage.objects.count(), 0)
