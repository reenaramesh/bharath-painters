# Subcontract scope offer implementation plan

Approved scope: docs/specs/2026-10-07-subcontract-scope-offer-proposal.md.

Goal: choose quotation lines and send an offer without customer prices.

Architecture: additive quotation_item_ids input on the existing work-order API. Snapshot descriptions, categories, quantities and units into the existing nullable-project-scope model with zero customer rates. Redact legacy scope rates for recipients at serialization. Preserve existing project_scope_ids clients and the separate subcontract quote/invoice workflow. No database migration is needed.

Review refinements: recipients receive `agreed_amount: null` until an accepted current subcontract quote exists, because legacy offers may contain copied customer totals. Owners/admins retain access, stored amounts and invoices remain unchanged. Full descriptions over the existing 200-character snapshot limit are preserved in the text scope summary. Retry reconciles server status so lost successful send responses do not leave an offer stuck.

Tech stack: Django REST Framework, React, Vite, Django API tests and Node checks.

- [x] Write regression tests for selected quotation-line snapshots, foreign/empty selections, legacy scope rate redaction, owner visibility and rollback.
- [x] Run those tests to establish failures.
- [x] Add validated line selection and atomic create, then redact rates from non-owner scope responses.
- [x] Run focused backend tests and existing outsourcing tests using an isolated test database.
- [x] Update creation UI: quotation detail line picker, loading/error states, cleared selection on quotation change, no customer price prefill, price-free review, create/send with draft retry.
- [x] Update recipient scope table to omit customer rate columns.
- [x] Verify frontend payload and send/retry behavior, build and lint; review privacy and compatibility. Preserve unrelated edits, do not commit them or use the live database for tests.

Validation: 54 backend tests passed in the final isolated runner (test-only MD5 hashing; no production settings change). A preceding run with normal hashing passed 53 tests before the final forged-acceptance regression was added. Four frontend helper tests, mocked React selection/stale-fetch/failed-send checks, targeted lint and production build passed. Security review findings were fixed and reviewed again. Real browser/mobile visual verification remains unavailable in this session; mocked rendering is not a visual sign-off.

Final privacy refinement: recipient-visible confirmed amounts are derived from the accepted subcontract quote total, never the legacy work-order amount. Quote status is read-only on creation and new quotes are forced to DRAFT; only the existing main-contractor decision workflow can accept them.
