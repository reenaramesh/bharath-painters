# Bharath Apps UI coverage

Shared presentation classes and design-system styles are applied across the web application. Page wrappers inherit the styles from their rendered screens. Routes below are direct bindings found in App.jsx; role labels are inferred from the existing navigation registry and do not replace route guards.

| Screen file | Direct routes | Navigation roles | Fields | Buttons | Tables |
|---|---|---|---:|---:|---:|
| ActivityLog.jsx | /activity-log | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | 7 | 4 | 0 |
| AdminBilling.jsx | /billing | ADMIN | 0 | 0 | 0 |
| AdminCustomerConnections.jsx | /customer-connections | ADMIN | 1 | 4 | 1 |
| AdminDashboard.jsx | Nested / delegated screen | Existing route guard / caller | 26 | 24 | 2 |
| AdminIntegrations.jsx | /admin-integrations | ADMIN | 1 | 3 | 0 |
| AdminRevenue.jsx | /revenue | ADMIN | 3 | 1 | 1 |
| AppearanceSettings.jsx | /appearance | PAINTER, CUSTOMER, ADMIN, SUPPORT | 2 | 2 | 0 |
| ApplicatorAvailability.jsx | /applicator-availability | PAINTER | 3 | 6 | 0 |
| ApplicatorBookings.jsx | /applicator-bookings | CONTRACTOR, PAINTER | 8 | 8 | 0 |
| ApplicatorProfile.jsx | Nested / delegated screen | Existing route guard / caller | 9 | 2 | 0 |
| ApplicatorTeam.jsx | /applicator-team | CONTRACTOR | 13 | 6 | 0 |
| Billing.jsx | /packages | ADMIN | 9 | 5 | 1 |
| Chat.jsx | /messages | CONTRACTOR, PAINTER, CUSTOMER | 7 | 46 | 0 |
| ColorsShades.jsx | /colors-shades | CONTRACTOR, PAINTER, CUSTOMER | 3 | 11 | 0 |
| ComingSoon.jsx | Nested / delegated screen | Existing route guard / caller | 0 | 0 | 0 |
| CompletedWork.jsx | /completed-work | CONTRACTOR, CUSTOMER | 2 | 0 | 1 |
| ContractorBusinessSettings.jsx | Nested / delegated screen | Existing route guard / caller | 0 | 0 | 0 |
| ContractorCompletedProjects.jsx | /completed-projects | CONTRACTOR | 10 | 6 | 0 |
| ContractorDashboard.jsx | Nested / delegated screen | Existing route guard / caller | 0 | 0 | 0 |
| ContractorNetwork.jsx | /contractor-network | CONTRACTOR | 6 | 16 | 2 |
| ContractorPackages.jsx | /my-packages | CONTRACTOR, PAINTER | 4 | 6 | 1 |
| ContractorRevenue.jsx | /contractor-revenue | CONTRACTOR | 11 | 5 | 3 |
| ContractorSettings.jsx | Nested / delegated screen | Existing route guard / caller | 28 | 17 | 0 |
| Contractors.jsx | /contractors | ADMIN | 1 | 2 | 1 |
| CustomerConnections.jsx | /customer/connections | CUSTOMER | 0 | 2 | 0 |
| CustomerContractorReviews.jsx | /customer-reviews | CUSTOMER | 1 | 1 | 0 |
| CustomerDashboard.jsx | /customer-dashboard | CUSTOMER | 0 | 1 | 0 |
| CustomerDetail.jsx | /customers/:id | CONTRACTOR | 3 | 9 | 0 |
| CustomerInvoices.jsx | /customer-invoices | CUSTOMER | 2 | 7 | 4 |
| CustomerProfile.jsx | /customer/profile | CUSTOMER | 9 | 5 | 0 |
| CustomerProperties.jsx | /customer-properties | CUSTOMER | 0 | 2 | 0 |
| CustomerPropertyDetail.jsx | /customer-properties/:id | CUSTOMER | 1 | 7 | 4 |
| CustomerQuotation.jsx | /customer-quotations/:id | CUSTOMER | 2 | 5 | 2 |
| CustomerQuotationHistory.jsx | /customers/:id/quotations | CONTRACTOR | 2 | 1 | 1 |
| CustomerQuotations.jsx | /customer-quotations | CUSTOMER | 2 | 0 | 1 |
| CustomerRegister.jsx | /customer-register | Existing route guard / caller | 1 | 1 | 0 |
| CustomerShareLink.jsx | /customer-link/:token | Existing route guard / caller | 4 | 5 | 0 |
| Customers.jsx | /customers | CONTRACTOR | 4 | 17 | 1 |
| Dashboard.jsx | /dashboard, /applicator | CONTRACTOR, PAINTER, ADMIN | 0 | 3 | 0 |
| FindPainter.jsx | Nested / delegated screen | Existing route guard / caller | 1 | 2 | 0 |
| ForgotPassword.jsx | /forgot-password | Existing route guard / caller | 5 | 7 | 0 |
| InHouseApplicators.jsx | /in-house-applicators | CONTRACTOR, PAINTER | 4 | 2 | 1 |
| InHouseEarnings.jsx | /in-house-earnings | PAINTER | 1 | 0 | 0 |
| InHouseEmployeeCreate.jsx | /in-house-applicators/new | CONTRACTOR, PAINTER | 12 | 1 | 0 |
| InHouseEmployeeDetail.jsx | /in-house-applicators/:id | CONTRACTOR, PAINTER | 17 | 9 | 0 |
| Invoices.jsx | /invoices | CONTRACTOR | 45 | 27 | 3 |
| JobActivity.jsx | /job-activity | CONTRACTOR, PAINTER | 3 | 9 | 1 |
| Jobs.jsx | /jobs | CONTRACTOR, PAINTER | 15 | 23 | 0 |
| JoinProperty.jsx | /join/property/:token | Existing route guard / caller | 0 | 2 | 0 |
| Leads.jsx | /leads | CONTRACTOR | 9 | 8 | 1 |
| Login.jsx | /login | Existing route guard / caller | 6 | 5 | 0 |
| ManualQuotationBuilder.jsx | Nested / delegated screen | Existing route guard / caller | 20 | 10 | 1 |
| MasterServices.jsx | /master-services | CONTRACTOR, ADMIN | 19 | 23 | 1 |
| MeasurementAccess.jsx | /measurement-access | CUSTOMER | 3 | 7 | 1 |
| MeasurementCalculator.jsx | /properties/:id/measurements | CONTRACTOR | 26 | 48 | 1 |
| MeasurementTrial.jsx | /measurement-trial | Existing route guard / caller | 11 | 20 | 4 |
| NewOpportunity.jsx | /opportunities/new | Existing route guard / caller | 18 | 7 | 0 |
| Opportunities.jsx | /opportunities | Existing route guard / caller | 6 | 1 | 1 |
| OpportunityDetail.jsx | /opportunities/:id | Existing route guard / caller | 8 | 5 | 0 |
| PainterAssignments.jsx | /painter-assignments | PAINTER | 0 | 5 | 0 |
| PainterSeeking.jsx | /painter-seeking | Existing route guard / caller | 17 | 17 | 0 |
| Painters.jsx | /painters | ADMIN | 2 | 2 | 1 |
| ProfileCard.jsx | /profile | CONTRACTOR, PAINTER, ADMIN, SUPPORT | 0 | 2 | 0 |
| Properties.jsx | /properties | CONTRACTOR | 3 | 7 | 2 |
| PropertyAccess.jsx | /customer-properties/:id/access | CUSTOMER | 0 | 7 | 0 |
| PropertyDetail.jsx | /properties/:id | CONTRACTOR | 0 | 7 | 2 |
| ProviderProfile.jsx | Nested / delegated screen | Existing route guard / caller | 9 | 4 | 0 |
| PublicContractorProfile.jsx | /contractor-profile/:bharathId | Existing route guard / caller | 0 | 1 | 0 |
| QuotationBuilder.jsx | /quotations/new, /quotations/new-measured, /quotations/new-manual | CONTRACTOR | 32 | 28 | 2 |
| QuotationDetail.jsx | /quotations/:id | CONTRACTOR | 2 | 13 | 2 |
| QuotationEdit.jsx | /quotations/:id/edit | CONTRACTOR | 0 | 0 | 0 |
| QuotationReset.jsx | Nested / delegated screen | Existing route guard / caller | 0 | 0 | 0 |
| Quotations.jsx | /quotations | CONTRACTOR | 5 | 4 | 1 |
| RecoveryEmailSettings.jsx | /account-security | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | 5 | 10 | 0 |
| Register.jsx | /register | Existing route guard / caller | 5 | 5 | 0 |
| Reports.jsx | /reports | CONTRACTOR, ADMIN | 0 | 2 | 2 |
| ServiceRequests.jsx | /service-requests | CONTRACTOR, CUSTOMER | 12 | 2 | 0 |
| Settings.jsx | /settings | CONTRACTOR, PAINTER | 0 | 1 | 0 |
| SiteVisits.jsx | /site-visits | CONTRACTOR | 9 | 7 | 0 |
| SubcontractWorkOrderDetail.jsx | /subcontract-work-orders/:id | CONTRACTOR | 3 | 10 | 1 |
| SubcontractWorkOrders.jsx | /subcontract-work-orders | CONTRACTOR | 0 | 5 | 1 |
| SupportStaff.jsx | /support-staff | ADMIN | 1 | 3 | 0 |
| SupportTickets.jsx | /support-tickets | CONTRACTOR, PAINTER, ADMIN, CUSTOMER, SUPPORT | 12 | 11 | 1 |
| SupportWorkspace.jsx | /support-workspace | SUPPORT | 3 | 9 | 0 |
| Tasks.jsx | /tasks | CONTRACTOR | 6 | 19 | 1 |
| WorkChanges.jsx | /work-changes | CONTRACTOR, CUSTOMER | 14 | 13 | 1 |
| WorkPhotos.jsx | /work-photos | CONTRACTOR, PAINTER, CUSTOMER, ADMIN | 8 | 4 | 0 |
| WorkReschedules.jsx | /work-reschedules | CONTRACTOR | 3 | 3 | 1 |
| WorkReviews.jsx | /work-reviews | CONTRACTOR, PAINTER | 1 | 2 | 0 |
| WorkSchedules.jsx | /work-schedules | CONTRACTOR, CUSTOMER | 8 | 16 | 0 |

The machine-readable inventory also records 88 flat shared component files and preserves the syntax-tree digest of all non-className code. Run `node scripts/application-ui-inventory.mjs --verify` from frontend to check that page/component fields and behavior still match the recorded inventory.
