"""Use an installed Chromium or Playwright's default browser."""
import os
from pathlib import Path

def launch_chromium(playwright):
    executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
    if not executable and os.name == 'nt':
        candidates = sorted((Path.home() / 'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
        if candidates:
            executable = str(candidates[-1])
    options = {'headless': True}
    if executable:
        options['executable_path'] = executable
    return playwright.chromium.launch(**options)
