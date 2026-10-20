"""Opt-in dashboard shortcut browser checks against isolated test records."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from qa.quotation_unified_verification import BrowserAudit
from accounts.models import BharathUser
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/dashboard-shortcuts'

class ShortcutBrowser(BrowserAudit):
    test_browser_workflow=None

    def setUp(self):
        super().setUp()
        self.portal=BharathUser.objects.create_user(mobile=self.customer.mobile,password='test-pass',role='CUSTOMER')
        self.customer.portal_user=self.portal
        self.customer.save(update_fields=['portal_user'])
        self.painter=BharathUser.objects.create_user(mobile='919800000345',password='test-pass',role='PAINTER',is_verified=True,verification_status='VERIFIED')

    def test_role_shortcuts(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'screenshots':[],'roles':{},'errors':[],'writes':[],'http_failures':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                for actor,path in [(self.contractor,'/dashboard'),(self.portal,'/customer-dashboard'),(self.painter,'/dashboard')]:
                    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
                    def route_api(route):
                        parsed=urlsplit(route.request.url)
                        if route.request.method not in ['GET','HEAD'] and not parsed.path.endswith('/login/'):
                            result['writes'].append(parsed.path)
                        response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                        if response.status>=400 and not (response.status==404 and parsed.path.endswith('/my-in-house-employment/')):
                            result['http_failures'].append({'role':actor.role,'path':parsed.path,'status':response.status})
                        route.fulfill(response=response)
                    context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
                    page=context.new_page()
                    page.on('pageerror',lambda error:result['errors'].append(str(error)))
                    try:
                        page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
                        page.locator('input[type=text]').first.fill(actor.mobile)
                        page.locator('input[type=password]').fill('test-pass')
                        page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**'+path)
                        page.wait_for_load_state('networkidle')
                        section=page.get_by_role('region',name='Quick actions',exact=True)
                        section.wait_for()
                        self.assertEqual(section.count(),1)
                        links=section.locator('a').evaluate_all('els=>els.map(el=>({label:el.innerText,href:el.getAttribute("href")}))')
                        result['roles'][actor.role]=links
                        self.assertFalse(any('Manage' in item['label'] for item in links))
                        self.assertTrue(any(item['href']=='/messages' for item in links))
                        if actor.role=='CONTRACTOR':
                            for href in ['/messages','/tasks','/site-visits','/contractor-network','/quotations/new','/customers?action=add']:
                                self.assertTrue(any(item['href']==href for item in links),href)
                        else:
                            self.assertFalse(any(item['href'] in ['/tasks','/site-visits','/contractor-network','/quotations/new'] for item in links))
                        for width in [360,390,430,768,1440]:
                            page.set_viewport_size({'width':width,'height':1000})
                            section.scroll_into_view_if_needed()
                            self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                            scroll=section.locator('.bp-dashboard-shortcut-scroll')
                            scroll.evaluate('el=>el.scrollLeft=0')
                            sizes=section.locator('.bp-dashboard-shortcut').first.evaluate('el=>{const icon=el.querySelector(".bp-shortcut-icon"),label=el.querySelector(".bp-shortcut-label");return {icon:icon.getBoundingClientRect().width,font:parseFloat(getComputedStyle(label).fontSize),weight:getComputedStyle(label).fontWeight,below:label.getBoundingClientRect().top>=icon.getBoundingClientRect().bottom,height:el.getBoundingClientRect().height}}')
                            self.assertEqual(sizes['icon'],44)
                            self.assertLessEqual(sizes['font'],11)
                            self.assertEqual(sizes['weight'],'400')
                            self.assertTrue(sizes['below'])
                            self.assertGreaterEqual(sizes['height'],44)
                            filename=f'{actor.role.lower()}-{width}.png'
                            page.screenshot(path=str(OUT/filename),animations='disabled',full_page=True)
                            result['screenshots'].append(filename)
                            section.get_by_role('link',name='Sub network' if actor.role=='CONTRACTOR' else 'Messages',exact=True).scroll_into_view_if_needed()
                            filename=f'{actor.role.lower()}-more-shortcuts-{width}.png'
                            section.screenshot(path=str(OUT/filename),animations='disabled')
                            result['screenshots'].append(filename)
                            if width<768:
                                self.assertTrue(scroll.evaluate('el=>el.scrollWidth>el.clientWidth'))
                                scroll.focus();page.keyboard.press('End')
                                scroll.evaluate('el=>el.scrollLeft=el.scrollWidth')
                                self.assertGreater(scroll.evaluate('el=>el.scrollLeft'),0)
                                section.locator('a').last.click();page.wait_for_url('**'+links[-1]['href'])
                                page.goto('http://localhost:5173'+path);page.wait_for_load_state('networkidle')
                        section.get_by_role('link',name='Messages',exact=True).click();page.wait_for_url('**/messages');page.wait_for_load_state('networkidle')
                    except Exception as error:
                        result['blocker']=str(error);result['body']=page.locator('body').inner_text()
                        page.screenshot(path=str(OUT/'last-failure.png'),full_page=True)
                        raise
                    finally:
                        context.unroute_all(behavior='ignoreErrors');context.close()
                self.assertEqual(result['writes'],[])
                self.assertEqual(result['errors'],[])
                self.assertEqual(result['http_failures'],[])
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.ShortcutBrowser']))
