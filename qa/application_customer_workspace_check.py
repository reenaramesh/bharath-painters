"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'customer-workspace'
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
            saved = {**TASK, **payload} if path.startswith('/api/quotations/tasks/') else {'id': 81, **payload}
            return route.fulfill(status=400 if state['fail'] else 201, json={'detail': 'Please check the supplied details.'} if state['fail'] else saved)
        data = []
        if path == '/api/accounts/me/': data = USER
        elif path == '/api/accounts/menu-visibility/': data = {}
        elif path == '/api/accounts/contractor-profile/': data = {**USER, 'company_name': 'Ravi Services'}
        elif path == '/api/accounts/customer-profile/': data = {'customer_id': 'BPC-711', 'name': CUSTOMER['name'], 'mobile': CUSTOMER['mobile'], 'email': 'qa@example.invalid', 'email_verified': False, 'address': 'Main Road', 'city': 'Bengaluru', 'pincode': '560001'}
        elif path == '/api/accounts/customer-reviews/': data = {'contractors': [{'id': 71, 'name': 'Ravi Services', 'contractor_id': 'BPC-71'}]}
        elif path == '/api/billing/customer-finance/': data = {'total_paid': '3000', 'balance_due': '9000', 'total_billed': '12000', 'advance_credit': '0', 'invoices': [], 'receipts': [], 'projects': []}
        elif path == '/api/quotations/customer-portal/properties/': data = [{'id': 72, 'name': 'Ravi Home', 'property_type': '2BHK', 'city': 'Bengaluru', 'address': 'Main Road', 'rooms': 2, 'surfaces': 2}]
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    for route,title in [('/customer/profile','My profile'),('/customer-properties','My properties'),('/customer-quotations','My quotations'),('/customer-invoices','Approved projects & payments'),('/customer-reviews','Review your contractors'),('/measurement-access','Shared measurements')]:
        page.goto('http://127.0.0.1:5173'+route)
        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible(timeout=20000)
        for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
            page.set_viewport_size({'width': width, 'height': 950})
            page.evaluate('window.scrollTo(0,0)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (route,width)
            page.screenshot(path=str(OUT / f'{route[1:].replace("/","-")}-{width}.png'), full_page=True)
    page.goto('http://127.0.0.1:5173/customer-reviews')
    page.get_by_role('button', name='5 stars', exact=True).click()
    page.get_by_role('textbox', name='Your review', exact=True).fill('Careful work and clear communication.')
    page.get_by_role('button', name='Submit review', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Please check')
    expect(page.get_by_role('textbox', name='Your review', exact=True)).to_have_value('Careful work and clear communication.')
    assert writes[-1]==('/api/accounts/customer-reviews/', {'contractor_id': 71, 'rating': 5, 'comment': 'Careful work and clear communication.'})
    state['fail']=False
    page.get_by_role('button', name='Submit review', exact=True).click()
    expect(page.get_by_role('button', name='Save review changes', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
print('PASS six Customer layouts at eight widths; review rating/comment failure retention and save retry')
