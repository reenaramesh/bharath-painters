"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'contractor-tools'
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
            saved = {**TASK, **payload} if path.startswith('/api/quotations/tasks/') else {'id': 81, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/billing/contractor-packages/': data = {'current': {}, 'plans': [], 'requests': []}
        elif path == '/api/jobs/reports/': data = {'summary': {'customers': 12, 'quotations': 8, 'active_projects': 3, 'completed_projects': 5, 'invoiced': '100000', 'received': '75000', 'outstanding': '25000', 'photos': 4}, 'monthly': [], 'quotation_statuses': [], 'upcoming': []}
        elif path == '/api/quotations/colour-comparison/draft/': data = {'slots': [None]*8}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    for route,title in [('/my-packages','Subscription'),('/reports','Reports'),('/colors-shades','Colors & Shades')]:
        page.goto('http://127.0.0.1:5173'+route)
        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible(timeout=20000)
        for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
            page.set_viewport_size({'width': width, 'height': 950})
            page.evaluate('window.scrollTo(0,0)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (route,width)
            page.screenshot(path=str(OUT / f'{route[1:]}-{width}.png'), full_page=True)
        print('Reviewed layout: '+route,flush=True)
    assert not writes, writes
    assert not errors, errors
    browser.close()
print('PASS subscription/reports/colour studio layouts at eight widths without writes')
