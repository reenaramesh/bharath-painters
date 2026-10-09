# Contractor Profile Showcase

Implementation status: COMPLETE for the supported existing workflows.
Full profile QA: PENDING.

Routes: `/profile` for the account owner and `/profile?contractor=<Bharath ID>` for a selected contractor. The contractor-network View profile link continues to use the latter route.

The supplied showcase and responsive CSS govern this version. The shared profile uses a compact Back/title/Favourite/Share header, real project-photo hero, overlapping circular avatar, actual verification, identity/ratings/experience/location, context actions, Overview/Services/Projects/Reviews section controls, About with Read more, available stats, service previews, four recent-project previews, service-area chips, profile verification and safe review records. View All opens the corresponding full section. Project photos open a native gallery dialog.

At 360px, customer actions use two columns with Request Quote spanning the second row; project previews use a contained horizontal strip. At 390px, three customer actions and four project previews use grids. At 430px, the avatar/padding increase and a hero collage is available when enough real photos exist. The desktop profile stays within a centred 980px container.

These responsive rules are implemented but have not been verified in a browser for this version. No visual-match or full accessibility audit is claimed.

## Data and actions

- Existing business name, profession/core service label, About text, offered services/sub-services/work skills, service areas, experience, team size, portfolio photos and public reviews are reused.
- Customer Message opens the existing conversation endpoint for an authorized connected contractor. Request Quote opens the existing service-request form with the connected contractor selected. It submits only when the customer saves the form.
- Eligible contractor partners receive Assign Work, opening the existing offer form with an authorized contractor preselected. Partner Message uses the existing WhatsApp contact link because contractor-to-contractor in-app chat is not supported by the current chat model.
- The owner sees Edit Profile and existing sharing, PDF preview/share and contact-saving controls.
- Favourite is stored on this device, scoped to the signed-in account and contractor ID. Its accessible label makes this explicit; no server-side favourite endpoint is fabricated.
- Availability and individual GST/document verification flags are absent in existing presentation data and remain hidden. The real Bharath verification flag is used.
- Private addresses, project addresses, banking/KYC information, customer contact data, internal CRM and financial records are excluded from this UI.
- The profile identity/QR disclosure preserves the company logo, Bharath ID and verification QR without enlarging the identity header.

No additional backend changes, migrations, dependencies or new quotation subsystem were introduced by this showcase task. Existing backend presentation work from earlier turns remains uncommitted.

## Files changed

- `frontend/src/components/ContractorPortfolio.jsx`
- `frontend/src/components/contractor-portfolio.css`
- `frontend/src/components/ContractorDigitalCard.jsx`
- `frontend/src/components/ContractorProfileView.jsx`
- `frontend/src/components/ContractorPublicProfilePage.jsx`
- `frontend/src/components/ContractorNetworkProfile.jsx`
- `frontend/src/components/CreateSubcontractOffer.jsx`
- `frontend/src/pages/ProfileCard.jsx`
- `frontend/src/pages/ServiceRequests.jsx`
- `frontend/src/pages/SubcontractWorkOrders.jsx`

## Validation scope

Per the supplied task instructions: one frontend production build, targeted oxlint, and `git diff --check`. No Playwright suite or regression tests were run for this version. Previously saved profile screenshots/results describe earlier layouts and are not evidence for this showcase implementation.

Results: frontend build PASS; targeted oxlint PASS; `git diff --check` PASS (line-ending notices only).

Remaining validation: browser visual comparison at 360px, 390px, 430px and desktop; gallery and keyboard interaction; customer request/chat and partner assignment flows. Live deployment remains pending and must include the existing public profile data/template changes from earlier work.

## Background-image follow-up

Added an owner-only Change background link on `/profile`, opening the Profile background upload in Settings. Upload, replace, adjust position/zoom, remove, discard and Save settings reuse the existing settings workflow. The saved background takes priority over the automatic project-photo cover, and is included in public profile presentation data and the shared HTML card. Removing it restores the automatic cover.

Two optional ContractorProfile fields were added with migration `accounts.0036_contractor_profile_background`, applied locally after checking that its plan contained only these additions. Existing profile values were preserved. Live deployment requires this migration and the frontend/backend changes.

Validation: targeted upload/position/public-image/removal integration test and two profile-presentation tests PASS (3 tests); frontend production build PASS after retrying outside the sandbox due to native process EPERM; targeted lint and diff checks PASS; migration consistency check PASS. Full browser/mobile visual QA remains pending.
