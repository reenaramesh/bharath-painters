"""Customer activation/resend browser QA using isolated test records."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from qa.dashboard_shortcuts_verification import ShortcutBrowser
from qa.quotation_unified_verification import db_read
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT = Path(__file__).resolve().parents[2] / 'docs/previews/customer-activation-actions'

class ActivationBrowser(ShortcutBrowser):
    test_role_shortcuts = None

    def setUp(self):
        super().setUp()
        self.portal.set_unusable_password()
        self.portal.save(update_fields=['password'])

    def test_activation_resend_and_status(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {'screenshots': [], 'errors': [], 'steps': []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width':390,'height':1000}, reduced_motion='reduce', permissions=['clipboard-read','clipboard-write'])
            def route_api(route):
                parsed = urlsplit(route.request.url)
                response = context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1') + parsed.path + ('?' + parsed.query if parsed.query else ''), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                route.fulfill(response=response)
            context.route(re.compile(r'^https?://[^/]+/api/'), route_api)
            page=context.new_page();page.set_default_navigation_timeout(60000)
            page.on('pageerror',lambda error:result['errors'].append(str(error)))
            try:
                page.goto('http://localhost:5173/login',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
                page.locator('input[type=text]').first.fill(self.contractor.mobile)
                page.locator('input[type=password]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/customers');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name=re.compile('Resend activation link')).first.wait_for()
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    actions=page.get_by_role('group',name=f'Actions for {self.customer.name}',exact=True)
                    boxes=actions.locator(':scope > *').evaluate_all('els => els.map(el => {const r=el.getBoundingClientRect(); return {x:r.x,right:r.right,cy:r.y+r.height/2};})')
                    self.assertEqual(actions.locator('.crm-customer-activation-action').evaluate('el => getComputedStyle(el).fontSize'), '11px')
                    self.assertEqual(len(boxes),3)
                    self.assertLessEqual(max(box['cy'] for box in boxes)-min(box['cy'] for box in boxes),1)
                    self.assertLessEqual(boxes[0]['right'],boxes[1]['x'])
                    filename=f'inactive-list-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                links=[]
                for _ in range(2):
                    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/activate-account/')) as sent:
                        page.get_by_role('button',name=re.compile('Resend activation link')).first.click()
                    self.assertEqual(sent.value.status,200)
                    links.append(sent.value.json()['share_link'])
                    dialog=page.get_by_role('dialog')
                    if len(links) == 1:
                        for width in [360,390,430,768,1440]:
                            page.set_viewport_size({'width':width,'height':1000})
                            self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                            filename=f'activation-share-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                        page.keyboard.press('Tab')
                        self.assertTrue(dialog.evaluate('el => el.contains(document.activeElement)'))
                    dialog.get_by_role('link',name='Share on WhatsApp',exact=True).wait_for()
                    self.assertIn(links[-1], dialog.get_by_role('link',name='Share on WhatsApp',exact=True).get_attribute('href').replace('%2F','/'))
                    dialog.get_by_role('button',name='Copy Link',exact=True).click()
                    dialog.get_by_text('Activation link copied.',exact=True).wait_for()
                    dialog.get_by_role('button',name='Done',exact=True).click();page.wait_for_load_state('networkidle')
                self.assertNotEqual(links[0],links[1])
                self.assertFalse(db_read(lambda:self.portal.__class__.objects.get(pk=self.portal.pk).has_usable_password()))
                page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name=re.compile('Resend activation link')).first.wait_for()
                result['steps'].append('Close, resend twice, copy, reopen: inactive status persists and replacement links differ')
                page.goto(f'http://localhost:5173/customers/{self.customer.pk}');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name=re.compile('Resend activation link')).wait_for()
                with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/activate-account/')) as detail_sent:
                    page.get_by_role('button',name=re.compile('Resend activation link')).click()
                self.assertEqual(detail_sent.value.status,200)
                page.get_by_role('dialog').get_by_role('button',name='Done',exact=True).click()
                page.wait_for_load_state('networkidle')
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)
                    filename=f'inactive-detail-{width}.png';page.screenshot(path=str(OUT/filename),animations='disabled');result['screenshots'].append(filename)
                def activate_fixture():
                    actor=self.portal.__class__.objects.get(pk=self.portal.pk)
                    actor.set_password('test-pass');actor.save(update_fields=['password'])
                db_read(activate_fixture)
                page.reload();page.wait_for_load_state('networkidle')
                page.get_by_text('Account activated',exact=True).wait_for()
                self.assertEqual(page.get_by_role('button',name=re.compile('Resend activation link')).count(),0)
                page.goto('http://localhost:5173/customers');page.wait_for_load_state('networkidle')
                page.get_by_text('Active',exact=True).first.wait_for()
                self.assertEqual(page.locator('.crm-customer-activation-action').first.evaluate('el => getComputedStyle(el).fontSize'), '11px')
                self.assertEqual(page.get_by_role('button',name=re.compile('Resend activation link')).count(),0)
                page.screenshot(path=str(OUT/'active-list-1440.png'))
                result['steps'].append('Activated account changes to green status and no longer offers activation resends')
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error);page.screenshot(path=str(OUT/'last-failure.png'));raise
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors');context.close();browser.close()

if __name__=='__main__':
    import faulthandler
    faulthandler.dump_traceback_later(90, repeat=True)
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=2,interactive=False).run_tests(['__main__.ActivationBrowser']))
