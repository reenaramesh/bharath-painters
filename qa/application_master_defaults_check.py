"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'master-defaults'
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
    page.goto('http://127.0.0.1:5173/master-services')
    expect(page.get_by_role('heading',name='Master Data',exact=True)).to_be_visible()
    page.get_by_role('button',name='Terms and Conditions',exact=True).click()
    dialog=page.get_by_role('dialog',name='Terms and Conditions',exact=True)
    expect(dialog).to_be_visible()
    dialog.get_by_label('Prepared by',exact=True).fill('QA Contractor')
    dialog.get_by_label('Terms and conditions',exact=True).fill('QA preserved terms')
    dialog.get_by_role('button',name='Save Terms and Conditions',exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(dialog.get_by_label('Prepared by',exact=True)).to_have_value('QA Contractor')
    assert writes[-1][0]=='/api/accounts/contractor-profile/'
    assert writes[-1][1]=={'quotation_prepared_by':'QA Contractor','quotation_inspected_by':'','quotation_work_duration':'','quotation_payment_terms':'','quotation_product_details':'','quotation_work_procedures':'','quotation_terms_conditions':'QA preserved terms'}
    for width in (320,375,390,428,768,1024,1280,1440):
        page.set_viewport_size({'width':width,'height':950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.screenshot(path=str(OUT/f'terms-error-{width}.png'),full_page=True)
    page.once('dialog',lambda d:d.dismiss())
    page.keyboard.press('Escape')
    expect(dialog).to_be_visible()
    state['fail']=False
    dialog.get_by_role('button',name='Save Terms and Conditions',exact=True).click()
    expect(dialog.get_by_role('status')).to_contain_text('saved')
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS quotation defaults: eight widths, exact payload, failed-save retention, dirty dismissal and saved-version reset')
