"""Browser regression for Painter-initiated public-job contact; isolated records."""
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from qa.quotation_unified_verification import db_read
from django.conf import settings
from django.test.runner import DiscoverRunner
from jobs.models import Job, JobApplication
from quotations.models import ChatMessage
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/failed-test-repair'

class RepairBrowser(ShortcutBrowser):
    test_role_shortcuts=None

    def setUp(self):
        super().setUp()
        self.job=Job.objects.create(contractor=self.contractor,title='Repair public hiring post',service_type='Painting',location='Bengaluru',city='Bengaluru',job_type='DAILY',daily_wage=500,start_date=date.today())

    def test_painter_job_message_and_contractor_reply(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'steps':[],'screenshots':[],'errors':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            contexts=[]
            def login(actor):
                context=browser.new_context(viewport={'width':390,'height':1000},reduced_motion='reduce');contexts.append(context)
                def route_api(route):
                    parsed=urlsplit(route.request.url)
                    response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                    route.fulfill(response=response)
                context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
                page=context.new_page();page.set_default_navigation_timeout(60000);page.on('pageerror',lambda error:result['errors'].append(str(error)))
                page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(actor.mobile);page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                return page
            try:
                page=login(self.painter);page.goto('http://localhost:5173/jobs');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='View details',exact=True).first.click()
                page.get_by_role('button',name='Message',exact=True).click();page.wait_for_url('**/messages?**')
                message='Painter available for the public hiring post'
                page.get_by_label('Write a message',exact=True).fill(message)
                page.get_by_role('button',name='Send message',exact=True).click()
                with page.expect_response(lambda response:response.request.method=='POST' and response.url.endswith('/messages/')) as sent:
                    page.get_by_role('button',name=re.compile('I understand.*Send')).click()
                self.assertEqual(sent.value.status,201)
                self.assertTrue(db_read(lambda:ChatMessage.objects.filter(sender=self.painter,text=message).exists()))
                page.get_by_text(message,exact=True).first.wait_for()
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    filename=f'painter-job-message-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                self.assertFalse(db_read(lambda:JobApplication.objects.filter(painter=self.painter).exists()))
                result['steps'].append('Verified freelance Painter opens Message from an available public job and sends before applying, without creating an application')
                owner=login(self.contractor);owner.goto('http://localhost:5173/messages');owner.wait_for_load_state('networkidle')
                owner.locator('.chat-conversation-row').first.click()
                owner.get_by_label('Write a message',exact=True).fill('Please confirm your work availability.')
                owner.get_by_role('button',name='Send message',exact=True).click()
                with owner.expect_response(lambda response:response.request.method=='POST' and response.url.endswith('/messages/')) as replied:
                    owner.get_by_role('button',name=re.compile('I understand.*Send')).click()
                self.assertEqual(replied.value.status,201)
                owner.get_by_text('Please confirm your work availability.',exact=True).first.wait_for()
                owner.screenshot(path=str(OUT/'contractor-job-reply-390.png'),animations='disabled')
                result['steps'].append('Contractor reads and replies only in the Painter-initiated conversation')
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error)
                page.screenshot(path=str(OUT/'last-failure.png'))
                raise
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                for context in contexts:context.unroute_all(behavior='ignoreErrors');context.close()
                browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.RepairBrowser']))
