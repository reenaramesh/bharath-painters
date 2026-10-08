# Route coverage — full application audit

Audit date: 8 October 2026 (Asia/Calcutta). Target: local frontend `http://localhost:5173`, with its existing local Django backend.

Source inventory: **92 route patterns**, **63 menu definitions**. These counts are distinct from role/route cases and viewport renders.

Native Chrome/Playwright checks use existing repository QA accounts. Secrets remain in browser/process memory; no authentication state, HAR, cookies or tokens are exported.

Scope labels: **VERIFIED** = rendered/interacted with in a real browser; **SOURCE-INSPECTED ONLY** = inventory, not runtime proof; **BLOCKED** = missing access/data/environment; **NOT TESTED** = outstanding coverage.

Workflow limits: saves, sends, accepts/rejects, payments, deletions, verification changes and other state-changing requests are intercepted. A 409 response with `harnessBlocked: true` is audit prevention, not an application defect. The audit does not prove persistence or irreversible workflows.

## Every role menu item

| Role | Route / menu | Desktop 1440 | Mobile 360 / 390 / 430 | Actions | Console | Status |
|---|---|---|---|---|---|---|
| CONTRACTOR | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/customers?action=add` — Add Customer | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties?action=add` — Add Property | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/quotations/new` — New Quotation | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties?calculator=1` — Area Calculator | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/customers` — Customers | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/properties` — Properties & Measurements | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CONTRACTOR | `/leads` — Leads | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
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
| CONTRACTOR | `/service-requests` — Service Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
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
| CUSTOMER | `/customer-dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-properties` — My Properties | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-quotations` — My Quotations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/measurement-access` — Shared Measurements | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-schedules` — Work Schedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-changes` — Work Changes | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-reschedules` — Work Reschedules | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/completed-work` — Completed Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer/connections` — My Contractors | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-reviews` — Review Contractors | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer-invoices` — Payments & Invoices | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/messages` — Messages | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/service-requests` — Service Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/support-tickets` — Support Tickets | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/colors-shades` — Colors & Shades | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/activity-log` — Activity Log | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/appearance` — Appearance | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/customer/profile` — My Profile | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| CUSTOMER | `/account-security` — Account Security | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/painter-assignments` — My Assignments | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/applicator-availability` — Availability & Calendar | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/work-photos` — Work Photos | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/work-reviews` — Ratings & Reviews | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/jobs` — Available Work | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/job-activity` — Applications & Invitations | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
| PAINTER_FREELANCE | `/applicator-bookings` — Bookings & Requests | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
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
| PAINTER_INHOUSE | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
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
| ADMIN | `/dashboard` — Dashboard | Yes | Yes / Yes / Yes | Rendered; safe controls only | See logs; not blanket clean | PARTIAL |
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
| `/support-workspace` | SupportWorkspace; authenticated;  | SUPPORT | None | SOURCE-INSPECTED ONLY / NOT TESTED |
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
| `*` | Navigate; public;  | Public | ADMIN, CONTRACTOR, CUSTOMER, PAINTER_FREELANCE, PAINTER_INHOUSE, PUBLIC | PARTIAL — VERIFIED renders |

## Rendered role/route cases

