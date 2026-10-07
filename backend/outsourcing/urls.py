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
