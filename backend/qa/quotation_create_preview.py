"""Fresh Create Quotation captures; no production or quotation API writes."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from qa.lumpsum_work_items_verification import LumpSumWorkItems
from qa.quotation_unified_verification import db_read
from quotations.models import Quotation
from playwright.sync_api import expect, sync_playwright

OUT = Path(__file__).resolve().parents[2] / 'docs/previews/quotation-create-current'


class CreateQuotationPreview(LumpSumWorkItems):
    test_browser_workflow = None
    test_grouped_pricing_fields = None
    test_lumpsum_rows = None

    def test_fresh_create_preview(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {'page': 'http://localhost:5173/quotations/new', 'data': 'isolated temporary test records', 'screenshots': [], 'checks': [], 'errors': [], 'api_failures': [], 'writes': []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')

            def route_api(route):
                url = urlsplit(route.request.url)
                if route.request.method not in ['GET', 'HEAD'] and not url.path.endswith('/login/'):
                    result['writes'].append({'method': route.request.method, 'path': url.path})
                    route.fulfill(status=403, content_type='application/json', body='{"detail":"Preview must not persist data."}')
                    return
                response = context.request.fetch(self.live_server_url.replace('localhost', '127.0.0.1') + url.path + ('?' + url.query if url.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer, timeout=15000)
                if response.status >= 400:
                    result['api_failures'].append({'path': url.path, 'status': response.status})
                route.fulfill(response=response)

            context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
            page = context.new_page()
            page.on('pageerror', lambda error: result['errors'].append(str(error)))

            def resize(width):
                page.set_viewport_size({'width': width, 'height': 844 if width < 768 else 1000})

            def capture(stage):
                for width in [360, 390, 430, 768, 1440]:
                    resize(width)
                    page.evaluate('window.scrollTo(0,0)')
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                    name = f'{stage}-{width}.png'
                    page.screenshot(path=str(OUT / name), full_page=True, animations='disabled')
                    result['screenshots'].append(name)

            try:
                page.goto('http://localhost:5173/login')
                page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(self.contractor.mobile)
                page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button', name='Sign in', exact=True).click()
                page.wait_for_url('**/dashboard')
                page.goto(result['page'])
                page.wait_for_load_state('networkidle')
                expect(page.get_by_placeholder('Search name, mobile, email or city', exact=True)).to_have_value('')
                expect(page.locator('.bp-quotation-builder select').first).to_have_value('')
                capture('start')
                result['checks'].append('Fresh /quotations/new starts with no customer or property selected')

                page.get_by_role('button', name='Grouped Customer', exact=True).click()
                page.locator('.bp-quotation-builder select').first.select_option(str(self.property.pk))
                page.wait_for_load_state('networkidle')
                page.locator('#quotation-area-calculation').select_option(str(self.measurement.pk))
                expect(page.get_by_text('Measurement version 3', exact=True).first).to_be_visible()
                capture('measurements')
                page.get_by_role('button', name='Continue', exact=True).click()
                capture('workspace')

                page.get_by_role('button', name='Create Paint Areas', exact=True).click()
                dialog = page.get_by_role('dialog', name='Create Paint Areas', exact=True)
                expect(dialog.get_by_role('checkbox', name='Select Walls', exact=True)).not_to_be_checked()
                dialog.get_by_role('checkbox', name='Select Walls', exact=True).check()
                dialog.get_by_role('button', name='Select all', exact=True).click()
                dialog.get_by_role('button', name='Continue', exact=True).click()
                dialog.get_by_label('Area Name', exact=True).fill('Bedroom and living room walls')
                dialog.get_by_label('Service / Product Category', exact=True).select_option(str(self.category.pk))
                dialog.get_by_label('Brand', exact=True).select_option(str(self.brand.pk))
                dialog.get_by_label('Product', exact=True).select_option(str(self.product.pk))
                dialog.get_by_label('Primer Coats', exact=True).select_option('1')
                dialog.get_by_label('Paint Coats', exact=True).select_option('2')
                dialog.get_by_label('Description', exact=True).fill('Interior wall painting')
                dialog.locator('label').filter(has_text=re.compile(r'^Unit')).locator('select').select_option(str(self.unit.pk))
                dialog.get_by_label('Assignment rate', exact=True).fill('10')
                for width in [360, 390, 430, 768, 1440]:
                    resize(width)
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                    name = f'paint-area-popup-{width}.png'
                    page.screenshot(path=str(OUT / name), animations='disabled')
                    result['screenshots'].append(name)
                dialog.get_by_role('button', name='Save Paint Areas', exact=True).click()
                expect(dialog).not_to_be_visible()
                capture('grouped-scope')
                page.get_by_role('button', name='Continue', exact=True).click()
                expect(page.get_by_label('Line 1 quantity', exact=True)).to_have_attribute('readonly', '')
                expect(page.locator('.qp-item output').first).to_have_text('₹6,700.00')
                page.get_by_label('Discount mode', exact=True).select_option('BOTH')
                page.get_by_label('Line 1 discount type', exact=True).select_option('PERCENTAGE')
                page.get_by_label('Line 1 discount', exact=True).fill('10')
                page.get_by_label('Overall discount type', exact=True).select_option('PERCENTAGE')
                page.get_by_label('Overall discount', exact=True).fill('5')
                expect(page.locator('.qp-review')).to_contain_text('₹6,759.63')
                capture('pricing-review')
                result['checks'].append('Two rooms grouped into 670 sqft; original measurements retained; line 10% then overall 5%, GST 18%, total 6759.63 shown in read-only review')

                for width in [360, 390, 430]:
                    resize(width)
                    opener = page.get_by_role('button', name='Open work item 1', exact=True)
                    opener.click()
                    popup = page.get_by_role('dialog', name='Work item 1', exact=True)
                    expect(popup).to_contain_text('Tractor Emulsion')
                    expect(popup).to_contain_text('QA Brand')
                    expect(popup.locator('.qp-net output')).to_have_text('₹6,030.00')
                    self.assertTrue(popup.evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    name = f'mobile-popup-{width}.png'
                    page.screenshot(path=str(OUT / name), animations='disabled')
                    result['screenshots'].append(name)
                    popup.get_by_role('button', name='Done', exact=True).click()
                    expect(opener).to_be_focused()
                result['checks'].append('New Create route uses mobile popup controls at 360/390/430, with the same pricing and retained selection')
                self.assertEqual(result['writes'], [])
                self.assertEqual(db_read(lambda: Quotation.objects.count()), 0)
                self.assertEqual(result['errors'], [])
                self.assertEqual(result['api_failures'], [])
                result['checks'].append('Continue, group creation and popup closure performed no quotation, master-data or Draft API writes')
            except Exception as error:
                result['failure'] = str(error)
                result['body'] = page.locator('body').inner_text()
                page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
                raise
            finally:
                (OUT / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors')
                context.close()
                browser.close()
