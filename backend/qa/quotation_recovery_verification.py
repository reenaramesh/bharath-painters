"""Opt-in refresh recovery verification, isolated test database only."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from qa.paint_areas_verification import PaintAreas
from qa.quotation_unified_verification import db_read
from quotations.models import Quotation
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT = Path(__file__).resolve().parents[2] / 'docs/previews/quotation-recovery'

class RecoveryBrowser(PaintAreas):
    test_paint_area_selection_and_master_save = None
    test_customer_dashboard_mobile_shortcut_scroll = None

    def test_refresh_recovery(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {'steps': [], 'screenshots': [], 'errors': [], 'writes': []}
        fault = {'save': False, 'measurements': False}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            def route_api(route):
                parsed = urlsplit(route.request.url)
                if route.request.method != 'GET' and '/quotations/' in parsed.path:
                    result['writes'].append(parsed.path)
                if fault['measurements'] and re.search(r'/properties/\d+/(measurement-records|rooms|measurements)/$',parsed.path):
                    route.fulfill(status=503,json={'detail':'QA source temporarily unavailable'})
                    return
                if fault['save'] and parsed.path.endswith('/draft/'):
                    fault['save'] = False
                    route.fulfill(status=400, json={'detail': 'QA rejected save; recover inputs'})
                    return
                try:
                    response = context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1') + parsed.path + ('?' + parsed.query if parsed.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                    route.fulfill(response=response)
                except Exception as error:
                    reason = str(error).split('Call log:',1)[0].splitlines()[0]
                    if route.request.method=='GET' and any(word in reason.lower() for word in ('already handled','closed','disposed')):
                        return
                    result['errors'].append({'path':parsed.path,'reason':reason})
                    try: route.fulfill(status=503,json={'detail':'Isolated QA route unavailable'})
                    except Exception: pass
            context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
            page = context.new_page()
            page.on('pageerror', lambda error: result['errors'].append(str(error)))
            def refresh():
                page.once('dialog', lambda dialog: dialog.accept())
                page.reload(wait_until='networkidle')
                page.get_by_role('status').filter(has_text='Unsaved inputs restored').wait_for()
            def reopen(url):
                nonlocal page
                page.once('dialog',lambda dialog:dialog.accept())
                with page.expect_event('close'):
                    page.close(run_before_unload=True)
                page=context.new_page()
                page.on('pageerror',lambda error:result['errors'].append(str(error)))
                page.goto(url)
                page.wait_for_load_state('networkidle')
                page.get_by_role('status').filter(has_text='Unsaved inputs restored').wait_for()
            def capture(state):
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                    file = f'{state}-{width}.png'
                    page.screenshot(path=str(OUT/file), full_page=True, animations='disabled')
                    result['screenshots'].append(file)
                page.set_viewport_size({'width':1440,'height':1000})
            try:
                page.goto('http://localhost:5173/login')
                page.wait_for_load_state('networkidle')
                page.locator('input[type="text"]').first.fill(self.contractor.mobile)
                page.locator('input[type="password"]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click()
                page.wait_for_url('**/dashboard')
                page.goto(f'http://localhost:5173/quotations/new-measured?customer={self.customer.pk}&property={self.property.pk}&measurement={self.measurement.pk}')
                page.wait_for_load_state('networkidle')
                page.wait_for_function('(id)=>document.querySelector("#quotation-area-calculation")?.value===id',arg=str(self.measurement.pk))
                page.wait_for_load_state('networkidle')
                self.assertEqual(page.locator('#quotation-area-calculation').input_value(),str(self.measurement.pk))
                page.get_by_label('Valid until',exact=True).fill('2100-01-01')
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Create Paint Areas',exact=True).click()
                dialog = page.get_by_role('dialog')
                self.assertFalse(dialog.get_by_label('Select Walls',exact=True).is_checked())
                self.assertFalse(dialog.get_by_label('Select Ceiling',exact=True).is_checked())
                capture('new-area-no-default-surface')
                refresh()
                dialog=page.get_by_role('dialog')
                self.assertFalse(dialog.get_by_label('Select Walls',exact=True).is_checked())
                dialog.get_by_label('Select Walls',exact=True).check()
                dialog.get_by_role('button',name='Select all',exact=True).click()
                dialog.get_by_role('button',name='Continue',exact=True).click()
                dialog.get_by_label('Area Name',exact=True).fill('Recovered paint area')
                dialog.get_by_label('Product',exact=True).select_option(str(self.product.pk))
                dialog.get_by_label('Assignment rate',exact=True).fill('17')
                dialog.get_by_label('Description',exact=True).fill('Recover unfinished material specifications')
                refresh()
                dialog = page.get_by_role('dialog')
                self.assertEqual(dialog.get_by_label('Area Name',exact=True).input_value(),'Recovered paint area')
                self.assertEqual(dialog.get_by_label('Assignment rate',exact=True).input_value(),'17')
                self.assertEqual(dialog.get_by_label('Description',exact=True).input_value(),'Recover unfinished material specifications')
                page.locator('.gq-dialog-backdrop').click(position={'x':3,'y':3})
                self.assertEqual(dialog.get_by_label('Area Name',exact=True).input_value(),'Recovered paint area')
                page.once('dialog',lambda prompt:prompt.dismiss())
                dialog.get_by_role('button',name='Close popup',exact=True).click()
                self.assertEqual(dialog.get_by_label('Assignment rate',exact=True).input_value(),'17')
                page.once('dialog',lambda prompt:prompt.dismiss())
                page.keyboard.press('Escape')
                self.assertEqual(dialog.get_by_label('Description',exact=True).input_value(),'Recover unfinished material specifications')
                page.once('dialog',lambda prompt:prompt.dismiss())
                dialog.get_by_role('button',name='Cancel',exact=True).click()
                self.assertEqual(dialog.get_by_label('Product',exact=True).input_value(),str(self.product.pk))
                result['steps'].append('Outside click keeps unfinished Paint Areas open; Close, Escape and Cancel prompt before discard; cancelling each prompt preserves name, rate, product and description')
                capture('recovered-open-paint-area')
                dialog.get_by_role('button',name='Save Paint Areas',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_label('Discount mode',exact=True).select_option('LINE')
                page.get_by_label('Line 1 discount type',exact=True).select_option('PERCENTAGE')
                page.get_by_label('Line 1 discount',exact=True).fill('12')
                page.get_by_label('Notes',exact=True).fill('Unsaved refresh notes')
                page.get_by_label('Terms and conditions',exact=True).fill('Unsaved terms')
                page.get_by_label('GST percentage',exact=True).fill('5')
                refresh()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'12')
                self.assertEqual(page.get_by_label('Line 1 discount type',exact=True).input_value(),'PERCENTAGE')
                self.assertIn('Recovered paint area',page.locator('body').inner_text())
                self.assertEqual(page.get_by_label('Notes',exact=True).input_value(),'Unsaved refresh notes')
                self.assertEqual(page.get_by_label('Terms and conditions',exact=True).input_value(),'Unsaved terms')
                self.assertEqual(page.get_by_label('GST percentage',exact=True).input_value(),'5')
                self.assertEqual(result['writes'],[])
                self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                capture('recovered-create-pricing')
                result['steps'].append('Create survives repeated refresh: unfinished Paint Areas dialog, room selection, description, product, rate, percentage discount and current stage; no API save')
                fault['measurements']=True
                refresh()
                page.get_by_role('alert').filter(has_text='Your recovered inputs are retained').wait_for()
                self.assertEqual(page.get_by_label('Line 1 rate',exact=True).input_value(),'17')
                self.assertEqual(page.get_by_label('Line 1 quantity',exact=True).input_value(),'670')
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'12')
                self.assertEqual(page.get_by_label('Notes',exact=True).input_value(),'Unsaved refresh notes')
                self.assertEqual(result['writes'],[])
                capture('create-recovery-source-api-failed')
                fault['measurements']=False
                refresh()
                self.assertEqual(page.get_by_label('Line 1 rate',exact=True).input_value(),'17')
                result['steps'].append('Create from a saved-measurement link has no default surface; persistent source API failures after refresh retain quantities, groups, pricing, discounts and notes; next refresh recovers normally')
                reopen('http://localhost:5173/quotations/new')
                self.assertEqual(page.get_by_label('Line 1 rate',exact=True).input_value(),'17')
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'12')
                self.assertEqual(page.get_by_label('Notes',exact=True).input_value(),'Unsaved refresh notes')
                self.assertEqual(page.evaluate('sessionStorage.length'),0)
                self.assertEqual(result['writes'],[])
                capture('reopened-create-without-source-query')
                result['steps'].append('Close measured Create tab and reopen plain New Quotation: source selections, groups, pricing, discounts, notes and stage restored from persistent account-scoped recovery; new tab has empty sessionStorage and no quotation was created')
                page.once('dialog',lambda dialog:dialog.accept())
                page.goto(f'http://localhost:5173/quotations/{self.quote_id}/edit')
                page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Create Paint Areas',exact=True).click()
                dialog=page.get_by_role('dialog')
                self.assertFalse(dialog.get_by_label('Select Walls',exact=True).is_checked())
                dialog.get_by_role('button',name='Cancel',exact=True).click()
                page.locator('.gq-assignment-card').filter(has=page.get_by_role('heading',name='Normal Walls',exact=True)).get_by_role('button',name='Edit',exact=True).click()
                dialog=page.get_by_role('dialog')
                self.assertTrue(dialog.get_by_label('Select Walls',exact=True).is_checked(),'Previously saved selection is preserved')
                dialog.get_by_label('Select Walls',exact=True).uncheck()
                refresh()
                dialog=page.get_by_role('dialog')
                self.assertFalse(dialog.get_by_label('Select Walls',exact=True).is_checked(),'Explicit deselection survives refresh')
                page.once('dialog',lambda prompt:prompt.accept())
                dialog.get_by_role('button',name='Cancel',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_label('Discount mode',exact=True).select_option('LINE')
                page.get_by_label('Line 1 discount type',exact=True).select_option('FIXED')
                page.get_by_label('Line 1 discount',exact=True).fill('33')
                refresh()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33')
                self.assertEqual(page.get_by_label('Line 1 discount type',exact=True).input_value(),'FIXED')
                reopen(f'http://localhost:5173/quotations/{self.quote_id}/edit?view=pricing')
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33')
                capture('reopened-edit-draft')
                result['steps'].append('Close Edit tab and reopen the same Draft with a different presentation query: fixed discount and pricing stage retained, same saved identifiers')
                fault['measurements']=True
                refresh()
                page.get_by_role('alert').filter(has_text='Saved Draft measurements could not be loaded').wait_for()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33')
                self.assertEqual(page.get_by_label('Line 1 quantity',exact=True).input_value(),'345.00')
                capture('edit-recovery-source-api-failed')
                fault['measurements']=False
                refresh()
                fault['save']=True
                page.get_by_role('button',name='Save draft',exact=True).click()
                page.get_by_role('alert').filter(has_text='QA rejected save').wait_for()
                refresh()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33')
                capture('recovered-edit-after-failed-save')
                page.get_by_role('button',name='Save draft',exact=True).click()
                page.wait_for_url(f'**/quotations/{self.quote_id}')
                key = f'bp-quotation-recovery:v1:{self.contractor.pk}:/quotations/{self.quote_id}/edit:'
                self.assertIsNone(page.evaluate('(key)=>localStorage.getItem(key)',key))
                quote = db_read(lambda:Quotation.objects.get(pk=self.quote_id))
                self.assertEqual(str(db_read(lambda:quote.items.order_by('id').first().discount_value)),'33.00')
                page.goto(f'http://localhost:5173/quotations/{self.quote_id}/edit')
                page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33.00')
                self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                result['steps'].append('Edit fixed discount survives refresh and failed save; explicit save clears recovery and reopens server values without duplicate quotations')
                page.get_by_label('Line 1 discount',exact=True).fill('44')
                def change_saved_draft():
                    saved=Quotation.objects.get(pk=self.quote_id)
                    saved.notes='Newer server Draft'
                    saved.save()
                db_read(change_saved_draft)
                page.once('dialog',lambda dialog:dialog.accept())
                page.reload(wait_until='networkidle')
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33.00')
                self.assertEqual(page.get_by_label('Notes',exact=True).input_value(),'Newer server Draft')
                result['steps'].append('Newer server Draft rejects stale recovery instead of overwriting newer values')
                page.get_by_label('Line 1 discount',exact=True).fill('45')
                page.once('dialog',lambda dialog:dialog.dismiss())
                page.get_by_role('button',name='Discard unsaved inputs',exact=True).click()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'45')
                page.once('dialog',lambda dialog:dialog.accept())
                page.get_by_role('button',name='Discard unsaved inputs',exact=True).click()
                page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Continue',exact=True).click()
                page.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'33.00')
                result['steps'].append('Confirmed discard resets only unsaved input; cancelling discard retains input')
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error)
                result['body']=page.locator('body').inner_text()
                page.screenshot(path=str(OUT/'last-failure.png'),full_page=True)
                raise
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors')
                context.close()
                browser.close()

if __name__=='__main__':
    # Strict-mode hydration and a newly opened tab can burst more than ten reads.
    # Increase only the isolated QA server's accept queue, retaining error checks.
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.RecoveryBrowser']))
