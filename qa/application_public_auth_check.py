"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'public-auth'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 390, 'height': 950})
    context.add_init_script('localStorage.clear()')
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
            payload = {'raw': route.request.post_data} if 'multipart/form-data' in route.request.headers.get('content-type','') else route.request.post_data_json
            writes.append((path, payload))
            saved = {'ticket_number': 'SUP-QA-81'} if path.endswith('/support-tickets/public/') else {'id': 81, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/accounts/legal/registration/': data = {'policy_version':'QA-V1','effective_date':'2026-10-16','operator_name':'QA operator','operator_address':'QA address','terms_title':'Test terms','privacy_title':'Test privacy','terms_sections':[],'privacy_sections':[],'references':[],'contact_email':'qa@example.invalid'}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    for route,title in [('/login','Welcome back'),('/register','Create your account'),('/customer-register','Customer account'),('/forgot-password','Forgot password')]:
        page.goto('http://127.0.0.1:5173'+route)
        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible(timeout=20000)
        expect(page.locator('.minimia-shell')).to_have_count(0)
        for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
            page.set_viewport_size({'width': width, 'height': 950})
            page.evaluate('window.scrollTo(0,0)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (route,width)
            page.screenshot(path=str(OUT / f'{route[1:]}-{width}.png'), full_page=True)
        print('Reviewed public layout: '+route,flush=True)
    page.goto('http://127.0.0.1:5173/login')
    page.get_by_role('textbox', name='Mobile number or verified email', exact=True).fill('qa@example.invalid')
    password=page.locator('input[autocomplete="current-password"]')
    password.fill('qa-invalid-password')
    page.get_by_role('button',name='Sign in',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Please check')
    expect(password).to_have_value('qa-invalid-password')
    assert writes[-1] == ('/api/accounts/login/', {'identifier': 'qa@example.invalid','password':'qa-invalid-password'})
    page.get_by_role('button',name='Support Desk',exact=True).click()
    dialog=page.get_by_role('dialog',name='Support Desk',exact=True)
    expect(dialog.get_by_role('heading')).to_be_focused()
    dialog.get_by_role('textbox',name='Registered mobile number',exact=True).fill('9876543211')
    dialog.get_by_role('textbox',name='Subject',exact=True).fill('Cannot sign in')
    dialog.get_by_role('textbox',name='How can we help?',exact=True).fill('Please help me recover my account.')
    dialog.get_by_role('button',name='Submit ticket',exact=True).click()
    expect(dialog.get_by_role('status')).to_contain_text('Please check')
    expect(dialog.get_by_role('textbox',name='Subject',exact=True)).to_have_value('Cannot sign in')
    page.once('dialog',lambda prompt:prompt.dismiss())
    page.keyboard.press('Escape')
    expect(dialog).to_be_visible()
    state['fail']=False
    dialog.get_by_role('button',name='Submit ticket',exact=True).click()
    expect(dialog.get_by_role('status')).to_contain_text('SUP-QA-81')
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    expect(page.get_by_role('button',name='Support Desk',exact=True)).to_be_focused()
    assert not errors, errors
    browser.close()
print('PASS public auth: four layouts/eight widths, login failure retention, support multipart failure/retry, dirty Escape and saved-form dismissal')
