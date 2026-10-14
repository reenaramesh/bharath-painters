"""Native Playwright Work Order verification with isolated synthetic records."""
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
os.environ['DATABASE_URL']='sqlite:///:memory:'
import django
django.setup()
from django.conf import settings
from django.test import LiveServerTestCase
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
from outsourcing.tests import OutsourcingTestBase
from quotations.models import QuotationItem

ARTIFACTS=Path(__file__).resolve().parents[2]/'docs/previews/work-order-pricing'

class BrowserAudit(LiveServerTestCase):
 def setUp(self):
  OutsourcingTestBase.setUp(self)
  self.quotation.status='ACCEPTED';self.quotation.save()
  self.line=QuotationItem.objects.create(quotation=self.quotation,description='QA walls',quantity=10,rate='987.65',amount='9876.50',unit=self.sqft,service_category=self.painting,coats=2)

 def test_workflow(self):
  ARTIFACTS.mkdir(parents=True,exist_ok=True)
  results={'steps':[],'screenshots':[],'page_errors':[],'database':'isolated test database'}
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True)
   context=browser.new_context(viewport={'width':1440,'height':1000})
   fault={'save':False}
   def route_api(route):
    parsed=urlsplit(route.request.url)
    if fault['save'] and parsed.path.endswith('/draft-pricing/'):
     fault['save']=False
     route.fulfill(status=400,content_type='application/json',body='{"detail":"QA save failure: keep these edits"}')
     return
    try:
     response=context.request.fetch(self.live_server_url+parsed.path+('?' + parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
     if parsed.path.endswith('/pdf/') and response.status==200:
      (ARTIFACTS/'agreed-work-order.pdf').write_bytes(response.body())
     route.fulfill(response=response)
    except Exception:
     route.fulfill(status=503,content_type='application/json',body='{"detail":"Isolated QA server unavailable"}')
   context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
   page=context.new_page();page.on('pageerror',lambda error:results['page_errors'].append(str(error)))
   def login(user):
    page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
    page.locator('input[type="text"]').first.fill(user.mobile)
    page.locator('input[type="password"]').fill('Pass123!')
    page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
   def capture(stage):
    for width in [360,390,430,768,1440]:
     page.set_viewport_size({'width':width,'height':1000})
     path=f'{stage}-{width}.png';page.screenshot(path=str(ARTIFACTS/path),full_page=True)
     scroll=page.evaluate('document.documentElement.scrollWidth');client=page.evaluate('document.documentElement.clientWidth')
     results['screenshots'].append({'file':path,'width':width,'scrollWidth':scroll,'clientWidth':client})
     self.assertEqual(scroll,client)
   try:
    login(self.main)
    page.goto(f'http://localhost:5173/subcontract-work-orders?quotation={self.quotation.pk}')
    dialog=page.get_by_role('dialog');dialog.locator('select[name=receiving_contractor]').select_option(str(self.receiving.pk))
    dialog.get_by_role('checkbox').first.check()
    dialog.get_by_label(re.compile('^Agreed')).fill('11.11')
    dialog.get_by_label('Discount mode',exact=True).select_option('LINE')
    dialog.get_by_label('Line 1 discount type').select_option('PERCENTAGE');dialog.get_by_label('Line 1 discount',exact=True).fill('10')
    capture('create-private-pricing')
    dialog.get_by_role('button',name='Save Work Order Draft',exact=True).click()
    page.wait_for_url(re.compile(r'/subcontract-work-orders/\d+$'))
    url=page.url;page.get_by_text('₹99.99',exact=True).first.wait_for()
    results['steps'].append('Approved source line, editable material rate 11.11, 10% line discount, Draft saved payable 99.99')
    page.reload();page.get_by_role('button',name='Edit Draft',exact=True).click()
    page.get_by_label('Material responsibility').select_option('WITHOUT_MATERIAL')
    self.assertEqual(page.get_by_label(re.compile('^Agreed')).input_value(),'')
    page.get_by_label('Labour pricing method').select_option('SELLING_PERCENT')
    page.get_by_label('Labour percentage (private)').fill('50')
    self.assertEqual(page.get_by_label(re.compile('^Agreed')).input_value(),'493.82')
    page.get_by_label('Labour pricing method').select_option('DIRECT')
    page.get_by_label(re.compile('^Agreed')).fill('12.34')
    page.get_by_label('Line 1 discount type').select_option('FIXED');page.get_by_label('Line 1 discount',exact=True).fill('5')
    page.get_by_label('Discount mode',exact=True).select_option('OVERALL')
    page.get_by_label('Overall discount type').select_option('PERCENTAGE');page.get_by_label('Overall discount',exact=True).fill('10')
    page.get_by_label('Overall discount type').select_option('FIXED');page.get_by_label('Overall discount',exact=True).fill('5')
    capture('edit-private-labour')
    fault['save']=True
    page.get_by_role('button',name='Save Draft',exact=True).click()
    page.get_by_text('QA save failure: keep these edits',exact=True).wait_for()
    self.assertEqual(page.get_by_label(re.compile('^Agreed')).input_value(),'12.34')
    results['steps'].append('Explicit 50% labour adjustment computed 493.82; line fixed and overall percentage controls exercised; failed save retained edited values')
    page.get_by_role('button',name='Save Draft',exact=True).click()
    page.get_by_text('₹118.40',exact=True).first.wait_for();page.reload()
    page.get_by_role('button',name='Edit Draft',exact=True).click()
    self.assertEqual(page.get_by_label('Material responsibility').input_value(),'WITHOUT_MATERIAL')
    self.assertEqual(page.get_by_label(re.compile('^Agreed')).input_value(),'12.34')
    self.assertEqual(page.get_by_label('Overall discount',exact=True).input_value(),'5.00')
    page.get_by_role('button',name='Save Draft',exact=True).click()
    page.get_by_role('button',name='Edit Draft',exact=True).wait_for()
    capture('saved-draft')
    results['steps'].append('Reopen → Without Material requires explicit labour → fixed overall discount → Save → Reopen restored values')
    # Fetch the exact authenticated public PDF via browser routing, never local saved records.
    # The UI exercises its existing authenticated preview implementation.
    page.get_by_role('button',name='Preview / PDF',exact=True).click()
    page.get_by_role('button',name='Close PDF preview',exact=True).wait_for()
    import pymupdf
    with pymupdf.open(ARTIFACTS/'agreed-work-order.pdf') as document:
     pdf_text=' '.join(''.join(sheet.get_text() for sheet in document).split())
     self.assertIn('118.40',pdf_text);self.assertNotIn('987.65',pdf_text)
     document[0].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(ARTIFACTS/'agreed-work-order-page-1.png')
    results['steps'].append('Authenticated PDF preview opened; extracted payable 118.40; original price absent; PDF rendered for inspection')
    page.goto(url);page.get_by_role('button',name='Send to contractor',exact=True).click()
    page.get_by_role('button',name='Yes, send to contractor',exact=True).click()
    page.get_by_role('button',name='Share recipient link').wait_for()
    context.grant_permissions(['clipboard-read','clipboard-write'])
    page.evaluate("Object.defineProperty(navigator,'share',{value:undefined,configurable:true})")
    page.get_by_role('button',name='Share recipient link').click()
    page.get_by_text('Recipient link copied. Sign-in is required.',exact=True).wait_for()
    self.assertEqual(page.evaluate('navigator.clipboard.readText()'),url)
    results['steps'].append('Explicit Send from saved Draft')
    context.clear_cookies();page.evaluate('localStorage.clear();sessionStorage.clear()');login(self.receiving)
    page.goto(url);page.get_by_text('₹118.40',exact=True).first.wait_for()
    body=page.locator('body').inner_text();self.assertNotIn('987.65',body);self.assertNotIn('Private customer reference',body)
    self.assertEqual(page.get_by_role('button',name='Edit Draft',exact=True).count(),0)
    capture('recipient-agreed-pricing')
    page.get_by_role('button',name='Accept this work',exact=True).click();page.get_by_role('button',name='Yes, accept this work',exact=True).click()
    page.get_by_role('button',name='Accept this work',exact=True).wait_for(state='hidden')
    results['steps'].append('Recipient only sees agreed labour value; no selling references or edit; accepted Work Order')
   except Exception as error:
    results['blocker']=str(error);results['body']=page.locator('body').inner_text();page.screenshot(path=str(ARTIFACTS/'blocker.png'),full_page=True)
   finally:
    (ARTIFACTS/'browser-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');context.unroute_all(behavior='wait');browser.close()
  self.assertFalse(results.get('blocker'),results.get('blocker'))
  self.assertFalse(results['page_errors'],results['page_errors'])

if __name__=='__main__':
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['qa.work_order_browser_verification']))
