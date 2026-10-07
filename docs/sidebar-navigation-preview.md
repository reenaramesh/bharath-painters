# Bharath Apps navigation proposal

Review URL: http://localhost:5173/preview/sidebar (Vite development mode only).

**Approved and integrated:** the live sidebar now uses this configuration. See `docs/sidebar-navigation-integration.md` for the integration changes and verification results. The original preview results below remain a record of the review stage.

## Scope and inspection

Inspected `App.jsx`, `Sidebar.jsx`, `ProtectedRoute.jsx`, `VerifiedContractorRoute.jsx`, `ProviderProfileRoute.jsx`, module back-navigation rules, page files, the Work Network screens, subcontract work-order filters, revenue, master-data screens, design tokens and backend role/verification checks. Installed icons: `lucide-react` (package range `^1.31.0`). All proposed icons use that library.

The central configuration is now `frontend/src/config/navigation.js`; `frontend/src/preview/sidebar/navigation.js` re-exports it for preview tooling. Each entry has an ID, label, route, icon, group, order, role list and optional badge key, alias routes, employment eligibility and explanatory text.

## Contractor menu mapping (in proposed group order)

| Group | Preview entry | Existing route/module |
| --- | --- | --- |
| Overview | Dashboard | `/dashboard`; ContractorDashboard rendered by Dashboard |
| Customers & Sales | Customers | `/customers`; detail and quotation history remain inside Customers |
| Customers & Sales | Properties & Measurements | `/properties`; PropertyDetail, MeasurementCalculator and property calculator flow |
| Customers & Sales | Opportunities | `/opportunities`; NewOpportunity and OpportunityDetail are child flows |
| Customers & Sales | Leads | `/leads` |
| Customers & Sales | Site Visits | `/site-visits` |
| Customers & Sales | Quotations | `/quotations`; creation, measured/manual modes, details and edit |
| Work Management | Completed Projects | `/completed-projects`; existing portfolio, not a new all-projects module |
| Work Management | Work Schedules | `/work-schedules`; calendar-related existing functionality |
| Work Management | Tasks | `/tasks` |
| Work Management | Outsourced & Received Work | `/subcontract-work-orders`; one screen with status filters and work-order details |
| Work Management | Completed Work | `/completed-work` |
| Work Management | Work Photos | `/work-photos` |
| Work Management | Ratings & Reviews | `/work-reviews` |
| People & Network | My Employees | `/in-house-applicators`; creation and employee detail remain child flows |
| People & Network | Contractor Network | `/contractor-network` |
| People & Network | Job Posts & Applications | `/jobs`; Work Network tabs include `/painter-seeking` |
| People & Network | Applications & Invitations | `/job-activity`; existing distinct activity screen |
| People & Network | Team Referrals | `/applicator-team` |
| People & Network | Bookings & Requests | `/applicator-bookings`; `/find-painter` redirects here |
| Finance | Invoices | `/invoices` |
| Finance | Customer Payments & Revenue | `/contractor-revenue`; receipts and revenue tabs |
| Communication | Messages | `/messages` |
| Communication | Service Requests | `/service-requests` |
| Communication | Support Tickets | `/support-tickets` |
| Business Setup | Services & Rates | `/master-services`; contractor-scoped master data, existing backend restrictions apply |
| Business Setup | Reports | `/reports` |
| Business Setup | Settings | `/settings`; business profile, services profile and appearance sections, no second Business Profile entry |
| Business Setup | Subscription | `/my-packages` |
| Business Setup | Colors & Shades | `/colors-shades` |
| Business Setup | Activity Log | `/activity-log` |
| Account footer | Profile & QR; Account Security | `/profile`; `/account-security` |

## Other roles

