# Contractor mobile modules

The contractor tabs and More tools use the shared native list screen at `/module/[module]` and record screen at `/record/[module]/[id]`. Both check the existing role and menu permissions before loading data.

| Module | Live read source | Connected behavior |
| --- | --- | --- |
| Customers | `/api/quotations/customers/` | Search, call, WhatsApp, add customer |
| Properties | `/api/quotations/properties/` | Search, view property, open its measurements, and add a property for an approved connected customer |
| Leads | `/api/quotations/leads/` | Search and view lead details |
| Quotations | `/api/quotations/` | Search and view quotation details |
| Measurements | Properties, then `/api/quotations/properties/:id/measurement-records/` | View a property's saved measurement records |
| Projects | `/api/jobs/work-schedules/` | View current and completed project schedule data |
| Schedules | Work schedules and `/api/quotations/site-visits/` | View work schedules and site visits |
| Payments | `/api/quotations/invoices/` | View invoice and balance information |
| Messages | `/api/quotations/chat/conversations/` and conversation messages | Read conversations and send text messages |
| Outsourced & Received Work | `/api/outsourcing/work-orders/`, `/api/outsourcing/work-orders/:id/` | Read work orders and scope snapshots; server authority controls the counterparty and price fields |
| Settings | Existing account/profile screens | Existing behavior retained |

Customer creation posts only the customer name, mobile number, and optional address/city to the existing customer API. It does not issue a duplicate connection or create a payment. Property creation posts the selected connected customer and supported project/location/measurement-unit fields to the existing property API; the server remains authoritative for connection permission. Message sending posts `{ "text": "..." }` to the existing conversation message endpoint.

Work orders are read-only in the native app. Sending offers, transitions, corrections, scope changes, assignments, quotes, invoices, wages, and subcontractor payments remain on the existing web flow until each native write can preserve its role and financial rules. Quotation editing/submission, measurement entry, property sharing/contact invitations, invoice creation, payment recording, schedule changes, and lead/site-visit creation also remain unimplemented in the native UI. The existing web app remains available for those actions.

The module lists preserve existing rows on refresh errors, provide retry and empty states, and support local search. API results remain scoped by the existing Django permissions.
