# Mobile responsiveness source review

Date: 2026-10-08. Workspace: D:/projects/Bharath Painters Application.

MOBILE RESPONSIVENESS STATUS: PARTIAL ? source fixes implemented; visual/interaction verification pending. This is source review coverage, not browser verification.

The route inventory contains 92 patterns and 82 mapped page/component flows. All mapped source files were read during the static scan. 132 sizing/table/modal/form signals were classified against the existing responsive patterns. Redirects and development previews are explicitly listed below.

## Shared causes and repairs

- Flex/grid children could retain their intrinsic width; phone-scoped min-width constraints and long-text wrapping now cover authenticated screens and public forms.
- Header buttons had a zero flex basis; action groups now reserve a readable basis and wrap.
- Legacy centered/bottom overlays lacked consistent dynamic-viewport height limits. Shared bounds and vertical scrolling keep content reachable; side drawers reserve safe-area space.
- Shared record cards had grid columns without display:grid; the grid layout is now explicit.
- Leads was excluded from card conversion by its inline stage select. Explicit opt-in now displays every non-serial field, stage control and original action. Dialog details show the selected stage rather than every option.
- Customers and Opportunities retain their existing dedicated mobile cards. Opportunity titles/property names now wrap.
- Record dialogs now use a flex body that scrolls independently of header/footer, with a single-column details list.
- Share Access has consistent 16px phone padding, bounded width/height, wrapping result text and a selectable multiline invitation link. Existing share/search/permission actions are unchanged.
- Property overview uses stacked details and wrapping actions. PDF preview retains four 44px toolbar actions and an accessible filename title.
- Chat edit controls shrink within the bubble; attachment removal/reply cancellation have touch-sized controls.
- Measurement comparison tables explicitly retain contained horizontal scrolling, including room headers and totals. Form dimension pairs stack on phones; calculations are unchanged.

## Width review (static only)

| Width | Layout rules reviewed | Browser status |
| --- | --- | --- |
| 360px | Strict baseline: 12?16px gutters, stacked form/detail fields, wrapping actions, 44px targets, bounded overlays | NOT RUN in this pass |
| 390px | Same phone rules; existing CRM narrower-width adjustments retained | NOT RUN in this pass |
| 430px | Same phone rules; no changes depend on only the narrowest breakpoint | NOT RUN in this pass |

Tablet/desktop remain outside the new max-width:767px stylesheet rules. Full visual regression is pending.

## Route coverage

