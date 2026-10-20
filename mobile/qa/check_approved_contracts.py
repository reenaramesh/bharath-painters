"""Validate live adapters using local intercepted contracts only."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright, expect
from browser_support import launch_chromium
OUT=Path(__file__).parent/'approved-dashboard'
dashboard={'contractor_name':'Contract Test','profile_completion':{'percent':100,'missing':[]},'counts':{'customers':0,'properties':0,'quotations':0,'quotation_value':'0','active_leads':0,'invoices':0,'due_tasks':0,'unread_messages':0,'site_visits':0,'new_requests':0},'recent_customers':[],'recent_quotations':[],'tasks':[],'site_visits':[],'pipeline':[]}
with sync_playwright() as p:
    browser=launch_chromium(p)
    for scenario in ['zero','partial','offline']:
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]; requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def respond(route):
            path=route.request.url.split('/api')[-1];requests.append(path)
            headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
            if route.request.method=='OPTIONS':route.fulfill(status=204,headers=headers);return
            if path=='/accounts/login/':data={'access':'fixture-only','refresh':'fixture-only','user':{'id':1,'role':'CONTRACTOR','first_name':'Test','is_verified':True,'verification_status':'VERIFIED'}}
            elif path=='/accounts/menu-visibility/':data={'CONTRACTOR':[]}
            elif path=='/quotations/contractor-crm/dashboard/':
                if scenario=='offline':route.abort('internetdisconnected');return
                data=dashboard
            elif path=='/jobs/work-schedules/':
                if scenario=='partial':route.fulfill(status=503,headers=headers);return
                data=[]
            elif path=='/accounts/profile-card/':data={'digital_card':{}}
            elif path=='/accounts/contractor-profile/':data={'company_name':'Contract Test'}
            else:raise AssertionError(path)
            route.fulfill(status=200,headers=headers,content_type='application/json',body=json.dumps(data))
        page.route('http://127.0.0.1:8092/api/**',respond)
        page.goto(os.environ.get('MOBILE_PREVIEW_URL','http://127.0.0.1:8095'),wait_until='networkidle',timeout=180000)
        page.get_by_label('Mobile number or verified email',exact=True).fill('9999999999')
        page.get_by_label('Password',exact=True).fill('fixture-only')
        page.get_by_role('button',name='Sign in',exact=True).click()
        if scenario=='offline':expect(page.get_by_text('Offline · Check your connection and retry.',exact=True)).to_be_visible()
        else:
            expect(page.get_by_role('button',name='Customers: 0. Connected customers',exact=True)).to_be_visible()
            expect(page.get_by_text('No visits or work scheduled today.',exact=True)).to_be_visible()
            if scenario=='partial':expect(page.get_by_role('button',name='Active Projects: Unavailable. Pull down to retry',exact=True)).to_be_visible()
            else:expect(page.get_by_role('button',name='Active Projects: 0. Confirmed & in progress',exact=True)).to_be_visible()
        assert page.get_by_text('Demo workspace',exact=False).count()==0
        page.screenshot(path=str(OUT/f'api-{scenario}-390.png'))
        assert not errors,errors
        page.close()
    browser.close()
print('Isolated contracts: live zero data, partial failure, offline, no demo substitution passed.')
