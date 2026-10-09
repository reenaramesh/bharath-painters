# Route coverage — full application audit

Audit date: 8 October 2026 (Asia/Calcutta). Target: local frontend `http://localhost:5173`, with its existing local Django backend.

Source inventory: **92 route patterns**, **63 menu definitions**. These counts are distinct from role/route cases and viewport renders.

Native Chrome/Playwright checks use existing repository QA accounts. Secrets remain in browser/process memory; no authentication state, HAR, cookies or tokens are exported.

Scope labels: **VERIFIED** = rendered/interacted with in a real browser; **SOURCE-INSPECTED ONLY** = inventory, not runtime proof; **BLOCKED** = missing access/data/environment; **NOT TESTED** = outstanding coverage.

Workflow limits: the broad sweep intercepts saves, sends, accepts/rejects, payments, deletions and other state-changing requests. A 409 with `harnessBlocked: true` is audit prevention, not an application defect. The separately documented temporary QA property/measurement workflow saved and reopened data, then removed only its exact new resource. Other persistence and irreversible workflows remain NOT TESTED.

## Every role menu item

| Role | Route / menu | Desktop 1440 | Mobile 360 / 390 / 430 | Actions | Console | Status |
|---|---|---|---|---|---|---|
| CONTRACTOR | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CONTRACTOR | `/customers?action=add` — Add Customer | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties?action=add` — Add Property | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CONTRACTOR | `/quotations/new` — New Quotation | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties?calculator=1` — Area Calculator | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/customers` — Customers | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties` — Properties & Measurements | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/leads` — Leads | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CONTRACTOR | `/site-visits` — Site Visits | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/quotations` — Quotations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/completed-projects` — Completed Projects | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/work-schedules` — Work Schedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/work-changes` — Work Changes | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/work-reschedules` — Work Reschedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/tasks` — Tasks | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/subcontract-work-orders` — Outsourced & Received Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/completed-work` — Completed Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/work-reviews` — Ratings & Reviews | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/in-house-applicators` — My Employees | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/contractor-network` — Contractor Network | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/jobs` — Job Posts & Applications | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/job-activity` — Applications & Invitations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/applicator-team` — Team Referrals | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/applicator-bookings` — Bookings & Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/invoices` — Invoices | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/contractor-revenue` — Customer Payments & Revenue | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/messages` — Messages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/service-requests` — Service Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CONTRACTOR | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/master-services` — Services & Rates | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/reports` — Reports | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/settings` — Settings | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/contractor-theme` — Theme Settings | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/my-packages` — Subscription | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/colors-shades` — Colors & Shades | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/profile` — Digital Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CUSTOMER | `/customer-properties` — My Properties | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-quotations` — My Quotations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/measurement-access` — Shared Measurements | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-schedules` — Work Schedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-changes` — Work Changes | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-reschedules` — Work Reschedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CUSTOMER | `/completed-work` — Completed Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer/connections` — My Contractors | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-reviews` — Review Contractors | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-invoices` — Payments & Invoices | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/messages` — Messages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/service-requests` — Service Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| CUSTOMER | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/colors-shades` — Colors & Shades | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/appearance` — Appearance | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer/profile` — My Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| PAINTER_FREELANCE | `/painter-assignments` — My Assignments | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/applicator-availability` — Availability & Calendar | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| PAINTER_FREELANCE | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/work-reviews` — Ratings & Reviews | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/jobs` — Available Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| PAINTER_FREELANCE | `/job-activity` — Applications & Invitations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/applicator-bookings` — Bookings & Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| PAINTER_FREELANCE | `/in-house-earnings` — My Payments | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/messages` — Messages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/settings` — Settings | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/my-packages` — Subscription | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/colors-shades` — Colors & Shades | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/appearance` — Appearance | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/profile` — Digital Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| PAINTER_INHOUSE | `/painter-assignments` — My Assignments | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/work-reviews` — Ratings & Reviews | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/in-house-applicators` — My Employment | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/job-activity` — Applications & Invitations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/in-house-earnings` — My Payments | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/messages` — Messages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/settings` — Settings | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/my-packages` — Subscription | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/colors-shades` — Colors & Shades | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/appearance` — Appearance | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/profile` — Digital Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_INHOUSE | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | FAIL |
| ADMIN | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/contractors` — Contractors | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/painters` — Employees & Professionals | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/customer-connections` — Customer Connections | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/billing` — Billing | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/revenue` — Subscription Revenue | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/support-staff` — Support Staff | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/master-services` — Service Catalogue & Master Data | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/reports` — Reports | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/packages` — Packages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/admin-integrations` — API Settings | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/appearance` — Appearance | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/profile` — Digital Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| ADMIN | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| SUPPORT | `/support-tickets` — Support Tickets | No | No / No / No | No available Support authentication | See logs; not blanket clean | BLOCKED |
| SUPPORT | `/support-workspace` — Recovery Center | No | No / No / No | No available Support authentication | See logs; not blanket clean | BLOCKED |
| SUPPORT | `/appearance` — Appearance | No | No / No / No | No available Support authentication | See logs; not blanket clean | BLOCKED |
| SUPPORT | `/profile` — Digital Profile | No | No / No / No | No available Support authentication | See logs; not blanket clean | BLOCKED |
| SUPPORT | `/account-security` — Account Security | No | No / No / No | No available Support authentication | See logs; not blanket clean | BLOCKED |

## Complete route-pattern inventory

