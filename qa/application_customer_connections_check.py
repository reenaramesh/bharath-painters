"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'customer-connections'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CUSTOMER', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
CONNECTION={'id': 63, 'status': 'CONNECTED', 'connected_at': '2026-10-16', 'counts': {'quotations': 1, 'area_calculations': 1, 'active_projects': 1}, 'contractor': {'contractor_id': 'BPC-71', 'business_name': 'Ravi Services', 'name': 'Ravi', 'is_verified': True, 'years_in_business': 8, 'workers': 4, 'completed_projects': 20, 'service_areas': 'Bengaluru', 'work_skills': 'Painting'}}
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
        elif path == '/api/quotations/customer/connection-requests/': data = {'results': [CONNECTION], 'pending_count': 0}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/customer/connections')
    expect(page.get_by_role('heading', name='Your contractors', exact=True)).to_be_visible(timeout=20000)
    page.get_by_role('button', name='View contractor', exact=True).click()
    dialog=page.get_by_role('dialog', name='Ravi Services', exact=True)
    expect(dialog).to_be_visible()
    assert page.evaluate("document.body.style.overflow==='hidden'")
    page.once('dialog', lambda prompt: prompt.accept())
    dialog.get_by_role('button', name='Block contractor', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    assert writes[-1]==('/api/quotations/customer/contractors/63/block/', {})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'contractor-dialog-{width}.png'), full_page=True)
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    expect(page.get_by_role('button', name='View contractor', exact=True)).to_be_focused()
    page.get_by_role('button', name='View contractor', exact=True).click()
    expect(dialog).to_be_visible()
    expect(dialog.locator('.contractor-identity-id')).to_have_css('color', 'rgb(87, 64, 236)')
    expect(dialog.get_by_role('button', name='Block contractor', exact=True)).to_have_css('color', 'rgb(255, 255, 255)')
    page.mouse.click(1, 1)
    expect(dialog).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS Customer connections: native profile dialog, existing block confirmation/payload, error display and focus restoration at eight widths')