| Role | Exact route | Viewports | Actions exercised | Runtime/layout signals requiring review | Evidence |
|---|---|---|---|---|
| ADMIN | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-account-security-1440-page.png) |
| ADMIN | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/admin-activity-log-1440-page.png) |
| ADMIN | `/admin-integrations` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-admin-integrations-1440-page.png) |
| ADMIN | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading, unnamed | [screenshot](screenshots/admin-appearance-1440-page.png) |
| ADMIN | `/applicator` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading, unnamed | [screenshot](screenshots/admin-applicator-1440-page.png) |
| ADMIN | `/billing` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/admin-billing-1440-page.png) |
| ADMIN | `/contractors` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/admin-contractors-1440-page.png) |
| ADMIN | `/customer-connections` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/admin-customer-connections-1440-page.png) |
| ADMIN | `/dashboard` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/admin-dashboard-1440-page.png) |
| ADMIN | `/master-services` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-master-services-1440-page.png) |
| ADMIN | `/packages` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-packages-1440-page.png) |
| ADMIN | `/painters` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/admin-painters-1440-page.png) |
| ADMIN | `/profile` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/admin-profile-1440-page.png) |
| ADMIN | `/reports` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-reports-1440-page.png) |
| ADMIN | `/revenue` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-revenue-1440-page.png) |
| ADMIN | `/support-staff` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-support-staff-1440-page.png) |
| ADMIN | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-support-tickets-1440-page.png) |
| ADMIN | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/admin-work-photos-1440-page.png) |
| CONTRACTOR | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-account-security-1440-page.png) |
| CONTRACTOR | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-activity-log-1440-page.png) |
| CONTRACTOR | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-appearance-1440-page.png) |
| CONTRACTOR | `/applicator` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/contractor-applicator-1440-page.png) |
| CONTRACTOR | `/applicator-bookings` | 1440, 360, 390, 430 | Keyboard Tab | unnamed | [screenshot](screenshots/contractor-applicator-bookings-1440-page.png) |
| CONTRACTOR | `/applicator-profile` | 1440, 360, 390, 430 | Business details, Keyboard Tab | loading | [screenshot](screenshots/contractor-applicator-profile-1440-page.png) |
| CONTRACTOR | `/applicator-team` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-applicator-team-1440-page.png) |
| CONTRACTOR | `/colors-shades` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-colors-shades-1440-page.png) |
| CONTRACTOR | `/completed-projects` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/contractor-completed-projects-1440-page.png) |
| CONTRACTOR | `/completed-work` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-completed-work-1440-page.png) |
| CONTRACTOR | `/contractor-network` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-contractor-network-1440-page.png) |
| CONTRACTOR | `/contractor-revenue` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-contractor-revenue-1440-page.png) |
| CONTRACTOR | `/contractor-theme` | 1440, 360, 390, 430 | Business details, Keyboard Tab | error, loading | [screenshot](screenshots/contractor-contractor-theme-1440-page.png) |
| CONTRACTOR | `/customers` | 1440, 360, 390, 430 | Add customer, Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-customers-1440-page.png) |
| CONTRACTOR | `/customers/46` | 1440, 360, 390, 430 | Keyboard Tab | loading, unnamed | [screenshot](screenshots/contractor-customers-46-1440-page.png) |
| CONTRACTOR | `/customers/46/quotations` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-customers-46-quotations-1440-page.png) |
| CONTRACTOR | `/customers?action=add` | 1440, 360, 390, 430 | Add customer, Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-customers-action-add-1440-page.png) |
| CONTRACTOR | `/dashboard` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-dashboard-1440-page.png) |
| CONTRACTOR | `/find-painter` | 1440, 360, 390, 430 | Keyboard Tab | loading, unnamed | [screenshot](screenshots/contractor-find-painter-1440-page.png) |
| CONTRACTOR | `/in-house-applicators` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-in-house-applicators-1440-page.png) |
| CONTRACTOR | `/in-house-applicators/8` | 1440, 360, 390, 430 | Keyboard Tab | loading, unnamed | [screenshot](screenshots/contractor-in-house-applicators-8-1440-page.png) |
| CONTRACTOR | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-in-house-applicators-new-1440-page.png) |
| CONTRACTOR | `/invoices` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/contractor-invoices-1440-page.png) |
| CONTRACTOR | `/job-activity` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-job-activity-1440-page.png) |
| CONTRACTOR | `/jobs` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-jobs-1440-page.png) |
| CONTRACTOR | `/leads` | 1440, 360, 390, 430 | Keyboard Tab, Search | unnamed | [screenshot](screenshots/contractor-leads-1440-page.png) |
| CONTRACTOR | `/master-services` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/contractor-master-services-1440-page.png) |
| CONTRACTOR | `/measurement-trial` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-measurement-trial-1440-page.png) |
| CONTRACTOR | `/messages` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/contractor-messages-1440-page.png) |
| CONTRACTOR | `/my-packages` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-my-packages-1440-page.png) |
| CONTRACTOR | `/opportunities` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/contractor-opportunities-1440-page.png) |
| CONTRACTOR | `/opportunities/7` | 1440, 360, 390, 430 | Completed, Edit, Keyboard Tab | error | [screenshot](screenshots/contractor-opportunities-7-1440-page.png) |
| CONTRACTOR | `/opportunities/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-opportunities-new-1440-page.png) |
| CONTRACTOR | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-painter-seeking-1440-page.png) |
| CONTRACTOR | `/profile` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-profile-1440-page.png) |
| CONTRACTOR | `/properties` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-properties-1440-page.png) |
| CONTRACTOR | `/properties/46` | 1440, 360, 390, 430 | Edit, Keyboard Tab | error | [screenshot](screenshots/contractor-properties-46-1440-page.png) |
| CONTRACTOR | `/properties/46/measurements` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-properties-46-measurements-1440-page.png) |
| CONTRACTOR | `/properties/46/measurements?measurement=67` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-properties-46-measurements-measurement-67-1440-page.png) |
| CONTRACTOR | `/properties?action=add` | 1440, 360, 390, 430 | Keyboard Tab, Search | unnamed | [screenshot](screenshots/contractor-properties-action-add-1440-page.png) |
| CONTRACTOR | `/properties?calculator=1` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-properties-calculator-1-1440-page.png) |
| CONTRACTOR | `/provider-profile` | 1440, 360, 390, 430 | Business details, Keyboard Tab | loading | [screenshot](screenshots/contractor-provider-profile-1440-page.png) |
| CONTRACTOR | `/quotations` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/contractor-quotations-1440-page.png) |
| CONTRACTOR | `/quotations/101` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-quotations-101-1440-page.png) |
| CONTRACTOR | `/quotations/101/edit` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-quotations-101-edit-1440-page.png) |
| CONTRACTOR | `/quotations/102` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-quotations-102-1440-page.png) |
| CONTRACTOR | `/quotations/102/edit` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-quotations-102-edit-1440-page.png) |
| CONTRACTOR | `/quotations/103` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/contractor-quotations-103-1440-page.png) |
| CONTRACTOR | `/quotations/103/edit` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-quotations-103-edit-1440-page.png) |
| CONTRACTOR | `/quotations/104` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-quotations-104-1440-page.png) |
| CONTRACTOR | `/quotations/104/edit` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/contractor-quotations-104-edit-1440-page.png) |
| CONTRACTOR | `/quotations/new` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-quotations-new-1440-page.png) |
| CONTRACTOR | `/quotations/new-manual` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/contractor-quotations-new-manual-1440-page.png) |
| CONTRACTOR | `/quotations/new-measured` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/contractor-quotations-new-measured-1440-page.png) |
| CONTRACTOR | `/reports` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/contractor-reports-1440-page.png) |
| CONTRACTOR | `/service-requests` | 1440, 360, 390, 430 | Keyboard Tab, Search | bodyOverflow, loading | [screenshot](screenshots/contractor-service-requests-1440-page.png) |
| CONTRACTOR | `/settings` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/contractor-settings-1440-page.png) |
| CONTRACTOR | `/settings?tab=appearance` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-appearance-1440-page.png) |
| CONTRACTOR | `/settings?tab=company` | 1440, 360, 390, 430 | Business details, Keyboard Tab | loading | [screenshot](screenshots/contractor-settings-tab-company-1440-page.png) |
| CONTRACTOR | `/settings?tab=personal` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-personal-1440-page.png) |
| CONTRACTOR | `/settings?tab=trade` | 1440, 360, 390, 430 | Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-settings-tab-trade-1440-page.png) |
| CONTRACTOR | `/site-visits` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-site-visits-1440-page.png) |
| CONTRACTOR | `/subcontract-work-orders` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-subcontract-work-orders-1440-page.png) |
| CONTRACTOR | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/contractor-support-tickets-1440-page.png) |
| CONTRACTOR | `/tasks` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-tasks-1440-page.png) |
| CONTRACTOR | `/work-changes` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-changes-1440-page.png) |
| CONTRACTOR | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/contractor-work-photos-1440-page.png) |
| CONTRACTOR | `/work-reschedules` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-reschedules-1440-page.png) |
| CONTRACTOR | `/work-reviews` | 1440, 360, 390, 430 | Keyboard Tab | unnamed | [screenshot](screenshots/contractor-work-reviews-1440-page.png) |
| CONTRACTOR | `/work-schedules` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/contractor-work-schedules-1440-page.png) |
| CUSTOMER | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-account-security-1440-page.png) |
| CUSTOMER | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/customer-activity-log-1440-page.png) |
| CUSTOMER | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-appearance-1440-page.png) |
| CUSTOMER | `/colors-shades` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-colors-shades-1440-page.png) |
| CUSTOMER | `/completed-work` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/customer-completed-work-1440-page.png) |
| CUSTOMER | `/customer-dashboard` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-dashboard-1440-page.png) |
| CUSTOMER | `/customer-invoices` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-invoices-1440-page.png) |
| CUSTOMER | `/customer-properties` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-properties-1440-page.png) |
| CUSTOMER | `/customer-properties/46` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/customer-customer-properties-46-1440-page.png) |
| CUSTOMER | `/customer-properties/46/access` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/customer-customer-properties-46-access-1440-page.png) |
| CUSTOMER | `/customer-quotations` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-quotations-1440-page.png) |
| CUSTOMER | `/customer-quotations/101` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/customer-customer-quotations-101-1440-page.png) |
| CUSTOMER | `/customer-quotations/102` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/customer-customer-quotations-102-1440-page.png) |
| CUSTOMER | `/customer-quotations/103` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-quotations-103-1440-page.png) |
| CUSTOMER | `/customer-quotations/104` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-quotations-104-1440-page.png) |
| CUSTOMER | `/customer-reviews` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-reviews-1440-page.png) |
| CUSTOMER | `/customer/connection-requests` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-connection-requests-1440-page.png) |
| CUSTOMER | `/customer/connections` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-customer-connections-1440-page.png) |
| CUSTOMER | `/customer/profile` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-customer-profile-1440-page.png) |
| CUSTOMER | `/measurement-access` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-measurement-access-1440-page.png) |
| CUSTOMER | `/messages` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/customer-messages-1440-page.png) |
| CUSTOMER | `/service-requests` | 1440, 360, 390, 430 | Keyboard Tab, New request, Search | bodyOverflow, loading | [screenshot](screenshots/customer-service-requests-1440-page.png) |
| CUSTOMER | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/customer-support-tickets-1440-page.png) |
| CUSTOMER | `/work-changes` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-changes-1440-page.png) |
| CUSTOMER | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-photos-1440-page.png) |
| CUSTOMER | `/work-reschedules` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-reschedules-1440-page.png) |
| CUSTOMER | `/work-schedules` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/customer-work-schedules-1440-page.png) |
| PAINTER_FREELANCE | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-account-security-1440-page.png) |
| PAINTER_FREELANCE | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-activity-log-1440-page.png) |
| PAINTER_FREELANCE | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-appearance-1440-page.png) |
| PAINTER_FREELANCE | `/applicator` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-applicator-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-availability` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_freelance-applicator-availability-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-bookings` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_freelance-applicator-bookings-1440-page.png) |
| PAINTER_FREELANCE | `/applicator-profile` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | loading | [screenshot](screenshots/painter_freelance-applicator-profile-1440-page.png) |
| PAINTER_FREELANCE | `/colors-shades` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-colors-shades-1440-page.png) |
| PAINTER_FREELANCE | `/dashboard` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/painter_freelance-dashboard-1440-page.png) |
| PAINTER_FREELANCE | `/find-painter` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/painter_freelance-find-painter-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-applicators` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-in-house-applicators-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-in-house-applicators-new-1440-page.png) |
| PAINTER_FREELANCE | `/in-house-earnings` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/painter_freelance-in-house-earnings-1440-page.png) |
| PAINTER_FREELANCE | `/job-activity` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-job-activity-1440-page.png) |
| PAINTER_FREELANCE | `/jobs` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-jobs-1440-page.png) |
| PAINTER_FREELANCE | `/messages` | 1440, 360, 390, 430 | Keyboard Tab | error, loading | [screenshot](screenshots/painter_freelance-messages-1440-page.png) |
| PAINTER_FREELANCE | `/my-packages` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-my-packages-1440-page.png) |
| PAINTER_FREELANCE | `/painter-assignments` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_freelance-painter-assignments-1440-page.png) |
| PAINTER_FREELANCE | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | unnamed | [screenshot](screenshots/painter_freelance-painter-seeking-1440-page.png) |
| PAINTER_FREELANCE | `/profile` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-profile-1440-page.png) |
| PAINTER_FREELANCE | `/provider-profile` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | loading | [screenshot](screenshots/painter_freelance-provider-profile-1440-page.png) |
| PAINTER_FREELANCE | `/settings` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=appearance` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-appearance-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=company` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-company-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=personal` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | loading | [screenshot](screenshots/painter_freelance-settings-tab-personal-1440-page.png) |
| PAINTER_FREELANCE | `/settings?tab=trade` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_freelance-settings-tab-trade-1440-page.png) |
| PAINTER_FREELANCE | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search | loading | [screenshot](screenshots/painter_freelance-support-tickets-1440-page.png) |
| PAINTER_FREELANCE | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/painter_freelance-work-photos-1440-page.png) |
| PAINTER_FREELANCE | `/work-reviews` | 1440, 360, 390, 430 | Keyboard Tab | error, unnamed | [screenshot](screenshots/painter_freelance-work-reviews-1440-page.png) |
| PAINTER_INHOUSE | `/account-security` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-account-security-1440-page.png) |
| PAINTER_INHOUSE | `/activity-log` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/painter_inhouse-activity-log-1440-page.png) |
| PAINTER_INHOUSE | `/appearance` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-appearance-1440-page.png) |
| PAINTER_INHOUSE | `/applicator` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/painter_inhouse-applicator-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-availability` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-applicator-availability-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-bookings` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-applicator-bookings-1440-page.png) |
| PAINTER_INHOUSE | `/applicator-profile` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | loading | [screenshot](screenshots/painter_inhouse-applicator-profile-1440-page.png) |
| PAINTER_INHOUSE | `/colors-shades` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-colors-shades-1440-page.png) |
| PAINTER_INHOUSE | `/dashboard` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-dashboard-1440-page.png) |
| PAINTER_INHOUSE | `/find-painter` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-find-painter-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-applicators` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-in-house-applicators-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-applicators/new` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-in-house-applicators-new-1440-page.png) |
| PAINTER_INHOUSE | `/in-house-earnings` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-in-house-earnings-1440-page.png) |
| PAINTER_INHOUSE | `/job-activity` | 1440, 360, 390, 430 | Keyboard Tab, Search | error | [screenshot](screenshots/painter_inhouse-job-activity-1440-page.png) |
| PAINTER_INHOUSE | `/jobs` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-jobs-1440-page.png) |
| PAINTER_INHOUSE | `/messages` | 1440, 360, 390, 430 | Keyboard Tab | loading | [screenshot](screenshots/painter_inhouse-messages-1440-page.png) |
| PAINTER_INHOUSE | `/my-packages` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-my-packages-1440-page.png) |
| PAINTER_INHOUSE | `/painter-assignments` | 1440, 360, 390, 430 | Keyboard Tab | unnamed | [screenshot](screenshots/painter_inhouse-painter-assignments-1440-page.png) |
| PAINTER_INHOUSE | `/painter-seeking` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-painter-seeking-1440-page.png) |
| PAINTER_INHOUSE | `/profile` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-profile-1440-page.png) |
| PAINTER_INHOUSE | `/provider-profile` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | loading | [screenshot](screenshots/painter_inhouse-provider-profile-1440-page.png) |
| PAINTER_INHOUSE | `/settings` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | loading | [screenshot](screenshots/painter_inhouse-settings-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=appearance` | 1440, 360, 390, 430 | Keyboard Tab, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-appearance-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=company` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-company-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=personal` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-personal-1440-page.png) |
| PAINTER_INHOUSE | `/settings?tab=trade` | 1440, 360, 390, 430 | Keyboard Tab, Personal details, Trade & skills | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-settings-tab-trade-1440-page.png) |
| PAINTER_INHOUSE | `/support-tickets` | 1440, 360, 390, 430 | Keyboard Tab, Search | error, loading | [screenshot](screenshots/painter_inhouse-support-tickets-1440-page.png) |
| PAINTER_INHOUSE | `/work-photos` | 1440, 360, 390, 430 | Keyboard Tab, Search | No automatic signal; manual visual review still required | [screenshot](screenshots/painter_inhouse-work-photos-1440-page.png) |
| PAINTER_INHOUSE | `/work-reviews` | 1440, 360, 390, 430 | Keyboard Tab | error | [screenshot](screenshots/painter_inhouse-work-reviews-1440-page.png) |
| PUBLIC | `/customer-register` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-customer-register-1440-page.png) |
| PUBLIC | `/forgot-password` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-forgot-password-1440-page.png) |
| PUBLIC | `/login` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-login-1440-page.png) |
| PUBLIC | `/preview/bharath-apps` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-bharath-apps-1440-page.png) |
| PUBLIC | `/preview/settings` | 1440, 360, 390, 430 | Appearance, Business details, Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-settings-1440-page.png) |
| PUBLIC | `/preview/sidebar` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-sidebar-1440-page.png) |
| PUBLIC | `/preview/subcontract-work-orders` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-preview-subcontract-work-orders-1440-page.png) |
| PUBLIC | `/register` | 1440, 360, 390, 430 | Keyboard Tab | No automatic signal; manual visual review still required | [screenshot](screenshots/public-register-1440-page.png) |

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
