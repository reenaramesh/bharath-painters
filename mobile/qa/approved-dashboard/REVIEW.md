# Approved Contractor Dashboard — Phase 1 and Phase 2

Reference: `design-references/contractor-mobile-design.png`, first phone only.

## Implemented

White brand header, original house logo, personalized greeting, illustrated blue banner, four pastel metric cards, six filled illustrated shortcuts, compact today's schedule, and Home / Customers / Create / Projects / More navigation. Create opens the existing quick-action sheet. All new touch controls are at least 48dp. Existing destination screens and their integration notices are retained.

The original vector assets are implemented in `src/assets/Illustrations.tsx`: house mark, painter/villa/garden scene, customers, quotation, project, follow-up, measurement ruler, calendar, rupee and message illustrations. They render as SVG through Expo-compatible react-native-svg, not a screenshot or remote image service.

## API integration

Existing login/JWT/SecureStore/menu permissions are preserved. The owner-scoped workspace repository reads the existing Contractor CRM dashboard, contractor profile, profile card and work schedules. Active projects deduplicate CONFIRMED/IN_PROGRESS schedules by quotation. Today's work uses the start/end range; visits use Asia/Kolkata dates. Supplementary schedule/profile errors do not replace live data with demo records. Only public owner-photo URLs and the existing business summary whitelist are kept.

No arbitrary approval count or growth statistic is shown. The banner quotation figure is labelled as workspace quotations, not pending approvals. The visit preview reflects records returned by the existing dashboard endpoint, which caps its visit arrays. A complete all-visits-today count is not available from that preview contract.

## Visual comparison

See `comparison-390.png`, `dashboard-360.png`, `dashboard-390.png` and `dashboard-430.png`.

Compared the reference and implemented render directly: corrected oversized metric/shortcut heights and excess vertical spacing, retained the white header, blue banner, two-column metrics, three-column shortcuts, red schedule accent and raised central Create button. Fixed SVG rotation attributes that caused a development warning overlay; final screenshots are clean.

Differences: artwork is an original vector interpretation rather than the reference's raster painting; unavailable avatars/photos show neutral fallback artwork; live captions use supported data rather than sample growth/approval figures. Preview samples are clearly marked when scrolled. The reference crop is normalized to 390px width and is taller than the 390×844 browser viewport, so comparison is structural rather than a pixel-difference score.

## Verification

- TypeScript, 15 focused tests and Android bundle export passed.
- Native Python Playwright checked 360/390/430 CSS-pixel widths, horizontal overflow, Create-sheet navigation and JavaScript errors.
- Isolated API contract checks passed: live zero data, unavailable supplementary schedules, offline dashboard and no substitution of demo records. No production requests or real credentials were used in these checks.
- `git diff --check` passed. No frontend/backend edits, migrations, production writes, deployment, commit or push.

## Incomplete / native checks

Android device or emulator verification remains pending: ADB was absent from PATH and the standard local SDK location. The browser screenshots do not establish native safe areas, Android hardware Back, TalkBack, keyboard resizing or native scrolling performance. Android export proves bundling, not device execution.

The customer list, quotation builder and project detail reference screens have not been redesigned. Other destinations retain existing prototype/read-integration notices; payment/customer/quotation creation is not enabled through fabricated writes. Notifications currently summarize actual dashboard counts rather than providing a full notification inbox. Missing photos remain fallbacks.

## Files changed for this task

- `app/(contractor)/index.tsx`, `_layout.tsx`; new `create.tsx`, `projects.tsx`.
- New `src/assets/Illustrations.tsx`, `src/components/ApprovedDashboard.tsx`, `src/core/dashboardPresentation.ts`.
- `src/core/workspace.ts`, `src/data/demo.ts`, `package.json`, `package-lock.json`.
- `tests/workspace.test.ts`; new `tests/dashboard.test.ts`.
- New `qa/check_approved_dashboard.py`, `qa/check_approved_contracts.py`, `qa/compare_dashboard.py` and this report/screenshots.

Other pre-existing dirty mobile files were preserved.
