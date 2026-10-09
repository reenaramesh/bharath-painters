# Full application QA bug report

Audit date: 8 October 2026 (Asia/Calcutta). No application code changes were made during the audit. Existing uncommitted changes remain outside this audit scope.

## Audit status

**Real-browser audit completed for accessible local sessions; overall functional coverage remains PARTIAL.** No role is described as fully tested merely because its routes rendered. Most state-changing actions were prevented; the separately documented temporary QA property/measurement workflow is an exception. Support authentication and unavailable-data workflows remain blocked.

- Source route patterns found: 92.
- Route patterns exercised in browser: 88 (renders, not full functional passes).
- Rendered role/route cases: 185.
- Desktop page renders: 246.
- Mobile page renders: 744.
- Dialog/action screenshots: 103.
- Verified bugs: 8 (Critical 0; High 0; Medium 7; Low 1).
- Support role: BLOCKED — no existing authenticated Support account/session available.
- Invalid/missing invitation links and dynamic detail routes without accessible records: BLOCKED; see the coverage matrix.
- Main viewports: 1440×900, 360×844, 390×844, 430×844. Tablet 768 checked for Admin dashboard actions and authorized Recovery Center only; zoom is NOT TESTED.
- Route patterns with no browser evidence: 4; every one remains listed in the matrix.
- Roles fully tested end-to-end: none. No blanket PASS is assigned to unfinished persistence/payment/account-recovery workflows.
- Roles partially tested: Contractor, Customer, Painter (freelance and in-house), Admin. Recovery Center was also viewed through the authorized Admin session; this is not a Support login.
- Actual desktop/mobile sidebar clicks: 220.

## Authentication coverage

- CONTRACTOR: VERIFIED login (existing local QA account); no credentials included.
- CUSTOMER: VERIFIED login (existing local QA account); no credentials included.
- PAINTER_FREELANCE: VERIFIED login (existing local QA account); no credentials included.
- PAINTER_INHOUSE: VERIFIED login (existing local QA account); no credentials included.
- ADMIN: VERIFIED login (existing local QA account); no credentials included.

## Verified issues

### UI-001 — Add Property drawer does not contain keyboard focus or respond to Escape

**Severity:** Medium
**Role:** Contractor
**Route:** `/properties?action=add`
**Viewport:** 1440 and 390

**Observed:** With Add Property open, pressing Escape leaves the drawer open. Tab moves to background sidebar controls on desktop and background header controls on mobile instead of entering/staying in the drawer. The rendered overlay has no dialog role. Its X close button has no accessible name.
**Expected:** Opening the drawer moves focus into a named modal dialog; keyboard focus stays inside it, Escape closes it, and closing returns focus to the opener. The close action has an accessible name.

**Steps to reproduce:**

1. Sign in as the existing QA contractor.
2. Open Add Property from navigation, or visit /properties?action=add.
3. Press Escape, then press Tab repeatedly; inspect where the visible keyboard focus moves.

**Evidence:**

- [Desktop keyboard reproduction](screenshots/contractor-property-drawer-keyboard-1440.png)
- [Mobile keyboard reproduction](screenshots/contractor-property-drawer-keyboard-390.png)
- Browser reproduction at both sizes: escapeLeavesOpen=true; dialogCount=0. Desktop Tab sequence: Collapse sidebar, Search menu, OVERVIEW, Dashboard. Mobile Tab sequence: Open navigation, Go back, Home, language selector, Notifications. X button has no aria-label, title or text.

**Likely area:** frontend/src/components/PropertyForm.jsx; property-form overlay and header close button
**Risk:** Keyboard and screen-reader users can operate hidden background controls while the drawer blocks the screen, and may be unable to dismiss or find the form reliably.
**Recommended fix:** Use a correctly labelled native dialog or a tested accessible drawer with focus containment, initial focus, Escape handling and focus restoration. Name the close button.

### UI-002 — Required owner search field has no associated accessible label

**Severity:** Medium
**Role:** Contractor
**Route:** `/properties?action=add`
**Viewport:** 1440, 360, 390 and 430

