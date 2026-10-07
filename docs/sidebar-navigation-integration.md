# Approved sidebar navigation — live integration

The user approved the interactive preview and requested integration. The application now uses the proposed grouping and single navigation configuration on authenticated pages.

## URLs

- Live application: http://localhost:5173/dashboard (requires your existing sign-in).
- Account/security page used for layout verification: http://localhost:5173/account-security.
- Interactive review preview remains available: http://localhost:5173/preview/sidebar.

## Changes

- `frontend/src/config/navigation.js`: shared labels, routes, Lucide icons, groups, ordering, role lists, aliases and badge keys. Moved from preview code; the preview re-exports the same configuration.
- `frontend/src/components/Sidebar.jsx`: live role-aware grouped navigation, 250px expanded/72px rail, active parent matching, user/role-specific group preferences, API counts, accessible rail flyouts, mobile modal drawer and pinned account/share/logout footer.
- `frontend/src/components/sidebar.css`: scoped live styling, existing brand/color tokens, focus indicators, scrollable module list, touch targets, tooltips, responsive drawer and dark appearance support (system preference or `.dark`/`data-theme="dark"`; explicit `data-theme="light"` suppresses automatic system dark).
- `frontend/src/hooks/useEmploymentStatus.js`: shared active-membership resolution. Only a 404 proves independent employment; loading/network errors retain common modules while withholding employment-specific destinations. Refreshes on focus and `bp-employment-changed`.
- `frontend/src/layouts/DashboardLayout.jsx`: shared employment eligibility, safe persistence of existing collapse preference, stable drawer callback, opener/background refs and inert-background boundary including mobile quick navigation.
- `frontend/src/components/Topbar.jsx`: accessible hamburger relationship, opener ref and 44px minimum target.
- `frontend/src/components/MobileBottomNav.jsx`: independent/in-house employee shortcuts use central navigation eligibility; generic admin Professionals wording.
- `frontend/src/components/ShareAppButton.jsx`: matching footer style, portal-based sharing dialog, keyboard focus/trap and Escape behaviour. A nested sharing dialog closes before the navigation drawer.
- `frontend/src/preview/sidebar/navigation.js`: re-exports shared production configuration.
- `frontend/src/preview/sidebar/qa-live-sidebar.mjs`: reproducible isolated browser verification against the real authenticated layout.
- `docs/sidebar-navigation-preview.md`, this document: page mapping and handoff.

The mapping and missing destinations are unchanged from the approved proposal. Business Profile stays within Settings; Properties owns measurements; sent/received subcontract work uses one destination. No standalone Calendar, Notifications, Expenses or contractor-wide employee/contractor-payment module was added.

## Preserved behaviour

Existing App routes, forms, authentication, backend permissions, API endpoints and database schema are preserved. Sidebar links use React Router normally; mobile navigation closes after a route commits. Opening/closing or collapsing navigation does not remount the page form. Profile/security/QR, Share App and real logout are retained.

Real badge counts come from `/quotations/portal-notifications/` and `/jobs/applicator-bookings/`, refresh every 15 seconds, on window focus, on `portal-counts-changed`, and after route changes. Employee messages/support also use the portal counts endpoint. Independent/in-house membership is resolved once in the layout so sidebar and mobile shortcuts agree.

## Verification

- Configuration/icon/route verification: PASS (57 configured role-scoped entries; all destinations registered, Lucide exports valid, no duplicate destinations within each role/employment state, path-segment and alias parent matching).
- Frontend lint: PASS with 16 existing warnings outside the new sidebar/eligibility code.
- Production build: PASS; live navigation is bundled and development previews remain development-only.
- Live browser verification: **59 assertions passed** against actual Sidebar, DashboardLayout, Topbar and MobileBottomNav components using isolated authenticated API fixtures. No real credentials or database/form writes.
- Checks: all five role menus and exact link sets; in-house versus independent eligibility; membership-loading/error handling; API-sourced badge updates; expanded/rail sizing; remembered groups/collapse; first rail group keyboard focus and Escape return; mobile focus trapping, inert background, scroll lock, backdrop/selection/Escape close and desktop-breakpoint cleanup; sharing-dialog focus/escape; unchanged unsaved form input; scrollable short-screen navigation; no horizontal overflow at 320/390/768/1440px; real logout clears the isolated session and redirects to Login.
- No uncaught page exceptions. Fixture 404 (missing membership) and 503 (membership service unavailable) responses were intentionally exercised. The headless browser also reported Vite hot-reload WebSocket requests blocked by its local-network-access policy; this did not prevent page rendering or interaction.
- Screenshots captured and inspected: `output/design-previews/sidebar-live-desktop.png`, `sidebar-live-rail.png`, `sidebar-live-dark.png`, `sidebar-live-mobile.png`. Screenshots use explicitly isolated QA account data.

These are frontend contract/layout checks, not an authenticated end-to-end validation of every existing business module's backend workflow. Backend code was not changed for this integration.

## Operational note

C: filled during screenshot capture. Only generated `frontend/dist` output was removed to recover room; the production build subsequently regenerated it successfully. No source or unrelated user files were removed.

The Vite development server is running on port 5173. If it stops after a restart, run `npm.cmd run dev -- --host 127.0.0.1` from `frontend`.
