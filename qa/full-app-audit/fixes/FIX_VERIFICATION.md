# Fix verification ? full application QA findings

8 October 2026. The eight verified findings from [BUG_REPORT.md](../BUG_REPORT.md) are fixed locally. The original report and screenshots remain historical evidence. This report does not mark the entire application or previously blocked workflows as passing.

| Issue | Result | Change |
|---|---|---|
| UI-001 | PASS | Native property dialog; named close action, Tab/Shift+Tab containment, Escape, opener focus and scroll restoration. |
| UI-002 | PASS | Owner name label is associated with its required customer search input. |
| UI-003 | PASS | Hidden status label keeps its clipped width; both customer and contractor service-request pages fit the viewport. |
| UI-004 | PASS | Lead call and customer-detail icon links have meaningful accessible names. |
| UI-005 | PASS | Customer navigation retains schedules and changes; contractor-only rescheduling is offered only to contractors. |
| UI-006 | PASS | Header notification/profile menus close on Escape and return focus to their triggers for all five tested role variants. |
| UI-007 | PASS | Admin dashboard actions reflow into readable rows at mobile widths; desktop layout retained. |
| UI-008 | PASS | Mobile Painter shortcuts reuse resolved layout employment and sidebar eligibility. In-house painters receive My Employment; freelance marketplace destinations remain available. Current work CTA also respects employment. |

## Validation

- Native Chrome/Playwright: **78/78 checks passed**, zero failures/blocked checks and zero uncaught browser page errors. Contractor, Customer, Admin, freelance Painter and in-house Painter sessions; 1440?900,360?844,390?844,430?844.
- [Detailed browser results](after-results.json). Baseline: 74 checks,68 expected failures and6 passes; those were repetitions across roles/viewports, not68 different bugs. Four related Current work checks were added afterward.
- Production build: `npm.cmd run build` ? PASS. Vite required normal Windows subprocess access; the sandbox-only attempt could not spawn it.
- Navigation/menu visibility/body-scroll unit tests:6 passed.
- `npm.cmd run lint`: no errors; existing warnings in unrelated/unchanged code.
- `git diff --check -- frontend`: PASS.
- Browser QA mutations blocked after authentication; no new QA properties or financial/account changes were submitted during this fix pass. Password inputs masked; no token/cookie/auth-state export.

## Evidence

- [UI-001 / contractor / 1440](after-UI-001-contractor-1440.png).
- [UI-001 / contractor / 390](after-UI-001-contractor-390.png).
- [UI-003 / customer / 1440](after-UI-003-customer-1440.png).
- [UI-003 / customer / 390](after-UI-003-customer-390.png).
- [UI-004 / contractor / 1440](after-UI-004-contractor-1440.png).
- [UI-004 / contractor / 390](after-UI-004-contractor-390.png).
- [UI-007 / admin / 1440](after-UI-007-admin-1440.png).
- [UI-007 / admin / 390](after-UI-007-admin-390.png).
- [UI-008 / painter_inhouse / 390](after-UI-008-painter_inhouse-390.png).

## Changed application files

- `frontend/src/components/PropertyForm.jsx`
- `frontend/src/components/Topbar.jsx`
- `frontend/src/components/MobileDashboardShortcuts.jsx`
- `frontend/src/config/navigation.js` and `navigation.test.mjs`
- `frontend/src/layouts/DashboardLayout.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Leads.jsx`
- `frontend/src/pages/communication-pages.css`
- `frontend/src/index.css`

Backend/database files were not changed. Existing project/audit changes were preserved. No deployment was performed. Intermittent API502 observations and originally blocked/untested audit workflows are outside the eight verified UI fixes. Physical-device/screen-reader/Safari validation remains outside this Chrome regression pass.

## Follow-up

[API recovery and additional workflow verification](API_RECOVERY_VERIFICATION.md) records the subsequent shared-client recovery fix, in-house booking polling correction, simulated outage checks and quotation draft verification.