**Observed:** The Add Property form visibly displays Owner name *, but its Search customer input has no associated HTML label and no aria-label/aria-labelledby. This was found in the rendered DOM at all four widths and confirmed in the desktop/mobile reproduction.
**Expected:** The customer/owner search input exposes the visible Owner name label and its required state to assistive technology.

**Steps to reproduce:**

1. Sign in as the existing QA contractor and open Add Property.
2. Inspect or focus the Search customer input beneath Owner name *.
3. Check the input's associated labels and accessible-name attributes.

**Evidence:**

- [Desktop form](screenshots/contractor-properties-action-add-1440-page.png)
- [Mobile form](screenshots/contractor-properties-action-add-390-page.png)
- Rendered DOM: Search customer input reports labels.length=0, no aria-label and no aria-labelledby. Browser evidence at 1440/360/390/430.

**Likely area:** frontend/src/components/PropertyForm.jsx; Owner name customer search
**Risk:** Screen-reader users cannot reliably identify the required customer selection when creating a property.
**Recommended fix:** Connect the visible label to a stable input ID (htmlFor/id), or use aria-labelledby, and provide the required state and combobox semantics appropriate to the search picker.

### UI-003 — Status filter label creates40px of page-level mobile overflow

**Severity:** Medium
**Role:** Customer / Contractor
**Route:** `/service-requests`
**Viewport:** 360, 390 and 430; desktop comparison1440

**Observed:** The page is wider than the mobile viewport by40px. Browser computed measurements:360px viewport/400px document,390/430,430/470. The visually hidden Filter by request status label is absolutely positioned40px from the left but expands to the entire viewport width. Desktop has no page-level overflow.
**Expected:** The status filter remains accessible without widening the document or requiring horizontal page scrolling.

**Steps to reproduce:**

1. Sign in as the existing QA Customer or Contractor.
2. Open /service-requests at360,390 or430px width.
3. Observe the blank strip on the right and inspect document.documentElement.scrollWidth and the filter label box.

**Evidence:**

- [Desktop comparison](screenshots/customer-service-requests-1440-overflow-recheck.png)
- [390px reproduction](screenshots/customer-service-requests-390-overflow-recheck.png)
- Rendered CSS: Filter by request status label position=absolute; left=40; width=390; right=430 at a390px viewport; font-size13px; overflow=hidden. The same40px excess reproduced at360 and430px.

**Likely area:** frontend/src/pages/ServiceRequests.jsx and communication-page mobile filter label styles
**Risk:** Mobile users can pan the entire page sideways; alignment and fixed navigation no longer share the same page width.
**Recommended fix:** Keep visually hidden labels at a1px clipped size; limit full-width mobile filter styling to visible labels/controls or scope it so it does not override .sr-only.

### UI-004 — Lead call and customer-detail icon links have no accessible names

**Severity:** Medium
**Role:** Contractor
**Route:** `/leads`
**Viewport:** 1440,360,390,430

**Observed:** The lead row includes a phone icon link and an customer-detail icon link. Both links render without text, aria-label or title; their SVG icons are aria-hidden. Browser DOM checks find these unnamed links at desktop and all three mobile widths.
**Expected:** Both controls expose meaningful names such as Call customer and View customer details.

**Steps to reproduce:**

1. Sign in as the existing QA contractor.
2. Open /leads with the existing QA lead.
3. Navigate to the phone and eye icons with a keyboard or inspect their accessible names.

**Evidence:**

- [Desktop lead card](screenshots/contractor-leads-1440-page.png)
- [Mobile lead card](screenshots/contractor-leads-390-page.png)
- Rendered DOM returned both links in unnamed controls; destinations are the QA customer telephone and /customers/46. No aria-label/title/text was present.

**Likely area:** frontend/src/pages/Leads.jsx; lead-card phone and customer links
**Risk:** Screen-reader users cannot distinguish or reliably choose these contact/detail actions.
**Recommended fix:** Give each icon-only link a concise accessible name, preferably including the associated customer; retain decorative aria-hidden SVGs.

