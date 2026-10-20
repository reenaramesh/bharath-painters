import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
"""Native Chromium verification against an isolated Django test database."""
import json
import tempfile
import re
from pathlib import Path
from urllib.parse import urlsplit
from qa.work_order_margin_verification import MarginBrowser
from outsourcing.tests import make_contractor, connect
from outsourcing.models import SubcontractWorkOrder
from django.conf import settings
from django.db import connection
from accounts.models import ContractorProfile
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/work-order-single-window'


class WizardBrowser(MarginBrowser):
 def setUp(self):
  super().setUp()
  self.second.service_category=self.electrical;self.second.save()
  self.vendor2=make_contractor('9000000277');connect(self.main,self.vendor2)
  for actor in [self.main,self.receiving,self.vendor2]:
   ContractorProfile.objects.get_or_create(user=actor,defaults={'company_name':actor.get_full_name()})
  if connection.vendor=='sqlite':
   with connection.cursor() as cursor:cursor.execute('PRAGMA journal_mode=WAL')

 def test_workflow(self):
  OUT.mkdir(parents=True,exist_ok=True);results={'steps':[],'screenshots':[],'errors':[],'batch_saves':0,'created':[]}
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
   def route_api(route):
    parsed=urlsplit(route.request.url)
    if parsed.path.endswith('/allocation-drafts/') and route.request.method=='POST':results['batch_saves']+=1
    response=context.request.fetch(self.live_server_url+parsed.path+('?' + parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
    if response.status>=400:
     results.setdefault('http_failures',[]).append({'path':parsed.path,'status':response.status})
     (OUT/'api-error.html').write_text(response.text(),encoding='utf8')
    if parsed.path.endswith('/allocation-drafts/') and response.status==201:results['created']=response.json()['work_orders']
    route.fulfill(response=response)
   context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
   page=context.new_page();page.on('pageerror',lambda e:results['errors'].append(str(e)))
   def capture(stage):
    for width in [360,390,430,768,1440]:
     page.set_viewport_size({'width':width,'height':1000});page.evaluate('window.scrollTo(0,0)')
     self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
     dialog=page.get_by_role('dialog');dialog.evaluate('(node)=>node.scrollTop=0')
     if stage=='categories':dialog.get_by_role('heading',name='Select work categories and items',exact=True).scroll_into_view_if_needed()
     elif stage in ['margins','gst']:dialog.get_by_label('Margin mode',exact=True).first.scroll_into_view_if_needed()
     elif stage=='review':dialog.evaluate('(node)=>node.scrollTop=node.scrollHeight')
     self.assertLessEqual(dialog.evaluate('(node)=>node.scrollWidth'),dialog.evaluate('(node)=>node.clientWidth'))
     path=f'{stage}-{width}.png';page.screenshot(path=str(OUT/path),animations='disabled');results['screenshots'].append(path)
   try:
    page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle');page.locator('input[type=text]').first.fill(self.main.mobile);page.locator('input[type=password]').fill('Pass123!');page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
    page.goto(f'http://localhost:5173/subcontract-work-orders?quotation={self.quotation.pk}');page.wait_for_load_state('networkidle')
    dialog=page.get_by_role('dialog')
    self.assertEqual(dialog.get_by_role('button',name='Continue',exact=True).count(),0)
    self.assertEqual(dialog.get_by_role('button',name='Back',exact=True).count(),0)
    dialog.get_by_label('Search customer by name or mobile',exact=True).fill(self.customer.mobile[-4:]);self.assertEqual(dialog.get_by_label('Customer',exact=True).input_value(),str(self.customer.pk));capture('customer')
    self.assertEqual(dialog.get_by_label('Property',exact=True).input_value(),str(self.property.pk));capture('property')
    dialog.get_by_text('Accepted',exact=True).wait_for();capture('quotation')
    dialog.get_by_label('Vendor assignment',exact=True).select_option('MULTIPLE');dialog.get_by_label('Vendor 1',exact=True).select_option(str(self.receiving.pk));dialog.get_by_role('button',name='Add vendor',exact=True).click();dialog.get_by_label('Vendor 2',exact=True).select_option(str(self.vendor2.pk));capture('multiple-vendors')
    dialog.get_by_label('Assign Painting category',exact=True).select_option(str(self.receiving.pk));dialog.get_by_label('Assign Electrical category',exact=True).select_option(str(self.vendor2.pk))
    dialog.get_by_label('Assign QA walls',exact=True).select_option(str(self.vendor2.pk));dialog.get_by_label('Assign QA walls',exact=True).select_option(str(self.receiving.pk));dialog.get_by_text('0 available items remain unassigned.',exact=True).wait_for();capture('categories')
    dialog.get_by_label('Margin 1 value',exact=True).nth(0).fill('15');dialog.get_by_label('Margin 1 type',exact=True).nth(1).select_option('FIXED');dialog.get_by_label('Margin 1 value',exact=True).nth(1).fill('10');dialog.get_by_text('₹7,555.52',exact=True).first.wait_for();dialog.get_by_text('₹79.99',exact=True).first.wait_for();capture('margins')
    dialog.get_by_label('Assign QA walls',exact=True).wait_for();self.assertEqual(dialog.get_by_label('Margin 1 value',exact=True).nth(0).input_value(),'15')
    self.assertEqual(dialog.get_by_label('GST treatment',exact=True).nth(0).input_value(),'NO_GST');dialog.get_by_label('GST treatment',exact=True).nth(0).select_option('GST_EXTRA');dialog.get_by_label('GST percentage',exact=True).nth(0).fill('18');dialog.get_by_label('GST treatment',exact=True).nth(1).select_option('GST_INCLUDED');dialog.get_by_label('GST percentage',exact=True).nth(1).fill('5');capture('gst')
    dialog.get_by_text('₹8,915.51',exact=True).first.wait_for();dialog.get_by_text(re.compile(r'Subtotal.*79\.99.*GST.*3\.81')).wait_for();capture('review');self.assertEqual(results['batch_saves'],0)
    dialog.get_by_role('button',name='Save Work Order Drafts',exact=True).click();dialog.get_by_text('2 independent Work Order Drafts saved. Nothing has been issued or shared.',exact=True).wait_for();capture('saved-drafts');self.assertEqual(results['batch_saves'],1)
    orders=results.pop('created');self.assertEqual(len(orders),2);self.assertEqual([row['status'] for row in orders],['DRAFT','DRAFT']);self.assertEqual([row['agreed_amount'] for row in orders],['8915.51','79.99'])
    self.assertEqual({row['scopes'][0]['source_quotation_item'] for row in orders},{self.line.pk,self.second.pk})
    page.goto(f"http://localhost:5173/subcontract-work-orders/{orders[0]['id']}");page.get_by_role('button',name='Edit Draft',exact=True).click();self.assertEqual(page.get_by_label('GST treatment',exact=True).input_value(),'GST_EXTRA');self.assertEqual(page.get_by_label('Margin 1 value',exact=True).input_value(),'15.00');self.assertEqual(page.get_by_label('Margin 2 value',exact=True).count(),0)
    results['steps']=['customer mobile search','property and approved revision dependencies','multiple connected vendors','master categories and exclusive item reassignment','Single window preserves margins and allocations','explicit exclusive/inclusive GST','Changing selections makes no writes','one atomic save creates two independent Drafts','allocated Draft restores margin and GST']
   except Exception as exc:
    results['blocker']=str(exc);results['body']=page.locator('body').inner_text();page.screenshot(path=str(OUT/'blocker.png'),full_page=True)
   finally:
    (OUT/'results.json').write_text(json.dumps(results,indent=2,default=str),encoding='utf8');context.unroute_all(behavior='wait');browser.close()
  self.assertFalse(results.get('blocker'),results.get('blocker'));self.assertFalse(results['errors'],results['errors'])


if __name__=='__main__':
 settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
 settings.STORAGES={'default':{'BACKEND':'django.core.files.storage.FileSystemStorage'},'staticfiles':{'BACKEND':'django.contrib.staticfiles.storage.StaticFilesStorage'}}
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 with tempfile.TemporaryDirectory(prefix='workorder-browser-qa-') as folder:
  settings.DATABASES['default'].setdefault('TEST',{})['NAME']=str(Path(folder)/'audit.sqlite3')
  settings.MEDIA_ROOT=str(Path(folder)/'media')
  raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.WizardBrowser']))
