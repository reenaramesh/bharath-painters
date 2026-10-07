# Settings merge — resume prompt

**Latest status:** the approved contractor Company/Trade single-form merge is now integrated and verified. See `docs/settings-single-form-integration.md` before using the historical restart instructions below. Employee Settings continues to use its existing role-specific trade/personal modules; review any remaining employee work against the current code rather than assuming these older incomplete items still apply.

Saved for resuming in a new OpenCode conversation in **Build mode**.

Copy the prompt below into the new conversation.

---

Continue the unfinished Settings merge in my project.

Project: C:\Projects\Bharath Painters Application
Frontend: React/Vite
Backend: Django
Settings URL: http://localhost:5173/settings

## Goal

Merge the existing contractor company settings and service profile into one /settings page. Do the same for employees: merge their personal profile and trade/skills profile into /settings.

I do NOT want separate Contractor Profile, Service Profile, Employee Profile or My Trade Profile pages. Reuse modules already built. Avoid repeated editable fields and duplicate navigation entries.

## Requirements

- Contractor Settings: company/contact details, core service, additional services, individual sub-services, experience, coverage, team size, banking, documents, social links, branding and network preferences.
- Employee Settings: personal details, primary trade, additional skills/sub-services, experience, work locations and emergency information.
- Each shared concept must have only ONE editable input across the merged page.
- Core service must not also appear as an additional selection.
- Service and sub-service selections must not contain duplicates.
- Preserve existing data and supported functionality.
- Keep office address/base location/current work-seeking location distinct where their meanings differ.
- Preserve existing free-text skills; do not discard them when introducing structured trade selections.
- Preserve declared workforce count separately from actual registered employee membership counts.
- Old /provider-profile and /applicator-profile URLs should redirect to the appropriate /settings section.
- Preserve appearance, account security and QR/public-profile functionality.
- Preserve unsaved edits across section switches, or provide clear discard handling.
- Refresh auth-dependent name/photo/contact/branding after successful saves.

## Saved work — review before continuing

The previous session stopped midway. Changes exist on disk, but frontend integration is incomplete and has NOT passed final lint/build/browser verification. Do not assume the implementation is correct.

VS Code restarted unexpectedly while testing was in progress. The user recalls two tasks having completed before the interruption. Inspect the current code and available test output to establish what actually completed; do not assume tests finished successfully.

### Backend changes

- Added backend/accounts/profile_field_ownership.py.
- Modified backend/accounts/serializers.py and views.py.
- Modified backend/accounts/test_provider_profile.py.
- Current attempted ownership:
  - ContractorProfile owns service_areas and years_in_business.
  - ProviderProfile owns team_size, mirrored to ContractorProfile.number_of_painters.
  - Provider profile creation seeds values from the company profile.
- The accounts suite previously passed 65 tests.
- Review these rules carefully: silently stripping legacy API fields may break compatibility, team_size versus number_of_painters needs semantic review, mirroring must respect PATCH omission, and saves/claim replacement need transaction safety.
- Do not change tests merely to hide regressions.

### Frontend changes

- Added frontend/src/pages/Settings.jsx as a role-aware tabbed shell reusing ProviderProfile, ContractorSettings and ApplicatorProfile.
- Modified those three pages to support embedded rendering.
- Removed the workforce input from ContractorSettings.
- Removed service-area and business-experience inputs from ProviderProfile.
- Hid the provider Business identity card for employees.
- Started changing App.jsx routes and legacy redirects.
- Started updating Sidebar.jsx, but duplicate Settings destinations remain to be reviewed.

## Known incomplete items

1. Clean up Settings.jsx imports, tab panels/accessibility and form-state handling.
2. Review ProviderProfile save payload: spreading form fields may still send employee business fields.
3. Ensure employees retain useful editable professional information and can publish under consistent readiness rules.
4. Complete Sidebar navigation:
   - Painter menu already has a Settings link.
   - settingsLinks still points contractors to Company Details at /settings and painters to /appearance labelled Settings.
   - Consolidate these without duplicate entries; retain a clearly labelled Appearance destination.
5. Update links in:
   - components/MobileBottomNav.jsx
   - components/MobileDashboardShortcuts.jsx
   - components/Topbar.jsx
   - components/PainterDigitalCard.jsx
6. Review App.jsx role guards and redirect behavior.
7. Update frontend/src/preview/bharathApps/screens/mergedProfile.jsx so /settings is canonical; it previously proposed /provider-profile.
8. Verify form saving, shared-field synchronization, legacy routes, role-specific fields, duplicate selections and mobile layout.

## Workflow

- Inspect git status/diff and any AGENTS.md first.
- Preserve unrelated pre-existing changes; the repository contains other unfinished work.
- Reuse existing components and APIs instead of copying entire forms.
- Use apply_patch for edits.
- Keep a task list and finish implementation plus verification.
- Do not commit, push, deploy or run migrations unless specifically needed and approved.
- Run relevant backend tests, frontend lint/build and browser automation for contractor and employee Settings.
- Report exactly what changed, verification results, URL and any remaining limitations.
- Unrelated quotation test failures existed before this task; keep those separate from this Settings merge.

Please review the saved changes, fix incomplete or incorrect work, and finish the merge.
