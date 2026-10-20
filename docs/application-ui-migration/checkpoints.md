# Implementation checkpoints

## 1 — Inspection and inventory

Branch: `ui/application-wide-master-20261016`. Commit `d191760` contains only the new inventory script, source-derived route inventory, architecture map and rollout plan. Existing dirty files were not staged. Source/Git-state snapshot: `backend/.qa-temp/application-ui-20261016-start/`.

98 router paths / 88 page routes discovered, including public pages, legacy redirects and development previews. Navigation-role hints are distinguished from authorization. Role dashboards share layout foundations but still require conditional-state review.

## 2 — Shared foundations and role dashboards (in progress)

- Extracted `DashboardWelcomeBanner` and coordinated service-art mapping/renderer. Unknown trades and failed image requests use a neutral utility symbol, not unrelated painting artwork. Original approved assets reused.
- Contractor greeting/service imagery retained. Customer/Painter/Admin now use the same banner geometry with role-specific content/actions. Decorative utility symbols are omitted on very narrow phones to keep greetings readable.
- Painter KPI cards now reuse StatCard; the unrelated black feature block uses the shared white-card/indigo-action treatment. Existing employment links and counters retained.
- Extended existing `ui/Dialog` with optional description/icon/body class/translated close label. ContractorDialog is now a thin wrapper around it; native focus, body locking and dirty-entry protection were checked.
- Shared headers use the existing language mechanism; identities remain separate from translated greeting text. Existing transliteration fallbacks are not represented as complete translations.

Evidence: four dashboards at 320/375/390/428/768/1024/1280/1440px; screenshot review; image-failure fallback test; four Node theme/artwork tests; actual shell search/notification/language/drawer checks; existing customer/painter/contractor form/accessibility suite. Build passed after shared dialog changes. Further page-by-page checks remain open in `reviews.json`.

## 3 — Contractor CRM (in progress)

Lead creation migrated to the shared dialog. API payload and fields retained; failed-save error now remains visible inside the modal. Eight-width test covers customer selection, validation retention, exact payload, dirty Escape cancellation, successful save and restored focus. Populated lead lists/stages, task/site-visit forms and remaining CRM pages are next.

No backend/data-model/API/business-calculation changes, push or deployment in this rollout. Existing legacy test selectors are not proof of current workflow failures; new targeted tests use current controls and isolate all API writes.

### CRM checkpoint extension

Task add/reschedule and site-visit scheduling now reuse the shared native dialog; failed-save messages remain inside it. Eight-width mocked browser checks pass for unchanged payloads, entry retention and retry. Opportunity filters have accessible names/selected state; narrow summaries remain two columns. Activity Log reuses PageHeader/StatCard; tablet rows reflow so the date is not clipped. Quick Create Client and Call Inbox manual/details/lead overlays now reuse the existing dialog, preserving caller-source metadata and CRM approval actions. Call details focus restoration and lead retry/navigation passed.

Sequential checks: application_crm_check.py, application_crm_lists_check.py, application_opportunity_create_check.py and application_call_inbox_check.py passed. Browser screenshots inspected at narrow/mobile/tablet sizes; Activity Log clipping and opportunity summary density were corrected and recaptured. Lint exits 0 with existing warnings. Production build passed before the last opportunity/Call Inbox conversions and needs a fresh checkpoint build. Source audit still reports 95 pages/61 logic files with no changed API expressions or protected logic files. Read-only reviewer found no high/medium regressions; a separator typo was corrected.

These are isolated UI/API fixtures, not live backend permission or physical Android proof. Route statuses remain partial where populated business variants have not been exercised. No push/deploy.

## 4 - Property and work-planning checkpoint

Properties and Completed Projects now reuse PageHeader. Area-calculator selection has a clear heading and accessible search/type filter; no measurement math changed. PropertyForm accepts an optional error so save failures are visible inside the open drawer, with values retained. Empty portfolio, populated property and calculator layouts checked at eight widths.

Work Schedules proposal/team dialogs now reuse the shared dialog. Proposal failure/retry passes at eight widths. Work Changes draft/detail dialogs use the same foundation; numeric draft payload and customer approval endpoint/note remain unchanged. Customer approval failures stay in the dialog; summary values and role-specific actions remain. Native dialog focus/scroll protection is inherited. Narrow approval actions and financial rows were adjusted after inspecting screenshots.