| Route | Component/source | Source review / responsive handling |
| --- | --- | --- |
| `/preview/settings` | `frontend/src/App.jsx` / MergedSettingsPreview | Development preview; inventory only, no QA claim |
| `/preview/subcontract-work-orders` | `frontend/src/App.jsx` / SubcontractWorkOrdersPreview | Development preview; inventory only, no QA claim |
| `/preview/sidebar` | `frontend/src/App.jsx` / SidebarPreview | Development preview; inventory only, no QA claim |
| `/preview/bharath-apps` | `frontend/src/App.jsx` / BharathAppsPreview | Development preview; inventory only, no QA claim |
| `/login` | `frontend/src/pages/Login.jsx` / Login | Public form wrapping/bounds; existing responsive columns retained |
| `/register` | `frontend/src/pages/Register.jsx` / Register | Public form wrapping/bounds; existing responsive columns retained |
| `/customer-register` | `frontend/src/pages/CustomerRegister.jsx` / CustomerRegister | Public form wrapping/bounds; existing responsive columns retained |
| `/customer-link/:token` | `frontend/src/pages/CustomerShareLink.jsx` / CustomerShareLink | Public form wrapping/bounds; existing responsive columns retained |
| `/join/property/:token` | `frontend/src/pages/JoinProperty.jsx` / JoinProperty | Public form wrapping/bounds; existing responsive columns retained |
| `/forgot-password` | `frontend/src/pages/ForgotPassword.jsx` / ForgotPassword | Public form wrapping/bounds; existing responsive columns retained |
| `/dashboard` | `frontend/src/pages/Dashboard.jsx` / Dashboard | Shared phone primitives + existing route-specific responsive layout |
| `/applicator` | `frontend/src/pages/Dashboard.jsx` / Dashboard | Shared phone primitives + existing route-specific responsive layout |
| `/customer-dashboard` | `frontend/src/pages/CustomerDashboard.jsx` / CustomerDashboard | Shared phone primitives + existing route-specific responsive layout |
| `/customer/connections` | `frontend/src/pages/CustomerConnections.jsx` / CustomerConnections | Shared phone primitives + existing route-specific responsive layout |
| `/customer/profile` | `frontend/src/pages/CustomerProfile.jsx` / CustomerProfile | Shared phone primitives + existing route-specific responsive layout |
| `/customer/connection-requests` | `frontend/src/App.jsx` / Navigate | Redirect; destination layout applies |
| `/profile` | `frontend/src/pages/ProfileCard.jsx` / ProfileCard | Shared phone primitives + existing route-specific responsive layout |
| `/customer-reviews` | `frontend/src/pages/CustomerContractorReviews.jsx` / CustomerContractorReviews | Shared phone primitives + existing route-specific responsive layout |
| `/completed-projects` | `frontend/src/pages/ContractorCompletedProjects.jsx` / ContractorCompletedProjects | Shared phone primitives + existing route-specific responsive layout |
| `/account-security` | `frontend/src/pages/RecoveryEmailSettings.jsx` / RecoveryEmailSettings | Shared phone primitives + existing route-specific responsive layout |
| `/appearance` | `frontend/src/pages/AppearanceSettings.jsx` / AppearanceSettings | Shared phone primitives + existing route-specific responsive layout |
| `/contractors` | `frontend/src/pages/Contractors.jsx` / Contractors | Shared phone primitives + existing route-specific responsive layout |
| `/painters` | `frontend/src/pages/Painters.jsx` / Painters | Shared phone primitives + existing route-specific responsive layout |
| `/customers` | `frontend/src/pages/Customers.jsx` / Customers | Existing dedicated mobile cards + shared phone primitives |
| `/customers/:id` | `frontend/src/pages/CustomerDetail.jsx` / CustomerDetail | Shared phone primitives + existing route-specific responsive layout |
| `/customers/:id/quotations` | `frontend/src/pages/CustomerQuotationHistory.jsx` / CustomerQuotationHistory | Shared phone primitives + existing route-specific responsive layout |
| `/invoices` | `frontend/src/pages/Invoices.jsx` / Invoices | Shared phone primitives + existing route-specific responsive layout |
| `/tasks` | `frontend/src/pages/Tasks.jsx` / Tasks | Shared phone primitives + existing route-specific responsive layout |
| `/messages` | `frontend/src/pages/Chat.jsx` / Chat | Existing list/thread/composer responsive layout + shared constraints |
| `/colors-shades` | `frontend/src/pages/ColorsShades.jsx` / ColorsShades | Shared phone primitives + existing route-specific responsive layout |
| `/service-requests` | `frontend/src/pages/ServiceRequests.jsx` / ServiceRequests | Shared phone primitives + existing route-specific responsive layout |
| `/support-tickets` | `frontend/src/pages/SupportTickets.jsx` / SupportTickets | Shared phone primitives + existing route-specific responsive layout |
| `/support-workspace` | `frontend/src/pages/SupportWorkspace.jsx` / SupportWorkspace | Shared phone primitives + existing route-specific responsive layout |
| `/support-staff` | `frontend/src/pages/SupportStaff.jsx` / SupportStaff | Shared phone primitives + existing route-specific responsive layout |
| `/admin-integrations` | `frontend/src/pages/AdminIntegrations.jsx` / AdminIntegrations | Shared phone primitives + existing route-specific responsive layout |
| `/measurement-access` | `frontend/src/pages/MeasurementAccess.jsx` / MeasurementAccess | Stacked controls + bounded comparison scrolling + shared primitives |
| `/customer-quotations` | `frontend/src/pages/CustomerQuotations.jsx` / CustomerQuotations | Shared phone primitives + existing route-specific responsive layout |
| `/customer-quotations/:id` | `frontend/src/pages/CustomerQuotation.jsx` / CustomerQuotation | Shared phone primitives + existing route-specific responsive layout |
| `/customer-invoices` | `frontend/src/pages/CustomerInvoices.jsx` / CustomerInvoices | Shared phone primitives + existing route-specific responsive layout |
| `/customer-properties` | `frontend/src/pages/CustomerProperties.jsx` / CustomerProperties | Shared phone primitives + existing route-specific responsive layout |
| `/customer-properties/:id` | `frontend/src/pages/CustomerPropertyDetail.jsx` / CustomerPropertyDetail | Shared phone primitives + existing route-specific responsive layout |
| `/customer-properties/:id/access` | `frontend/src/pages/PropertyAccess.jsx` / PropertyAccess | Shared phone primitives + existing route-specific responsive layout |
| `/work-schedules` | `frontend/src/pages/WorkSchedules.jsx` / WorkSchedules | Shared phone primitives + existing route-specific responsive layout |
| `/work-changes` | `frontend/src/pages/WorkChanges.jsx` / WorkChanges | Shared phone primitives + existing route-specific responsive layout |
| `/work-reschedules` | `frontend/src/pages/WorkReschedules.jsx` / WorkReschedules | Shared phone primitives + existing route-specific responsive layout |
| `/completed-work` | `frontend/src/pages/CompletedWork.jsx` / CompletedWork | Shared phone primitives + existing route-specific responsive layout |
| `/leads` | `frontend/src/pages/Leads.jsx` / Leads | Shared cards with explicit editable-control opt-in |
| `/opportunities` | `frontend/src/pages/Opportunities.jsx` / Opportunities | Existing dedicated mobile cards + shared phone primitives |
| `/opportunities/new` | `frontend/src/pages/NewOpportunity.jsx` / NewOpportunity | Shared phone primitives + existing route-specific responsive layout |
| `/opportunities/:id` | `frontend/src/pages/OpportunityDetail.jsx` / OpportunityDetail | Shared phone primitives + existing route-specific responsive layout |
| `/site-visits` | `frontend/src/pages/SiteVisits.jsx` / SiteVisits | Shared phone primitives + existing route-specific responsive layout |
| `/painter-seeking` | `frontend/src/pages/PainterSeeking.jsx` / PainterSeeking | Shared phone primitives + existing route-specific responsive layout |
| `/find-painter` | `frontend/src/App.jsx` / Navigate | Redirect; destination layout applies |
| `/painter-assignments` | `frontend/src/pages/PainterAssignments.jsx` / PainterAssignments | Shared phone primitives + existing route-specific responsive layout |
| `/jobs` | `frontend/src/pages/Jobs.jsx` / Jobs | Shared phone primitives + existing route-specific responsive layout |
| `/job-activity` | `frontend/src/pages/JobActivity.jsx` / JobActivity | Shared phone primitives + existing route-specific responsive layout |
| `/applicator-team` | `frontend/src/pages/ApplicatorTeam.jsx` / ApplicatorTeam | Shared phone primitives + existing route-specific responsive layout |
| `/in-house-applicators` | `frontend/src/pages/InHouseApplicators.jsx` / InHouseApplicators | Shared phone primitives + existing route-specific responsive layout |
| `/in-house-applicators/new` | `frontend/src/pages/InHouseEmployeeCreate.jsx` / InHouseEmployeeCreate | Shared phone primitives + existing route-specific responsive layout |
| `/in-house-applicators/:id` | `frontend/src/pages/InHouseEmployeeDetail.jsx` / InHouseEmployeeDetail | Shared phone primitives + existing route-specific responsive layout |
| `/in-house-earnings` | `frontend/src/pages/InHouseEarnings.jsx` / InHouseEarnings | Shared phone primitives + existing route-specific responsive layout |
| `/work-reviews` | `frontend/src/pages/WorkReviews.jsx` / WorkReviews | Shared phone primitives + existing route-specific responsive layout |
| `/billing` | `frontend/src/pages/AdminBilling.jsx` / AdminBilling | Shared phone primitives + existing route-specific responsive layout |
| `/packages` | `frontend/src/pages/Billing.jsx` / Billing | Shared phone primitives + existing route-specific responsive layout |
| `/revenue` | `frontend/src/pages/AdminRevenue.jsx` / AdminRevenue | Shared phone primitives + existing route-specific responsive layout |
| `/customer-connections` | `frontend/src/pages/AdminCustomerConnections.jsx` / AdminCustomerConnections | Shared phone primitives + existing route-specific responsive layout |
| `/contractor-revenue` | `frontend/src/pages/ContractorRevenue.jsx` / ContractorRevenue | Shared phone primitives + existing route-specific responsive layout |
| `/my-packages` | `frontend/src/pages/ContractorPackages.jsx` / ContractorPackages | Shared phone primitives + existing route-specific responsive layout |
| `/activity-log` | `frontend/src/pages/ActivityLog.jsx` / ActivityLog | Shared phone primitives + existing route-specific responsive layout |
| `/measurement-trial` | `frontend/src/pages/MeasurementTrial.jsx` / MeasurementTrial | Stacked controls + bounded comparison scrolling + shared primitives |
| `/applicator-availability` | `frontend/src/pages/ApplicatorAvailability.jsx` / ApplicatorAvailability | Shared phone primitives + existing route-specific responsive layout |
| `/applicator-bookings` | `frontend/src/pages/ApplicatorBookings.jsx` / ApplicatorBookings | Shared phone primitives + existing route-specific responsive layout |
| `/properties` | `frontend/src/pages/Properties.jsx` / Properties | Shared phone primitives + existing route-specific responsive layout |
| `/properties/:id` | `frontend/src/pages/PropertyDetail.jsx` / PropertyDetail | Shared phone primitives + existing route-specific responsive layout |
| `/properties/:id/measurements` | `frontend/src/pages/MeasurementCalculator.jsx` / MeasurementCalculator | Stacked controls + bounded comparison scrolling + shared primitives |
| `/master-services` | `frontend/src/pages/MasterServices.jsx` / MasterServices | Shared phone primitives + existing route-specific responsive layout |
| `/contractor-network` | `frontend/src/pages/ContractorNetwork.jsx` / ContractorNetwork | Shared phone primitives + existing route-specific responsive layout |
| `/subcontract-work-orders` | `frontend/src/pages/SubcontractWorkOrders.jsx` / SubcontractWorkOrders | Shared phone primitives + existing route-specific responsive layout |
| `/subcontract-work-orders/:id` | `frontend/src/pages/SubcontractWorkOrderDetail.jsx` / SubcontractWorkOrderDetail | Shared phone primitives + existing route-specific responsive layout |
| `/settings` | `frontend/src/pages/Settings.jsx` / Settings | Shared phone primitives + existing route-specific responsive layout |
| `/provider-profile` | `frontend/src/App.jsx` / ProviderProfileRoute | Redirect; destination layout applies |
| `/applicator-profile` | `frontend/src/App.jsx` / LegacyPersonalSettingsRedirect | Shared phone primitives + existing route-specific responsive layout |
| `/contractor-theme` | `frontend/src/App.jsx` / VerifiedContractorRoute | Redirect; destination layout applies |
| `/quotations` | `frontend/src/pages/Quotations.jsx` / Quotations | Existing quotation mobile layout/padding fixes + shared primitives |
| `/quotations/new` | `frontend/src/pages/QuotationBuilder.jsx` / QuotationBuilder | Existing quotation mobile layout/padding fixes + shared primitives |
| `/quotations/new-measured` | `frontend/src/pages/QuotationBuilder.jsx` / QuotationBuilder | Existing quotation mobile layout/padding fixes + shared primitives |
| `/quotations/:id` | `frontend/src/pages/QuotationDetail.jsx` / QuotationDetail | Existing quotation mobile layout/padding fixes + shared primitives |
| `/quotations/new-manual` | `frontend/src/pages/QuotationBuilder.jsx` / QuotationBuilder | Existing quotation mobile layout/padding fixes + shared primitives |
| `/quotations/:id/edit` | `frontend/src/pages/QuotationEdit.jsx` / QuotationEdit | Existing quotation mobile layout/padding fixes + shared primitives |
| `/work-photos` | `frontend/src/pages/WorkPhotos.jsx` / WorkPhotos | Shared phone primitives + existing route-specific responsive layout |
| `/reports` | `frontend/src/pages/Reports.jsx` / Reports | Shared phone primitives + existing route-specific responsive layout |
| `*` | `frontend/src/App.jsx` / Navigate | Redirect; destination layout applies |

