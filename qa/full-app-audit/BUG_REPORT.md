# Full application QA bug report

Audit date: 8 October 2026 (Asia/Calcutta). No application code changes were made during the audit. Existing uncommitted changes remain outside this audit scope.

## Audit status

**In progress / partial coverage until all planned browser checks and manual evidence reviews complete.** No role is described as fully tested merely because its routes rendered. State-changing workflow steps remain untested in this read-only run.

- Source route patterns found: 92.
- Rendered role/route cases: 181.
- Desktop page renders: 181.
- Mobile page renders: 543.
- Dialog/action screenshots: 2.
- Verified bugs: 5 (Critical 0; High 0; Medium 5; Low 0).
- Support role: BLOCKED — no existing authenticated Support account/session available.
- Invalid/missing invitation links and dynamic detail routes without accessible records: BLOCKED; see the coverage matrix.
- Viewports: 1440×900, 360×844, 390×844, 430×844. Tablet/zoom checks must be tracked separately.

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

**Observed:** The lead card includes a phone icon link and an eye/customer-detail icon link. Both links render without text, aria-label or title; their SVG icons are aria-hidden. Browser DOM checks find these unnamed links at desktop and all three mobile widths.
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


## Top issues to fix first

1. UI-001 — Add Property drawer does not contain keyboard focus or respond to Escape
2. UI-002 — Required owner search field has no associated accessible label
3. UI-003 — Status filter label creates40px of page-level mobile overflow
4. UI-004 — Lead call and customer-detail icon links have no accessible names
5. UI-005 — Customer Work Reschedules menu opens a contractor-only permission screen

## Evidence and limitations

- [Route/menu coverage and per-page flow inventory](ROUTE_COVERAGE.md).
- [Browser console errors and warnings](console-errors.txt).
- [Failed/4xx/5xx requests](failed-requests.txt).
- Screenshots are in `screenshots/`. Password fields and common secret fields are masked.
- Navigation cancellations (`ERR_ABORTED`), expected authorization responses, and harness-blocked mutation requests are not automatically bugs.
- Only browser-observed, reproduced findings are listed as bugs. Source inventory and unreviewed DOM signals do not count as verified issues.
- No fixes, deployment, account reset, role change, production mutation, cookie export or authentication-state export is part of this audit.