Shared presentation primitives/artwork committed locally as `967d87e`, with only named UI assets/components/styles staged. Latest lint exits 0 (existing warnings). API expression/source audit remains unchanged across 95 pages and 61 protected logic files. New suites: application_properties_projects_check.py, application_work_schedules_check.py and application_work_changes_check.py passed. Work Changes test includes Contractor draft plus Customer approval, not live backend permission proof. Remaining route variants are explicit in reviews.json.

## 5 - Painter, Customer and administration checkpoint

Commit `2a99cef` saves the named CRM/work-planning UI changes and their isolated browser tests. Painter assignment/availability/booking/earnings headers now reuse PageHeader; earnings cards reuse StatCard and stack icons to keep 320px amounts readable. Calendar cells stay inside their grid and expose full date/selection labels. Four Painter layouts pass eight widths; unavailable-date failure/retry and calendar navigation pass.

Six Customer layouts pass eight widths; contractor review rating/comment failure retention and retry pass. Customer contractor profile reuses core Dialog with opt-in backdrop dismissal; connection/block confirmations and API payload are retained. Contrast corrections keep identity/status badges and destructive labels readable on the new surface. Payment summary cards now have meaningful Lucide icons. Six Admin/support layouts pass eight widths; integration reveal/hide and failed-save retention use dummy data only. Billing request tabs wrap as complete controls after fixing narrow vertical labels.

Admin audit History was hidden by compact mobile table rendering. The cell is now explicitly marked as an action, preserving table content and exposing History. Audit dialog and shared MobileTableDialogs now reuse the existing native Dialog: same fields/openRecord, focus entry/trap/restoration, Escape and body locking. Admin audit/table-detail tests pass at eight widths without writes. Read-only reviewer found no high/medium regression. Latest lint/source audit pass; production build checkpoint running after these changes. Route entries remain partial where variants are not yet checked.

## 6 - Public auth, consent and work-network checkpoint

Commit `00a258d` saves role-workspace/shared-dialog changes and their isolated tests. Latest public auth layouts use the shared type/palette, white forms and reused painting art. Login's Support Desk forwards the existing saved-version marker through Dialog; failed submission retains values, dirty Escape remains protected, and successful submission clears protection. Registration summary no longer collapses into a one-letter column at 320px. The native legal document dialog retains scroll/checkbox gating and role-reset behavior; test uses synthetic document data only.

Service request/follow-up and support ticket dialogs reuse Dialog. Customer request service/title prefill, unchanged payload, save failure/retry and multipart ticket retention pass. Job requirement/detail and revised-work-date dialogs share the same foundation; posting deep link and dirty dismissal, applicant detail and exact revised-date payload failure/retry pass. Workforce/security pages reuse PageHeader; six routes reviewed at eight widths without writes. Employee borders softened after screenshot inspection.

Checks: 16 sequential Node regressions pass (theme, artwork, body locking/dismissal and contact parsing/navigation); WCAG A/AA axe checks report no violations for three CRM dialogs/four public pages at 390px and desktop Login; lint exits 0 with existing warnings; production build passes (2201 modules, 15.19s). API/source audit: no changed API expressions or protected logic files across 95 page sources/61 logic files. Read-only reviewer found no high/medium regression. No backend/data changes, push or deployment from these UI batches.

Evidence and exact pending variants remain in reviews.json. Isolated UI responses are not live backend role/permission or Android proof.


## 7 - Broad responsive matrix and remaining dialog checkpoint

Local commits d33c513 and b644e86 save public auth/consent and service/support/workforce UI batches. Painter referral create/credentials dialogs now use core Dialog; isolated referral failure retains details, renders an internal alert and preserves dirty-dismiss protection. Existing referral account creation remains separate from private imported Painter Contacts.

The reference matrix passed 23 screens at 320/375/390/428/768/1024/1280/1440px (184 screen-width combinations), plus custom colours, navigation and loaded typography; no runtime errors. This provides layout evidence, not full populated workflow coverage. Master Data terms now reuse Dialog while retaining their body portal and saved-version reset. A breakpoint test caught the need to retain that portal; corrected retry passes exact existing PATCH payload, failure retention, dirty Escape and success dismissal at all eight widths. Master Data neutral borders softened; semantic colours retained.

Lint passes with existing warnings. Production build passed after referral changes (2201 modules,17.23s); a final build follows the portal correction. Source audit still reports no changed API expressions/protected logic across 95 pages/61 files. Route ledger remains explicit about untested populated/permission/language variants. No push/deploy.
