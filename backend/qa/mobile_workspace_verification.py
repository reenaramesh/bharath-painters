"""Mobile workspace checks against isolated Django records; no production writes."""
import json
import os
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from qa.quotation_unified_verification import db_read
from accounts.models import BharathUser
from quotations.models import Customer, ContractorCustomerConnection, SavedCustomerContact, CustomerFollowUp, Quotation, WorkChange, Lead, LeadStageHistory
from quotations.property_access import ensure_legacy_primary_contact
from jobs.models import WorkSchedule
from outsourcing.models import SubcontractWorkOrder, WorkOrderEvent
from django.utils import timezone
from django.conf import settings
from django.test.runner import DiscoverRunner
from django.db import connection
from playwright.sync_api import sync_playwright, expect
import django

CUSTOMERS_ONLY = os.environ.get('BHARATH_QA_CUSTOMERS_ONLY') == '1'
OUT = Path(__file__).resolve().parents[2] / ('docs/previews/mobile-workspace-customer-letters' if CUSTOMERS_ONLY else 'docs/previews/mobile-workspace')


class MobileWorkspace(ShortcutBrowser):
    test_role_shortcuts = None

    def setUp(self):
        print("Preparing isolated mobile fixtures", flush=True)
        super().setUp()
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL")
        ensure_legacy_primary_contact(self.property)
        now = timezone.now()
        today = timezone.localdate()
        for index, status in enumerate(['PENDING', 'REJECTED', 'RECONNECT_PENDING', 'BLOCKED']):
            customer = Customer.objects.create(name=f'{status} customer', mobile=f'900000039{index}', contractor=self.contractor)
            ContractorCustomerConnection.objects.create(customer=customer, contractor=self.contractor, status=status, requested_by=self.contractor)
            SavedCustomerContact.objects.create(customer=customer, contractor=self.contractor, details={'name': f'{status} saved customer', 'mobile': customer.mobile, 'status': 'NEW'})
        self.lead=Lead.objects.create(contractor=self.contractor,customer=self.customer,property=self.property,title="Mobile timeline audit")
        for days,note in [(3,"Old CRM event"),(0,"Latest CRM event")]:
            event=LeadStageHistory.objects.create(lead=self.lead,to_stage="CONTACTED",note=note,changed_by=self.contractor)
            LeadStageHistory.objects.filter(pk=event.pk).update(created_at=now-timedelta(days=days))
        self.task_ids = []
        for index, label in enumerate(['Latest task', 'Older task', 'Oldest task']):
            task = CustomerFollowUp.objects.create(customer=self.customer, created_by=self.contractor, follow_up_type='CALL', comment=label, next_follow_up=now+timedelta(days=index-1))
            CustomerFollowUp.objects.filter(pk=task.pk).update(created_at=now-timedelta(days=index),follow_up_date=now-timedelta(days=index))
            self.task_ids.append(task.pk)
        self.quotes = []
        for index in range(3):
            quote = Quotation.objects.create(contractor=self.contractor, customer=self.customer, property=self.property, connection=self.connection, quotation_number=f'QA/MOBILE/{index}', status='ACCEPTED')
            self.quotes.append(quote)
            schedule = WorkSchedule.objects.create(quotation=quote, proposed_start_date=today+timedelta(days=index+1), proposed_end_date=today+timedelta(days=index+3), proposed_by=self.contractor, status='CONFIRMED')
            WorkSchedule.objects.filter(pk=schedule.pk).update(updated_at=now-timedelta(days=index))
            change = WorkChange.objects.create(quotation=quote, contractor=self.contractor, customer=self.customer, change_number=f'WC/MOBILE/{index}', status=['DRAFT','SENT_TO_CUSTOMER','APPROVED'][index])
            WorkChange.objects.filter(pk=change.pk).update(created_at=now-timedelta(days=index))
        vendor = BharathUser.objects.create_user(mobile='9000000399', password='test-pass', role='CONTRACTOR', first_name='Vendor')
        for index, status in enumerate(['SENT','IN_PROGRESS','DRAFT','COMPLETED']):
            order = SubcontractWorkOrder.objects.create(reference=f'WO/MOBILE/{index}', quotation=self.quotes[0], main_contractor=self.contractor, receiving_contractor=vendor, project_title=f'{status} painting work', status=status, agreed_amount=123456+index, required_start_date=today+timedelta(days=index+1) if index<2 else None)
            SubcontractWorkOrder.objects.filter(pk=order.pk).update(created_at=now-timedelta(days=index))
            for days, note in [(3, 'Old event'), (0, 'Latest event')]:
                WorkOrderEvent.objects.create(work_order=order, actor=self.contractor, to_status=status, note=note, created_at=now-timedelta(days=days))

    def test_mobile_workspaces(self):
        OUT.mkdir(parents=True, exist_ok=True)
        results = {'screenshots': [], 'errors': [], 'api_failures': [], 'checks': []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                for actor in ([self.contractor] if CUSTOMERS_ONLY else [self.contractor, self.portal, self.painter]):
                    print("Verifying role", actor.role, flush=True)
                    context = browser.new_context(viewport={'width':360,'height':1000}, reduced_motion='reduce')
                    def route_api(route):
                        url = urlsplit(route.request.url)
                        response = context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer,timeout=15000)
                        if response.status >= 400 and not (response.status == 404 and url.path.endswith('/my-in-house-employment/')):
                            results['api_failures'].append({'url':url.path,'status':response.status})
                        route.fulfill(response=response)
                    context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
                    page = context.new_page()
                    page.set_default_navigation_timeout(60000)
                    page.on('pageerror', lambda error: results['errors'].append(str(error)))
                    page.on('dialog', lambda dialog: dialog.accept())
                    def capture(name):
                        print(actor.role, name, flush=True)
                        for width in [360,390,430,768,1440]:
                            page.set_viewport_size({'width':width,'height':1000})
                            self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width,f'{name} overflow at {width}')
                            filename=f'{actor.role.lower()}-{name}-{width}.png'
                            page.screenshot(path=str(OUT/filename),animations='disabled',full_page=True)
                            results['screenshots'].append(filename)
                        page.set_viewport_size({'width':360,'height':1000})
                    try:
                        page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
                        page.locator('input[type=text]').first.fill(actor.mobile);page.locator('input[type=password]').fill('test-pass')
                        page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/'+('customer-dashboard' if actor.role=='CUSTOMER' else 'dashboard'))
                        page.wait_for_load_state('networkidle')
                        shortcuts=page.locator('.bp-dashboard-shortcut-items')
                        expect(shortcuts).to_be_visible()
                        self.assertIn('Share',shortcuts.locator(':scope > *').last.inner_text())
                        refresh=page.get_by_role('button',name=re.compile('Refresh'))
                        if actor.role!='PAINTER':
                            expect(refresh.first).to_be_visible()
                            position=refresh.first.bounding_box()
                            self.assertGreater(position['x'],250)
                            self.assertLessEqual(position['x']+position['width'],360)
                        capture('dashboard')
                        if actor.role=='CONTRACTOR':
                            page.goto('http://localhost:5173/customers');page.wait_for_load_state('networkidle')
                            tabs=page.get_by_role('navigation',name='Customer connection status')
                            for title, name in [('Pending','PENDING'),('Request Declined','REJECTED'),('Reconnect Request Sent','RECONNECT_PENDING'),('Blocked','BLOCKED')]:
                                tabs.get_by_role('button',name=re.compile('^'+title+' ')).click()
                                expect(page.get_by_role('heading',name=name+' saved customer',exact=True)).to_be_visible()
                            tabs.get_by_role('button',name=re.compile('^All customers')).click()
                            colour=page.locator('.crm-customer-letter-link').first.evaluate('el=>getComputedStyle(el).color')
                            self.assertEqual(colour,'rgb(100, 116, 139)')
                            capture('customers')
                            if CUSTOMERS_ONLY: continue
                            page.goto('http://localhost:5173/tasks');page.wait_for_load_state('networkidle')
                            expect(page.locator('.mobile-task-card').first).to_contain_text('Latest task')
                            page.get_by_role('region',name='Task status filters').get_by_role('button',name=re.compile('^Due today')).click()
                            self.assertEqual(page.locator('.mobile-task-card').count(),1)
                            page.get_by_role('region',name='Task status filters').get_by_role('button',name=re.compile('^All tasks')).click()
                            capture('tasks')
                            page.locator('.mobile-task-card').first.get_by_role('button',name='Reschedule',exact=True).click()
                            expect(page.get_by_role('heading',name='Reschedule follow-up')).to_be_visible()
                            page.get_by_role('button',name='Cancel',exact=True).click()
                            with page.expect_response(lambda response:response.request.method=='PATCH' and '/tasks/' in response.url) as saved:
                                page.locator('.mobile-task-card').first.get_by_role('button',name='Complete',exact=True).click()
                            self.assertEqual(saved.value.status,200)
                            self.assertTrue(db_read(lambda:CustomerFollowUp.objects.get(pk=self.task_ids[0]).is_completed))
                            page.goto(f'http://localhost:5173/customers/{self.customer.pk}');page.wait_for_load_state('networkidle')
                            followups=page.get_by_role('heading',name='Follow-up timeline',exact=True).locator('..').locator('..')
                            expect(followups.locator('.divide-y > div').first).to_contain_text('Older task')
                            capture('customer-timeline')
                            page.goto(f'http://localhost:5173/opportunities/{self.lead.pk}');page.wait_for_load_state('networkidle')
                            stage=page.get_by_role('heading',name='Stage history',exact=True).locator('..')
                            expect(stage.locator('ol li').first).to_contain_text('Latest CRM event')
                            capture('crm-timeline')
                            for route, name in [('/work-schedules','schedules'),('/work-reschedules','reschedules'),('/work-changes','changes'),('/site-visits','site-visits'),('/job-activity','activity')]:
                                page.goto('http://localhost:5173'+route);page.wait_for_load_state('networkidle');capture(name)
                            page.goto('http://localhost:5173/subcontract-work-orders');page.wait_for_load_state('networkidle')
                            table=page.get_by_role('table',name='Subcontract work orders')
                            expect(table.locator('tbody tr').first).to_contain_text('SENT painting work')
                            page.get_by_role('region',name='Work order status filters').get_by_role('button',name=re.compile('^Completed')).click()
                            expect(table.locator('tbody tr')).to_have_count(1)
                            expect(table.locator('tbody tr').first).to_contain_text('COMPLETED painting work')
                            page.get_by_role('region',name='Work order status filters').get_by_role('button',name=re.compile('^All ')).click()
                            table.get_by_role('button',name=re.compile('^Agreed value,')).click()
                            expect(table.locator('tbody tr').first).to_contain_text('SENT painting work')
                            capture('work-orders')
                            table.get_by_role('link').first.click();page.wait_for_url(re.compile(r'/subcontract-work-orders/\d+$'));page.wait_for_load_state('networkidle')
                            history=page.locator('section').filter(has=page.get_by_role('heading',name='History',exact=True))
                            expect(history.locator('ol li').first).to_contain_text('Latest event')
                            results['checks'].append('Contractor: customer connection tabs, task filtering/reschedule/complete, newest-first task list, Work Order filtering/sorting/history')
                        elif actor.role=='CUSTOMER':
                            for route,name in [('/work-schedules','schedules'),('/work-changes','changes')]:
                                page.goto('http://localhost:5173'+route);page.wait_for_load_state('networkidle');capture(name)
                        else:
                            page.goto('http://localhost:5173/job-activity');page.wait_for_load_state('networkidle');capture('activity')
                    except Exception as error:
                        results['blocker']=str(error);results['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
                    finally:
                        context.unroute_all(behavior='ignoreErrors');context.close()
                self.assertEqual(results['errors'],[])
                self.assertEqual(results['api_failures'],[])
            finally:
                (OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');browser.close()

if __name__=='__main__':
    import faulthandler
    faulthandler.dump_traceback_later(60,repeat=True)
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    import tempfile
    with tempfile.TemporaryDirectory(prefix='bharath-mobile-qa-') as temporary:
        settings.DATABASES['default'].setdefault('TEST',{})['NAME']=str(Path(temporary)/'audit.sqlite3')
        raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.MobileWorkspace']))
