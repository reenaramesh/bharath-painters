import os,sys,re,json
from pathlib import Path
from decimal import Decimal
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
os.environ['DATABASE_URL']='sqlite:///:memory:'
import django
django.setup()
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
from qa.work_order_browser_verification import BrowserAudit
from quotations.models import QuotationItem
OUT=Path(__file__).resolve().parents[2]/'docs/previews/work-order-margins'
class MarginBrowser(BrowserAudit):
 def setUp(self):
  super().setUp()
  from quotations.models import ContractorCustomerConnection
  ContractorCustomerConnection.objects.update_or_create(customer=self.customer,contractor=self.main,defaults={'status':'CONNECTED','requested_by':self.main})
  self.second=QuotationItem.objects.create(quotation=self.quotation,description='QA special texture',quantity=3,rate='33.33',amount='99.99',unit=self.sqft,service_category=self.painting,coats=3)
  self.quotation.discount_type='PERCENTAGE';self.quotation.discount_value=10;self.quotation.discount=Decimal('997.65');self.quotation.subtotal=Decimal('9976.49');self.quotation.grand_total=Decimal('8978.84');self.quotation.gst_mode='NO_GST';self.quotation.save()
  self.property.address='Secret residential address';self.property.city='Bengaluru';self.property.google_maps_url='https://maps.google.com/?q=12.345,77.678';self.property.save()
 def test_workflow(self):
  OUT.mkdir(parents=True,exist_ok=True);result={'trace':[],'steps':[],'screenshots':[],'errors':[],'creates':0,'saves':0}
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
   fault={'save':False}
   def route_api(route):
    parsed=urlsplit(route.request.url)
    if (parsed.path.endswith('/work-orders/') or parsed.path.endswith('/allocation-drafts/')) and route.request.method=='POST':result['creates']+=1
    if parsed.path.endswith('/draft-pricing/') and route.request.method=='PATCH':
     result['saves']+=1
     if fault['save']:
      fault['save']=False;route.fulfill(status=400,json={'detail':'QA save failure: retain margin edits'});return
    result['trace'].append({'path':parsed.path,'server':self.live_server_url,'alive':self.server_thread.is_alive()})
    try:
     response=context.request.fetch(self.live_server_url+parsed.path+('?' + parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
    except Exception as exc:
     result['network_failure']=str(exc).split('Call log:')[0]
     route.fulfill(status=503,json={'detail':'Isolated QA server unavailable'});return
    if parsed.path.endswith('/pdf/') and response.status==200:(OUT/'vendor-work-order.pdf').write_bytes(response.body())
    route.fulfill(response=response)
   context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
   page=context.new_page();page.on('pageerror',lambda e:result['errors'].append(str(e)))
   def login(user):
    page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(user.mobile);page.locator('input[type=password]').fill('Pass123!');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
   def capture(stage):
    for width in [360,390,430,768,1440]:
     page.set_viewport_size({'width':width,'height':1000})
     page.evaluate('window.scrollTo(0,0)')
     self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
     path=f'{stage}-{width}.png';page.screenshot(path=str(OUT/path),full_page=True,animations='disabled');result['screenshots'].append(path)
     if stage=='create-mixed-margins':
      dialog=page.get_by_role('dialog');dialog.evaluate('(node)=>node.scrollTop=node.scrollHeight')
      path=f'create-actions-{width}.png';page.screenshot(path=str(OUT/path),animations='disabled');result['screenshots'].append(path)
      self.assertTrue(dialog.get_by_role('button',name='Save Work Order Draft',exact=True).is_visible())
      dialog.evaluate('(node)=>node.scrollTop=0')
   try:
    login(self.main);page.goto(f'http://localhost:5173/subcontract-work-orders?quotation={self.quotation.pk}');page.wait_for_load_state('networkidle')
    dialog=page.get_by_role('dialog')
    dialog.get_by_label('Customer',exact=True).select_option(str(self.customer.pk));dialog.get_by_label('Property',exact=True).select_option(str(self.property.pk));dialog.get_by_label('Quotation revision',exact=True).select_option(str(self.quotation.pk))
    dialog.get_by_label('Vendor 1',exact=True).select_option(str(self.receiving.pk))
    dialog.get_by_label('Allocate QA walls',exact=True).check();dialog.get_by_label('Allocate QA special texture',exact=True).check()
    dialog.get_by_label('Margin 1 value',exact=True).fill('15');dialog.get_by_label('Margin 2 type',exact=True).select_option('FIXED');dialog.get_by_label('Margin 2 value',exact=True).fill('10')
    dialog.get_by_text('₹7,635.51',exact=True).first.wait_for();self.assertEqual(result['creates'],0)
    self.assertEqual(dialog.get_by_label('Margin 2 type',exact=True).locator('option:checked').inner_text(),'₹')
    self.assertEqual(dialog.get_by_label(re.compile('^(Agreed.*rate|Discount mode|Material responsibility)')).count(),0)
    capture('create-mixed-margins');dialog.get_by_text('₹7,635.51',exact=True).first.wait_for();dialog.get_by_role('button',name='Save Work Order Draft',exact=True).click();page.wait_for_url(re.compile(r'/subcontract-work-orders/\d+$'));url=page.url
    page.get_by_text('₹7,635.51',exact=True).first.wait_for();self.assertEqual(result['creates'],1);page.reload();page.get_by_role('button',name='Edit Draft',exact=True).click()
    self.assertEqual(page.get_by_label('Margin 1 value',exact=True).input_value(),'15.00');self.assertEqual(page.get_by_label('Margin 2 type',exact=True).input_value(),'FIXED')
    page.get_by_label('Margin mode',exact=True).select_option('OVERALL');page.get_by_label('Overall margin type',exact=True).select_option('PERCENTAGE');page.get_by_label('Overall margin value',exact=True).fill('10');page.get_by_text('₹8,080.96',exact=True).wait_for()
    page.get_by_label('Overall margin type',exact=True).select_option('FIXED');page.get_by_label('Overall margin value',exact=True).fill('100.01');page.get_by_text('₹8,878.83',exact=True).wait_for();self.assertEqual(result['saves'],0)
    capture('edit-overall-margin');fault['save']=True;page.get_by_role('button',name='Save Draft',exact=True).click();page.get_by_text('QA save failure: retain margin edits',exact=True).wait_for();self.assertEqual(page.get_by_label('Overall margin value',exact=True).input_value(),'100.01')
    page.get_by_role('button',name='Save Draft',exact=True).click();page.get_by_role('button',name='Edit Draft',exact=True).wait_for();page.reload();page.get_by_role('button',name='Edit Draft',exact=True).click();self.assertEqual(page.get_by_label('Overall margin value',exact=True).input_value(),'100.01')
    page.get_by_role('button',name='Save Draft',exact=True).click();page.get_by_role('button',name='Edit Draft',exact=True).wait_for();capture('saved-draft')
    page.get_by_role('button',name='Preview / PDF',exact=True).click();page.get_by_role('button',name='Close PDF preview',exact=True).wait_for()
    import pymupdf
    with pymupdf.open(OUT/'vendor-work-order.pdf') as document:
     text=' '.join(sheet.get_text() for sheet in document);self.assertIn('8,878.83',text);self.assertNotIn('987.65',text);self.assertNotIn('Secret residential address',text);document[0].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(OUT/'vendor-pdf-page-1.png')
    page.get_by_role('button',name='Close PDF preview',exact=True).click();page.get_by_role('button',name='Send to contractor',exact=True).click();page.get_by_role('button',name='Yes, send to contractor',exact=True).click();page.get_by_role('button',name='Share recipient link',exact=True).wait_for()
    context.grant_permissions(['clipboard-read','clipboard-write']);page.evaluate("Object.defineProperty(navigator,'share',{value:undefined,configurable:true})");page.get_by_role('button',name='Share recipient link',exact=True).click();page.get_by_text('Recipient link copied. Sign-in is required.',exact=True).wait_for();self.assertEqual(page.evaluate('navigator.clipboard.readText()'),url)
    context.clear_cookies();page.evaluate('localStorage.clear();sessionStorage.clear()');login(self.receiving);page.goto(url);page.get_by_role('button',name='Accept this work',exact=True).wait_for();self.assertEqual(page.get_by_role('button',name='Edit Draft',exact=True).count(),0);self.assertNotIn('987.65',page.locator('body').inner_text());self.assertNotIn('Secret residential address',page.locator('body').inner_text());capture('recipient-private-view')
    page.get_by_role('button',name='Accept this work',exact=True).click();page.get_by_role('button',name='Yes, accept this work',exact=True).click();page.get_by_text('Accepted',exact=True).first.wait_for()
    result['steps']=['full import; mixed line %/fixed margins; no implicit save','Draft save, reopen and restore choices','overall % and fixed; cent allocation matches payable','failed save retains edits; repeat save restores','PDF and recipient hide original prices, precise pin, address/contact','explicit issue, clipboard share and recipient acceptance']
   except Exception as e:
    result['blocker']=str(e);result['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'blocker.png'),full_page=True)
   finally:
    (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8');context.unroute_all(behavior='wait');browser.close()
  self.assertFalse(result.get('blocker'),result.get('blocker'));self.assertFalse(result['errors'],result['errors'])
if __name__=='__main__':
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.MarginBrowser']))
