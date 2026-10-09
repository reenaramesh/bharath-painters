# Source route declarations

Captured from the existing source without editing it.

## Frontend routes
```
142: {MergedSettingsPreview && <Route path="/preview/settings" element={<MergedSettingsPreview />} />}
144: <Route path="/preview/subcontract-work-orders" element={<SubcontractWorkOrdersPreview />} />
146: {SidebarPreview && <Route path="/preview/sidebar" element={<SidebarPreview />} />}
148: <Route path="/preview/bharath-apps" element={<BharathAppsPreview />} />
150: <Route path="/login" element={<Login />} />
151: <Route path="/register" element={<Register />} />
152: <Route path="/customer-register" element={<CustomerRegister />} />
153: <Route path="/customer-link/:token" element={<CustomerShareLink />} />
154: <Route path="/join/property/:token" element={<JoinProperty />} />
155: <Route path="/forgot-password" element={<ForgotPassword />} />
163: <Route path="/dashboard" element={<Dashboard />} />
164: <Route path="/applicator" element={<Dashboard />} />
165: <Route path="/customer-dashboard" element={<CustomerDashboard />} />
166: <Route path="/customer/connections" element={<CustomerConnections />} />
167: <Route path="/customer/profile" element={<CustomerProfile />} />
168: <Route path="/customer/connection-requests" element={<Navigate to="/customer/connections" replace />} />
169: <Route path="/profile" element={<ProfileCard />} />
170: <Route path="/customer-reviews" element={<CustomerContractorReviews />} />
172: path="/completed-projects"
179: <Route path="/account-security" element={<RecoveryEmailSettings />} />
180: <Route path="/appearance" element={<AppearanceSettings />} />
181: <Route path="/contractors" element={<Contractors />} />
182: <Route path="/painters" element={<Painters />} />
183: <Route path="/customers" element={<Customers />} />
184: <Route path="/customers/:id" element={<CustomerDetail />} />
186: path="/customers/:id/quotations"
190: path="/invoices"
197: <Route path="/tasks" element={<Tasks />} />
198: <Route path="/messages" element={<Chat />} />
199: <Route path="/colors-shades" element={<ColorsShades />} />
200: <Route path="/service-requests" element={<ServiceRequests />} />
201: <Route path="/support-tickets" element={<SupportTickets />} />
202: <Route path="/support-workspace" element={<SupportWorkspace />} />
203: <Route path="/support-staff" element={<SupportStaff />} />
204: <Route path="/admin-integrations" element={<AdminIntegrations />} />
205: <Route path="/measurement-access" element={<MeasurementAccess />} />
207: path="/customer-quotations"
211: path="/customer-quotations/:id"
214: <Route path="/customer-invoices" element={<CustomerInvoices />} />
216: path="/customer-properties"
220: path="/customer-properties/:id"
223: <Route path="/customer-properties/:id/access" element={<PropertyAccess />} />
224: <Route path="/work-schedules" element={<WorkSchedules />} />
225: <Route path="/work-changes" element={<WorkChanges />} />
226: <Route path="/work-reschedules" element={<WorkReschedules />} />
227: <Route path="/completed-work" element={<CompletedWork />} />
228: <Route path="/leads" element={<Leads />} />
229: <Route path="/opportunities" element={<Opportunities />} />
230: <Route path="/opportunities/new" element={<NewOpportunity />} />
231: <Route path="/opportunities/:id" element={<OpportunityDetail />} />
232: <Route path="/site-visits" element={<SiteVisits />} />
233: <Route path="/painter-seeking" element={<PainterSeeking />} />
234: <Route path="/find-painter" element={<Navigate to="/applicator-bookings" replace />} />
236: path="/painter-assignments"
239: <Route path="/jobs" element={<Jobs />} />
240: <Route path="/job-activity" element={<JobActivity />} />
241: <Route path="/applicator-team" element={<ApplicatorTeam />} />
243: path="/in-house-applicators"
247: path="/in-house-applicators/new"
251: path="/in-house-applicators/:id"
254: <Route path="/in-house-earnings" element={<InHouseEarnings />} />
255: <Route path="/work-reviews" element={<WorkReviews />} />
256: <Route path="/billing" element={<AdminBilling />} />
257: <Route path="/packages" element={<Billing />} />
258: <Route path="/revenue" element={<AdminRevenue />} />
259: <Route path="/customer-connections" element={<AdminCustomerConnections />} />
261: path="/contractor-revenue"
268: <Route path="/my-packages" element={<ContractorPackages />} />
269: <Route path="/activity-log" element={<ActivityLog />} />
270: <Route path="/measurement-trial" element={<MeasurementTrial />} />
272: path="/applicator-availability"
276: path="/applicator-bookings"
279: <Route path="/properties" element={<Properties />} />
280: <Route path="/properties/:id" element={<PropertyDetail />} />
282: path="/properties/:id/measurements"
285: <Route path="/master-services" element={<MasterServices />} />
287: path="/contractor-network"
295: path="/subcontract-work-orders"
303: path="/subcontract-work-orders/:id"
311: path="/settings"
321: path="/provider-profile"
329: path="/applicator-profile"
333: path="/contractor-theme"
341: path="/quotations"
349: path="/quotations/new"
357: path="/quotations/new-measured"
365: path="/quotations/:id"
373: path="/quotations/new-manual"
381: path="/quotations/:id/edit"
388: <Route path="/work-photos" element={<WorkPhotos />} />
389: <Route path="/reports" element={<Reports />} />
391: <Route path="*" element={<Navigate to="/dashboard" replace />} />
```

