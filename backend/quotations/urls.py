from django.urls import path

from .views import (
    AreaListCreateView,
    MeasurementSurfaceTypeListCreateView,
    MeasurementSurfaceTypeDetailView,
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
    QuotationListCreateView,
    QuotationCreateView,
    CustomerFollowUpListCreateView,
    CustomerTaskListView,
    CustomerTaskCompleteView,
    ChatConversationListView,
    ChatMessageListCreateView,
    ChatMessageDetailView,
    ServiceRequestListCreateView,
    ServiceRequestOptionsView,
    ServiceRequestDetailView,
    LeadListCreateView,
    LeadDetailView,
    SupportTicketListCreateView,
    SupportTicketDetailView,
    CustomerPortalDashboardView,
    ContractorCrmDashboardView,
    AdminOperationsDashboardView,
    AdminEntityListCreateView, AdminEntityDetailView, AdminPeopleExportView,
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
    CustomerMobileCheckView,
    ContractorCustomerConnectionRequestView,
    ContractorCustomerConnectionListView,
    CustomerConnectionRequestListView,
    CustomerConnectionRequestDetailView,
    CustomerConnectionAcceptView,
    CustomerConnectionRejectView,
    CustomerContractorDisconnectView,
    CustomerContractorBlockView,
    AdminCustomerConnectionListView,
    AdminCustomerConnectionAuditView,
    WorkChangeListCreateView, WorkChangeDetailView, WorkChangeSendView,
    CustomerWorkChangeActionView, WorkChangeCancelView, WorkChangeScopeView,
)
from .views import InvoiceListCreateView, InvoiceDetailView, InvoicePdfView, InvoiceReceiptPdfView, InvoicePaymentListCreateView, InvoicePaymentDetailView, CustomerInvoiceListView, CustomerInvoicePdfView, CustomerInvoiceReceiptPdfView
from .views import ClientSearchView, SiteVisitListCreateView, SiteVisitDetailView


urlpatterns = [
    path("work-changes/", WorkChangeListCreateView.as_view(), name="work-change-list-create"),
    path("work-changes/<int:pk>/", WorkChangeDetailView.as_view(), name="work-change-detail"),
    path("work-changes/<int:pk>/send/", WorkChangeSendView.as_view(), name="work-change-send"),
    path("work-changes/<int:pk>/cancel/", WorkChangeCancelView.as_view(), name="work-change-cancel"),
    path("customer-portal/work-changes/<int:pk>/<str:action>/", CustomerWorkChangeActionView.as_view(), name="customer-work-change-action"),
    path("<int:quotation_id>/current-scope/", WorkChangeScopeView.as_view(), name="work-change-current-scope"),
    path("customers/check-mobile/", CustomerMobileCheckView.as_view(), name="customer-check-mobile"),
    path("contractor/customer-connections/request/", ContractorCustomerConnectionRequestView.as_view(), name="contractor-customer-connection-request"),
    path("contractor/customer-connections/", ContractorCustomerConnectionListView.as_view(), name="contractor-customer-connections"),
    path("customer/connection-requests/", CustomerConnectionRequestListView.as_view(), name="customer-connection-requests"),
    path("customer/contractors/", CustomerConnectionRequestListView.as_view(), name="customer-contractors"),
    path("customer/connection-requests/<int:pk>/", CustomerConnectionRequestDetailView.as_view(), name="customer-connection-request-detail"),
    path("customer/connection-requests/<int:pk>/accept/", CustomerConnectionAcceptView.as_view(), name="customer-connection-request-accept"),
    path("customer/connection-requests/<int:pk>/reject/", CustomerConnectionRejectView.as_view(), name="customer-connection-request-reject"),
    path("customer/contractors/<int:pk>/disconnect/", CustomerContractorDisconnectView.as_view(), name="customer-contractor-disconnect"),
    path("customer/contractors/<int:pk>/block/", CustomerContractorBlockView.as_view(), name="customer-contractor-block"),
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

    path("admin-dashboard/", AdminOperationsDashboardView.as_view(), name="admin-operations-dashboard"),
    path("admin-dashboard/export/", AdminPeopleExportView.as_view(), name="admin-people-export"),
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
    path("chat/conversations/<int:pk>/messages/", ChatMessageListCreateView.as_view(), name="chat-messages"),
    path("chat/messages/<int:pk>/", ChatMessageDetailView.as_view(), name="chat-message-detail"),
    path("service-requests/", ServiceRequestListCreateView.as_view(), name="service-request-list"),
    path("service-requests/options/", ServiceRequestOptionsView.as_view(), name="service-request-options"),
    path("service-requests/<int:pk>/", ServiceRequestDetailView.as_view(), name="service-request-detail"),
    path("leads/", LeadListCreateView.as_view(), name="lead-list"),
    path("leads/<int:pk>/", LeadDetailView.as_view(), name="lead-detail"),
    path("clients/search/", ClientSearchView.as_view(), name="client-search"),
    path("site-visits/", SiteVisitListCreateView.as_view(), name="site-visit-list"),
    path("site-visits/<int:pk>/", SiteVisitDetailView.as_view(), name="site-visit-detail"),
    path("support-tickets/", SupportTicketListCreateView.as_view(), name="support-ticket-list"),
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
