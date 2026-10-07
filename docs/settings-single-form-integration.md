# Approved single-form Contractor Settings integration

Live URL: http://127.0.0.1:5173/settings

## User-visible changes

- Company details and Trade & services are now one **Business details** form.
- Shared fields have one editable input: core/additional/sub-services, company identity/contact, service areas, business experience, declared workforce, free-text skills, banking/tax, documents, social links and business/network preferences.
- Office address and professional base location remain distinct. Declared workforce is separate from registered employee membership counts.
- Explanatory help paragraphs and repeated introductions are removed. Labels, validation errors, upload state and save feedback remain.
- One Save changes / Discard changes bar handles Business details and Appearance together; forms stay mounted across section switches.
- Existing appearance controls are reused, including app colour presets, PDF colour templates, custom colours, font templates and quotation/invoice/area-report previews.
- Existing document/photo URLs remain visible; uploads, replacement and removal use the actual company fields.
- QR/public profile opens the real `/profile` flow in another tab so unsaved Settings remain intact. Account Security remains available through the account navigation.
- `?tab=company` and `?tab=trade` both open Business details. Appearance and legacy profile/theme redirects remain supported.
- Employee Settings retains its existing role-specific modules/APIs; this approval was for the contractor Company/Trade merge.

## Save implementation

`GET/PATCH /api/accounts/business-settings/` is a contractor-only facade over the existing ContractorProfileSerializer and ProviderProfileSerializer. It uses existing tables and requires no new migration.

PATCH accepts multipart `company` and `provider` JSON objects plus existing upload names (`company_logo`, `profile_photo`, `gst_document`, `business_document`). Validation runs before writes; both saves and optional publication run inside one database transaction with existing row locks. A failure rolls back company, user identity, provider and claim-record changes. Clearing stored files schedules deletion only after commit.

The frontend sends changed fields only. Coverage and experience go to company ownership; declared workforce goes to provider ownership, which mirrors the legacy company count using the established rule. Omitted shared fields are not rewritten. Explicit zero remains a real value. Conflicting explicitly supplied aliases are rejected.

Existing service-claim notes, inactive flags and category-only claims are preserved when service selections change. Existing free-text skills remain separate from structured catalogue choices. The core service is excluded from additional selections. Switching core retains the previous offered category and its claims as an additional service; explicitly removing an additional service removes its dependent sub-service selections.

Profile publication reuses the existing branding snapshot/publish rules. Published profiles offer Draft/Published states, not an unsupported unpublish operation. Successful saves refresh auth-dependent identity/photo/branding and dispatch existing company/theme refresh events. Refresh failure is reported after a successful save without pretending the transaction failed.

## Main files

- `frontend/src/components/BusinessSettingsForm.jsx`: shared approved live/preview form.
- `frontend/src/components/business-settings.css`: shared responsive field/card/alignment styles.
- `frontend/src/pages/ContractorBusinessSettings.jsx`: live load/save coordinator.
- `frontend/src/utils/businessSettings.js`: normalization, changed-field payloads and preservation rules.
- `frontend/src/pages/Settings.jsx`: role-aware integration.
- `frontend/src/pages/ContractorSettings.jsx`: reusable controlled, fields-only Appearance mode.
- `frontend/src/preview/settings/MergedSettingsPreview.jsx`: sample-data wrapper around the same form.
- `backend/accounts/views.py`, `backend/accounts/urls.py`: transactional facade and shared publication helper.
- `backend/accounts/test_business_settings.py`: new persistence/rollback/permissions/multipart tests.
- `frontend/src/preview/settings/verify-business-settings.mjs`, `qa-live-settings.mjs`: payload and browser checks.

## Verification

- 35 existing provider-profile tests passed.
- 13 merged Settings tests passed: combined writes, PATCH omission/conflicts, validation and save rollback, publishing rollback, multipart document upload/removal, malformed JSON and role restrictions. Upload storage uses an in-memory test fixture; no real user uploads or live records are changed by these tests.
- Payload checks passed for omitted aliases, zero values, claim-note/inactive/category-only preservation, free text, deduplication, clearing and publication.
- 44 browser checks against the actual Settings components passed using isolated authenticated API fixtures: combined save, failed-save retention, shared-field ownership, uploads/removal, publication, auth/branding refresh, hidden-field validation focus, section state, legacy routes and responsive layouts. The sole HTTP 400 was the deliberately simulated failed-save scenario; there were no uncaught application errors.
- The sample preview's 42 browser assertions also passed after extracting the shared form.
- Frontend lint passed with the 16 pre-existing warnings; production build passed.
- The running local backend recognizes the new endpoint: unauthenticated GET returns the expected 401 with GET/PATCH allowed.
- Screenshots captured and inspected: `output/design-previews/settings-live-merged-desktop.png`, `settings-live-merged-mobile.png`, `settings-live-merged-appearance.png`.

Browser fixture checks do not claim an authenticated end-to-end save against the live development database; persistence and rollback are verified separately by the Django tests. No schema migration, commit, push or deployment was performed.