### UI-005 — Customer Work Reschedules menu opens a contractor-only permission screen

**Severity:** Medium
**Role:** Customer
**Route:** `/work-reschedules`
**Viewport:** 1440,360,390,430

**Observed:** Work Reschedules is offered in customer navigation, but opening it displays Only contractors can reschedule work dates with no customer rescheduling information or usable action. The same result appears on desktop and all mobile widths.
**Expected:** Every customer menu item should lead to a usable customer screen. If this workflow is contractor-only, it should not be offered to customers; if customers need visibility, show their permitted read-only updates.

**Steps to reproduce:**

1. Sign in as the existing QA Customer.
2. Choose Work Reschedules from the sidebar.
3. Observe the contractor-only message instead of a customer workspace.

**Evidence:**

- [Desktop customer screen](screenshots/customer-work-reschedules-1440-page.png)
- [Mobile customer screen](screenshots/customer-work-reschedules-390-page.png)
- Actual customer navigation includes /work-reschedules; browser screen contains Only contractors can reschedule work dates.

**Likely area:** frontend/src/config/navigation.js work-reschedules roles and frontend/src/pages/WorkReschedules.jsx role guard
**Risk:** A visible customer menu destination is unusable and causes confusion about how to track schedule changes.
**Recommended fix:** Align the menu role scope with the page permission, or provide an explicitly supported customer read-only view.

### UI-006 — Header notification and profile menus ignore Escape

**Severity:** Low
**Role:** Shared — Contractor, Customer, Painter and Admin
**Route:** `/dashboard and /customer-dashboard`
**Viewport:** 1440 and390

**Observed:** Opening either header menu and pressing Escape leaves aria-expanded=true and the menu visible. This reproduced across the authenticated role variants in the actual navigation checks; desktop and390px contractor screenshots show the profile menu still open after Escape.
**Expected:** Escape dismisses an open header menu and returns keyboard focus to its trigger.

**Steps to reproduce:**

1. Sign in with any available QA role.
2. Open the header Profile menu or Notifications.
3. Press Escape and observe that the menu remains open.

**Evidence:**

- [Desktop profile menu after Escape](screenshots/contractor-header-profile-menu-1440-escape.png)
- [Mobile profile menu after Escape](screenshots/contractor-header-profile-menu-390-escape.png)
- Browser navigation checks record expandedAfterEscape=true for header menus on each tested role variant.

**Likely area:** frontend/src/components/Topbar.jsx notification/profile popup handling
**Risk:** Keyboard users cannot dismiss these popups with the expected Escape interaction and must find another way to close them.
**Recommended fix:** Add Escape handling while a menu is open and restore focus to the corresponding trigger.

### UI-007 — Admin dashboard action labels wrap into stacks of partial words on mobile

**Severity:** Medium
**Role:** Admin
**Route:** `/dashboard`
**Viewport:** 360, 390 and 430; normal at 768 and 1440

**Observed:** The top actions stay squeezed into one row. Export all people breaks within words; its button is 77px wide and 218px tall at 360, 84.5px wide and 194px tall at 390, and 94.5px wide and 170px tall at 430. Release old deleted numbers, Add contractor and Refresh data show the same narrow columns. At 1440 the Export button is 177px wide and 50px tall.
**Expected:** Actions retain readable word boundaries and sensible heights using wrapped rows, a grid, or an overflow menu on small screens.

**Steps to reproduce:**

1. Sign in as Admin.
2. Open /dashboard with Contractors selected.
3. Resize to 360, 390 and 430 and compare the top action labels with 768 or 1440.

**Evidence:**

- [360 reproduction](screenshots/admin-dashboard-360-action-layout-recheck.png)
- [390 reproduction](screenshots/admin-dashboard-390-action-layout-recheck.png)
- [430 reproduction](screenshots/admin-dashboard-430-action-layout-recheck.png)
- [Desktop comparison](screenshots/admin-dashboard-1440-action-layout-recheck.png)
- Browser-measured Export action geometry is recorded in the observed result.