- **Employee (`PAINTER` internally):** Dashboard; My Assignments, Availability & Calendar (independent only), Work Photos, Ratings & Reviews; Available Work (independent only), Applications & Invitations, Bookings & Requests (independent only), My Employment (in-house only); My Payments (`/in-house-earnings`); Messages, Support Tickets; Settings, Subscription, Colors & Shades, Activity Log, Appearance; Profile & QR and Account Security footer. Existing sidebar already distinguishes in-house employment: the preview includes that switch. No contractor customers, invoicing, outsourcing, catalogue or network-management destinations are granted.
- **Customer:** CustomerDashboard; My Properties (CustomerProperties and CustomerPropertyDetail), My Quotations (CustomerQuotations and CustomerQuotation), Shared Measurements (MeasurementAccess); Work Schedules, Completed Work, Work Photos; My Contractors (CustomerConnections), Review Contractors (CustomerContractorReviews); Payments & Invoices (CustomerInvoices); Messages, Service Requests, Support Tickets; Colors & Shades, Activity Log, Appearance; My Profile (CustomerProfile) and Account Security footer.
- **Admin:** Dashboard (AdminDashboard); Contractors, Employees & Professionals (existing Painters directory), Customer Connections (AdminCustomerConnections); Billing (AdminBilling), Subscription Revenue (AdminRevenue); Work Photos; Support Tickets, Support Staff; Service Catalogue & Master Data (MasterServices), Reports, Packages (Billing), API Settings (AdminIntegrations), Activity Log, Appearance; Profile & QR and Account Security footer. Catalogue approval/editing remains subject to the existing backend rules.
- **Support:** Support Tickets, Recovery Center (SupportWorkspace), Appearance, Profile & QR, Account Security. This additional existing role is preserved in the proposal.

## Full page inventory: non-top-level pages and routes

The tables and role lists above cover all routed top-level modules. The remaining page files are classified here rather than exposed as redundant menu entries.

| Page files | Classification / parent |
| --- | --- |
| CustomerDetail, CustomerQuotationHistory | Customers detail/history |
| PropertyDetail, MeasurementCalculator | Properties detail/measurements |
| NewOpportunity, OpportunityDetail | Opportunities creation/detail |
| QuotationBuilder, QuotationDetail, QuotationEdit | Quotations creation/detail/edit; new, new-measured, new-manual modes |
| ManualQuotationBuilder | Internal quotation-builder implementation, not a standalone route |
| InHouseEmployeeCreate, InHouseEmployeeDetail | My Employees creation/detail |
| SubcontractWorkOrderDetail | Outsourced & Received Work detail; quotes, team and payment flows |
| CustomerPropertyDetail | Customer My Properties detail |
| CustomerQuotation | Customer My Quotations detail |
| ContractorBusinessSettings, ContractorSettings, ProviderProfile, ApplicatorProfile | Embedded Settings implementations; ContractorBusinessSettings owns the merged contractor form; legacy provider/applicator URLs redirect to Settings |
| ContractorDashboard, AdminDashboard | Role-selected Dashboard implementations |
| WorkChanges, WorkReschedules | Work Schedule parent flows; `/work-changes`, `/work-reschedules` remain accessible |
| MeasurementTrial | Utility `/measurement-trial`; not a daily sidebar item |
| Login, Register, CustomerRegister, ForgotPassword | Authentication routes |
| CustomerShareLink | Public/token customer-link flow |
| FindPainter | Unrouted legacy implementation; `/find-painter` redirects to bookings |
| QuotationReset | Unrouted legacy utility implementation |
| ComingSoon | Unrouted placeholder implementation; deliberately not linked |

Aliases/utilities: `/applicator` is Dashboard; `/customer/connection-requests` redirects to connections; `/provider-profile`, `/applicator-profile` and `/contractor-theme` redirect to merged Settings sections; `/appearance` remains an existing utility for contractors but is not duplicated alongside the Settings appearance tab. `/preview/bharath-apps` and `/preview/sidebar` are development previews. Wildcard redirects remain unchanged.

**Unmapped executable top-level routes:** none. **Unrouted page files:** FindPainter, QuotationReset, ComingSoon (listed above). Internal form/dashboard implementations are intentionally not standalone navigation items.

## Missing destinations / adaptations

- No standalone Calendar route: contractor/customer schedules and employee availability are used where implemented.
- No standalone all-projects route: the existing completed portfolio retains its honest label.
- No Notifications route: relevant mock preview badges appear on existing modules instead.
- No Expenses route.
- No contractor-wide Contractor Payments or Employee Payments route: subcontract billing is in work-order detail; employee earnings is an employee-facing screen. No invented links or tab query parameters are added.
- Business Profile is the company section of Settings, not a second entry.

