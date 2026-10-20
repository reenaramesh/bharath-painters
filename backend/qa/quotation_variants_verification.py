"""Manual creation, legacy/mixed restoration and failed submission retry, isolated DB."""
import json
import re
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
from qa.quotation_unified_verification import BrowserAudit, db_read, grouped_fixture
from quotations.models import Quotation
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/quotation-unified-variants'

class Variants(BrowserAudit):
 test_browser_workflow=None

 def setUp(self):
  super().setUp();self.product.default_price=999;self.product.save(update_fields=['default_price'])

 def browser_test(self, scenario, run):
  OUT.mkdir(parents=True,exist_ok=True);result={'steps':[],'errors':[],'creates':0,'patches':0,'screenshots':[]};fault={'submit':False}
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
   def route_api(route):
    parsed=urlsplit(route.request.url)
    if parsed.path.endswith('/create/') and '/quotations/' in parsed.path:result['creates']+=1
    if parsed.path.endswith('/draft/'):result['patches']+=1
    if parsed.path.endswith('/submit/') and fault['submit']:
     fault['submit']=False;route.fulfill(status=503,json={'detail':'QA submission unavailable'});return
    response=context.request.fetch(self.live_server_url+parsed.path+('?' + parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
    if parsed.path.endswith('/preview-pdf/') and response.status==200:
     self.latest_preview_pdf=response.body()
    try:
     route.fulfill(response=response)
    except Exception as error:
     # Navigation/reload can cancel an old intercepted GET before forwarding ends.
     if route.request.method=='GET' and ('already handled' in str(error) or 'closed' in str(error)):
      result.setdefault('cancelled_gets',[]).append(parsed.path)
     else:
      raise
   context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
   page=context.new_page();page.on('pageerror',lambda error:result['errors'].append(str(error)))
   def capture(stage):
    for width in [360,390,430,768,1440]:
     page.set_viewport_size({'width':width,'height':1000});page.evaluate('window.scrollTo(0,0)')
     self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
     file=f'{stage}-{width}.png';page.screenshot(path=str(OUT/file),full_page=True,animations='disabled');result['screenshots'].append(file)
    page.set_viewport_size({'width':1440,'height':1000})
   def final_stage():
    page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
    page.get_by_role('heading',name='Editable Pricing',exact=True).wait_for()
   def manual_create():
    page.goto(f'http://localhost:5173/quotations/new-manual?customer={self.customer.pk}&property={self.property.pk}');page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Add services',exact=True).click()
    sheet=page.get_by_role('dialog',name='Edit quotation service and rate')
    sheet.get_by_placeholder('Select or type a service',exact=True).fill('Painting');sheet.get_by_role('button',name='Painting',exact=True).click()
    sheet.get_by_placeholder('Search room / area',exact=True).click();sheet.get_by_role('button',name='Bedroom 1',exact=True).click()
    sheet.get_by_placeholder('Search Service / Product Type',exact=True).fill('Tractor');sheet.get_by_role('button',name='Tractor Emulsion',exact=True).click()
    sheet.locator('label').filter(has_text=re.compile('^Description')).locator('input').fill('QA manual scope')
    sheet.get_by_label('Quantity',exact=True).fill('2.5');sheet.locator('label').filter(has_text=re.compile('^MOU')).locator('select').select_option(str(self.unit.pk))
    sheet.get_by_label('Rate',exact=True).fill('100.01');sheet.get_by_role('button',name='Update line',exact=True).click()
    page.get_by_role('button',name='Continue',exact=True).click();page.get_by_label('Discount mode',exact=True).select_option('LINE')
    page.get_by_label('Line 1 discount type',exact=True).select_option('PERCENTAGE');page.get_by_label('Line 1 discount',exact=True).fill('10')
    page.get_by_label('GST mode',exact=True).select_option('GST_INCLUDED');page.get_by_label('GST percentage',exact=True).fill('18')
   try:
    page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.contractor.mobile);page.locator('input[type=password]').fill('test-pass');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
    run(page,result,fault,capture,final_stage,manual_create)
   except Exception as error:
    result['blocker']=str(error);result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/f'{scenario}-blocker.png'),full_page=True)
   finally:
    (OUT/f'{scenario}-results.json').write_text(json.dumps(result,indent=2),encoding='utf8');context.unroute_all(behavior='ignoreErrors');browser.close()
  self.assertFalse(result.get('blocker'),result.get('blocker'));self.assertFalse(result['errors'],result['errors'])

 def test_manual_and_saved_variants(self):
  def run(page,result,fault,capture,final_stage,manual_create):
   manual_create();capture('manual-create-pricing');labels=page.locator('.qp-item input,.qp-item select').evaluate_all("els=>els.map(el=>el.getAttribute('aria-label'))")
   page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'));quote_id=int(page.url.rsplit('/',1)[1]);page.get_by_role('link',name='Edit Draft',exact=False).click();final_stage()
   self.assertEqual(page.get_by_label('Line 1 rate',exact=True).input_value(),'100.01');self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'10.00');self.assertEqual(page.get_by_label('GST mode',exact=True).input_value(),'GST_INCLUDED')
   self.assertEqual(page.locator('.qp-item input,.qp-item select').evaluate_all("els=>els.map(el=>el.getAttribute('aria-label'))"),labels);capture('manual-edit-pricing')
   page.get_by_role('button',name='Edit specifications',exact=True).click();sheet=page.get_by_role('dialog',name='Edit quotation service and rate')
   sheet.get_by_placeholder('Search Service / Product Type',exact=True).fill('Tractor');sheet.get_by_role('button',name='Tractor Emulsion',exact=True).click();self.assertEqual(sheet.get_by_label('Rate',exact=True).input_value(),'100.01');sheet.get_by_role('button',name='Update line',exact=True).click()
   page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'))
   result['steps'].append('Manual Create -> Save -> Edit: identical fields and restored quantity/rate/line discount/inclusive GST')
   def variants():
    self.client.force_authenticate(self.contractor)
    basic={'customer':self.customer.pk,'property':self.property.pk,'notes':'Saved notes','terms_conditions':'Saved terms','show_product_key_features':False,'discount_mode':'LINE','discount_type':'FIXED','discount_value':0,'gst_mode':'GST_EXTRA','gst_percentage':5,'rooms':[{'property_room':self.room.pk,'name':self.room.name,'length':0,'width':0,'height':0}]}
    line={'description':'Saved repair','room_index':0,'service_category':self.category.pk,'paint_type':self.product.pk,'quantity':'2','rate':'123.45','unit':None,'custom_unit':'Job','coats':3,'discount_type':'FIXED','discount_value':'5','calculation_method':'MANUAL','specification_details':{'finish':'Saved satin'}}
    cases=[]
    for name,kind,items in [('lump-sum','MANUAL_LUMPSUM',[{**line,'calculation_method':'LUMPSUM','quantity':1}]),('legacy','MEASUREMENT',[line]),('mixed','MEASUREMENT',[grouped_fixture.GroupedSpecificationTests.item(self,'group',self.walls,[120,115,110,125],'Saved walls'),line])]:
     payload={**basic,'quotation_type':kind,'measurement_record':self.measurement.pk if kind=='MEASUREMENT' else None,'items':items};response=self.client.post('/api/quotations/create/',payload,format='json');self.assertEqual(response.status_code,201,response.data);cases.append((name,response.data))
    return cases
   cases=db_read(variants)
   for name,quote in cases:
    page.goto(f"http://localhost:5173/quotations/{quote['id']}/edit");final_stage();capture(f'{name}-edit-pricing')
    self.assertEqual(page.get_by_label('Notes',exact=True).input_value(),'Saved notes');self.assertFalse(page.get_by_label('Show product key features',exact=True).is_checked())
    self.assertEqual(page.get_by_label(f"Line {len(quote['items'])} discount",exact=True).input_value(),'5.00')
    count_before=db_read(lambda:Quotation.objects.count())
    page.get_by_role('button',name='Preview quotation',exact=True).click();preview=page.get_by_role('dialog',name='Quotation preview',exact=True)
    self.latest_preview_pdf=None
    with page.expect_response(re.compile(r'/quotations/preview-pdf/')) as response:
     preview.get_by_role('button',name='View PDF',exact=True).click()
    self.assertEqual(response.value.status,200)
    import pymupdf
    pdf=self.latest_preview_pdf;self.assertIsNotNone(pdf);(OUT/f'{name}-unsaved-preview.pdf').write_bytes(pdf)
    with pymupdf.open(stream=pdf,filetype='pdf') as document:
     self.assertIn(format(Decimal(quote['grand_total']),',.2f'),' '.join(sheet.get_text() for sheet in document))
    page.get_by_role('button',name='Close PDF preview',exact=True).click();preview.get_by_role('button',name='Back to edit',exact=True).click()
    self.assertEqual(db_read(lambda:Quotation.objects.count()),count_before)
    page.get_by_role('button',name='Save draft',exact=True).click();page.wait_for_url(re.compile(r'/quotations/\d+$'))
    def saved_values():
     self.client.force_authenticate(self.contractor);return self.client.get(f"/api/quotations/{quote['id']}/").data
    after=db_read(saved_values)
    for original,current in zip(quote['items'],after['items']):
     for key in ['id','quantity','rate','unit','custom_unit','coats','discount_type','discount_value','specification_details']:self.assertEqual(current[key],original[key],f'{name}: {key}')
    self.assertEqual(after['grand_total'],quote['grand_total']);self.assertEqual(after['rooms'],quote['rooms'])
    result['steps'].append(f'{name}: unchanged save preserves IDs, snapshots, custom unit, discounts and total')
  self.browser_test('variants',run)

 def test_create_submit_failure_retry(self):
  def run(page,result,fault,capture,final_stage,manual_create):
   manual_create();fault['submit']=True;page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Save & Send',exact=True).click()
   page.get_by_role('status').filter(has_text='Draft saved. Sending could not be confirmed.').wait_for();self.assertEqual(result['creates'],1)
   self.assertEqual(db_read(lambda:Quotation.objects.count()),1);saved_id=db_read(lambda:Quotation.objects.get().pk);self.assertEqual(db_read(lambda:Quotation.objects.get().status),'DRAFT')
   page.wait_for_url(f'**/quotations/{saved_id}/edit');self.assertTrue(page.url.endswith(f'/quotations/{saved_id}/edit'));page.wait_for_load_state('networkidle');page.reload();page.get_by_role('status').filter(has_text='Draft saved. Sending could not be confirmed.').wait_for();self.assertEqual(result['creates'],1)
   capture('submit-failure');page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Save & Send',exact=True).click();page.wait_for_url(f'**/quotations/{saved_id}')
   page.get_by_role('heading',name='Final quotation submitted',exact=True).wait_for();self.assertEqual(result['creates'],1);self.assertEqual(result['patches'],1);self.assertEqual(db_read(lambda:Quotation.objects.count()),1);self.assertEqual(db_read(lambda:Quotation.objects.get().status),'SENT')
   result['steps'].append('Create Save & Send failure preserves Draft; retry PATCHes same ID and sends once without duplicate creation')
  self.browser_test('submit-retry',run)

if __name__=='__main__':
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.Variants']))