**Likely area:** frontend/src/pages/AdminDashboard.jsx PageHeader actions; shared PageHeader mobile action layout
**Risk:** Administrators must decipher fragmented labels; oversized controls consume valuable mobile screen space.
**Recommended fix:** Allow action controls to wrap into usable rows with minimum widths, or move secondary actions into an accessible menu.

### UI-008 — In-house Painter mobile shortcuts advertise workflows blocked for that employment type

**Severity:** Medium
**Role:** Painter (in-house)
**Route:** `/dashboard -> /applicator-bookings, /applicator-availability and /jobs`
**Viewport:** 390 native shortcut clicks; destination error pages also rendered at 1440, 360 and 430

**Observed:** The mobile Quick access row includes Bookings, Availability and Work Network. Clicking them opens Bookings could not be loaded, Availability could not be loaded, or a marketplace page stating that in-house employees can view only work assigned by their contractor. Serial rechecks retain the booking/availability errors. The booking API returns 403 for this employment type.
**Expected:** In-house employees see shortcuts to their assigned work, attendance and employment flows; unsupported marketplace workflows are hidden or replaced with a clear eligibility explanation.

**Steps to reproduce:**

1. Sign in as the existing in-house Painter QA account.
2. Open the mobile Dashboard at 390.
3. Scroll the Quick access row and click Bookings; return and repeat Availability and Work Network.

**Evidence:**

- [Bookings shortcut destination](screenshots/painter_inhouse-applicator-bookings-390-shortcut-recheck.png)
- [Availability shortcut destination](screenshots/painter_inhouse-applicator-availability-390-shortcut-recheck.png)
- [Work Network shortcut destination](screenshots/painter_inhouse-jobs-390-shortcut-recheck.png)
- failed-requests.txt records repeated 403 responses for /api/jobs/applicator-bookings/. Request route attribution can reflect an overlapping background poll; screenshots and native clicks establish the destination.

**Likely area:** frontend/src/components/MobileDashboardShortcuts.jsx shortcutsByRole.PAINTER; employment gating in frontend/src/config/navigation.js and backend/jobs/views.py
**Risk:** In-house staff are directed to unusable workflows and receive generic loading errors, even though the sidebar correctly hides these marketplace items.
**Recommended fix:** Apply employment eligibility to mobile shortcuts consistently with sidebar navigation; present an explicit access explanation for unsupported direct routes.


## Top issues to fix first

1. UI-005 — Customer Work Reschedules menu opens a contractor-only permission screen
2. UI-008 — In-house Painter mobile shortcuts advertise workflows blocked for that employment type
3. UI-001 — Add Property drawer does not contain keyboard focus or respond to Escape
4. UI-003 — Status filter label creates40px of page-level mobile overflow
5. UI-007 — Admin dashboard action labels wrap into stacks of partial words on mobile
6. UI-002 — Required owner search field has no associated accessible label
7. UI-004 — Lead call and customer-detail icon links have no accessible names
8. UI-006 — Header notification and profile menus ignore Escape

## Evidence and limitations

- [Route/menu coverage and per-page flow inventory](ROUTE_COVERAGE.md).
- [Browser console errors and warnings](console-errors.txt).
- [Failed/4xx/5xx requests](failed-requests.txt).
- Screenshots are in `screenshots/`. Password fields and common secret fields are masked.
- Navigation cancellations (`ERR_ABORTED`), expected authorization responses, and harness-blocked mutation requests are not automatically bugs.
- Only browser-observed, reproduced findings are listed as bugs. Source inventory and unreviewed DOM signals do not count as verified issues.
- No fixes, deployment, account reset, role change, production mutation, cookie export or authentication-state export is part of this audit.

## Safe-data workflow and cleanup

- **PASS** — Create temporary QA property through the real browser form (HTTP 201)
- **PASS** — Save Living Room wall 100 sq.ft and Balcony wall 20 / ceiling 20 sq.ft through the room editor; verified in earlier completed attempt 55
- **PASS** — Reopen saved measurements at 1440, 360, 390 and 430; both rooms share the table and unused door/window categories are absent
- **PARTIAL** — Quotation draft: selected both rooms, product editor displayed 120 sq.ft and amount 1200 at rate 10; final review/persistence did not complete
- **PASS** — Scoped normal application removal of all audit-created properties; no pre-existing resources targeted

