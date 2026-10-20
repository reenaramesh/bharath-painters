"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'work-changes'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
CHANGE = {'id': 62, 'quotation': 88, 'quotation_number': 'Q-88', 'change_number': 'WC-62', 'reason': 'Balcony painting', 'requested_date': '2026-10-16', 'status': 'SENT_TO_CUSTOMER', 'status_display': 'Sent to customer', 'price_difference': '2000', 'lines': [], 'customer_name': CUSTOMER['name']}
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
        elif path == '/api/quotations/work-changes/': data = [CHANGE] if state.get('customer') else []
        elif path == '/api/quotations/88/current-scope/': data = {'summary': {'original_contract': '10000', 'approved_additions': '2000', 'approved_deductions': '0', 'net_work_changes': '2000', 'revised_contract_value': '12000', 'payments_received': '3000', 'balance': '9000'}}
        elif path == '/api/quotations/': data = [{'id': 88, 'status': 'IN_PROGRESS', 'quotation_number': 'Q-88', 'customer_details': {'name': CUSTOMER['name']}}]
        elif path == '/api/quotations/88/': data = {'id': 88, 'items': [], 'rooms': []}
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/work-changes')
    expect(page.get_by_role('heading', name='Work Changes', exact=True)).to_be_visible(timeout=20000)
    page.get_by_role('button', name='Create Work Change', exact=True).click()
    dialog = page.get_by_role('dialog', name='Create Work Change', exact=True)
    expect(dialog).to_be_visible()
    dialog.get_by_role('combobox', name='In-progress project', exact=True).select_option('88')
    dialog.get_by_role('textbox', name='Reason / customer request', exact=True).fill('Add balcony painting')
    dialog.get_by_role('textbox', name='Room / area', exact=True).fill('Balcony')
    dialog.get_by_role('spinbutton', name='Quantity being changed', exact=True).fill('100')
    dialog.get_by_role('spinbutton', name='New rate', exact=True).fill('20')
    dialog.get_by_role('button', name='Save draft', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(dialog.get_by_role('textbox', name='Room / area', exact=True)).to_have_value('Balcony')
    assert writes[-1][0]=='/api/quotations/work-changes/'
    assert writes[-1][1]['quotation']==88
    assert writes[-1][1]['lines'][0]['changed_quantity']==100
    assert writes[-1][1]['lines'][0]['new_rate']==20
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'change-form-{width}.png'), full_page=True)
    state['fail']=False
    dialog.get_by_role('button', name='Save draft', exact=True).click()
    expect(dialog).to_have_count(0)
    USER['role']='CUSTOMER'
    state['customer']=True
    customer_context=browser.new_context(viewport={'width': 390, 'height': 950})
    customer_context.add_init_script("localStorage.setItem('bharath_user',JSON.stringify(%s));localStorage.setItem('bharath_access','qa');" % json.dumps(USER))
    page=customer_context.new_page()
    page.route('**/api/**', api)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5173/work-changes')
    expect(page.get_by_role('button', name='Create Work Change', exact=True)).to_have_count(0)
    page.get_by_role('button').filter(has_text='WC-62').click()
    detail=page.get_by_role('dialog', name='WC-62', exact=True)
    expect(detail).to_be_visible()
    expect(detail.get_by_text('Project financial summary', exact=True)).to_be_visible()
    state['fail']=True
    detail.get_by_role('button', name='Approve', exact=True).click()
    expect(detail.get_by_role('alert')).to_contain_text('Please check')
    assert writes[-1] == ('/api/quotations/customer-portal/work-changes/62/approve/', {'note': ''})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'customer-approval-{width}.png'), full_page=True)
    state['fail']=False
    detail.get_by_role('button', name='Approve', exact=True).click()
    expect(detail).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS work changes: draft dialog, unchanged numeric payload, failure retention/retry and eight widths')
