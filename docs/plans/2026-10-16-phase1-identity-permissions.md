# Phase 1 Identity and Permissions Implementation Plan

> For implementation in the current protected worktree; tests run on Django's isolated test database.

**Goal:** Close the confirmed identity, tenant-ownership and permission gaps specified in the Phase 1 brief, preserving current records and workflows.

**Architecture:** Reuse global Customer identity, ContractorCustomerConnection, PropertyContact/PropertyPermission, team memberships, work-order ownership and existing support role gates. Keep each domain's policy in its current helper/handler. Add only narrowly scoped response changes where payment access needs to be distinct from invoice access. Avoid schema changes unless inspection proves they are required.

**Tech Stack:** Django REST Framework, Django ORM, existing Django TestCase/APITestCase.

## Checkpoint and baseline

Branch: `fix/phase1-identity-permissions-20261016`, created from the existing local checkpoint without changing the working files. The branch retains the committed UI checkpoints. Pre-existing dirty files include Phase 1 backend diffs/tests plus unrelated CRM, quotation, mobile and share-contact work; do not stage them as a group. No destructive Git operation. The customer identity regression suite passed 13 tests using SQLite's in-memory Django test database. No production/shared database migration or data backfill is authorized or needed by this plan.

## Implementation tasks

1. **Shared customer authorization:** Review customer identity/connection helpers and `MeasurementAccessPrepareQuotationView`/`LeadListCreateView`. Keep global mobile uniqueness, allow only active connected or explicitly supported legacy owner relationships, reject unrelated customer/property IDs, and verify approved measurement access reuses the same customer. Extend the existing relationship tests before making any additional behavior changes.
2. **Property rights and finance:** Trace existing PropertyContact rights through `accessible_properties`; test primary, secondary, view-only, finance and custom rights. In `CustomerProjectFinanceView`, keep invoice detail under `VIEW_INVOICES`; independently scope payment records, totals and aggregates to `VIEW_PAYMENTS` for both filtered and unfiltered requests, without crossing properties. Extend permission matrix tests; change `CustomerInvoices.jsx` only if its response rendering confuses restricted values with zero.
3. **Employee ownership/history:** Verify contractor-owned membership scoping and painter self-access in `InHouseApplicatorDetailView`; test inactive membership, cross-employer records and historical attendance/wages. Inspect the legacy remove endpoint and its cascade semantics; preserve membership history and safe route compatibility. Extend focused workforce tests first.
4. **Subcontract assignment:** In `WorkOrderAssignmentView`, require receiving-side ownership, eligible state, active eligible receiving-contractor membership and account state, and reject duplicate live assignments without resetting an existing record. Retain legitimate released-record history/reproposal rules. Extend focused assignment tests first. Do not implement assignment-response workflow.
5. **Support search:** Keep global customer search restricted to support/admin staff. Handle null legacy contractor, disconnected relationships and anonymous claimed ticket identity distinctly from authenticated account identity. Extend support tests before changes.
6. **Verification/report:** Run each focused suite sequentially, then related existing tests for touched handlers. Run only the relevant full focused Django test modules, not the full application regression suite. Inspect API compatibility and `git diff --check`; if frontend changes are needed, run build and the required 360/390/430/490/768/desktop checks. Update the Phase 1 report with exact outcomes and unresolved gaps. Stop at Phase 1.

## Explicitly outside scope

No UI redesign, quotation/measurement calculations, GST, wages/attendance formulas, ProjectScopesPanel restoration, account deletion policy, schema migration/backfill, deployment, push or Phase 2 work.
