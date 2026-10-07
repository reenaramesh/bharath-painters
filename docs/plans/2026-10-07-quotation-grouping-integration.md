# Grouped quotation workflow integration plan

Goal: integrate the approved test workflow into the existing builder while preserving all PDF actions, existing buttons, commercial totals and Lump Sum behavior.

Architecture: shared pure assignment calculations plus a production workspace driven by existing room/measurement/master API data. Group quantities feed existing quotation items and existing PDF/tax/discount code. No measurement formulas or records change.

- [x] Share and test the assignment calculation module; snapshot current action labels before edits.
- [x] Create a reusable assignment workspace with measured-room rows, group/service editors, eye/pencil actions and responsive popups. Use existing master records, never fixtures in production.
- [x] Integrate into measured interior Step 2; keep existing step navigation and all existing actions. Show the approved horizontal final rows in Step 3 with current totals and PDF controls intact. Preserve exterior and Lump Sum paths.
- [x] Persist structured group and measured-surface references using one optional JSON field on QuotationItem. Existing included_areas accepts display strings only; it cannot safely retain structured source references. Add an additive migration and serializer validation; no existing columns are renamed/dropped.
- [x] Preserve group metadata during ordinary quotation edits. Reuse existing backend pricing and PDF logic unchanged.
- [x] Run assignment/UI tests, backend serializer/trace/PDF checks, production build, and action/header regression checks.

Workspace: preserve the user's existing uncommitted changes; no resets, staging, commits or unrelated changes. The test module remains available.

Verification: 20 frontend tests and 9 backend tests pass; targeted lint, production build, migration consistency, and exact PDF/footer preservation checks pass. Visual browser verification remains pending because no browser is connected. Two older API tests also fail with the pre-integration serializer due to missing connected-customer fixtures.