| Route pattern | Page / guard | Role scope | Browser evidence | Status |
|---|---|---|---|---|
| `/preview/settings` | MergedSettingsPreview; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/preview/subcontract-work-orders` | SubcontractWorkOrdersPreview; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/preview/sidebar` | SidebarPreview; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/preview/bharath-apps` | BharathAppsPreview; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/login` | Login; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/register` | Register; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/customer-register` | CustomerRegister; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/customer-link/:token` | CustomerShareLink; public;  | Public | None | BLOCKED — needs valid invitation/data |
| `/join/property/:token` | JoinProperty; public;  | Public | None | BLOCKED — needs valid invitation/data |
| `/forgot-password` | ForgotPassword; public;  | Public | PUBLIC | PARTIAL — VERIFIED renders |
| `/dashboard` | Dashboard; authenticated;  | CONTRACTOR, PAINTER, ADMIN | ADMIN, CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/applicator` | Dashboard; authenticated;  | CONTRACTOR, PAINTER, ADMIN | ADMIN, CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/customer-dashboard` | CustomerDashboard; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer/connections` | CustomerConnections; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer/profile` | CustomerProfile; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer/connection-requests` | Navigate; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/profile` | ProfileCard; authenticated;  | CONTRACTOR, PAINTER, ADMIN, SUPPORT | ADMIN, CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/customer-reviews` | CustomerContractorReviews; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/completed-projects` | ContractorCompletedProjects; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/account-security` | RecoveryEmailSettings; authenticated;  | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/appearance` | AppearanceSettings; authenticated;  | CONTRACTOR, PAINTER, CUSTOMER, ADMIN, SUPPORT | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/contractors` | Contractors; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/painters` | Painters; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/customers` | Customers; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/customers/:id` | CustomerDetail; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/customers/:id/quotations` | CustomerQuotationHistory; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/invoices` | Invoices; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/tasks` | Tasks; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/messages` | Chat; authenticated;  | CONTRACTOR, PAINTER, CUSTOMER | CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/colors-shades` | ColorsShades; authenticated;  | CONTRACTOR, PAINTER, CUSTOMER | CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/service-requests` | ServiceRequests; authenticated;  | CONTRACTOR, CUSTOMER | CONTRACTOR, CUSTOMER | PARTIAL — VERIFIED renders |
| `/support-tickets` | SupportTickets; authenticated;  | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/support-workspace` | SupportWorkspace; authenticated;  | SUPPORT | ADMIN | PARTIAL — VERIFIED renders |
| `/support-staff` | SupportStaff; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/admin-integrations` | AdminIntegrations; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/measurement-access` | MeasurementAccess; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-quotations` | CustomerQuotations; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-quotations/:id` | CustomerQuotation; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-invoices` | CustomerInvoices; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-properties` | CustomerProperties; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-properties/:id` | CustomerPropertyDetail; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/customer-properties/:id/access` | PropertyAccess; authenticated;  | CUSTOMER | CUSTOMER | PARTIAL — VERIFIED renders |
| `/work-schedules` | WorkSchedules; authenticated;  | CONTRACTOR, CUSTOMER | CONTRACTOR, CUSTOMER | PARTIAL — VERIFIED renders |
| `/work-changes` | WorkChanges; authenticated;  | CONTRACTOR, CUSTOMER | CONTRACTOR, CUSTOMER | PARTIAL — VERIFIED renders |
| `/work-reschedules` | WorkReschedules; authenticated;  | CONTRACTOR, CUSTOMER | CONTRACTOR, CUSTOMER | PARTIAL — VERIFIED renders |
| `/completed-work` | CompletedWork; authenticated;  | CONTRACTOR, CUSTOMER | CONTRACTOR, CUSTOMER | PARTIAL — VERIFIED renders |
| `/leads` | Leads; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/opportunities` | Opportunities; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/opportunities/new` | NewOpportunity; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/opportunities/:id` | OpportunityDetail; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/site-visits` | SiteVisits; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/painter-seeking` | PainterSeeking; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/find-painter` | Navigate; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/painter-assignments` | PainterAssignments; authenticated;  | PAINTER | PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/jobs` | Jobs; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/job-activity` | JobActivity; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/applicator-team` | ApplicatorTeam; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/in-house-applicators` | InHouseApplicators; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/in-house-applicators/new` | InHouseEmployeeCreate; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/in-house-applicators/:id` | InHouseEmployeeDetail; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/in-house-earnings` | InHouseEarnings; authenticated;  | PAINTER | PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/work-reviews` | WorkReviews; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/billing` | AdminBilling; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/packages` | Billing; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/revenue` | AdminRevenue; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/customer-connections` | AdminCustomerConnections; authenticated;  | ADMIN | ADMIN | PARTIAL — VERIFIED renders |
| `/contractor-revenue` | ContractorRevenue; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/my-packages` | ContractorPackages; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/activity-log` | ActivityLog; authenticated;  | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/measurement-trial` | MeasurementTrial; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/applicator-availability` | ApplicatorAvailability; authenticated;  | PAINTER | PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/applicator-bookings` | ApplicatorBookings; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/properties` | Properties; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/properties/:id` | PropertyDetail; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/properties/:id/measurements` | MeasurementCalculator; authenticated;  | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/master-services` | MasterServices; authenticated;  | CONTRACTOR, ADMIN | ADMIN, CONTRACTOR | PARTIAL — VERIFIED renders |
| `/contractor-network` | ContractorNetwork; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/subcontract-work-orders` | SubcontractWorkOrders; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/subcontract-work-orders/:id` | SubcontractWorkOrderDetail; authenticated; VerifiedContractorRoute | CONTRACTOR | None | BLOCKED — needs valid invitation/data |
| `/settings` | Settings; authenticated; ProviderProfileRoute | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/provider-profile` | ProviderProfileRoute; authenticated; ProviderProfileRoute | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/applicator-profile` | LegacyPersonalSettingsRedirect; authenticated;  | CONTRACTOR, PAINTER | CONTRACTOR, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/contractor-theme` | VerifiedContractorRoute; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations` | Quotations; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations/new` | QuotationBuilder; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations/new-measured` | QuotationBuilder; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations/:id` | QuotationDetail; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations/new-manual` | QuotationBuilder; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/quotations/:id/edit` | QuotationEdit; authenticated; VerifiedContractorRoute | CONTRACTOR | CONTRACTOR | PARTIAL — VERIFIED renders |
| `/work-photos` | WorkPhotos; authenticated;  | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE | PARTIAL — VERIFIED renders |
| `/reports` | Reports; authenticated;  | CONTRACTOR, ADMIN | ADMIN, CONTRACTOR | PARTIAL — VERIFIED renders |
| `*` | Navigate; public;  | Public | None | SOURCE-INSPECTED ONLY / NOT TESTED |

## Rendered role/route cases

| Role | Exact route | Viewports | Actions exercised | Runtime/layout signals requiring review | Evidence |
|---|---|---|---|---|
| ADMIN | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab, Show password, Show passwords | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-account-security-1440-page.png) |
| ADMIN | `/activity-log` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/admin-activity-log-1440-page.png) |
| ADMIN | `/admin-integrations` | 1440, 360, 390, 430 | Keyboard Tab, Show API key | No automatic signal; manual visual review still required | No screenshot |
| ADMIN | `/appearance` | 1440, 360, 390, 430, 1440, 430 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | loading, unnamed | [screenshot](screenshots/admin-appearance-1440-page.png) |
| ADMIN | `/applicator` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data, Search | loading, unnamed | [screenshot](screenshots/admin-applicator-1440-page.png) |
| ADMIN | `/billing` | 1440, 360, 390, 430, 360, 390 | Bottom navigation: Billing, Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error, loading | [screenshot](screenshots/admin-billing-1440-page.png) |
| ADMIN | `/contractors` | 1440, 360, 390, 430, 1440 | Bottom navigation: Contractors, Keyboard Tab, Retry / wait for stable data, Search, Table sorting | loading | [screenshot](screenshots/admin-contractors-1440-page.png) |
| ADMIN | `/customer-connections` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | loading | [screenshot](screenshots/admin-customer-connections-1440-page.png) |
| ADMIN | `/dashboard` | 1440, 360, 390, 430, 1440, 360, 430 | Bottom navigation: Home, Contractors directory tab, Conversations directory tab, Customers directory tab, Employees directory tab, Keyboard Tab, Quotations directory tab, Retry / wait for stable data, Search, Table sorting | error, loading, unnamed | [screenshot](screenshots/admin-dashboard-1440-page.png) |
| ADMIN | `/master-services` | 1440, 360, 390, 430 | Add Room / Area, Edit living area, Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-master-services-1440-page.png) |
| ADMIN | `/packages` | 1440, 360, 390, 430 | Keyboard Tab, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-packages-1440-page.png) |
| ADMIN | `/painters` | 1440, 360, 390, 430, 1440, 360, 390 | Bottom navigation: Professionals, Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error, loading | [screenshot](screenshots/admin-painters-1440-page.png) |
| ADMIN | `/profile` | 1440, 360, 390, 430, 360, 430 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error, loading, unnamed | [screenshot](screenshots/admin-profile-1440-page.png) |
| ADMIN | `/reports` | 1440, 360, 390, 430 | Bottom navigation: Reports, Keyboard Tab, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-reports-1440-page.png) |
| ADMIN | `/revenue` | 1440, 360, 390, 430 | Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-revenue-1440-page.png) |
| ADMIN | `/support-staff` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-support-staff-1440-page.png) |
| ADMIN | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-support-tickets-1440-page.png) |
| ADMIN | `/support-workspace` | 1440, 360, 390, 430, 768 | Recovery Center view | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-support-workspace-1440-admin-support-workspace.png) |
| ADMIN | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-work-photos-1440-page.png) |
| CONTRACTOR | `/account-security` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data, Show password, Show passwords | error | [screenshot](screenshots/contractor-account-security-1440-page.png) |
| CONTRACTOR | `/activity-log` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/contractor-activity-log-1440-page.png) |
| CONTRACTOR | `/appearance` | 1440, 360, 390, 430, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-appearance-1440-page.png) |
| CONTRACTOR | `/applicator` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-applicator-1440-page.png) |
| CONTRACTOR | `/applicator-bookings` | 1440, 360, 390, 430 | Keyboard Tab | unnamed | [screenshot](screenshots/contractor-applicator-bookings-1440-page.png) |
| CONTRACTOR | `/applicator-profile` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Business details, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-applicator-profile-1440-page.png) |
| CONTRACTOR | `/applicator-team` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-applicator-team-1440-page.png) |
| CONTRACTOR | `/colors-shades` | 1440, 360, 390, 430 | Add colour, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-colors-shades-1440-page.png) |
| CONTRACTOR | `/completed-projects` | 1440, 360, 390, 430, 390 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-completed-projects-1440-page.png) |
| CONTRACTOR | `/completed-work` | 1440, 360, 390, 430 | Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-completed-work-1440-page.png) |
| CONTRACTOR | `/contractor-network` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-contractor-network-1440-page.png) |
| CONTRACTOR | `/contractor-revenue` | 1440, 360, 390, 430, 1440, 360 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | loading | [screenshot](screenshots/contractor-contractor-revenue-1440-page.png) |
| CONTRACTOR | `/contractor-theme` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Add link, Appearance, Business details, Keyboard Tab, Retry / wait for stable data, Upload | error, loading | [screenshot](screenshots/contractor-contractor-theme-1440-page.png) |
| CONTRACTOR | `/customers` | 1440, 360, 390, 430, 1440, 390, 430 | Add customer, Add from phone contacts, Bottom navigation: Customers, Keyboard Tab, Request Declined (0), Retry / wait for stable data, Search | loading | [screenshot](screenshots/contractor-customers-1440-page.png) |
| CONTRACTOR | `/customers/46` | 1440, 360, 390, 430, 1440, 360, 390, 430, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading, unnamed | [screenshot](screenshots/contractor-customers-46-1440-page.png) |
| CONTRACTOR | `/customers/46/quotations` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search | error, loading | [screenshot](screenshots/contractor-customers-46-quotations-1440-page.png) |
| CONTRACTOR | `/customers?action=add` | 1440, 360, 390, 430, 360, 390 | Add customer, Add from phone contacts, Keyboard Tab, Request Declined (0), Retry / wait for stable data, Search, Table sorting | loading | [screenshot](screenshots/contractor-customers-action-add-1440-page.png) |
| CONTRACTOR | `/dashboard` | 1440, 360, 390, 430 | Bottom navigation: Home, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-dashboard-1440-page.png) |
| CONTRACTOR | `/find-painter` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data | loading, unnamed | [screenshot](screenshots/contractor-find-painter-1440-page.png) |
| CONTRACTOR | `/in-house-applicators` | 1440, 360, 390, 430 | Keyboard Tab, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-in-house-applicators-1440-page.png) |
| CONTRACTOR | `/in-house-applicators/8` | 1440, 360, 390, 430, 390 | Keyboard Tab, Retry / wait for stable data | loading, unnamed | [screenshot](screenshots/contractor-in-house-applicators-8-1440-page.png) |
| CONTRACTOR | `/in-house-applicators/89` | 1440, 360, 390, 430 | No action evidence yet | error | [screenshot](screenshots/contractor-in-house-applicators-89-1440-deep-page.png) |
| CONTRACTOR | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-in-house-applicators-new-1440-page.png) |
| CONTRACTOR | `/invoices` | 1440, 360, 390, 430, 430 | Keyboard Tab, New lump-sum invoice, Retry / wait for stable data, Search, View invoice | error | [screenshot](screenshots/contractor-invoices-1440-page.png) |
| CONTRACTOR | `/job-activity` | 1440, 360, 390, 430 | Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-job-activity-1440-page.png) |
| CONTRACTOR | `/jobs` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-jobs-1440-page.png) |
| CONTRACTOR | `/leads` | 1440, 360, 390, 430 | Create a new lead, Keyboard Tab, Search | unnamed | [screenshot](screenshots/contractor-leads-1440-page.png) |
| CONTRACTOR | `/master-services` | 1440, 360, 390, 430, 1440, 360 | Add Room / Area, Keyboard Tab, Retry / wait for stable data, Search | error, loading | [screenshot](screenshots/contractor-master-services-1440-page.png) |
| CONTRACTOR | `/measurement-trial` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-measurement-trial-1440-page.png) |
| CONTRACTOR | `/messages` | 1440, 360, 390, 430, 1440, 390, 430 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-messages-1440-page.png) |
| CONTRACTOR | `/my-packages` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data, Table sorting | error | [screenshot](screenshots/contractor-my-packages-1440-page.png) |
| CONTRACTOR | `/opportunities` | 1440, 360, 390, 430, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/contractor-opportunities-1440-page.png) |
| CONTRACTOR | `/opportunities/7` | 1440, 360, 390, 430, 360, 430 | Completed, Edit, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/contractor-opportunities-7-1440-page.png) |
| CONTRACTOR | `/opportunities/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-opportunities-new-1440-page.png) |
| CONTRACTOR | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-painter-seeking-1440-page.png) |
| CONTRACTOR | `/profile` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/contractor-profile-1440-page.png) |
| CONTRACTOR | `/properties` | 1440, 360, 390, 430 | Keyboard Tab, QA Test HomeOwner: QA Customer, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-properties-1440-page.png) |
| CONTRACTOR | `/properties/46` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440 | Edit, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/contractor-properties-46-1440-page.png) |
| CONTRACTOR | `/properties/46/measurements` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading, unnamed | [screenshot](screenshots/contractor-properties-46-measurements-1440-page.png) |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-properties-46-measurements-measurement-67-1440-page.png) |
| CONTRACTOR | `/properties/55/measurements` | 1440, 360, 390, 430 | No action evidence yet | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-properties-55-measurements-1440-saved-workflow.png) |
| CONTRACTOR | `/properties?action=add` | 1440, 360, 390, 430 | Bottom navigation: Add property, Keyboard Tab, QA Test HomeOwner: QA Customer, Search, Table sorting | unnamed | [screenshot](screenshots/contractor-properties-action-add-1440-page.png) |
| CONTRACTOR | `/properties?calculator=1` | 1440, 360, 390, 430 | Keyboard Tab, QA Test HomeOwner: QA Customer, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-properties-calculator-1-1440-page.png) |
| CONTRACTOR | `/provider-profile` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Business details, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-provider-profile-1440-page.png) |
| CONTRACTOR | `/quotations` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error | [screenshot](screenshots/contractor-quotations-1440-page.png) |
| CONTRACTOR | `/quotations/101` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/contractor-quotations-101-1440-page.png) |
| CONTRACTOR | `/quotations/101/edit` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-quotations-101-edit-1440-page.png) |
| CONTRACTOR | `/quotations/102` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-quotations-102-1440-page.png) |
| CONTRACTOR | `/quotations/102/edit` | 1440, 360, 390, 430, 1440, 360, 390, 430, 360, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-quotations-102-edit-1440-page.png) |
| CONTRACTOR | `/quotations/103` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 430 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/contractor-quotations-103-1440-page.png) |
| CONTRACTOR | `/quotations/103/edit` | 1440, 360, 390, 430, 1440, 360, 390, 430, 1440, 360, 390 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-quotations-103-edit-1440-page.png) |
| CONTRACTOR | `/quotations/104` | 1440, 360, 390, 430, 1440, 360, 390, 430, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-quotations-104-1440-page.png) |
| CONTRACTOR | `/quotations/104/edit` | 1440, 360, 390, 430, 1440, 360, 390, 430, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/contractor-quotations-104-edit-1440-page.png) |
| CONTRACTOR | `/quotations/new` | 1440, 360, 390, 430 | Add Property, Add measurement, Bottom navigation: Quotation, Keyboard Tab, New Customer, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-quotations-new-1440-page.png) |
| CONTRACTOR | `/quotations/new-manual` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Search | error | [screenshot](screenshots/contractor-quotations-new-manual-1440-page.png) |
| CONTRACTOR | `/quotations/new-measured` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Search | error | [screenshot](screenshots/contractor-quotations-new-measured-1440-page.png) |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 1440, 360, 390, 430 | Continue / Next | error | [screenshot](screenshots/contractor-quotations-new-customer-46-property-46-measurement-67-1440-deep-page.png) |
| CONTRACTOR | `/reports` | 1440, 360, 390, 430, 390 | Keyboard Tab, Retry / wait for stable data, Table sorting | loading | [screenshot](screenshots/contractor-reports-1440-page.png) |
| CONTRACTOR | `/service-requests` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Add as lead, Keyboard Tab, Retry / wait for stable data, Search | bodyOverflow, loading | [screenshot](screenshots/contractor-service-requests-1440-page.png) |
| CONTRACTOR | `/settings` | 1440, 360, 390, 430, 1440, 390, 430 | Add link, Appearance, Business details, Keyboard Tab, Retry / wait for stable data, Upload | error, loading | [screenshot](screenshots/contractor-settings-1440-page.png) |
| CONTRACTOR | `/settings?tab=appearance` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-appearance-1440-page.png) |
| CONTRACTOR | `/settings?tab=company` | 1440, 360, 390, 430, 1440, 360 | Business details, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/contractor-settings-tab-company-1440-page.png) |
| CONTRACTOR | `/settings?tab=personal` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-personal-1440-page.png) |
| CONTRACTOR | `/settings?tab=trade` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-trade-1440-page.png) |
| CONTRACTOR | `/site-visits` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-site-visits-1440-page.png) |
| CONTRACTOR | `/subcontract-work-orders` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-subcontract-work-orders-1440-page.png) |
| CONTRACTOR | `/support-tickets` | 1440, 360, 390, 430, 1440, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error, loading | [screenshot](screenshots/contractor-support-tickets-1440-page.png) |
| CONTRACTOR | `/tasks` | 1440, 360, 390, 430 | Add task, Bottom navigation: Follow-ups, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-tasks-1440-page.png) |
| CONTRACTOR | `/work-changes` | 1440, 360, 390, 430 | Keyboard Tab, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-changes-1440-page.png) |
| CONTRACTOR | `/work-photos` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data, Search | error | [screenshot](screenshots/contractor-work-photos-1440-page.png) |
| CONTRACTOR | `/work-reschedules` | 1440, 360, 390, 430 | Change dates, Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-reschedules-1440-page.png) |
| CONTRACTOR | `/work-reviews` | 1440, 360, 390, 430 | Keyboard Tab | unnamed | [screenshot](screenshots/contractor-work-reviews-1440-page.png) |
| CONTRACTOR | `/work-schedules` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-schedules-1440-page.png) |
| CUSTOMER | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab, Show passwords | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-account-security-1440-page.png) |
| CUSTOMER | `/activity-log` | 1440, 360, 390, 430, 360, 390 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/customer-activity-log-1440-page.png) |
| CUSTOMER | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-appearance-1440-page.png) |
| CUSTOMER | `/colors-shades` | 1440, 360, 390, 430 | Add colour, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-colors-shades-1440-page.png) |
| CUSTOMER | `/completed-work` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/customer-completed-work-1440-page.png) |
| CUSTOMER | `/customer-dashboard` | 1440, 360, 390, 430, 360 | Bottom navigation: Home, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-dashboard-1440-page.png) |
| CUSTOMER | `/customer-invoices` | 1440, 360, 390, 430, 360, 390 | Keyboard Tab, My payment receipts1 receipt · ₹25,000 received, QA-INV-001PART PAIDQuotation QA-QTN-COMPLETED · QA Test HomeInvoice date5 Oct 2026Due date19 Oct 2026View expenditure breakdown, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-invoices-1440-page.png) |
| CUSTOMER | `/customer-properties` | 1440, 360, 390, 430 | Bottom navigation: Properties, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-properties-1440-page.png) |
| CUSTOMER | `/customer-properties/46` | 1440, 360, 390, 430, 360, 430 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/customer-customer-properties-46-1440-page.png) |
| CUSTOMER | `/customer-properties/46/access` | 1440, 360, 390, 430, 1440, 390 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/customer-customer-properties-46-access-1440-page.png) |
| CUSTOMER | `/customer-quotations` | 1440, 360, 390, 430 | Bottom navigation: Quotations, Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-quotations-1440-page.png) |
| CUSTOMER | `/customer-quotations/101` | 1440, 360, 390, 430, 1440, 360, 390 | Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/customer-customer-quotations-101-1440-page.png) |
| CUSTOMER | `/customer-quotations/102` | 1440, 360, 390, 430, 390, 430 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/customer-customer-quotations-102-1440-page.png) |
| CUSTOMER | `/customer-quotations/103` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-quotations-103-1440-page.png) |
| CUSTOMER | `/customer-quotations/104` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-quotations-104-1440-page.png) |
| CUSTOMER | `/customer-reviews` | 1440, 360, 390, 430, 390 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-reviews-1440-page.png) |
| CUSTOMER | `/customer/connection-requests` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-customer-connection-requests-1440-page.png) |
| CUSTOMER | `/customer/connections` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data, View contractor | loading | [screenshot](screenshots/customer-customer-connections-1440-page.png) |
| CUSTOMER | `/customer/profile` | 1440, 360, 390, 430 | Keyboard Tab, Upload | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-profile-1440-page.png) |
| CUSTOMER | `/measurement-access` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-measurement-access-1440-page.png) |
| CUSTOMER | `/messages` | 1440, 360, 390, 430, 1440, 360 | Bottom navigation: Messages, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/customer-messages-1440-page.png) |
| CUSTOMER | `/service-requests` | 1440, 360, 390, 430, 360, 390 | Keyboard Tab, New request, Retry / wait for stable data, Search | bodyOverflow, loading | [screenshot](screenshots/customer-service-requests-1440-page.png) |
| CUSTOMER | `/support-tickets` | 1440, 360, 390, 430, 1440, 390, 430 | Keyboard Tab, Raise a request, Retry / wait for stable data, Search | loading | [screenshot](screenshots/customer-support-tickets-1440-page.png) |
| CUSTOMER | `/work-changes` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-changes-1440-page.png) |
| CUSTOMER | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-photos-1440-page.png) |
| CUSTOMER | `/work-reschedules` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-reschedules-1440-page.png) |
| CUSTOMER | `/work-schedules` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-schedules-1440-page.png) |
| PAINTER_FREELANCE | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab, Show password, Show passwords | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-account-security-1440-page.png) |
| PAINTER_FREELANCE | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-activity-log-1440-page.png) |
| PAINTER_FREELANCE | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-appearance-1440-page.png) |
| PAINTER_FREELANCE | `/applicator` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-applicator-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-availability` | 1440, 360, 390, 430, 430 | Dashboard shortcut: Availability, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_freelance-applicator-availability-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-bookings` | 1440, 360, 390, 430, 390 | Dashboard shortcut: Bookings, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_freelance-applicator-bookings-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-profile` | 1440, 360, 390, 430, 430 | Keyboard Tab, Personal details, Retry / wait for stable data, Trade & skills | loading | [screenshot](screenshots/painter_freelance-applicator-profile-1440-page.png) |
| PAINTER_FREELANCE | `/colors-shades` | 1440, 360, 390, 430 | Add colour, Dashboard shortcut: Colors & Shades, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-colors-shades-1440-page.png) |
| PAINTER_FREELANCE | `/dashboard` | 1440, 360, 390, 430, 360 | Bottom navigation: Home, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/painter_freelance-dashboard-1440-page.png) |
| PAINTER_FREELANCE | `/find-painter` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/painter_freelance-find-painter-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-applicators` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-in-house-applicators-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-in-house-applicators-new-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-earnings` | 1440, 360, 390, 430, 1440, 360 | Dashboard shortcut: Earnings, Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/painter_freelance-in-house-earnings-1440-page.png) |
| PAINTER_FREELANCE | `/job-activity` | 1440, 360, 390, 430 | Keyboard Tab, Search, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-job-activity-1440-page.png) |
| PAINTER_FREELANCE | `/jobs` | 1440, 360, 390, 430 | Bottom navigation: Available Work, Dashboard shortcut: Work Network, Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-jobs-1440-page.png) |
| PAINTER_FREELANCE | `/messages` | 1440, 360, 390, 430, 360, 390, 430 | Bottom navigation: Messages, Dashboard shortcut: Messages, Keyboard Tab, Retry / wait for stable data | error, loading | [screenshot](screenshots/painter_freelance-messages-1440-page.png) |
| PAINTER_FREELANCE | `/my-packages` | 1440, 360, 390, 430 | Keyboard Tab, Table sorting | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-my-packages-1440-page.png) |
| PAINTER_FREELANCE | `/painter-assignments` | 1440, 360, 390, 430, 1440, 360 | Bottom navigation: Assignments, Dashboard shortcut: Assignments, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_freelance-painter-assignments-1440-page.png) |
| PAINTER_FREELANCE | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | unnamed | [screenshot](screenshots/painter_freelance-painter-seeking-1440-page.png) |
| PAINTER_FREELANCE | `/profile` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-profile-1440-page.png) |
| PAINTER_FREELANCE | `/provider-profile` | 1440, 360, 390, 430, 390, 430 | Keyboard Tab, Personal details, Retry / wait for stable data, Trade & skills | loading | [screenshot](screenshots/painter_freelance-provider-profile-1440-page.png) |
| PAINTER_FREELANCE | `/settings` | 1440, 360, 390, 430 | Bottom navigation: Settings, Dashboard shortcut: Settings, Keyboard Tab, Personal details, Trade & skills, Upload | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-appearance-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=company` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-company-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=personal` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data, Trade & skills | loading | [screenshot](screenshots/painter_freelance-settings-tab-personal-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=trade` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-trade-1440-page.png) |
| PAINTER_FREELANCE | `/support-tickets` | 1440, 360, 390, 430, 1440, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search | loading | [screenshot](screenshots/painter_freelance-support-tickets-1440-page.png) |
| PAINTER_FREELANCE | `/work-photos` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data, Search | error | [screenshot](screenshots/painter_freelance-work-photos-1440-page.png) |
| PAINTER_FREELANCE | `/work-reviews` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data | error, unnamed | [screenshot](screenshots/painter_freelance-work-reviews-1440-page.png) |
| PAINTER_INHOUSE | `/account-security` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Show password, Show passwords | error | [screenshot](screenshots/painter_inhouse-account-security-1440-page.png) |
| PAINTER_INHOUSE | `/activity-log` | 1440, 360, 390, 430, 1440, 360, 390 | Keyboard Tab, Retry / wait for stable data, Search | error, loading | [screenshot](screenshots/painter_inhouse-activity-log-1440-page.png) |
| PAINTER_INHOUSE | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-appearance-1440-page.png) |
| PAINTER_INHOUSE | `/applicator` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/painter_inhouse-applicator-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-availability` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Dashboard mobile Availability, Dashboard shortcut: Availability, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-applicator-availability-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-bookings` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Dashboard mobile Bookings, Dashboard shortcut: Bookings, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-applicator-bookings-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-profile` | 1440, 360, 390, 430, 430 | Keyboard Tab, Retry / wait for stable data, Trade & skills | loading | [screenshot](screenshots/painter_inhouse-applicator-profile-1440-page.png) |
| PAINTER_INHOUSE | `/colors-shades` | 1440, 360, 390, 430 | Add colour, Dashboard shortcut: Colors & Shades, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-colors-shades-1440-page.png) |
| PAINTER_INHOUSE | `/dashboard` | 1440, 360, 390, 430 | Bottom navigation: Home, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-dashboard-1440-page.png) |
| PAINTER_INHOUSE | `/find-painter` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-find-painter-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-applicators` | 1440, 360, 390, 430, 390, 430 | Bottom navigation: My Employment, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-in-house-applicators-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-in-house-applicators-new-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-earnings` | 1440, 360, 390, 430, 1440, 430 | Dashboard shortcut: Earnings, Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-in-house-earnings-1440-page.png) |
| PAINTER_INHOUSE | `/job-activity` | 1440, 360, 390, 430, 1440 | Keyboard Tab, Retry / wait for stable data, Search, Table sorting | error | [screenshot](screenshots/painter_inhouse-job-activity-1440-page.png) |
| PAINTER_INHOUSE | `/jobs` | 1440, 360, 390, 430 | Dashboard mobile Work Network, Dashboard shortcut: Work Network, Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-jobs-1440-page.png) |
| PAINTER_INHOUSE | `/messages` | 1440, 360, 390, 430, 390, 430 | Bottom navigation: Messages, Dashboard shortcut: Messages, Keyboard Tab, Retry / wait for stable data | loading | [screenshot](screenshots/painter_inhouse-messages-1440-page.png) |
| PAINTER_INHOUSE | `/my-packages` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data, Table sorting | error | [screenshot](screenshots/painter_inhouse-my-packages-1440-page.png) |
| PAINTER_INHOUSE | `/painter-assignments` | 1440, 360, 390, 430 | Bottom navigation: Assignments, Dashboard shortcut: Assignments, Keyboard Tab | unnamed | [screenshot](screenshots/painter_inhouse-painter-assignments-1440-page.png) |
| PAINTER_INHOUSE | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-painter-seeking-1440-page.png) |
| PAINTER_INHOUSE | `/profile` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-profile-1440-page.png) |
| PAINTER_INHOUSE | `/provider-profile` | 1440, 360, 390, 430, 360 | Keyboard Tab, Personal details, Retry / wait for stable data, Trade & skills | loading | [screenshot](screenshots/painter_inhouse-provider-profile-1440-page.png) |
| PAINTER_INHOUSE | `/settings` | 1440, 360, 390, 430, 1440, 360 | Bottom navigation: Settings, Dashboard shortcut: Settings, Keyboard Tab, Personal details, Retry / wait for stable data, Trade & skills, Upload | loading | [screenshot](screenshots/painter_inhouse-settings-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-appearance-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=company` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-company-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=personal` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-personal-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=trade` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-trade-1440-page.png) |
| PAINTER_INHOUSE | `/support-tickets` | 1440, 360, 390, 430, 1440, 360, 390, 430 | Keyboard Tab, Retry / wait for stable data, Search | error, loading | [screenshot](screenshots/painter_inhouse-support-tickets-1440-page.png) |
| PAINTER_INHOUSE | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-work-photos-1440-page.png) |
| PAINTER_INHOUSE | `/work-reviews` | 1440, 360, 390, 430, 360 | Keyboard Tab, Retry / wait for stable data | error | [screenshot](screenshots/painter_inhouse-work-reviews-1440-page.png) |
| PUBLIC | `/customer-register` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-customer-register-1440-page.png) |
| PUBLIC | `/forgot-password` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-forgot-password-1440-page.png) |
| PUBLIC | `/login` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-login-1440-page.png) |
| PUBLIC | `/preview/bharath-apps` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-bharath-apps-1440-page.png) |
| PUBLIC | `/preview/settings` | 1440, 360, 390, 430 | Appearance, Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-settings-1440-page.png) |
| PUBLIC | `/preview/sidebar` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-sidebar-1440-page.png) |
| PUBLIC | `/preview/subcontract-work-orders` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-subcontract-work-orders-1440-page.png) |
| PUBLIC | `/register` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-register-1440-page.png) |

