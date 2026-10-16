"""CRM forms and filters using actual routes and isolated API responses."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'workforce-settings'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
EMPLOYEE={'id':84,'membership_id':84,'name':'Ravi Employee','employee_code':'BPE-QA-84','bharath_id':'BPA-84','mobile':CUSTOMER['mobile'],'email':'qa@example.invalid','joined_on':'2026-10-01','experience_years':5,'salary_basis':'MONTHLY','salary_amount':'25000','is_active':True,'attendance':[],'ledger':[],'assignments':[],'attendance_summary':{},'wage_summary':{}}
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 390, 'height': 950})
    context.add_init_script("localStorage.setItem('bharath_user',JSON.stringify(%s));localStorage.setItem('bharath_access','qa');" % json.dumps(USER))
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, writes = [], []
    state = {'fail': True}
    page.on('pageerror', lambda e: errors.append(str(e)))

    def api(route):
        path = urlsplit(route.request.url).path
        if not path.startswith('/api/'):
            return route.continue_()
        if route.request.method != 'GET':
            payload = route.request.post_data_json
            writes.append((path, payload))
            saved = {**TASK, **payload} if path.startswith('/api/quotations/tasks/') else {'id': 81, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/jobs/in-house-applicators/': data = [EMPLOYEE]
        elif path == '/api/jobs/in-house-applicators/84/': data = EMPLOYEE
        elif path == '/api/accounts/recovery-email/': data = {'verified': True,'masked_email':'qa@example.invalid','masked_mobile':'987*****11','bharath_id':'BPC-QA'}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    screens=[('/painter-seeking','Paint Applicators seeking work'),('/in-house-applicators','Employees'),('/in-house-applicators/new','Create in-house employee'),('/in-house-applicators/84','Ravi Employee'),('/account-security','Account Security'),('/applicator-team','Refer Painter')]
    if '--detail' in sys.argv: screens=[('/in-house-applicators/84','Ravi Employee')]
    for route,title in screens:
        page.goto('http://127.0.0.1:5173'+route)
        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible(timeout=20000)
        for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
            page.set_viewport_size({'width':width,'height':950})
            page.evaluate('window.scrollTo(0,0)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (route,width)
            page.screenshot(path=str(OUT/f'{route[1:].replace("/","-")}-{width}.png'),full_page=True)
        print('Reviewed layout: '+route,flush=True)
    assert not writes
    if '--detail' not in sys.argv:
        page.goto('http://127.0.0.1:5173/applicator-team')
        page.get_by_role('button',name='Refer Painter',exact=True).click()
        dialog=page.get_by_role('dialog',name='Refer Painter')
        expect(dialog).to_be_visible()
        dialog.get_by_label('Full name',exact=True).fill('QA Referred Painter')
        dialog.get_by_label('Mobile number',exact=True).fill('9876543211')
        dialog.get_by_label('Preferred locations',exact=True).fill('Bengaluru')
        dialog.get_by_label('Skills',exact=True).fill('Interior painting')
        dialog.get_by_role('button',name='Create Painter Profile',exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Please check')
        expect(dialog.get_by_label('Full name',exact=True)).to_have_value('QA Referred Painter')
        assert writes[-1][0]=='/api/jobs/my-team/create-applicator/'
        assert writes[-1][1]['skills']=='Interior painting'
        for width in (320,375,390,428,768,1024,1280,1440):
            page.set_viewport_size({'width':width,'height':950})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            page.screenshot(path=str(OUT/f'referral-dialog-{width}.png'),full_page=True)
        page.once('dialog',lambda d:d.dismiss())
        page.keyboard.press('Escape')
        expect(dialog).to_be_visible()
    assert not errors, errors
    browser.close()
print('PASS workforce/security layouts at eight widths'+ (' (employee detail only, no writes)' if '--detail' in sys.argv else ' (six routes; isolated referral failure, retained values and dirty-dismiss protection)'))