## backend/accounts/urls.py
```python
from .profile_images import profile_image
from .menu_visibility import MenuVisibilityView
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    PainterRegistrationView,
    ContractorRegistrationView,
    RegistrationEmailRequestView,
    RegistrationEmailVerifyView,
    CustomerRegistrationView,
    ForgotPasswordLookupView,
    ForgotPasswordRequestView,
    ForgotPasswordVerifyView,
    ForgotPasswordConfirmView,
    RecoveryEmailView,
    ChangePasswordView,
    RecoveryEmailRequestView,
    RecoveryEmailVerifyView,
    LoginView,
    GoogleLoginView,
    CurrentUserView,
    AccountLifecycleView,
    CustomerProfileView,
    ProfileCardView,
    ContractorCompletedProjectsView,
    ContractorProjectMapLookupView,
    ContractorCompletedProjectDetailView,
    CustomerContractorReviewsView,
    ContractorDigitalCardPdfView,
    ContractorProfileView,
    ProviderProfileView,
    BusinessSettingsView,
    ContractorDirectoryView,
    PainterDirectoryView,
    RegistrationLegalDocumentView,
    VerifyBharathIDView, VerifyBharathIDPageView,
)

urlpatterns = [
    path("menu-visibility/", MenuVisibilityView.as_view(), name="menu-visibility"),
    path("profile-images/<str:kind>/<int:object_id>/", profile_image, name="profile-image"),
    path("legal/registration/", RegistrationLegalDocumentView.as_view(), name="registration-legal-document"),
    path(
        "register/painter/",
        PainterRegistrationView.as_view(),
        name="register-painter"
    ),

    path(
        "register/contractor/",
        ContractorRegistrationView.as_view(),
        name="register-contractor"
    ),

    path(
        "login/",
        LoginView.as_view(),
        name="login"
    ),
    path("google-login/", GoogleLoginView.as_view(), name="google-login"),
    path("register/customer/", CustomerRegistrationView.as_view(), name="register-customer"),
    path("register/email/request/", RegistrationEmailRequestView.as_view(), name="registration-email-request"),
    path("register/email/verify/", RegistrationEmailVerifyView.as_view(), name="registration-email-verify"),
    path("forgot-password/lookup/", ForgotPasswordLookupView.as_view(), name="forgot-password-lookup"),
    path("forgot-password/request/", ForgotPasswordRequestView.as_view(), name="forgot-password-request"),
    path("forgot-password/verify/", ForgotPasswordVerifyView.as_view(), name="forgot-password-verify"),
    path("forgot-password/confirm/", ForgotPasswordConfirmView.as_view(), name="forgot-password-confirm"),
    path("recovery-email/", RecoveryEmailView.as_view(), name="recovery-email"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("recovery-email/request/", RecoveryEmailRequestView.as_view(), name="recovery-email-request"),
    path("recovery-email/verify/", RecoveryEmailVerifyView.as_view(), name="recovery-email-verify"),

    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("account/lifecycle/", AccountLifecycleView.as_view(), name="account-lifecycle"),
    path("customer-profile/", CustomerProfileView.as_view(), name="customer-profile"),
    path("profile-card/", ProfileCardView.as_view(), name="profile-card"),
    path("profile-card/projects/", ContractorCompletedProjectsView.as_view(), name="profile-card-projects"),
    path("profile-card/projects/map-lookup/", ContractorProjectMapLookupView.as_view(), name="profile-card-project-map-lookup"),
    path("profile-card/projects/<int:project_id>/", ContractorCompletedProjectDetailView.as_view(), name="profile-card-project-detail"),
    path("customer-reviews/", CustomerContractorReviewsView.as_view(), name="customer-contractor-reviews"),
    path("profile-card/<str:bharath_id>/pdf/", ContractorDigitalCardPdfView.as_view(), name="profile-card-pdf"),
    path("contractor-profile/", ContractorProfileView.as_view(), name="contractor-profile"),
    path("provider-profile/", ProviderProfileView.as_view(), name="provider-profile"),
    path("business-settings/", BusinessSettingsView.as_view(), name="business-settings"),
    path("contractors/", ContractorDirectoryView.as_view(), name="contractor-directory"),
    path("painters/", PainterDirectoryView.as_view(), name="painter-directory"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    path(
        "verify/<str:bharath_id>/",
        VerifyBharathIDView.as_view(),
        name="verify-bharath-id"
),

    path(
        "verify-page/<str:bharath_id>/",
        VerifyBharathIDPageView.as_view(),
        name="verify-page",
    ),
]
```

