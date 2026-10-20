"""Isolated Expo-web layout checks. No production API calls or real credentials."""
from pathlib import Path
import json, os, sys
from playwright.sync_api import sync_playwright, expect
from browser_support import launch_chromium
sys.stdout.reconfigure(encoding='utf-8')
OUT=Path(__file__).parent/'approved-dashboard'
OUT.mkdir(exist_ok=True)
url=os.environ.get('MOBILE_PREVIEW_URL','http://127.0.0.1:8095')
with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url,wait_until='networkidle',timeout=180000)
    page.get_by_role('button',name='Explore demo workspace').click()
    page.get_by_text('Namaste, Bharath',exact=False).wait_for()
    results=[]
    for width in [360,390,430]:
        page.set_viewport_size({'width':width,'height':844})
        page.wait_for_timeout(600)
        expect(page.get_by_role('button',name='Create: open quick actions')).to_be_visible()
        expect(page.get_by_role('button',name='Add Customer',exact=True)).to_be_visible()
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.screenshot(path=str(OUT/f'dashboard-{width}.png'),full_page=True)
        results.append({'width':width,'horizontal_overflow':False})
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Create: open quick actions').click()
    page.get_by_text('Quick actions',exact=True).first.wait_for()
    page.screenshot(path=str(OUT/'create-sheet-390.png'))
    assert not errors, errors
    (OUT/'layout-results.json').write_text(json.dumps({'platform':'Expo web; not native Android','checks':results,'page_errors':errors},indent=2))
    browser.close()
print('Dashboard layout and Create sheet passed at 360/390/430 CSS px.')
