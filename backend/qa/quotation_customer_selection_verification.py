"""Fresh quotation customer selection audit using isolated accounts and records."""
import json,re
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from quotations.models import Quotation
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django
OUT=Path(__file__).resolve().parents[2]/'docs/previews/quotation-customer-selection'
class CustomerSelection(ShortcutBrowser):
    test_role_shortcuts=None
    def setUp(self):
        super().setUp()
        self.quote=Quotation.objects.create(contractor=self.contractor,customer=self.customer,property=self.property,connection=self.connection,quotation_number='QA-CUSTOMER-SELECTION',quotation_type='MANUAL_LUMPSUM',status='DRAFT')
    def test_manual_selection_fresh_routes_recovery_and_edit(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'steps':[],'errors':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':390,'height':1000},reduced_motion='reduce')
            def route_api(route):
                url=urlsplit(route.request.url)
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.set_default_navigation_timeout(60000);page.on('pageerror',lambda error:result['errors'].append(str(error)))
            try:
                page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                paths=['/quotations/new',f'/quotations/new?customer={self.customer.pk}&property={self.property.pk}',f'/quotations/new?property={self.property.pk}',f'/quotations/new-manual?customer={self.customer.pk}&property={self.property.pk}']
                for path in paths:
                    page.evaluate("Object.keys(localStorage).filter(key=>key.startsWith('bp-quotation-recovery:')).forEach(key=>localStorage.removeItem(key))")
                    page.goto('http://localhost:5173'+path);page.wait_for_load_state('networkidle')
                    customer=page.get_by_placeholder('Search name, mobile, email or city',exact=True)
                    self.assertEqual(customer.input_value(),'')
                    self.assertEqual(page.locator('.quotation-customer-fields select').first.input_value(),'')
                    page.get_by_role('button',name='Continue',exact=True).click();page.get_by_text('Select a customer.',exact=True).wait_for()
                    result['steps'].append('Empty customer/property and Continue validation: '+path)
                customer.fill('Grouped');page.get_by_role('button',name=self.customer.name,exact=True).click()
                page.locator('.quotation-customer-fields select').first.select_option(str(self.property.pk))
                page.wait_for_load_state('networkidle')
                page.reload();page.wait_for_load_state('networkidle')
                self.assertEqual(page.get_by_placeholder('Search name, mobile, email or city',exact=True).input_value(),self.customer.name)
                self.assertEqual(page.locator('.quotation-customer-fields select').first.input_value(),str(self.property.pk))
                result['steps'].append('Manual choice and dependent property restore after refresh')
                page.evaluate("Object.keys(localStorage).filter(key=>key.startsWith('bp-quotation-recovery:')).forEach(key=>localStorage.removeItem(key))")
                page.goto('http://localhost:5173/quotations/new');page.wait_for_load_state('networkidle')
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    page.screenshot(path=str(OUT/f'empty-create-{width}.png'),animations='disabled')
                page.goto(f'http://localhost:5173/quotations/{self.quote.pk}/edit');page.wait_for_load_state('networkidle')
                customer=page.get_by_placeholder('Search name, mobile, email or city',exact=True)
                self.assertEqual(customer.input_value(),self.customer.name);self.assertTrue(customer.get_attribute('readonly') is not None)
                self.assertEqual(page.locator('.quotation-customer-fields select').first.input_value(),str(self.property.pk))
                result['steps'].append('Edit Draft retains read-only saved customer and property')
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error);page.screenshot(path=str(OUT/'failure.png'));raise
            finally:
                (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors');context.close();browser.close()
if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.CustomerSelection']))
