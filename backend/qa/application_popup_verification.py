"""Opt-in popup protection QA: isolated accounts, no production mutations."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from qa.quotation_unified_verification import BrowserAudit
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django

OUT=Path(__file__).resolve().parents[2]/'docs/previews/application-popup-protection'

class PopupBrowser(BrowserAudit):
    test_browser_workflow=None

    def test_application_forms(self):
        OUT.mkdir(parents=True,exist_ok=True)
        result={'steps':[],'screenshots':[],'errors':[],'writes':[]}
        reject_save=True
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
            def route_api(route):
                nonlocal reject_save
                parsed=urlsplit(route.request.url)
                if route.request.method not in ['GET','HEAD'] and not parsed.path.endswith('/login/'):
                    result['writes'].append(parsed.path)
                if route.request.method=='PATCH' and parsed.path.endswith('/contractor-profile/') and reject_save:
                    reject_save=False
                    route.fulfill(status=400,json={'detail':'QA intentional save rejection'})
                    return
                try:
                    response=context.request.fetch(self.live_server_url.replace('localhost','127.0.0.1')+parsed.path+('?' +parsed.query if parsed.query else ''),method=route.request.method,headers=route.request.headers,data=route.request.post_data_buffer)
                    route.fulfill(response=response)
                except Exception as error:
                    reason=str(error).split('Call log:',1)[0].splitlines()[0]
                    if route.request.method=='GET' and any(word in reason.lower() for word in ['already handled','closed','disposed']): return
                    result['errors'].append({'path':parsed.path,'reason':reason})
                    try: route.fulfill(status=503,json={'detail':'QA routing unavailable'})
                    except Exception: pass
            context.route(re.compile(r'^https?://[^/]+/api/'),route_api)
            page=context.new_page()
            page.on('pageerror',lambda error:result['errors'].append(str(error)))
            def capture(state):
                for width in [360,390,430,768,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    self.assertTrue(page.locator('dialog[open],[role="dialog"]').last.is_visible(),state)
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width,state)
                    file=f'{state}-{width}.png'
                    page.screenshot(path=str(OUT/file),full_page=True,animations='disabled')
                    result['screenshots'].append(file)
                page.set_viewport_size({'width':1440,'height':1000})
            def decline_close(dialog,button_name):
                prompts=[]
                page.once('dialog',lambda prompt:(prompts.append(prompt.message),prompt.dismiss()))
                dialog.get_by_role('button',name=button_name,exact=True).click()
                self.assertEqual(len(prompts),1)
                self.assertIn('unsaved changes',prompts[0])
            def escape_decline():
                prompts=[]
                page.once('dialog',lambda prompt:(prompts.append(prompt.message),prompt.dismiss()))
                page.keyboard.press('Escape')
                self.assertEqual(len(prompts),1)
            def accept_escape():
                page.once('dialog',lambda prompt:prompt.accept())
                page.keyboard.press('Escape')
            try:
                page.goto('http://localhost:5173/login');page.wait_for_load_state('networkidle')
                page.locator('input[type="text"]').first.fill(self.contractor.mobile)
                page.locator('input[type="password"]').fill('test-pass')
                page.get_by_role('button',name='Sign in',exact=True).click();page.wait_for_url('**/dashboard')
                page.goto('http://localhost:5173/customers');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name=re.compile('Add customer',re.I)).first.click()
                dialog=page.get_by_role('dialog')
                dialog.get_by_label('Customer name',exact=True).fill('Keep unsaved customer')
                page.locator('[role="dialog"]').click(position={'x':3,'y':3})
                self.assertEqual(dialog.get_by_label('Customer name',exact=True).input_value(),'Keep unsaved customer')
                decline_close(dialog,'Close');escape_decline()
                capture('customer-input-retained')
                accept_escape();dialog.wait_for(state='hidden')
                result['steps'].append('Customer creation: outside click, Close and Escape cannot silently discard typed customer name; accepted dismissal closes without saving')
                page.goto('http://localhost:5173/properties?action=add');page.wait_for_load_state('networkidle')
                dialog=page.locator('dialog[open]')
                dialog.get_by_label('Project name',exact=False).fill('Keep unsaved property')
                page.mouse.click(3,3)
                self.assertEqual(dialog.get_by_label('Project name',exact=False).input_value(),'Keep unsaved property')
                decline_close(dialog,'Close property form');escape_decline()
                capture('property-input-retained')
                accept_escape();dialog.wait_for(state='hidden')
                result['steps'].append('Native property dialog: backdrop and Escape protection, a single confirmation, preserved typed name, no property creation')
                page.goto('http://localhost:5173/master-services');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Terms and Conditions',exact=False).click()
                dialog=page.get_by_role('dialog')
                field=dialog.locator('textarea[name="quotation_terms_conditions"]')
                field.fill('Do not discard master quotation conditions')
                page.mouse.click(340,3)
                self.assertEqual(field.input_value(),'Do not discard master quotation conditions')
                decline_close(dialog,'Close');escape_decline();capture('master-terms-retained')
                dialog.get_by_role('button',name='Save Terms and Conditions',exact=True).click()
                dialog.get_by_text('QA intentional save rejection',exact=True).wait_for()
                self.assertEqual(field.input_value(),'Do not discard master quotation conditions')
                decline_close(dialog,'Close')
                dialog.get_by_role('button',name='Save Terms and Conditions',exact=True).click()
                dialog.get_by_text('Default quotation details saved.',exact=True).wait_for()
                prompts=[]
                saved_prompt=lambda prompt:(prompts.append(prompt.message),prompt.dismiss())
                page.on('dialog',saved_prompt)
                dialog.get_by_role('button',name='Close',exact=True).click();dialog.wait_for(state='hidden')
                page.remove_listener('dialog',saved_prompt)
                self.assertEqual(prompts,[])
                result['steps'].append('Master terms: failed explicit save retains input and close warning; successful explicit save resets warning; isolated fixture only')
                page.goto('http://localhost:5173/support-tickets');page.wait_for_load_state('networkidle')
                page.get_by_role('button',name='Raise ticket',exact=True).click()
                dialog=page.get_by_role('dialog')
                field=dialog.get_by_label('Subject',exact=True);field.fill('Unsaved ticket subject')
                page.mouse.click(3,3)
                self.assertEqual(field.input_value(),'Unsaved ticket subject')
                decline_close(dialog,'Close dialog');capture('support-input-retained')
                accept_escape();dialog.wait_for(state='hidden')
                result['steps'].append('Support ticket: outside click and declined close retain subject; confirmed Escape closes without submission')
                checks=page.evaluate('''async () => {
                  const original=window.confirm; let prompts=0;window.confirm=()=>{prompts++;return false;};
                  const check=(ok,name)=>{if(!ok)throw Error(name);};
                  const make=(native=false,readonly=false)=>{
                    const root=document.createElement(native?'dialog':'div');
                    if(!native){root.setAttribute('role','dialog');root.style.cssText='position:fixed;inset:0;z-index:999999;background:white;';}
                    if(readonly)root.dataset.popupProtection='readonly';
                    root.innerHTML='<input type="checkbox"><input type="file"><button type="button" aria-label="Close test">Close</button><button type="button" data-popup-action="submit">Cancel</button>';
                    root.querySelector('[aria-label]').onclick=()=>root.remove();
                    document.body.append(root);if(native)root.showModal();return root;
                  };
                  const edit=(field)=>field.dispatchEvent(new Event('change',{bubbles:true}));
                  const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
                  let root;
                  try{
                    root=make();await wait();
                    let outside=false;root.addEventListener('mousedown',()=>outside=true);
                    root.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));check(!outside,'outside click blocked before editing');
                    const box=root.querySelector('input');box.checked=true;edit(box);
                    root.querySelector('[aria-label]').click();check(root.isConnected&&prompts===1,'checkbox dirty warning');
                    let submitted=false;root.lastElementChild.onclick=()=>submitted=true;root.lastElementChild.click();check(submitted&&prompts===1,'business submit not intercepted');
                    root.setAttribute('data-popup-saved-version','1');await wait();root.querySelector('[aria-label]').click();check(!root.isConnected&&prompts===1,'successful save resets baseline');
                    root=make();await wait();
                    const file=root.querySelector('[type=file]'),transfer=new DataTransfer();transfer.items.add(new File(['qa'],'qa.txt'));file.files=transfer.files;edit(file);
                    root.querySelector('[aria-label]').click();check(root.isConnected&&prompts===2,'file selection guarded without reading content');root.remove();
                    root=make(true);await wait();const nativeBox=root.querySelector('input');nativeBox.checked=true;edit(nativeBox);
                    const cancel=new Event('cancel',{cancelable:true});root.dispatchEvent(cancel);check(cancel.defaultPrevented&&prompts===3,'native cancel guarded');root.remove();
                    root=make(false,true);await wait();root.querySelector('input').checked=true;edit(root.querySelector('input'));root.querySelector('[aria-label]').click();check(!root.isConnected&&prompts===3,'readonly opt out');
                    root=make();await wait();root.dataset.popupDirty='true';root.querySelector('[aria-label]').click();check(root.isConnected&&prompts===4,'canvas explicit dirty state');root.remove();
                    root=make();await wait();const child=make();await wait();child.querySelector('input').checked=true;edit(child.querySelector('input'));
                    child.querySelector('[aria-label]').click();check(child.isConnected&&root.isConnected&&prompts===5,'topmost popup only');child.remove();root.remove();
                    return ['Outside click before edits','Checkbox and file changes','Submit action unchanged','Confirmed-save reset','Native cancel event','Read-only viewer opt-out','Canvas dirty marker','Topmost popup isolation'];
                  }finally{root?.remove();window.confirm=original;}
                }''')
                result['policy_checks']=checks
                self.assertEqual(result['writes'],['/api/accounts/contractor-profile/']*2)
                self.assertEqual(result['errors'],[])
            except Exception as error:
                result['blocker']=str(error);result['body']=page.locator('body').inner_text()
                page.screenshot(path=str(OUT/'last-failure.png'),full_page=True)
                raise
            finally:
                (OUT/'browser-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors');context.close();browser.close()

if __name__=='__main__':
    from django.core.servers.basehttp import ThreadedWSGIServer
    ThreadedWSGIServer.request_queue_size=128
    settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['__main__.PopupBrowser']))