## backend/jobs/urls.py
```python
from django.urls import path

from .views import (
    JobCreateView, JobActivityView,
    JobListView,
    JobApplyView,ContractorApplicationListView, AcceptJobApplicationView, RejectJobApplicationView,
    JobApplicationCancellationView, JobApplicationReassignView, JobApplicationRatingView, JobTransferResponseView,
    WorkScheduleListCreateView, WorkScheduleAcceptView, WorkSchedulePainterView, WorkSchedulePaymentView, WorkScheduleAdvanceReceiptView, WorkScheduleCancelView, WorkScheduleProgressView,
    PainterSeekingListCreateView, PainterSeekingDetailView,
    PainterAssignmentListView, PainterAssignmentProgressView, PainterDashboardView,
    ContractorApplicatorTeamView, ContractorApplicatorTeamDetailView,
    ContractorApplicatorCreateView, ApplicatorProfileView, ApplicatorAvailabilityView,
    ApplicatorBookingListCreateView, ApplicatorBookingSearchView, ApplicatorBookingActionView,
    ApplicatorAvailabilityBlockView, ApplicatorAvailabilityBlockDetailView,
    InHouseApplicatorListView, InHouseApplicatorDetailView, InHouseAttendanceView, InHouseLedgerView,
    MyInHouseEmploymentView,
    MyInHouseEarningsView,
    WorkReviewListCreateView,
    WorkPhotoListCreateView, WorkPhotoDetailView, OperationsReportView,
)

urlpatterns = [
    path("activity/", JobActivityView.as_view(), name="job-activity"),
    path("seeking/", PainterSeekingListCreateView.as_view(), name="painter-seeking-list"),
    path("seeking/<int:pk>/", PainterSeekingDetailView.as_view(), name="painter-seeking-detail"),
    path("my-assignments/", PainterAssignmentListView.as_view(), name="painter-assignment-list"),
    path("applicator-dashboard/", PainterDashboardView.as_view(), name="painter-dashboard"),
    path("my-assignments/<int:pk>/progress/", PainterAssignmentProgressView.as_view(), name="painter-assignment-progress"),
    path("my-team/", ContractorApplicatorTeamView.as_view(), name="contractor-applicator-team"),
    path("my-team/<int:pk>/", ContractorApplicatorTeamDetailView.as_view(), name="contractor-applicator-team-detail"),
    path("my-team/create-applicator/", ContractorApplicatorCreateView.as_view(), name="contractor-create-applicator"),
    path("in-house-applicators/", InHouseApplicatorListView.as_view(), name="in-house-applicator-list"),
    path("in-house-applicators/<int:pk>/", InHouseApplicatorDetailView.as_view(), name="in-house-applicator-detail"),
    path("in-house-applicators/<int:pk>/attendance/", InHouseAttendanceView.as_view(), name="in-house-attendance"),
    path("in-house-applicators/<int:pk>/ledger/", InHouseLedgerView.as_view(), name="in-house-ledger"),
    path("my-in-house-employment/", MyInHouseEmploymentView.as_view(), name="my-in-house-employment"),
    path("my-in-house-earnings/", MyInHouseEarningsView.as_view(), name="my-in-house-earnings"),
    path("work-reviews/", WorkReviewListCreateView.as_view(), name="work-review-list-create"),
    path("work-photos/", WorkPhotoListCreateView.as_view(), name="work-photo-list-create"),
    path("work-photos/<int:pk>/", WorkPhotoDetailView.as_view(), name="work-photo-detail"),
    path("reports/", OperationsReportView.as_view(), name="operations-report"),
    path("applicator-profile/", ApplicatorProfileView.as_view(), name="applicator-profile"),
    path("applicator-availability/", ApplicatorAvailabilityView.as_view(), name="applicator-availability"),
    path("applicator-availability/blocks/", ApplicatorAvailabilityBlockView.as_view(), name="applicator-availability-block"),
    path("applicator-availability/blocks/<int:pk>/", ApplicatorAvailabilityBlockDetailView.as_view(), name="applicator-availability-block-detail"),
    path("applicator-bookings/", ApplicatorBookingListCreateView.as_view(), name="applicator-booking-list"),
    path("applicator-bookings/search/", ApplicatorBookingSearchView.as_view(), name="applicator-booking-search"),
    path("applicator-bookings/<int:pk>/action/", ApplicatorBookingActionView.as_view(), name="applicator-booking-action"),
    path("work-schedules/", WorkScheduleListCreateView.as_view(), name="work-schedule-list"),
    path("work-schedules/<int:pk>/accept/", WorkScheduleAcceptView.as_view(), name="work-schedule-accept"),
    path("work-schedules/<int:pk>/painters/", WorkSchedulePainterView.as_view(), name="work-schedule-painters"),
    path("work-schedules/<int:pk>/payment/", WorkSchedulePaymentView.as_view(), name="work-schedule-payment"),
    path("work-schedules/<int:pk>/advance-receipt/", WorkScheduleAdvanceReceiptView.as_view(), name="work-schedule-advance-receipt"),
    path("work-schedules/<int:pk>/cancel/", WorkScheduleCancelView.as_view(), name="work-schedule-cancel"),
    path("work-schedules/<int:pk>/progress/", WorkScheduleProgressView.as_view(), name="work-schedule-progress"),

    path(
        "create/",
        JobCreateView.as_view(),
        name="job-create",
    ),

    path(
        "list/",
        JobListView.as_view(),
        name="job-list",
    ),

    path(
        "<int:job_id>/apply/",
        JobApplyView.as_view(),
        name="job-apply",
    ),

    path(
        "<int:job_id>/applications/",
        ContractorApplicationListView.as_view(),
        name="contractor-applications",
    ),

    path(
        "applications/<int:application_id>/accept/",
        AcceptJobApplicationView.as_view(),
        name="accept-job-application",
),

    path(
        "applications/<int:application_id>/reject/",
        RejectJobApplicationView.as_view(),
        name="reject-job-application",
    ),
    path("applications/<int:application_id>/cancellation/", JobApplicationCancellationView.as_view(), name="job-application-cancellation"),
    path("applications/<int:application_id>/reassign/", JobApplicationReassignView.as_view(), name="job-application-reassign"),
    path("transfers/<int:transfer_id>/respond/", JobTransferResponseView.as_view(), name="job-transfer-response"),
    path("applications/<int:application_id>/rating/", JobApplicationRatingView.as_view(), name="job-application-rating"),

]
```

