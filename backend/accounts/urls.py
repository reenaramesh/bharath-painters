from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    PainterRegistrationView,
    ContractorRegistrationView,
    CustomerRegistrationView,
    ForgotPasswordLookupView,
    ForgotPasswordRequestView,
    ForgotPasswordVerifyView,
    ForgotPasswordConfirmView,
    RecoveryEmailView,
    RecoveryEmailRequestView,
    RecoveryEmailVerifyView,
    LoginView,
    CurrentUserView,
    ProfileCardView,
    ContractorProfileView,
    ContractorDirectoryView,
    PainterDirectoryView,
    VerifyBharathIDView, VerifyBharathIDPageView,
)

urlpatterns = [
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
    path("register/customer/", CustomerRegistrationView.as_view(), name="register-customer"),
    path("forgot-password/lookup/", ForgotPasswordLookupView.as_view(), name="forgot-password-lookup"),
    path("forgot-password/request/", ForgotPasswordRequestView.as_view(), name="forgot-password-request"),
    path("forgot-password/verify/", ForgotPasswordVerifyView.as_view(), name="forgot-password-verify"),
    path("forgot-password/confirm/", ForgotPasswordConfirmView.as_view(), name="forgot-password-confirm"),
    path("recovery-email/", RecoveryEmailView.as_view(), name="recovery-email"),
    path("recovery-email/request/", RecoveryEmailRequestView.as_view(), name="recovery-email-request"),
    path("recovery-email/verify/", RecoveryEmailVerifyView.as_view(), name="recovery-email-verify"),

    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("profile-card/", ProfileCardView.as_view(), name="profile-card"),
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
