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
