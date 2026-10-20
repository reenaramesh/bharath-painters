"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'crm-lists'
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
    state = {'fail': False}
    queries = []
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
        queries.append(route.request.url)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path == '/api/quotations/activity-logs/': data = [{'id': 61, 'actor_name': 'Ravi', 'actor_role': 'CONTRACTOR', 'action': 'UPDATE', 'action_display': 'Updated', 'module': 'Customers', 'description': 'Updated customer details', 'created_at': '2026-10-16T09:00:00Z', 'metadata': {'changes': {'name': 'Ravi CRM Customer'}}}]
        elif path == '/api/quotations/activity-logs/summary/': data = {'total': 1, 'today': 1, 'flagged': 0, 'active_users': 1}
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/opportunities')
    expect(page.get_by_role('heading', name='Sales Opportunities', exact=True)).to_be_visible(timeout=20000)
    page.get_by_role('searchbox', name='Search opportunities').fill('Interior')
    page.wait_for_timeout(550)
    assert any('search=Interior' in url for url in queries)
    page.get_by_role('combobox', name='Filter opportunities by stage').select_option('NEW')
    page.wait_for_timeout(400)
    assert any('stage=NEW' in url for url in queries)
    expect(page.get_by_role('button', name='Open', exact=True)).to_have_attribute('aria-pressed', 'true')
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(OUT / f'opportunities-{width}.png'), full_page=True)
    page.goto('http://127.0.0.1:5173/activity-log')
    expect(page.get_by_role('heading', name='Activity Log', exact=True)).to_be_visible()
    expand = page.get_by_role('button', name='Updated customer details', exact=False)
    expand.click()
    expect(expand).to_have_attribute('aria-expanded', 'true')
    expect(page.get_by_text('Submitted changes', exact=True)).to_be_visible()
    page.get_by_role('searchbox', name='Search activity').fill('Ravi')
    page.wait_for_timeout(500)
    assert any('search=Ravi' in url and 'activity-logs/' in url for url in queries)
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(OUT / f'activity-{width}.png'), full_page=True)
    assert not errors, errors
    browser.close()
print('PASS opportunities/activity: search parameters, stage filter, selected state, expansion and eight widths')
