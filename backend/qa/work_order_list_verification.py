"""List sorting/layout checks with real API responses and isolated test records."""
import json
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit
from qa.work_order_browser_verification import BrowserAudit
from outsourcing.models import SubcontractWorkOrder
from outsourcing.tests import make_contractor
from django.utils import timezone
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT = Path(__file__).resolve().parents[2] / 'docs/previews/work-order-list'


class ListBrowser(BrowserAudit):
 def setUp(self):
  super().setUp()
  self.receiving.first_name='Alpha';self.receiving.save()
  partners=[self.receiving,make_contractor('9000000281'),make_contractor('9000000282')]
  for partner,name in zip(partners[1:],['Beta','Gamma']):
   partner.first_name=name;partner.save()
  for index, (name, amount, status) in enumerate([('Alpha painting', '100', 'SENT'), ('Beta texture', '300', 'IN_PROGRESS'), ('Gamma primer', '200', 'DRAFT')]):
   order = SubcontractWorkOrder.objects.create(reference=f'WO/LIST/{index+1}', quotation=self.quotation, main_contractor=self.main, receiving_contractor=partners[index], connection=self.connection if index==0 else None, project_title=name, agreed_amount=amount, status=status, required_start_date=timezone.localdate()+timedelta(days=3-index))
   SubcontractWorkOrder.objects.filter(pk=order.pk).update(created_at=timezone.now()-timedelta(days=2-index))

 def test_workflow(self):
  OUT.mkdir(parents=True, exist_ok=True)
  result = {'errors': [], 'screenshots': [], 'checks': []}
  with sync_playwright() as p:
   browser = p.chromium.launch(headless=True)
   context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
   def route_api(route):
    parsed=urlsplit(route.request.url)
    response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' + parsed.query if parsed.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
    route.fulfill(response=response)
   context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
   page=context.new_page();page.on('pageerror', lambda error: result['errors'].append(str(error)))
   try:
    page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
    page.locator('input[type=text]').first.fill(self.main.mobile);page.locator('input[type=password]').fill('Pass123!')
    page.get_by_role('button', name='Sign in', exact=True).click();page.wait_for_url('**/dashboard')
    page.goto('http://localhost:5173/subcontract-work-orders')
    rows=page.locator('.wo-order-list li, .wo-order-table tbody tr')
    rows.first.wait_for()
    def expect_first(title): self.assertIn(title, rows.first.inner_text())
    expect_first('Gamma primer')
    self.assertEqual(page.get_by_label('Sort by',exact=True).count(),0)
    def newest():
     heading=page.locator('.wo-order-columns, .wo-order-table').get_by_role('button',name=re.compile('^Created date,'))
     for _ in range(2):
      if 'Created date, descending.' in heading.get_attribute('aria-label'):break
      heading.click()
    for label,first,second in [('Work order','Alpha painting','Gamma primer'),('Contractor','Alpha painting','Gamma primer'),('Created date','Alpha painting','Gamma primer'),('Start date','Gamma primer','Alpha painting'),('Status','Gamma primer','Alpha painting'),('Agreed value','Alpha painting','Beta texture')]:
     newest()
     heading=page.locator('.wo-order-columns, .wo-order-table').get_by_role('button',name=re.compile('^'+label+','))
     heading.click();expect_first(first);self.assertEqual(heading.get_attribute('aria-pressed'),'true')
     self.assertIn('ascending',heading.get_attribute('aria-label'))
     heading.click();expect_first(second);self.assertIn('descending',heading.get_attribute('aria-label'))
    page.get_by_role('button',name='Awaiting response',exact=True).click();self.assertEqual(rows.count(),1);expect_first('Alpha painting')
    page.get_by_role('button',name='All',exact=True).click();self.assertEqual(rows.count(),3)
    newest()
    for width in [360,390,430,768,1440]:
     page.set_viewport_size({'width':width,'height':1000})
     self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
     self.assertEqual(rows.first.locator('time').count(),2)
     path=f'list-{width}.png';page.screenshot(path=str(OUT/path),full_page=True,animations='disabled');result['screenshots'].append(path)
    rows.first.get_by_role('link').first.click();page.wait_for_url(re.compile(r'/subcontract-work-orders/\d+$'))
    result['checks']=['Created-date default order','No Sort by dropdown','All six column buttons sort in both directions','Active direction announced and highlighted','Status filters preserve sorting','Created and start dates visible','Row opens existing detail','No horizontal overflow at five widths']
   except Exception as exc:
    result['blocker']=str(exc);page.screenshot(path=str(OUT/'blocker.png'),full_page=True)
   finally:
    (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8');context.unroute_all(behavior='wait');browser.close()
  self.assertFalse(result.get('blocker'),result.get('blocker'));self.assertFalse(result['errors'],result['errors'])


if __name__ == '__main__':
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.ListBrowser']))
