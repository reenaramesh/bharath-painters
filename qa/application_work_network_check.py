"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'work-network'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'id': 99103, 'role': 'CONTRACTOR', 'first_name': 'Ravi', 'is_verified': True, 'preferred_language': 'en'}
CUSTOMER = {'id': 711, 'name': 'Ravi CRM Customer', 'mobile': '+919876543211', 'status': 'NEW', 'connection_status': 'CONNECTED'}
TASK = {'id': 81, 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'follow_up_type': 'CALL', 'next_follow_up': '2027-01-15T10:00:00Z', 'comment': 'Original callback', 'is_completed': False}
LEAD = {'id': 91, 'reference_no': 'LEAD-QA-91', 'customer': 711, 'customer_name': CUSTOMER['name'], 'customer_mobile': CUSTOMER['mobile'], 'title': 'Interior painting', 'stage': 'NEW', 'is_history': False, 'created_at': '2026-10-16T09:00:00Z', 'updated_at': '2026-10-16T09:00:00Z'}
JOB={'id': 82, 'title': 'Interior painting requirement', 'status': 'OPEN', 'job_type': 'DAILY', 'applications_count': 0, 'contractor_name': 'Ravi Services', 'contractor_id': 71, 'contractor_mobile': CUSTOMER['mobile'], 'location': 'Indiranagar', 'city': 'Bengaluru', 'start_date': '2027-02-01', 'estimated_days': 5, 'number_of_painters': 2, 'daily_wage': '1000', 'required_skills': 'Interior painting'}
SCHEDULE={'id': 83,'quotation':88,'quotation_number':'Q-88','customer':CUSTOMER['name'],'property':'Ravi Home','status':'CONFIRMED','needs_reschedule':True,'start_date':'2026-01-01','end_date':'2026-01-05','painters':[]}
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
        elif path == '/api/jobs/list/': data = {'jobs': [JOB]}
        elif path == '/api/jobs/work-schedules/': data = [SCHEDULE]
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/jobs?post=1')
    dialog=page.get_by_role('dialog',name='Post requirement',exact=True)
    expect(dialog).to_be_visible(timeout=20000)
    dialog.get_by_role('textbox',name='Job title',exact=True).fill('Interior painting requirement')
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width':width,'height':950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'post-form-{width}.png'),full_page=True)
    page.once('dialog',lambda prompt:prompt.dismiss())
    page.keyboard.press('Escape')
    expect(dialog).to_be_visible()
    page.once('dialog',lambda prompt:prompt.accept())
    dialog.get_by_role('button',name='Close post requirement form',exact=True).click()
    expect(dialog).to_have_count(0)
    assert 'post=1' not in page.url
    page.get_by_role('button',name='Manage applicants',exact=True).click()
    detail=page.get_by_role('dialog',name=JOB['title'],exact=True)
    expect(detail).to_be_visible()
    expect(detail.get_by_text('Required skills',exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    expect(detail).to_have_count(0)
    page.set_viewport_size({'width':390,'height':950})
    page.goto('http://127.0.0.1:5173/work-reschedules')
    page.get_by_role('button',name='Reschedule now',exact=True).click()
    reschedule=page.get_by_role('dialog',name='Reschedule Q-88',exact=True)
    reschedule.get_by_label('New start date',exact=True).fill('2027-02-01')
    reschedule.get_by_label('New end date',exact=True).fill('2027-02-05')
    reschedule.get_by_role('textbox',name='Reason for rescheduling *',exact=True).fill('Customer requested revised dates.')
    reschedule.get_by_role('button',name='Send revised dates for customer approval',exact=True).click()
    expect(reschedule.get_by_role('alert')).to_contain_text('Please check')
    assert writes[-1]==('/api/jobs/work-schedules/', {'quotation':88,'start_date':'2027-02-01','end_date':'2027-02-05','reason':'Customer requested revised dates.'})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width':width,'height':950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'reschedule-{width}.png'),full_page=True)
    state['fail']=False
    reschedule.get_by_role('button',name='Send revised dates for customer approval',exact=True).click()
    expect(reschedule).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS work network: post form/deep link/dirty dismissal, applicant details, revised-date payload and failure/retry at eight widths')
