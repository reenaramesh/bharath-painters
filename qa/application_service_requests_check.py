"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'service-requests'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CUSTOMER', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
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
            saved = {'id': 81, 'status': 'NEW', 'customer_name': CUSTOMER['name'], 'contractor_name': 'Ravi Services', 'created_at': '2026-10-16T09:00:00Z', **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/quotations/service-requests/options/': data = [{'customer': 711, 'contractor_name': 'Ravi Services', 'contractor_id': 'BPC-71', 'default_address': 'Main Road', 'services': [{'id': 4, 'name': 'Painting'}]}]
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/service-requests')
    page.get_by_role('button', name='New request', exact=True).click()
    dialog=page.get_by_role('dialog', name='New service request', exact=True)
    expect(dialog).to_be_visible()
    dialog.get_by_role('combobox', name='Contractor', exact=True).select_option('711')
    dialog.get_by_role('combobox', name='Service', exact=True).select_option('4')
    expect(dialog.get_by_role('textbox', name='Request title', exact=True)).to_have_value('Painting')
    dialog.get_by_role('textbox', name='Describe the work', exact=True).fill('Repaint the living room')
    dialog.get_by_role('button', name='Submit request', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(dialog.get_by_role('textbox', name='Describe the work', exact=True)).to_have_value('Repaint the living room')
    assert writes[-1][0]=='/api/quotations/service-requests/'
    assert writes[-1][1]['customer']=='711'
    assert writes[-1][1]['service_type']=='4'
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'request-form-{width}.png'), full_page=True)
    state['fail']=False
    dialog.get_by_role('button', name='Submit request', exact=True).click()
    expect(dialog).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS service request: contractor/service prefill, unchanged payload, failed-entry retention/retry and eight widths')