## Additional limits and follow-up

- Tests use headless Chrome viewport emulation, not physical phones. Hardware camera/QR scanning, virtual keyboards, Safari and 400% zoom are NOT TESTED.
- Local API requests intermittently returned HTTP 502 during the sweep. Initial error/loading screenshots are retained, with serial retry evidence. This does not establish a production defect.
- No valid customer-share/property-invitation tokens or authenticated Support credentials were available. No tokens/accounts were invented.
- The QA dataset has no connected subcontractor and limited media/application/financial states. Receiving-side subcontract workflows and real financial/account operations remain untested.
- Untested state-changing controls remain NOT TESTED even if their dialogs rendered. PARTIAL does not mean save/send/apply/payment succeeded.
- Cleanup used the normal API removal after verifying each exact new resource ID and QA-AUDIT name. This soft-hides contractor properties and retains their records/measurements in the local database. No database purge was performed; existing records were not cleanup targets.
- Integration-page screenshots were removed from the deliverables to avoid API-key metadata. Automatic approval review rejected recapture because masking was not proven complete. Integration settings were rendered in the initial read-only sweep; their visual evidence is withheld.
- An owner-picker selection cleared during some early quick-entry attempts and stayed selected in others. This remains an unconfirmed asynchronous observation, not a verified bug.
- Temporary-workflow selector/time-out failures are harness limitations and do not establish application defects. No quotation save is asserted unless separately recorded.

## Runtime accounting

- Captured console/warning/error entries: 476; details are sanitized in console-errors.txt. These include expected/intermittent HTTP resource errors and are not all React defects.
- Captured request outcomes excluding harness-blocked mutations: {'502': 1035, '404': 163, 'net::ERR_ABORTED': 2, '403': 164, 'net::ERR_CONNECTION_REFUSED': 1}. Requests can finish after navigation; the route field is event-time context, not guaranteed initiating-page attribution.
- Screenshot files retained: 1150. Rechecks retain separate evidence; counts are not unique fully passing screens.
- Route patterns without usable browser evidence: 4: `/customer-link/:token`, `/join/property/:token`, `/subcontract-work-orders/:id`, `*`.
- Blocked data-dependent route patterns: 3 (two invitation-token routes and subcontract detail). Fallback wildcard navigation is NOT TESTED. All Support menu cases are BLOCKED separately, and do not represent additional unique route patterns.
- Additional mobile bottom-navigation/dashboard-shortcut click checks at390: 40; no click timeouts recorded. Receiving a permission/error page does not mean the destination passed.
- Support authentication blocks every Support role case. Valid share/invitation tokens and missing record-dependent routes remain blocked. Guarded empty/error screens were rendered but their unavailable workflows are BLOCKED, not passing.
- Intermittent 502 responses mostly cleared on serial recheck. Persistent in-house booking/availability eligibility errors are represented by UI-008; an HTTP error alone is not counted as a second bug.

## Workflow coverage

