# Employee registration and existing-account linking

Approved: customer-style activation resending until registration; registered employees retain their password and use existing Forgot Password recovery. The user also requested registered Painter search and prefilling during employee creation.

Use the current employee table, profile, create form and shared dialog styling. Registration is password readiness, separate from identity verification and Active/Removed employment. Show Registered/Unregistered explicitly; do not guess when an older response lacks registration metadata.

Add derived registration metadata to existing employee responses and an owner-only activation-link POST. It issues the existing seven-day, single-activation setup URL only for active, verified, unregistered in-house employees. Reject registered/removed/disabled employees; do not reset credentials or create another identity. Keep setup-link responses non-cacheable.

Add a verified-contractor search GET, minimum three characters and maximum 20 matches, for active verified Painter accounts with usable passwords. Search name, mobile and Bharath ID. Return existing directory identity/profile fields and only the requesting contractor's existing in-house membership ID. Do not expose another employer's salary or membership.

Selection fills name/mobile/experience/skills from the existing profile and makes those identity fields read-only. Contractor-specific trade, title, joining date, salary, statutory details and custom fields remain editable. Saving reuses the existing mobile-based linking endpoint. Already-linked results open the existing employee instead of silently discarding a newly filled form. Clearing selection preserves employment fields and allows new-employee entry.

Both list and profile show registration and activation sharing. Copy/WhatsApp links remain explicit user actions; the application sends no message automatically. Show loading, empty, failure/retry, copied and already-registered states. Refresh account status after returning to the page or closing the share dialog. Reuse existing keyboard-accessible dialogs and minimum 44px controls.

User refinement: shorten directory, attendance and payroll search labels to "Search employees", use smaller and shorter placeholders, and show adjacent registration/resend icons in the directory with accessible names and tooltips. Hide employee ID table columns below 768px while retaining IDs on desktop, in search and in employee profiles. Keep mobile tables scrollable within their own containers.

The user also requested removal of the Blood group directory column. Retain the underlying field in the employee form and profile; reduce the mobile directory's minimum width accordingly.

Both directory status icons use circular surfaces. The resend action retains a 44px touch target around its circular icon.

No database schema change or migration is required. Existing payroll, attendance, assignment and employment-removal behavior remains authoritative. Verify API permission and credential preservation on isolated PostgreSQL; browser-test lookup/linking and unregistered → activation → Registered at phone and desktop widths.