## backend/quotations/urls.py
```python
from django.urls import path
from .push_views import WebPushSubscriptionView
from .support_views import SupportSearchView, SupportActionView, SupportAuditView
from .integration_views import AdminGoogleMapsKeyView

from .views import (
    AreaListCreateView,
    MeasurementSurfaceTypeListCreateView,
    MeasurementSurfaceTypeDetailView,
    ProjectScopeViewSet,
    ContractorConnectionListCreateView,
    ContractorConnectionActionView,
    ServiceTypeListCreateView,
    ServiceTypeDetailView,
    ServiceCategoryListCreateView, ServiceCategoryDetailView,
    WorkDescriptionListCreateView, WorkDescriptionDetailView,
    PaintTypeListCreateView,
    PaintBrandListCreateView,
    PaintColorListCreateView,
    UnitListCreateView,
    UnitDetailView,
    CustomerListCreateView,
    CustomerActivateAccountView,
    CustomerBulkImportView,
    PropertyListCreateView,
    PropertyInvitationListCreateView,
    PropertyInvitationTokenView,
    PropertyInvitationAcceptView,
    PropertyInvitationRevokeView,
    PropertyContactActionView,
    PropertyShareLookupView,
    PropertyShareView,
    CustomerPropertyShareRequestListView,
    CustomerPropertyShareRequestRespondView,
    QuotationListCreateView,
    QuotationCreateView,
    CustomerFollowUpListCreateView,
    CustomerTaskListView,
    CustomerTaskCompleteView,
    ChatConversationListView,
    ChatContactListView,
    ChatColourListView,
    ColourComparisonDraftView,
    ChatMessageListCreateView,
    ChatMessageForwardView,
    ChatMessageDetailView,
    ChatConversationSafetyView,
    ChatAttachmentDownloadView,
    ServiceRequestListCreateView,
    ServiceRequestOptionsView,
    ServiceRequestDetailView,
    LeadListCreateView,
    LeadDetailView,
    SupportTicketListCreateView,
    SupportTicketDetailView,
    PublicSupportTicketView,
    CustomerPortalDashboardView,
    ContractorCrmDashboardView,
    AdminOperationsDashboardView,
    AdminEntityListCreateView, AdminEntityDetailView, AdminPeopleExportView, AdminReleaseDeletedCustomerMobilesView, AdminReleaseInactiveBusinessMobilesView, AdminSupportStaffView, AdminSupportStaffDetailView,
    MeasurementAccessAvailabilityView,
    MeasurementAccessContractorSearchView,
    MeasurementAccessListCreateView,
    MeasurementAccessDetailView,
    ApprovedMeasurementView,
    MeasurementAccessPrepareQuotationView,
    PortalNotificationCountsView,
    PortalNotificationListView,
    CustomerQuotationView,
    CustomerQuotationListView,
    QuotationSubmitView,
    CustomerQuotationActionView,
    CustomerQuotationPdfView,
    CustomerPropertyListView,
    CustomerPropertyDetailView,
    CustomerPropertyMeasurementPdfView,
    CustomerDetailView,
    CustomerWorkHistoryListCreateView,
    WorkPhotoListCreateView,
    PropertyRoomListCreateView,
    QuotationDetailView,
    QuotationPdfView,
    QuotationPreviewPdfView,
    PropertyDetailView,
    PropertyMeasurementPdfView,
    PropertyMeasurementListCreateView,
    PropertyMeasurementDetailView,
    PropertyMeasurementSubmitView,
    PropertyRoomDetailView,
    QuotationRoomSyncView,
    MeasurementSurfaceListCreateView,
    MeasurementSurfaceDetailView,
    MeasurementOpeningListCreateView,
    MeasurementOpeningDetailView,
    RoomMeasurementSaveView,
    AreaDetailView,
    PaintTypeDetailView,
    PaintBrandDetailView,
    ActivityLogListView, ActivityLogSummaryView, ActivityLogExportView, ActivityLogReviewView,
    GlobalSearchView,
    ApartmentCommunitySearchView,
    ApartmentCommunityMasterView, ApartmentCommunityMasterDetailView, MasterDataImportView, MasterDataReorderView,
    CustomerMobileCheckView,
    CustomerShareLinkCreateView,
    CustomerShareLinkView,
    ContractorCustomerConnectionRequestView,
    ContractorCustomerConnectionListView,
    CustomerConnectionRequestListView,
    CustomerContractorSearchView,
    CustomerContractorConnectView,
    CustomerConnectionRequestDetailView,
    CustomerConnectionAcceptView,
    CustomerConnectionRejectView,
    CustomerContractorDisconnectView,
    CustomerContractorBlockView,
    CustomerContractorConnectBackView,
    CustomerContractorUnblockView,
    AdminCustomerConnectionListView,
    AdminCustomerConnectionAuditView,
    WorkChangeListCreateView, WorkChangeDetailView, WorkChangeSendView,
    CustomerWorkChangeActionView, WorkChangeCancelView, WorkChangeScopeView,
)
from .views import InvoiceListCreateView, InvoiceDetailView, InvoicePdfView, InvoiceReceiptPdfView, InvoicePaymentListCreateView, InvoicePaymentDetailView, CustomerInvoiceListView, CustomerInvoicePdfView, CustomerInvoiceReceiptPdfView
from .views import ClientSearchView, SiteVisitListCreateView, SiteVisitDetailView


urlpatterns = [
    path("push-subscription/", WebPushSubscriptionView.as_view(), name="push-subscription"),
    path("project-scopes/", ProjectScopeViewSet.as_view({"get": "list", "post": "create"}), name="project-scope-list-create"),
    path("project-scopes/<int:pk>/", ProjectScopeViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}), name="project-scope-detail"),
    path("contractor-connections/", ContractorConnectionListCreateView.as_view(), name="contractor-connection-list-create"),
    path("contractor-connections/<int:pk>/<str:action>/", ContractorConnectionActionView.as_view(), name="contractor-connection-action"),
    path("work-changes/", WorkChangeListCreateView.as_view(), name="work-change-list-create"),
    path("work-changes/<int:pk>/", WorkChangeDetailView.as_view(), name="work-change-detail"),
    path("work-changes/<int:pk>/send/", WorkChangeSendView.as_view(), name="work-change-send"),
    path("work-changes/<int:pk>/cancel/", WorkChangeCancelView.as_view(), name="work-change-cancel"),
    path("customer-portal/work-changes/<int:pk>/<str:action>/", CustomerWorkChangeActionView.as_view(), name="customer-work-change-action"),
    path("<int:quotation_id>/current-scope/", WorkChangeScopeView.as_view(), name="work-change-current-scope"),
    path("customers/check-mobile/", CustomerMobileCheckView.as_view(), name="customer-check-mobile"),
    path("customers/<int:pk>/share-link/", CustomerShareLinkCreateView.as_view(), name="customer-share-link-create"),
    path("customer-link/<str:token>/", CustomerShareLinkView.as_view(), name="customer-share-link"),
    path("properties/<int:property_id>/invitations/", PropertyInvitationListCreateView.as_view(), name="property-invitation-list-create"),
    path("properties/<int:property_id>/share-search/", PropertyShareLookupView.as_view(), name="property-share-search"),
    path("properties/<int:property_id>/share/", PropertyShareView.as_view(), name="property-share"),
    path("customer-portal/property-share-requests/", CustomerPropertyShareRequestListView.as_view(), name="customer-property-share-request-list"),
    path("customer-portal/property-share-requests/<int:contact_id>/respond/", CustomerPropertyShareRequestRespondView.as_view(), name="customer-property-share-request-respond"),
    path("property-invitations/token/<str:token>/", PropertyInvitationTokenView.as_view(), name="property-invitation-token"),
    path("property-invitations/token/<str:token>/accept/", PropertyInvitationAcceptView.as_view(), name="property-invitation-accept"),
    path("property-invitations/<int:invitation_id>/revoke/", PropertyInvitationRevokeView.as_view(), name="property-invitation-revoke"),
    path("properties/<int:property_id>/contacts/<str:action>/", PropertyContactActionView.as_view(), name="property-contact-action"),
    path("contractor/customer-connections/request/", ContractorCustomerConnectionRequestView.as_view(), name="contractor-customer-connection-request"),
    path("contractor/customer-connections/", ContractorCustomerConnectionListView.as_view(), name="contractor-customer-connections"),
    path("customer/connection-requests/", CustomerConnectionRequestListView.as_view(), name="customer-connection-requests"),
    path("customer/contractors/search/", CustomerContractorSearchView.as_view(), name="customer-contractor-search"),
    path("customer/contractors/connect/", CustomerContractorConnectView.as_view(), name="customer-contractor-connect"),
    path("customer/contractors/", CustomerConnectionRequestListView.as_view(), name="customer-contractors"),
    path("customer/connection-requests/<int:pk>/", CustomerConnectionRequestDetailView.as_view(), name="customer-connection-request-detail"),
    path("customer/connection-requests/<int:pk>/accept/", CustomerConnectionAcceptView.as_view(), name="customer-connection-request-accept"),
    path("customer/connection-requests/<int:pk>/reject/", CustomerConnectionRejectView.as_view(), name="customer-connection-request-reject"),
    path("customer/contractors/<int:pk>/disconnect/", CustomerContractorDisconnectView.as_view(), name="customer-contractor-disconnect"),
    path("customer/contractors/<int:pk>/block/", CustomerContractorBlockView.as_view(), name="customer-contractor-block"),
    path("customer/connection-requests/<int:pk>/connect-back/", CustomerContractorConnectBackView.as_view(), name="customer-connect-back"),
    path("customer/connection-requests/<int:pk>/unblock/", CustomerContractorUnblockView.as_view(), name="customer-contractor-unblock"),
    path("admin/customer-connections/", AdminCustomerConnectionListView.as_view(), name="admin-customer-connections"),
    path("admin/customer-connections/<int:pk>/audit/", AdminCustomerConnectionAuditView.as_view(), name="admin-customer-connection-audit"),
    path("invoices/", InvoiceListCreateView.as_view(), name="invoice-list-create"),
    path("invoices/<int:pk>/", InvoiceDetailView.as_view(), name="invoice-detail"),
    path("invoices/<int:pk>/pdf/", InvoicePdfView.as_view(), name="invoice-pdf"),
    path("invoices/<int:pk>/receipt/", InvoiceReceiptPdfView.as_view(), name="invoice-receipt-pdf"),
    path("invoices/<int:pk>/payments/", InvoicePaymentListCreateView.as_view(), name="invoice-payment-list-create"),
    path("invoices/<int:pk>/payments/<int:payment_pk>/", InvoicePaymentDetailView.as_view(), name="invoice-payment-detail"),
    path("customer-portal/invoices/", CustomerInvoiceListView.as_view(), name="customer-invoice-list"),
    path("customer-portal/invoices/<int:pk>/pdf/", CustomerInvoicePdfView.as_view(), name="customer-invoice-pdf"),
    path("customer-portal/invoices/<int:pk>/receipt/", CustomerInvoiceReceiptPdfView.as_view(), name="customer-invoice-receipt-pdf"),
    path("activity-logs/", ActivityLogListView.as_view(), name="activity-log-list"),
    path("activity-logs/summary/", ActivityLogSummaryView.as_view(), name="activity-log-summary"),
    path("activity-logs/export/", ActivityLogExportView.as_view(), name="activity-log-export"),
    path("activity-logs/<int:pk>/review/", ActivityLogReviewView.as_view(), name="activity-log-review"),
    path("global-search/", GlobalSearchView.as_view(), name="global-search"),
    path("apartment-communities/", ApartmentCommunitySearchView.as_view(), name="apartment-community-search"),
    path("master-data/apartments/", ApartmentCommunityMasterView.as_view(), name="master-apartments"),
    path("master-data/apartments/<int:pk>/", ApartmentCommunityMasterDetailView.as_view(), name="master-apartment-detail"),
    path("master-data/import/<str:section>/", MasterDataImportView.as_view(), name="master-data-import"),
path("master-data/<str:section>/reorder/", MasterDataReorderView.as_view(), name="master-data-reorder"),

    path("admin-dashboard/", AdminOperationsDashboardView.as_view(), name="admin-operations-dashboard"),
    path("admin-dashboard/export/", AdminPeopleExportView.as_view(), name="admin-people-export"),
    path("admin-dashboard/release-deleted-customer-mobiles/", AdminReleaseDeletedCustomerMobilesView.as_view(), name="admin-release-deleted-customer-mobiles"),
    path("admin-dashboard/release-inactive-business-mobiles/", AdminReleaseInactiveBusinessMobilesView.as_view(), name="admin-release-inactive-business-mobiles"),
    path("support-staff/", AdminSupportStaffView.as_view(), name="support-staff"),
    path("support-staff/<int:pk>/", AdminSupportStaffDetailView.as_view(), name="support-staff-detail"),
    path("support-workspace/search/", SupportSearchView.as_view(), name="support-workspace-search"),
    path("support-workspace/actions/", SupportActionView.as_view(), name="support-workspace-actions"),
    path("support-workspace/audit/", SupportAuditView.as_view(), name="support-workspace-audit"),
    path("admin-integrations/google-maps/", AdminGoogleMapsKeyView.as_view(), name="admin-google-maps-key"),
    path("admin-dashboard/<str:entity>/", AdminEntityListCreateView.as_view(), name="admin-entity-create"),
    path("admin-dashboard/<str:entity>/<int:pk>/", AdminEntityDetailView.as_view(), name="admin-entity-detail"),
    path("properties/<int:pk>/measurements/pdf/", PropertyMeasurementPdfView.as_view(), name="property-measurement-pdf"),
    path("properties/<int:property_id>/measurement-records/", PropertyMeasurementListCreateView.as_view(), name="property-measurement-records"),
    path("measurement-records/<int:pk>/submit/", PropertyMeasurementSubmitView.as_view(), name="property-measurement-submit"),
    path("measurement-records/<int:pk>/", PropertyMeasurementDetailView.as_view(), name="property-measurement-record-detail"),

    path("<int:pk>/pdf/", QuotationPdfView.as_view(), name="quotation-pdf"),
    path("customers/bulk-import/", CustomerBulkImportView.as_view(), name="customer-bulk-import"),
    path("tasks/", CustomerTaskListView.as_view(), name="customer-task-list"),
    path("tasks/<int:pk>/", CustomerTaskCompleteView.as_view(), name="customer-task-complete"),
    path("chat/conversations/", ChatConversationListView.as_view(), name="chat-conversations"),
    path("chat/contacts/", ChatContactListView.as_view(), name="chat-contacts"),
    path("chat/colours/", ChatColourListView.as_view(), name="chat-colours"),
    path("colour-comparison/draft/", ColourComparisonDraftView.as_view(), name="colour-comparison-draft"),
    path("chat/conversations/<int:pk>/messages/", ChatMessageListCreateView.as_view(), name="chat-messages"),
    path("chat/conversations/<int:pk>/safety/", ChatConversationSafetyView.as_view(), name="chat-conversation-safety"),
    path("chat/messages/<int:pk>/", ChatMessageDetailView.as_view(), name="chat-message-detail"),
    path("chat/messages/<int:pk>/forward/", ChatMessageForwardView.as_view(), name="chat-message-forward"),
    path("chat/attachments/<int:pk>/", ChatAttachmentDownloadView.as_view(), name="chat-attachment-download"),
    path("service-requests/", ServiceRequestListCreateView.as_view(), name="service-request-list"),
    path("service-requests/options/", ServiceRequestOptionsView.as_view(), name="service-request-options"),
    path("service-requests/<int:pk>/", ServiceRequestDetailView.as_view(), name="service-request-detail"),
    path("leads/", LeadListCreateView.as_view(), name="lead-list"),
    path("leads/<int:pk>/", LeadDetailView.as_view(), name="lead-detail"),
    path("clients/search/", ClientSearchView.as_view(), name="client-search"),
    path("site-visits/", SiteVisitListCreateView.as_view(), name="site-visit-list"),
    path("site-visits/<int:pk>/", SiteVisitDetailView.as_view(), name="site-visit-detail"),
    path("support-tickets/", SupportTicketListCreateView.as_view(), name="support-ticket-list"),
    path("support-tickets/public/", PublicSupportTicketView.as_view(), name="support-ticket-public"),
    path("support-tickets/<int:pk>/", SupportTicketDetailView.as_view(), name="support-ticket-detail"),
    path("customer-portal/dashboard/", CustomerPortalDashboardView.as_view(), name="customer-portal-dashboard"),
    path("contractor-crm/dashboard/", ContractorCrmDashboardView.as_view(), name="contractor-crm-dashboard"),
    path("measurement-access/availability/", MeasurementAccessAvailabilityView.as_view(), name="measurement-access-availability"),
    path("measurement-access/contractors/", MeasurementAccessContractorSearchView.as_view(), name="measurement-access-contractors"),
    path("measurement-access/", MeasurementAccessListCreateView.as_view(), name="measurement-access-list"),
    path("measurement-access/<int:pk>/", MeasurementAccessDetailView.as_view(), name="measurement-access-detail"),
    path("measurement-access/<int:pk>/measurements/", ApprovedMeasurementView.as_view(), name="approved-measurements"),
    path("measurement-access/<int:pk>/prepare-quotation/", MeasurementAccessPrepareQuotationView.as_view(), name="measurement-access-prepare-quotation"),
    path("portal-notifications/", PortalNotificationCountsView.as_view(), name="portal-notification-counts"),
    path("notifications/", PortalNotificationListView.as_view(), name="portal-notifications"),
    path("customer-portal/quotations/<int:pk>/", CustomerQuotationView.as_view(), name="customer-quotation-detail"),
    path("customer-portal/quotations/", CustomerQuotationListView.as_view(), name="customer-quotation-list"),
    path("customer-portal/quotations/<int:pk>/action/", CustomerQuotationActionView.as_view(), name="customer-quotation-action"),
    path("customer-portal/quotations/<int:pk>/pdf/", CustomerQuotationPdfView.as_view(), name="customer-quotation-pdf"),
    path("customer-portal/properties/", CustomerPropertyListView.as_view(), name="customer-property-list"),
    path("customer-portal/properties/<int:pk>/", CustomerPropertyDetailView.as_view(), name="customer-property-detail"),
    path("customer-portal/properties/<int:pk>/measurements/pdf/", CustomerPropertyMeasurementPdfView.as_view(), name="customer-property-measurement-pdf"),
    path("<int:pk>/submit/", QuotationSubmitView.as_view(), name="quotation-submit"),

    path(
        "areas/",
        AreaListCreateView.as_view(),
        name="area-list-create"
    ),
    path("areas/<int:pk>/", AreaDetailView.as_view(), name="area-detail"),
    path("measurement-surface-types/", MeasurementSurfaceTypeListCreateView.as_view(), name="measurement-surface-type-list-create"),
    path("measurement-surface-types/<int:pk>/", MeasurementSurfaceTypeDetailView.as_view(), name="measurement-surface-type-detail"),
    path("service-categories/", ServiceCategoryListCreateView.as_view(), name="service-category-list-create"),
    path("service-categories/<int:pk>/", ServiceCategoryDetailView.as_view(), name="service-category-detail"),
    path("work-descriptions/", WorkDescriptionListCreateView.as_view(), name="work-description-list-create"),
    path("work-descriptions/<int:pk>/", WorkDescriptionDetailView.as_view(), name="work-description-detail"),

    path(
        "service-types/",
        ServiceTypeListCreateView.as_view(),
        name="service-type-list-create"
    ),

    path(
        "paint-types/",
        PaintTypeListCreateView.as_view(),
        name="paint-type-list-create"
    ),
    path("paint-types/<int:pk>/", PaintTypeDetailView.as_view(), name="paint-type-detail"),

    path(
        "brands/",
        PaintBrandListCreateView.as_view(),
        name="paint-brand-list-create"
    ),
    path("brands/<int:pk>/", PaintBrandDetailView.as_view(), name="paint-brand-detail"),

    path(
        "colors/",
        PaintColorListCreateView.as_view(),
        name="paint-color-list-create"
    ),

    path(
        "units/",
        UnitListCreateView.as_view(),
        name="unit-list-create"
    ),
    path("units/<int:pk>/", UnitDetailView.as_view(), name="unit-detail"),

    path(
        "customers/",
        CustomerListCreateView.as_view(),
        name="customer-list-create"
    ),
    path("customers/<int:pk>/activate-account/", CustomerActivateAccountView.as_view(), name="customer-activate-account"),

    path(
        "properties/",
        PropertyListCreateView.as_view(),
        name="property-list-create"
    ),
    path(
        "service-types/<int:pk>/",
        ServiceTypeDetailView.as_view(),
        name="service-type-detail",
    ),

    path(
        "properties/<int:pk>/",
        PropertyDetailView.as_view(),
        name="property-detail",
    ),

    path(
        "",
        QuotationListCreateView.as_view(),
        name="quotation-list-create"
    ),

    path(
        "create/",
        QuotationCreateView.as_view(),
        name="quotation-create"
    ),
    path(
        "preview-pdf/",
        QuotationPreviewPdfView.as_view(),
        name="quotation-preview-pdf"
    ),

    path(
        "customers/<int:customer_id>/follow-ups/",
        CustomerFollowUpListCreateView.as_view(),
        name="customer-follow-ups"
    ),

    path(
        "customers/<int:pk>/",
        CustomerDetailView.as_view(),
        name="customer-detail",
    ),

    path(
        "customers/<int:customer_id>/work-history/",
        CustomerWorkHistoryListCreateView.as_view(),
        name="customer-work-history",
    ),

    path(
        "work-history/<int:work_history_id>/photos/",
        WorkPhotoListCreateView.as_view(),
        name="work-history-photos",
    ),

    path(
        "properties/<int:property_id>/rooms/",
        PropertyRoomListCreateView.as_view(),
        name="property-room-list-create",
),

    path(
        "rooms/<int:pk>/",
        PropertyRoomDetailView.as_view(),
        name="property-room-detail",
    ),

    path(
        "properties/<int:property_id>/measurements/",
        MeasurementSurfaceListCreateView.as_view(),
        name="measurement-surface-list-create",
    ),
    path(
        "measurements/<int:pk>/",
        MeasurementSurfaceDetailView.as_view(),
        name="measurement-surface-detail",
    ),
    path(
        "measurements/<int:surface_id>/openings/",
        MeasurementOpeningListCreateView.as_view(),
        name="measurement-opening-list-create",
    ),
    path(
        "measurement-openings/<int:pk>/",
        MeasurementOpeningDetailView.as_view(),
        name="measurement-opening-detail",
    ),
    path(
        "properties/<int:property_id>/room-measurement/save/",
        RoomMeasurementSaveView.as_view(),
        name="room-measurement-save",
    ),

    path(
        "<int:quotation_id>/rooms/sync/",
        QuotationRoomSyncView.as_view(),
        name="quotation-room-sync",
    ),



path(
        "<int:pk>/",
        QuotationDetailView.as_view(),
        name="quotation-detail"
    ),



]
```

