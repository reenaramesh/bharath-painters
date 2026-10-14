# Starter integration — Contractor foundation

## Isolation and source audit

Changes are confined to mobile/. The supplied ZIP was already present as an untracked root file; mobile/designs/ was also untracked before this increment. No AGENTS.md was found in application source folders. Reviewed Django account roles, login/profile serializers, URL modules, ContractorCrmDashboardView, verified Contractor guards, property_access.py, REST settings, and the existing frontend Contractor dashboard. Frontend, backend, PostgreSQL and deployment files remain unchanged. No production endpoints were called during validation.

## ZIP merge decisions

The archive contains 24 entries, 16,926 uncompressed bytes, one Expo SDK 54 app and no image assets. It was path-checked and extracted temporarily for inspection. The application remains directly in mobile/app and mobile/src, with no nested runnable starter app.

Copied and adapted the actual starter src/theme/tokens.ts and src/components/DashboardCard.tsx. PremiumDashboard.tsx adapts the starter's welcome header, two-column metrics and icon action grid, using existing authenticated routes, MD3 controls, Manrope and dark-mode colors. Kept SDK 55 and the existing package lock, root Router stack, Android package, five tabs, SecureStore and refresh client. No dependency installation was needed; SDK 54 package declarations were not copied over SDK 55. Starter sample data and placeholder routes were not promoted to live data or implemented workflows.

## Connected contracts (relative to /api)

| Contract | Mobile use |
|---|---|
| POST accounts/login/ | Existing identifier/password payload and access/refresh/user response |
| POST accounts/token/refresh/ | Existing single-flight refresh and authenticated retry |
| GET accounts/me/ | Native session restoration |
| GET accounts/menu-visibility/ | Deny optional tools until permissions load; Settings/sign-out stay reachable |
| GET quotations/contractor-crm/dashboard/ | Real counts, estimate value, profile completion, pipeline, follow-ups, site visits, recent quotations and customers |
| GET accounts/contractor-profile/ | Business summary; retain only company/owner/address/service areas, discard bank/document fields from repository cache |

Dashboard/profile reads share a 60-second memory cache scoped to the signed-in user. Returning to Home within that interval does not repeat reads. Pull-to-refresh bypasses it; concurrent reads are deduplicated; logout/expiry/demo entry invalidate it. Profile failure shows an explicit message without replacing the dashboard with sample values. No timers or polling.

Quotation value is estimate value, not receipts. Active leads on this API mean connected customer CRM stages; they are not an independently calculated count of leads/ records. No active-project count exists in this response. The starter's fabricated count is omitted. Completed portfolio and scheduled work remain distinct concepts.

## Current module coverage

Implemented now: authenticated Contractor Home, business summary, five tabs, permission-aware navigation, skeleton/error/empty states, secure native session, local theme settings. All ten module entry points remain available as permitted by the backend menu and verification flags.

Customer list/detail reads, connected-customer creation, property list/detail reads, and property creation for an approved connected customer now use the existing REST contracts. The property form is reachable from the Properties tab and from a customer detail. Outsourced & Received Work now has live, read-only list/detail screens using the existing role-scoped work-order APIs; recipient pricing and scope rates are never added by the mobile mapper, and work-order writes remain on the existing web flow. Measurement editing, property sharing/contact invitations, quotation creation, schedule management, invoice/payment operations and richer messaging remain read-only/demo flows or explicit integration notices. No financial writes are enabled. Customer, PAINTER (employee/professional), Admin and Support still have guarded holding screens; these are not completed dashboards.

## Next increments and mapped endpoints

1. Customers: quotations/customers/, customers/:id/, customers/:id/follow-ups/. Properties: quotations/properties/, properties/:id/. Many generic lists currently return arrays with no global DRF pagination; do not pretend a page parameter bounds them. Establish a safe list strategy from supported filters before enabling broad fetches; backend pagination needs a separate approved change.
2. Measurements: quotations/properties/:id/measurement-records/, rooms/, measurements/ and room-measurement/save/. Preserve property access flags, units, opening deductions and surface/group rules. Material/catalog APIs and web calculation parity must be inspected before writes.
3. Quotations: quotations/ (the URL module's empty path), quotations/create/, quotations/:id/, quotations/:id/submit/ and PDF routes; quotations/project-scopes/. Native wizard requires calculation/GST/pricing parity before enabling creation.
4. Leads and follow-ups: quotations/leads/, site-visits/, customers/:id/follow-ups/. Active work: jobs/work-schedules/; completed portfolio: accounts/profile-card/projects/. Do not invent a generic projects endpoint.
5. Payments: quotations/invoices/, invoices/:id/payments/; billing receipts/revenue. Keep invoice receipts and schedule advances distinct.
6. Messages: quotations/chat/conversations/, contacts/, conversations/:id/messages/, safety/ and attachment routes. No websocket assumption or background polling.
7. Profile/settings writes and dedicated Customer/PAINTER/Admin flows after permission-specific verification.

Full source route inventory and role inventory are in AUDIT.md and route-inventory.md. Native device testing, real development-backend connectivity, signed builds and Play Store release remain outstanding. No deployment or push was performed.