## Actual navigation clicks and redirects

| Role | Width | Menu/control | Route | Actual destination or result |
|---|---|---|---|---|
| CONTRACTOR | 1440 | Dashboard | `/dashboard` | /dashboard |
| CONTRACTOR | 1440 | Add Customer | `/customers?action=add` | /customers?action=add |
| CONTRACTOR | 1440 | Add Property | `/properties?action=add` | /properties?action=add |
| CONTRACTOR | 1440 | New Quotation | `/quotations/new` | /quotations/new |
| CONTRACTOR | 1440 | Area Calculator | `/properties?calculator=1` | /properties?calculator=1 |
| CONTRACTOR | 1440 | Customers | `/customers` | /customers |
| CONTRACTOR | 1440 | Properties & Measurements | `/properties` | /properties |
| CONTRACTOR | 1440 | Leads | `/leads` | /leads |
| CONTRACTOR | 1440 | Site Visits | `/site-visits` | /site-visits |
| CONTRACTOR | 1440 | Quotations | `/quotations` | /quotations |
| CONTRACTOR | 1440 | Completed Projects | `/completed-projects` | /completed-projects |
| CONTRACTOR | 1440 | Work Schedules | `/work-schedules` | /work-schedules |
| CONTRACTOR | 1440 | Work Changes | `/work-changes` | /work-changes |
| CONTRACTOR | 1440 | Work Reschedules | `/work-reschedules` | /work-reschedules |
| CONTRACTOR | 1440 | Tasks | `/tasks` | /tasks |
| CONTRACTOR | 1440 | Outsourced & Received Work | `/subcontract-work-orders` | /subcontract-work-orders |
| CONTRACTOR | 1440 | Completed Work | `/completed-work` | /completed-work |
| CONTRACTOR | 1440 | Work Photos | `/work-photos` | /work-photos |
| CONTRACTOR | 1440 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| CONTRACTOR | 1440 | My Employees | `/in-house-applicators` | /in-house-applicators |
| CONTRACTOR | 1440 | Contractor Network | `/contractor-network` | /contractor-network |
| CONTRACTOR | 1440 | Job Posts & Applications | `/jobs` | /jobs |
| CONTRACTOR | 1440 | Applications & Invitations | `/job-activity` | /job-activity |
| CONTRACTOR | 1440 | Team Referrals | `/applicator-team` | /applicator-team |
| CONTRACTOR | 1440 | Bookings & Requests | `/applicator-bookings` | /applicator-bookings |
| CONTRACTOR | 1440 | Invoices | `/invoices` | /invoices |
| CONTRACTOR | 1440 | Customer Payments & Revenue | `/contractor-revenue` | /contractor-revenue |
| CONTRACTOR | 1440 | Messages | `/messages` | /messages |
| CONTRACTOR | 1440 | Service Requests | `/service-requests` | /service-requests |
| CONTRACTOR | 1440 | Support Tickets | `/support-tickets` | /support-tickets |
| CONTRACTOR | 1440 | Services & Rates | `/master-services` | /master-services |
| CONTRACTOR | 1440 | Reports | `/reports` | /reports |
| CONTRACTOR | 1440 | Settings | `/settings` | /settings |
| CONTRACTOR | 1440 | Theme Settings | `/contractor-theme` | /settings?tab=appearance |
| CONTRACTOR | 1440 | Subscription | `/my-packages` | /my-packages |
| CONTRACTOR | 1440 | Colors & Shades | `/colors-shades` | /colors-shades |
| CONTRACTOR | 1440 | Activity Log | `/activity-log` | /activity-log |
| CONTRACTOR | 1440 | Digital Profile | `/profile` | /profile |
| CONTRACTOR | 1440 | Account Security | `/account-security` | /account-security |
| CONTRACTOR | 1440 | Profile menu | `/dashboard` | opened and pressed Escape |
| CONTRACTOR | 390 | Dashboard | `/dashboard` | /dashboard |
| CONTRACTOR | 390 | Add Customer | `/customers?action=add` | /customers?action=add |
| CONTRACTOR | 390 | Add Property | `/properties?action=add` | /properties?action=add |
| CONTRACTOR | 390 | New Quotation | `/quotations/new` | /quotations/new |
| CONTRACTOR | 390 | Area Calculator | `/properties?calculator=1` | /properties?calculator=1 |
| CONTRACTOR | 390 | Customers | `/customers` | /customers |
| CONTRACTOR | 390 | Properties & Measurements | `/properties` | /properties |
| CONTRACTOR | 390 | Leads | `/leads` | /leads |
| CONTRACTOR | 390 | Site Visits | `/site-visits` | /site-visits |
| CONTRACTOR | 390 | Quotations | `/quotations` | /quotations |
| CONTRACTOR | 390 | Completed Projects | `/completed-projects` | /completed-projects |
| CONTRACTOR | 390 | Work Schedules | `/work-schedules` | /work-schedules |
| CONTRACTOR | 390 | Work Changes | `/work-changes` | /work-changes |
| CONTRACTOR | 390 | Work Reschedules | `/work-reschedules` | /work-reschedules |
| CONTRACTOR | 390 | Tasks | `/tasks` | /tasks |
| CONTRACTOR | 390 | Outsourced & Received Work | `/subcontract-work-orders` | /subcontract-work-orders |
| CONTRACTOR | 390 | Completed Work | `/completed-work` | /completed-work |
| CONTRACTOR | 390 | Work Photos | `/work-photos` | /work-photos |
| CONTRACTOR | 390 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| CONTRACTOR | 390 | My Employees | `/in-house-applicators` | /in-house-applicators |
| CONTRACTOR | 390 | Contractor Network | `/contractor-network` | /contractor-network |
| CONTRACTOR | 390 | Job Posts & Applications | `/jobs` | /jobs |
| CONTRACTOR | 390 | Applications & Invitations | `/job-activity` | /job-activity |
| CONTRACTOR | 390 | Team Referrals | `/applicator-team` | /applicator-team |
| CONTRACTOR | 390 | Bookings & Requests | `/applicator-bookings` | /applicator-bookings |
| CONTRACTOR | 390 | Invoices | `/invoices` | /invoices |
| CONTRACTOR | 390 | Customer Payments & Revenue | `/contractor-revenue` | /contractor-revenue |
| CONTRACTOR | 390 | Messages | `/messages` | /messages |
| CONTRACTOR | 390 | Service Requests | `/service-requests` | /service-requests |
| CONTRACTOR | 390 | Support Tickets | `/support-tickets` | /support-tickets |
| CONTRACTOR | 390 | Services & Rates | `/master-services` | /master-services |
| CONTRACTOR | 390 | Reports | `/reports` | /reports |
| CONTRACTOR | 390 | Settings | `/settings` | /settings |
| CONTRACTOR | 390 | Theme Settings | `/contractor-theme` | /settings?tab=appearance |
| CONTRACTOR | 390 | Subscription | `/my-packages` | /my-packages |
| CONTRACTOR | 390 | Colors & Shades | `/colors-shades` | /colors-shades |
| CONTRACTOR | 390 | Activity Log | `/activity-log` | /activity-log |
| CONTRACTOR | 390 | Digital Profile | `/profile` | /profile |
| CONTRACTOR | 390 | Account Security | `/account-security` | /account-security |
| CUSTOMER | 1440 | Dashboard | `/customer-dashboard` | /customer-dashboard |
| CUSTOMER | 1440 | My Properties | `/customer-properties` | /customer-properties |
| CUSTOMER | 1440 | My Quotations | `/customer-quotations` | /customer-quotations |
| CUSTOMER | 1440 | Shared Measurements | `/measurement-access` | /measurement-access |
| CUSTOMER | 1440 | Work Schedules | `/work-schedules` | /work-schedules |
| CUSTOMER | 1440 | Work Changes | `/work-changes` | /work-changes |
| CUSTOMER | 1440 | Work Reschedules | `/work-reschedules` | /work-reschedules |
| CUSTOMER | 1440 | Completed Work | `/completed-work` | /completed-work |
| CUSTOMER | 1440 | Work Photos | `/work-photos` | /work-photos |
| CUSTOMER | 1440 | My Contractors | `/customer/connections` | /customer/connections |
| CUSTOMER | 1440 | Review Contractors | `/customer-reviews` | /customer-reviews |
| CUSTOMER | 1440 | Payments & Invoices | `/customer-invoices` | /customer-invoices |
| CUSTOMER | 1440 | Messages | `/messages` | /messages |
| CUSTOMER | 1440 | Service Requests | `/service-requests` | /service-requests |
| CUSTOMER | 1440 | Support Tickets | `/support-tickets` | /support-tickets |
| CUSTOMER | 1440 | Colors & Shades | `/colors-shades` | /colors-shades |
| CUSTOMER | 1440 | Activity Log | `/activity-log` | /activity-log |
| CUSTOMER | 1440 | Appearance | `/appearance` | /appearance |
| CUSTOMER | 1440 | My Profile | `/customer/profile` | /customer/profile |
| CUSTOMER | 1440 | Account Security | `/account-security` | /account-security |
| CONTRACTOR | 1440 | Notifications | `/dashboard` | opened and pressed Escape |
| CONTRACTOR | 1440 | Profile menu | `/dashboard` | opened and pressed Escape |
| CONTRACTOR | 390 | Notifications | `/dashboard` | opened and pressed Escape |
| CONTRACTOR | 390 | Profile menu | `/dashboard` | opened and pressed Escape |
| CUSTOMER | 1440 | Notifications | `/customer-dashboard` | opened and pressed Escape |
| CUSTOMER | 1440 | Profile menu | `/customer-dashboard` | opened and pressed Escape |
| CUSTOMER | 390 | Dashboard | `/customer-dashboard` | /customer-dashboard |
| CUSTOMER | 390 | My Properties | `/customer-properties` | /customer-properties |
| CUSTOMER | 390 | My Quotations | `/customer-quotations` | /customer-quotations |
| CUSTOMER | 390 | Shared Measurements | `/measurement-access` | /measurement-access |
| CUSTOMER | 390 | Work Schedules | `/work-schedules` | /work-schedules |
| CUSTOMER | 390 | Work Changes | `/work-changes` | /work-changes |
| CUSTOMER | 390 | Work Reschedules | `/work-reschedules` | /work-reschedules |
| CUSTOMER | 390 | Completed Work | `/completed-work` | /completed-work |
| CUSTOMER | 390 | Work Photos | `/work-photos` | /work-photos |
| CUSTOMER | 390 | My Contractors | `/customer/connections` | /customer/connections |
| CUSTOMER | 390 | Review Contractors | `/customer-reviews` | /customer-reviews |
| CUSTOMER | 390 | Payments & Invoices | `/customer-invoices` | /customer-invoices |
| CUSTOMER | 390 | Messages1 | `/messages` | /messages |
| CUSTOMER | 390 | Service Requests | `/service-requests` | /service-requests |
| CUSTOMER | 390 | Support Tickets | `/support-tickets` | /support-tickets |
| CUSTOMER | 390 | Colors & Shades | `/colors-shades` | /colors-shades |
| CUSTOMER | 390 | Activity Log | `/activity-log` | /activity-log |
| CUSTOMER | 390 | Appearance | `/appearance` | /appearance |
| CUSTOMER | 390 | My Profile | `/customer/profile` | /customer/profile |
| CUSTOMER | 390 | Account Security | `/account-security` | /account-security |
| CUSTOMER | 390 | Notifications | `/customer-dashboard` | opened and pressed Escape |
| CUSTOMER | 390 | Profile menu | `/customer-dashboard` | opened and pressed Escape |
| PAINTER_FREELANCE | 1440 | Dashboard | `/dashboard` | /dashboard |
| PAINTER_FREELANCE | 1440 | My Assignments | `/painter-assignments` | /painter-assignments |
| PAINTER_FREELANCE | 1440 | Availability & Calendar | `/applicator-availability` | /applicator-availability |
| PAINTER_FREELANCE | 1440 | Work Photos | `/work-photos` | /work-photos |
| PAINTER_FREELANCE | 1440 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| PAINTER_FREELANCE | 1440 | Available Work | `/jobs` | /jobs |
| PAINTER_FREELANCE | 1440 | Applications & Invitations | `/job-activity` | /job-activity |
| PAINTER_FREELANCE | 1440 | Bookings & Requests | `/applicator-bookings` | /applicator-bookings |
| PAINTER_FREELANCE | 1440 | My Payments | `/in-house-earnings` | /in-house-earnings |
| PAINTER_FREELANCE | 1440 | Messages | `/messages` | /messages |
| PAINTER_FREELANCE | 1440 | Support Tickets | `/support-tickets` | /support-tickets |
| PAINTER_FREELANCE | 1440 | Settings | `/settings` | /settings |
| PAINTER_FREELANCE | 1440 | Subscription | `/my-packages` | /my-packages |
| PAINTER_FREELANCE | 1440 | Colors & Shades | `/colors-shades` | /colors-shades |
| PAINTER_FREELANCE | 1440 | Activity Log | `/activity-log` | /activity-log |
| PAINTER_FREELANCE | 1440 | Appearance | `/appearance` | /appearance |
| PAINTER_FREELANCE | 1440 | Digital Profile | `/profile` | /profile |
| PAINTER_FREELANCE | 1440 | Account Security | `/account-security` | /account-security |
| PAINTER_FREELANCE | 1440 | Notifications | `/dashboard` | opened and pressed Escape |
| PAINTER_FREELANCE | 1440 | Profile menu | `/dashboard` | opened and pressed Escape |
| PAINTER_FREELANCE | 390 | Dashboard | `/dashboard` | /dashboard |
| PAINTER_FREELANCE | 390 | My Assignments | `/painter-assignments` | /painter-assignments |
| PAINTER_FREELANCE | 390 | Availability & Calendar | `/applicator-availability` | /applicator-availability |
| PAINTER_FREELANCE | 390 | Work Photos | `/work-photos` | /work-photos |
| PAINTER_FREELANCE | 390 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| PAINTER_FREELANCE | 390 | Available Work | `/jobs` | /jobs |
| PAINTER_FREELANCE | 390 | Applications & Invitations | `/job-activity` | /job-activity |
| PAINTER_FREELANCE | 390 | Bookings & Requests1 | `/applicator-bookings` | /applicator-bookings |
| PAINTER_FREELANCE | 390 | My Payments | `/in-house-earnings` | /in-house-earnings |
| PAINTER_FREELANCE | 390 | Messages | `/messages` | /messages |
| PAINTER_FREELANCE | 390 | Support Tickets | `/support-tickets` | /support-tickets |
| PAINTER_FREELANCE | 390 | Settings | `/settings` | /settings |
| PAINTER_FREELANCE | 390 | Subscription | `/my-packages` | /my-packages |
| PAINTER_FREELANCE | 390 | Colors & Shades | `/colors-shades` | /colors-shades |
| PAINTER_FREELANCE | 390 | Activity Log | `/activity-log` | /activity-log |
| PAINTER_FREELANCE | 390 | Appearance | `/appearance` | /appearance |
| PAINTER_FREELANCE | 390 | Digital Profile | `/profile` | /profile |
| PAINTER_FREELANCE | 390 | Account Security | `/account-security` | /account-security |
| PAINTER_FREELANCE | 390 | Notifications | `/dashboard` | opened and pressed Escape |
| PAINTER_FREELANCE | 390 | Profile menu | `/dashboard` | opened and pressed Escape |
| PAINTER_INHOUSE | 1440 | Dashboard | `/dashboard` | /dashboard |
| PAINTER_INHOUSE | 1440 | My Assignments | `/painter-assignments` | /painter-assignments |
| PAINTER_INHOUSE | 1440 | Work Photos | `/work-photos` | /work-photos |
| PAINTER_INHOUSE | 1440 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| PAINTER_INHOUSE | 1440 | My Employment | `/in-house-applicators` | /in-house-applicators |
| PAINTER_INHOUSE | 1440 | Applications & Invitations | `/job-activity` | /job-activity |
| PAINTER_INHOUSE | 1440 | My Payments | `/in-house-earnings` | /in-house-earnings |
| PAINTER_INHOUSE | 1440 | Messages | `/messages` | /messages |
| PAINTER_INHOUSE | 1440 | Support Tickets | `/support-tickets` | /support-tickets |
| PAINTER_INHOUSE | 1440 | Settings | `/settings` | /settings |
| PAINTER_INHOUSE | 1440 | Subscription | `/my-packages` | /my-packages |
| PAINTER_INHOUSE | 1440 | Colors & Shades | `/colors-shades` | /colors-shades |
| PAINTER_INHOUSE | 1440 | Activity Log | `/activity-log` | /activity-log |
| PAINTER_INHOUSE | 1440 | Appearance | `/appearance` | /appearance |
| PAINTER_INHOUSE | 1440 | Digital Profile | `/profile` | /profile |
| PAINTER_INHOUSE | 1440 | Account Security | `/account-security` | /account-security |
| PAINTER_INHOUSE | 1440 | Notifications | `/dashboard` | opened and pressed Escape |
| PAINTER_INHOUSE | 1440 | Profile menu | `/dashboard` | opened and pressed Escape |
| PAINTER_INHOUSE | 390 | Dashboard | `/dashboard` | /dashboard |
| PAINTER_INHOUSE | 390 | My Assignments | `/painter-assignments` | /painter-assignments |
| PAINTER_INHOUSE | 390 | Work Photos | `/work-photos` | /work-photos |
| PAINTER_INHOUSE | 390 | Ratings & Reviews | `/work-reviews` | /work-reviews |
| PAINTER_INHOUSE | 390 | My Employment | `/in-house-applicators` | /in-house-applicators |
| PAINTER_INHOUSE | 390 | Applications & Invitations | `/job-activity` | /job-activity |
| PAINTER_INHOUSE | 390 | My Payments | `/in-house-earnings` | /in-house-earnings |
| PAINTER_INHOUSE | 390 | Messages | `/messages` | /messages |
| PAINTER_INHOUSE | 390 | Support Tickets | `/support-tickets` | /support-tickets |
| PAINTER_INHOUSE | 390 | Settings | `/settings` | /settings |
| PAINTER_INHOUSE | 390 | Subscription | `/my-packages` | /my-packages |
| PAINTER_INHOUSE | 390 | Colors & Shades | `/colors-shades` | /colors-shades |
| PAINTER_INHOUSE | 390 | Activity Log | `/activity-log` | /activity-log |
| PAINTER_INHOUSE | 390 | Appearance | `/appearance` | /appearance |
| PAINTER_INHOUSE | 390 | Digital Profile | `/profile` | /profile |
| PAINTER_INHOUSE | 390 | Account Security | `/account-security` | /account-security |
| ADMIN | 1440 | Dashboard | `/dashboard` | /dashboard |
| ADMIN | 1440 | Work Photos | `/work-photos` | /work-photos |
| ADMIN | 1440 | Contractors | `/contractors` | /contractors |
| ADMIN | 1440 | Employees & Professionals | `/painters` | /painters |
| ADMIN | 1440 | Customer Connections | `/customer-connections` | /customer-connections |
| ADMIN | 1440 | Billing | `/billing` | /billing |
| ADMIN | 1440 | Subscription Revenue | `/revenue` | /revenue |
| ADMIN | 1440 | Support Tickets | `/support-tickets` | /support-tickets |
| ADMIN | 1440 | Support Staff | `/support-staff` | /support-staff |
| ADMIN | 1440 | Service Catalogue & Master Data | `/master-services` | /master-services |
| ADMIN | 1440 | Reports | `/reports` | /reports |
| ADMIN | 1440 | Packages | `/packages` | /packages |
| ADMIN | 1440 | API Settings | `/admin-integrations` | /admin-integrations |
| ADMIN | 1440 | Activity Log | `/activity-log` | /activity-log |
| ADMIN | 1440 | Appearance | `/appearance` | /appearance |
| ADMIN | 1440 | Digital Profile | `/profile` | /profile |
| ADMIN | 1440 | Account Security | `/account-security` | /account-security |
| ADMIN | 1440 | Notifications | `/dashboard` | opened and pressed Escape |
| ADMIN | 1440 | Profile menu | `/dashboard` | opened and pressed Escape |
| ADMIN | 390 | Dashboard | `/dashboard` | /dashboard |
| ADMIN | 390 | Work Photos | `/work-photos` | /work-photos |
| ADMIN | 390 | Contractors | `/contractors` | /contractors |
| ADMIN | 390 | Employees & Professionals | `/painters` | /painters |
| ADMIN | 390 | Customer Connections | `/customer-connections` | /customer-connections |
| ADMIN | 390 | Billing | `/billing` | /billing |
| ADMIN | 390 | Subscription Revenue | `/revenue` | /revenue |
| ADMIN | 390 | Support Tickets | `/support-tickets` | /support-tickets |
| ADMIN | 390 | Support Staff | `/support-staff` | /support-staff |
| ADMIN | 390 | Service Catalogue & Master Data | `/master-services` | /master-services |
| ADMIN | 390 | Reports | `/reports` | /reports |
| ADMIN | 390 | Packages | `/packages` | /packages |
| ADMIN | 390 | API Settings | `/admin-integrations` | /admin-integrations |
| ADMIN | 390 | Activity Log | `/activity-log` | /activity-log |
| ADMIN | 390 | Appearance | `/appearance` | /appearance |
| ADMIN | 390 | Digital Profile | `/profile` | /profile |
| ADMIN | 390 | Account Security | `/account-security` | /account-security |

