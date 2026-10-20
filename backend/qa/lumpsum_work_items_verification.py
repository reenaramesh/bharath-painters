"""Lump-sum work-item summaries tested with isolated data and real APIs."""
import json
import re
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from qa.quotation_unified_verification import BrowserAudit, db_read
from quotations.models import Quotation
from quotations.test_grouped_specifications import GroupedSpecificationTests
from django.conf import settings
from django.db import connection
from django.test import override_settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright, expect
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/lumpsum-work-items'

class LumpSumWorkItems(BrowserAudit):
    test_browser_workflow=None
    def setUp(self):
        self.media=tempfile.TemporaryDirectory(prefix='lumpsum-media-qa-');self.addCleanup(self.media.cleanup)
        config=override_settings(MEDIA_ROOT=self.media.name,STORAGES={'default':{'BACKEND':'django.core.files.storage.FileSystemStorage'},'staticfiles':{'BACKEND':'django.contrib.staticfiles.storage.StaticFilesStorage'}})
        config.enable();self.addCleanup(config.disable)
        super().setUp()
        with connection.cursor() as cursor:cursor.execute('PRAGMA journal_mode=WAL')

    def test_grouped_pricing_fields(self):
        line=GroupedSpecificationTests.item(self,'group',self.walls,[120,115,110,125],'Grouped paint scope')
        line['paint_brand']=self.brand.pk;line['specification_details']['primer_coats']=1;line['specification_details']['name']='Bedroom painting group'
        self.client.force_authenticate(self.contractor)
        response=self.client.post('/api/quotations/create/',{'customer':self.customer.pk,'property':self.property.pk,'measurement_record':self.measurement.pk,'quotation_type':'MEASUREMENT','gst_mode':'NO_GST','rooms':[],'items':[line]},format='json')
        self.assertEqual(response.status_code,201,response.data)
        quote_id=response.data['id'];OUT.mkdir(parents=True,exist_ok=True)
        result={'screenshots':[],'errors':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':360,'height':1000},reduced_motion='reduce')
            def route_api(route):
                url=urlsplit(route.request.url)
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer,timeout=15000)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.on('pageerror',lambda error:result['errors'].append(str(error)))
            try:
                page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto(f'http://localhost:5173/quotations/{quote_id}/edit');page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000});self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    if width<768:
                        opener=page.get_by_role('button',name='Open work item 1',exact=True);expect(opener).to_be_visible(timeout=3000);expect(page.locator('.qp-pricing input')).to_have_count(0)
                        name=f'grouped-pricing-list-{width}.png';page.locator('.qp-mobile-lines').screenshot(path=str(OUT/name),animations='disabled');result['screenshots'].append(name);opener.click()
                    row=page.locator('.qp-item');expect(row).to_have_count(1);expect(row).to_contain_text('Painting');expect(row).to_contain_text('Grouped paint scope');expect(row).to_contain_text('Bedroom painting group');expect(row).to_contain_text('Tractor Emulsion');expect(row).to_contain_text('QA Brand');expect(row).to_contain_text('Primer: 1');expect(page.get_by_label('Line 1 quantity',exact=True)).to_have_attribute('readonly','');expect(row.locator('output').first).to_have_text('₹4,700.00')
                    target=page.get_by_role('dialog',name='Work item 1',exact=True) if width<768 else row
                    self.assertTrue(target.evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    name=f'grouped-pricing-{"popup" if width<768 else "row"}-{width}.png';target.screenshot(path=str(OUT/name),animations='disabled');result['screenshots'].append(name)
                    if width<768:target.get_by_role('button',name='Done',exact=True).click();expect(opener).to_be_focused()
                self.assertEqual(result['errors'],[])
            finally:
                (OUT/'grouped-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');context.unroute_all(behavior='ignoreErrors');context.close();browser.close()

    def test_lumpsum_rows(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'screenshots':[],'checks':[],'errors':[],'http_failures':[],'writes':[]}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
            flags={'accept':True}
            def route_api(route):
                url=urlsplit(route.request.url)
                response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+url.path+('?' +url.query if url.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer,timeout=15000)
                if response.status>=400:result['http_failures'].append({'path':url.path,'status':response.status,'body':response.text()[:300]})
                if route.request.method not in ['GET','HEAD'] and not url.path.endswith('/login/'):result['writes'].append({'path':url.path,'status':response.status})
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page();page.on('pageerror',lambda error:result['errors'].append(str(error)));page.on('dialog',lambda dialog:dialog.accept() if flags['accept'] else dialog.dismiss())
            def capture(name):
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000});page.evaluate('window.scrollTo(0,0)')
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    filename=f'{name}-{width}.png';page.screenshot(path=str(OUT/filename),full_page=True,animations='disabled');result['screenshots'].append(filename)
                    if width<768:
                        opener=page.get_by_role('button',name='Open work item 1',exact=True);expect(opener).to_be_visible();expect(page.locator('.qp-pricing input')).to_have_count(0);opener.click()
                        popup=page.get_by_role('dialog',name='Work item 1',exact=True);expect(popup).to_contain_text('Bedroom wall painting');expect(popup).to_contain_text('Tractor Emulsion');expect(popup).to_contain_text('QA Brand');self.assertTrue(popup.evaluate('el=>el.scrollWidth<=el.clientWidth'))
                        self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                        filename=f'{name}-popup-{width}.png';popup.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                        if name=='create-pricing-fields' and width==360:
                            page.get_by_label('Line 1 rate',exact=True).fill('28');expect(popup.locator('output').first).to_have_text('₹350.00')
                            page.get_by_label('Line 1 discount type',exact=True).select_option('PERCENTAGE');page.get_by_label('Line 1 discount',exact=True).fill('10');expect(popup.locator('.qp-net output')).to_have_text('₹315.00')
                            page.get_by_label('Line 1 discount type',exact=True).select_option('FIXED');page.get_by_label('Line 1 discount',exact=True).fill('20');expect(popup.locator('.qp-net output')).to_have_text('₹330.00')
                            for _ in range(12):page.keyboard.press('Tab');self.assertTrue(popup.evaluate('el=>el.contains(document.activeElement)'))
                            for _ in range(2):page.keyboard.press('Shift+Tab');self.assertTrue(popup.evaluate('el=>el.contains(document.activeElement)'))
                            page.keyboard.press('Escape');expect(popup).not_to_be_visible();expect(opener).to_be_focused();expect(opener).to_contain_text('₹330.00');opener.click()
                            expect(page.get_by_label('Line 1 rate',exact=True)).to_have_value('28');expect(page.get_by_label('Line 1 discount',exact=True)).to_have_value('20')
                            page.mouse.click(2,2);expect(popup).to_be_visible();page.get_by_label('Line 1 rate',exact=True).fill('25');page.get_by_label('Line 1 discount',exact=True).fill('0');self.assertEqual(result['writes'],[])
                            result['checks'].append('Mobile popup pricing/discount changes survive Escape and reopen; outside tap retains input; focus stays in popup and returns to opener; no silent save')
                        if name.endswith('pricing-fields'):self.assertEqual(page.get_by_label('Line 1 discount type',exact=True).bounding_box()['width'],64)
                        if name=='create-pricing-fields' and width==430:
                            page.set_viewport_size({'width':430,'height':640});self.assertLessEqual(popup.bounding_box()['height'],576)
                            button=popup.get_by_role('button',name='Done',exact=True).bounding_box();self.assertLessEqual(button['y']+button['height'],640)
                            filename=f'{name}-popup-short-{width}.png';popup.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                            page.set_viewport_size({'width':width,'height':1000})
                        popup.get_by_role('button',name='Done',exact=True).click();expect(opener).to_be_focused()
                        if name=='create-summary' and width==390:
                            opener.click();popup.get_by_role('button',name='Edit work item 1',exact=True).click();expect(popup).not_to_be_visible();sheet=page.get_by_role('dialog',name='Edit quotation service and rate',exact=True);expect(sheet.get_by_label('Description',exact=True)).to_have_value('Bedroom wall painting');sheet.get_by_role('button',name='Close editor',exact=True).click();expect(sheet).not_to_be_visible()
                        continue
                    if name.endswith('pricing-fields'):
                        filename=f'{name}-row-{width}.png';page.locator('.qp-item').first.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                        filename=f'{name}-table-{width}.png';page.locator('.qp-table').screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                        self.assertEqual(page.get_by_label('Line 1 discount type',exact=True).bounding_box()['width'],64)
                        if width==1440:
                            buttons=page.locator('.qp-item-actions button').all()
                            if len(buttons)==2:self.assertEqual(buttons[0].bounding_box()['y'],buttons[1].bounding_box()['y'])
            def fill_line(description,quantity,rate):
                sheet=page.get_by_role('dialog',name='Edit quotation service and rate',exact=True)
                sheet.get_by_placeholder('Select or type a service',exact=True).fill('Painting');sheet.get_by_role('button',name='Painting',exact=True).click()
                sheet.get_by_placeholder('Search room / area',exact=True).fill('Bedroom');sheet.get_by_role('button',name='Bedroom 1',exact=True).click()
                product=sheet.get_by_label('Service / Product Type');product.fill('Tractor');sheet.get_by_role('button',name='Tractor Emulsion',exact=True).click()
                sheet.get_by_label('Description',exact=True).fill(description)
                sheet.get_by_placeholder('Select or type a brand (optional)',exact=True).fill('QA Brand');sheet.get_by_role('button',name='QA Brand',exact=True).click()
                sheet.get_by_label('Quantity',exact=True).fill(quantity);sheet.get_by_label('MOU').select_option(str(self.unit.pk));sheet.get_by_label('No. of coats').select_option('2');sheet.get_by_label('Rate',exact=True).fill(rate)
                sheet.get_by_role('button',name='Update line',exact=True).click();expect(sheet).not_to_be_visible()
            try:
                page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/quotations/new-manual');page.wait_for_load_state('networkidle');page.get_by_role('button',name='Grouped Customer',exact=True).click();page.locator('.bp-quotation-builder select').first.select_option(str(self.property.pk));page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Add services',exact=True).click();fill_line('Bedroom wall painting','12.5','25')
                table=page.get_by_role('table',name='Lump-sum quotation work items',exact=True);expect(table).to_contain_text('Painting');expect(table).to_contain_text('Bedroom wall painting');expect(table).to_contain_text('Tractor Emulsion');expect(table).to_contain_text('QA Brand');expect(table).to_contain_text('12.5 Sq ft');expect(table.locator('output')).to_have_text('₹312.50');self.assertNotIn('New work item',table.inner_text());capture('create-summary')
                page.get_by_role('button',name='Add services',exact=True).click();fill_line('Extra preparation','1','50');expect(table.locator('tbody tr')).to_have_count(2)
                flags['accept']=False;page.get_by_role('button',name='Delete work item 1',exact=True).click();expect(table.locator('tbody tr')).to_have_count(2)
                flags['accept']=True;page.set_viewport_size({'width':360,'height':1000});page.get_by_role('button',name='Open work item 2',exact=True).click();popup=page.get_by_role('dialog',name='Work item 2',exact=True);popup.get_by_role('button',name='Delete work item 2',exact=True).click();expect(popup).not_to_be_visible();expect(page.locator('.qp-mobile-lines li')).to_have_count(1)
                page.get_by_role('button',name='Add services',exact=True).click();fill_line('Extra preparation','1','50');expect(page.locator('.qp-mobile-lines li')).to_have_count(2);expect(popup).not_to_be_visible();page.get_by_role('button',name='Open work item 2',exact=True).click();popup.get_by_role('button',name='Delete work item 2',exact=True).click();expect(popup).not_to_be_visible();page.set_viewport_size({'width':1440,'height':1000});expect(table.locator('tbody tr')).to_have_count(1)
                result['checks'].append('Deleting an unsaved mobile item and adding another does not reopen a stale popup')
                self.assertEqual(db_read(lambda:Quotation.objects.count()),0);self.assertEqual(result['writes'],[]);result['checks'].append('All major fields shown; add/edit/delete does not persist; cancelled deletion keeps the line')
                page.get_by_role('button',name='Continue',exact=True).click();expect(page.locator('.qp-item output').first).to_have_text('₹312.50')
                page.get_by_label('Line 1 quantity',exact=True).fill('13');expect(page.locator('.qp-item output').first).to_have_text('₹325.00');page.get_by_label('Line 1 quantity',exact=True).fill('12.5')
                page.get_by_label('Line 1 rate',exact=True).fill('30');expect(page.locator('.qp-item output').first).to_have_text('₹375.00');page.get_by_label('Line 1 rate',exact=True).fill('25')
                page.get_by_label('Discount mode',exact=True).select_option('BOTH');page.get_by_label('Line 1 discount type',exact=True).select_option('PERCENTAGE');page.get_by_label('Line 1 discount',exact=True).fill('10');expect(page.locator('.qp-net output')).to_have_text('₹281.25')
                page.get_by_label('Line 1 discount type',exact=True).select_option('FIXED');page.get_by_label('Line 1 discount',exact=True).fill('20');expect(page.locator('.qp-net output')).to_have_text('₹292.50');page.get_by_label('Line 1 discount',exact=True).fill('0')
                self.assertEqual(result['writes'],[]);result['checks'].append('Inline quantity/rate and percentage/fixed discounts recalculate locally without saving')
                page.get_by_role('button',name='Edit specifications for work item 1',exact=True).click();sheet=page.get_by_role('dialog',name='Edit quotation service and rate',exact=True);expect(sheet.get_by_label('Description',exact=True)).to_have_value('Bedroom wall painting');sheet.get_by_role('button',name='Close editor',exact=True).click();expect(sheet).not_to_be_visible()
                details=page.locator('.qp-item');expect(details).to_contain_text('Painting');expect(details).to_contain_text('Bedroom wall painting');expect(details).to_contain_text('Tractor Emulsion');expect(details).to_contain_text('QA Brand');expect(details.locator('.qp-coats')).to_have_text('2');capture('create-pricing-fields')
                page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));page.wait_for_load_state('networkidle');quote_id=int(page.url.rsplit('/',1)[-1])
                def read_saved():
                    q=Quotation.objects.get(pk=quote_id);line=q.items.get();return {'total':str(q.grand_total),'subtotal':str(q.subtotal),'gst':str(q.gst_amount),'description':line.description,'quantity':str(line.quantity),'rate':str(line.rate),'coats':line.coats,'product':line.paint_type_id,'brand':line.paint_brand_id,'id':line.pk}
                saved=db_read(read_saved);self.assertEqual(saved['subtotal'],'312.50');self.assertEqual(saved['gst'],'56.25');self.assertEqual(saved['total'],'368.75');self.assertEqual(saved['product'],self.product.pk);self.assertEqual(saved['brand'],self.brand.pk);self.assertEqual(saved['coats'],2)
                page.get_by_role('link',name='Edit Draft').click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click();expect(page.get_by_role('table',name='Lump-sum quotation work items')).to_contain_text('Bedroom wall painting');capture('edit-summary')
                page.get_by_role('button',name='Edit work item 1',exact=True).click();sheet=page.get_by_role('dialog',name='Edit quotation service and rate');expect(sheet.get_by_label('Quantity',exact=True)).to_have_value('12.50');expect(sheet.get_by_label('Rate',exact=True)).to_have_value('25.00');sheet.get_by_label('Rate',exact=True).fill('30');sheet.get_by_role('button',name='Update line',exact=True).click();expect(page.locator('.lsq-work-items output')).to_have_text('₹375.00')
                page.get_by_role('button',name='Continue',exact=True).click();expect(page.locator('.qp-product')).to_contain_text('QA Brand');capture('edit-pricing-fields');page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));page.wait_for_load_state('networkidle');edited=db_read(read_saved);self.assertEqual(edited['id'],saved['id']);self.assertEqual(edited['subtotal'],'375.00');self.assertEqual(edited['gst'],'67.50');self.assertEqual(edited['total'],'442.50');self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                result['checks'].append('Create → explicit Save Draft → Edit → changed price → Save; saved IDs, product, brand, coats and totals preserved')
                page.get_by_role('link',name='Edit Draft').click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Add services',exact=True).click();fill_line('Replacement service','1','10')
                page.get_by_role('button',name='Continue',exact=True).click();expect(page.locator('.qp-item')).to_have_count(2);expect(page.get_by_label('Line 1 rate',exact=True)).to_have_value('30.00');expect(page.get_by_label('Line 2 rate',exact=True)).to_have_value('10')
                page.set_viewport_size({'width':360,'height':1000});page.get_by_role('button',name='Open work item 1',exact=True).click();popup=page.get_by_role('dialog',name='Work item 1',exact=True)
                flags['accept']=False;popup.get_by_role('button',name='Delete work item 1',exact=True).click();expect(popup).to_be_visible();expect(page.locator('.qp-mobile-lines li')).to_have_count(2);flags['accept']=True
                popup.get_by_role('button',name='Delete work item 1',exact=True).click();expect(popup).not_to_be_visible();expect(page.locator('.qp-pricing')).not_to_contain_text('Bedroom wall painting');expect(page.locator('.qp-mobile-lines li')).to_have_count(1);self.assertEqual(db_read(read_saved)['id'],saved['id'])
                page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));page.wait_for_load_state('networkidle');replaced=db_read(read_saved);self.assertNotEqual(replaced['id'],saved['id']);self.assertEqual(replaced['description'],'Replacement service');self.assertEqual(replaced['total'],'11.80');result['checks'].append('Deleting a saved line from Step 3 remains local until explicit atomic Draft save')
                self.assertEqual(result['errors'],[]);self.assertEqual(result['http_failures'],[])
            except Exception as error:
                result['failure']=str(error);result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
            finally:
                (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');context.unroute_all(behavior='ignoreErrors');context.close();browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    with tempfile.TemporaryDirectory(prefix='lumpsum-browser-qa-') as folder:
        settings.DATABASES['default'].setdefault('TEST',{})['NAME']=str(Path(folder)/'audit.sqlite3')
        raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.LumpSumWorkItems']))