## backend/billing/urls.py
```python
from django.urls import path
from .views import AdminPackageRequestView, AdminRevenueView, ContractorRevenueView, ContractorProjectReceiptView, ContractorProjectReceiptPdfView, CustomerProjectFinanceView, CustomerProjectReceiptPdfView, AdvertisementListView, BillingDocumentView, BillingNotificationView, ContractorPackageView, MyBillingView, PackageAssignmentView, PackagePaymentView, PlanDetailView, PlanListView

urlpatterns = [
    path("me/", MyBillingView.as_view()),
    path("plans/", PlanListView.as_view()),
    path("plans/<int:pk>/", PlanDetailView.as_view()),
    path("assignments/", PackageAssignmentView.as_view()),
    path("assignments/<int:pk>/", PackageAssignmentView.as_view()),
    path("contractor-packages/", ContractorPackageView.as_view()),
    path("package-requests/", AdminPackageRequestView.as_view()),
    path("package-requests/<int:pk>/payment/", PackagePaymentView.as_view()),
    path("package-requests/<int:pk>/document/", BillingDocumentView.as_view()),
    path("notifications/read/", BillingNotificationView.as_view()),
    path("revenue/", AdminRevenueView.as_view()),
    path("contractor-revenue/", ContractorRevenueView.as_view()),
    path("contractor-revenue/receipts/", ContractorProjectReceiptView.as_view()),
    path("contractor-revenue/receipts/<int:pk>/pdf/", ContractorProjectReceiptPdfView.as_view()),
    path("customer-finance/", CustomerProjectFinanceView.as_view()),
    path("customer-finance/receipts/<int:pk>/pdf/", CustomerProjectReceiptPdfView.as_view()),
    path("advertisements/", AdvertisementListView.as_view()),
]
```

