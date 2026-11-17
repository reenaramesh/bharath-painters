import csv
import io
import uuid
from datetime import timedelta
from django.core.management import call_command
from django.utils import timezone
from django.test import TestCase
from .tests import AnalyticsTests


class BehaviorTests(TestCase):
    setUp = AnalyticsTests.setUp
    event = AnalyticsTests.event
    send = AnalyticsTests.send
    report = AnalyticsTests.report
    def behavior(self, **params):
        self.client.force_authenticate(self.admin)
        return self.client.get('/api/application-analytics/behavior/', params)

    def feature(self, kind='feature_action', **extra):
        return self.event(kind, module='quotations', screen='/quotations', action='quotation_created', **extra)

    def test_phase2_events_are_optional_strict_and_role_checked(self):
        self.assertEqual(self.send([self.feature(sequence=1, visit_id=str(uuid.uuid4()))]).status_code, 201)
        self.assertEqual(self.send([self.feature('workflow_started', workflow_id=str(uuid.uuid4()))]).status_code, 201)
        self.assertEqual(self.send([self.feature('workflow_completed')]).status_code, 400)
        self.assertEqual(self.send([self.feature(error_code='server')]).status_code, 400)
        self.assertEqual(self.send([self.event(action='quotation_created')]).status_code, 400)
        self.assertEqual(self.send([self.feature(metadata={'mobile':'secret'})]).status_code, 400)
        self.assertEqual(self.send([self.event('navigation', previous_screen='/dashboard?secret=1')]).status_code, 400)
        self.client.force_authenticate(self.other)
        self.session = str(uuid.uuid4())
        self.assertEqual(self.send([self.feature()]).status_code, 400)

    def test_replays_and_out_of_order_do_not_extend_session(self):
        from .models import AnalyticsSession
        old = timezone.now() - timedelta(minutes=5)
        event = self.event(occurred_at=old.isoformat())
        self.assertEqual(self.send([event]).status_code, 201)
        first = AnalyticsSession.objects.get(pk=self.session)
        self.assertAlmostEqual((first.last_seen-old).total_seconds(), 0, places=3)
        self.send([event])
        self.assertEqual(AnalyticsSession.objects.get(pk=self.session).last_seen, first.last_seen)
        self.send([self.event(occurred_at=(old-timedelta(minutes=1)).isoformat())])
        session = AnalyticsSession.objects.get(pk=self.session)
        self.assertEqual(session.last_seen, first.last_seen)
        self.assertLess(session.started_at, old)

    def test_reports_permissions_empty_shape_and_audits(self):
        from .models import AnalyticsReportAccess
        for path in ['report/', 'users/', 'behavior/', 'export/?kind=users']:
            self.assertEqual(self.client.get('/api/application-analytics/'+path).status_code, 403)
        response = self.behavior()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['timeline'], [])
        self.assertEqual(data['users'], [])
        self.assertEqual(data['journey']['sessions_considered'], 0)
        self.assertIsNone(data['module_detail'])
        self.assertEqual(AnalyticsReportAccess.objects.count(), 1)
        self.assertEqual(self.behavior(q='private', mobile='secret').status_code, 400)
        self.assertEqual(AnalyticsReportAccess.objects.count(), 1)

    def test_timeline_sequence_pagination_scope_and_session_filter(self):
        now = (timezone.now()-timedelta(seconds=1)).isoformat()
        for base in range(0, 105, 35):
            self.assertEqual(self.send([self.event('screen_viewed', sequence=i+1, occurred_at=now) for i in range(base,min(base+35,105))]).status_code, 201)
        self.assertEqual(self.behavior().json()['timeline'], [])
        first = self.behavior(user=self.user.pk).json()
        self.assertEqual([e['sequence'] for e in first['timeline']], list(range(1,101)))
        self.assertTrue(first['timeline_has_more'])
        second = self.behavior(session=self.session, page=2).json()
        self.assertEqual([e['sequence'] for e in second['timeline']], list(range(101,106)))
        self.assertEqual(second['timeline'][0]['session_id'], self.session)
        self.assertEqual(self.behavior(user=self.other.pk,session=self.session).json()['timeline'], [])
        self.assertEqual(self.behavior(device='mobile').json()['sessions'], [])
        self.assertEqual(self.report(session=self.session,device='mobile').json()['overview']['screen_views'], 0)

    def test_workflow_metrics_exits_and_observed_journey_boundaries(self):
        workflow, orphan = str(uuid.uuid4()), str(uuid.uuid4())
        visit = str(uuid.uuid4())
        self.assertEqual(self.send([
            self.event('screen_viewed',module='quotations',screen='/quotations',visit_id=visit,sequence=1),
            self.feature('workflow_started',workflow_id=workflow,sequence=2),
            self.feature(sequence=2),
            self.feature('workflow_completed',workflow_id=workflow,sequence=3),
            self.feature('workflow_completed',workflow_id=orphan,sequence=4),
            self.event('screen_left',module='quotations',screen='/quotations',visit_id=visit,reason='module_exit',sequence=5),
            self.event('session_ended',reason='logout',sequence=6),
        ]).status_code, 201)
        data = self.behavior(module='quotations',user=self.user.pk).json()
        detail = data['module_detail']
        self.assertEqual(detail['workflow_started'], 1)
        self.assertEqual(detail['workflow_completed'], 1)
        self.assertEqual(detail['completion_rate'], 1)
        self.assertEqual(detail['exit_rate'], 1)
        self.assertEqual(data['sessions'][0]['status'], 'ended')
        self.assertTrue(data['journey']['links'])
        self.assertEqual(len(data['journey']['exits']), 1)

    def test_pending_workflow_inferred_only_after_session_timeout(self):
        workflow = str(uuid.uuid4())
        old = (timezone.now()-timedelta(hours=1)).isoformat()
        self.assertEqual(self.send([self.feature('workflow_started',workflow_id=workflow,occurred_at=old)]).status_code, 201)
        data = self.behavior(module='quotations').json()
        self.assertEqual(data['module_detail']['workflow_abandoned'], 0)
        self.assertEqual(data['module_detail']['inferred_abandoned'], 1)
        self.assertEqual(data['sessions'][0]['status'], 'inferred_timeout')
        self.assertEqual(data['journey']['exits'], [])

    def test_csv_is_formula_safe_bounded_and_audited(self):
        from .models import AnalyticsReportAccess
        self.user.bharath_id = '=1+1'
        self.user.save()
        self.send([self.event()])
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/application-analytics/export/', {'kind':'users'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['X-Analytics-Truncated'], 'false')
        self.assertIn("'=1+1", response.content.decode())
        self.assertEqual(AnalyticsReportAccess.objects.get().report, 'export')
        self.assertEqual(self.client.get('/api/application-analytics/export/', {'kind':'timeline'}).status_code, 400)

    def test_retention_removes_access_audits(self):
        from .models import AnalyticsReportAccess
        self.behavior()
        AnalyticsReportAccess.objects.update(timestamp=timezone.now()-timedelta(days=100))
        call_command('cleanup_application_analytics')
        self.assertEqual(AnalyticsReportAccess.objects.count(), 0)

    def test_distinct_workflows_and_visits_are_session_scoped(self):
        workflow, visit = str(uuid.uuid4()), str(uuid.uuid4())
        self.send([self.feature('workflow_started',workflow_id=workflow),
                   self.feature('workflow_started',workflow_id=workflow),
                   self.event('screen_viewed',module='quotations',screen='/quotations',visit_id=visit),
                   self.event('screen_viewed',module='quotations',screen='/quotations',visit_id=visit),
                   self.event('screen_left',module='quotations',screen='/quotations',visit_id=visit,reason='module_exit'),
                   self.event('screen_left',module='quotations',screen='/quotations',visit_id=visit,reason='module_exit')])
        self.session = str(uuid.uuid4())
        self.send([self.feature('workflow_completed',workflow_id=workflow),
                   self.event('screen_left',module='quotations',screen='/quotations',visit_id=visit,reason='page_exit')])
        detail = self.behavior(module='quotations').json()['module_detail']
        self.assertEqual(detail['workflow_started'], 1)
        self.assertEqual(detail['workflow_completed'], 0)
        self.assertEqual(detail['workflow_abandoned'], 0)
        self.assertEqual(detail['inferred_abandoned'], 0)
        self.assertEqual(detail['completion_rate'], 0)
        self.assertEqual(detail['exit_rate'], 1)

    def test_active_empty_module_has_null_rates(self):
        data = self.behavior(module='quotations').json()['module_detail']
        self.assertEqual(data['visitors'], 0)
        self.assertEqual(data['workflow_started'], 0)
        self.assertIsNone(data['exit_rate'])
        self.assertIsNone(data['completion_rate'])

    def test_all_report_permissions_reject_every_nonadmin_role_and_anonymous(self):
        for role in ['CUSTOMER','CONTRACTOR','PAINTER','EMPLOYEE']:
            self.user.role = role
            self.user.is_staff = True
            self.user.save()
            self.client.force_authenticate(self.user)
            for path in ['report/', 'users/?q=BP', 'behavior/', 'export/?kind=modules']:
                self.assertEqual(self.client.get('/api/application-analytics/'+path).status_code,403)
        self.client.force_authenticate(None)
        for path in ['report/','users/','behavior/','export/?kind=users']:
            self.assertEqual(self.client.get('/api/application-analytics/'+path).status_code,401)

    def test_strict_filter_values_and_no_sensitive_output(self):
        self.send([self.event()])
        for params in [{'session':'broken'},{'device':'watch'},{'user':'-1'},{'page':'0'},
                       {'users_page':'1.5'},{'start':'2020-01-01'},{'q':'x'*65}]:
            self.assertEqual(self.behavior(**params).status_code,400)
        response = self.behavior(user=self.user.pk)
        text = response.content.decode()
        self.assertNotIn(self.user.mobile,text)
        self.assertNotIn('password',text)
        self.assertEqual(self.client.get('/api/application-analytics/behavior/?module=dashboard&module=quotations').status_code,400)

    def test_closed_pending_workflow_inferred_but_explicit_abandonment_observed(self):
        first, second = str(uuid.uuid4()), str(uuid.uuid4())
        self.send([self.feature('workflow_started',workflow_id=first),
                   self.feature('workflow_started',workflow_id=second),
                   self.feature('workflow_abandoned',workflow_id=second,reason='logout'),
                   self.event('session_ended',reason='logout')])
        detail = self.behavior(module='quotations').json()['module_detail']
        self.assertEqual(detail['workflow_started'],2)
        self.assertEqual(detail['workflow_abandoned'],1)
        self.assertEqual(detail['inferred_abandoned'],1)

    def test_journey_never_connects_different_sessions(self):
        self.send([self.event('screen_viewed')])
        self.session = str(uuid.uuid4())
        self.send([self.event('screen_viewed',module='quotations',screen='/quotations')])
        journey = self.behavior().json()['journey']
        self.assertEqual(journey['sessions_considered'],2)
        self.assertEqual(journey['links'],[])

    def test_admin_access_is_audited_with_only_parsed_filters(self):
        from .models import AnalyticsReportAccess
        self.report()
        self.client.get('/api/application-analytics/users/',{'q':' BP-TEST '})
        self.client.get('/api/application-analytics/export/',{'kind':'modules'})
        audits = list(AnalyticsReportAccess.objects.order_by('id'))
        self.assertEqual([row.report for row in audits],['report','users','export'])
        self.assertEqual(audits[1].filters['q'],'BP-TEST')
        self.assertNotIn('mobile',audits[1].filters)

    def test_employee_effective_role_comes_from_active_inhouse_membership(self):
        from jobs.models import ContractorApplicatorTeam
        from .models import AnalyticsEvent
        self.other.role='PAINTER'
        self.other.save()
        ContractorApplicatorTeam.objects.create(contractor=self.user,painter=self.other,employment_type='IN_HOUSE')
        self.client.force_authenticate(self.other)
        event=self.event('feature_action',module='employees',screen='/in-house-applicators',action='check_in_submitted')
        self.assertEqual(self.send([event]).status_code,201)
        self.assertEqual(AnalyticsEvent.objects.get(pk=event['id']).role,'EMPLOYEE')
        self.assertEqual(self.send([self.feature()]).status_code,400)

    def test_screen_usage_is_exact_over_selected_events(self):
        self.send([self.event('screen_viewed'),self.event('engagement',duration_ms=1000)])
        data=self.behavior(user=self.user.pk).json()
        self.assertEqual(data['screen_usage'],[{'screen':'/dashboard','views':1,'users':1,'engaged_ms':1000}])

    def test_workflow_outcomes_cross_date_and_role_boundaries_with_matching_action(self):
        from .models import AnalyticsEvent, AnalyticsSession
        from datetime import datetime, time
        yesterday=timezone.localdate()-timedelta(days=1)
        start=timezone.make_aware(datetime.combine(yesterday,time(23,59)))
        completed=start+timedelta(minutes=2)
        session=AnalyticsSession.objects.create(user=self.user,device='desktop',started_at=start,
            last_seen=completed,ended_at=completed,end_reason='logout')
        workflow=uuid.uuid4()
        AnalyticsEvent.objects.create(id=uuid.uuid4(),session=session,role='CONTRACTOR',module='quotations',
            screen='/quotations',kind='workflow_started',action='quotation_created',workflow_id=workflow,occurred_at=start)
        AnalyticsEvent.objects.create(id=uuid.uuid4(),session=session,role='EMPLOYEE',module='quotations',
            screen='/quotations',kind='workflow_completed',action='quotation_created',workflow_id=workflow,occurred_at=completed)
        data=self.behavior(module='quotations',role='CONTRACTOR',start=str(yesterday),end=str(yesterday)).json()['module_detail']
        self.assertEqual(data['workflow_started'],1)
        self.assertEqual(data['workflow_completed'],1)
        self.assertEqual(data['inferred_abandoned'],0)
        AnalyticsEvent.objects.filter(kind='workflow_completed').update(action='quotation_submitted')
        data=self.behavior(module='quotations',start=str(yesterday),end=str(yesterday)).json()['module_detail']
        self.assertEqual(data['workflow_completed'],0)
        self.assertEqual(data['inferred_abandoned'],1)
        AnalyticsEvent.objects.filter(kind='workflow_completed').update(kind='workflow_abandoned',action='quotation_created')
        data=self.behavior(module='quotations',start=str(yesterday),end=str(yesterday)).json()['module_detail']
        self.assertEqual(data['workflow_abandoned'],1)
        self.assertEqual(data['inferred_abandoned'],0)

    def test_report_json_responses_are_private_and_not_cached(self):
        self.client.force_authenticate(self.admin)
        for path in ['report/','users/?q=BP','behavior/']:
            response=self.client.get('/api/application-analytics/'+path)
            self.assertEqual(response['Cache-Control'],'private, no-store')

    def test_screens_with_equal_views_rank_by_engagement(self):
        self.send([self.event('screen_viewed',module='properties',screen='/properties'),
                   self.event('screen_viewed',module='properties',screen='/properties/:id'),
                   self.event('engagement',module='properties',screen='/properties/:id',duration_ms=1000)])
        data=self.behavior(module='properties').json()
        self.assertEqual([row['screen'] for row in data['screen_usage']],['/properties/:id','/properties'])
        self.assertEqual(data['module_detail']['screens'],data['screen_usage'])
