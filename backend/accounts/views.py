from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.db import transaction
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.utils import timezone
from datetime import timedelta
import secrets

from .models import BharathUser, ContractorProfile, PainterProfile, PasswordResetOTP, UserLegalConsent
from .legal import POLICY_VERSION, document_hashes, registration_legal_payload
from .utils import activate_business_identity, bharath_profile_url, generate_bharath_qr
from django.shortcuts import render

from .serializers import (
    PainterRegistrationSerializer,
    ContractorRegistrationSerializer, ContractorProfileSerializer,
)


RECOVERY_ROLES = {
    BharathUser.Roles.CUSTOMER,
    BharathUser.Roles.CONTRACTOR,
    BharathUser.Roles.PAINTER,
}
OTP_EXPIRY_MINUTES = 10
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_PER_HOUR = 5
PASSWORD_RESET_SIGNING_SALT = "bharath-painters-password-reset"


def _truthy(value):
    return value is True or str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _registration_consent_error(request):
    if str(request.data.get("policy_version") or "") != POLICY_VERSION:
        return {"policy_version": "Please review the current Terms and Privacy Notice."}
    if not _truthy(request.data.get("document_scrolled")):
        return {"document_scrolled": "Scroll through the complete Terms and Privacy Notice before registering."}
    if not _truthy(request.data.get("terms_accepted")):
        return {"terms_accepted": "You must accept the Terms of Use to register."}
    if not _truthy(request.data.get("privacy_notice_acknowledged")):
        return {"privacy_notice_acknowledged": "You must acknowledge the Privacy and Data Protection Notice."}
    return None


def _record_registration_consent(user, request, role):
    terms_hash, privacy_hash = document_hashes(role)
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    ip_address = (forwarded or str(request.META.get("REMOTE_ADDR") or "").strip())[:45]
    UserLegalConsent.objects.update_or_create(
        user=user,
        policy_version=POLICY_VERSION,
        defaults={
            "role_at_acceptance": role,
            "terms_hash": terms_hash,
            "privacy_hash": privacy_hash,
            "terms_accepted": True,
            "privacy_notice_acknowledged": True,
            "document_scrolled": True,
            "acceptance_method": "REGISTRATION_CHECKBOX",
            "ip_address": ip_address,
            "user_agent": str(request.META.get("HTTP_USER_AGENT") or "")[:1000],
        },
    )


class RegistrationLegalDocumentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        role = str(request.query_params.get("role") or "").upper()
        if role not in {
            BharathUser.Roles.CUSTOMER,
            BharathUser.Roles.CONTRACTOR,
            BharathUser.Roles.PAINTER,
        }:
            return Response({"role": "Choose CUSTOMER, CONTRACTOR or PAINTER."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(registration_legal_payload(role))


def _normalise_mobile(value):
    return str(value or "").strip()


def _mobile_key(value):
    return "".join(character for character in str(value or "") if character.isdigit())[-10:]


def _find_user_by_mobile(mobile, queryset=None):
    queryset = queryset if queryset is not None else BharathUser.objects.all()
    exact = queryset.filter(mobile=_normalise_mobile(mobile)).first()
    if exact:
        return exact
    key = _mobile_key(mobile)
    if len(key) != 10:
        return None
    matches = [user for user in queryset if _mobile_key(user.mobile) == key]
    # Never guess when legacy formatting has produced more than one account.
    return matches[0] if len(matches) == 1 else None


def _user_display_name(user):
    full_name = user.get_full_name().strip()
    if user.role == BharathUser.Roles.CONTRACTOR:
        profile = getattr(user, "contractor_profile", None)
        return (profile.company_name.strip() if profile and profile.company_name else full_name) or user.mobile
    if user.role == BharathUser.Roles.CUSTOMER:
        customer = getattr(user, "customer_profiles", None)
        return (customer.name.strip() if customer and customer.name else full_name) or user.mobile
    return full_name or user.mobile


def _masked_email(value):
    local, separator, domain = str(value or "").partition("@")
    if not separator:
        return ""
    shown = local[: min(3, len(local))]
    stars = "*" * max(3, len(local) - len(shown))
    return f"{shown}{stars}@{domain}"


def _masked_mobile(value):
    value = str(value or "")
    return f"{'*' * max(0, len(value) - 4)}{value[-4:]}"


def _recovery_user(mobile, role):
    if role not in RECOVERY_ROLES:
        return None
    return _find_user_by_mobile(
        mobile,
        BharathUser.objects.filter(role=role, is_active=True),
    )


def _issue_email_otp(user, purpose, target_email):
    recent_hour = PasswordResetOTP.objects.filter(
        user=user,
        purpose=purpose,
        created_at__gte=timezone.now() - timedelta(hours=1),
    ).count()
    if recent_hour >= OTP_MAX_PER_HOUR:
        return None, "Too many verification codes requested. Please try again later."
    recent = PasswordResetOTP.objects.filter(
        user=user,
        purpose=purpose,
        created_at__gte=timezone.now() - timedelta(seconds=OTP_RESEND_SECONDS),
    ).exists()
    if recent:
        return None, "Please wait one minute before requesting another code."
    PasswordResetOTP.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)
    code = f"{secrets.randbelow(1000000):06d}"
    challenge = PasswordResetOTP.objects.create(
        user=user,
        purpose=purpose,
        target_email=target_email,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    try:
        send_mail(
            "Your Bharath Painters verification code",
            f"Your Bharath Painters verification code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes. Do not share this code.",
            settings.DEFAULT_FROM_EMAIL,
            [target_email],
            fail_silently=False,
        )
    except Exception:
        challenge.delete()
        return None, "Verification email could not be sent. Please try again later."
    return (challenge, code), None


def _verify_otp(challenge, code):
    if challenge.is_used or challenge.expires_at < timezone.now() or challenge.attempts >= OTP_MAX_ATTEMPTS:
        return "The verification code is invalid or expired."
    if not check_password(code, challenge.code_hash):
        challenge.attempts += 1
        if challenge.attempts >= OTP_MAX_ATTEMPTS:
            challenge.is_used = True
        challenge.save(update_fields=("attempts", "is_used"))
        return "The verification code is incorrect."
    challenge.verified_at = timezone.now()
    challenge.save(update_fields=("verified_at",))
    return None


class PainterRegistrationView(APIView):

    @transaction.atomic
    def post(self, request):

        consent_error = _registration_consent_error(request)
        if consent_error:
            return Response(consent_error, status=status.HTTP_400_BAD_REQUEST)

        serializer = PainterRegistrationSerializer(
            data=request.data
        )

        if serializer.is_valid():

            user = serializer.save()
            activate_business_identity(user, request.build_absolute_uri("/").rstrip("/"))
            _record_registration_consent(user, request, BharathUser.Roles.PAINTER)

            return Response(
                {
                    "message": "Paint Applicator registration successful.",
                    "user_id": user.id,
                    "mobile": user.mobile,
                    "verification_status": user.verification_status,
                    "bharath_id": user.bharath_id,
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class ContractorRegistrationView(APIView):

    @transaction.atomic
    def post(self, request):

        consent_error = _registration_consent_error(request)
        if consent_error:
            return Response(consent_error, status=status.HTTP_400_BAD_REQUEST)

        serializer = ContractorRegistrationSerializer(
            data=request.data
        )

        if serializer.is_valid():

            user = serializer.save()
            activate_business_identity(user, request.build_absolute_uri("/").rstrip("/"))
            _record_registration_consent(user, request, BharathUser.Roles.CONTRACTOR)

            return Response(
                {
                    "message": "Contractor registration successful.",
                    "user_id": user.id,
                    "mobile": user.mobile,
                    "verification_status": user.verification_status,
                    "bharath_id": user.bharath_id,
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class CustomerRegistrationView(APIView):
    @transaction.atomic
    def post(self, request):
        from quotations.models import ChatConversation, Customer, ContractorCustomerConnection, normalize_indian_mobile

        consent_error = _registration_consent_error(request)
        if consent_error:
            return Response(consent_error, status=status.HTTP_400_BAD_REQUEST)

        mobile = str(request.data.get("mobile") or "").strip()
        name = str(request.data.get("name") or "").strip()
        email = str(request.data.get("email") or "").strip()
        password = str(request.data.get("password") or "")
        mobile_key = "".join(character for character in mobile if character.isdigit())[-10:]
        if len(mobile_key) != 10:
            return Response({"mobile": "Enter a valid 10-digit mobile number."}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({"name": "Name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)

        normalized_mobile = normalize_indian_mobile(mobile)
        customer_records = list(Customer.objects.select_related("portal_user").filter(normalized_mobile=normalized_mobile))
        if not customer_records:
            return Response(
                {"mobile": "This mobile number is not registered by a contractor yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = BharathUser.objects.filter(mobile=mobile).first()
        if not user:
            user = next((item.portal_user for item in customer_records if item.portal_user), None)
        if user and user.role != BharathUser.Roles.CUSTOMER:
            return Response({"mobile": "This mobile belongs to another account type."}, status=status.HTTP_400_BAD_REQUEST)
        if user and user.has_usable_password():
            return Response({"mobile": "A customer account already exists. Please sign in."}, status=status.HTTP_400_BAD_REQUEST)
        if not user:
            user = BharathUser(mobile=mobile, role=BharathUser.Roles.CUSTOMER)
        primary_customer = customer_records[0]
        if not primary_customer.bharath_id:
            primary_customer.bharath_id = f"BP-C-{primary_customer.pk:06d}"
            primary_customer.save(update_fields=("bharath_id", "updated_at"))
        user.first_name = name
        user.email = email
        user.is_active = True
        user.is_verified = True
        user.verification_status = BharathUser.VerificationStatus.VERIFIED
        if not user.bharath_id:
            user.bharath_id = primary_customer.bharath_id
        if not user.verified_at:
            user.verified_at = timezone.now()
        if not user.badge_issued_at:
            user.badge_issued_at = timezone.now()
        user.set_password(password)
        user.save()
        generate_bharath_qr(user, request.build_absolute_uri("/").rstrip("/"))
        user.save(update_fields=("bharath_qr",))
        _record_registration_consent(user, request, BharathUser.Roles.CUSTOMER)

        for customer in customer_records:
            customer.portal_user = user
            customer.save(update_fields=("portal_user",))
            if customer.contractor_id:
                now = timezone.now()
                connection, _ = ContractorCustomerConnection.objects.get_or_create(
                    customer=customer, contractor_id=customer.contractor_id,
                    defaults={
                        "status": ContractorCustomerConnection.Status.CONNECTED,
                        "requested_by_id": customer.contractor_id,
                        "approval_method": ContractorCustomerConnection.ApprovalMethod.INITIAL_CREATOR,
                        "connected_at": now, "approved_at": now,
                        "customer_status": customer.status,
                        "customer_source": customer.source,
                        "customer_client_type": customer.client_type,
                        "requirement": customer.requirement,
                        "internal_notes": customer.notes,
                        "next_follow_up": customer.next_follow_up,
                    },
                )
            else:
                connection = None
            for connection in customer.contractor_connections.filter(status="CONNECTED"):
                ChatConversation.objects.get_or_create(
                    customer=customer, contractor=connection.contractor,
                    defaults={"connection": connection},
                )

        return Response({"message": "Customer account created. You can now sign in."}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):

        mobile = request.data.get("mobile")
        password = request.data.get("password")

        if not mobile or not password:
            return Response(
                {
                    "error": "Mobile and password are required."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        user = _find_user_by_mobile(mobile, BharathUser.objects.all())
        if not user:
            return Response(
                {
                    "error": "Invalid mobile number or password."
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.check_password(password):
            return Response(
                {
                    "error": "Invalid mobile number or password."
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {
                    "error": "Your account is inactive."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if user.role in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            activate_business_identity(user, request.build_absolute_uri("/").rstrip("/"))

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "message": "Login successful.",
                "user": {
                    "id": user.id,
                    "mobile": user.mobile,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": user.role,
                    "is_verified": user.is_verified,
                    "verification_status": user.verification_status,
                    "bharath_id": user.bharath_id,
                    "preferred_language": user.preferred_language,
                    "display_name": _user_display_name(user),
                },
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_200_OK
        )    


class ForgotPasswordLookupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery_lookup"

    def post(self, request):
        mobile = _normalise_mobile(request.data.get("mobile"))
        role = str(request.data.get("role") or BharathUser.Roles.CUSTOMER).upper()
        user = _recovery_user(mobile, role)
        if not user:
            return Response(
                {"detail": "Account not found. Please check your registered mobile number."},
                status=status.HTTP_404_NOT_FOUND,
            )
        can_reset = bool(user.recovery_email and user.recovery_email_verified)
        return Response(
            {
                "can_reset": can_reset,
                "masked_email": _masked_email(user.recovery_email) if can_reset else "",
                "masked_mobile": _masked_mobile(user.mobile),
                "bharath_id": user.bharath_id,
                "message": (
                    "Verified recovery email found."
                    if can_reset
                    else "No Recovery Email Added"
                ),
            }
        )


class ForgotPasswordRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery_request"

    def post(self, request):
        mobile = _normalise_mobile(request.data.get("mobile"))
        role = str(request.data.get("role") or BharathUser.Roles.CUSTOMER).upper()
        user = _recovery_user(mobile, role)
        if not user:
            return Response(
                {"detail": "Account not found. Please check your registered mobile number."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.recovery_email or not user.recovery_email_verified:
            return Response(
                {"detail": "No Recovery Email Added. Sign in and verify a recovery email from Account Security."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result, error = _issue_email_otp(
            user, PasswordResetOTP.Purpose.PASSWORD_RESET, user.recovery_email
        )
        if error:
            response_status = status.HTTP_429_TOO_MANY_REQUESTS if error.startswith(("Please wait", "Too many")) else status.HTTP_503_SERVICE_UNAVAILABLE
            return Response({"detail": error}, status=response_status)
        challenge, code = result
        response = {
            "message": "OTP sent to your verified recovery email.",
            "masked_email": _masked_email(user.recovery_email),
            "challenge_id": challenge.id,
        }
        if settings.DEBUG and settings.EMAIL_BACKEND in {
            "django.core.mail.backends.console.EmailBackend",
            "django.core.mail.backends.locmem.EmailBackend",
        }:
            response["test_otp"] = code
        return Response(response)


class ForgotPasswordVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery_verify"

    def post(self, request):
        code = str(request.data.get("otp") or "").strip()
        reset = PasswordResetOTP.objects.filter(
            id=request.data.get("challenge_id"),
            purpose=PasswordResetOTP.Purpose.PASSWORD_RESET,
            is_used=False,
        ).select_related("user").first()
        if not reset:
            return Response({"detail": "The verification code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        if (
            not reset.target_email
            or not reset.user.recovery_email_verified
            or reset.target_email.lower() != str(reset.user.recovery_email or "").lower()
        ):
            reset.is_used = True
            reset.save(update_fields=("is_used",))
            return Response({"detail": "The verification code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        error = _verify_otp(reset, code)
        if error:
            return Response({"otp": error}, status=status.HTTP_400_BAD_REQUEST)
        token = signing.dumps(
            {"challenge_id": reset.id, "user_id": reset.user_id},
            salt=PASSWORD_RESET_SIGNING_SALT,
        )
        return Response({"message": "OTP verified.", "reset_token": token})


class ForgotPasswordConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_confirm"

    @transaction.atomic
    def post(self, request):
        new_password = str(request.data.get("new_password") or "")
        confirm_password = str(request.data.get("confirm_password") or "")
        if new_password != confirm_password:
            return Response({"confirm_password": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            signed = signing.loads(
                str(request.data.get("reset_token") or ""),
                salt=PASSWORD_RESET_SIGNING_SALT,
                max_age=OTP_EXPIRY_MINUTES * 60,
            )
        except (BadSignature, SignatureExpired):
            return Response({"detail": "The password reset session is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        reset = PasswordResetOTP.objects.select_for_update().filter(
            id=signed.get("challenge_id"),
            user_id=signed.get("user_id"),
            purpose=PasswordResetOTP.Purpose.PASSWORD_RESET,
            is_used=False,
            verified_at__isnull=False,
        ).select_related("user").first()
        if not reset or reset.expires_at < timezone.now():
            return Response({"detail": "The password reset session is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        user = reset.user
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as error:
            return Response({"new_password": list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=("password",))
        reset.is_used = True
        reset.save(update_fields=("is_used",))
        PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)
        return Response({"message": "Password reset successful. You can now sign in."})


class RecoveryEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "has_recovery_email": bool(user.recovery_email),
            "verified": user.recovery_email_verified,
            "masked_email": _masked_email(user.recovery_email),
            "verified_at": user.recovery_email_verified_at,
            "bharath_id": user.bharath_id,
            "masked_mobile": _masked_mobile(user.mobile),
        })


class RecoveryEmailRequestView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery_request"

    def post(self, request):
        user = request.user
        if user.role not in RECOVERY_ROLES:
            return Response({"detail": "Recovery email is available for customers, contractors and Paint Applicators."}, status=status.HTTP_403_FORBIDDEN)
        if not user.check_password(str(request.data.get("current_password") or "")):
            return Response({"current_password": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        email = str(request.data.get("recovery_email") or "").strip().lower()
        confirmation = str(request.data.get("confirm_recovery_email") or "").strip().lower()
        if email != confirmation:
            return Response({"confirm_recovery_email": "Recovery email addresses do not match."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({"recovery_email": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
        if BharathUser.objects.exclude(id=user.id).filter(recovery_email__iexact=email).exists():
            return Response({"recovery_email": "This recovery email is already linked to another account."}, status=status.HTTP_400_BAD_REQUEST)
        result, error = _issue_email_otp(user, PasswordResetOTP.Purpose.RECOVERY_EMAIL, email)
        if error:
            response_status = status.HTTP_429_TOO_MANY_REQUESTS if error.startswith(("Please wait", "Too many")) else status.HTTP_503_SERVICE_UNAVAILABLE
            return Response({"detail": error}, status=response_status)
        challenge, code = result
        response = {
            "message": "OTP sent to the new recovery email.",
            "masked_email": _masked_email(email),
            "challenge_id": challenge.id,
        }
        if settings.DEBUG and settings.EMAIL_BACKEND in {
            "django.core.mail.backends.console.EmailBackend",
            "django.core.mail.backends.locmem.EmailBackend",
        }:
            response["test_otp"] = code
        return Response(response)


class RecoveryEmailVerifyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery_verify"

    @transaction.atomic
    def post(self, request):
        challenge = PasswordResetOTP.objects.select_for_update().filter(
            id=request.data.get("challenge_id"),
            user=request.user,
            purpose=PasswordResetOTP.Purpose.RECOVERY_EMAIL,
            is_used=False,
        ).first()
        if not challenge:
            return Response({"detail": "The verification code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        error = _verify_otp(challenge, str(request.data.get("otp") or "").strip())
        if error:
            return Response({"otp": error}, status=status.HTTP_400_BAD_REQUEST)
        user = request.user
        user.recovery_email = challenge.target_email.lower()
        user.recovery_email_verified = True
        user.recovery_email_verified_at = timezone.now()
        user.recovery_email_added_at = timezone.now()
        user.recovery_email_added_by = user
        user.save(update_fields=(
            "recovery_email", "recovery_email_verified", "recovery_email_verified_at",
            "recovery_email_added_at", "recovery_email_added_by",
        ))
        challenge.is_used = True
        challenge.save(update_fields=("is_used",))
        return Response({"message": "Recovery Email Verified Successfully", "masked_email": _masked_email(user.recovery_email)})


class CurrentUserView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": user.id,
                "mobile": user.mobile,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "is_verified": user.is_verified,
                "verification_status": user.verification_status,
                "bharath_id": user.bharath_id,
                "preferred_language": user.preferred_language,
                "display_name": _user_display_name(user),
                "profile_photo": (
                    request.build_absolute_uri(user.profile_photo.url)
                    if user.profile_photo else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        language = str(request.data.get("preferred_language") or "").strip()
        if language not in {value for value, _ in BharathUser.Languages.choices}:
            return Response({"preferred_language": "Select a supported language."}, status=status.HTTP_400_BAD_REQUEST)
        request.user.preferred_language = language
        request.user.save(update_fields=("preferred_language",))
        return self.get(request)


class ContractorProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get_profile(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return None
        return getattr(request.user, "contractor_profile", None)

    def get(self, request):
        profile = self.get_profile(request)
        if not profile:
            return Response({"detail": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ContractorProfileSerializer(profile, context={"request": request}).data)

    def patch(self, request):
        profile = self.get_profile(request)
        if not profile:
            return Response({"detail": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContractorProfileSerializer(profile, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def _private_profile_card_data(user, request):
    """Profile fields visible only to the signed-in profile owner."""
    details = []
    photo = user.profile_photo.url if user.profile_photo else None
    title = user.get_full_name() or user.mobile
    subtitle = user.get_role_display()
    logo_shape = "ROUND"

    def add(label, value):
        if value not in (None, ""):
            details.append({"label": label, "value": str(value)})

    if user.role == BharathUser.Roles.CONTRACTOR:
        profile = getattr(user, "contractor_profile", None)
        if profile:
            title = profile.company_name or title
            subtitle = f"Contractor · {profile.owner_name}" if profile.owner_name else "Contractor"
            photo = profile.company_logo.url if profile.company_logo else photo
            logo_shape = profile.company_logo_shape
            add("Company name", profile.company_name)
            add("Owner / proprietor", profile.owner_name)
            add("Mobile", user.mobile)
            add("Email", user.email)
            add("Office address", profile.office_address)
            add("Service areas", profile.service_areas)
            add("GSTIN", profile.gst_number)
            add("PAN", profile.pan_number)
            add("Years in business", profile.years_in_business)
            add("Paint Applicators", profile.number_of_painters)
            add("Area calculation unit", profile.get_default_measurement_unit_display())
    elif user.role == BharathUser.Roles.PAINTER:
        profile = getattr(user, "painter_profile", None)
        subtitle = "Paint Applicator"
        add("Name", title)
        add("Mobile", user.mobile)
        add("Email", user.email)
        if profile:
            add("Years of experience", profile.experience_years)
            add("Skills", profile.skills)
            add("Current location", profile.current_location)
            add("Preferred locations", profile.preferred_locations)
            add("Willing to travel", "Yes" if profile.willing_to_travel else "No")

    if photo:
        photo = request.build_absolute_uri(photo)
    return {
        "title": title,
        "subtitle": subtitle,
        "photo": photo,
        "logo_shape": logo_shape,
        "details": details,
    }


class ProfileCardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            return Response({"detail": "Profile QR is available for contractors and Paint Applicators."}, status=status.HTTP_403_FORBIDDEN)
        profile = _private_profile_card_data(user, request)
        if not user.bharath_id:
            return Response({"detail": "A Bharath ID has not been issued for this profile."}, status=status.HTTP_409_CONFLICT)

        base_url = request.build_absolute_uri("/").rstrip("/")
        generate_bharath_qr(user, base_url)
        user.save(update_fields=("bharath_qr",))
        profile_url = bharath_profile_url(user, base_url)
        share_text = "\n".join((
            "Bharath Painters verified profile",
            profile["title"],
            f"Role: {profile['subtitle']}",
            f"Bharath ID: {user.bharath_id}",
            f"Verify profile: {profile_url}",
        ))
        return Response({
            **profile,
            "bharath_id": user.bharath_id,
            "verified": bool(user.is_verified and user.verification_status == BharathUser.VerificationStatus.VERIFIED),
            "verification_status": user.verification_status,
            "qr_image": request.build_absolute_uri(user.bharath_qr.url),
            "profile_url": profile_url,
            "share_text": share_text,
        })


class ContractorDirectoryView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profiles = (
            ContractorProfile.objects
            .filter(
                user__is_active=True,
                user__is_verified=True,
                user__verification_status=BharathUser.VerificationStatus.VERIFIED,
            )
            .select_related("user")
            .order_by("company_name")
        )
        data = []
        for profile in profiles:
            user = profile.user
            data.append({
                "id": user.id,
                "bharath_id": user.bharath_id,
                "company_name": profile.company_name,
                "owner_name": profile.owner_name,
                "mobile": user.mobile,
                "email": user.email,
                "years_in_business": profile.years_in_business,
                "service_areas": profile.service_areas,
                "office_address": profile.office_address,
                "number_of_painters": profile.number_of_painters,
                "company_logo": (
                    request.build_absolute_uri(profile.company_logo.url)
                    if profile.company_logo else None
                ),
                "company_logo_shape": profile.company_logo_shape,
            })
        return Response(data, status=status.HTTP_200_OK)


class PainterDirectoryView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profiles = (
            PainterProfile.objects
            .filter(
                user__is_active=True,
                user__is_verified=True,
                user__verification_status=BharathUser.VerificationStatus.VERIFIED,
            )
            .select_related("user")
            .order_by("user__first_name", "user__last_name")
        )
        data = []
        for profile in profiles:
            user = profile.user
            data.append({
                "id": user.id,
                "bharath_id": user.bharath_id,
                "name": user.get_full_name() or user.mobile,
                "mobile": user.mobile,
                "email": user.email,
                "profile_photo": (
                    request.build_absolute_uri(user.profile_photo.url)
                    if user.profile_photo else None
                ),
                "experience_years": profile.experience_years,
                "skills": profile.skills,
                "daily_wage": profile.daily_wage,
                "weekly_wage": profile.weekly_wage,
                "preferred_locations": profile.preferred_locations,
                "willing_to_travel": profile.willing_to_travel,
                "availability": profile.availability,
            })
        return Response(data, status=status.HTTP_200_OK)

class VerifyBharathIDView(APIView):

    authentication_classes = []
    permission_classes = []

    def get(self, request, bharath_id):

        try:
            user = BharathUser.objects.get(
                bharath_id=bharath_id
            )
        except BharathUser.DoesNotExist:
            return Response(
                {
                    "verified": False,
                    "message": "Bharath ID not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if (
            not user.is_verified
            or user.verification_status
            != BharathUser.VerificationStatus.VERIFIED
        ):
            return Response(
                {
                    "verified": False,
                    "bharath_id": user.bharath_id,
                    "message": "This Bharath ID is not currently verified."
                },
                status=status.HTTP_200_OK
            )

        profession = user.get_role_display()

        return Response(
            {
                "verified": True,
                "bharath_id": user.bharath_id,
                "name": user.get_full_name(),
                "profession": profession,
                "verification_status": user.verification_status,
                "verified_at": user.verified_at,
                "badge_issued_at": user.badge_issued_at,
            },
            status=status.HTTP_200_OK
        )


class GoogleLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @transaction.atomic
    def post(self, request):
        credential = str(request.data.get("credential") or "").strip()
        client_id = str(getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip()
        if not client_id:
            return Response({"error": "Google Sign-In is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not credential:
            return Response({"error": "Google credential is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token

            claims = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                client_id,
            )
        except ImportError:
            return Response({"error": "Google Sign-In is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            return Response({"error": "Google Sign-In could not be verified."}, status=status.HTTP_401_UNAUTHORIZED)

        subject = str(claims.get("sub") or "").strip()
        email = str(claims.get("email") or "").strip().lower()
        if not subject or not email or claims.get("email_verified") is not True:
            return Response({"error": "Use a verified Google email address."}, status=status.HTTP_401_UNAUTHORIZED)

        user = BharathUser.objects.select_for_update().filter(google_subject=subject).first()
        if not user:
            matches = list(BharathUser.objects.select_for_update().filter(email__iexact=email)[:2])
            if not matches:
                return Response(
                    {"error": "No Bharath Painters account uses this Google email. Register with your mobile number first, using the same email address."},
                    status=status.HTTP_409_CONFLICT,
                )
            if len(matches) != 1:
                return Response(
                    {"error": "This email is linked to multiple accounts. Sign in with your mobile number and contact support."},
                    status=status.HTTP_409_CONFLICT,
                )
            user = matches[0]
            if user.google_subject and user.google_subject != subject:
                return Response({"error": "This account is already linked to another Google account."}, status=status.HTTP_409_CONFLICT)
            user.google_subject = subject
            user.google_email = email
            user.google_linked_at = timezone.now()
            user.save(update_fields=("google_subject", "google_email", "google_linked_at", "updated_at"))

        if not user.is_active:
            return Response({"error": "Your account is inactive."}, status=status.HTTP_403_FORBIDDEN)
        if user.role in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            activate_business_identity(user, request.build_absolute_uri("/").rstrip("/"))
        refresh = RefreshToken.for_user(user)
        return Response({
            "message": "Google login successful.",
            "user": {
                "id": user.id,
                "mobile": user.mobile,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "is_verified": user.is_verified,
                "verification_status": user.verification_status,
                "bharath_id": user.bharath_id,
                "preferred_language": user.preferred_language,
                "display_name": _user_display_name(user),
            },
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        })

class VerifyBharathIDPageView(APIView):

    authentication_classes = []
    permission_classes = []

    def get(self, request, bharath_id):

        try:
            user = BharathUser.objects.get(
                bharath_id=bharath_id
            )

        except BharathUser.DoesNotExist:

            return render(
                request,
                "accounts/verify.html",
                {
                    "verified": False,
                    "bharath_id": bharath_id,
                }
            )

        verified = (
            user.is_verified
            and
            user.verification_status
            == BharathUser.VerificationStatus.VERIFIED
        )

        if not verified:

            return render(
                request,
                "accounts/verify.html",
                {
                    "verified": False,
                    "bharath_id": user.bharath_id,
                }
            )

        profile_photo = None
        logo_shape = "ROUND"
        display_name = user.get_full_name() or user.mobile
        profession = user.get_role_display()
        professional_details = []

        if user.profile_photo:
            profile_photo = user.profile_photo.url

        if user.role == BharathUser.Roles.CONTRACTOR:
            contractor = getattr(user, "contractor_profile", None)
            if contractor:
                display_name = contractor.company_name or display_name
                professional_details = [
                    ("Owner / proprietor", contractor.owner_name),
                    ("Years in business", contractor.years_in_business),
                    ("Service areas", contractor.service_areas),
                ]
                if contractor.company_logo:
                    profile_photo = contractor.company_logo.url
                logo_shape = contractor.company_logo_shape
        elif user.role == BharathUser.Roles.PAINTER:
            painter = getattr(user, "painter_profile", None)
            profession = "Paint Applicator"
            if painter:
                professional_details = [
                    ("Experience", f"{painter.experience_years} years"),
                    ("Skills", painter.skills),
                ]

        professional_details = [(label, value) for label, value in professional_details if value not in (None, "")]

        return render(
            request,
            "accounts/verify.html",
            {
                "verified": True,
                "bharath_id": user.bharath_id,
                "name": display_name,
                "profession": profession,
                "professional_details": professional_details,
                "profile_photo": profile_photo,
                "logo_shape": logo_shape,
                "verified_at": user.verified_at,
                "badge_issued_at": user.badge_issued_at,
            }
        )
