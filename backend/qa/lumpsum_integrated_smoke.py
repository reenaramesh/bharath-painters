"""One essential integration flow. Broad regression suites are intentionally deferred."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from qa.lumpsum_work_items_verification import LumpSumWorkItems
from qa.quotation_unified_verification import db_read
from quotations.models import Quotation
from playwright.sync_api import expect, sync_playwright

OUT = Path(__file__).resolve().parents[2] / 'docs/previews/lumpsum-integrated'


class LumpSumIntegratedSmoke(LumpSumWorkItems):
    test_browser_workflow = None
    test_grouped_pricing_fields = None
    test_lumpsum_rows = None

    def test_basic_draft_integration(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {'errors': [], 'api_failures': [], 'writes': [], 'screenshots': [], 'checks': []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
            def route_api(route):
                url = urlsplit(route.request.url)
                response = context.request.fetch(self.live_server_url.replace('localhost', '127.0.0.1') + url.path + ('?' + url.query if url.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer, timeout=15000)
                if response.status >= 400: result['api_failures'].append({'path': url.path, 'status': response.status, 'body': response.text()[:500]})
                if route.request.method not in ['GET', 'HEAD'] and not url.path.endswith('/login/'): result['writes'].append({'path': url.path, 'status': response.status})
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
            page = context.new_page()
            page.on('pageerror', lambda error: result['errors'].append(str(error)))
            page.on('dialog', lambda dialog: dialog.accept())
            def capture(name, popup=None):
                for width in [360, 390, 430, 1440]:
                    page.set_viewport_size({'width': width, 'height': 844 if width < 768 else 1000})
                    if not popup: page.evaluate('window.scrollTo(0,0)')
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                    if popup: self.assertTrue(popup.evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    filename=f'{name}-{width}.png'
                    page.screenshot(path=str(OUT/filename), full_page=not bool(popup), animations='disabled')
                    result['screenshots'].append(filename)
            def fill_item(description, quantity, rate, unit, new_room=False):
                popup=page.get_by_role('dialog',name='Add Item',exact=True)
                popup.get_by_placeholder('Select or type a service',exact=True).fill('Painting');popup.get_by_role('button',name='Painting',exact=True).click()
                if new_room:
                    popup.get_by_role('button',name='Add room',exact=True).click();popup.get_by_placeholder('Enter room name',exact=True).fill('Kitchen');popup.get_by_role('button',name='Save room',exact=True).click();expect(popup.get_by_placeholder('Search room / area',exact=True)).to_have_value('Kitchen')
                else:
                    popup.get_by_placeholder('Search room / area',exact=True).fill('Bedroom');popup.get_by_role('button',name='Bedroom 1',exact=True).click()
                popup.get_by_label('Service / Product Type').fill('Tractor');popup.get_by_role('button',name='Tractor Emulsion',exact=True).click()
                popup.get_by_label('Description',exact=True).fill(description)
                popup.get_by_placeholder('Select or type a brand (optional)',exact=True).fill('QA Brand');popup.get_by_role('button',name='QA Brand',exact=True).click()
                popup.get_by_label('Quantity',exact=True).fill(quantity);popup.get_by_label('MOU',exact=True).select_option(unit);popup.get_by_label('No. of coats').select_option('2');popup.get_by_label('Rate (₹)',exact=True).fill(rate)
                return popup
            try:
                page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/quotations/new-manual');page.wait_for_load_state('networkidle');expect(page.get_by_placeholder('Search name, mobile, email or city',exact=True)).to_have_value('');page.get_by_role('button',name='Grouped Customer',exact=True).click();page.locator('.bp-quotation-builder select').first.select_option(str(self.property.pk));page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Add Item',exact=True).click();popup=page.get_by_role('dialog',name='Add Item',exact=True);popup.get_by_role('button',name='Save Item',exact=True).click();expect(popup.get_by_role('alert')).to_contain_text('Complete:')
                popup.get_by_role('button',name='Close work item',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click();expect(page.locator('.bp-quotation-builder [role=alert]')).to_have_count(1)
                page.get_by_role('button',name='Add Item',exact=True).click();popup=fill_item('Bedroom painting','2','500',str(self.unit.pk));expect(popup.get_by_role('alert')).to_have_count(0);capture('item-form',popup);popup.get_by_role('button',name='Close work item',exact=True).click();expect(popup).not_to_be_visible();expect(page.locator('.bp-quotation-builder [role=alert]')).to_have_count(0);expect(page.locator('.lsq-card-list li')).to_have_count(1);expect(page.locator('.lsq-subtotal')).to_contain_text('₹1,000.00')
                page.reload();page.wait_for_load_state('networkidle');expect(page.locator('.lsq-card-list li')).to_have_count(1);expect(page.locator('.bp-quotation-builder [role=alert]')).to_have_count(0)
                page.get_by_role('button',name='Add Item',exact=True).click();popup=fill_item('Kitchen supplies','4','25','custom:Box',new_room=True);popup.get_by_role('button',name='Save Item',exact=True).click();expect(page.locator('.lsq-card-list li')).to_have_count(2);expect(page.locator('.lsq-subtotal')).to_contain_text('₹1,100.00');expect(page.get_by_label('Discount mode',exact=True)).to_have_count(0);capture('services')
                page.get_by_role('button',name='Open work item 1',exact=True).click();popup=page.get_by_role('dialog',name='Work item 1',exact=True);expect(popup).to_contain_text('Bedroom 1');expect(popup).to_contain_text('QA Brand');capture('view-item',popup);popup.get_by_role('button',name='Done',exact=True).click()
                self.assertEqual(db_read(lambda:Quotation.objects.count()),0)
                page.get_by_role('button',name='Continue',exact=True).click();page.get_by_label('Discount mode',exact=True).select_option('OVERALL');page.get_by_label('Overall discount type',exact=True).select_option('PERCENTAGE');page.get_by_label('Overall discount',exact=True).fill('10');page.get_by_label('GST mode',exact=True).select_option('GST_EXTRA');page.get_by_label('GST percentage',exact=True).fill('18');page.get_by_label('Terms and conditions',exact=True).fill('Work starts after agreed advance.');expect(page.locator('.qp-review')).to_contain_text('₹1,168.20');capture('review')
                page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));page.wait_for_load_state('networkidle');quote_id=int(page.url.rsplit('/',1)[-1])
                def read_saved():
                    quote=Quotation.objects.get(pk=quote_id)
                    return {'id':quote.pk,'type':quote.quotation_type,'terms':quote.terms_conditions,'total':str(quote.grand_total),'lines':list(quote.items.order_by('id').values('id','description','quantity','rate','coats','unit_id','custom_unit','paint_brand_id','calculation_method')),'rooms':list(quote.rooms.values_list('name',flat=True))}
                saved=db_read(read_saved);self.assertEqual(saved['type'],'MANUAL_LUMPSUM');self.assertEqual(saved['total'],'1168.20');self.assertEqual(saved['terms'],'Work starts after agreed advance.');self.assertEqual(saved['lines'][0]['unit_id'],self.unit.pk);self.assertEqual(saved['lines'][1]['custom_unit'],'Box');self.assertEqual(saved['lines'][0]['calculation_method'],'MANUAL');self.assertIn('Kitchen',saved['rooms'])
                page.get_by_role('link',name='Edit Draft').click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Open work item 1',exact=True).click();popup=page.get_by_role('dialog',name='Work item 1',exact=True);popup.get_by_role('button',name='Edit work item 1',exact=True).click();editor=page.get_by_role('dialog',name='Edit Item',exact=True);expect(editor.get_by_label('Quantity',exact=True)).to_have_value('2.00');expect(editor.get_by_label('Rate (₹)',exact=True)).to_have_value('500.00');expect(editor.get_by_label('MOU',exact=True)).to_have_value(str(self.unit.pk));expect(editor.get_by_placeholder('Search room / area',exact=True)).to_have_value('Bedroom 1');editor.get_by_label('Rate (₹)',exact=True).fill('450');editor.get_by_role('button',name='Save Item',exact=True).click();expect(page.locator('.lsq-subtotal')).to_contain_text('₹1,000.00')
                page.get_by_role('button',name='Continue',exact=True).click();expect(page.get_by_label('Terms and conditions',exact=True)).to_have_value(saved['terms']);expect(page.locator('.qp-review')).to_contain_text('₹1,062.00');page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));page.wait_for_load_state('networkidle');edited=db_read(read_saved);self.assertEqual(edited['total'],'1062.00');self.assertEqual([line['id'] for line in edited['lines']],[line['id'] for line in saved['lines']]);self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                self.assertEqual(result['errors'],[]);self.assertEqual(result['api_failures'],[])
                result['checks']=['Existing CRM/property and master IDs used','Two MANUAL items in MANUAL_LUMPSUM quotation; quantity × rate preserved','Master MOU and custom Box persisted','Add Room used existing property API','Terms, brand, coats, quantities, rates, room links and Draft IDs restored','Create and atomic Draft update returned matching authoritative totals','No quotation created before explicit Save Draft']
            except Exception as error:
                result['failure']=str(error);result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
            finally:
                (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');context.unroute_all(behavior='ignoreErrors');context.close();browser.close()
