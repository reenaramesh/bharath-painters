"""Read-only role/navigation sweep using synthetic, isolated accounts."""
import json
import re
import time
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/pre-push-role-audit'
MANIFEST=OUT.parent/'pre-push-routes.json'

class RoleAudit(ShortcutBrowser):
    test_role_shortcuts=None

    def test_visible_role_routes(self):
        raw=MANIFEST.read_bytes()
        routes=json.loads(raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig'))
        OUT.mkdir(parents=True,exist_ok=True)
        result=json.loads((OUT/'browser-results.json').read_text()) if (OUT/'browser-results.json').exists() else {'routes':[],'screenshots':[],'page_errors':[],'routing_errors':[],'writes':[]}
        failed=[row for row in result['routes'] if row.get('browser_failure')]
        if failed:
            result.setdefault('previous_failed_attempts',[]).extend(failed)
            result['routes']=[row for row in result['routes'] if not row.get('browser_failure')]
        completed={(row['role'],row['route']) for row in result['routes']}
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                for actor in [self.contractor,self.portal,self.painter]:
                    context=browser.new_context(viewport={'width':360,'height':1000},reduced_motion='reduce')
                    failures=[]
                    def route_api(route):
                        parsed=urlsplit(route.request.url)
                        if route.request.method not in ['GET','HEAD'] and not parsed.path.endswith('/login/'):
                            result['writes'].append({'role':actor.role,'method':route.request.method,'path':parsed.path})
                        try:
                            response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer,timeout=10000)
                            if response.status>=400 and not (response.status==404 and parsed.path.endswith('/my-in-house-employment/')):
                                failures.append({'path':parsed.path,'status':response.status,'detail':response.text()[:350]})
                            route.fulfill(response=response)
                        except Exception as error:
                            reason=str(error).split('Call log:',1)[0].splitlines()[0]
                            if any(word in reason.lower() for word in ['already handled','closed','disposed']):return
                            result['routing_errors'].append({'path':parsed.path,'reason':reason})
                            try:route.fulfill(status=503,json={'detail':'Isolated audit server unavailable'})
                            except Exception:pass
                    context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
                    page=context.new_page()
                    page.set_default_navigation_timeout(60000)
                    page.on('pageerror',lambda error:result['page_errors'].append({'role':actor.role,'url':page.url,'error':str(error)}))
                    try:
                        page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                        page.locator('input[type=text]').first.fill(actor.mobile);page.locator('input[type=password]').fill('test-pass')
                        page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/'+('customer-dashboard' if actor.role=='CUSTOMER' else 'dashboard'))
                        for entry in routes[actor.role]:
                            if (actor.role,entry['route']) in completed:continue
                            failures.clear()
                            item={'role':actor.role,**entry,'viewports':[]}
                            started=time.monotonic()
                            result['active_route']={'role':actor.role,'route':entry['route']}
                            (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                            try:
                                page.goto('http://localhost:5173'+entry['route'],wait_until='domcontentloaded',timeout=20000);page.wait_for_load_state('networkidle',timeout=15000)
                                item['final_url']=page.url
                                item['headings']=page.locator('h1,h2').all_text_contents()[:10]
                                item['http_failures']=list(failures)
                                for width in [360,1440]:
                                    page.set_viewport_size({'width':width,'height':1000})
                                    page.wait_for_timeout(100)
                                    actual=page.evaluate('document.documentElement.scrollWidth')
                                    item['viewports'].append({'width':width,'scrollWidth':actual,'overflow':actual>width})
                                item['empty_root']=page.locator('#root').inner_text().strip()==''
                                item['body_excerpt']=page.locator('main').first.inner_text()[:220] if page.locator('main').count() else page.locator('#root').inner_text()[:220]
                                if failures or item['empty_root'] or any(v['overflow'] for v in item['viewports']) or entry['route'].split('?')[0] in ['/dashboard','/customer-dashboard','/messages','/quotations','/subcontract-work-orders','/painter-assignments']:
                                    name=actor.role.lower()+'-'+re.sub(r'[^a-zA-Z0-9]+','-',entry['route']).strip('-')+'-1440.png'
                                    page.screenshot(path=str(OUT/name),full_page=False,animations='disabled',timeout=10000);result['screenshots'].append(name)
                            except Exception as error:
                                item['browser_failure']=str(error)
                            finally:
                                result['routes'].append(item)
                                item['elapsed_seconds']=round(time.monotonic()-started,2)
                                result.pop('active_route',None)
                                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                                page.set_viewport_size({'width':360,'height':1000})
                    finally:
                        context.unroute_all(behavior='ignoreErrors');context.close()
                self.assertEqual(result['page_errors'],[])
                self.assertEqual(result['routing_errors'],[])
                self.assertEqual(result['writes'],[])
                self.assertFalse(any(row.get('browser_failure') or row.get('empty_root') for row in result['routes']))
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.RoleAudit']))
