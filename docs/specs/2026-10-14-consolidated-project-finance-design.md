# Consolidated project finance

## Goal

Give customers and their contractor a shared, clear view of accepted quotation projects, payments received, outstanding balances, and receipt documents. A customer with several approved quotations should be able to understand the account across all of them without adding the amounts manually.

## Audience and entry points

- Customers: add an **Approved projects and payments** view reachable from the existing customer dashboard payment shortcut and customer navigation.
- Contractors: add a per-customer **Project account** view reachable from customer details/history. Scope it to the signed-in contractor's connected relationship with that customer.

Both views use the same project ledger, with role-appropriate document access and navigation.

## Project ledger and balance rules

- Include quotations accepted by the customer (the persisted `ACCEPTED` state) and their later project progress.
- Show one row per quotation/project with quotation number, property, project state, project amount, paid amount, balance, and links to the quotation or final invoice.
- Before a final invoice exists for a completed project, use the accepted quotation's grand total as its project amount. Count confirmed schedule advances and quotation-level ProjectReceipt records as payments.
- When a non-cancelled final invoice is associated with a completed project, use its grand total and invoice payments as the project's amount and paid total. Do not add the original quotation amount or carry-over copies of quotation receipts a second time.
- Exclude canceled invoices. Do not count unconfirmed schedule advances. Keep balances at zero rather than displaying a negative due; show excess payment as credit if the current finance contract reports it.
- The account totals are the sums of the visible project rows. A property-filtered view totals only projects at that property.
- Show a combined receipt history with receipt number, date, project/quotation, method, reference, amount, and PDF action when the viewer has access. Every row remains associated with its source record.

## Access and privacy

- Customer view uses the existing customer finance and property payment/invoice permission rules; preserve hidden totals when the customer lacks the relevant permission.
- Contractor view is restricted to the current contractor's connected customer records and quotations. It shows only receipts and invoices belonging to that contractor.
- Continue using the existing PDF endpoints, which enforce their own access checks.

## Screen behavior

- Keep the summary totals, project rows, and all-receipts list scannable on desktop and usable at 360px. Rows reflow to labeled values on narrow screens.
- Allow expanding a project's receipt entries and opening its quotation or invoice.
- Distinguish initial loading, empty accepted-project history, no receipts, permission denial, and load failure with retry. Preserve the already loaded portion if one API call fails.
- Show only example values in design previews; actual totals come from the server.

## Existing system context

`CustomerInvoices` already renders invoices and receipt history from `/billing/customer-finance/` and `/quotations/customer-portal/invoices/`. The finance endpoint already collects quotation ProjectReceipt entries, confirmed advances, and invoice payment receipts, but its invoice totals only include completed projects. The implementation should extend the existing finance data flow and customer pages, and add the contractor customer-scoped equivalent, rather than create a second payment store.

## Preview

The visual concept is at `.superpowers/brainstorm/preview/content/accepted-projects-finance-preview.html`; PNG previews are adjacent to that session's state directory. All amounts and project details shown are illustrative.
