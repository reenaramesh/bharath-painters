# Application route inventory

Source-derived inventory. A shared colour change is not completion. Navigation roles below are hints, not proof of route/API authorization.

| Route | Component | Layout/guards | Menu roles | Migration status |
| --- | --- | --- | --- | --- |
| `/preview/settings` | MergedSettingsPreview | Public | Inspect page | excluded: development preview |
| `/preview/subcontract-work-orders` | SubcontractWorkOrdersPreview | Public | Inspect page | excluded: development preview |
| `/preview/sidebar` | SidebarPreview | Public | Inspect page | excluded: development preview |
| `/preview/bharath-apps` | BharathAppsPreview | Public | Inspect page | excluded: development preview |
| `/contractor-profile/:bharathId` | PublicContractorProfile | Public | Inspect page | pending: shared theme present; full page review required |
| `/login` | Login | Public | Inspect page | pending: shared theme present; full page review required |
| `/share-contact` | ShareContact | Public | Inspect page | pending: shared theme present; full page review required |
| `/register` | Register | Public | Inspect page | pending: shared theme present; full page review required |
| `/customer-register` | CustomerRegister | Public | Inspect page | pending: shared theme present; full page review required |
| `/customer-link/:token` | CustomerShareLink | Public | Inspect page | pending: shared theme present; full page review required |
| `/join/property/:token` | JoinProperty | Public | Inspect page | pending: shared theme present; full page review required |
| `/forgot-password` | ForgotPassword | Public | Inspect page | pending: shared theme present; full page review required |
| `/dashboard` | Dashboard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN | pending: shared theme present; full page review required |
| `/applicator` | Dashboard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN | pending: shared theme present; full page review required |
| `/customer-dashboard` | CustomerDashboard | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer/connections` | CustomerConnections | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer/profile` | CustomerProfile | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer/connection-requests` | Navigate | ProtectedRoute | CUSTOMER | redirect: verify destination |
| `/profile` | ProfileCard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, SUPPORT | pending: shared theme present; full page review required |
| `/customer-reviews` | CustomerContractorReviews | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/completed-projects` | ContractorCompletedProjects | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/account-security` | RecoveryEmailSettings | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | pending: shared theme present; full page review required |
| `/appearance` | AppearanceSettings | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER, ADMIN, SUPPORT | pending: shared theme present; full page review required |
| `/contractors` | Contractors | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/painters` | Painters | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/painter-contacts` | PainterContacts | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/painters/contacts/:id` | PainterContactDetail | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/customers` | Customers | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/call-inbox` | CallInbox | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/customers/:id` | CustomerDetail | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/customers/:id/project-account` | CustomerProjectAccount | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/customers/:id/quotations` | CustomerQuotationHistory | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/invoices` | Invoices | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/tasks` | Tasks | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/messages` | Chat | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER | pending: shared theme present; full page review required |
| `/colors-shades` | ColorsShades | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER | pending: shared theme present; full page review required |
| `/service-requests` | ServiceRequests | ProtectedRoute | CONTRACTOR, CUSTOMER | pending: shared theme present; full page review required |
| `/support-tickets` | SupportTickets | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | pending: shared theme present; full page review required |
| `/support-workspace` | SupportWorkspace | ProtectedRoute | SUPPORT | pending: shared theme present; full page review required |
| `/support-staff` | SupportStaff | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/admin-integrations` | AdminIntegrations | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/measurement-access` | MeasurementAccess | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-quotations` | CustomerQuotations | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-quotations/:id` | CustomerQuotation | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-invoices` | CustomerInvoices | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-properties` | CustomerProperties | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-properties/:id` | CustomerPropertyDetail | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-properties/:id/access` | PropertyAccess | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/work-schedules` | WorkSchedules | ProtectedRoute | CONTRACTOR, CUSTOMER | pending: shared theme present; full page review required |
| `/work-changes` | WorkChanges | ProtectedRoute | CONTRACTOR, CUSTOMER | pending: shared theme present; full page review required |
| `/work-reschedules` | WorkReschedules | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/completed-work` | CompletedWork | ProtectedRoute | CONTRACTOR, CUSTOMER | pending: shared theme present; full page review required |
| `/leads` | Leads | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/opportunities` | Opportunities | ProtectedRoute | Inspect page | pending: shared theme present; full page review required |
| `/opportunities/new` | NewOpportunity | ProtectedRoute | Inspect page | pending: shared theme present; full page review required |
| `/opportunities/:id` | OpportunityDetail | ProtectedRoute | Inspect page | pending: shared theme present; full page review required |
| `/site-visits` | SiteVisits | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/painter-seeking` | PainterSeeking | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/find-painter` | Navigate | ProtectedRoute | CONTRACTOR, PAINTER | redirect: verify destination |
| `/painter-assignments` | PainterAssignments | ProtectedRoute | PAINTER | pending: shared theme present; full page review required |
| `/jobs` | Jobs | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/job-activity` | JobActivity | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/applicator-team` | ApplicatorTeam | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/in-house-applicators` | InHouseApplicators | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/in-house-applicators/new` | InHouseEmployeeCreate | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/in-house-applicators/:id` | InHouseEmployeeDetail | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/in-house-earnings` | InHouseEarnings | ProtectedRoute | PAINTER | pending: shared theme present; full page review required |
| `/work-reviews` | WorkReviews | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/billing` | AdminBilling | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/packages` | Billing | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/revenue` | AdminRevenue | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/customer-connections` | AdminCustomerConnections | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/contractor-revenue` | ContractorRevenue | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/my-packages` | ContractorPackages | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/activity-log` | ActivityLog | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | pending: shared theme present; full page review required |
| `/measurement-trial` | MeasurementTrial | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/applicator-availability` | ApplicatorAvailability | ProtectedRoute | PAINTER | pending: shared theme present; full page review required |
| `/applicator-bookings` | ApplicatorBookings | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/properties` | Properties | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/properties/:id` | PropertyDetail | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/properties/:id/measurements` | MeasurementCalculator | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/master-services` | MasterServices | ProtectedRoute | CONTRACTOR, ADMIN | pending: shared theme present; full page review required |
| `/contractor-network` | ContractorNetwork | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/subcontract-work-orders` | SubcontractWorkOrders | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/subcontract-work-orders/:id` | SubcontractWorkOrderDetail | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/settings` | Settings | ProtectedRoute, ProviderProfileRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/provider-profile` | ProviderProfileRoute | ProtectedRoute, ProviderProfileRoute | CONTRACTOR, PAINTER | redirect: verify destination |
| `/applicator-profile` | LegacyPersonalSettingsRedirect | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/contractor-theme` | VerifiedContractorRoute | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | redirect: verify destination |
| `/quotations` | Quotations | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/quotations/new` | QuotationBuilder | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/quotations/new-measured` | QuotationBuilder | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/quotations/:id` | QuotationDetail | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/quotations/new-manual` | QuotationBuilder | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/quotations/:id/edit` | QuotationEdit | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/work-photos` | WorkPhotos | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | pending: shared theme present; full page review required |
| `/reports` | Reports | ProtectedRoute | CONTRACTOR, ADMIN | pending: shared theme present; full page review required |
| `*` | Navigate | Public | Inspect page | redirect: verify destination |
