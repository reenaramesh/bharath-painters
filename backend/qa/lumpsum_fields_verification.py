"""Opt-in lump-sum specification field visibility audit on isolated records."""
import json,re
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from quotations.models import Quotation,QuotationItem,QuotationRoom,PaintColor
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django
OUT=Path(__file__).resolve().parents[2]/'docs/previews/lumpsum-fields'
class LumpSumFields(ShortcutBrowser):
    test_role_shortcuts=None
    def setUp(self):
        super().setUp()
        self.colour=PaintColor.objects.create(name='Saved ivory')
        self.quotes={}
        for kind in ['MANUAL_LUMPSUM','MEASUREMENT']:
            quote=Quotation.objects.create(contractor=self.contractor,customer=self.customer,property=self.property,connection=self.connection,quotation_type=kind,quotation_number=f'QA-{kind}',status='DRAFT')
            room=QuotationRoom.objects.create(quotation=quote,name='Bedroom 1',property_room=self.room)
            QuotationItem.objects.create(quotation=quote,description='Saved work',service_category=self.category,service_type=self.service,color=self.colour,paint_type=self.product,quantity=1,rate=100,unit=self.unit,room=room,calculation_method='MANUAL')
            self.quotes[kind]=quote
    def test_lumpsum_and_add_service_fields_hidden(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'screenshots':[],'errors':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
            def route_api(route):
                url=urlsplit(route.request.url)
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.set_default_navigation_timeout(60000)
            page.on('pageerror',lambda error:result['errors'].append(str(error)))
            try:
                page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                routes=[('create-lumpsum',f'/quotations/new-manual?customer={self.customer.pk}&property={self.property.pk}'),('edit-lumpsum',f"/quotations/{self.quotes['MANUAL_LUMPSUM'].pk}/edit"),('edit-measurement',f"/quotations/{self.quotes['MEASUREMENT'].pk}/edit")]
                for mode,path in routes:
                    page.goto('http://localhost:5173'+path);page.wait_for_load_state('networkidle')
                    if mode=='create-lumpsum':
                        page.get_by_placeholder('Search name, mobile, email or city',exact=True).fill('Grouped')
                        page.get_by_role('button',name=self.customer.name,exact=True).click()
                        page.locator('.quotation-customer-fields select').first.select_option(str(self.property.pk))
                        page.wait_for_load_state('networkidle')
                    page.get_by_role('button',name='Continue',exact=True).click()
                    if mode=='create-lumpsum':page.get_by_role('button',name='Add services',exact=True).click()
                    else:page.get_by_role('button',name='Edit specifications',exact=True).first.click()
                    dialog=page.get_by_role('dialog',name='Edit quotation service and rate',exact=True)
                    dialog.wait_for()
                    for field in ['Service','Colour']:
                        self.assertEqual(dialog.get_by_label(field,exact=True).count(),0)
                    for width in [360,390,430,768,1440]:
                        page.set_viewport_size({'width':width,'height':1000})
                        self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                        filename=f'{mode}-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
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
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.LumpSumFields']))
