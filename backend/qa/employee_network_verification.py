"""Native browser regression using isolated SQLite and temporary profile media."""
import json
import re
import tempfile
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from qa.quotation_unified_verification import db_read
from accounts.models import BharathUser, ContractorProfile, PainterProfile
from jobs.models import ContractorApplicatorTeam, ApplicatorAttendance, ApplicatorLedgerEntry
from quotations.models import ContractorConnection
from django.conf import settings
from django.db import connection
from django.test import override_settings
from django.test.runner import DiscoverRunner
from django.utils import timezone
from playwright.sync_api import sync_playwright, expect
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/employee-network'

class EmployeeNetwork(ShortcutBrowser):
    test_role_shortcuts=None
    def setUp(self):
        self.media=tempfile.TemporaryDirectory(prefix='employee-profile-qa-')
        self.addCleanup(self.media.cleanup)
        config=override_settings(MEDIA_ROOT=self.media.name,FRONTEND_URL='http://localhost:5173',SECURE_SSL_REDIRECT=False,STORAGES={'default':{'BACKEND':'django.core.files.storage.FileSystemStorage'},'staticfiles':{'BACKEND':'django.contrib.staticfiles.storage.StaticFilesStorage'}})
        config.enable();self.addCleanup(config.disable)
        super().setUp()
        with connection.cursor() as cursor: cursor.execute('PRAGMA journal_mode=WAL')
        self.contractor.bharath_id='BP-C-905401';self.contractor.save(update_fields=['bharath_id'])
        self.vendor=BharathUser.objects.create_user(mobile='9000000542',password='test-pass',role='CONTRACTOR',first_name='Network Vendor',is_verified=True,verification_status='VERIFIED',bharath_id='BP-C-905402')
        ContractorProfile.objects.create(user=self.vendor,company_name='Network Painting Company',owner_name='Network Vendor',service_areas='Bengaluru',work_skills='Painting, texture')
        ContractorConnection.objects.create(requester=self.contractor,recipient=self.vendor,status='CONNECTED')
        incoming=BharathUser.objects.create_user(mobile='9000000544',password='test-pass',role='CONTRACTOR',first_name='Incoming Vendor',is_verified=True,verification_status='VERIFIED',bharath_id='BP-C-905404')
        ContractorProfile.objects.create(user=incoming,company_name='Incoming Company')
        ContractorConnection.objects.create(requester=incoming,recipient=self.contractor,status='PENDING')
        available=BharathUser.objects.create_user(mobile='9000000545',password='test-pass',role='CONTRACTOR',first_name='Available Vendor',is_verified=True,verification_status='VERIFIED',bharath_id='BP-C-905405')
        ContractorProfile.objects.create(user=available,company_name='Available Company',work_skills='Painting')
        # Existing fixture painter becomes an in-house employee for its own role checks.
        PainterProfile.objects.get_or_create(user=self.painter,defaults={'skills':'Painting'})
        self.member=ContractorApplicatorTeam.objects.create(contractor=self.contractor,painter=self.painter,employment_type='IN_HOUSE',employee_code='BPE-2026-0001',salary_basis='DAILY',salary_amount=500,joined_on=timezone.localdate()-timedelta(days=30))
        self.today=timezone.localdate();self.days=[str(self.today-timedelta(days=i)) for i in [2,1,0]]
        ApplicatorAttendance.objects.create(membership=self.member,date=self.days[0],status='ABSENT',note='Unselected saved day')

    def test_owner_profile(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'screenshots':[],'errors':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':360,'height':1000},permissions=['clipboard-read','clipboard-write'])
            def route_api(route):
                parsed=urlsplit(route.request.url)
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer,max_redirects=0)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.on('pageerror',lambda error:result['errors'].append(str(error)))
            try:
                page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/profile');page.wait_for_load_state('networkidle');expect(page.locator('.contractor-profile')).to_be_visible();expect(page.locator('.contractor-profile')).to_contain_text('QA Painting Company')
                expect(page.get_by_role('button',name='Share contractor profile',exact=True)).to_be_visible()
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000});page.evaluate('window.scrollTo(0,0)');self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    name=f'owner-contractor-profile-{width}.png';page.screenshot(path=str(OUT/name),full_page=True);result['screenshots'].append(name)
                page.get_by_role('button',name='Share contractor profile',exact=True).click();expect(page.get_by_text('Profile link copied.',exact=True)).to_be_visible();self.assertEqual(page.evaluate('navigator.clipboard.readText()'),'http://localhost:5173/contractor-profile/BP-C-905401')
                self.assertEqual(result['errors'],[])
            finally:
                (OUT/'owner-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');context.unroute_all(behavior='ignoreErrors');context.close();browser.close()

    def test_employee_and_profiles(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'database':'isolated temporary test SQLite','screenshots':[],'checks':[],'errors':[],'api_failures':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            contexts=[]
            try:
                def session(actor=None):
                    context=browser.new_context(viewport={'width':360,'height':1000},reduced_motion='reduce',permissions=['clipboard-read','clipboard-write'])
                    contexts.append(context)
                    def route_api(route):
                        parsed=urlsplit(route.request.url)
                        response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer,timeout=15000,max_redirects=0)
                        if response.status>=400 and not (response.status==404 and parsed.path.endswith('/my-in-house-employment/')):result['api_failures'].append({'path':parsed.path,'status':response.status,'body':response.text()[:300]})
                        route.fulfill(response=response)
                    context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
                    page=context.new_page();page.on('pageerror',lambda error:result['errors'].append(str(error)));page.on('dialog',lambda dialog:dialog.accept())
                    if actor:
                        page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
                        page.locator('input[type=text]').first.fill(actor.mobile);page.locator('input[type=password]').fill('test-pass')
                        page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/'+('customer-dashboard' if actor.role=='CUSTOMER' else 'dashboard'));page.wait_for_load_state('networkidle')
                        page.get_by_role('button',name='Open quick actions',exact=True).click()
                        floating=page.get_by_role('navigation',name='Floating quick actions')
                        expect(floating).to_be_visible();self.assertEqual(floating.get_by_role('link').count(),3 if actor.role=='CONTRACTOR' else 1)
                        page.keyboard.press('Escape');expect(floating).not_to_be_visible();expect(page.get_by_role('button',name='Open quick actions',exact=True)).to_be_focused()
                        result['checks'].append(f'{actor.role}: floating quick actions respect allowed destinations, Escape restores focus')
                    return page
                def goto(page,path):page.goto('http://localhost:5173'+path);page.wait_for_load_state('networkidle')
                def capture(page,name):
                    print('Capture',name,flush=True)
                    for width in [360,390,430,768,1440]:
                        page.set_viewport_size({'width':width,'height':1000})
                        page.evaluate('window.scrollTo(0,0)')
                        self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width,f'{name} overflow at {width}')
                        file=f'{name}-{width}.png';page.screenshot(path=str(OUT/file),full_page=True,animations='disabled');result['screenshots'].append(file)
                    page.set_viewport_size({'width':360,'height':1000})
                page=session(self.contractor)
                page.get_by_role('button',name='Open quick actions',exact=True).click();capture(page,'contractor-floating-actions');page.keyboard.press('Escape')
                shortcuts=page.get_by_role('region',name='Quick actions',exact=True)
                expect(shortcuts.get_by_role('link',name='Work Orders',exact=True)).to_be_visible();shortcuts.get_by_role('link',name='Subcontractors',exact=True).scroll_into_view_if_needed();expect(shortcuts.get_by_role('link',name='Subcontractors',exact=True)).to_be_visible()
                goto(page,'/subcontract-work-orders');expect(page.get_by_role('heading',name='Work Orders',exact=True)).to_be_visible();capture(page,'work-order-list')
                page.get_by_role('button',name='Create Work Order',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();capture(page,'work-order-popup')
                self.assertLessEqual(page.get_by_role('dialog').evaluate('(el)=>el.scrollWidth'),page.get_by_role('dialog').evaluate('(el)=>el.clientWidth'))
                page.get_by_role('button',name='Close work offer',exact=True).click()
                goto(page,'/in-house-applicators')
                expect(page.get_by_role('table',name='Employees')).to_be_visible();capture(page,'employee-list')
                page.get_by_role('navigation',name='Employee quick actions').get_by_role('link',name='Create employee',exact=True).click();page.wait_for_load_state('networkidle')
                capture(page,'employee-create')
                for label,value in [('Name','New QA Employee'),('Phone number','9000000543'),('Login password','test-pass'),('Salary / wage','600'),('Skills','Painting and texture')]:page.get_by_label(label,exact=True).fill(value)
                page.get_by_label('Salary type').select_option('DAILY')
                page.get_by_role('button',name='Create employee',exact=True).click();page.wait_for_url(re.compile(r'/in-house-applicators/\d+$'));page.wait_for_load_state('networkidle')
                created_id=int(page.url.rsplit('/',1)[-1]);result['checks'].append('Employee creation through existing API')
                expect(page.get_by_role('heading',name='New QA Employee',exact=True)).to_be_visible()
                page.get_by_role('button',name='Edit profile',exact=True).click();page.get_by_label('name',exact=True).fill('Updated QA Employee');page.get_by_role('button',name='Save changes',exact=True).click();page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading',name='Updated QA Employee',exact=True)).to_be_visible();capture(page,'employee-details')
                goto(page,f'/in-house-applicators/{self.member.pk}?section=attendance')
                page.get_by_label('Record multiple days',exact=True).check()
                for day in self.days:page.get_by_label(f'Attendance {day}',exact=True).check()
                page.get_by_label(f'Attendance {self.days[0]}',exact=True).uncheck()
                form=page.locator('#employee-attendance form')
                form.get_by_role('combobox').select_option('HALF_DAY');form.get_by_label('Overtime hours',exact=True).fill('1.5');form.get_by_label('Note',exact=True).fill('Multiple selected days')
                capture(page,'attendance-selection')
                page.get_by_role('button',name='Save selected days',exact=True).click();expect(page.get_by_role('status').filter(has_text='Attendance saved for 2 days.')).to_be_visible()
                rows=db_read(lambda:list(ApplicatorAttendance.objects.filter(membership=self.member).order_by('date').values('date','status','note')))
                self.assertEqual([row['status'] for row in rows],['ABSENT','HALF_DAY','HALF_DAY']);self.assertEqual(rows[0]['note'],'Unselected saved day');result['checks'].append('Checkbox selection and unselection, two-day attendance save, untouched saved day retained')
                # A failed save must retain all entered data; real rollback is separately backend-tested.
                page.get_by_label(f'Attendance {self.days[1]}',exact=True).check();form.get_by_label('Note',exact=True).fill('Retained after failure')
                page.route('**/attendance/',lambda route:route.fulfill(status=400,content_type='application/json',body='{"detail":"QA attendance save rejected"}'),times=1)
                page.get_by_role('button',name='Save selected days',exact=True).click();expect(page.get_by_text('QA attendance save rejected',exact=True)).to_be_visible()
                expect(form.get_by_label('Note',exact=True)).to_have_value('Retained after failure');expect(page.get_by_label(f'Attendance {self.days[1]}',exact=True)).to_be_checked();result['checks'].append('Failed attendance save retains checkbox selection and note')
                goto(page,f'/in-house-applicators/{self.member.pk}?section=wages')
                page.get_by_text('Record wage transaction',exact=True).click();wages=page.locator('#employee-wages form');wages.get_by_label('Amount',exact=True).fill('100');wages.get_by_label('Note',exact=True).fill('QA wage payment');wages.get_by_role('button',name='Save wage transaction',exact=True).click()
                expect(page.get_by_role('status').filter(has_text='Wage transaction saved.')).to_be_visible();capture(page,'employee-wages')
                page.get_by_role('navigation',name='Employee quick actions').get_by_role('link',name='Extra bonus',exact=True).click();page.get_by_role('button',name='+ Add bonus',exact=True).click();page.get_by_label('Bonus amount',exact=True).fill('50');page.get_by_label('Reason / note',exact=True).fill('QA extra bonus');page.get_by_role('button',name='Save bonus',exact=True).click();page.wait_for_load_state('networkidle')
                self.assertEqual(db_read(lambda:ApplicatorLedgerEntry.objects.filter(membership=self.member).count()),2);result['checks'].append('Existing wage payment and bonus ledger APIs')
                page.get_by_role('navigation',name='Employee quick actions').get_by_role('link',name='Leaves',exact=True).click();expect(page.locator('#employee-attendance form').get_by_role('combobox')).to_have_value('LEAVE');capture(page,'employee-leaves')
                goto(page,f'/in-house-applicators/{created_id}')
                page.get_by_role('button',name='Delete employee',exact=True).click();page.wait_for_url('**/in-house-applicators');page.wait_for_load_state('networkidle')
                expect(page.get_by_role('table',name='Employees')).not_to_contain_text('Updated QA Employee');page.get_by_label('Include removed employees',exact=True).check();page.get_by_role('link',name=re.compile('^Updated QA Employee')).click();page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Edit profile',exact=True).click();page.get_by_label('Active employee',exact=True).check()
                with page.expect_response(lambda response:response.request.method=='PATCH' and response.url.endswith(f'/in-house-applicators/{created_id}/')) as saved:
                    page.get_by_role('button',name='Save changes',exact=True).click()
                self.assertEqual(saved.value.status,200);self.assertTrue(saved.value.request.post_data_json['is_active'])
                expect(page.get_by_role('button',name='Edit profile',exact=True)).to_be_visible();self.assertTrue(db_read(lambda:ContractorApplicatorTeam.objects.get(pk=created_id).is_active));result['checks'].append('Remove from active list and restore via Edit, account retained')
                goto(page,'/contractor-network');expect(page.get_by_role('table',name='Contractor network list')).to_be_visible();capture(page,'contractor-network')
                page.get_by_role('button',name=re.compile('^View profile of .*Network Vendor')).click();expect(page.locator('.contractor-profile')).to_be_visible();capture(page,'network-profile')
                page.get_by_role('button',name='Share contractor profile',exact=True).click();expect(page.get_by_text('Profile link copied.',exact=True)).to_be_visible();self.assertEqual(page.evaluate('navigator.clipboard.readText()'),'http://localhost:5173/contractor-profile/BP-C-905402');result['checks'].append('Network row opens shared profile; share copies canonical public link')
                page.get_by_role('button',name='Close contractor profile',exact=True).click()
                page.get_by_role('button',name=re.compile('^Requests')).click();expect(page.get_by_role('table',name='Contractor network list')).to_contain_text('Incoming Company');expect(page.get_by_role('button',name='Accept',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Reject',exact=True)).to_be_visible();capture(page,'network-requests')
                page.get_by_role('button',name='Find contractor',exact=True).click();page.wait_for_load_state('networkidle');search=page.get_by_role('dialog');search.get_by_label('Company, owner, ID or phone',exact=True).fill('Available');search.get_by_role('button',name='Find contractor',exact=True).click();expect(page.get_by_role('table',name='Contractor search results')).to_contain_text('Available Company');capture(page,'network-search')
                search.get_by_role('button',name='View profile of Available Company',exact=True).click();expect(search.locator('.contractor-profile')).to_be_visible();result['checks'].append('Incoming request table retains Accept/Reject; contractor search table opens full profile')
                for actor,label in [(self.portal,'customer'),(self.painter,'painter'),(None,'guest')]:
                    view=session(actor);goto(view,'/contractor-profile/BP-C-905402');expect(view.locator('.contractor-profile')).to_be_visible();expect(view.locator('.contractor-profile')).to_contain_text('Network Painting Company');capture(view,f'{label}-contractor-profile')
                    if actor and actor.role=='PAINTER':
                        goto(view,'/in-house-earnings');expect(view.get_by_role('heading',name='My Earnings',exact=True)).to_be_visible();capture(view,'painter-wages')
                result['checks'].append('Same contractor profile component for network, customer, painter and unauthenticated recipient')
                self.assertEqual(result['errors'],[]);self.assertEqual(result['api_failures'],[])
            except Exception as error:
                result['failure']=str(error)
                if 'page' in locals():result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'failure.png'),full_page=True)
                raise
            finally:
                (OUT/'results.json').write_text(json.dumps(result,indent=2,default=str),encoding='utf-8')
                for context in contexts:context.unroute_all(behavior='ignoreErrors');context.close()
                browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    with tempfile.TemporaryDirectory(prefix='employee-network-qa-') as temp:
        settings.DATABASES['default'].setdefault('TEST',{})['NAME']=str(Path(temp)/'audit.sqlite3')
        raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.EmployeeNetwork']))
