"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'opportunity-detail'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
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
            saved = {**LEAD, **payload} if path.startswith('/api/quotations/leads/') else {**TASK, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/opportunities/91')
    expect(page.get_by_role('heading', name='Interior painting', exact=True)).to_be_visible(timeout=20000)
    expect(page.get_by_role('button', name='New', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.get_by_role('button', name='Contacted', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Please check')
    state['fail'] = False
    page.get_by_role('button', name='Contacted', exact=True).click()
    expect(page.get_by_role('button', name='Contacted', exact=True)).to_have_attribute('aria-pressed', 'true')
    assert writes[-1] == ('/api/quotations/leads/91/', {'stage': 'CONTACTED'})
    page.get_by_role('button', name='Edit', exact=True).click()
    page.get_by_role('textbox', name='Requirement title', exact=True).fill('Updated interior painting')
    state['fail'] = True
    page.get_by_role('button', name='Save changes', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Please check')
    expect(page.get_by_role('textbox', name='Requirement title', exact=True)).to_have_value('Updated interior painting')
    assert writes[-1] == ('/api/quotations/leads/91/', {'title': 'Updated interior painting', 'description': '', 'priority': 'MEDIUM', 'estimated_value': None, 'next_follow_up': None, 'notes': ''})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        page.evaluate('window.scrollTo(0,0)')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'edit-{width}.png'), full_page=True)
    state['fail'] = False
    page.get_by_role('button', name='Save changes', exact=True).click()
    expect(page.get_by_role('heading', name='Updated interior painting', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Edit', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
print('PASS opportunity detail: selected stage, failure/retry, exact stage/edit payloads and eight widths')
