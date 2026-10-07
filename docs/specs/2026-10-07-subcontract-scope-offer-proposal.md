# Subcontract scope offer proposal

Status: proposed; no application or backend changes made for this request yet.

## Problem confirmed in the current code

The work-order form loads ProjectScope records rather than the selected quotation's service lines. Quotations without separate scopes therefore show an empty picker even when they contain services. The form filters available quotations by status, pre-fills an agreed amount from a linked scope's customer amount, and displays that amount in the scope picker. Shared scope snapshots copy unit_rate; the recipient's API response and scope table expose it. Creation produces a draft work order, so creating and sending are separate steps.

## Recommended flow

1. Choose an owned quotation, identified by reference and customer/property context.
2. Choose a connected subcontractor.
3. Select the quotation service lines intended for that subcontractor, grouped by service/category and with descriptions, quantities, and units. Keep selection manual so the sender controls the exact scope, including mixed-trade subcontractors.
4. Review a price-free offer, dates, site information, and instructions.
5. Send the offer. Report success only when the existing send transition succeeds; retain the created draft for retry if sending fails so retry does not create duplicates.

Do not send the complete priced customer quotation or automatically copy its prices into agreed_amount. Existing subcontract quotes and invoices remain separate: the recipient can price the selected work, and an accepted subcontract quote can establish the agreed amount through the existing workflow.

## Privacy requirement

Receiving contractors must not receive customer quotation rates or amounts in work-order list/detail/share/transition responses. They see only assigned scope content and their own subcontract commercial records. Hide customer rates in the recipient UI and enforce redaction in API serialization, including previously created scope snapshots. Verify direct quotation, project-scope, and export access cannot expose the owner's priced quotation to the receiving contractor. Main-contractor access to their own quotation remains unchanged.

## Scope of implementation

Frontend work-order creation and detail components; narrowly scoped outsourcing API input validation, snapshot creation, and recipient serialization; regression tests. Use existing models if they can represent the chosen line snapshots without losing scope details. Confirm model requirements before deciding whether a migration is needed; do not create a migration without a demonstrated need. Preserve existing draft/active work orders, subcontract quotes, invoices, role restrictions, and all uncommitted edits.

Reject foreign quotation IDs, foreign line IDs, empty selection, self-assignment, and disconnected recipients. Validate all selections before creating a record. Use transaction boundaries to prevent partially created offers. Keep stale quotation fetches from overwriting a later selection. Provide loading, retry, empty, and validation states in the picker.

## Alternatives

- Recommended: quotation service selection with server-enforced price privacy and the existing subcontract quote workflow.
- Smaller repair: keep the separate project-scope picker and redact rates. This leaves quotations without scopes unable to offer their existing service lines.

## Verification

Regression tests must prove selected services and quantities survive into the offer, unselected services do not, customer prices are absent for recipients, owners retain their quotation access, and foreign IDs/disconnected contractors cannot create offers. Verify send failures can retry without duplicates. Run relevant backend tests and frontend checks, then inspect desktop/mobile behavior where a browser is available. Report any unavailable verification honestly.
