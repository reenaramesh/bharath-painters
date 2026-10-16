# Application-wide master UI implementation plan

> For agentic workers: execute incrementally in this session using executing-plans. Preserve the dirty workspace; do not create a clean worktree that drops the user's latest local files. Use the dedicated `ui/application-wide-master-20261016` branch. Commit only isolated changes belonging to this rollout.

**Goal:** Complete a page-by-page visual and interaction migration of the existing application to the user-approved illustrated Contractor Dashboard.

**Architecture:** Keep routes, Django contracts and role permissions. Improve existing shell/primitives and add narrowly scoped shared pieces only where missing. Reuse the seven optimized approved service illustrations. Track source-derived routes separately from browser/interaction evidence; a shared colour change does not complete a route.

**Tech stack:** Existing React/Vite/Tailwind, semantic CSS variables, Lucide, current i18next/transliteration integration, Node tests and sequential Python Playwright audits. No new runtime dependency.

## Milestones

- [x] Create dedicated branch without resetting or stashing the existing workspace.
- [x] Inventory all routes, inherited guards, navigation-role hints, CSS, API calls and page control patterns: `frontend/scripts/audit-ui-inventory.mjs` → `docs/application-ui-migration/routes.json` and `routes.md`.
- [ ] Document complete shared-component/workflow map and snapshot current source before broader edits; checkpoint the inventory alone.
- [ ] Establish shared service artwork mapping with explicit unknown-category fallback and role-specific welcome component; use existing `PageHeader`, `StatCard`, `SectionCard`, `FormField`, `StatusBadge`, loading/empty/error and native dialog foundations.
- [ ] Contractor batches: CRM/contact lists/details/forms; properties and populated measurements; quotation list/builder/edit/detail/history/PDF; jobs/workforce/work orders/schedules; finance; communication; profile/settings/catalogue. Inspect each source and conditional states before edits. Record changes and evidence per route.
- [ ] Painter batches: dashboard, freelance/in-house navigation and employment variants, assignments/availability/bookings/jobs, earnings, profile and messaging. Preserve conditional eligibility.
- [ ] Customer batches: dashboard/properties/access/connections, quotes/approval, payments/work progress/reviews/requests and profile. Preserve scrollable quick actions and approvals.
- [ ] Admin/support batches: dashboards/directories, verification/account actions, billing/revenue/master data/reports, tickets/integrations/settings. Preserve existing authorization and confirmation behaviour.
- [ ] Public/legacy batches: authentication/registration/recovery, invitations/join/share/profile and redirects; complement the master theme without dashboard navigation.
- [ ] Complete translation/accessibility and responsive review at 320/375/390/428/768/1024/1280/1440px. Capture populated complex screens and all role dashboards; inspect actual images.
- [ ] Run targeted calculation/draft/contact/navigation regressions and browser interactions sequentially. Run lint/build; report failures and skipped checks honestly. Finalize route statuses, modified-file list, evidence, missing assets and limitations.

## Completion gate for each route

Inspect route + page + shared controls + APIs; record conditional roles and actions. Check page heading, data density, lists/tables/forms/dialogs, loading/empty/error/validation and existing actions. Test desktop and mobile, keyboard/focus, custom themes and language fallback. Mark complete only when these checks have evidence; otherwise state the exact pending item.

Existing global theme work and the prior 23-screen audit are starting evidence only, not proof that all 98 routes are complete. Preserve functional changes from the earlier contact and people work.
