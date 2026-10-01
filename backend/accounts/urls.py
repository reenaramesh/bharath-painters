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
    ContractorDirectoryView,
    PainterDirectoryView,
    RegistrationLegalDocumentView,
    VerifyBharathIDView, VerifyBharathIDPageView,
)

urlpatterns = [
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
