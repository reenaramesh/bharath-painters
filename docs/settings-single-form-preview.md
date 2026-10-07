# Single-form Settings preview

Review URL: http://127.0.0.1:5173/preview/settings

**Approved and integrated:** Contractor Settings now uses the same shared form at `/settings`. See `docs/settings-single-form-integration.md` for the live save API and verification details. The notes below describe the original preview stage.

The user requested a preview combining `/settings?tab=company` and `/settings?tab=trade` into one form, without repeated information or explanatory help text.

## Layout

- Business details is one combined form with aligned section cards: Company & contact; Services & experience; Professional introduction & branding; Payment & tax details; Documents & social links; Business preferences.
- Appearance remains a separate section with shared form state and a single Save changes / Discard changes bar.
- Company name, service areas, years in business, declared workforce count, core service, skills and professional base location each have one editable field.
- Office address and professional base location retain their distinct meanings. Free-text skills remain editable alongside structured services.
- Core service is excluded from additional choices. Selecting a new core retains the previous core as an additional service so its sub-services are preserved. Explicitly deselecting an additional service removes its obsolete sub-service selections.
- Field labels and validation/status messages remain. Explanatory hints, duplicated introductions, help paragraphs and readiness sidebars are absent.
- Responsive two-column fields become one column on small screens. Tabs/cards share a consistent content edge and width.

## Interactions

Service and sub-service selection, file/photo selection, additional social links, business toggles, appearance presets, colour/font controls, local save/discard, keyboard tabs and sample profile modal are interactive. Edits persist when changing sections. An invalid field in a hidden section opens that section and receives focus.

This development-only preview reuses the existing preview form/card components and service catalogue. It uses fictional data and makes no backend API requests. Local saves are in component memory and reset on reload. The profile modal contains an explicitly labelled QR placeholder; draft/published state is simulated, not a real publishing API workflow.

The real `/settings` page has not been replaced. In this preview only, `?tab=company` and `?tab=trade` both open Business details. Production routing and backend ownership/save integration require a subsequent approved implementation.

## Changed files

- `frontend/src/App.jsx`: development-only `/preview/settings` route.
- `frontend/src/preview/settings/MergedSettingsPreview.jsx`: interactive single-form layout.
- `frontend/src/preview/settings/merged-settings.css`: scoped responsive styles.
- `frontend/src/preview/settings/qa-settings.mjs`: browser verification.
- This document.

## Verification

- Browser automation: **42 assertions passed**. Covered unique shared fields, absence of help paragraphs, service/sub-service deduplication, retention of free-text and unsaved edits, upload display, local save/discard, custom-link removal, hidden-section validation focus, keyboard navigation, appearance font rendering, modal focus return and alias-section behaviour.
- No horizontal overflow at 320/390/768/1440px; cards and tabbar align at each width.
- No backend API requests; no uncaught page errors; no browser console errors/warnings or failed requests in the successful verification run.
- Frontend lint passed with 16 pre-existing warnings outside this new preview.
- Production build passed; the preview branch is excluded from production builds.
- Screenshots captured and visually inspected: `output/design-previews/settings-merged-desktop.png`, `settings-merged-mobile.png`, `settings-merged-appearance.png`.

If Vite stops, run `npm.cmd run dev -- --host 127.0.0.1` from the `frontend` directory.
