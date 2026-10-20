"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'call-inbox'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
EVENT = {'id': 51, 'display_name': 'Ravi caller', 'phone_number': '+919876543211', 'caller_name': 'Ravi caller', 'name_source': 'USER_ENTRY', 'occurred_at': '2026-10-16T09:00:00Z', 'call_status': 'MISSED', 'review_status': 'PENDING', 'capture_source': 'MANUAL', 'matched_customer': None, 'history': []}
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
            if path.endswith('/add-customer/'):
                return route.fulfill(json={'action': 'OPEN', 'customer_id': 711, 'customer_name': CUSTOMER['name']})
            saved = {**TASK, **payload} if path.startswith('/api/quotations/tasks/') else {'id': 81, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/call-inbox/events/': data = {'results': [EVENT]}
        elif path == '/api/call-inbox/events/51/': data = EVENT
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/call-inbox')
    expect(page.get_by_role('heading', name='Call Inbox', exact=True)).to_be_visible(timeout=20000)
    page.get_by_role('button', name='Add call', exact=True).first.click()
    dialog = page.get_by_role('dialog', name='Add incoming call', exact=True)
    expect(dialog).to_be_visible()
    assert page.evaluate("document.body.style.overflow==='hidden'")
    dialog.get_by_role('textbox', name='Phone number *', exact=True).fill('+919876543211')
    dialog.get_by_role('textbox', name='Caller name', exact=True).fill('Ravi caller')
    dialog.get_by_role('button', name='Save call', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(dialog.get_by_role('textbox', name='Caller name', exact=True)).to_have_value('Ravi caller')
    assert writes[-1][1]['capture_source']=='MANUAL'
    assert writes[-1][1]['name_source']=='USER_ENTRY'
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'manual-call-{width}.png'), full_page=True)
    state['fail']=False
    dialog.get_by_role('button', name='Save call', exact=True).click()
    expect(dialog).to_have_count(0)
    page.get_by_role('button', name='View call details', exact=True).click()
    detail = page.get_by_role('dialog', name='Call details', exact=True)
    expect(detail.get_by_text('No previous calls.', exact=True)).to_be_visible()
    detail.get_by_role('button', name='Done', exact=True).click()
    expect(page.get_by_role('button', name='View call details', exact=True)).to_be_focused()
    page.get_by_role('button', name='Create lead', exact=True).click()
    lead = page.get_by_role('dialog', name='Create lead', exact=True)
    expect(lead).to_be_visible()
    state['fail'] = True
    lead.get_by_role('textbox', name='Lead title *', exact=True).fill('Interior enquiry')
    lead.get_by_role('button', name='Create lead', exact=True).click()
    expect(lead.get_by_role('alert')).to_contain_text('Please check')
    assert writes[-1] == ('/api/call-inbox/events/51/create-lead/', {'title': 'Interior enquiry', 'description': ''})
    state['fail'] = False
    lead.get_by_role('button', name='Create lead', exact=True).click()
    expect(page).to_have_url('http://127.0.0.1:5173/leads')
    assert not errors, errors
    browser.close()
print('PASS Call Inbox: native dialog, locked background, attributed payload, failed-save retention/retry and eight widths')