## Control, popup and tab checks

| Role | Route | Width | Control | Result |
|---|---|---|---|---|
| PUBLIC | `/login` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/login` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/dashboard` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/register` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/dashboard` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/register` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/customer-register` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers?action=add` | 1440 | Add customer | not completed; selector/state needs manual follow-up |
| CONTRACTOR | `/customers?action=add` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/customers?action=add` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNEW\nCONTACTED\nFOLLOW_UP\nSITE_VISIT\nQUOTATION_SE', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PUBLIC | `/customer-register` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers?action=add` | 390 | Add customer | not completed; selector/state needs manual follow-up |
| CONTRACTOR | `/customers?action=add` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/customers?action=add` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNEW\nCONTACTED\nFOLLOW_UP\nSITE_VISIT\nQUOTATION_SE', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PUBLIC | `/forgot-password` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/forgot-password` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'English\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ்', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties?action=add` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties?action=add` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'SL NO.', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/preview/sidebar` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties?action=add` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties?action=add` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Test Home\nOwner: QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/preview/sidebar` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/preview/settings` | 1440 | Business details | opened/activated |
| PUBLIC | `/preview/settings` | 1440 | Appearance | opened/activated |
| PUBLIC | `/preview/settings` | 1440 | Keyboard Tab | {'tag': 'A', 'name': 'Bharath Apps\nBharath Painters', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/preview/settings` | 390 | Business details | opened/activated |
| PUBLIC | `/preview/settings` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Painters\nPreview · sample data\n\nBUSINES', 'outline': 'none', 'shadow': 'none'} |
| PUBLIC | `/preview/subcontract-work-orders` | 1440 | Keyboard Tab | {'tag': 'A', 'name': 'Bharath Apps\nContractor workspace', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties?calculator=1` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties?calculator=1` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All calculation types\nInterior\nExterior', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PUBLIC | `/preview/subcontract-work-orders` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'Bharath Apps', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties?calculator=1` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties?calculator=1` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All calculation types\nInterior\nExterior', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PUBLIC | `/preview/bharath-apps` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Reset demo data', 'outline': 'solid', 'shadow': 'none'} |
| PUBLIC | `/preview/bharath-apps` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Reset demo data', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers` | 1440 | Add customer | opened/activated |
| CONTRACTOR | `/customers` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/customers` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNEW\nCONTACTED\nFOLLOW_UP\nSITE_VISIT\nQUOTATION_SE', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/customers` | 390 | Add customer | opened/activated |
| CONTRACTOR | `/customers` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/customers` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNEW\nCONTACTED\nFOLLOW_UP\nSITE_VISIT\nQUOTATION_SE', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer-dashboard` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'SL NO.', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-dashboard` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/properties` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Test Home\nOwner: QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-properties` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/leads` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/leads` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'SL. NO.', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-properties` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/leads` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/leads` | 390 | Keyboard Tab | {'tag': 'TH', 'name': 'SL. NO.', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/customer-quotations` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nSent\nViewed\nAccepted\nRejected\nRevision Requeste', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/site-visits` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/customer-quotations` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nSent\nViewed\nAccepted\nRejected\nRevision Requeste', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/site-visits` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/measurement-access` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All active statuses\nDRAFT\nSENT\nVIEWED\nACCEPTED\nSCHEDULED\nIN ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/measurement-access` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All active statuses\nDRAFT\nSENT\nVIEWED\nACCEPTED\nSCHEDULED\nIN ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/work-schedules` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/work-schedules` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Upcoming schedules\nAll dates\nToday\nPast 7 days\nThis month\nCu', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/completed-projects` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/work-schedules` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/work-schedules` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Upcoming schedules\nAll dates\nToday\nPast 7 days\nThis month\nCu', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/completed-projects` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/work-changes` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-schedules` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-schedules` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Upcoming schedules\nAll dates\nToday\nPast 7 days\nThis month\nCu', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/work-changes` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-schedules` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-schedules` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Upcoming schedules\nAll dates\nToday\nPast 7 days\nThis month\nCu', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/work-reschedules` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-changes` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/work-reschedules` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-changes` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/completed-work` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/completed-work` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nCustomer portal\nCollapse sidebar\nOVERVIEW\nDashb', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/work-reschedules` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-reschedules` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'QUOTATION', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/completed-work` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/completed-work` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'Home', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-reschedules` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-reschedules` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Change dates', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/work-photos` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/work-photos` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/tasks` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/work-photos` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/work-photos` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/tasks` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer/connections` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/subcontract-work-orders` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer/connections` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/subcontract-work-orders` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-reviews` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-reviews` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/completed-work` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/completed-work` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'QUOTATION', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-invoices` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/completed-work` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/completed-work` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'Home', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-invoices` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-photos` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-photos` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/messages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-photos` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/work-photos` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/messages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/work-reviews` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/service-requests` | 1440 | New request | opened/activated |
| CUSTOMER | `/service-requests` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/service-requests` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNew\nReviewing\nSite Visit\nQuotation\nAccepted\nCom', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/work-reviews` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/service-requests` | 390 | New request | opened/activated |
| CUSTOMER | `/service-requests` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/service-requests` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNew\nReviewing\nSite Visit\nQuotation\nAccepted\nCom', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/in-house-applicators` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/support-tickets` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/support-tickets` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/in-house-applicators` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/support-tickets` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/support-tickets` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/contractor-network` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/colors-shades` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/contractor-network` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/colors-shades` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/jobs` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/jobs` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CUSTOMER | `/activity-log` | 1440 | Search | entered no-match query and cleared |
| CUSTOMER | `/activity-log` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/jobs` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/jobs` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CUSTOMER | `/activity-log` | 390 | Search | entered no-match query and cleared |
| CUSTOMER | `/activity-log` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.0901961 0.419608 0.607843 / 0.14) 0px 0px 0px 3px'} |
| CONTRACTOR | `/job-activity` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/job-activity` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CUSTOMER | `/appearance` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/job-activity` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/job-activity` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CUSTOMER | `/appearance` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-team` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer/profile` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-team` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer/profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-bookings` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/account-security` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-bookings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/account-security` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/invoices` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/invoices` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All dates\nToday\nLast 7 days\nThis month\nCustom dates', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer/connection-requests` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/invoices` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/invoices` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All dates\nToday\nLast 7 days\nThis month\nCustom dates', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer/connection-requests` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/contractor-revenue` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/contractor-revenue` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Receipts 1', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations/104` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/contractor-revenue` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/contractor-revenue` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Receipts 1', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations/104` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/messages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations/103` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/messages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-quotations/103` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/service-requests` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/service-requests` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNew\nReviewing\nSite Visit\nQuotation\nAccepted\nCom', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer-quotations/102` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/service-requests` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/service-requests` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nNew\nReviewing\nSite Visit\nQuotation\nAccepted\nCom', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer-quotations/102` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/support-tickets` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/support-tickets` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer-quotations/101` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/support-tickets` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/support-tickets` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CUSTOMER | `/customer-quotations/101` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/master-services` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/master-services` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'All · 1', 'outline': 'solid', 'shadow': 'rgb(255, 255, 255) 0px 0px 0px 1px inset'} |
| CUSTOMER | `/customer-properties/46` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/master-services` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/master-services` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'All · 1', 'outline': 'solid', 'shadow': 'rgb(255, 255, 255) 0px 0px 0px 1px inset'} |
| CUSTOMER | `/customer-properties/46` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/reports` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-properties/46/access` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/reports` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CUSTOMER | `/customer-properties/46/access` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/dashboard` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/contractor-theme` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/dashboard` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/contractor-theme` | 390 | Business details | opened/activated |
| CONTRACTOR | `/contractor-theme` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/painter-assignments` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/painter-assignments` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/my-packages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-availability` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/my-packages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-availability` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/colors-shades` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/work-photos` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/work-photos` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-COMPLETED - QA Test Home', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/colors-shades` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/work-photos` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/work-photos` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-COMPLETED - QA Test Home', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/activity-log` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/activity-log` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_FREELANCE | `/work-reviews` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/activity-log` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/activity-log` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_FREELANCE | `/work-reviews` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/profile` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/jobs` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/jobs` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/jobs` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/jobs` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/account-security` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/job-activity` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/job-activity` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/account-security` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/job-activity` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/job-activity` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/applicator` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-bookings` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-bookings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/appearance` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-earnings` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/appearance` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-earnings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/opportunities` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/opportunities` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/messages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/opportunities` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/opportunities` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/messages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/opportunities/new` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/support-tickets` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/support-tickets` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/opportunities/new` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/support-tickets` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/support-tickets` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/painter-seeking` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/painter-seeking` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_FREELANCE | `/settings` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/painter-seeking` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/painter-seeking` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_FREELANCE | `/settings` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/find-painter` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/my-packages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/find-painter` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/my-packages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/in-house-applicators/new` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/colors-shades` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/in-house-applicators/new` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/colors-shades` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/measurement-trial` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/measurement-trial` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'living area', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/activity-log` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/activity-log` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/measurement-trial` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/measurement-trial` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'living area', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/activity-log` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/activity-log` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/provider-profile` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/provider-profile` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\nOVERVIEW\nDashboar', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/appearance` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/provider-profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/appearance` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/profile` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-profile` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/applicator-profile` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/applicator-profile` | 390 | Business details | opened/activated |
| CONTRACTOR | `/applicator-profile` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/account-security` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new-measured` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new-measured` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/account-security` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new-measured` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new-measured` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new-manual` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new-manual` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new-manual` | 390 | Search | entered no-match query and cleared |
| CONTRACTOR | `/quotations/new-manual` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'QA Customer', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/painter-seeking` | 1440 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/painter-seeking` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/settings?tab=company` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=company` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/painter-seeking` | 390 | Search | entered no-match query and cleared |
| PAINTER_FREELANCE | `/painter-seeking` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_FREELANCE | `/find-painter` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=company` | 390 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=company` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/find-painter` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=personal` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=personal` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-applicators` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=personal` | 390 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=personal` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-applicators` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-applicators/new` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=trade` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=trade` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/in-house-applicators/new` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=trade` | 390 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=trade` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/provider-profile` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/provider-profile` | 1440 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/provider-profile` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=appearance` | 1440 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=appearance` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/provider-profile` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/provider-profile` | 390 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/provider-profile` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/settings?tab=appearance` | 390 | Business details | opened/activated |
| CONTRACTOR | `/settings?tab=appearance` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-profile` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/applicator-profile` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/104` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/104` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/applicator-profile` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/applicator-profile` | 390 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/applicator-profile` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'View & share QR/public profile', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/103` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=company` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=company` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/103` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=company` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=company` | 390 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=company` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Settings\n\nLanguage / Script\nEnglish\nతెలుగు\nಕನ್ನಡ\nहिन्दी\nதமிழ', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/102` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=personal` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=personal` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/102` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=personal` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=personal` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/101` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=trade` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=trade` | 1440 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=trade` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/101` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers/46` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=trade` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=trade` | 390 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=trade` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/customers/46` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 1440 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/properties/46` | 1440 | Edit | opened/activated |
| CONTRACTOR | `/properties/46` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Remove property from my board', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 390 | Trade & skills | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 390 | Personal details | opened/activated |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/properties/46` | 390 | Edit | opened/activated |
| CONTRACTOR | `/properties/46` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Remove property from my board', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/dashboard` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/in-house-applicators/8` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/dashboard` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/in-house-applicators/8` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/painter-assignments` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/painter-assignments` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/opportunities/7` | 1440 | Completed | opened/activated |
| CONTRACTOR | `/opportunities/7` | 1440 | Edit | opened/activated |
| CONTRACTOR | `/opportunities/7` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/work-photos` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/work-photos` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACTIVE - QA Test Home', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/opportunities/7` | 390 | Completed | opened/activated |
| CONTRACTOR | `/opportunities/7` | 390 | Edit | opened/activated |
| CONTRACTOR | `/opportunities/7` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/work-photos` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/work-photos` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACTIVE - QA Test Home', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/quotations/104/edit` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/104/edit` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/work-reviews` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/work-reviews` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/103/edit` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/in-house-applicators` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/103/edit` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/in-house-applicators` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/102/edit` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/job-activity` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/job-activity` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/102/edit` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/job-activity` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/job-activity` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/101/edit` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/in-house-earnings` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/101/edit` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/in-house-earnings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers/46/quotations` | 1440 | Search | entered no-match query and cleared |
| CONTRACTOR | `/customers/46/quotations` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nDRAFT\nSENT\nVIEWED\nACCEPTED\nSCHEDULED\nIN PROGRES', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/messages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/customers/46/quotations` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/messages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/support-tickets` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/support-tickets` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/support-tickets` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/support-tickets` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| CONTRACTOR | `/properties/46/measurements` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| CONTRACTOR | `/properties/46/measurements` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/dashboard` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/my-packages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/dashboard` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/dashboard` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/my-packages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/work-photos` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/work-photos` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/colors-shades` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/work-photos` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/work-photos` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All projects\nQA-QTN-ACCEPTED - QA Test Home\nQA-QTN-ACTIVE - ', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/colors-shades` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/contractors` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/contractors` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'COMPANY', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/activity-log` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/activity-log` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| ADMIN | `/contractors` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/contractors` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'View', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/activity-log` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/activity-log` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| ADMIN | `/painters` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/painters` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All availability\nAvailable\nBusy\nOffline', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/appearance` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/painters` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/painters` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All availability\nAvailable\nBusy\nOffline', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/appearance` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/customer-connections` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/customer-connections` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'CUSTOMER', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/profile` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/customer-connections` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/customer-connections` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'Home', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/billing` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/billing` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Name A–Z\nName Z–A\nPackage A–Z\nMembership status\nExpiry: earl', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/account-security` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/billing` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/billing` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'Name A–Z\nName Z–A\nPackage A–Z\nMembership status\nExpiry: earl', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/account-security` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/revenue` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/revenue` | 1440 | Keyboard Tab | {'tag': 'TH', 'name': 'RECEIVED', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/revenue` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/revenue` | 390 | Keyboard Tab | {'tag': 'A', 'name': 'Home', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/painter-seeking` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/painter-seeking` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| ADMIN | `/support-tickets` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/support-tickets` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/painter-seeking` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/painter-seeking` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| ADMIN | `/support-tickets` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/support-tickets` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses\nOPEN\nIN_PROGRESS\nNEEDS_ADMIN\nRESOLVED\nCLOSED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/find-painter` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/support-staff` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/find-painter` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/support-staff` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/jobs` | 1440 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/jobs` | 1440 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/master-services` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/master-services` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'All · 1', 'outline': 'solid', 'shadow': 'rgb(255, 255, 255) 0px 0px 0px 1px inset'} |
| PAINTER_INHOUSE | `/jobs` | 390 | Search | entered no-match query and cleared |
| PAINTER_INHOUSE | `/jobs` | 390 | Keyboard Tab | {'tag': 'INPUT', 'name': '', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/master-services` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/master-services` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'All · 1', 'outline': 'solid', 'shadow': 'rgb(255, 255, 255) 0px 0px 0px 1px inset'} |
| PAINTER_INHOUSE | `/in-house-applicators/new` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/reports` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/in-house-applicators/new` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/reports` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator-availability` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/packages` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator-availability` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/packages` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator-bookings` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/admin-integrations` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator-bookings` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/admin-integrations` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/provider-profile` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/provider-profile` | 1440 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/provider-profile` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/activity-log` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/activity-log` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/provider-profile` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/provider-profile` | 390 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/provider-profile` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/applicator-profile` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/applicator-profile` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/activity-log` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/activity-log` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All actions\nCreated\nUpdated\nDeleted\nStatus changed\nSigned in', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/applicator-profile` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/applicator-profile` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/appearance` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings?tab=company` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=company` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/appearance` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/appearance` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| ADMIN | `/profile` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/profile` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/settings?tab=company` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=company` | 390 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=company` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/profile` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/profile` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/settings?tab=personal` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=personal` | 1440 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=personal` | 1440 | Keyboard Tab | {'tag': 'A', 'name': 'View & share QR/public profile', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/account-security` | 1440 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Collapse sidebar', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings?tab=personal` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=personal` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/account-security` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings?tab=trade` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=trade` | 1440 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=trade` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| ADMIN | `/applicator` | 1440 | Search | entered no-match query and cleared |
| ADMIN | `/applicator` | 1440 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/settings?tab=trade` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=trade` | 390 | Personal details | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=trade` | 390 | Keyboard Tab | {'tag': 'BUTTON', 'name': 'Open navigation', 'outline': 'solid', 'shadow': 'none'} |
| ADMIN | `/applicator` | 390 | Search | entered no-match query and cleared |
| ADMIN | `/applicator` | 390 | Keyboard Tab | {'tag': 'SELECT', 'name': 'All statuses / roles\nVERIFIED', 'outline': 'solid', 'shadow': 'color(srgb 0.917647 0.941647 0.951529) 0px 0px 0px 3px'} |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 1440 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 1440 | Keyboard Tab | {'tag': 'BODY', 'name': 'Bharath Apps\nBharath Apps\nCollapse sidebar\n\nLoading employme', 'outline': 'none', 'shadow': 'none'} |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 390 | Trade & skills | opened/activated |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 390 | Keyboard Tab | {'tag': 'BODY', 'name': 'Loading workspace…', 'outline': 'none', 'shadow': 'none'} |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 1440 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 1440 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 1440 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 360 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 360 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 360 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 390 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 390 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 390 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 430 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 430 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | 430 | Continue / Next | Clicked Continue; step 2 reached, then missing-service validation prevented further progression. No quotation saved. |
| CONTRACTOR | `/customers?action=add` | 1440 | Add from phone contacts | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 1440 | Add customer | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 1440 | Request Declined (0) | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 1440 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/customers?action=add` | 390 | Add from phone contacts | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 390 | Add customer | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 390 | Request Declined (0) | PARTIAL — TimeoutError |
| CONTRACTOR | `/customers?action=add` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/properties?action=add` | 1440 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?action=add` | 1440 | Search | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?action=add` | 1440 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/properties?action=add` | 390 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?action=add` | 390 | Search | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?action=add` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/quotations/new` | 1440 | New Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/quotations/new` | 1440 | Add Property | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/quotations/new` | 1440 | Add measurement | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/quotations/new` | 390 | New Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/quotations/new` | 390 | Add Property | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/quotations/new` | 390 | Add measurement | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?calculator=1` | 1440 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?calculator=1` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/properties?calculator=1` | 390 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties?calculator=1` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/customers` | 1440 | Add from phone contacts | activated without saving |
| CONTRACTOR | `/customers` | 1440 | Add customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/customers` | 1440 | Request Declined (0) | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/customers` | 390 | Add from phone contacts | activated without saving |
| CONTRACTOR | `/customers` | 390 | Add customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/customers` | 390 | Request Declined (0) | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties` | 1440 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/properties` | 390 | QA Test HomeOwner: QA Customer | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/properties` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/leads` | 1440 | Create a new lead | activated without saving |
| CONTRACTOR | `/leads` | 390 | Create a new lead | activated without saving |
| CONTRACTOR | `/quotations` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/quotations` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/work-changes` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/work-changes` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/work-reschedules` | 1440 | Change dates | activated without saving |
| CONTRACTOR | `/work-reschedules` | 390 | Change dates | activated without saving |
| CONTRACTOR | `/tasks` | 1440 | Add task | activated without saving |
| CONTRACTOR | `/tasks` | 390 | Add task | activated without saving |
| CONTRACTOR | `/completed-work` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/completed-work` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/in-house-applicators` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/in-house-applicators` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/job-activity` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/job-activity` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/invoices` | 1440 | New lump-sum invoice | activated without saving |
| CONTRACTOR | `/invoices` | 1440 | View invoice | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/invoices` | 390 | New lump-sum invoice | activated without saving |
| CONTRACTOR | `/invoices` | 390 | View invoice | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-revenue` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/contractor-revenue` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/service-requests` | 1440 | Add as lead | activated without saving |
| CONTRACTOR | `/service-requests` | 390 | Add as lead | activated without saving |
| CONTRACTOR | `/support-tickets` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/support-tickets` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/master-services` | 1440 | Add Room / Area | activated without saving |
| CONTRACTOR | `/master-services` | 390 | Add Room / Area | activated without saving |
| CONTRACTOR | `/reports` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/reports` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/settings` | 1440 | Business details | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/settings` | 1440 | Appearance | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/settings` | 1440 | Upload | activated without saving |
| CONTRACTOR | `/settings` | 1440 | Add link | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/settings` | 390 | Business details | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/settings` | 390 | Appearance | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/settings` | 390 | Upload | activated without saving |
| CONTRACTOR | `/settings` | 390 | Add link | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 1440 | Business details | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 1440 | Appearance | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 1440 | Upload | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 1440 | Add link | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 390 | Business details | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 390 | Appearance | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 390 | Upload | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/contractor-theme` | 390 | Add link | BLOCKED — not visible/enabled in current fixture |
| CONTRACTOR | `/my-packages` | 1440 | Table sorting | activated a rendered sortable header |
| CONTRACTOR | `/my-packages` | 390 | Table sorting | PARTIAL — could not activate current header |
| CONTRACTOR | `/colors-shades` | 1440 | Add colour | activated without saving |
| CONTRACTOR | `/colors-shades` | 390 | Add colour | activated without saving |
| CONTRACTOR | `/account-security` | 1440 | Show passwords | NOT TESTED — state-changing or external action |
| CONTRACTOR | `/account-security` | 1440 | Show password | NOT TESTED — state-changing or external action |
| CONTRACTOR | `/account-security` | 390 | Show passwords | NOT TESTED — state-changing or external action |
| CONTRACTOR | `/account-security` | 390 | Show password | NOT TESTED — state-changing or external action |
| CUSTOMER | `/customer-quotations` | 1440 | Table sorting | activated a rendered sortable header |
| CUSTOMER | `/customer-quotations` | 390 | Table sorting | PARTIAL — could not activate current header |
| CUSTOMER | `/customer/connections` | 1440 | View contractor | activated without saving |
| CUSTOMER | `/customer/connections` | 390 | View contractor | activated without saving |
| CUSTOMER | `/customer-invoices` | 1440 | My payment receipts1 receipt · ₹25,000 received | NOT TESTED — state-changing or external action |
| CUSTOMER | `/customer-invoices` | 1440 | QA-INV-001PART PAIDQuotation QA-QTN-COMPLETED · QA Test HomeInvoice date5 Oct 2026Due date19 Oct 2026View expenditure breakdown | BLOCKED — not visible/enabled in current fixture |
| CUSTOMER | `/customer-invoices` | 390 | My payment receipts1 receipt · ₹25,000 received | NOT TESTED — state-changing or external action |
| CUSTOMER | `/customer-invoices` | 390 | QA-INV-001PART PAIDQuotation QA-QTN-COMPLETED · QA Test HomeInvoice date5 Oct 2026Due date19 Oct 2026View expenditure breakdown | BLOCKED — not visible/enabled in current fixture |
| CUSTOMER | `/service-requests` | 1440 | New request | activated without saving |
| CUSTOMER | `/service-requests` | 390 | New request | activated without saving |
| CUSTOMER | `/support-tickets` | 1440 | Raise a request | activated without saving |
| CUSTOMER | `/support-tickets` | 390 | Raise a request | activated without saving |
| CUSTOMER | `/colors-shades` | 1440 | Add colour | activated without saving |
| CUSTOMER | `/colors-shades` | 390 | Add colour | activated without saving |
| CUSTOMER | `/customer/profile` | 1440 | Upload | activated without saving |
| CUSTOMER | `/customer/profile` | 390 | Upload | activated without saving |
| CUSTOMER | `/account-security` | 1440 | Show passwords | NOT TESTED — state-changing or external action |
| CUSTOMER | `/account-security` | 390 | Show passwords | NOT TESTED — state-changing or external action |
| PAINTER_FREELANCE | `/job-activity` | 1440 | Table sorting | activated a rendered sortable header |
| PAINTER_FREELANCE | `/job-activity` | 390 | Table sorting | PARTIAL — could not activate current header |
| PAINTER_FREELANCE | `/settings` | 1440 | Trade & skills | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/settings` | 1440 | Personal details | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/settings` | 1440 | Upload | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/settings` | 390 | Trade & skills | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/settings` | 390 | Personal details | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/settings` | 390 | Upload | BLOCKED — not visible/enabled in current fixture |
| PAINTER_FREELANCE | `/my-packages` | 1440 | Table sorting | activated a rendered sortable header |
| PAINTER_FREELANCE | `/my-packages` | 390 | Table sorting | PARTIAL — could not activate current header |
| PAINTER_FREELANCE | `/colors-shades` | 1440 | Add colour | activated without saving |
| PAINTER_FREELANCE | `/colors-shades` | 390 | Add colour | activated without saving |
| PAINTER_FREELANCE | `/account-security` | 1440 | Show passwords | NOT TESTED — state-changing or external action |
| PAINTER_FREELANCE | `/account-security` | 1440 | Show password | NOT TESTED — state-changing or external action |
| PAINTER_FREELANCE | `/account-security` | 390 | Show passwords | NOT TESTED — state-changing or external action |
| PAINTER_FREELANCE | `/account-security` | 390 | Show password | NOT TESTED — state-changing or external action |
| PAINTER_INHOUSE | `/job-activity` | 1440 | Table sorting | activated a rendered sortable header |
| PAINTER_INHOUSE | `/job-activity` | 390 | Table sorting | PARTIAL — could not activate current header |
| PAINTER_INHOUSE | `/settings` | 1440 | Trade & skills | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/settings` | 1440 | Personal details | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/settings` | 1440 | Upload | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/settings` | 390 | Trade & skills | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/settings` | 390 | Personal details | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/settings` | 390 | Upload | BLOCKED — not visible/enabled in current fixture |
| PAINTER_INHOUSE | `/my-packages` | 1440 | Table sorting | activated a rendered sortable header |
| PAINTER_INHOUSE | `/my-packages` | 390 | Table sorting | PARTIAL — could not activate current header |
| PAINTER_INHOUSE | `/colors-shades` | 1440 | Add colour | activated without saving |
| PAINTER_INHOUSE | `/colors-shades` | 390 | Add colour | activated without saving |
| PAINTER_INHOUSE | `/account-security` | 1440 | Show passwords | NOT TESTED — state-changing or external action |
| PAINTER_INHOUSE | `/account-security` | 1440 | Show password | NOT TESTED — state-changing or external action |
| PAINTER_INHOUSE | `/account-security` | 390 | Show passwords | NOT TESTED — state-changing or external action |
| PAINTER_INHOUSE | `/account-security` | 390 | Show password | NOT TESTED — state-changing or external action |
| ADMIN | `/dashboard` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/dashboard` | 390 | Table sorting | activated a rendered sortable header |
| ADMIN | `/contractors` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/contractors` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/painters` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/painters` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/customer-connections` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/customer-connections` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/billing` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/billing` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/revenue` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/revenue` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/support-tickets` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/support-tickets` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/master-services` | 1440 | Add Room / Area | activated without saving |
| ADMIN | `/master-services` | 1440 | Edit living area | BLOCKED — not visible/enabled in current fixture |
| ADMIN | `/master-services` | 390 | Add Room / Area | activated without saving |
| ADMIN | `/master-services` | 390 | Edit living area | BLOCKED — not visible/enabled in current fixture |
| ADMIN | `/reports` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/reports` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/packages` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/packages` | 390 | Table sorting | PARTIAL — could not activate current header |
| ADMIN | `/admin-integrations` | 1440 | Show API key | activated without saving |
| ADMIN | `/admin-integrations` | 390 | Show API key | activated without saving |
| ADMIN | `/appearance` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/appearance` | 390 | Table sorting | activated a rendered sortable header |
| ADMIN | `/profile` | 1440 | Table sorting | activated a rendered sortable header |
| ADMIN | `/profile` | 390 | Table sorting | activated a rendered sortable header |
| ADMIN | `/account-security` | 1440 | Show passwords | NOT TESTED — state-changing or external action |
| ADMIN | `/account-security` | 1440 | Show password | NOT TESTED — state-changing or external action |
| ADMIN | `/account-security` | 390 | Show passwords | NOT TESTED — state-changing or external action |
| ADMIN | `/account-security` | 390 | Show password | NOT TESTED — state-changing or external action |
| ADMIN | `/dashboard` | 1440 | Contractors directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 1440 | Employees directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 1440 | Customers directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 1440 | Conversations directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 1440 | Quotations directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 390 | Contractors directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 390 | Employees directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 390 | Customers directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 390 | Conversations directory tab | activated rendered admin tab |
| ADMIN | `/dashboard` | 390 | Quotations directory tab | activated rendered admin tab |
| ADMIN | `/support-workspace` | 1440 | Recovery Center view | rendered as authorized Admin; account actions not submitted |
| ADMIN | `/support-workspace` | 360 | Recovery Center view | rendered as authorized Admin; account actions not submitted |
| ADMIN | `/support-workspace` | 390 | Recovery Center view | rendered as authorized Admin; account actions not submitted |
| ADMIN | `/support-workspace` | 430 | Recovery Center view | rendered as authorized Admin; account actions not submitted |
| ADMIN | `/support-workspace` | 768 | Recovery Center view | rendered as authorized Admin; account actions not submitted |
| CONTRACTOR | `/customers?action=add` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers?action=add` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/completed-projects` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/work-photos` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/invoices` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-revenue` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-revenue` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/messages` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/messages` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/messages` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/service-requests` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/service-requests` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/service-requests` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/service-requests` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/support-tickets` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/support-tickets` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/support-tickets` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/master-services` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/master-services` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/reports` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/settings` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/settings` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/settings` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-theme` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-theme` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-theme` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/contractor-theme` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/my-packages` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/activity-log` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/activity-log` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/activity-log` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/activity-log` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/profile` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/account-security` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/applicator` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/appearance` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/appearance` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/appearance` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/opportunities` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/opportunities` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/opportunities` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/find-painter` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/provider-profile` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/provider-profile` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/provider-profile` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/provider-profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/applicator-profile` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/applicator-profile` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/applicator-profile` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/applicator-profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/new-measured` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/new-manual` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/settings?tab=company` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/settings?tab=company` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/104` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/104` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/103` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/103` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/in-house-applicators/8` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/opportunities/7` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/opportunities/7` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/104/edit` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/104/edit` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/104/edit` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/103/edit` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/103/edit` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/103/edit` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/102/edit` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/102/edit` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101/edit` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101/edit` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101/edit` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/quotations/101/edit` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46/quotations` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46/quotations` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46/quotations` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/customers/46/quotations` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CONTRACTOR | `/properties/46/measurements` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-dashboard` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/completed-work` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer/connections` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-reviews` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-invoices` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-invoices` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/messages` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/messages` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/service-requests` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/service-requests` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/support-tickets` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/support-tickets` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/support-tickets` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/activity-log` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/activity-log` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer/connection-requests` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer/connection-requests` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer/connection-requests` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer/connection-requests` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/104` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/103` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/102` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/102` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/101` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/101` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-quotations/101` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-properties/46` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-properties/46` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-properties/46/access` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| CUSTOMER | `/customer-properties/46/access` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/dashboard` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/painter-assignments` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/painter-assignments` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/applicator-availability` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/work-photos` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/work-reviews` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/applicator-bookings` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/in-house-earnings` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/in-house-earnings` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/messages` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/messages` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/messages` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/support-tickets` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/support-tickets` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/support-tickets` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/find-painter` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/provider-profile` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/provider-profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/applicator-profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_FREELANCE | `/settings?tab=personal` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/work-reviews` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/in-house-applicators` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/in-house-applicators` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/job-activity` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/in-house-earnings` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/in-house-earnings` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/messages` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/messages` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/support-tickets` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/support-tickets` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/support-tickets` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/support-tickets` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/settings` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/settings` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/my-packages` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/activity-log` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/activity-log` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/activity-log` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/account-security` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/find-painter` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/find-painter` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/find-painter` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/find-painter` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-availability` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-availability` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-availability` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-availability` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-bookings` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-bookings` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-bookings` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-bookings` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/provider-profile` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/dashboard` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/dashboard` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/dashboard` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/contractors` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/painters` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/painters` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/painters` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/customer-connections` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/customer-connections` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/customer-connections` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/customer-connections` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/billing` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/billing` | 390 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/activity-log` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/appearance` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/appearance` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/profile` | 360 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/profile` | 430 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| ADMIN | `/applicator` | 1440 | Retry / wait for stable data | repeated initial loading/error-state render serially |
| PAINTER_INHOUSE | `/applicator-bookings` | 390 | Dashboard mobile Bookings | clicked actual dashboard shortcut |
| PAINTER_INHOUSE | `/applicator-availability` | 390 | Dashboard mobile Availability | clicked actual dashboard shortcut |
| PAINTER_INHOUSE | `/jobs` | 390 | Dashboard mobile Work Network | clicked actual dashboard shortcut |
| CONTRACTOR | `/dashboard` | 390 | Bottom navigation: Home | clicked visible mobile link; render checked, no mutation submitted |
| CONTRACTOR | `/customers` | 390 | Bottom navigation: Customers | clicked visible mobile link; render checked, no mutation submitted |
| CONTRACTOR | `/quotations/new` | 390 | Bottom navigation: Quotation | clicked visible mobile link; render checked, no mutation submitted |
| CONTRACTOR | `/properties?action=add` | 390 | Bottom navigation: Add property | clicked visible mobile link; render checked, no mutation submitted |
| CONTRACTOR | `/tasks` | 390 | Bottom navigation: Follow-ups | clicked visible mobile link; render checked, no mutation submitted |
| CUSTOMER | `/customer-dashboard` | 390 | Bottom navigation: Home | clicked visible mobile link; render checked, no mutation submitted |
| CUSTOMER | `/customer-quotations` | 390 | Bottom navigation: Quotations | clicked visible mobile link; render checked, no mutation submitted |
| CUSTOMER | `/customer-properties` | 390 | Bottom navigation: Properties | clicked visible mobile link; render checked, no mutation submitted |
| CUSTOMER | `/messages` | 390 | Bottom navigation: Messages | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/dashboard` | 390 | Bottom navigation: Home | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/jobs` | 390 | Bottom navigation: Available Work | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/painter-assignments` | 390 | Bottom navigation: Assignments | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/messages` | 390 | Bottom navigation: Messages | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/settings` | 390 | Bottom navigation: Settings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/jobs` | 390 | Dashboard shortcut: Work Network | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/painter-assignments` | 390 | Dashboard shortcut: Assignments | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/applicator-bookings` | 390 | Dashboard shortcut: Bookings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/applicator-availability` | 390 | Dashboard shortcut: Availability | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/in-house-earnings` | 390 | Dashboard shortcut: Earnings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/messages` | 390 | Dashboard shortcut: Messages | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/colors-shades` | 390 | Dashboard shortcut: Colors & Shades | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_FREELANCE | `/settings` | 390 | Dashboard shortcut: Settings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/dashboard` | 390 | Bottom navigation: Home | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/in-house-applicators` | 390 | Bottom navigation: My Employment | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/painter-assignments` | 390 | Bottom navigation: Assignments | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/messages` | 390 | Bottom navigation: Messages | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/settings` | 390 | Bottom navigation: Settings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/jobs` | 390 | Dashboard shortcut: Work Network | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/painter-assignments` | 390 | Dashboard shortcut: Assignments | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/applicator-bookings` | 390 | Dashboard shortcut: Bookings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/applicator-availability` | 390 | Dashboard shortcut: Availability | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/in-house-earnings` | 390 | Dashboard shortcut: Earnings | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/messages` | 390 | Dashboard shortcut: Messages | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/colors-shades` | 390 | Dashboard shortcut: Colors & Shades | clicked visible mobile link; render checked, no mutation submitted |
| PAINTER_INHOUSE | `/settings` | 390 | Dashboard shortcut: Settings | clicked visible mobile link; render checked, no mutation submitted |
| ADMIN | `/dashboard` | 390 | Bottom navigation: Home | clicked visible mobile link; render checked, no mutation submitted |
| ADMIN | `/contractors` | 390 | Bottom navigation: Contractors | clicked visible mobile link; render checked, no mutation submitted |
| ADMIN | `/painters` | 390 | Bottom navigation: Professionals | clicked visible mobile link; render checked, no mutation submitted |
| ADMIN | `/billing` | 390 | Bottom navigation: Billing | clicked visible mobile link; render checked, no mutation submitted |
| ADMIN | `/reports` | 390 | Bottom navigation: Reports | clicked visible mobile link; render checked, no mutation submitted |

## Subpages, dialogs, tabs and filters checklist

These source hints are an inventory, not successful workflow assertions. Only recorded action evidence above is VERIFIED. All other controls/flows remain NOT TESTED or BLOCKED.

- `/login` — frontend/src/pages/Login.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form, FormData, role="dialog"; named controls=Enter password, Close support form
- `/register` — frontend/src/pages/Register.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form, FormData; named controls=9876543210 or +91 9876543210
- `/customer-register` — frontend/src/pages/CustomerRegister.jsx: search=True; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=
- `/customer-link/:token` — frontend/src/pages/CustomerShareLink.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/join/property/:token` — frontend/src/pages/JoinProperty.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/forgot-password` — frontend/src/pages/ForgotPassword.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/dashboard` — frontend/src/pages/Dashboard.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Refresh, Painter work focus
- `/applicator` — frontend/src/pages/Dashboard.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Refresh, Painter work focus
- `/customer-dashboard` — frontend/src/pages/CustomerDashboard.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Needs your attention, Account overview, Quick actions, Your work, No scheduled work yet, Quotations, No quotations yet, Payments, Service requests, No service requests yet, Your contractors, No contractors connected yet, My properties, No properties yet, Support requests, No support requests
- `/customer/connections` — frontend/src/pages/CustomerConnections.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Dialog, role="dialog"; named controls=Your contractors, Filter contractor connections, Work shared with this contractor, Close contractor profile
- `/customer/profile` — frontend/src/pages/CustomerProfile.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form, FormData; named controls=Account summary
- `/profile` — frontend/src/pages/ProfileCard.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/customer-reviews` — frontend/src/pages/CustomerContractorReviews.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Review your contractors, Review summary, What went well? What should other customers know?, No connected contractors yet
- `/completed-projects` — frontend/src/pages/ContractorCompletedProjects.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=FormData; named controls=Apartment repaint, https://maps.app.goo.gl/..., Skyline Bagmane Champagne Hills, Bangalore, Building, street, area and PIN code, 560001, Brief description of the project, Painting, waterproofing and finishing completed
- `/account-security` — frontend/src/pages/RecoveryEmailSettings.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=Security summary
- `/appearance` — frontend/src/pages/AppearanceSettings.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Enter a six-digit hex color
- `/contractors` — frontend/src/pages/Contractors.jsx: search=True; filters=True; pagination=True; tabs=False; dialogs/forms=Modal; named controls=Search company, owner, mobile, ID or service area
- `/painters` — frontend/src/pages/Painters.jsx: search=True; filters=True; pagination=True; tabs=False; dialogs/forms=Modal, Format; named controls=Search name, mobile, ID, skill or location
- `/customers` — frontend/src/pages/Customers.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=FormData, role="dialog"; named controls=Customers, Add from phone contacts, Bulk upload customers, Add customer, Customer connection status, Search customer ID, name, mobile, city or email, No customers found, Share activation link
- `/customers/:id` — frontend/src/pages/CustomerDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Form, role="dialog"; named controls=Properties, Quotations, Close follow-up form, What was discussed?
- `/customers/:id/quotations` — frontend/src/pages/CustomerQuotationHistory.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Format; named controls=Search quotation number, property or type
- `/invoices` — frontend/src/pages/Invoices.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Format, Dialog; named controls=Invoices, Invoice register, Search invoice, quotation, customer or property, No invoices match these filters, Transaction / cheque no., Delete payment, No payments recorded yet, Enter rate, Delete adjustment, Search type of service, Search or enter room, Search or enter service, Search or enter product type, Search or enter description, Search or enter brand, Enter HSN or SAC code, Sq ft, Job, Nos...
- `/tasks` — frontend/src/pages/Tasks.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=Overdue, Today, Upcoming, Search name, mobile or Customer ID, What needs to be discussed?
- `/messages` — frontend/src/pages/Chat.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=DialogOpen, DialogFirstSend, FormData, role="dialog"; named controls=Messages, Painter message summary, Message summary, No conversations yet, Return to conversations, Message safety information, Report conversation, No messages yet, Cancel editing, Save message, View shade, Reply to message, Forward message, Edit message, Delete message, Cancel reply, Choose message attachments, Attach PDF, photo, catalogue or contact file, Choose paint colour, Type a message, Send message, Close safety information, Close report, Describe the concern, Close contacts, Close forward, Search contacts, Tap to view shade, Photo viewer, Zoom out, Zoom in, Reset zoom, Change photo background, Close photo viewer, Change viewer background, Close shade viewer
- `/colors-shades` — frontend/src/pages/ColorsShades.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=role="dialog"; named controls=Drag to another slot, or tap then tap a destination, Choose paint colour, Close, Search colours or shade code, Close sharing, Search contacts
- `/service-requests` — frontend/src/pages/ServiceRequests.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=Service requests, Service request summary, Search customer, mobile or service, No service requests found, Close new service request, Close follow-up form
- `/support-tickets` — frontend/src/pages/SupportTickets.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, FormData, Modal, role="dialog"; named controls=Support requests, Support request summary, Your requests, Search your requests, Search ticket, customer, mobile or email, Raise support ticket, Private note for support staff, Write a reply..., Close dialog
- `/support-workspace` — frontend/src/pages/SupportWorkspace.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Search phone number, Bharath ID, email, name or document number, Search phone number, ID or email, Explain why this account action is necessary
- `/support-staff` — frontend/src/pages/SupportStaff.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=
- `/admin-integrations` — frontend/src/pages/AdminIntegrations.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Paste the key from Google Cloud
- `/measurement-access` — frontend/src/pages/MeasurementAccess.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Shared measurements, Measurement sharing summary, Share an Area Calculation, Search by mobile or contractor ID, No measured properties yet, Sharing history, No sharing requests yet, Search name, mobile, email, city or customer ID
- `/customer-quotations` — frontend/src/pages/CustomerQuotations.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=My quotations, Quotation summary, Find a quotation, Search quotation, contractor or property, Your quotations
- `/customer-quotations/:id` — frontend/src/pages/CustomerQuotation.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=DialogRef, Dialog, role="dialog", DialogValue; named controls=Work included, Price breakdown, Product details, Notes and terms, Your next step, Close change request, Example: Remove balcony painting, add kitchen ceiling, change bedroom product to Royale..., Close quotation item details, Added services, Removed services
- `/customer-invoices` — frontend/src/pages/CustomerInvoices.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Payments & invoices, Invoice and payment summary, Outstanding balance, Final invoices, No invoices available yet
- `/customer-properties` — frontend/src/pages/CustomerProperties.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=My properties, Property summary, Property access requests, Properties, No properties shared yet
- `/customer-properties/:id` — frontend/src/pages/CustomerPropertyDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Dialog, Modal, role="dialog"; named controls=Property project context, Available project modules, Measurements, Quotations, Schedule, Work progress, Invoices, Payments, Measurement overview, Saved measurements, No Area Calculations published yet, Room measurements, Close Area Calculation Details
- `/customer-properties/:id/access` — frontend/src/pages/PropertyAccess.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=DialogAction, Modal; named controls=People with access, Property access summary, Current contacts, Pending invitations
- `/work-schedules` — frontend/src/pages/WorkSchedules.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Modal; named controls=Project journey, No schedules match this view, Completed schedules, Date approval, Advance payment
- `/work-changes` — frontend/src/pages/WorkChanges.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Format, Form, Dialog; named controls=Work changes, Work change summary, Change requests, No work changes yet, What changed and why?, Bedroom, balcony, ceiling..., Work details
- `/work-reschedules` — frontend/src/pages/WorkReschedules.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=Reschedule work, Schedules needing review, Search quotation, customer, or property, No schedules need changes, Rain, material delay, customer request...
- `/completed-work` — frontend/src/pages/CompletedWork.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Completed projects, Completed project summary, Finished projects, Search project, contractor or property, No completed projects yet, Search quotation, customer, contractor or property
- `/leads` — frontend/src/pages/Leads.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=Leads, Create a new lead, Search customer, mobile, service, or quotation, Type customer name or mobile number, Interior painting, waterproofing...
- `/opportunities` — frontend/src/pages/Opportunities.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Sales Opportunities, Create a sales opportunity, Find opportunities, Search ID, client, mobile, property or service, Opportunity records, No opportunities found
- `/opportunities/new` — frontend/src/pages/NewOpportunity.jsx: search=True; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=Mobile number, name or email, e.g. 2BHK interior painting
- `/opportunities/:id` — frontend/src/pages/OpportunityDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=FormError; named controls=What happened?, Requirement, Internal notes
- `/site-visits` — frontend/src/pages/SiteVisits.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Modal, Form; named controls=
- `/painter-seeking` — frontend/src/pages/PainterSeeking.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Modal; named controls=Search work, skill or applicator, PIN code or area, Close applicator details, Where are you available for work?, Example: 560017
- `/painter-assignments` — frontend/src/pages/PainterAssignments.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/jobs` — frontend/src/pages/Jobs.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Modal; named controls=Job requirements, Search service, skill or job, City, area or PIN code, Close job details, Message applicator, Close post requirement form, Job site location
- `/job-activity` — frontend/src/pages/JobActivity.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Job Activity, Painter job activity summary, Activity records, Search work, person or location, No job activity found
- `/applicator-team` — frontend/src/pages/ApplicatorTeam.jsx: search=True; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=Leave blank to generate, HAL, Bengaluru, Interior, exterior, texture, enamel, polish...
- `/in-house-applicators` — frontend/src/pages/InHouseApplicators.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/in-house-applicators/new` — frontend/src/pages/InHouseEmployeeCreate.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=
- `/in-house-applicators/:id` — frontend/src/pages/InHouseEmployeeDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=0, Optional note, â‚¹ 0.00, Performance bonus
- `/in-house-earnings` — frontend/src/pages/InHouseEarnings.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Total this month, Attendance earning, Bonus, Payable days, Overtime
- `/work-reviews` — frontend/src/pages/WorkReviews.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Write your review (optional)
- `/billing` — frontend/src/pages/AdminBilling.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/packages` — frontend/src/pages/Billing.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=Edit, Delete, Unlimited
- `/revenue` — frontend/src/pages/AdminRevenue.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Search member, Bharath ID, package, receipt or reference
- `/customer-connections` — frontend/src/pages/AdminCustomerConnections.jsx: search=True; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Search Customer ID, Contractor ID or mobile, Customer connection, Close audit history
- `/contractor-revenue` — frontend/src/pages/ContractorRevenue.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Form; named controls=Revenue & receipts, Required except for cash, Optional payment note, Revenue summary, Reporting period, Search receipt, customer, project, quotation or invoice, Payment register, Payment register views, No payment receipts found, No final invoices found, No customer balances are due
- `/my-packages` — frontend/src/pages/ContractorPackages.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Modal; named controls=Download invoice or receipt, Submit payment details
- `/activity-log` — frontend/src/pages/ActivityLog.jsx: search=True; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Search user, activity or ID, From date, To date
- `/measurement-trial` — frontend/src/pages/MeasurementTrial.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Modal; named controls=Search room type, View, Delete row, Walls, Ceilings, Windows, doors and other items, Deductions and additions
- `/applicator-availability` — frontend/src/pages/ApplicatorAvailability.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=Form; named controls=Personal work, leave..., Go to today, Previous month, Next month
- `/applicator-bookings` — frontend/src/pages/ApplicatorBookings.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Name, mobile, Bharath ID, skill or location, Booking summary
- `/properties` — frontend/src/pages/Properties.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form; named controls=
- `/properties/:id` — frontend/src/pages/PropertyDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Dialog; named controls=Remove property from my board, Saved Area Calculations
- `/properties/:id/measurements` — frontend/src/pages/MeasurementCalculator.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Dialog, DialogShell; named controls=Save the first room to create the Area Calculation, Calculation view, Delete room, Measurements for all rooms and surfaces, Other surface type, Enter surface type, Search surface: Wall, Ceiling, Floor..., Show surface choices, Name, Surface name, 0.00, 1, Quantity, Example: Terrace, Reception, Search or enter a custom surface, Floor 1
- `/master-services` — frontend/src/pages/MasterServices.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, FormData, role="dialog"; named controls=Master Data, Master data sections, Area or neighbourhood, Karnataka, 560001, Cancel editing, Example: 28.00, Example: Stain resistance, smooth finish, 8-year warranty, Filter by service category, Close, For example, 15-18 days, Only an admin can change this
- `/contractor-network` — frontend/src/pages/ContractorNetwork.jsx: search=True; filters=True; pagination=False; tabs=True; dialogs/forms=Form, role="dialog"; named controls=Close connection window, Name, ID or full / partial phone number, Painting, waterproofing, plumbingâ€¦, Area, city or six-digit PIN code, Matching starting locations, We need a waterproofing partner for terrace work in Whitefield.
- `/subcontract-work-orders` — frontend/src/pages/SubcontractWorkOrders.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=
- `/subcontract-work-orders/:id` — frontend/src/pages/SubcontractWorkOrderDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=none detected; named controls=Work order not found, Agreed scope, Scopes shared for this work, Work submitted, History, Note (optional), Patch the seepage stain near the window.
- `/settings` — frontend/src/pages/Settings.jsx: search=True; filters=False; pagination=False; tabs=True; dialogs/forms=none detected; named controls=Your trade and personal details, Settings sections
- `/quotations` — frontend/src/pages/Quotations.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Format; named controls=Quotations, Quotation records, Search quotation, customer or address, Date, Quotation no., Customer name, Address, Status, Amount, No quotations found
- `/quotations/new` — frontend/src/pages/QuotationBuilder.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Format, Dialog, role="dialog"; named controls=Create quotation, Search name, mobile, email or city, Full house Area Calculation, Search service, Search room / area, Search brand, Discount and taxes, Name shown on quotation, Site inspector name, For example, 15-18 days, Quotation preview, Product details, Selected product details, Work duration, Payment terms, Terms and conditions, Work procedures and safety, Notes, Type or select product description, Edit quotation service and rate, Close editor, Select or type a service, Search calculated room, Enter room name, Select or type a brand (optional), Edit selected area field, Rate
- `/quotations/new-measured` — frontend/src/pages/QuotationBuilder.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Format, Dialog, role="dialog"; named controls=Create quotation, Search name, mobile, email or city, Full house Area Calculation, Search service, Search room / area, Search brand, Discount and taxes, Name shown on quotation, Site inspector name, For example, 15-18 days, Quotation preview, Product details, Selected product details, Work duration, Payment terms, Terms and conditions, Work procedures and safety, Notes, Type or select product description, Edit quotation service and rate, Close editor, Select or type a service, Search calculated room, Enter room name, Select or type a brand (optional), Edit selected area field, Rate
- `/quotations/:id` — frontend/src/pages/QuotationDetail.jsx: search=False; filters=True; pagination=False; tabs=False; dialogs/forms=Format, Dialog, role="dialog"; named controls=Enter HSN or SAC code, Quotation line details, Close details, Added services, Removed services
- `/quotations/new-manual` — frontend/src/pages/QuotationBuilder.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Format, Dialog, role="dialog"; named controls=Create quotation, Search name, mobile, email or city, Full house Area Calculation, Search service, Search room / area, Search brand, Discount and taxes, Name shown on quotation, Site inspector name, For example, 15-18 days, Quotation preview, Product details, Selected product details, Work duration, Payment terms, Terms and conditions, Work procedures and safety, Notes, Type or select product description, Edit quotation service and rate, Close editor, Select or type a service, Search calculated room, Enter room name, Select or type a brand (optional), Edit selected area field, Rate
- `/quotations/:id/edit` — frontend/src/pages/QuotationEdit.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, Dialog, Format, role="dialog"; named controls=Edit quotation, Property rooms, Search service, Search brand, Delete line item, For example, 15-18 days, Add any general product notes here, Services and rates, Close editor, Search type of service, Search room / area, Search brand (optional), Delete line, Type or select product description
- `/work-photos` — frontend/src/pages/WorkPhotos.jsx: search=True; filters=True; pagination=False; tabs=False; dialogs/forms=Form, FormData; named controls=Project photos, Painter photo summary, Photo progress summary, Delete photo, Living room, exterior wall..., Optional note
- `/reports` — frontend/src/pages/Reports.jsx: search=False; filters=False; pagination=False; tabs=False; dialogs/forms=none detected; named controls=

## Desktop/mobile section comparison signals

All baseline role/route cases were rendered at 1440,360,390,430. This table compares final available heading inventories after retries; differences are review signals, not verified data-loss claims. Mobile drawers, condensed headings, permission/error states and asynchronous API responses can legitimately differ. Full content/action parity beyond the recorded checks remains PARTIAL.

| Role | Exact route | Desktop headings | Mobile heading differences | Status |
|---|---|---|---|---|
| ADMIN | `/account-security` | Account Security, Change password, Email verification needed, Add recovery email | No heading loss detected | PARTIAL |
| ADMIN | `/activity-log` | Activity Log | No heading loss detected | PARTIAL |
| ADMIN | `/admin-integrations` | API Settings, Google Maps address lookup | No heading loss detected | PARTIAL |
| ADMIN | `/appearance` | Operations dashboard, Recent support conversations | No heading loss detected | PARTIAL |
| ADMIN | `/applicator` | Operations dashboard, Recent support conversations | No heading loss detected | PARTIAL |
| ADMIN | `/billing` | Billing, Select a user to assign a package, Package requests | No heading loss detected | PARTIAL |
| ADMIN | `/contractors` | Contractors | No heading loss detected | PARTIAL |
| ADMIN | `/customer-connections` | Customer connection management | No heading loss detected | PARTIAL |
| ADMIN | `/dashboard` | Operations dashboard, Recent support conversations | No heading loss detected | PARTIAL |
| ADMIN | `/master-services` | Master Data, Rooms / Areas | No heading loss detected | PARTIAL |
| ADMIN | `/packages` | Packages | No heading loss detected | PARTIAL |
| ADMIN | `/painters` | Employees | No heading loss detected | PARTIAL |
| ADMIN | `/profile` | Operations dashboard, Recent support conversations | No heading loss detected | PARTIAL |
| ADMIN | `/reports` | Reports, Monthly invoice performance, Quotation pipeline, Upcoming and active projects | No heading loss detected | PARTIAL |
| ADMIN | `/revenue` | Subscription revenue, Month-wise subscription revenue · 2026, Package payments by mode, Package payment details | No heading loss detected | PARTIAL |
| ADMIN | `/support-staff` | Support staff, Add support staff, Staff access, Recent support actions | No heading loss detected | PARTIAL |
| ADMIN | `/support-tickets` | Support Desk | No heading loss detected | PARTIAL |
| ADMIN | `/work-photos` | Work photos | No heading loss detected | PARTIAL |
| CONTRACTOR | `/account-security` | Account Security, Change password, Email verification needed, Add recovery email, Account status | No heading loss detected | PARTIAL |
| CONTRACTOR | `/activity-log` | Activity Log | No heading loss detected | PARTIAL |
| CONTRACTOR | `/appearance` | Namaste, QA Painting Services, 38% complete, Quick actions, Recent quotations, Recent customers, Communication & requests, Latest new requests, Upcoming follow-ups, Site visits, Lead pipeline, No active package | No heading loss detected | PARTIAL |
| CONTRACTOR | `/applicator` | Namaste, QA Painting Services, 38% complete, Quick actions, Recent quotations, Recent customers, Communication & requests, Latest new requests, Upcoming follow-ups, Site visits, Lead pipeline, No active package | No heading loss detected | PARTIAL |
| CONTRACTOR | `/applicator-bookings` | Book Applicator, Find and book an applicator, Booking history,  | No heading loss detected | PARTIAL |
| CONTRACTOR | `/applicator-profile` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/applicator-team` | Refer Painter, Referred Painters, QA In-house Painter | No heading loss detected | PARTIAL |
| CONTRACTOR | `/colors-shades` | Colors & Shades, Your comparison, Comparison 1, Comparison 2, Comparison 3, Comparison 4 | No heading loss detected | PARTIAL |
| CONTRACTOR | `/completed-projects` | Completed projects, Your projects, Add completed project | No heading loss detected | PARTIAL |
| CONTRACTOR | `/completed-work` | Completed work | No heading loss detected | PARTIAL |
| CONTRACTOR | `/contractor-network` | Contractor Network | No heading loss detected | PARTIAL |
| CONTRACTOR | `/contractor-revenue` | Revenue & receipts, Reporting period, Payment register | No heading loss detected | PARTIAL |
| CONTRACTOR | `/contractor-theme` | Settings, App theme | No heading loss detected | PARTIAL |
| CONTRACTOR | `/customers` | Customers | No heading loss detected | PARTIAL |
| CONTRACTOR | `/customers/46` | QA Customer, Properties, Quotations, Follow-up timeline | No heading loss detected | PARTIAL |
| CONTRACTOR | `/customers/46/quotations` | QA Customer | No heading loss detected | PARTIAL |
| CONTRACTOR | `/customers?action=add` | Customers, Add customer | No heading loss detected | PARTIAL |
| CONTRACTOR | `/dashboard` | Namaste, QA Painting Services, 38% complete, Quick actions, Recent quotations, Recent customers, Communication & requests, Latest new requests, Upcoming follow-ups, Site visits, Lead pipeline, No active package | No heading loss detected | PARTIAL |
| CONTRACTOR | `/find-painter` | Book Applicator, Find and book an applicator, Booking history,  | 360:  | PARTIAL |
| CONTRACTOR | `/in-house-applicators` | Employees | No heading loss detected | PARTIAL |
| CONTRACTOR | `/in-house-applicators/8` | QA In-house Painter, , , Bonus, Attendance calendar | No heading loss detected | PARTIAL |
| CONTRACTOR | `/in-house-applicators/89` |  | No heading loss detected | PARTIAL |
| CONTRACTOR | `/in-house-applicators/new` | Create in-house employee | No heading loss detected | PARTIAL |
| CONTRACTOR | `/invoices` | Invoices, Invoice register | No heading loss detected | PARTIAL |
| CONTRACTOR | `/job-activity` | Job Activity, Activity records | No heading loss detected | PARTIAL |
| CONTRACTOR | `/jobs` | Job requirements, Job requirements, QA Available Painting Job | No heading loss detected | PARTIAL |
| CONTRACTOR | `/leads` | Leads | No heading loss detected | PARTIAL |
| CONTRACTOR | `/master-services` | Master Data, Rooms / Areas | No heading loss detected | PARTIAL |
| CONTRACTOR | `/measurement-trial` | Painting Area Calculator, Select room and unit, 1. Wall dimensions, 2. Ceiling dimensions, 3. Add deductions and other additions, All room totals | No heading loss detected | PARTIAL |
| CONTRACTOR | `/messages` | Messages, RECENT CONVERSATIONS | No heading loss detected | PARTIAL |
| CONTRACTOR | `/my-packages` | Subscription, No active plan, Premium Plan, Basic Package, Contractor Basic package, Billing history | No heading loss detected | PARTIAL |
| CONTRACTOR | `/opportunities` | Sales Opportunities, Find opportunities, Opportunity records | No heading loss detected | PARTIAL |
| CONTRACTOR | `/opportunities/7` | QA Interior repaint opportunity, Opportunity stage, Requirement details, Linked records, Site visits, Stage history | No heading loss detected | PARTIAL |
| CONTRACTOR | `/opportunities/new` | New Opportunity, 1. Client (search by mobile number) | No heading loss detected | PARTIAL |
| CONTRACTOR | `/painter-seeking` | Paint Applicators seeking work | No heading loss detected | PARTIAL |
| CONTRACTOR | `/profile` |  | No heading loss detected | PARTIAL |
| CONTRACTOR | `/properties` | Properties | No heading loss detected | PARTIAL |
| CONTRACTOR | `/properties/46` | QA Test Home, Project overview, Saved Area Calculations | 390: QA Test Home, Project overview, Saved Area Calculations | PARTIAL |
| CONTRACTOR | `/properties/46/measurements` | Measurements, All room measurements, Areas | 360: Measurements, All room measurements, Areas; 390: Measurements, All room measurements, Areas; 430: Measurements, All room measurements, Areas | PARTIAL |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | Measurements, All room measurements, Areas | 360: Measurements, All room measurements, Areas; 390: Measurements, All room measurements, Areas; 430: Measurements, All room measurements, Areas | PARTIAL |
| CONTRACTOR | `/properties?action=add` | Properties, Add property | No heading loss detected | PARTIAL |
| CONTRACTOR | `/properties?calculator=1` |  | No heading loss detected | PARTIAL |
| CONTRACTOR | `/provider-profile` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations` | Quotations, Quotation records | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/101` | QA Painting Services, QA-QTN-SENT, QUOTATION ITEMS, Project scopes, Include in downloaded PDF, CONTRACTOR, PARTIES, ESTIMATE, SUPPORTING DETAILS, SIGNATURES, Notes, Terms and conditions | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/101/edit` | Edit quotation, Property rooms, Final full-house quotation lines, QA Living Room | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/102` | QA Painting Services, QA-QTN-ACCEPTED, QUOTATION ITEMS, Project scopes, Include in downloaded PDF, CONTRACTOR, PARTIES, ESTIMATE, SUPPORTING DETAILS, SIGNATURES, Notes, Terms and conditions | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/102/edit` | Edit quotation, Property rooms, Final full-house quotation lines | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/103` | QA Painting Services, QA-QTN-ACTIVE, QUOTATION ITEMS, Project scopes, Include in downloaded PDF, CONTRACTOR, PARTIES, ESTIMATE, SUPPORTING DETAILS, SIGNATURES, Notes, Terms and conditions | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/103/edit` | Edit quotation, Property rooms, Final full-house quotation lines, QA Living Room | 430: QA Living Room | PARTIAL |
| CONTRACTOR | `/quotations/104` | QA Painting Services, QA-QTN-COMPLETED, QUOTATION ITEMS, Project scopes, Include in downloaded PDF, CONTRACTOR, PARTIES, ESTIMATE, SUPPORTING DETAILS, SIGNATURES, Notes, Terms and conditions | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/104/edit` | Edit quotation, Property rooms, Final full-house quotation lines, QA Living Room | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/new` | Create quotation, Customer and property, Quotation type | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/new-manual` | Create quotation, Customer and property, Quotation type | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/new-measured` | Create quotation, Customer and property, Quotation type | No heading loss detected | PARTIAL |
| CONTRACTOR | `/quotations/new?customer=46&property=46&measurement=67` | Create quotation, Customer and property, Quotation type | No heading loss detected | PARTIAL |
| CONTRACTOR | `/reports` | Reports, Monthly invoice performance, Quotation pipeline, Upcoming and active projects | No heading loss detected | PARTIAL |
| CONTRACTOR | `/service-requests` | Service requests, Service requests, QA service request | No heading loss detected | PARTIAL |
| CONTRACTOR | `/settings` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/settings?tab=appearance` | Settings, App theme | No heading loss detected | PARTIAL |
| CONTRACTOR | `/settings?tab=company` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/settings?tab=personal` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/settings?tab=trade` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| CONTRACTOR | `/site-visits` | Site Visits | No heading loss detected | PARTIAL |
| CONTRACTOR | `/subcontract-work-orders` | Subcontract Work Orders | No heading loss detected | PARTIAL |
| CONTRACTOR | `/support-tickets` | Support requests | No heading loss detected | PARTIAL |
| CONTRACTOR | `/tasks` | Tasks | No heading loss detected | PARTIAL |
| CONTRACTOR | `/work-changes` | Work Changes | No heading loss detected | PARTIAL |
| CONTRACTOR | `/work-photos` | Work photos | No heading loss detected | PARTIAL |
| CONTRACTOR | `/work-reschedules` | Reschedule work, Schedules needing review | No heading loss detected | PARTIAL |
| CONTRACTOR | `/work-reviews` | Ratings & Reviews, QA Freelance Painter | No heading loss detected | PARTIAL |
| CONTRACTOR | `/work-schedules` | Work schedules, Upcoming work, QA-QTN-ACCEPTED, Completed schedules | 360: QA-QTN-ACCEPTED, Completed schedules | PARTIAL |
| CUSTOMER | `/account-security` | Account Security, Change password, Account status | No heading loss detected | PARTIAL |
| CUSTOMER | `/activity-log` | Activity Log | No heading loss detected | PARTIAL |
| CUSTOMER | `/appearance` | Appearance, Choose a color theme | No heading loss detected | PARTIAL |
| CUSTOMER | `/colors-shades` | Colors & Shades, Your comparison, Comparison 1, Comparison 2, Comparison 3, Comparison 4 | No heading loss detected | PARTIAL |
| CUSTOMER | `/completed-work` | Completed projects, Finished projects, QA Test Home | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-dashboard` | Welcome back, QA Customer, Needs your attention, Quick actions, Your work, QA Test Home, QA Test Home, Quotations, QA Painting Services, QA Painting Services, QA Painting Services, QA Painting Services, Payments, Service requests, Your contractors, My properties, Support requests | 360: Quick actions; 390: Quick actions; 430: Quick actions | PARTIAL |
| CUSTOMER | `/customer-invoices` | Payments & invoices, There is a balance waiting for payment, Final invoices | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-properties` | My properties, Properties, QA Test Home | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-properties/46` | QA Test Home, Saved measurements, Room measurements | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-properties/46/access` | People with access, Current contacts, Pending invitations | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-quotations` | My quotations, Find a quotation, Your quotations | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-quotations/101` | QA-QTN-SENT, Work included, Price breakdown, Notes and terms, Your next step | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-quotations/102` | QA-QTN-ACCEPTED, Work included, Price breakdown, Notes and terms, Your next step | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-quotations/103` | QA-QTN-ACTIVE, Work included, Price breakdown, Notes and terms, Your next step | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-quotations/104` | QA-QTN-COMPLETED, Work included, Price breakdown, Notes and terms, Your next step | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer-reviews` | Review your contractors, QA Painting Services | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer/connection-requests` | Your contractors, Find your contractor, Connected, QA Painting Services | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer/connections` | Your contractors, Find your contractor, Connected, QA Painting Services | No heading loss detected | PARTIAL |
| CUSTOMER | `/customer/profile` | My profile, Email address | No heading loss detected | PARTIAL |
| CUSTOMER | `/measurement-access` | Shared measurements, Share an Area Calculation, Sharing history | No heading loss detected | PARTIAL |
| CUSTOMER | `/messages` | Messages, RECENT CONVERSATIONS | No heading loss detected | PARTIAL |
| CUSTOMER | `/service-requests` | Service requests, Service requests, QA service request | No heading loss detected | PARTIAL |
| CUSTOMER | `/support-tickets` | Support requests, Your requests | No heading loss detected | PARTIAL |
| CUSTOMER | `/work-changes` | Work changes, Change requests | No heading loss detected | PARTIAL |
| CUSTOMER | `/work-photos` | Project photos, Project photos | No heading loss detected | PARTIAL |
| CUSTOMER | `/work-reschedules` |  | No heading loss detected | PARTIAL |
| CUSTOMER | `/work-schedules` | Work dates & progress, From accepted quotation to finished work, Upcoming work, QA-QTN-ACCEPTED | 360: QA-QTN-ACCEPTED | PARTIAL |
| PAINTER_FREELANCE | `/account-security` | Account Security, Change password, Email verification needed, Add recovery email, Account status | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/activity-log` | Activity Log | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/appearance` | Appearance, Choose a color theme | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/applicator` | Welcome, QA Freelance Painter, Recent completed projects, Current work, QA Painter Plan | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/applicator-availability` | My Availability, Block unavailable dates, October 2026, Thursday, 8 October 2026 | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/applicator-bookings` | Booking Requests, New requests, QA Interior Painting, Booking history | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/applicator-profile` | Your trade and personal details, Personal details, QA Freelance Painter | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/colors-shades` | Colors & Shades, Your comparison, Comparison 1, Comparison 2, Comparison 3, Comparison 4 | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/dashboard` | Welcome, QA Freelance Painter, Recent completed projects, Current work, QA Painter Plan | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/find-painter` | Booking Requests, New requests, QA Interior Painting, Booking history | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/in-house-applicators` | Employees | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/in-house-applicators/new` | Create in-house employee | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/in-house-earnings` | My Earnings, Weekly earning breakdown | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/job-activity` | Job Activity, Activity records | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/jobs` | Available Jobs, Job requirements, QA Available Painting Job, Exterior painting | 390: QA Available Painting Job, Exterior painting | PARTIAL |
| PAINTER_FREELANCE | `/messages` | Messages, RECENT CONVERSATIONS | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/my-packages` | Subscription, QA Painter Plan, Applicator Free, Applicator Monthly, Applicator Selected Dates, QA Painter Plan, Billing history | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/painter-assignments` | My assignments | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/painter-seeking` | My job-seeking posts, QA Freelance Painter | 430: QA Freelance Painter | PARTIAL |
| PAINTER_FREELANCE | `/profile` | My professional profile, QA Freelance Painter, Professional profile, Skills, Current location, Preferred locations | 360: My professional profile, QA Freelance Painter, Professional profile, Skills, Current location, Preferred locations | PARTIAL |
| PAINTER_FREELANCE | `/provider-profile` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/settings` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/settings?tab=appearance` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/settings?tab=company` | Your trade and personal details | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/settings?tab=personal` | Your trade and personal details, Personal details, QA Freelance Painter | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/settings?tab=trade` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/support-tickets` | Support requests | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/work-photos` | Work photos | No heading loss detected | PARTIAL |
| PAINTER_FREELANCE | `/work-reviews` | Ratings & Reviews, QA Contractor | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/account-security` | Account Security, Change password, Email verification needed, Add recovery email, Account status | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/activity-log` | Activity Log | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/appearance` | Appearance, Choose a color theme | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/applicator` | Welcome, QA In-house Painter, Recent completed projects, Current work, No active package | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/applicator-availability` |  | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/applicator-bookings` | Booking Requests, New requests, Booking history | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/applicator-profile` | Your trade and personal details, Personal details, QA In-house Painter | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/colors-shades` | Colors & Shades, Your comparison, Comparison 1, Comparison 2, Comparison 3, Comparison 4 | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/dashboard` | Welcome, QA In-house Painter, Recent completed projects, Current work, No active package | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/find-painter` | Booking Requests, New requests, Booking history | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/in-house-applicators` | Employees, QA In-house Painter, Today’s site check-in, Attendance calendar | 360: QA In-house Painter, Today’s site check-in, Attendance calendar | PARTIAL |
| PAINTER_INHOUSE | `/in-house-applicators/new` | Create in-house employee | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/in-house-earnings` | My Earnings, Weekly earning breakdown | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/job-activity` | Job Activity, Activity records | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/jobs` | Available Jobs, Job requirements | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/messages` | Messages, RECENT CONVERSATIONS | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/my-packages` | Subscription, No active plan, Applicator Free, Applicator Monthly, Applicator Selected Dates, QA Painter Plan, Billing history | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/painter-assignments` | My assignments, QA-QTN-ACTIVE / QA Test Home | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/painter-seeking` | My job-seeking posts | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/profile` | My professional profile, QA In-house Painter, Professional profile, Skills, Current location, Preferred locations | 430: My professional profile, QA In-house Painter, Professional profile, Skills, Current location, Preferred locations | PARTIAL |
| PAINTER_INHOUSE | `/provider-profile` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/settings` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | 430: Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | PARTIAL |
| PAINTER_INHOUSE | `/settings?tab=appearance` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/settings?tab=company` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/settings?tab=personal` | Your trade and personal details, Personal details, QA In-house Painter | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/settings?tab=trade` | Your trade and personal details, Professional introduction, Primary trade — exactly one, Additional trades & skills, Sub-services you actually offer, Preview, Publish readiness | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/support-tickets` | Support requests | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/work-photos` | Work photos | No heading loss detected | PARTIAL |
| PAINTER_INHOUSE | `/work-reviews` | Ratings & Reviews | No heading loss detected | PARTIAL |
| PUBLIC | `/customer-register` | Customer account | No heading loss detected | PARTIAL |
| PUBLIC | `/forgot-password` | Forgot password | No heading loss detected | PARTIAL |
| PUBLIC | `/login` | Manage every service project from lead to finish., Welcome back | 360: Manage every service project from lead to finish.; 390: Manage every service project from lead to finish.; 430: Manage every service project from lead to finish. | PARTIAL |
| PUBLIC | `/preview/bharath-apps` | Personalised workspace heading and labels, Your live workspace heading, Try each core service, Generic modules keep generic names, Additional services must not change the core identity, Historical records are never relabelled, A new admin-created category becomes selectable immediately, Contractor Network is available to every contractor, Demo scenario, Live preview checks, Activity log | No heading loss detected | PARTIAL |
| PUBLIC | `/preview/settings` | Settings, Company & contact, Services & experience, Professional introduction & branding, Payment & tax details, Documents & social links, Business preferences | No heading loss detected | PARTIAL |
| PUBLIC | `/preview/sidebar` | Dashboard, Dashboard, Try route-aware highlighting, Mapped, not invented, contractor destination inventory | No heading loss detected | PARTIAL |
| PUBLIC | `/preview/subcontract-work-orders` | Find the right contractor for your next project., Find your project partner, Greenline Contractors, CityCoat Painters, Everest Paint & Care, Northstar Finishes | No heading loss detected | PARTIAL |
| PUBLIC | `/register` | Create your account | No heading loss detected | PARTIAL |

## Evidence exclusions and remaining checks

- Integration screenshots withheld because saved-key metadata must not enter audit evidence.
- Source menu definitions can include hidden/merged/conditional items; actual click table records what each session displayed.
- Bottom navigation and dashboard shortcuts were additionally clicked at390 where visible. Notification/Scan QR hardware/share-sheet delivery remains NOT TESTED unless explicitly recorded.
- Search/filter/tab control activation is distinct from validating every combination against seeded results. Pagination with only one page cannot prove multiple-page behavior.
- Every visible destructive or state-changing action is NOT TESTED beyond its recorded entry dialog, except the temporary property/measurement workflow.
- Reduced motion, screen-reader announcements, 400% zoom, exhaustive contrast measurement and physical-device keyboard/safe-area behavior remain NOT TESTED.
