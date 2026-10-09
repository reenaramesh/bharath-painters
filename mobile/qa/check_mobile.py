"""Run against an Expo web preview; screenshots are ignored by git."""
from pathlib import Path
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright, expect
from browser_support import launch_chromium

URL = 'http://127.0.0.1:8091'
OUT = Path(__file__).parent / 'screenshots'
OUT.mkdir(exist_ok=True)
results = []
with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda req: print('Failed request', req.url, req.failure))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.goto(URL, wait_until='networkidle', timeout=180000)
    page.get_by_role('button', name='Explore demo workspace').click()
    page.get_by_text('Namaste, Bharath', exact=True).wait_for()
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.screenshot(path=str(OUT / 'desktop-preview.png'), full_page=True)
    for width in [320, 360, 390, 430]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.screenshot(path=str(OUT / f'home-{width}.png'), full_page=True)
        overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not overflow, f'Horizontal overflow at {width}'
        for label in ['Home', 'Customers', 'Work', 'Messages', 'More']:
            bounds = page.get_by_text(label, exact=True).last.bounding_box()
            assert bounds and bounds['y'] + bounds['height'] <= 844, f'Clipped tab {label} at {width}'
        results.append({'width': width, 'horizontal_overflow': overflow})
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Quick actions', exact=True).click()
    page.get_by_text('Where shall we start?', exact=True).wait_for()
    page.get_by_role('button', name='Close quick actions', exact=True).click()
    page.get_by_text('Namaste, Bharath', exact=True).wait_for()
    page.get_by_role('button', name='Customers', exact=True).first.click()
    search = page.get_by_label('Search customers', exact=True)
    search.fill('Ananya')
    expect(page.get_by_role('button', name='Ananya Rao, Bengaluru, ACTIVE', exact=True)).to_have_count(1)
    expect(page.get_by_role('button', name='Vikram Shah, Mysuru, NEW', exact=True)).to_have_count(0)
    search.fill('unknown')
    page.get_by_text('No matching records', exact=True).wait_for()
    page.get_by_role('button', name='Clear search').click()
    page.get_by_role('button', name='Ananya Rao, Bengaluru, ACTIVE').click()
    page.get_by_text('Connected customer', exact=False).wait_for()
    page.go_back()
    page.go_back()
    page.get_by_text('More', exact=True).click()
    page.get_by_text('Your workspace', exact=True).wait_for()
    for module in ['properties', 'leads', 'quotations', 'measurements', 'projects', 'schedules', 'payments', 'messages']:
        page.get_by_role('button', name=module.capitalize(), exact=True).click()
        page.get_by_label(f'Search {module}', exact=True).wait_for()
        page.screenshot(path=str(OUT / f'{module}.png'), full_page=True)
        page.go_back()
        page.get_by_text('Your workspace', exact=True).wait_for()
    page.get_by_role('button', name='Settings', exact=True).click()
    page.get_by_text('Appearance', exact=True).wait_for()
    page.get_by_role('button', name='Dark', exact=True).click()
    page.screenshot(path=str(OUT / 'settings-dark.png'), full_page=True)
    page.go_back()
    page.get_by_text('Home', exact=True).click()
    page.evaluate('document.querySelectorAll("div").forEach(el => { if(el.scrollTop) el.scrollTop=0; })')
    page.screenshot(path=str(OUT / 'home-dark.png'), full_page=True)
    page.get_by_role('button', name='Open settings', exact=True).click()
    page.get_by_role('button', name='Exit demo').click()
    page.get_by_role('button', name='Sign in', exact=True).wait_for()
    page.get_by_role('button', name='Sign in', exact=True).click()
    page.get_by_text('Enter your mobile number or verified email and password.', exact=True).wait_for()
    assert not errors, errors
    browser.close()
print(json.dumps({'layouts': results, 'runtime_errors': errors, 'navigation_search_theme_logout': 'passed'}, indent=2))