## backend/outsourcing/urls.py
```python
from django.urls import path

from .views import (
    AdditionalWorkDecisionView,
    AdditionalWorkRequestView,
    WorkOrderAssignmentView,
    WorkOrderCorrectionView,
    WorkOrderDetailView,
    WorkOrderEventListView,
    WorkOrderInvoiceView,
    WorkOrderListCreateView,
    WorkOrderPaymentView,
    WorkOrderQuoteDecisionView,
    WorkOrderQuoteView,
    WorkOrderShareScopesView,
    WorkOrderTransitionView,
    WorkOrderWageView,
)

urlpatterns = [
    path("work-orders/", WorkOrderListCreateView.as_view(), name="work-order-list-create"),
    path("work-orders/<int:pk>/", WorkOrderDetailView.as_view(), name="work-order-detail"),
    path("work-orders/<int:pk>/transition/", WorkOrderTransitionView.as_view(), name="work-order-transition"),
    path("work-orders/<int:pk>/corrections/", WorkOrderCorrectionView.as_view(), name="work-order-correction"),
    path("work-orders/<int:pk>/scopes/", WorkOrderShareScopesView.as_view(), name="work-order-share-scopes"),
    path("work-orders/<int:pk>/assignments/", WorkOrderAssignmentView.as_view(), name="work-order-assignment"),
    path("work-orders/<int:pk>/wages/", WorkOrderWageView.as_view(), name="work-order-wage"),
    path("work-orders/<int:pk>/quotes/", WorkOrderQuoteView.as_view(), name="work-order-quote"),
    path("work-orders/<int:pk>/quote-decisions/", WorkOrderQuoteDecisionView.as_view(), name="work-order-quote-decision"),
    path("work-orders/<int:pk>/invoices/", WorkOrderInvoiceView.as_view(), name="work-order-invoice"),
    path("work-orders/<int:pk>/payments/", WorkOrderPaymentView.as_view(), name="work-order-payment"),
    path("work-orders/<int:pk>/additional-work/", AdditionalWorkRequestView.as_view(), name="work-order-additional-work"),
    path("work-orders/<int:pk>/additional-work/decisions/", AdditionalWorkDecisionView.as_view(), name="work-order-additional-work-decision"),
    path("work-orders/<int:pk>/events/", WorkOrderEventListView.as_view(), name="work-order-events"),
]
```
