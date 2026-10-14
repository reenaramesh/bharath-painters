"""Combined line/overall discount Create/Edit/browser/PDF check on isolated fixtures."""
import json,re
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from qa.quotation_unified_verification import db_read
from quotations.models import Quotation
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django,pymupdf
OUT=Path(__file__).resolve().parents[2]/'docs/previews/combined-discounts'
class CombinedBrowser(ShortcutBrowser):
    test_role_shortcuts=None
    def test_create_edit_save_and_pdf(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'steps':[],'screenshots':[],'errors':[]};fault={'save':False}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
            def route_api(route):
                url=urlsplit(route.request.url)
                if fault['save'] and url.path.endswith('/draft/'):
                    fault['save']=False;route.fulfill(status=400,json={'detail':'Combined discount save rejected.'});return
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.set_default_navigation_timeout(60000);page.on('pageerror',lambda error:result['errors'].append(str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            def capture(name):
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1100})
                    page.locator('.qp-pricing').scroll_into_view_if_needed()
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    filename=f'{name}-pricing-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                    page.locator('.quotation-financial-controls').scroll_into_view_if_needed()
                    filename=f'{name}-overall-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
            try:
                page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/quotations/new-manual');page.wait_for_load_state('networkidle')
                page.get_by_placeholder('Search name, mobile, email or city',exact=True).fill('Grouped')
                page.get_by_role('button',name=self.customer.name,exact=True).click()
                page.locator('.quotation-customer-fields select').first.select_option(str(self.property.pk));page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Continue',exact=True).click()
                for description,quantity,rate in [('Combined walls',2,1000),('Combined special work',3,500)]:
                    page.get_by_role('button',name='Add services',exact=True).click()
                    dialog=page.get_by_role('dialog',name='Edit quotation service and rate',exact=True)
                    dialog.get_by_placeholder('Select or type a service',exact=True).fill('Painting');dialog.get_by_role('button',name='Painting',exact=True).click()
                    dialog.get_by_placeholder('Search room / area',exact=True).fill('Bedroom');dialog.get_by_role('button',name='Bedroom 1',exact=True).click()
                    dialog.get_by_placeholder('Type or select Description',exact=True).fill(description)
                    dialog.get_by_label('Quantity',exact=True).fill(str(quantity));dialog.get_by_role('combobox').first.select_option(str(self.unit.pk));dialog.get_by_label('Rate',exact=True).fill(str(rate))
                    dialog.get_by_role('button',name='Update line',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                mode=page.locator('select[name=discount_mode]');self.assertEqual(mode.input_value(),'BOTH')
                page.get_by_label('Line 1 discount type',exact=True).select_option('PERCENTAGE');page.get_by_label('Line 1 discount',exact=True).fill('10')
                page.get_by_label('Line 2 discount type',exact=True).select_option('FIXED');page.get_by_label('Line 2 discount',exact=True).fill('50')
                page.locator('select[name=discount_type]').select_option('PERCENTAGE');page.locator('input[name=discount_value]').fill('10')
                page.locator('select[name=gst_mode]').select_option('GST_EXTRA');page.locator('input[name=gst_percentage]').fill('18')
                page.get_by_role('status').filter(has_text='3,451.50').wait_for()
                capture('create')
                with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/quotations/create/')) as created:
                    page.get_by_role('button',name='Save draft',exact=True).click()
                self.assertEqual(created.value.status,201);data=created.value.json();quote_id=data['id'];self.assertEqual(data['grand_total'],'3451.50')
                page.wait_for_url(f'**/quotations/{quote_id}');page.wait_for_load_state('networkidle')
                result['steps'].append('Create with percentage/fixed line discounts plus overall percentage and GST; explicit Draft save totals 3451.50')
                page.goto(f'http://localhost:5173/quotations/{quote_id}/edit');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(page.locator('select[name=discount_mode]').input_value(),'BOTH');self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'10.00')
                self.assertEqual(page.get_by_label('Line 2 discount',exact=True).input_value(),'50.00')
                capture('edit')
                page.get_by_label('Line 1 discount',exact=True).fill('20')
                page.locator('select[name=discount_type]').select_option('FIXED');page.locator('input[name=discount_value]').fill('100')
                page.get_by_role('status').filter(has_text='3,481.00').wait_for()
                fault['save']=True;page.get_by_role('button',name='Save draft',exact=True).click();page.get_by_text('Combined discount save rejected.',exact=False).wait_for()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'20')
                self.assertEqual(str(db_read(lambda:Quotation.objects.get(pk=quote_id).grand_total)),'3451.50')
                with page.expect_response(lambda r:r.request.method=='PATCH' and r.url.endswith('/draft/')) as edited:
                    page.get_by_role('button',name='Save draft',exact=True).click()
                self.assertEqual(edited.value.status,200);self.assertEqual(edited.value.json()['grand_total'],'3481.00')
                page.wait_for_url(f'**/quotations/{quote_id}');page.wait_for_load_state('networkidle')
                with page.expect_response(lambda r:f'/quotations/{quote_id}/pdf/' in r.url) as pdf:
                    page.get_by_role('button',name='Download PDF',exact=True).click()
                self.assertEqual(pdf.value.status,200)
                (OUT/'combined-quotation.pdf').write_bytes(pdf.value.body())
                with pymupdf.open(stream=pdf.value.body(),filetype='pdf') as document:
                    text=' '.join(''.join(part.get_text() for part in document).split())
                    self.assertIn('Line discount',text);self.assertIn('Overall discount',text);self.assertIn('3,481.00',text)
                    document[0].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(str(OUT/'combined-quotation-pdf.png'))
                result['steps'].append('Edit restores both modes/values; fixed overall discount, failed-save retention, successful atomic save and downloaded PDF total 3481.00')
                self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error);result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'failure.png'));raise
            finally:
                (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors');context.close();browser.close()
if __name__=='__main__':
    import faulthandler
    faulthandler.dump_traceback_later(120,repeat=True)
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.CombinedBrowser']))