## Files changed in this pass

- frontend/src/styles/mobile-responsive.css (new shared phone rules)
- frontend/src/App.jsx (loads shared stylesheet)
- frontend/src/components/MobileTableDialogs.jsx
- frontend/src/components/PdfPreview.jsx
- frontend/src/components/SharePropertyDialog.jsx
- frontend/src/pages/JoinProperty.jsx
- frontend/src/pages/Leads.jsx
- frontend/src/pages/Opportunities.jsx
- frontend/src/pages/PropertyDetail.jsx
- frontend/src/pages/MeasurementCalculator.jsx
- frontend/src/pages/MeasurementTrial.jsx

Earlier uncommitted quotation-spacing changes in QuotationBuilder.jsx and quotation-measurement.css are preserved. Existing audit/fix changes are also preserved.

## Checks

- Final frontend build: PASS. One npm.cmd run build invocation; Vite completed in 17.08 seconds, exit 0.
- Quick frontend lint: PASS (exit 0), with warnings in existing hooks/unused imports/fast-refresh exports; no new warning category introduced by the responsive edits.
- git diff --check: PASS (exit 0); Git reported only line-ending notices.
- No full QA, browser regression, server restart, commit, push, backend edit or authentication-secret export performed in this pass.

## Remaining verification

No additional confirmed layout defect is recorded by this source pass. Real data, open overlays, soft keyboard/safe areas, interaction states and desktop/tablet visuals still need browser validation. Source review cannot establish that every route is visually correct.

**FULL MOBILE QA PENDING**
