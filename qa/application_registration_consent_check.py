"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'registration-consent'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
LEGAL={'policy_version':'QA-V1','effective_date':'2026-10-16','operator_name':'QA operator','operator_address':'QA address','terms_title':'Test terms','privacy_title':'Test privacy','terms_sections':[{'title':f'Test section {i}', 'body':'Synthetic UI test content. '*30} for i in range(6)], 'privacy_sections':[{'title':'Test privacy section','body':'Synthetic UI test content. '*30}], 'references':[], 'contact_email':'qa@example.invalid'}
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
        elif path == '/api/accounts/legal/registration/': data = LEGAL
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.set_viewport_size({'width':320,'height':950})
    page.goto('http://127.0.0.1:5173/register')
    page.get_by_role('button',name='Read document',exact=True).wait_for(state='visible')
    summary=page.get_by_text('Terms and Privacy Notice required',exact=True)
    assert summary.bounding_box()['height']<150
    page.get_by_role('button',name='Read document',exact=True).click()
    dialog=page.get_by_role('dialog',name='Terms of Use & Privacy Notice',exact=True)
    expect(dialog).to_be_visible()
    checkbox=dialog.get_by_role('checkbox')
    expect(checkbox).to_be_disabled()
    scroll=dialog.locator('[data-registration-document]')
    scroll.evaluate('(e)=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event("scroll",{bubbles:true}))}')
    expect(checkbox).to_be_enabled()
    checkbox.check()
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width':width,'height':950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'legal-dialog-{width}.png'),full_page=True)
    dialog.get_by_role('button',name='Accept and continue',exact=True).click()
    expect(dialog).to_have_count(0)
    expect(page.get_by_text('Terms and Privacy Notice accepted',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Register',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Employee',exact=True).click()
    expect(page.get_by_text('Terms and Privacy Notice required',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Register',exact=True)).to_be_disabled()
    assert not writes
    assert not errors, errors
    browser.close()
print('PASS registration consent: readable narrow summary, native document dialog, scroll/checkbox gate, role reset and eight widths without writes')