## Behaviour

250px desktop sidebar; 72px rail. One group level. Active parent uses path-segment matching. Active groups remain expanded; other group preferences and rail collapse persist in preview-specific localStorage keys. Rail group buttons provide focus/hover tooltips and keyboard-operable flyouts. Footer profile, account security and simulated logout remain pinned while the module list scrolls.

Mobile drawer has backdrop/Escape close, focus trapping, focus return, inert background, scroll lock, route-selection close and breakpoint cleanup. Loading/empty/long-name controls and a light/dark toggle are available. Styling reuses the app's `--bp-*` tokens and Lucide outline icons; dark overrides are scoped to the preview (the existing appearance page provides colors rather than a global dark-mode preference).

Badges in this preview are explicitly mock counts. Current production counts come from `/quotations/portal-notifications/` and `/jobs/applicator-bookings/`. A future approved integration must keep those sources and refresh events, rather than importing mock numbers.

## Permission boundaries

ProtectedRoute checks authentication; many App routes rely on page/backend permissions rather than frontend role guards. VerifiedContractorRoute checks role only, while quotation backend permissions also require verification. ProviderProfileRoute permits only CONTRACTOR/PAINTER. Backend master-data changes restrict roles/scopes; job endpoints and subcontract endpoints enforce their own role/ownership rules. This proposal neither alters these rules nor claims menu filtering protects APIs. Preview role switching does not change authentication or unlock the real modules; opening a real destination uses the current authenticated account.

## Verification results

- `node src/preview/sidebar/verify-navigation.mjs`: PASS. 57 configured role-scoped entries, all destination routes exist in App.jsx, all configured Lucide exports exist, no duplicate destinations per role/employment state, parent/alias matching respects path boundaries. Inventory inspected: 86 page files and 88 App route patterns (including preview, authentication, alias and wildcard routes).
- Browser automation: PASS, 224 assertions, 91 role-specific destination selections across contractor, employee, customer, admin and support. Checks cover current-page state and real-module link targets, in-house employee eligibility, parent/utility matching, 250px/72px widths, group/collapse persistence, keyboard rail menus and Escape focus return, loading/empty/dark states, mobile focus trapping, backdrop/Escape close, scroll lock and focus return, selection close, pinned footer/list scroll, and no horizontal overflow at 320/390/768/1440px.
- Browser console errors/warnings: 0. Failed network requests: 0.
- `npm.cmd run lint`: PASS, with 16 pre-existing warnings outside this preview; no preview warnings.
- `npm.cmd run build`: PASS. Development-only preview is excluded from the production bundle.
- `git diff --check`: reports a pre-existing trailing blank line in `backend/quotations/models.py:2761`; this unrelated file was not modified for the sidebar preview.
- Screenshots captured and visually inspected: `output/design-previews/sidebar-desktop.png`, `sidebar-rail.png`, `sidebar-dark.png`, `sidebar-mobile.png`.

These checks verify navigation configuration and preview behaviour. They do not assert that every existing business module's authenticated backend workflow is healthy; opening an existing module requires the actual account's permissions.

## Files changed for this preview

- `frontend/src/App.jsx`: development-only `/preview/sidebar` route and lazy import.
- `frontend/src/preview/sidebar/navigation.js`: central proposed navigation configuration and role/active-route helpers.
- `frontend/src/preview/sidebar/SidebarPreview.jsx`: interactive preview shell.
- `frontend/src/preview/sidebar/sidebar-preview.css`: scoped responsive appearance and focus styles.
- `frontend/src/preview/sidebar/verify-navigation.mjs`: configuration/icon/route inventory verification.
- `frontend/src/preview/sidebar/qa-sidebar.mjs`: browser verification and screenshot capture.
- `docs/sidebar-navigation-preview.md`: mapping and review handoff.

The Vite server was started on localhost:5173. If the computer restarts, run `npm.cmd run dev -- --host 127.0.0.1` from the `frontend` directory, then open the review URL. Stop point: preview delivered for review; production sidebar integration awaits approval.
