# Pending workflow connections

Authorized scope: implement report items A2, A3, C1, C2, D1 and E1 while preserving current workflows and UI patterns. This extends the existing contractor workspace; it does not redesign it or implement unrelated audit items.

## Dashboard and finance (A2, A3)

Add a read-only, contractor-scoped attention payload to the existing CRM dashboard. Completed schedules with no invoice appear in a final-invoicing queue. The action opens the existing quotation invoice setup; invoice creation remains explicit and preserves its HSN/GST and advance reconciliation behavior. Do not create invoices while reading the dashboard.

Show total outstanding invoice balance and overdue balance/count, excluding cancelled invoices. Overdue means a positive remaining balance and a due date before the current local date; undated invoices remain outstanding without being labelled overdue. Show requested kickoff advances awaiting payment separately from advances awaiting contractor confirmation. These amounts are distinct categories, not an additive grand total. Use Decimal arithmetic and current canonical invoice totals; do not reconcile historical data.

## Sales handoffs (C1, C2)

Site visits retain explicit completion. Add Complete & create quotation / Complete & open measurement actions; navigate only after the existing completion PATCH succeeds. Completed visits offer direct handoffs. Persisted visits carry customer/property/lead; synthetic follow-up visits preserve their customer and offer measurements only when a property actually exists. Resume an existing editable measurement through the existing helper. Quotation prefill must be visible, and clearing/searching must keep working.

The dashboard kickoff queue shows current accepted quotations without a schedule, and active schedules whose advances need a request, payment or confirmation. Respect quotation revision families, existing receipts and date confirmation. An existing schedule link expands its existing controls instead of opening a duplicate proposal form. A new schedule opens the existing proposal form. No payment request may bypass the current date-confirmation requirement.

## Subcontract attention (D1)

Show owned work orders submitted for review and pending additional-work requests with full counts and bounded previews. Receiving contractors do not receive main-contractor approvals. Link to current detail controls, preserving approval/correction and amount-decision logic. Pending extra-work requests remain visible regardless of parent status, matching existing decision rules. These alerts require no new approval endpoint.

## Call conversion (E1)

Show unresolved new calls and missed-customer calls on the dashboard, excluding dismissed/blocked callers and booked events. Link to the call inbox with the selected event and a Convert & book site visit action. Collect the remaining customer/visit details in the existing dialog pattern. Reuse customer creation/linking and consent behavior. A saved contact or pending connection does not grant permission to schedule work; explain pending approval and retain progress.

Customer-linked calls without a booking remain in attention until handled, so pending approval does not silently remove the remaining booking task. Call names and name search use the contractor's saved representation until current work authorization permits canonical customer data. Successful creation retains an explicit activation-share action; no message is sent automatically.

Add an optional one-to-one booked-follow-up reference on CallInboxEvent and an additive booking endpoint. Lock the event, recheck ownership and current customer authorization, create an existing SITE_VISIT CustomerFollowUp and attach it atomically. A retry returns the same booking. Do not fabricate a property or opportunity or store hidden booking data inside unrelated contact JSON. The nullable relation is backward compatible; disposable databases verify the migration before it is applied to the local development database with a verified backup.

Customer-dependent mutations acquire the customer before its connection rows. PostgreSQL customer locks use NO KEY UPDATE where no customer key is changed, preserving compatibility with existing foreign-key checks during property preparation and audits. Connection actions and legacy saved-contact activation follow that order; existing permissions and transitions remain unchanged.

## Presentation and verification

Reuse the existing SectionCard, StatCard, buttons, status badges, dialogs and responsive styles. Preserve navigation/menu visibility and all current create/edit/payment/approval actions. Show loading, empty and recoverable error states; mutations require an explicit click and retain form data on failure. Refresh dashboard attention on return and explicit refresh.

Test ownership, positive balances, due-date boundaries, revision/queue rules, counts beyond preview limits, and read-only dashboard behavior. Test failed-completion navigation, booking retries and consent denial, and existing financial/approval regressions on isolated PostgreSQL. Run frontend checks and actual React/Django browser handoffs at phone/tablet/desktop widths. No business-data backfill, production migration, messaging, commit, push or deployment is included. The final live-frontend check includes applying the single tested call-booking migration to local development SQLite after backup; no other migration is applied.