| Role | Workflow | Status | Verified scope / limitation |
|---|---|---|---|
| Contractor | Customer create/view | PARTIAL | Existing QA customer/detail rendered; create dialog opened; new customer save NOT TESTED. |
| Contractor | Property create/view | PASS (safe fixture only) | Temporary QA property created through form and opened. Normal remove action verified; records are soft-hidden. |
| Contractor | Measurement save/reopen | PASS (safe fixture only) | Living Room and Balcony wall/ceiling saves and reopen at all four widths; zero unused door/window categories omitted. |
| Contractor | Measured quotation create/view/edit | PARTIAL | Existing details/edit forms and wizard reviewed; temporary room assignment/product dialog reached; final review/save NOT TESTED. |
| Contractor | Lead/opportunity navigation | PARTIAL | List, detail and creation screen rendered; source-only routes distinguished from visible menus. No real sales record changes. |
| Contractor | Jobs/applicator booking | PARTIAL | Job/availability lists, booking request form, existing records/tabs viewed. Send/apply/approve NOT TESTED. |
| Contractor | Schedule/change/reschedule | PARTIAL | Existing schedule, completed work, changes and reschedule views; mutation submissions NOT TESTED. |
| Contractor | Subcontract scope offer | BLOCKED | Offer entry/list safe controls checked; no connected receiving subcontractor fixture for full send/accept workflow. |
| Contractor | Invoice/payment | PARTIAL | Existing invoice/revenue/payment views and dialog controls checked. Financial posting/receipts/download end-to-end NOT TESTED. |
| Contractor | Messaging/service/support requests | PARTIAL | Lists and safe popup controls checked; send/cancel/resolve NOT TESTED. |
| Customer | Contractor connection/property | PARTIAL | Connected contractor and property/detail/access views. Connection creation/approval NOT TESTED. |
| Customer | Quotation review | PARTIAL | Four existing statuses and detail views rendered; accept/reject/revision submissions NOT TESTED. |
| Customer | Schedule/work changes | FAIL / PARTIAL | Existing work dates/completed work rendered; Work Reschedules menu blocked by contractor-only UI (UI-005). |
| Customer | Payments/invoices | PARTIAL | Amounts, balance, existing invoice and receipt actions inspected; transaction/export completion NOT TESTED. |
| Customer | Messaging/service request/review/support | PARTIAL | Existing messages/request/review/support entry views and safe controls; posting/canceling NOT TESTED. |
| Painter freelance | Available jobs/application status/booking | PARTIAL | Existing marketplace, application/history and booking views, filters/tabs; apply/accept/reject NOT TESTED. |
| Painter freelance | Assignment/schedule/availability/attendance/earnings | PARTIAL | Current/empty assignment views, availability calendar and earnings presentation; attendance writes/date block save NOT TESTED. |
| Painter in-house | Assigned work/employment/earnings | PARTIAL | Current assignment, employment/attendance presentation and earnings data; check-in/complete NOT TESTED. |
| Painter in-house | Marketplace mobile shortcuts | FAIL | Actual Bookings/Availability/Work Network shortcut clicks reach eligibility/load errors (UI-008). |
| Painter both variants | Messaging/photos/profile/settings | PARTIAL | Empty media state and safe upload entry, existing conversations, trade/personal tabs and profile views. Media upload/send/save NOT TESTED. |
| Admin | Directories/verification/status | PARTIAL | All five dashboard directory tabs, contractor/employee lists and status presentation; add/edit/status changes NOT TESTED. |
| Admin | Packages/connection audit/billing/revenue/reports | PARTIAL | Lists, creation/configuration entry views, search/filter/sort safe controls; assignment/billing writes and exported-file validation NOT TESTED. |
| Admin | Support tickets/staff/recovery | PARTIAL | Ticket lists/response entry, staff list and authorized Recovery Center view (including768). Resolve/create/reset actions NOT TESTED. |
| Admin | Integrations | PARTIAL | Read-only view rendered; screenshots withheld to prevent API-key metadata. Replace/remove/save NOT TESTED. |
| Shared | Appearance/theme | PARTIAL | Appearance palettes and safe controls rendered; persistence/individual themes/reload consistency NOT TESTED. |
| Shared | Authentication/security/profile sharing/PDF | PARTIAL | Five valid logins and forms/profile views checked; logout/recovery/registration, external share delivery and exported PDF validation NOT TESTED. |
| Support | All operational pages | BLOCKED | No authenticated Support fixture/session available; Admin authorization is not substituted for a Support login. |

## QA data cleanup verification

Normal application removal soft-hides contractor properties. Read-only verification found zero active QA-AUDIT properties; nine audit-created records remain soft-hidden with their dependent data. These are harmless local QA fixtures, not a database purge. Earlier saved measurement screenshots therefore document historical runs. No existing customer/property/quotation was a cleanup target.
