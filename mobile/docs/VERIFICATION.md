# Foundation verification — 9 October 2026

Redesign re-verification: navy/ivory/orange theme and Manrope fonts pass strict TypeScript, all eight core tests, Android Hermes export, and both Python Playwright suites. Visually inspected light/dark Home and a 1440px desktop preview with its centred phone frame. Original device-validation and upstream advisory limitations below still apply.

## Passed

- Strict TypeScript: `npm run typecheck`.
- Eight core tests: role isolation; verification/menu gating; multi-word search and Indian currency formatting; concurrent refresh; logout during refresh; credential origin/path boundary; expiry while persistence is pending; native global fetch receiver.
- Expo native dependency alignment: `expo install --check` against the installed SDK 55 compatibility metadata.
- Android export including Hermes bytecode: `expo export --platform android --max-workers 1`. This produces an Android JS/assets bundle, not a signed APK.
- Python Playwright web preview: Home at 320, 360, 390 and 430px; no horizontal document overflow; fully visible bottom-tab labels; Customers search/empty/reset/detail/back; all remaining module buttons; quick-action sheet dismissal; light/dark settings, dark Home; exit demo and login validation. No browser runtime errors.
- Mock API browser flows: existing login payload/Bearer headers; live Contractor dashboard with zero records; disabled Leads menu; live workflow integration notice; dashboard/menu failures; Settings and sign-out despite menu failure; Customer holding screen with no Contractor navigation. No production server contacted.
- Read-only code review found expiry race and misleading follow-up empty copy; both were fixed and re-reviewed without remaining material findings in this scope.
- Git status: only the new `mobile/` directory; no tracked backend/web/deployment edits.

Screenshots are generated locally under `qa/screenshots/` and ignored by git. Native safe-area handling distinguishes tab screens from screens with a stack header, avoiding duplicate top insets and preserving bottom gesture space.

## Outstanding before release

Android emulator/device verification is still required for TalkBack, keyboard resize, hardware back/sheet dismissal, safe-area/status/navigation bars, large text, scrolling performance, and app lifecycle restoration. Browser checks do not prove these native behaviors. No signed APK, store upload or production deployment was attempted. Actual API connectivity depends on a configured reachable EXPO_PUBLIC_API_URL and valid existing credentials.

Only Contractor Home has live business-data integration. All other requested modules provide demo navigation; other role dashboards have guarded holding screens. Forms, measurement math, quotations, sharing and financial writes remain sequenced in AUDIT.md, and never submit fabricated data.

The SDK-aligned dependency tree retains npm audit advisories: 35 reported (14 moderate, 21 high), including transitive braces/micromatch, node-forge, sprintf-js, uuid and decode-uri-component/query-string. A non-breaking `npm audit fix` was applied; remaining suggested automatic fixes involve incompatible framework upgrades. Most paths are tooling, but query-string is also a Router dependency; full reachability and SDK migration review remain release work. This is a foundation prototype, not a production security sign-off.

## Reproduce browser QA

Create a Python venv and install Playwright. Use `python -m playwright install chromium` if needed; PLAYWRIGHT_CHROMIUM_EXECUTABLE optionally selects an existing browser.

Start Expo on port 8091. For contract simulation, configure the preview process with EXPO_PUBLIC_API_URL=http://127.0.0.1:8092/api; the script intercepts that origin and no API service needs to run.

```powershell
npx expo start --port 8091
python qa/check_mobile.py
python qa/check_live_contracts.py
```

Do not use the mock API address for an installed mobile build. The checked-in app has no default API server configured.
