"""CRM forms and filters using actual routes and isolated API responses."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'application-ui-migration' / 'crm'
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
        elif path == '/api/quotations/customers/': data = [CUSTOMER]
        elif path == '/api/quotations/tasks/': data = [TASK]
        elif path == '/api/quotations/leads/': data = [LEAD]
        elif path.endswith('/notifications/'): data = {'results': [], 'unread_count': 0}
        return route.fulfill(json=data)

    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:5173/leads')
    expect(page.get_by_role('heading', name='Leads', exact=True)).to_be_visible(timeout=20000)
    page.get_by_role('button', name='Create a new lead', exact=True).click()
    dialog = page.get_by_role('dialog', name='Create a service lead', exact=True)
    expect(dialog).to_be_visible()
    assert page.evaluate("document.body.style.overflow === 'hidden'")
    page.get_by_placeholder('Type customer name or mobile number').fill('Ravi')
    dialog.get_by_role('button').filter(has_text=CUSTOMER['name']).click()
    dialog.get_by_label('Requested service', exact=True).fill('Interior painting')
    dialog.get_by_label('Requirement', exact=True).fill('Two bedrooms and ceiling')
    dialog.get_by_role('button', name='Create lead', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(dialog.get_by_label('Requested service', exact=True)).to_have_value('Interior painting')
    assert writes[-1] == ('/api/quotations/leads/', {'customer': 711, 'title': 'Interior painting', 'description': 'Two bedrooms and ceiling'})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        box = dialog.bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1
        page.screenshot(path=str(OUT / f'lead-form-{width}.png'), full_page=True)
    page.once('dialog', lambda prompt: prompt.dismiss())
    page.keyboard.press('Escape')
    expect(dialog).to_be_visible()
    state['fail'] = False
    dialog.get_by_role('button', name='Create lead', exact=True).click()
    expect(dialog).to_have_count(0)
    expect(page.get_by_role('button', name='Create a new lead')).to_be_focused()
    page.get_by_role('button', name='Create a new lead').click()
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    page.set_viewport_size({'width': 390, 'height': 950})
    page.goto('http://127.0.0.1:5173/tasks')
    page.get_by_role('button', name='Add task', exact=True).click()
    task_dialog = page.get_by_role('dialog', name='Add customer follow-up', exact=True)
    expect(task_dialog).to_be_visible()
    state['fail'] = True
    task_dialog.get_by_label('Customer *', exact=True).fill('Ravi')
    task_dialog.get_by_role('button').filter(has_text=CUSTOMER['name']).click()
    task_dialog.get_by_label('Date and time *', exact=True).fill('2027-01-16T10:00')
    task_dialog.get_by_label('Task note *', exact=True).fill('Discuss the revised estimate')
    task_dialog.get_by_role('button', name='Add task', exact=True).click()
    expect(task_dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(task_dialog.get_by_label('Task note *')).to_have_value('Discuss the revised estimate')
    assert writes[-1] == ('/api/quotations/customers/711/follow-ups/', {'follow_up_type': 'CALL', 'next_follow_up': page.evaluate('new Date("2027-01-16T10:00").toISOString()'), 'comment': 'Discuss the revised estimate'})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'task-form-{width}.png'), full_page=True)
    state['fail'] = False
    task_dialog.get_by_role('button', name='Add task', exact=True).click()
    expect(task_dialog).to_have_count(0)
    page.set_viewport_size({'width': 390, 'height': 950})
    page.get_by_role('button', name='Reschedule', exact=True).click()
    edit_dialog = page.get_by_role('dialog', name='Reschedule follow-up', exact=True)
    expect(edit_dialog).to_be_visible()
    edit_dialog.get_by_role('textbox', name='Task note', exact=True).fill('Rescheduled callback')
    edit_dialog.get_by_role('button', name='Tomorrow', exact=True).click()
    state['fail'] = True
    edit_dialog.get_by_role('button', name='Save schedule', exact=True).click()
    expect(edit_dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(edit_dialog.get_by_role('textbox', name='Task note', exact=True)).to_have_value('Rescheduled callback')
    assert writes[-1][0] == '/api/quotations/tasks/81/'
    assert set(writes[-1][1]) == {'comment', 'next_follow_up'}
    state['fail'] = False
    edit_dialog.get_by_role('button', name='Save schedule', exact=True).click()
    expect(edit_dialog).to_have_count(0)
    page.goto('http://127.0.0.1:5173/site-visits')
    page.get_by_role('button', name='Schedule Visit', exact=True).click()
    visit_dialog = page.get_by_role('dialog', name='Schedule site visit', exact=True)
    expect(visit_dialog).to_be_visible()
    state['fail'] = True
    visit_dialog.get_by_role('combobox', name='Opportunity *', exact=True).select_option('91')
    visit_dialog.get_by_label('Visit date *', exact=True).fill('2027-01-15')
    visit_dialog.get_by_label('Contact person', exact=True).fill('Ravi')
    visit_dialog.get_by_label('Contact mobile', exact=True).fill('+919876543211')
    visit_dialog.get_by_label('Notes', exact=True).fill('Bring the sample shade card')
    visit_dialog.get_by_role('button', name='Schedule visit', exact=True).click()
    expect(visit_dialog.get_by_role('alert')).to_contain_text('Please check')
    expect(visit_dialog.get_by_label('Contact person', exact=True)).to_have_value('Ravi')
    assert writes[-1] == ('/api/quotations/site-visits/', {'opportunity': '91', 'scheduled_date': '2027-01-15', 'scheduled_time': None, 'contact_person': 'Ravi', 'contact_mobile': '+919876543211', 'notes': 'Bring the sample shade card'})
    for width in (320, 375, 390, 428, 768, 1024, 1280, 1440):
        page.set_viewport_size({'width': width, 'height': 950})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'visit-form-{width}.png'), full_page=True)
    state['fail'] = False
    visit_dialog.get_by_role('button', name='Schedule visit', exact=True).click()
    expect(visit_dialog).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS CRM lead/tasks/site visits: native dialogs, locked background, selection, unchanged payloads, failed-save retention, reschedule/retry, dirty dismissal, success/focus and eight widths')
