# Application route inventory

Source-derived inventory. A shared colour change is not completion. Navigation roles below are hints, not proof of route/API authorization.

| Route | Component | Layout/guards | Menu roles | Migration status |
| --- | --- | --- | --- | --- |
| `/preview/settings` | MergedSettingsPreview | Public | Inspect page | excluded: development preview |
| `/preview/subcontract-work-orders` | SubcontractWorkOrdersPreview | Public | Inspect page | excluded: development preview |
| `/preview/sidebar` | SidebarPreview | Public | Inspect page | excluded: development preview |
| `/preview/bharath-apps` | BharathAppsPreview | Public | Inspect page | excluded: development preview |
| `/contractor-profile/:bharathId` | PublicContractorProfile | Public | Inspect page | pending: shared theme present; full page review required |
| `/login` | Login | Public | Inspect page | partial: master typography/palette and public layouts; login/support failure retention tested |
| `/share-contact` | ShareContact | Public | Inspect page | pending: shared theme present; full page review required |
| `/register` | Register | Public | Inspect page | partial: master typography/palette and public layouts; login/support failure retention tested |
| `/customer-register` | CustomerRegister | Public | Inspect page | partial: master typography/palette and public layouts; login/support failure retention tested |
| `/customer-link/:token` | CustomerShareLink | Public | Inspect page | pending: shared theme present; full page review required |
| `/join/property/:token` | JoinProperty | Public | Inspect page | pending: shared theme present; full page review required |
| `/forgot-password` | ForgotPassword | Public | Inspect page | partial: master typography/palette and public layouts; login/support failure retention tested |
| `/dashboard` | Dashboard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN | partial: Contractor/Painter/Admin dashboard presentation reviewed; conditional business states pending |
| `/applicator` | Dashboard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN | pending: shared theme present; full page review required |
| `/customer-dashboard` | CustomerDashboard | ProtectedRoute | CUSTOMER | partial: shared welcome/cards and eight-width review; populated approvals/work states pending |
| `/customer/connections` | CustomerConnections | ProtectedRoute | CUSTOMER | partial: native contractor profile, contrast, block confirmation/error and backdrop/focus checks |
| `/customer/profile` | CustomerProfile | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/customer/connection-requests` | Navigate | ProtectedRoute | CUSTOMER | redirect: verify destination |
| `/profile` | ProfileCard | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, SUPPORT | pending: shared theme present; full page review required |
| `/customer-reviews` | CustomerContractorReviews | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/completed-projects` | ContractorCompletedProjects | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | partial: shared header; inline portfolio form layout |
| `/account-security` | RecoveryEmailSettings | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | partial: shared headers and six eight-width layouts; source operations preserved |
| `/appearance` | AppearanceSettings | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER, ADMIN, SUPPORT | pending: shared theme present; full page review required |
| `/contractors` | Contractors | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/painters` | Painters | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/painter-contacts` | PainterContacts | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/painters/contacts/:id` | PainterContactDetail | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/customers` | Customers | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/call-inbox` | CallInbox | ProtectedRoute | CONTRACTOR | partial: shared manual/details/lead dialogs; manual and lead retries |
| `/customers/:id` | CustomerDetail | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/customers/:id/project-account` | CustomerProjectAccount | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/customers/:id/quotations` | CustomerQuotationHistory | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/invoices` | Invoices | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/tasks` | Tasks | ProtectedRoute | CONTRACTOR | partial: add/reschedule forms complete; populated grouping/filter/completion review pending |
| `/messages` | Chat | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER | pending: shared theme present; full page review required |
| `/colors-shades` | ColorsShades | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER | partial: shared headers/cards and eight-width review; current subscription card aligned |
| `/service-requests` | ServiceRequests | ProtectedRoute | CONTRACTOR, CUSTOMER | partial: native request/follow-up dialogs; request failure/retry and service prefill |
| `/support-tickets` | SupportTickets | ProtectedRoute | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | partial: shared header and native ticket dialogs; multipart failure retention |
| `/support-workspace` | SupportWorkspace | ProtectedRoute | SUPPORT | partial: shared headers and eight-width review; integration reveal/hide/failure retention |
| `/support-staff` | SupportStaff | ProtectedRoute | ADMIN | partial: shared headers and eight-width review; integration reveal/hide/failure retention |
| `/admin-integrations` | AdminIntegrations | ProtectedRoute | ADMIN | partial: shared headers and eight-width review; integration reveal/hide/failure retention |
| `/measurement-access` | MeasurementAccess | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/customer-quotations` | CustomerQuotations | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/customer-quotations/:id` | CustomerQuotation | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-invoices` | CustomerInvoices | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/customer-properties` | CustomerProperties | ProtectedRoute | CUSTOMER | partial: shared presentation and eight-width review; review submission retry |
| `/customer-properties/:id` | CustomerPropertyDetail | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/customer-properties/:id/access` | PropertyAccess | ProtectedRoute | CUSTOMER | pending: shared theme present; full page review required |
| `/work-schedules` | WorkSchedules | ProtectedRoute | CONTRACTOR, CUSTOMER | partial: shared date proposal and team dialogs; proposal retry |
| `/work-changes` | WorkChanges | ProtectedRoute | CONTRACTOR, CUSTOMER | partial: shared draft/detail dialogs; Contractor draft and Customer approval retry |
| `/work-reschedules` | WorkReschedules | ProtectedRoute | CONTRACTOR | partial: native requirement/detail/revised-date dialogs; eight-width review and revised-date retry |
| `/completed-work` | CompletedWork | ProtectedRoute | CONTRACTOR, CUSTOMER | pending: shared theme present; full page review required |
| `/leads` | Leads | ProtectedRoute | CONTRACTOR | partial: create form complete; populated stage/history/filter review pending |
| `/opportunities` | Opportunities | ProtectedRoute | Inspect page | partial: shared header, two-column narrow summaries and filter accessibility |
| `/opportunities/new` | NewOpportunity | ProtectedRoute | Inspect page | partial: shared header and native quick-client dialog |
| `/opportunities/:id` | OpportunityDetail | ProtectedRoute | Inspect page | partial: stage selection and failed-edit retention |
| `/site-visits` | SiteVisits | ProtectedRoute | CONTRACTOR | partial: schedule form complete; populated visit/status/filter review pending |
| `/painter-seeking` | PainterSeeking | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers and six eight-width layouts; source operations preserved |
| `/find-painter` | Navigate | ProtectedRoute | CONTRACTOR, PAINTER | redirect: verify destination |
| `/painter-assignments` | PainterAssignments | ProtectedRoute | PAINTER | partial: shared headers/cards and eight-width layouts; availability failure/retry |
| `/jobs` | Jobs | ProtectedRoute | CONTRACTOR, PAINTER | partial: native requirement/detail/revised-date dialogs; eight-width review and revised-date retry |
| `/job-activity` | JobActivity | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/applicator-team` | ApplicatorTeam | ProtectedRoute | CONTRACTOR | partial: shared presentation and targeted dialog behavior verified at eight widths |
| `/in-house-applicators` | InHouseApplicators | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers and six eight-width layouts; source operations preserved |
| `/in-house-applicators/new` | InHouseEmployeeCreate | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers and six eight-width layouts; source operations preserved |
| `/in-house-applicators/:id` | InHouseEmployeeDetail | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers and six eight-width layouts; source operations preserved |
| `/in-house-earnings` | InHouseEarnings | ProtectedRoute | PAINTER | partial: shared headers/cards and eight-width layouts; availability failure/retry |
| `/work-reviews` | WorkReviews | ProtectedRoute | CONTRACTOR, PAINTER | pending: shared theme present; full page review required |
| `/billing` | AdminBilling | ProtectedRoute | ADMIN | partial: shared headers and eight-width review; integration reveal/hide/failure retention |
| `/packages` | Billing | ProtectedRoute | ADMIN | partial: shared headers and eight-width review; integration reveal/hide/failure retention |
| `/revenue` | AdminRevenue | ProtectedRoute | ADMIN | pending: shared theme present; full page review required |
| `/customer-connections` | AdminCustomerConnections | ProtectedRoute | ADMIN | partial: shared header, mobile audit action and native history/table-details dialogs reviewed |
| `/contractor-revenue` | ContractorRevenue | ProtectedRoute, VerifiedContractorRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/my-packages` | ContractorPackages | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers/cards and eight-width review; current subscription card aligned |
| `/activity-log` | ActivityLog | ProtectedRoute | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | partial: shared header/cards; tablet clipping fixed |
| `/measurement-trial` | MeasurementTrial | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/applicator-availability` | ApplicatorAvailability | ProtectedRoute | PAINTER | partial: shared headers/cards and eight-width layouts; availability failure/retry |
| `/applicator-bookings` | ApplicatorBookings | ProtectedRoute | CONTRACTOR, PAINTER | partial: shared headers/cards and eight-width layouts; availability failure/retry |
| `/properties` | Properties | ProtectedRoute | CONTRACTOR | partial: shared header; property/calculator layouts and save-error drawer |
| `/properties/:id` | PropertyDetail | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/properties/:id/measurements` | MeasurementCalculator | ProtectedRoute | CONTRACTOR | pending: shared theme present; full page review required |
| `/master-services` | MasterServices | ProtectedRoute | CONTRACTOR, ADMIN | partial: shared presentation and targeted dialog behavior verified at eight widths |
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
| `/reports` | Reports | ProtectedRoute | CONTRACTOR, ADMIN | partial: shared headers/cards and eight-width review; current subscription card aligned |
| `*` | Navigate | Public | Inspect page | redirect: verify destination |
