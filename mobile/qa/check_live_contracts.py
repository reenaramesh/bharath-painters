"""Contract simulation only; no production account or endpoint is contacted.

Start preview with EXPO_PUBLIC_API_URL=http://127.0.0.1:8092/api.
"""
import json
import sys
from playwright.sync_api import sync_playwright, expect
from browser_support import launch_chromium
sys.stdout.reconfigure(encoding='utf-8')
user = {'id': 7, 'role': 'CONTRACTOR', 'first_name': 'Test', 'mobile': 'Sample contact', 'is_verified': True, 'verification_status': 'VERIFIED'}
dashboard = {
    'contractor_name': 'Contract Test', 'profile_completion': {'percent': 100, 'missing': []},
    'counts': {'customers': 0, 'properties': 0, 'quotations': 0, 'quotation_value': '0', 'active_leads': 0, 'invoices': 0, 'due_tasks': 0, 'unread_messages': 0, 'site_visits': 0, 'new_requests': 0},
    'recent_customers': [], 'recent_quotations': [], 'tasks': [], 'site_visits': [], 'pipeline': []
}
requests = []
errors = []
role = 'CONTRACTOR'
fail_dashboard = False
fail_menu = False
with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' and 'Failed to load resource' not in msg.text else None)
    def respond(route):
        req = route.request
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
            return
        requests.append({'path': req.url.split('/api')[-1], 'method': req.method})
        path = requests[-1]['path']
        data = {}
        status = 200
        if path == '/accounts/login/':
            assert req.post_data_json == {'identifier': '9999999999', 'password': 'sample-password'}
            data = {'access': 'test-access', 'refresh': 'test-refresh', 'user': {**user, 'role': role}}
        else:
            assert req.headers.get('authorization') == 'Bearer test-access'
            if path == '/accounts/menu-visibility/':
                data = {'CONTRACTOR': ['leads'], 'PAINTER': []}
                if fail_menu: status = 503
            elif path == '/quotations/contractor-crm/dashboard/':
                data = dashboard
                if fail_dashboard: status = 503
            else: raise AssertionError(f'Unexpected API request: {path}')
        route.fulfill(status=status, content_type='application/json', body=json.dumps(data), headers=headers)
    page.route('http://127.0.0.1:8092/api/**', respond)
    def login():
        page.get_by_label('Mobile number or verified email', exact=True).fill('9999999999')
        page.get_by_label('Password', exact=True).fill('sample-password')
        page.get_by_role('button', name='Sign in', exact=True).click()
    page.goto('http://127.0.0.1:8091', wait_until='networkidle')
    login()
    page.get_by_text('Namaste, Contract Test', exact=True).wait_for()
    assert page.get_by_text('Demo workspace', exact=False).count() == 0
    page.get_by_text('Your first estimate', exact=True).wait_for()
    page.get_by_text('More', exact=True).click()
    page.get_by_text('Your workspace', exact=True).wait_for()
    expect(page.get_by_role('button', name='Leads', exact=True)).to_have_count(0)
    page.get_by_role('button', name='Quotations', exact=True).click()
    page.get_by_text('Mobile integration coming next', exact=True).wait_for()
    page.go_back()
    page.get_by_role('button', name='Settings', exact=True).click()
    page.get_by_role('button', name='Sign out', exact=True).click()
    page.get_by_role('button', name='Sign in', exact=True).wait_for()
    fail_dashboard = True
    fail_menu = True
    login()
    page.get_by_text('Let’s reconnect', exact=True).wait_for()
    page.get_by_text('Could not load this information. Please try again.', exact=True).wait_for()
    fail_menu = False
    page.get_by_role('button', name='Open settings', exact=True).click()
    page.get_by_role('button', name='Sign out', exact=True).click()
    page.get_by_role('button', name='Sign in', exact=True).wait_for()
    role = 'CUSTOMER'
    login()
    page.get_by_text('Customer workspace', exact=True).wait_for()
    expect(page.get_by_role('button', name='Customers', exact=True)).to_have_count(0)
    assert not errors, errors
    browser.close()
print(json.dumps({'mocked_contracts': 'passed', 'requests': requests, 'runtime_errors': errors}, indent=2))
