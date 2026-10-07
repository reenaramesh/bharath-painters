
from django.db import IntegrityError, models, transaction
from django.db.models import Q, Subquery
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.files.base import File
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from decimal import Decimal, InvalidOperation
from datetime import timedelta
import logging
import csv
import io
import secrets
import hashlib
import re
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from openpyxl import Workbook, load_workbook
from .pdf_utils import build_quotation_pdf, build_measurement_pdf, build_invoice_pdf, build_invoice_receipt_pdf
from .document_languages import document_language
from .revision_utils import clone_quotation_revision, previous_revision, quotation_revision_changes
from .product_details import consolidated_product_details

from rest_framework import generics, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import ScopedRateThrottle
from accounts.models import BharathUser, ContractorProfile, PainterProfile, PasswordResetOTP
from accounts.mobile import normalize_mobile as canonical_mobile, matching_mobile_users
from accounts.profile_completion import contractor_profile_completion
from accounts.views import _registration_consent_error, _record_registration_consent, _issue_email_otp, _verify_otp, _masked_email
from accounts.email_setup import development_otp_visible
from accounts.utils import generate_bharath_qr


from .models import (
    Area, MeasurementSurfaceType,
    ServiceCategory,
    ServiceType,
    WorkDescription,
    PaintType,
    PaintBrand,
    PaintColor,
    Unit,
    Customer, SavedCustomerContact, ContractorCustomerConnection, CustomerConnectionAudit, CustomerShareLink, normalize_indian_mobile,
    PropertyContact, PropertyInvitation, PropertyAccessAudit,
    CustomerFollowUp,
    CustomerWorkHistory, ChatConversation, ChatMessage, ChatAttachment, ColourComparisonDraft, PortalNotification, ServiceRequest, Lead, LeadStageHistory, SupportTicket, SupportTicketMessage, SupportActionLog, MeasurementAccessRequest,
    MasterDataSortPreference, SiteVisit,
    WorkPhoto,
    Property, ApartmentCommunity,
    Quotation, QuotationRoom, PropertyRoom, PropertyMeasurement, MeasurementSurface, MeasurementOpening, ActivityLog, Invoice, InvoiceNumberSequence, InvoicePayment, ProjectReceipt, WorkChange, WorkChangeItem,
    ProjectScope, ContractorConnection,
)



from .serializers import (
    AreaSerializer, MeasurementSurfaceTypeSerializer,
    ServiceCategorySerializer,
    ServiceTypeSerializer,
    WorkDescriptionSerializer,
    PaintTypeSerializer,
    PaintBrandSerializer,
    PaintColorSerializer,
    UnitSerializer,
    CustomerSerializer, SAVED_CONTACT_FIELDS, saved_contact_representation,
    PropertySerializer,
    QuotationSerializer,
    CustomerFollowUpSerializer,
    CustomerTaskSerializer,
    CustomerDetailSerializer,
    CustomerWorkHistorySerializer,
    WorkPhotoSerializer, PropertyRoomSerializer, PropertyMeasurementSerializer, MeasurementSurfaceSerializer,
    MeasurementOpeningSerializer, ActivityLogSerializer, WorkChangeSerializer, WorkChangeItemSerializer,
    ProjectScopeSerializer, ContractorConnectionSerializer,
)
from .work_changes import current_scope, work_change_summary
from .master_import import MASTER_MODELS, import_master_rows
from .property_access import PropertyPermission, accessible_properties, effective_property_permissions, ensure_legacy_primary_contact, has_property_access, property_permissions, require_property_access
from .chat_colours import colour_catalogue, colour_by_id

logger = logging.getLogger(__name__)


def work_change_queryset():
    return WorkChange.objects.select_related(
        "quotation", "quotation__property", "contractor", "customer", "customer__portal_user"
    ).prefetch_related(
        "lines__room", "lines__original_item__room", "lines__original_item__unit",
        "lines__new_service_type", "lines__new_product_type", "lines__new_brand", "lines__unit",
    )


def work_change_for_user(user, pk):
    queryset = work_change_queryset().filter(pk=pk)
    if user.role == BharathUser.Roles.CONTRACTOR:
        return queryset.filter(contractor=user).first()
    if user.role == BharathUser.Roles.CUSTOMER:
        return customer_work_change_scope(user).filter(pk=pk).first()
    return None


def customer_work_change_scope(user, permission=PropertyPermission.VIEW_QUOTATIONS):
    property_ids = accessible_properties(user, permission).values("pk")
    return work_change_queryset().filter(
        Q(quotation__property_id__in=Subquery(property_ids))
        | Q(quotation__property__isnull=True, customer__portal_user=user)
    )


class WorkChangeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = work_change_queryset()
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(contractor=request.user)
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            queryset = customer_work_change_scope(request.user).exclude(status=WorkChange.Status.DRAFT)
        else:
            return Response({"detail": "Customer or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        quotation_id = request.query_params.get("quotation")
        if quotation_id:
            queryset = queryset.filter(quotation_id=quotation_id)
        return Response(WorkChangeSerializer(queryset, many=True, context={"request": request}).data)

    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        serializer = WorkChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        change = serializer.save()
        return Response(WorkChangeSerializer(change, context={"request": request}).data, status=status.HTTP_201_CREATED)


class WorkChangeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        change = work_change_for_user(request.user, pk)
        if not change or (request.user.role == BharathUser.Roles.CUSTOMER and change.status == WorkChange.Status.DRAFT):
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkChangeSerializer(change, context={"request": request}).data)

    def patch(self, request, pk):
        change = work_change_for_user(request.user, pk)
        if not change or request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkChangeSerializer(change, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        change = serializer.save()
        return Response(WorkChangeSerializer(change, context={"request": request}).data)

    def delete(self, request, pk):
        change = work_change_for_user(request.user, pk)
        if not change or request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        if change.status != WorkChange.Status.DRAFT:
            return Response({"status": "Only a draft Work Change can be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        change.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkChangeSendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        change = work_change_for_user(request.user, pk)
        if not change or request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        if change.status != WorkChange.Status.DRAFT or not change.lines.exists():
            return Response({"status": "Only a complete draft can be sent."}, status=status.HTTP_400_BAD_REQUEST)
        change.status = WorkChange.Status.SENT_TO_CUSTOMER
        change.sent_at = timezone.now()
        change.save(update_fields=("status", "sent_at", "updated_at"))
        create_notification(change.customer.portal_user, "WORK_CHANGE", "Work Change approval requested", f"{change.change_number} for {change.quotation.quotation_number}", "/work-changes", request.user)
        return Response(WorkChangeSerializer(change, context={"request": request}).data)


class CustomerWorkChangeActionView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk, action):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        change = customer_work_change_scope(
            request.user, PropertyPermission.APPROVE_QUOTATIONS,
        ).select_for_update().filter(pk=pk).first()
        if not change or request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        if change.status != WorkChange.Status.SENT_TO_CUSTOMER:
            return Response({"status": "This Work Change is no longer awaiting approval."}, status=status.HTTP_400_BAD_REQUEST)
        action = action.upper()
        if action == "APPROVE":
            # Revalidate quantities at approval time so two pending requests cannot over-allocate one area.
            for line in change.lines.all():
                validator = WorkChangeItemSerializer(instance=line, data={}, partial=True, context={"work_change": change, "quotation": change.quotation})
                validator.is_valid(raise_exception=True)
            change.status = WorkChange.Status.APPROVED
            change.approved_at = timezone.now()
        elif action == "REJECT":
            change.status = WorkChange.Status.REJECTED
            change.rejected_at = timezone.now()
        else:
            return Response({"action": "Select approve or reject."}, status=status.HTTP_400_BAD_REQUEST)
        change.customer_response_note = str(request.data.get("note") or "").strip()
        change.save()
        create_notification(change.contractor, "WORK_CHANGE", f"Work Change {change.get_status_display()}", change.change_number, "/work-changes", request.user)
        return Response(WorkChangeSerializer(change, context={"request": request}).data)


class WorkChangeCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        change = work_change_for_user(request.user, pk)
        if not change or request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Work Change not found."}, status=status.HTTP_404_NOT_FOUND)
        if change.status not in {WorkChange.Status.DRAFT, WorkChange.Status.SENT_TO_CUSTOMER}:
            return Response({"status": "Approved or rejected Work Changes cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        change.status = WorkChange.Status.CANCELLED
        change.cancelled_at = timezone.now()
        change.save(update_fields=("status", "cancelled_at", "updated_at"))
        return Response(WorkChangeSerializer(change, context={"request": request}).data)


class WorkChangeScopeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, quotation_id):
        quotation = Quotation.objects.filter(pk=quotation_id).first()
        allowed = quotation and (quotation.contractor_id == request.user.id or quotation.customer.portal_user_id == request.user.id)
        if not allowed:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"scope": current_scope(quotation), "summary": work_change_summary(quotation)})


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response([])
        results = []
        user = request.user
        if user.role == BharathUser.Roles.CONTRACTOR:
            customers = Customer.objects.filter(contractor_connections__contractor=user, contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED).filter(models.Q(name__icontains=query) | models.Q(mobile__icontains=query) | models.Q(bharath_id__icontains=query)).distinct()[:6]
            results += [{"type": "Customer", "title": x.name, "subtitle": x.mobile, "link": f"/customers/{x.id}"} for x in customers]
            quotations = Quotation.objects.filter(contractor=user, deleted_at__isnull=True).filter(models.Q(quotation_number__icontains=query) | models.Q(customer__name__icontains=query) | models.Q(property__name__icontains=query))[:6]
            results += [{"type": "Quotation", "title": x.quotation_number, "subtitle": x.customer.name, "link": f"/quotations/{x.id}"} for x in quotations]
            properties = Property.objects.filter(contractor=user, connection__status=ContractorCustomerConnection.Status.CONNECTED, contractor_hidden_at__isnull=True).filter(models.Q(name__icontains=query) | models.Q(city__icontains=query) | models.Q(address__icontains=query))[:6]
            results += [{"type": "Property", "title": x.name or x.property_type, "subtitle": x.city, "link": f"/properties/{x.id}"} for x in properties]
        elif user.role == BharathUser.Roles.CUSTOMER:
            quotations = Quotation.objects.filter(customer__portal_user=user, deleted_at__isnull=True).filter(models.Q(quotation_number__icontains=query) | models.Q(property__name__icontains=query))[:8]
            results += [{"type": "Quotation", "title": x.quotation_number, "subtitle": x.property.name or x.property.property_type, "link": f"/customer-quotations/{x.id}"} for x in quotations]
        elif user.role == BharathUser.Roles.ADMIN:
            people = BharathUser.objects.filter(models.Q(mobile__icontains=query) | models.Q(first_name__icontains=query) | models.Q(bharath_id__icontains=query))[:10]
            results += [{"type": x.get_role_display(), "title": x.get_full_name() or x.mobile, "subtitle": x.mobile, "link": "/contractors" if x.role == "CONTRACTOR" else "/painters"} for x in people]
        return Response(results[:18])


CONNECTION_REQUEST_COOLDOWN = timedelta(days=7)
CUSTOMER_LINK_LIFETIME = timedelta(days=7)


def issue_customer_share_link(connection, purpose):
    CustomerShareLink.objects.filter(connection=connection, purpose=purpose, used_at__isnull=True).delete()
    token = secrets.token_urlsafe(32)
    expires_at = timezone.now() + CUSTOMER_LINK_LIFETIME
    CustomerShareLink.objects.create(
        connection=connection, purpose=purpose,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        expires_at=expires_at,
    )
    return {"share_link": f"/customer-link/{token}", "link_purpose": purpose,
            "link_expires_at": expires_at}


def get_customer_share_link(token):
    if not isinstance(token, str) or len(token) > 100:
        return None
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return CustomerShareLink.objects.select_related("connection__customer__portal_user", "connection__contractor", "connection__contractor__contractor_profile").filter(
        token_hash=digest, expires_at__gt=timezone.now(), used_at__isnull=True,
    ).first()


def find_user_by_normalized_mobile(normalized_mobile, role=None):
    users = BharathUser.objects.all()
    if role:
        users = users.filter(role=role)
    matches = matching_mobile_users(normalized_mobile, users)
    return matches[0] if len(matches) == 1 else None


def find_customer_portal_user(normalized_mobile):
    return find_user_by_normalized_mobile(normalized_mobile, BharathUser.Roles.CUSTOMER)


def next_available_customer_id(customer):
    """Return a customer ID unused by both CRM records and login accounts."""
    sequence = customer.pk
    while True:
        candidate = f"BP-C-{sequence:06d}"
        customer_uses_id = Customer.objects.exclude(pk=customer.pk).filter(
            bharath_id=candidate,
        ).exists()
        user_uses_id = BharathUser.objects.filter(bharath_id=candidate).exclude(
            pk=customer.portal_user_id,
        ).exists()
        if not customer_uses_id and not user_uses_id:
            return candidate
        sequence += 1


def activate_customer_account(customer):
    """Provision the permanent customer ID and portal login only when requested."""
    portal_user = customer.portal_user
    if portal_user is None:
        portal_user = find_user_by_normalized_mobile(customer.normalized_mobile)

    if portal_user and portal_user.role != BharathUser.Roles.CUSTOMER:
        raise ValidationError({"mobile": "This mobile number belongs to another account type. Contact support to resolve the account."})
    if portal_user and not portal_user.is_active:
        raise ValidationError({"account": "This customer account is disabled. Contact an administrator to restore access."})

    # When a matching customer login already exists, its Bharath ID is canonical.
    # Otherwise allocate one unique across both CRM records and login accounts.
    if portal_user and portal_user.bharath_id:
        if Customer.objects.exclude(pk=customer.pk).filter(bharath_id=portal_user.bharath_id).exists():
            raise ValidationError({"bharath_id": "This account ID is linked to another customer record. Contact support."})
        customer.bharath_id = portal_user.bharath_id
    elif not customer.bharath_id:
        customer.bharath_id = next_available_customer_id(customer)
    customer.save(update_fields=("bharath_id", "updated_at"))

    if portal_user:
        temporary_password = None
        if not portal_user.bharath_id:
            portal_user.bharath_id = customer.bharath_id
            try:
                with transaction.atomic():
                    portal_user.save(update_fields=("bharath_id", "updated_at"))
            except IntegrityError:
                raise ValidationError({"bharath_id": "A customer ID conflict occurred. Please retry, or contact support."})
    else:
        temporary_password = None
        try:
            # Keep a uniqueness conflict inside a savepoint so the outer API
            # transaction remains usable and can return a helpful 409/400.
            with transaction.atomic():
                portal_user = BharathUser.objects.create_user(
                    mobile=customer.mobile, email=customer.email or None,
                    password=None, first_name=customer.name,
                    role=BharathUser.Roles.CUSTOMER, is_active=True, is_verified=False,
                    verification_status=BharathUser.VerificationStatus.PENDING,
                    bharath_id=customer.bharath_id,
                )
        except IntegrityError:
            existing = find_user_by_normalized_mobile(customer.normalized_mobile)
            if existing and existing.role == BharathUser.Roles.CUSTOMER and existing.is_active:
                portal_user = existing
                temporary_password = None
                if existing.bharath_id:
                    customer.bharath_id = existing.bharath_id
                    customer.save(update_fields=("bharath_id", "updated_at"))
            elif existing:
                raise ValidationError({"mobile": "This mobile number belongs to another or disabled account. Contact support."})
            else:
                raise ValidationError({"account": "The customer account could not be created because its ID conflicts with another record. Please retry."})

    customer.portal_user = portal_user
    customer.save(update_fields=("portal_user", "updated_at"))
    return portal_user, temporary_password


def contractor_property_scope(user, prefix=""):
    return (
        models.Q(**{f"{prefix}contractor": user, f"{prefix}connection__contractor": user,
                    f"{prefix}connection__status": ContractorCustomerConnection.Status.CONNECTED})
        | models.Q(**{f"{prefix}contractor": user, f"{prefix}connection__isnull": True,
                      f"{prefix}customer__contractor_connections__contractor": user,
                      f"{prefix}customer__contractor_connections__status": ContractorCustomerConnection.Status.CONNECTED})
    )


def masked_customer_id(value):
    value = str(value or "")
    return f"BP-C-******{value[-3:]}" if value else "BP-C-*********"


def masked_mobile(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return f"******{digits[-4:]}" if len(digits) >= 4 else "**********"


def contractor_public_data(contractor):
    profile = getattr(contractor, "contractor_profile", None)
    return {
        "id": contractor.id,
        "name": contractor.get_full_name() or getattr(profile, "owner_name", "") or contractor.mobile,
        "business_name": getattr(profile, "company_name", "") or contractor.get_full_name() or "Bharath Painters Contractor",
        "contractor_id": contractor.bharath_id,
        "verification_status": contractor.verification_status,
        "is_verified": contractor.is_verified,
        "years_in_business": getattr(profile, "years_in_business", 0),
        "service_areas": getattr(profile, "service_areas", ""),
        "work_skills": getattr(profile, "work_skills", ""),
        "workers": getattr(profile, "number_of_painters", 0),
        "completed_projects": profile.completed_projects.count() if profile else 0,
        "public_rating": round(profile.customer_reviews.aggregate(value=models.Avg("rating"))["value"], 1) if profile and profile.customer_reviews.exists() else None,
        "review_count": profile.customer_reviews.count() if profile else 0,
    }


def safe_customer_lookup(customer, connection=None):
    state = "EXISTING"
    can_request = True
    cooldown_until = None
    if connection:
        state = connection.status
        can_request = connection.status in {
            ContractorCustomerConnection.Status.REJECTED,
            ContractorCustomerConnection.Status.DISCONNECTED,
        }
        if can_request and (connection.last_request_at or connection.requested_at):
            cooldown_until = (connection.last_request_at or connection.requested_at) + CONNECTION_REQUEST_COOLDOWN
            can_request = timezone.now() >= cooldown_until
    return {
        "state": state,
        "customer_exists": True,
        "customer_id": masked_customer_id(customer.bharath_id),
        "mobile": masked_mobile(customer.mobile),
        "can_request": can_request,
        "cooldown_until": cooldown_until,
        "message": {
            "CONNECTED": "You are already connected with this customer.",
            "PENDING": "Your connection request is waiting for customer approval.",
            "RECONNECT_PENDING": "Your reconnect request is waiting for customer approval.",
            "BLOCKED": "This customer is not accepting connection requests from your account.",
        }.get(state, "This customer already has a Bharath Painters account."),
    }


def record_connection_audit(request, connection, action):
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    return CustomerConnectionAudit.objects.create(
        connection=connection,
        customer=connection.customer,
        contractor=connection.contractor,
        performed_by=request.user if request.user.is_authenticated else None,
        performed_by_role=getattr(request.user, "role", ""),
        action=action,
        ip_address=forwarded or request.META.get("REMOTE_ADDR") or None,
        user_agent=str(request.META.get("HTTP_USER_AGENT") or "")[:255],
    )


def connection_data(connection, viewer_role=""):
    customer = connection.customer
    data = {
        "id": connection.id,
        "status": connection.status,
        "status_before_block": connection.status_before_block if connection.status == ContractorCustomerConnection.Status.BLOCKED else "",
        "requested_at": connection.requested_at,
        "accepted_at": connection.accepted_at,
        "last_request_at": connection.last_request_at,
        "request_count": connection.request_count,
        "cooldown_until": (connection.last_request_at or connection.requested_at) + CONNECTION_REQUEST_COOLDOWN if connection.status in (ContractorCustomerConnection.Status.REJECTED, ContractorCustomerConnection.Status.DISCONNECTED) else None,
        "connected_at": connection.connected_at,
        "approved_at": connection.approved_at,
        "rejected_at": connection.rejected_at,
        "disconnected_at": connection.disconnected_at,
        "blocked_at": connection.blocked_at,
        "approval_method": connection.approval_method,
        "contractor": contractor_public_data(connection.contractor),
    }
    if viewer_role in {BharathUser.Roles.CUSTOMER, BharathUser.Roles.ADMIN}:
        data["customer"] = {"id": customer.id, "bharath_id": customer.bharath_id, "name": customer.name, "mobile": customer.mobile}
    elif connection.status == ContractorCustomerConnection.Status.CONNECTED:
        data["customer"] = {"id": customer.id, "bharath_id": customer.bharath_id, "name": customer.name, "mobile": customer.mobile}
    else:
        data["customer"] = {
            "id": customer.id,
            "masked_customer_id": masked_customer_id(customer.bharath_id),
            "masked_mobile": masked_mobile(customer.mobile),
        }
        contact = SavedCustomerContact.objects.filter(customer=customer, contractor=connection.contractor).first()
        if contact:
            data["customer"].update({"id": customer.id, "name": contact.details.get("name", ""), "mobile": contact.details.get("mobile", "")})
    if connection.status == ContractorCustomerConnection.Status.CONNECTED:
        data["counts"] = {
            "properties": connection.properties.count(),
            "area_calculations": connection.measurements.count(),
            "quotations": connection.quotations.count(),
            "active_projects": connection.quotations.filter(status__in=(Quotation.Status.SCHEDULED, Quotation.Status.IN_PROGRESS)).count(),
        }
    return data


class CustomerMobileCheckView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": ["Enter a valid Indian mobile number."]}, status=status.HTTP_400_BAD_REQUEST)
        customer = Customer.objects.exclude(status=Customer.Status.CANCELLED).filter(normalized_mobile=normalized).first()
        if not customer:
            existing_account = find_user_by_normalized_mobile(normalized)
            if existing_account and existing_account.role != BharathUser.Roles.CUSTOMER:
                return Response({
                    "state": "ACCOUNT_CONFLICT",
                    "customer_exists": False,
                    "account_role": existing_account.get_role_display(),
                    "message": f"This mobile number is registered as a {existing_account.get_role_display()} account and cannot be added as a customer.",
                })
            return Response({"state": "NEW", "customer_exists": False, "normalized_mobile": normalized, "message": "No existing Bharath Painters customer was found for this mobile number."})
        connection = ContractorCustomerConnection.objects.filter(customer=customer, contractor=request.user).first()
        return Response(safe_customer_lookup(customer, connection))


class CustomerShareLinkCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        connection = ContractorCustomerConnection.objects.select_for_update().select_related("customer__portal_user").filter(
            customer_id=pk, contractor=request.user,
        ).first()
        if not connection or connection.customer.status == Customer.Status.CANCELLED:
            return Response({"detail": "Customer contact not found."}, status=status.HTTP_404_NOT_FOUND)
        if connection.status in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
            purpose = CustomerShareLink.Purpose.CONNECTION
        elif connection.status == ContractorCustomerConnection.Status.CONNECTED and connection.customer.portal_user and not connection.customer.portal_user.has_usable_password():
            purpose = CustomerShareLink.Purpose.ACTIVATION
        else:
            return Response({"detail": "No activation or pending connection link is available for this customer."}, status=status.HTTP_409_CONFLICT)
        result = issue_customer_share_link(connection, purpose)
        contact = SavedCustomerContact.objects.filter(customer=connection.customer, contractor=request.user).first()
        return Response({**result, "contractor_name": contractor_public_data(request.user)["business_name"],
                         "customer_name": (contact.details.get("name") if contact else "") or (connection.customer.name if purpose == CustomerShareLink.Purpose.ACTIVATION else "Customer"),
                         "customer_mobile": (contact.details.get("mobile") if contact else "") or (connection.customer.mobile if purpose == CustomerShareLink.Purpose.ACTIVATION else ""),
                         "customer_id": connection.customer.bharath_id if purpose == CustomerShareLink.Purpose.ACTIVATION else ""})


class CustomerShareLinkView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        link = get_customer_share_link(token)
        if not link:
            return Response({"detail": "This link is invalid or has expired."}, status=status.HTTP_404_NOT_FOUND)
        connection = link.connection
        account = connection.customer.portal_user
        if link.purpose == CustomerShareLink.Purpose.CONNECTION and connection.status not in (
            ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING,
        ):
            return Response({"detail": "This connection request has already been handled."}, status=status.HTTP_410_GONE)
        if link.purpose == CustomerShareLink.Purpose.ACTIVATION and (connection.status != ContractorCustomerConnection.Status.CONNECTED or (account and account.has_usable_password())):
            return Response({"detail": "This account has already been activated."}, status=status.HTTP_410_GONE)
        response = Response({
            "purpose": link.purpose, "contractor_name": contractor_public_data(connection.contractor)["business_name"],
            "customer_name": connection.customer.name, "expires_at": link.expires_at,
            "account_ready": bool(account and account.has_usable_password()),
            "status": connection.status,
        })
        response["Cache-Control"] = "no-store"
        return response

    @transaction.atomic
    def post(self, request, token):
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest() if len(token) <= 100 else ""
        link = CustomerShareLink.objects.select_for_update().select_related("connection__customer__portal_user", "connection__contractor").filter(
            token_hash=digest, expires_at__gt=timezone.now(), used_at__isnull=True,
        ).first()
        if not link:
            return Response({"detail": "This link is invalid or has expired."}, status=status.HTTP_404_NOT_FOUND)
        connection = link.connection
        customer = connection.customer
        if link.purpose == CustomerShareLink.Purpose.ACTIVATION:
            if connection.status != ContractorCustomerConnection.Status.CONNECTED or not customer.portal_user_id:
                return Response({"detail": "This activation is no longer available."}, status=status.HTTP_409_CONFLICT)
            user = customer.portal_user
            if user.has_usable_password():
                return Response({"detail": "This account is already active. Please sign in."}, status=status.HTTP_409_CONFLICT)
            if str(request.data.get("action") or "") == "request_email_otp":
                email = str(request.data.get("email") or "").strip().lower()
                try:
                    validate_email(email)
                except DjangoValidationError:
                    return Response({"email": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
                if BharathUser.objects.exclude(pk=user.pk).filter(recovery_email__iexact=email).exists():
                    return Response({"email": "This email is already linked to another account."}, status=status.HTTP_400_BAD_REQUEST)
                result, error = _issue_email_otp(user, PasswordResetOTP.Purpose.CUSTOMER_ACTIVATION, email)
                if error:
                    response_status = status.HTTP_429_TOO_MANY_REQUESTS if error.startswith(("Please wait", "Too many")) else status.HTTP_503_SERVICE_UNAVAILABLE
                    return Response({"detail": error}, status=response_status)
                challenge, code = result
                response = {"detail": "Verification code sent.", "challenge_id": challenge.id, "masked_email": _masked_email(email)}
                if development_otp_visible():
                    response["test_otp"] = code
                return Response(response)
            try:
                challenge_id = int(request.data.get("challenge_id"))
            except (TypeError, ValueError):
                return Response({"otp": "Request an email verification code first."}, status=status.HTTP_400_BAD_REQUEST)
            challenge = PasswordResetOTP.objects.select_for_update().filter(
                pk=challenge_id, user=user, purpose=PasswordResetOTP.Purpose.CUSTOMER_ACTIVATION,
                is_used=False,
            ).first()
            if not challenge:
                return Response({"otp": "The verification code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
            otp_error = _verify_otp(challenge, str(request.data.get("otp") or "").strip())
            if otp_error:
                return Response({"otp": otp_error}, status=status.HTTP_400_BAD_REQUEST)
            email = challenge.target_email.lower()
            if BharathUser.objects.exclude(pk=user.pk).filter(recovery_email__iexact=email).exists():
                return Response({"email": "This email is already linked to another account."}, status=status.HTTP_400_BAD_REQUEST)
            consent_error = _registration_consent_error(request)
            if consent_error:
                return Response(consent_error, status=status.HTTP_400_BAD_REQUEST)
            password = str(request.data.get("password") or "")
            if len(password) < 8:
                return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                validate_password(password, user=user)
            except Exception as error:
                return Response({"password": getattr(error, "messages", ["Choose a stronger password."])}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(password)
            user.email = email
            user.recovery_email = email
            user.recovery_email_verified = True
            user.recovery_email_verified_at = timezone.now()
            user.recovery_email_added_at = timezone.now()
            user.recovery_email_added_by = user
            user.is_active = True
            user.is_verified = True
            user.verification_status = BharathUser.VerificationStatus.VERIFIED
            user.verified_at = user.verified_at or timezone.now()
            user.save(update_fields=("password", "email", "recovery_email", "recovery_email_verified", "recovery_email_verified_at", "recovery_email_added_at", "recovery_email_added_by", "is_active", "is_verified", "verification_status", "verified_at", "updated_at"))
            customer.email = email
            customer.save(update_fields=("email", "updated_at"))
            generate_bharath_qr(user, request.build_absolute_uri("/").rstrip("/"))
            user.save(update_fields=("bharath_qr",))
            _record_registration_consent(user, request, BharathUser.Roles.CUSTOMER)
            link.used_at = timezone.now()
            link.save(update_fields=("used_at",))
            challenge.is_used = True
            challenge.save(update_fields=("is_used",))
            return Response({"detail": "Account activated. You can now sign in."})
        if not request.user.is_authenticated or request.user.role != BharathUser.Roles.CUSTOMER or customer.portal_user_id != request.user.id:
            return Response({"detail": "Sign in with this customer account to respond to the request."}, status=status.HTTP_403_FORBIDDEN)
        action = str(request.data.get("action") or "").lower()
        if action not in ("accept", "reject", "block"):
            return Response({"action": "Choose Accept, Reject or Block."}, status=status.HTTP_400_BAD_REQUEST)
        if connection.status not in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
            return Response({"detail": "This request is no longer pending."}, status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        if action == "accept":
            connection.status = ContractorCustomerConnection.Status.CONNECTED
            connection.approved_at = now
            connection.accepted_at = now
            connection.connected_at = now
            connection.approval_method = ContractorCustomerConnection.ApprovalMethod.CUSTOMER_PORTAL
            ChatConversation.objects.get_or_create(customer=customer, contractor=connection.contractor, defaults={"connection": connection})
            audit_action = CustomerConnectionAudit.Actions.ACCEPTED
        elif action == "reject":
            connection.status = ContractorCustomerConnection.Status.REJECTED
            connection.rejected_at = now
            audit_action = CustomerConnectionAudit.Actions.REJECTED
        else:
            connection.status_before_block = connection.status
            connection.status = ContractorCustomerConnection.Status.BLOCKED
            connection.blocked_at = now
            audit_action = CustomerConnectionAudit.Actions.BLOCKED
        connection.save()
        record_connection_audit(request, connection, audit_action)
        create_notification(connection.contractor, "CONNECTION_" + action.upper(), "Customer connection updated",
                            f"A customer {action}ed your connection request.", "/customers", request.user)
        link.used_at = now
        link.save(update_fields=("used_at",))
        return Response({"status": connection.status, "detail": "Your response has been saved."})


class ContractorCustomerConnectionRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        customer = Customer.objects.select_for_update().exclude(status=Customer.Status.CANCELLED).filter(normalized_mobile=normalized).first()
        if not customer:
            return Response({"detail": "Customer account not found. Check the mobile number first."}, status=status.HTTP_404_NOT_FOUND)
        SavedCustomerContact.objects.get_or_create(
            customer=customer, contractor=request.user,
            defaults={"details": {"name": "Customer", "mobile": normalized}},
        )
        connection = ContractorCustomerConnection.objects.select_for_update().filter(customer=customer, contractor=request.user).first()
        now = timezone.now()
        action = CustomerConnectionAudit.Actions.REQUESTED
        if connection:
            if connection.status == ContractorCustomerConnection.Status.CONNECTED:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_409_CONFLICT)
            if connection.status in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_409_CONFLICT)
            if connection.status == ContractorCustomerConnection.Status.BLOCKED:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_403_FORBIDDEN)
            if now < (connection.last_request_at or connection.requested_at) + CONNECTION_REQUEST_COOLDOWN:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_429_TOO_MANY_REQUESTS)
            connection.status = ContractorCustomerConnection.Status.RECONNECT_PENDING
            connection.requested_at = now
            connection.last_request_at = now
            connection.request_count += 1
            connection.requested_by = request.user
            connection.rejected_at = None
            connection.disconnected_at = None
            connection.rejection_reason = ""
            connection.save()
            action = CustomerConnectionAudit.Actions.RESENT
        else:
            connection = ContractorCustomerConnection.objects.create(customer=customer, contractor=request.user, requested_by=request.user, last_request_at=now, **saved_contact_connection_defaults(customer, request.user))
        record_connection_audit(request, connection, action)
        public = contractor_public_data(request.user)
        create_notification(
            customer.portal_user, "CONNECTION_REQUEST", "New contractor connection request",
            f"{public['business_name']} wants to connect with your Bharath Painters account.",
            "/customer/connections?tab=pending", request.user,
        )
        share = issue_customer_share_link(connection, CustomerShareLink.Purpose.CONNECTION)
        return Response({"state": connection.status, "connection_id": connection.id,
                         "message": "Connection request sent. Waiting for customer approval.", **share},
                        status=status.HTTP_201_CREATED)


class ContractorCustomerConnectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        queryset = ContractorCustomerConnection.objects.filter(contractor=request.user).select_related("customer", "contractor", "contractor__contractor_profile")
        requested_status = str(request.query_params.get("status") or "").upper()
        if requested_status in dict(ContractorCustomerConnection.Status.choices):
            queryset = queryset.filter(status=requested_status)
        return Response({"results": [connection_data(item, request.user.role) for item in queryset]})


class CustomerContractorSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.query_params.get("mobile"))
        if not normalized:
            return Response({"mobile": "Enter a valid Indian mobile number."}, status=status.HTTP_400_BAD_REQUEST)
        contractor = find_user_by_normalized_mobile(normalized)
        if not contractor:
            return Response({"state": "NOT_FOUND", "mobile": normalized, "can_invite": True})
        if contractor.role != BharathUser.Roles.CONTRACTOR or not contractor.is_active:
            return Response({"state": "UNAVAILABLE", "mobile": normalized, "can_invite": False, "message": "This mobile number is not available as an active contractor account."})
        connection = ContractorCustomerConnection.objects.filter(customer__portal_user=request.user, contractor=contractor).first()
        return Response({
            "state": "FOUND", "mobile": normalized, "contractor": contractor_public_data(contractor),
            "connection_status": connection.status if connection else "NOT_CONNECTED",
            "can_connect": not connection or connection.status not in (ContractorCustomerConnection.Status.CONNECTED, ContractorCustomerConnection.Status.BLOCKED),
        })


class CustomerContractorConnectView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        customer = Customer.objects.select_for_update().filter(portal_user=request.user).first()
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": "Enter a valid Indian mobile number."}, status=status.HTTP_400_BAD_REQUEST)
        contractor = find_user_by_normalized_mobile(normalized)
        if not customer or not contractor or contractor.role != BharathUser.Roles.CONTRACTOR or not contractor.is_active:
            return Response({"detail": "Customer or contractor account not found."}, status=status.HTTP_404_NOT_FOUND)
        connection, _ = ContractorCustomerConnection.objects.get_or_create(
            customer=customer, contractor=contractor,
            defaults={"requested_by": request.user, **saved_contact_connection_defaults(customer, contractor)},
        )
        if connection.status == ContractorCustomerConnection.Status.BLOCKED:
            return Response({"detail": "This contractor is blocked on your account."}, status=status.HTTP_409_CONFLICT)
        if connection.status != ContractorCustomerConnection.Status.CONNECTED:
            now = timezone.now()
            connection.status = ContractorCustomerConnection.Status.CONNECTED
            connection.requested_by = request.user
            connection.requested_at = now
            connection.last_request_at = now
            connection.connected_at = now
            connection.approved_at = now
            connection.accepted_at = now
            connection.approval_method = ContractorCustomerConnection.ApprovalMethod.CUSTOMER_PORTAL
            connection.rejected_at = None
            connection.disconnected_at = None
            connection.rejection_reason = ""
            connection.save()
            ChatConversation.objects.get_or_create(customer=customer, contractor=contractor, defaults={"connection": connection})
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.ACCEPTED)
            create_notification(contractor, "CONNECTION_ACCEPTED", "Customer connected with you", f"{customer.name} connected with your contractor account.", f"/customers/{customer.id}", request.user)
        return Response(connection_data(connection, request.user.role))


class CustomerConnectionRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        customer = Customer.objects.filter(portal_user=request.user).first()
        if not customer:
            return Response({"pending_count": 0, "results": []})
        queryset = ContractorCustomerConnection.objects.filter(customer=customer).select_related("customer", "contractor", "contractor__contractor_profile")
        results = [connection_data(item, request.user.role) for item in queryset]
        return Response({"pending_count": queryset.filter(status__in=(ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING)).count(), "results": results})


class CustomerConnectionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        connection = ContractorCustomerConnection.objects.select_related("customer", "contractor", "contractor__contractor_profile").filter(pk=pk, customer__portal_user=request.user).first()
        if not connection:
            return Response({"detail": "Connection request not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(connection_data(connection, request.user.role))


class CustomerConnectionActionView(APIView):
    permission_classes = [IsAuthenticated]
    action = ""

    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        connection = ContractorCustomerConnection.objects.select_for_update().select_related("customer", "contractor").filter(pk=pk, customer__portal_user=request.user).first()
        if not connection:
            return Response({"detail": "Connection request not found."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        if self.action == "accept":
            if connection.status not in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
                return Response({"detail": "Only a pending request can be accepted."}, status=status.HTTP_409_CONFLICT)
            connection.status = ContractorCustomerConnection.Status.CONNECTED
            connection.approved_at = now
            connection.accepted_at = now
            connection.connected_at = now
            connection.approval_method = ContractorCustomerConnection.ApprovalMethod.CUSTOMER_PORTAL
            connection.save()
            ChatConversation.objects.get_or_create(customer=connection.customer, contractor=connection.contractor, defaults={"connection": connection})
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.ACCEPTED)
            create_notification(connection.contractor, "CONNECTION_ACCEPTED", "Connection accepted", f"{masked_customer_id(connection.customer.bharath_id)} accepted your connection request.", "/customers", request.user)
        elif self.action == "reject":
            if connection.status not in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
                return Response({"detail": "Only a pending request can be rejected."}, status=status.HTTP_409_CONFLICT)
            connection.status = ContractorCustomerConnection.Status.REJECTED
            connection.rejected_at = now
            connection.rejection_reason = str(request.data.get("reason") or "")[:80]
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.REJECTED)
            create_notification(connection.contractor, "CONNECTION_REJECTED", "Connection request declined", "Your customer connection request was not accepted.", "/customers", request.user)
        elif self.action == "disconnect":
            if connection.status != ContractorCustomerConnection.Status.CONNECTED:
                return Response({"detail": "Only a connected contractor can be disconnected."}, status=status.HTTP_409_CONFLICT)
            connection.status = ContractorCustomerConnection.Status.DISCONNECTED
            connection.disconnected_at = now
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.DISCONNECTED)
            create_notification(connection.contractor, "CONNECTION_DISCONNECTED", "Customer disconnected", "A customer has disconnected your account. Historical records remain preserved.", "/customers", request.user)
        elif self.action == "block":
            if connection.status == ContractorCustomerConnection.Status.BLOCKED:
                return Response({"detail": "This contractor is already blocked."}, status=status.HTTP_409_CONFLICT)
            connection.status_before_block = connection.status
            connection.status = ContractorCustomerConnection.Status.BLOCKED
            connection.blocked_at = now
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.BLOCKED)
            create_notification(connection.contractor, "CONTRACTOR_BLOCKED", "Customer connection blocked", "You can no longer request this customer connection.", "/customers", request.user)
        elif self.action == "connect-back":
            if connection.status != ContractorCustomerConnection.Status.REJECTED:
                return Response({"detail": "Only a declined connection can be requested again."}, status=status.HTTP_409_CONFLICT)
            if now < (connection.last_request_at or connection.requested_at) + CONNECTION_REQUEST_COOLDOWN:
                return Response({"detail": "Please wait before requesting another connection."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            connection.status = ContractorCustomerConnection.Status.RECONNECT_PENDING
            connection.requested_at = now
            connection.last_request_at = now
            connection.request_count += 1
            connection.requested_by = request.user
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.RESENT)
            create_notification(connection.contractor, "CONNECTION_REQUEST", "Customer wants to reconnect", "A customer asked to reconnect with your account.", "/customers", request.user)
        elif self.action == "unblock":
            if connection.status != ContractorCustomerConnection.Status.BLOCKED:
                return Response({"detail": "This contractor is not blocked."}, status=status.HTTP_409_CONFLICT)
            connection.status = connection.status_before_block or ContractorCustomerConnection.Status.PENDING
            connection.status_before_block = ""
            connection.blocked_at = None
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.UNBLOCKED)
        if self.action in ("accept", "reject", "block"):
            CustomerShareLink.objects.filter(connection=connection, purpose=CustomerShareLink.Purpose.CONNECTION).delete()
        return Response(connection_data(connection, request.user.role))


class CustomerConnectionAcceptView(CustomerConnectionActionView):
    action = "accept"


class CustomerConnectionRejectView(CustomerConnectionActionView):
    action = "reject"


class CustomerContractorDisconnectView(CustomerConnectionActionView):
    action = "disconnect"


class CustomerContractorBlockView(CustomerConnectionActionView):
    action = "block"


class CustomerContractorConnectBackView(CustomerConnectionActionView):
    action = "connect-back"


class CustomerContractorUnblockView(CustomerConnectionActionView):
    action = "unblock"


class AdminCustomerConnectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.ADMIN and not request.user.is_superuser:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        queryset = ContractorCustomerConnection.objects.select_related("customer", "contractor", "contractor__contractor_profile")
        query = str(request.query_params.get("search") or "").strip()
        requested_status = str(request.query_params.get("status") or "").upper()
        if query:
            queryset = queryset.filter(models.Q(customer__bharath_id__icontains=query) | models.Q(customer__mobile__icontains=query) | models.Q(contractor__bharath_id__icontains=query) | models.Q(contractor__mobile__icontains=query))
        if requested_status in dict(ContractorCustomerConnection.Status.choices):
            queryset = queryset.filter(status=requested_status)
        if request.query_params.get("date_from"):
            queryset = queryset.filter(requested_at__date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            queryset = queryset.filter(requested_at__date__lte=request.query_params["date_to"])
        return Response({"results": [connection_data(item, request.user.role) for item in queryset[:500]]})


class AdminCustomerConnectionAuditView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.ADMIN and not request.user.is_superuser:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        connection = ContractorCustomerConnection.objects.select_related(
            "customer", "contractor", "contractor__contractor_profile"
        ).filter(pk=pk).first()
        if not connection:
            return Response({"detail": "Customer connection not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "connection": connection_data(connection, request.user.role),
            "events": [{
                "id": entry.id,
                "action": entry.action,
                "action_label": entry.get_action_display(),
                "performed_by": (
                    entry.performed_by.get_full_name()
                    or entry.performed_by.bharath_id
                    or entry.performed_by.mobile
                ) if entry.performed_by else "System",
                "performed_by_role": entry.performed_by_role or "SYSTEM",
                "timestamp": entry.timestamp,
                "ip_address": entry.ip_address,
                "user_agent": entry.user_agent,
            } for entry in connection.audit_entries.select_related("performed_by")],
        })


class ApartmentCommunitySearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response([])
        communities = ApartmentCommunity.objects.filter(is_active=True).filter(
            models.Q(name__icontains=query)
            | models.Q(locality__icontains=query)
            | models.Q(zone__icontains=query)
            | models.Q(pincode__icontains=query)
        ).order_by("name", "locality")[:20]
        return Response([
            {
                "id": item.id,
                "name": item.name,
                "zone": item.zone,
                "locality": item.locality,
                "pincode": item.pincode,
                "map_url": item.map_url,
                "latitude": item.latitude,
                "longitude": item.longitude,
            }
            for item in communities
        ])


def apartment_data(item):
    return {
        "id": item.id, "name": item.name, "zone": item.zone,
        "locality": item.locality, "pincode": item.pincode,
        "is_active": item.is_active,
        "sort_order": item.sort_order,
    }



class ApartmentCommunityMasterView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in {BharathUser.Roles.ADMIN, BharathUser.Roles.CONTRACTOR}:
            return Response({"detail": "Admin or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        items = apply_user_sort_preferences(
            ApartmentCommunity.objects.filter(is_active=True).order_by("sort_order", "name", "locality"),
            request.user,
            "apartments",
        )

        return Response([apartment_data(item) for item in items])

    def post(self, request):
        if request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get("name") or "").strip()
        pincode = str(request.data.get("pincode") or "").strip()
        if not name or len(name) > 200 or len(pincode) > 10:
            return Response({"name": "Enter an apartment name (up to 200 characters) and PIN code (up to 10 characters)."}, status=status.HTTP_400_BAD_REQUEST)
        locality = str(request.data.get("locality") or "").strip()
        zone = str(request.data.get("zone") or "").strip()
        if len(locality) > 160 or len(zone) > 120:
            return Response({"detail": "Locality or zone is too long."}, status=status.HTTP_400_BAD_REQUEST)
        existing = ApartmentCommunity.objects.filter(name__iexact=name, pincode=pincode).first()
        if existing:
            if existing.is_active:
                return Response({"name": "This apartment and PIN code already exist. Edit the existing entry."}, status=status.HTTP_400_BAD_REQUEST)
            existing.locality, existing.zone, existing.is_active = locality, zone, True
            existing.save(update_fields=["locality", "zone", "is_active", "updated_at"])
            return Response(apartment_data(existing))
        top = ApartmentCommunity.objects.aggregate(top=models.Max("sort_order"))["top"] or 0
        item = ApartmentCommunity.objects.create(name=name, pincode=pincode, locality=locality, zone=zone, sort_order=top + 10)
        return Response(apartment_data(item), status=status.HTTP_201_CREATED)



class ApartmentCommunityMasterDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ApartmentCommunity.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)
        values = {field: str(request.data.get(field, getattr(item, field)) or "").strip()
                  for field in ("name", "pincode", "locality", "zone")}
        if not values["name"] or len(values["name"]) > 200 or len(values["pincode"]) > 10 or len(values["locality"]) > 160 or len(values["zone"]) > 120:
            return Response({"detail": "Check the apartment name and field lengths."}, status=status.HTTP_400_BAD_REQUEST)
        if ApartmentCommunity.objects.exclude(pk=pk).filter(name__iexact=values["name"], pincode=values["pincode"]).exists():
            return Response({"name": "This apartment and PIN code already exist."}, status=status.HTTP_400_BAD_REQUEST)
        for field, value in values.items():
            setattr(item, field, value)
        changed = [*values]
        if "is_active" in request.data:
            item.is_active = bool(request.data.get("is_active"))
            changed.append("is_active")
        if "sort_order" in request.data:
            item.sort_order = max(int(request.data.get("sort_order") or 0), 0)
            changed.append("sort_order")
        item.save(update_fields=[*changed, "updated_at"])
        return Response(apartment_data(item))


    def delete(self, request, pk):
        if request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ApartmentCommunity.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)
        item.is_active = False
        item.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActivityLogListView(generics.ListAPIView):
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ActivityLog.objects.select_related("actor")
        if self.request.user.role != BharathUser.Roles.ADMIN:
            queryset = queryset.filter(actor=self.request.user)
        module = self.request.query_params.get("module", "").strip()
        action = self.request.query_params.get("action", "").strip().upper()
        search = self.request.query_params.get("search", "").strip()
        actor = self.request.query_params.get("actor", "").strip()
        actor_role = self.request.query_params.get("role", "").strip().upper()
        date_from = self.request.query_params.get("date_from", "").strip()
        date_to = self.request.query_params.get("date_to", "").strip()
        object_id = self.request.query_params.get("object_id", "").strip()
        flagged = self.request.query_params.get("flagged", "").strip().lower()
        if module:
            queryset = queryset.filter(module__iexact=module)
        if action:
            queryset = queryset.filter(action=action)
        if actor and self.request.user.role == BharathUser.Roles.ADMIN:
            queryset = queryset.filter(actor_id=actor)
        if actor_role and self.request.user.role == BharathUser.Roles.ADMIN:
            queryset = queryset.filter(actor_role=actor_role)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        if object_id:
            queryset = queryset.filter(object_id=object_id)
        if flagged in {"true", "1"}:
            queryset = queryset.filter(is_flagged=True)
        if search:
            queryset = queryset.filter(
                models.Q(actor_name__icontains=search) |
                models.Q(description__icontains=search) |
                models.Q(module__icontains=search) |
                models.Q(object_id__icontains=search)
            )
        return queryset[:500]


class ActivityLogSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = ActivityLog.objects.all()
        if request.user.role != BharathUser.Roles.ADMIN:
            queryset = queryset.filter(actor=request.user)
        recent = queryset.filter(created_at__gte=timezone.now() - timedelta(days=60))
        today = timezone.localdate()
        return Response({
            "total": recent.count(),
            "today": recent.filter(created_at__date=today).count(),
            "flagged": queryset.filter(is_flagged=True, reviewed_at__isnull=True).count(),
            "active_users": recent.exclude(actor=None).values("actor").distinct().count(),
            "by_action": list(recent.values("action").annotate(count=models.Count("id")).order_by("-count")),
            "by_module": list(recent.values("module").annotate(count=models.Count("id")).order_by("-count")[:8]),
        })


class ActivityLogExportView(ActivityLogListView):
    pagination_class = None

    def get(self, request, *args, **kwargs):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="activity-log.csv"'
        writer = csv.writer(response)
        writer.writerow(["Date and time", "User", "Role", "Action", "Process", "Activity", "Record ID", "Reviewed"])
        for log in self.get_queryset():
            writer.writerow([timezone.localtime(log.created_at).strftime("%Y-%m-%d %H:%M:%S"), log.actor_name, log.actor_role, log.get_action_display(), log.module, log.description, log.object_id, "Yes" if log.reviewed_at else "No"])
        return response


class ActivityLogReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Admin access only."}, status=403)
        log = ActivityLog.objects.filter(pk=pk).first()
        if not log:
            return Response({"detail": "Activity not found."}, status=404)
        log.review_note = str(request.data.get("review_note", ""))[:2000]
        log.is_flagged = bool(request.data.get("is_flagged", log.is_flagged))
        log.reviewed_at = timezone.now()
        log.reviewed_by = request.user
        log.save(update_fields=("review_note", "is_flagged", "reviewed_at", "reviewed_by"))
        return Response(ActivityLogSerializer(log).data)


class IsVerifiedContractor(BasePermission):
    message = "Only verified contractors can access quotations."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role == BharathUser.Roles.CONTRACTOR
            and user.is_verified
            and user.verification_status == BharathUser.VerificationStatus.VERIFIED
        )


# ============================================================
# MASTER DATA
# ============================================================

class MasterDataImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, section):
        if section not in MASTER_MODELS:
            return Response({"detail": "Unknown Master Data section."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role not in {BharathUser.Roles.ADMIN, BharathUser.Roles.CONTRACTOR}:
            return Response({"detail": "Admin or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        if section == "apartments" and request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Only administrators can update the shared apartment directory."}, status=status.HTTP_403_FORBIDDEN)
        try:
            result = import_master_rows(section, request.FILES.get("file"), request.user)
        except ValueError as error:
            return Response({"file": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

class ContractorOwnedCreateListView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        if self.request.user.role not in {BharathUser.Roles.ADMIN, BharathUser.Roles.CONTRACTOR}:
            raise ValidationError({"detail": "Admin or contractor access only."})
        duplicate = self.get_queryset().filter(name__iexact=serializer.validated_data.get("name", ""))
        if isinstance(serializer, WorkDescriptionSerializer):
            duplicate = duplicate.filter(service_category=serializer.validated_data.get("service_category"))
        elif isinstance(serializer, ServiceTypeSerializer):
            category_master = serializer.validated_data.get("category_master")
            duplicate = duplicate.filter(category_master=category_master) if category_master else duplicate.filter(category__iexact=serializer.validated_data.get("category", "Painting"))
        existing = duplicate.first()
        if existing:
            serializer.instance = existing
            return
        model = serializer.Meta.model
        serializer.save(
            created_by=None if self.request.user.role == BharathUser.Roles.ADMIN else self.request.user,
            sort_order=(model.objects.aggregate(top=models.Max("sort_order"))["top"] or 0) + 10,
        )

    def visible_master_data(self, model_class, section=None):
        user = self.request.user
        scope = models.Q(created_by__isnull=True) | models.Q(created_by__role=BharathUser.Roles.ADMIN)
        if user.role != BharathUser.Roles.ADMIN:
            scope |= models.Q(created_by=user)
        queryset = model_class.objects.filter(scope, is_active=True).order_by("sort_order", "name")
        return apply_user_sort_preferences(queryset, user, section or section_for_model(model_class))


def section_for_model(model_class):
    for section, model in MASTER_MODELS.items():
        if model is model_class:
            return section
    if model_class is ServiceType:
        return "service-types"
    raise ValueError(f"No master data section registered for {model_class!r}")


def user_sort_preferences(user, section):
    if not section or user.is_anonymous:
        return {}
    return dict(
        MasterDataSortPreference.objects.filter(user=user, section=section)
        .values_list("entry_id", "position")
    )


def apply_user_sort_preferences(queryset, user, section):
    """Overlay the caller's own order on the section's default order.

    Ranked rows come first in the caller's sequence, then everything else in
    the default sort_order/name order. The sort stays in SQL so callers keep a
    queryset (WorkDescriptionListCreateView chains select_related on it).
    """
    preferences = user_sort_preferences(user, section)
    if not preferences:
        return queryset
    rank = models.Case(
        *[models.When(pk=entry_id, then=models.Value(position)) for entry_id, position in preferences.items()],
        default=models.Value(0),
        output_field=models.IntegerField(),
    )
    return queryset.annotate(
        user_rank=models.Case(
            models.When(pk__in=list(preferences), then=models.Value(1)),
            default=models.Value(0),
            output_field=models.IntegerField(),
        ),
        user_position=rank,
    ).order_by("-user_rank", "user_position", "sort_order", "name")


class MasterDataReorderView(APIView):
    """Store the caller's private order for one master data section.

    Accepts the full ordered id list so that a filtered view can never wipe the
    ranks of rows it is not showing. Unknown or invisible ids are rejected
    rather than silently dropping preferences.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, section):
        if request.user.role not in {BharathUser.Roles.ADMIN, BharathUser.Roles.CONTRACTOR}:
            raise ValidationError({"detail": "Admin or contractor access only."})
        model_class = MASTER_MODELS.get(section)
        if model_class is None:
            raise ValidationError({"detail": "Unknown section."})

        raw_ids = request.data.get("entry_ids", [])
        if not isinstance(raw_ids, list):
            raise ValidationError({"entry_ids": "Send a list of ids."})
        try:
            entry_ids = [int(value) for value in raw_ids]
        except (TypeError, ValueError):
            raise ValidationError({"entry_ids": "Ids must be integers."})
        if len(set(entry_ids)) != len(entry_ids):
            raise ValidationError({"entry_ids": "Duplicate ids in the order."})

        section_key = section_for_model(model_class)

        if not entry_ids:
            MasterDataSortPreference.objects.filter(user=request.user, section=section_key).delete()
            return Response({"section": section_key, "ordered_count": 0, "reset": True})

        # Apartments have no created_by and are visible to every contractor,
        # so the shared scope filter does not apply to them. Ownership is the
        # only thing worth validating here: an entry the caller can see may be
        # inactive, and a rank stored for it should not be rejected.
        if model_class is ApartmentCommunity:
            permitted = model_class.objects.all()
        else:
            scope = models.Q(created_by__isnull=True) | models.Q(created_by__role=BharathUser.Roles.ADMIN)
            if request.user.role != BharathUser.Roles.ADMIN:
                scope |= models.Q(created_by=request.user)
            permitted = model_class.objects.filter(scope)
        visible_ids = set(permitted.filter(pk__in=entry_ids).values_list("pk", flat=True))
        unknown = [entry_id for entry_id in entry_ids if entry_id not in visible_ids]
        if unknown:
            raise ValidationError({"entry_ids": f"Not visible in this section: {unknown}"})

        with transaction.atomic():
            MasterDataSortPreference.objects.filter(user=request.user, section=section_key).delete()
            MasterDataSortPreference.objects.bulk_create(
                [
                    MasterDataSortPreference(
                        user=request.user, section=section_key, entry_id=entry_id, position=(index + 1) * 10
                    )
                    for index, entry_id in enumerate(entry_ids)
                ]
            )
        return Response({"section": section_key, "ordered_count": len(entry_ids), "reset": False})


class AreaListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = AreaSerializer

    def get_queryset(self):
        return self.visible_master_data(Area)


class MeasurementSurfaceTypeListCreateView(ContractorOwnedCreateListView):
    serializer_class = MeasurementSurfaceTypeSerializer

    def get_queryset(self):
        return self.visible_master_data(MeasurementSurfaceType)


class ServiceTypeListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = ServiceTypeSerializer

    def get_queryset(self):
        return self.visible_master_data(ServiceType)


class ServiceCategoryListCreateView(ContractorOwnedCreateListView):
    serializer_class = ServiceCategorySerializer

    def get_queryset(self):
        return self.visible_master_data(ServiceCategory)


class WorkDescriptionListCreateView(ContractorOwnedCreateListView):
    serializer_class = WorkDescriptionSerializer

    def get_queryset(self):
        return self.visible_master_data(WorkDescription).select_related("service_type")


class MasterDataDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    model_class = None

    def get_queryset(self):
        if self.request.user.role == BharathUser.Roles.ADMIN:
            return self.model_class.objects.filter(
                models.Q(created_by__isnull=True)
                | models.Q(created_by__role=BharathUser.Roles.ADMIN)
            )
        if self.request.user.role == BharathUser.Roles.CONTRACTOR:
            return self.model_class.objects.filter(created_by=self.request.user)
        return self.model_class.objects.none()

    def perform_destroy(self, instance):
        # Defaults may already be referenced by draft or historical documents.
        # Hide them from future selection rather than deleting the relationship.
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class ServiceTypeDetailView(MasterDataDetailView):
    serializer_class = ServiceTypeSerializer
    model_class = ServiceType


class ServiceCategoryDetailView(MasterDataDetailView):
    serializer_class = ServiceCategorySerializer
    model_class = ServiceCategory


class WorkDescriptionDetailView(MasterDataDetailView):
    serializer_class = WorkDescriptionSerializer
    model_class = WorkDescription


class AreaDetailView(MasterDataDetailView):
    serializer_class = AreaSerializer
    model_class = Area


class MeasurementSurfaceTypeDetailView(MasterDataDetailView):
    serializer_class = MeasurementSurfaceTypeSerializer
    model_class = MeasurementSurfaceType


class PaintTypeDetailView(MasterDataDetailView):
    serializer_class = PaintTypeSerializer
    model_class = PaintType


class PaintBrandDetailView(MasterDataDetailView):
    serializer_class = PaintBrandSerializer
    model_class = PaintBrand


class PaintTypeListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = PaintTypeSerializer

    def get_queryset(self):
        return self.visible_master_data(PaintType)


class PaintBrandListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = PaintBrandSerializer

    def get_queryset(self):
        return self.visible_master_data(PaintBrand)


class PaintColorListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = PaintColorSerializer

    def get_queryset(self):
        return PaintColor.objects.filter(
            models.Q(
                created_by=self.request.user
            )
            |
            models.Q(
                created_by__isnull=True
            ),
            is_active=True
        )


class UnitListCreateView(
    ContractorOwnedCreateListView
):

    serializer_class = UnitSerializer

    def get_queryset(self):
        return self.visible_master_data(Unit)


class UnitDetailView(MasterDataDetailView):
    serializer_class = UnitSerializer
    model_class = Unit


# ============================================================
# CUSTOMERS
# ============================================================

def link_customer_portal(customer):
    normalized = normalize_indian_mobile(customer.mobile)
    if not normalized:
        return customer
    matches = matching_mobile_users(normalized, BharathUser.objects.filter(role=BharathUser.Roles.CUSTOMER))
    portal_user = matches[0] if len(matches) == 1 else None
    if portal_user:
        customer.portal_user = portal_user
        customer.save(update_fields=("portal_user",))
        for connection in customer.contractor_connections.filter(status=ContractorCustomerConnection.Status.CONNECTED):
            ChatConversation.objects.get_or_create(
                customer=customer, contractor=connection.contractor,
                defaults={"connection": connection},
            )
    return customer


def customer_identity_ids(customer):
    """Return legacy and current CRM records that represent the same customer."""
    normalized = normalize_indian_mobile(customer.mobile)
    candidates = Customer.objects.all()
    if customer.portal_user_id:
        candidates = candidates.filter(
            models.Q(portal_user_id=customer.portal_user_id) |
            models.Q(portal_user__isnull=True)
        )
    matching = []
    for candidate in candidates.only("id", "mobile", "portal_user_id"):
        same_portal = customer.portal_user_id and candidate.portal_user_id == customer.portal_user_id
        same_mobile = normalized and normalize_indian_mobile(candidate.mobile) == normalized
        if same_portal or same_mobile:
            matching.append(candidate.id)
    return matching

def saved_contact_connection_defaults(customer, contractor):
    contact = SavedCustomerContact.objects.filter(customer=customer, contractor=contractor).first()
    if not contact:
        return {}
    mapping = {"status": "customer_status", "source": "customer_source", "client_type": "customer_client_type", "requirement": "requirement", "notes": "internal_notes", "next_follow_up": "next_follow_up"}
    return {target: contact.details[source] for source, target in mapping.items() if source in contact.details}


@transaction.atomic
def save_existing_customer_contact(request, customer, partial=False):
    connection = ContractorCustomerConnection.objects.select_for_update().filter(customer=customer, contractor=request.user).first()
    if not customer.portal_user_id or not customer.bharath_id:
        activate_customer_account(customer)
    if connection and connection.status == ContractorCustomerConnection.Status.CONNECTED:
        data = CustomerSerializer(customer, context={"request": request}).data
        data["already_saved"] = True
        return Response(data)
    if "mobile" in request.data and normalize_indian_mobile(request.data["mobile"]) != customer.normalized_mobile:
        raise ValidationError({"mobile": "Add a separate contact to save a different mobile number."})
    serializer = CustomerSerializer(customer, data=request.data, partial=partial, context={"request": request})
    serializer.is_valid(raise_exception=True)
    contact, created = SavedCustomerContact.objects.get_or_create(customer=customer, contractor=request.user)
    values = {key: value for key, value in serializer.validated_data.items() if key in SAVED_CONTACT_FIELDS}
    contact.details = {**contact.details, **values}
    contact.save(update_fields=("details", "updated_at"))
    if not connection:
        now = timezone.now()
        connection = ContractorCustomerConnection.objects.create(
            customer=customer, contractor=request.user, requested_by=request.user,
            status=ContractorCustomerConnection.Status.PENDING,
            requested_at=now, last_request_at=now,
            **saved_contact_connection_defaults(customer, request.user),
        )
        record_connection_audit(request, connection, CustomerConnectionAudit.Actions.REQUESTED)
        public = contractor_public_data(request.user)
        create_notification(customer.portal_user, "CONNECTION_REQUEST", "New contractor connection request",
                            f"{public['business_name']} wants to connect with your account.",
                            "/customer/connections?tab=pending", request.user)
    if connection:
        scoped_values = saved_contact_connection_defaults(customer, request.user)
        for field, value in scoped_values.items():
            setattr(connection, field, value)
        if scoped_values:
            connection.save(update_fields=tuple(scoped_values) + ("updated_at",))
    payload = saved_contact_representation(contact, connection)
    if connection.status in (ContractorCustomerConnection.Status.PENDING, ContractorCustomerConnection.Status.RECONNECT_PENDING):
        payload.update(issue_customer_share_link(connection, CustomerShareLink.Purpose.CONNECTION))
        payload["contractor_name"] = contractor_public_data(request.user)["business_name"]
    return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CustomerListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = CustomerSerializer

    def handle_exception(self, exc):
        if getattr(exc, "status_code", 500) >= 500:
            logger.exception(
                "Customer create/list request failed (user_id=%s)",
                getattr(getattr(self.request, "user", None), "pk", None),
            )
        return super().handle_exception(exc)

    def get_queryset(self):
        if self.request.user.role != BharathUser.Roles.CONTRACTOR:
            return Customer.objects.none()
        scope = models.Q(contractor_connections__contractor=self.request.user, contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED)
        if self.request.query_params.get("include_pending") == "1":
            scope |= models.Q(contractor_connections__contractor=self.request.user, contractor_connections__status=ContractorCustomerConnection.Status.PENDING)
        if self.request.query_params.get("include_saved") == "1":
            scope |= models.Q(saved_contacts__contractor=self.request.user)
        return Customer.objects.filter(scope).exclude(status=Customer.Status.CANCELLED).distinct().order_by("-updated_at")

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": ["Enter a valid Indian mobile number."]}, status=status.HTTP_400_BAD_REQUEST)
        from .customer_identity import release_deleted_customer_mobile
        release_deleted_customer_mobile(normalized)
        existing = Customer.objects.select_for_update().exclude(status=Customer.Status.CANCELLED).filter(normalized_mobile=normalized).first()
        if existing:
            return save_existing_customer_contact(request, existing)
        existing_account = find_user_by_normalized_mobile(normalized)
        if existing_account and existing_account.role != BharathUser.Roles.CUSTOMER:
            return Response(
                {"mobile": [f"This mobile number is already registered as a {existing_account.get_role_display()} account. Use a different customer mobile number."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            # The inner savepoint keeps the surrounding transaction usable when
            # another request creates this normalized mobile at the same time.
            with transaction.atomic():
                customer = serializer.save(contractor=request.user)
        except IntegrityError:
            existing = Customer.objects.exclude(status=Customer.Status.CANCELLED).filter(normalized_mobile=normalized).first()
            if not existing:
                raise
            return save_existing_customer_contact(request, existing)
        now = timezone.now()
        activate_customer_account(customer)
        connection = ContractorCustomerConnection.objects.create(
            customer=customer, contractor=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
            requested_by=request.user,
            requested_at=now, last_request_at=now, connected_at=now, approved_at=now, accepted_at=now,
            approval_method=ContractorCustomerConnection.ApprovalMethod.INITIAL_CREATOR,
            customer_status=customer.status,
            customer_source=customer.source,
            customer_client_type=customer.client_type,
            requirement=customer.requirement,
            internal_notes=customer.notes,
            next_follow_up=customer.next_follow_up,
        )
        ChatConversation.objects.get_or_create(
            customer=customer, contractor=request.user,
            defaults={"connection": connection},
        )
        record_connection_audit(request, connection, CustomerConnectionAudit.Actions.ACCEPTED)
        SavedCustomerContact.objects.get_or_create(customer=customer, contractor=request.user, defaults={"details": {"name": customer.name, "mobile": customer.mobile}})
        output = self.get_serializer(customer).data
        output["connection_status"] = connection.status
        output.update(issue_customer_share_link(connection, CustomerShareLink.Purpose.ACTIVATION))
        output["contractor_name"] = contractor_public_data(request.user)["business_name"]
        return Response(output, status=status.HTTP_201_CREATED)


class CustomerActivateAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            customer = Customer.objects.select_for_update().filter(pk=pk).first()
            connected = customer and ContractorCustomerConnection.objects.filter(
                customer=customer,
                contractor=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).exists()
            if request.user.role != BharathUser.Roles.CONTRACTOR or not connected:
                return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
            portal_user, _ = activate_customer_account(customer)
            payload = CustomerSerializer(customer, context={"request": request}).data
            payload["account_created"] = True
            payload["already_active"] = portal_user.has_usable_password()
            if not payload["already_active"]:
                payload.update(issue_customer_share_link(
                    ContractorCustomerConnection.objects.get(customer=customer, contractor=request.user),
                    CustomerShareLink.Purpose.ACTIVATION,
                ))
                payload["contractor_name"] = contractor_public_data(request.user)["business_name"]
            return Response(payload)
        except ValidationError:
            raise
        except Exception:
            logger.exception(
                "Customer ID creation failed (customer_id=%s, contractor_id=%s)",
                pk, request.user.pk,
            )
            raise


# ============================================================
# CUSTOMER PROPERTIES
# ============================================================

class PropertyListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = PropertySerializer

    def get_queryset(self):
        return Property.objects.filter(contractor_property_scope(self.request.user), contractor_hidden_at__isnull=True).distinct().order_by("-created_at")

    def perform_create(self, serializer):
        customer = serializer.validated_data["customer"]
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer, contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({"customer": "A customer connection request is required before creating a property."})
        if "measurement_unit" in self.request.data:
            property_obj = serializer.save(contractor=self.request.user, connection=connection)
            ensure_legacy_primary_contact(property_obj)
            return
        profile = getattr(self.request.user, "contractor_profile", None)
        property_obj = serializer.save(contractor=self.request.user, connection=connection, measurement_unit=getattr(profile, "default_measurement_unit", "FEET"))
        ensure_legacy_primary_contact(property_obj)


class PropertyDetailView(generics.RetrieveUpdateDestroyAPIView):

    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer

    def get_queryset(self):
        return Property.objects.filter(contractor_property_scope(self.request.user)).distinct()

    def perform_destroy(self, instance):
        instance.contractor_hidden_at = timezone.now()
        instance.save(update_fields=("contractor_hidden_at",))


PROPERTY_INVITATION_LIFETIME = timedelta(days=7)


def property_access_audit(request, property_obj, action, *, contact=None, invitation=None, details=None):
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    return PropertyAccessAudit.objects.create(
        property=property_obj,
        contact=contact,
        invitation=invitation,
        performed_by=request.user if request.user.is_authenticated else None,
        action=action,
        details=details or {},
        ip_address=forwarded or request.META.get("REMOTE_ADDR") or None,
        user_agent=str(request.META.get("HTTP_USER_AGENT") or "")[:255],
    )


def property_invitation_digest(token):
    if not isinstance(token, str) or not token or len(token) > 100:
        return ""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def property_invitation_data(invitation, *, include_target=False):
    property_obj = invitation.property
    data = {
        "id": invitation.id,
        "property_id": property_obj.id,
        "property_name": property_obj.name or property_obj.property_type,
        "property_type": property_obj.property_type,
        "city": property_obj.city,
        "role": invitation.role,
        "relationship": invitation.relationship,
        "access_level": invitation.access_level,
        "custom_permissions": invitation.custom_permissions,
        "requires_mobile": bool(invitation.invitee_mobile),
        "requires_email": bool(invitation.invitee_email),
        "status": invitation.status,
        "expires_at": invitation.expires_at,
        "created_at": invitation.created_at,
        "accepted_at": invitation.accepted_at,
    }
    if include_target:
        data.update({
            "invitee_name": invitation.invitee_name,
            "invitee_mobile": invitation.invitee_mobile,
            "invitee_email": invitation.invitee_email,
        })
    return data


def property_contact_share_data(contact):
    return {
        "id": contact.id,
        "customer_id": contact.customer_id,
        "name": contact.customer.name,
        "bharath_id": masked_customer_id(contact.customer.bharath_id),
        "mobile": masked_mobile(contact.customer.mobile),
        "relationship": contact.relationship,
        "access_level": contact.access_level,
        "custom_permissions": contact.custom_permissions,
        "status": contact.status,
        "is_primary": contact.is_primary,
    }


def property_share_access(request, property_obj):
    if request.user.role not in (BharathUser.Roles.CUSTOMER, BharathUser.Roles.CONTRACTOR):
        return False
    return has_property_access(request.user, property_obj, PropertyPermission.INVITE_CONTACTS)


def create_property_share(request, property_obj):
    if not property_share_access(request, property_obj):
        raise PermissionDenied("You cannot share access to this property.")

    mobile_input = str(request.data.get("mobile") or "").strip()
    normalized_mobile = normalize_indian_mobile(mobile_input)
    if not normalized_mobile:
        raise ValidationError({"mobile": "Enter a valid mobile number before searching or sharing."})

    customer = Customer.objects.select_for_update().exclude(
        status=Customer.Status.CANCELLED,
    ).filter(normalized_mobile=normalized_mobile).select_related("portal_user").first()
    expected_customer_id = request.data.get("customer_id")
    if expected_customer_id and (not customer or str(customer.pk) != str(expected_customer_id)):
        raise ValidationError({"customer": "The searched customer no longer matches this mobile number. Search again."})

    relationship = str(request.data.get("relationship") or "").upper()
    if relationship not in {"", *PropertyContact.Relationship.values}:
        raise ValidationError({"relationship": "Choose a valid relationship."})
    access_level = str(request.data.get("access_level") or PropertyContact.AccessLevel.VIEW_ONLY).upper()
    if access_level not in PropertyContact.AccessLevel.values:
        raise ValidationError({"access_level": "Choose a valid access level."})
    custom_permissions = request.data.get("custom_permissions") or []
    if not isinstance(custom_permissions, list):
        raise ValidationError({"custom_permissions": "Choose a list of custom permissions."})
    permission_values = {value for name, value in vars(PropertyPermission).items() if name.isupper()}
    custom_permissions = sorted({str(value) for value in custom_permissions if str(value) in permission_values})
    if access_level == PropertyContact.AccessLevel.CUSTOM and not custom_permissions:
        raise ValidationError({"custom_permissions": "Choose at least one permission for custom access."})
    email_input = str(request.data.get("email") or "").strip().lower()
    if email_input:
        try:
            validate_email(email_input)
        except DjangoValidationError:
            raise ValidationError({"email": "Enter a valid email address."})

    invitation_qs = PropertyInvitation.objects.select_for_update().filter(
        property=property_obj,
        status=PropertyInvitation.Status.PENDING,
        invitee_mobile=normalized_mobile,
    )
    pending_invitation = invitation_qs.order_by("-created_at", "-id").first()

    if customer:
        contact = PropertyContact.objects.select_for_update().filter(
            property=property_obj, customer=customer,
        ).first()
        if contact and contact.is_primary:
            return {"state": "ACTIVE", "customer": property_contact_share_data(contact), "already_linked": True}

        if contact and request.user.role == BharathUser.Roles.CONTRACTOR:
            if contact.status == PropertyContact.Status.ACTIVE:
                return {"state": "ACTIVE", "customer": property_contact_share_data(contact), "already_linked": True}
            if contact.added_by_id != request.user.id:
                return {"state": contact.status, "customer": property_contact_share_data(contact), "already_linked": False}

        if contact and contact.status == PropertyContact.Status.ACTIVE:
            contact.relationship = relationship
            contact.access_level = access_level
            contact.custom_permissions = custom_permissions
            contact.save(update_fields=("relationship", "access_level", "custom_permissions", "updated_at"))
            if pending_invitation:
                pending_invitation.status = PropertyInvitation.Status.REVOKED
                pending_invitation.revoked_at = timezone.now()
                pending_invitation.save(update_fields=("status", "revoked_at", "updated_at"))
            property_access_audit(request, property_obj, "CONTACT_ACCESS_UPDATED", contact=contact, details={"access_level": access_level, "relationship": relationship})
            return {"state": "ACTIVE", "customer": property_contact_share_data(contact), "already_linked": True}

        if customer.portal_user_id:
            if pending_invitation:
                pending_invitation.status = PropertyInvitation.Status.REVOKED
                pending_invitation.revoked_at = timezone.now()
                pending_invitation.save(update_fields=("status", "revoked_at", "updated_at"))
            defaults = {
                "relationship": relationship,
                "access_level": access_level,
                "custom_permissions": custom_permissions,
                "role": PropertyContact.Role.AUTHORIZED_CONTACT,
                "added_by": request.user,
            }
            if contact is None:
                contact, contact_created = PropertyContact.objects.get_or_create(
                    property=property_obj,
                    customer=customer,
                    defaults={"status": PropertyContact.Status.PENDING, **defaults},
                )
            else:
                contact_created = False
            if not contact_created and contact.status != PropertyContact.Status.ACTIVE:
                contact.relationship = relationship
                contact.access_level = access_level
                contact.custom_permissions = custom_permissions
                contact.status = PropertyContact.Status.PENDING
                contact.added_by = request.user
                contact.save(update_fields=("relationship", "access_level", "custom_permissions", "status", "added_by", "updated_at"))
            property_access_audit(
                request, property_obj, "PROPERTY_ACCESS_REQUESTED", contact=contact,
                details={"access_level": access_level, "relationship": relationship},
            )
            if contact.status == PropertyContact.Status.PENDING:
                create_notification(
                    customer.portal_user, "PROPERTY_ACCESS_REQUEST", "Property access request",
                    f"{request.user.get_full_name() or request.user.mobile} has shared {property_obj.name or property_obj.property_type} with you.",
                    "/customer-properties", request.user,
                )
            return {"state": contact.status, "customer": property_contact_share_data(contact), "already_linked": contact.status == PropertyContact.Status.ACTIVE}

        if contact:
            contact.relationship = relationship
            contact.access_level = access_level
            contact.custom_permissions = custom_permissions
            contact.status = PropertyContact.Status.PENDING
            contact.added_by = request.user
            contact.save(update_fields=("relationship", "access_level", "custom_permissions", "status", "added_by", "updated_at"))
            if pending_invitation:
                pending_invitation.status = PropertyInvitation.Status.REVOKED
                pending_invitation.revoked_at = timezone.now()
                pending_invitation.save(update_fields=("status", "revoked_at", "updated_at"))
            property_access_audit(request, property_obj, "PROPERTY_ACCESS_REQUESTED", contact=contact, details={"access_level": access_level, "relationship": relationship})
        else:
            contact, _created = PropertyContact.objects.get_or_create(
                property=property_obj,
                customer=customer,
                defaults={
                    "status": PropertyContact.Status.PENDING,
                    "relationship": relationship,
                    "access_level": access_level,
                    "custom_permissions": custom_permissions,
                    "role": PropertyContact.Role.AUTHORIZED_CONTACT,
                    "added_by": request.user,
                },
            )
            if contact.status == PropertyContact.Status.ACTIVE:
                return {"state": "ACTIVE", "customer": property_contact_share_data(contact), "already_linked": True}
            property_access_audit(request, property_obj, "PROPERTY_ACCESS_REQUESTED", contact=contact, details={"access_level": access_level, "relationship": relationship})
        # Existing CRM identities without a portal login keep their Customer
        # row and pending contact. The invitation only provisions the login.
        invitee_customer = customer
    else:
        invitee_customer = None

    if pending_invitation:
        token = secrets.token_urlsafe(32)
        pending_invitation.invitee_customer = invitee_customer or pending_invitation.invitee_customer
        pending_invitation.invitee_name = str(request.data.get("name") or (invitee_customer.name if invitee_customer else pending_invitation.invitee_name)).strip()[:150]
        pending_invitation.invitee_email = email_input or pending_invitation.invitee_email
        pending_invitation.relationship = relationship
        pending_invitation.access_level = access_level
        pending_invitation.custom_permissions = custom_permissions
        pending_invitation.role = PropertyContact.Role.AUTHORIZED_CONTACT
        pending_invitation.token_hash = property_invitation_digest(token)
        pending_invitation.expires_at = timezone.now() + PROPERTY_INVITATION_LIFETIME
        pending_invitation.save(update_fields=(
            "invitee_customer", "invitee_name", "invitee_email", "relationship", "access_level",
            "custom_permissions", "role", "token_hash", "expires_at", "updated_at",
        ))
        property_access_audit(request, property_obj, "INVITATION_RESENT", invitation=pending_invitation, details={"access_level": access_level})
        return {"state": "INVITATION_PENDING", "invitation": property_invitation_data(pending_invitation, include_target=True), "invite_url": f"/join/property/{token}", "reused": True}

    token = secrets.token_urlsafe(32)
    try:
        with transaction.atomic():
            invitation = PropertyInvitation.objects.create(
                property=property_obj,
                invited_by=request.user,
                invitee_customer=invitee_customer,
                invitee_name=str(request.data.get("name") or (invitee_customer.name if invitee_customer else "")).strip()[:150],
                invitee_mobile=normalized_mobile,
                invitee_email=email_input,
                relationship=relationship,
                access_level=access_level,
                custom_permissions=custom_permissions,
                role=PropertyContact.Role.AUTHORIZED_CONTACT,
                token_hash=property_invitation_digest(token),
                expires_at=timezone.now() + PROPERTY_INVITATION_LIFETIME,
            )
    except IntegrityError:
        if PropertyInvitation.objects.filter(
            property=property_obj,
            status=PropertyInvitation.Status.PENDING,
            invitee_mobile=normalized_mobile,
        ).exists():
            return create_property_share(request, property_obj)
        raise
    property_access_audit(request, property_obj, "INVITATION_CREATED", invitation=invitation, details={"access_level": access_level})
    target_user = invitee_customer.portal_user if invitee_customer else None
    if target_user:
        create_notification(
            target_user, "PROPERTY_INVITATION", "Property access invitation",
            f"You have been invited to {property_obj.name or property_obj.property_type}.",
            f"/join/property/{token}", request.user,
        )
    return {"state": "INVITATION_CREATED", "customer_exists": bool(customer), "invitation": property_invitation_data(invitation, include_target=True), "invite_url": f"/join/property/{token}"}


class PropertyInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, property_id):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Only property customer contacts can manage invitations."}, status=status.HTTP_403_FORBIDDEN)
        property_obj = get_object_or_404(Property, pk=property_id)
        require_property_access(request.user, property_obj, PropertyPermission.MANAGE_CONTACTS)
        ensure_legacy_primary_contact(property_obj)
        contacts = [{
            "id": contact.id,
            "customer_id": contact.customer_id,
            "name": contact.customer.name,
            "role": contact.role,
            "relationship": contact.relationship,
            "access_level": contact.access_level,
            "custom_permissions": contact.custom_permissions,
            "status": contact.status,
            "is_primary": contact.is_primary,
            "created_at": contact.created_at,
        } for contact in property_obj.contacts.select_related("customer")]
        invitations = [
            property_invitation_data(item, include_target=True)
            for item in property_obj.invitations.all()
        ]
        return Response({"contacts": contacts, "invitations": invitations})

    @transaction.atomic
    def post(self, request, property_id):
        property_obj = get_object_or_404(Property.objects.select_for_update(), pk=property_id)
        result = create_property_share(request, property_obj)
        return Response(result, status=status.HTTP_201_CREATED if result["state"] == "INVITATION_CREATED" else status.HTTP_202_ACCEPTED if result["state"] == PropertyContact.Status.PENDING else status.HTTP_200_OK)


class PropertyShareLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, property_id):
        property_obj = get_object_or_404(Property, pk=property_id)
        if not property_share_access(request, property_obj):
            return Response({"detail": "You cannot search customers for this property."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": "Enter a valid mobile number."}, status=status.HTTP_400_BAD_REQUEST)
        customer = Customer.objects.exclude(status=Customer.Status.CANCELLED).filter(normalized_mobile=normalized).first()
        pending_invitation = PropertyInvitation.objects.filter(
            property=property_obj, status=PropertyInvitation.Status.PENDING, invitee_mobile=normalized,
        ).order_by("-created_at", "-id").first()
        if not customer:
            account_matches = matching_mobile_users(normalized, BharathUser.objects.all())
            account_conflict = next((item for item in account_matches if item.role != BharathUser.Roles.CUSTOMER), None)
            if account_conflict:
                return Response({
                    "found": False,
                    "account_conflict": True,
                    "message": "This mobile number belongs to a different account type and cannot be added as a customer.",
                })
            return Response({
                "found": False,
                "normalized_mobile": normalized,
                "account_exists_without_customer": bool(account_matches),
                "pending_invitation": property_invitation_data(pending_invitation) if pending_invitation else None,
            })

        contact = PropertyContact.objects.filter(property=property_obj, customer=customer).first()
        invitation = pending_invitation
        return Response({
            "found": True,
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "mobile": masked_mobile(customer.mobile),
                "bharath_id": masked_customer_id(customer.bharath_id),
                "has_account": bool(customer.portal_user_id),
            },
            "contact": property_contact_share_data(contact) if contact else None,
            "can_edit_access": bool(
                request.user.role == BharathUser.Roles.CUSTOMER
                and contact
                and not contact.is_primary
                and has_property_access(request.user, property_obj, PropertyPermission.INVITE_CONTACTS)
            ),
            "pending_invitation": property_invitation_data(invitation) if invitation else None,
        })


class PropertyShareView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, property_id):
        property_obj = get_object_or_404(Property.objects.select_for_update(), pk=property_id)
        result = create_property_share(request, property_obj)
        if result["state"] == "INVITATION_CREATED":
            response_status = status.HTTP_201_CREATED
        elif result["state"] == PropertyContact.Status.PENDING:
            response_status = status.HTTP_202_ACCEPTED
        else:
            response_status = status.HTTP_200_OK
        return Response(result, status=response_status)


class CustomerPropertyShareRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        contacts = PropertyContact.objects.filter(
            customer__portal_user=request.user,
            status=PropertyContact.Status.PENDING,
        ).select_related("property").order_by("-created_at")
        return Response([{
            "id": contact.id,
            "property_id": contact.property_id,
            "property_name": contact.property.name or contact.property.property_type,
            "property_type": contact.property.property_type,
            "city": contact.property.city,
            "relationship": contact.relationship,
            "access_level": contact.access_level,
            "custom_permissions": contact.custom_permissions,
            "requested_at": contact.created_at,
        } for contact in contacts])


class CustomerPropertyShareRequestRespondView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, contact_id):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        contact = PropertyContact.objects.select_for_update().select_related(
            "property", "customer",
        ).filter(
            pk=contact_id,
            customer__portal_user=request.user,
            status=PropertyContact.Status.PENDING,
        ).first()
        if not contact:
            return Response({"detail": "Property access request not found."}, status=status.HTTP_404_NOT_FOUND)
        decision = str(request.data.get("action") or "").upper()
        if decision not in {"ACCEPT", "DECLINE"}:
            return Response({"action": "Choose accept or decline."}, status=status.HTTP_400_BAD_REQUEST)
        contact.status = PropertyContact.Status.ACTIVE if decision == "ACCEPT" else PropertyContact.Status.DECLINED
        contact.save(update_fields=("status", "updated_at"))
        property_access_audit(
            request, contact.property,
            "PROPERTY_ACCESS_ACCEPTED" if decision == "ACCEPT" else "PROPERTY_ACCESS_DECLINED",
            contact=contact,
            details={"access_level": contact.access_level, "relationship": contact.relationship},
        )
        primary = contact.property.contacts.filter(is_primary=True).select_related("customer__portal_user").first()
        if primary:
            decision_word = "accepted" if decision == "ACCEPT" else "declined"
            create_notification(
                primary.customer.portal_user,
                "PROPERTY_ACCESS_RESPONSE",
                "Property access response",
                f"{request.user.get_full_name() or request.user.mobile} {decision_word} access to {contact.property.name or contact.property.property_type}.",
                f"/customer-properties/{contact.property_id}/access",
                request.user,
            )
        return Response({
            "detail": "Property access accepted." if decision == "ACCEPT" else "Property access declined.",
            "property_id": contact.property_id,
            "status": contact.status,
        })


class PropertyInvitationTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        invitation = PropertyInvitation.objects.select_related("property").filter(
            token_hash=property_invitation_digest(token),
            status=PropertyInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).first()
        if not invitation:
            return Response({"detail": "This property invitation is invalid or has expired."}, status=status.HTTP_404_NOT_FOUND)
        response = Response(property_invitation_data(invitation))
        response["Cache-Control"] = "no-store"
        return response


class PropertyInvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, token):
        invitation = PropertyInvitation.objects.select_for_update().select_related(
            "property", "invitee_customer__portal_user",
        ).filter(
            token_hash=property_invitation_digest(token),
            status=PropertyInvitation.Status.PENDING,
        ).first()
        if not invitation or invitation.expires_at <= timezone.now():
            return Response({"detail": "This property invitation is invalid or has expired."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Sign in with the invited customer account to accept."}, status=status.HTTP_403_FORBIDDEN)

        user_mobile = normalize_indian_mobile(request.user.mobile)
        user_emails = {
            str(getattr(request.user, "email", "") or "").strip().lower(),
            str(getattr(request.user, "recovery_email", "") or "").strip().lower(),
        } - {""}
        if invitation.invitee_mobile and user_mobile != invitation.invitee_mobile:
            return Response({"detail": "Sign in with the mobile number this invitation was sent to."}, status=status.HTTP_403_FORBIDDEN)
        if invitation.invitee_email and invitation.invitee_email.lower() not in user_emails:
            return Response({"detail": "Sign in with the email address this invitation was sent to."}, status=status.HTTP_403_FORBIDDEN)

        customer = invitation.invitee_customer
        if customer and customer.portal_user_id and customer.portal_user_id != request.user.id:
            return Response({"detail": "This invitation is linked to a different customer account."}, status=status.HTTP_403_FORBIDDEN)
        if customer is None:
            customer = Customer.objects.filter(portal_user=request.user).first()
        if customer is None and invitation.invitee_mobile:
            customer = Customer.objects.filter(normalized_mobile=invitation.invitee_mobile).first()
        if customer is None and invitation.invitee_email:
            customer = Customer.objects.filter(email__iexact=invitation.invitee_email).first()
        if customer is None:
            if invitation.invitee_mobile and normalize_indian_mobile(request.user.mobile) == invitation.invitee_mobile:
                try:
                    with transaction.atomic():
                        customer = Customer.objects.create(
                            name=invitation.invitee_name or request.user.get_full_name() or request.user.mobile,
                            mobile=request.user.mobile,
                            email=request.user.email or invitation.invitee_email,
                            portal_user=request.user,
                        )
                except IntegrityError:
                    customer = Customer.objects.filter(normalized_mobile=invitation.invitee_mobile).first()
            if customer is None:
                return Response({"detail": "A Customer profile could not be created for this account. Please retry."}, status=status.HTTP_409_CONFLICT)
        if customer.portal_user_id not in (None, request.user.id):
            return Response({"detail": "This customer profile is linked to another account."}, status=status.HTTP_403_FORBIDDEN)
        if customer.portal_user_id is None:
            customer.portal_user = request.user
            customer.save(update_fields=("portal_user", "updated_at"))

        ensure_legacy_primary_contact(invitation.property)
        contact, created = PropertyContact.objects.get_or_create(
            property=invitation.property,
            customer=customer,
            defaults={
                "role": PropertyContact.Role.AUTHORIZED_CONTACT,
                "relationship": invitation.relationship,
                "access_level": invitation.access_level,
                "custom_permissions": invitation.custom_permissions,
                "status": PropertyContact.Status.ACTIVE,
                "added_by": invitation.invited_by,
            },
        )
        if not created:
            if contact.status != PropertyContact.Status.PENDING:
                return Response({"detail": "This customer already has access to the property."}, status=status.HTTP_409_CONFLICT)
            contact.relationship = invitation.relationship
            contact.access_level = invitation.access_level
            contact.custom_permissions = invitation.custom_permissions
            contact.status = PropertyContact.Status.ACTIVE
            contact.added_by = invitation.invited_by
            contact.save(update_fields=("relationship", "access_level", "custom_permissions", "status", "added_by", "updated_at"))
        invitation.invitee_customer = customer
        invitation.status = PropertyInvitation.Status.ACCEPTED
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=("invitee_customer", "status", "accepted_at", "updated_at"))
        property_access_audit(
            request, invitation.property, "INVITATION_ACCEPTED",
            contact=contact, invitation=invitation, details={"role": contact.role},
        )
        primary = invitation.property.contacts.filter(is_primary=True).select_related("customer__portal_user").first()
        if primary:
            create_notification(
                primary.customer.portal_user, "PROPERTY_CONTACT_ADDED", "Property contact added",
                f"{customer.name} accepted an invitation to {invitation.property.name or invitation.property.property_type}.",
                "/customer-properties", request.user,
            )
        return Response({
            "detail": "You now have access to this property.",
            "property_id": invitation.property_id,
            "contact_id": contact.id,
            "role": contact.role,
        })


class PropertyInvitationRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, invitation_id):
        invitation = PropertyInvitation.objects.select_for_update().select_related("property").filter(pk=invitation_id).first()
        if not invitation:
            return Response({"detail": "Property invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == BharathUser.Roles.CUSTOMER:
            require_property_access(request.user, invitation.property, PropertyPermission.INVITE_CONTACTS)
        elif request.user.role == BharathUser.Roles.CONTRACTOR:
            if invitation.invited_by_id != request.user.id or not has_property_access(request.user, invitation.property, PropertyPermission.INVITE_CONTACTS):
                return Response({"detail": "Only the connected contractor who sent this invitation can revoke it."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Property access only."}, status=status.HTTP_403_FORBIDDEN)
        if invitation.status != PropertyInvitation.Status.PENDING:
            return Response({"detail": "Only pending invitations can be revoked."}, status=status.HTTP_409_CONFLICT)
        invitation.status = PropertyInvitation.Status.REVOKED
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=("status", "revoked_at", "updated_at"))
        property_access_audit(
            request, invitation.property, "INVITATION_REVOKED", invitation=invitation,
        )
        invitee_user = invitation.invitee_customer.portal_user if invitation.invitee_customer_id else None
        if invitee_user:
            create_notification(
                invitee_user, "PROPERTY_INVITATION_REVOKED", "Property invitation revoked",
                f"The invitation for {invitation.property.name or invitation.property.property_type} is no longer available.",
                "/customer-properties", request.user,
            )
        return Response({"detail": "Property invitation revoked."})


class PropertyContactActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, property_id, action):
        is_customer = request.user.role == BharathUser.Roles.CUSTOMER
        is_contractor = request.user.role == BharathUser.Roles.CONTRACTOR
        if not (is_customer or is_contractor):
            return Response({"detail": "Customer or connected contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        if action not in {"transfer-primary", "leave", "remove", "change-role", "change-access"}:
            return Response({"detail": "Unknown property contact action."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            property_obj = Property.objects.select_for_update().filter(pk=property_id).first()
            if not property_obj:
                return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
            if is_contractor:
                if action != "remove" or not has_property_access(request.user, property_obj, PropertyPermission.INVITE_CONTACTS):
                    return Response({"detail": "This contractor action is not permitted."}, status=status.HTTP_403_FORBIDDEN)
                target = PropertyContact.objects.select_for_update().filter(
                    pk=request.data.get("contact_id"), property=property_obj,
                    added_by=request.user, status=PropertyContact.Status.PENDING,
                ).first()
                if not target:
                    return Response({"detail": "Pending share request not found."}, status=status.HTTP_404_NOT_FOUND)
                property_access_audit(request, property_obj, "PROPERTY_ACCESS_REQUEST_CANCELLED", contact=target)
                target.delete()
                return Response({"detail": "Pending property share request cancelled."})
            current = PropertyContact.objects.select_for_update().filter(
                property=property_obj,
                customer__portal_user=request.user,
            ).first()
            if not current:
                return Response({"detail": "You are not a contact for this property."}, status=status.HTTP_403_FORBIDDEN)

            if action == "leave":
                if current.is_primary:
                    return Response({"detail": "Transfer primary contact to another contact before leaving this property."}, status=status.HTTP_409_CONFLICT)
                if property_obj.contacts.count() <= 1:
                    return Response({"detail": "The only contact cannot leave this property."}, status=status.HTTP_409_CONFLICT)
                property_access_audit(
                    request, property_obj, "CONTACT_LEFT", contact=current,
                    details={"role": current.role},
                )
                primary_contact = property_obj.contacts.filter(is_primary=True).select_related("customer__portal_user").first()
                if primary_contact:
                    create_notification(
                        primary_contact.customer.portal_user, "PROPERTY_CONTACT_LEFT", "A contact left the property",
                        f"{current.customer.name} left {property_obj.name or property_obj.property_type}.",
                        f"/customer-properties/{property_obj.id}/access", request.user,
                    )
                current.delete()
                return Response({"detail": "You have left this property."})

            if action == "remove":
                target = PropertyContact.objects.select_for_update().filter(
                    pk=request.data.get("contact_id"), property=property_obj,
                ).first()
                if not target:
                    return Response({"contact_id": "Choose an existing contact on this property."}, status=status.HTTP_400_BAD_REQUEST)
                if target.is_primary:
                    return Response({"detail": "Transfer primary contact before removing this contact."}, status=status.HTTP_409_CONFLICT)
                if not current.is_primary and target.added_by_id != request.user.id and not has_property_access(
                    request.user, property_obj, PropertyPermission.MANAGE_CONTACTS,
                ):
                    return Response({"detail": "You cannot cancel this property access request."}, status=status.HTTP_403_FORBIDDEN)
                property_access_audit(
                    request, property_obj,
                    "PROPERTY_ACCESS_REQUEST_CANCELLED" if target.status == PropertyContact.Status.PENDING else "CONTACT_REMOVED",
                    contact=target,
                    details={"status": target.status},
                )
                create_notification(
                    target.customer.portal_user, "PROPERTY_ACCESS_REMOVED", "Property access removed",
                    f"You no longer have access to {property_obj.name or property_obj.property_type}.",
                    "/customer-properties", request.user,
                )
                target.delete()
                return Response({"detail": "Property contact removed."})

            if not current.is_primary:
                return Response({"detail": "Only the primary contact can make this change."}, status=status.HTTP_403_FORBIDDEN)

            if action == "transfer-primary":
                target = PropertyContact.objects.select_for_update().filter(
                    pk=request.data.get("contact_id"), property=property_obj,
                ).first()
                if not target:
                    return Response({"contact_id": "Choose an existing contact on this property."}, status=status.HTTP_400_BAD_REQUEST)
                if target.pk == current.pk:
                    return Response({"detail": "You are already the primary contact."}, status=status.HTTP_409_CONFLICT)
                if target.status != PropertyContact.Status.ACTIVE:
                    return Response({"detail": "Only an active property contact can become primary."}, status=status.HTTP_409_CONFLICT)
                previous_role = current.role
                current.role = PropertyContact.Role.OWNER
                current.is_primary = False
                current.save(update_fields=("role", "is_primary", "updated_at"))
                target.role = PropertyContact.Role.PRIMARY
                target.is_primary = True
                target.access_level = PropertyContact.AccessLevel.FULL_ACCESS
                target.save(update_fields=("role", "is_primary", "access_level", "updated_at"))
                property_access_audit(
                    request, property_obj, "PRIMARY_CONTACT_TRANSFERRED",
                    contact=target,
                    details={"previous_primary_contact_id": current.id, "previous_role": previous_role},
                )
                create_notification(
                    target.customer.portal_user, "PROPERTY_PRIMARY_TRANSFERRED", "You are now the primary contact",
                    f"You are now the primary contact for {property_obj.name or property_obj.property_type}.",
                    f"/customer-properties/{property_obj.id}", request.user,
                )
                create_notification(
                    current.customer.portal_user, "PROPERTY_PRIMARY_TRANSFERRED", "Primary contact transferred",
                    f"{target.customer.name} is now the primary contact for {property_obj.name or property_obj.property_type}.",
                    f"/customer-properties/{property_obj.id}", request.user,
                )
                return Response({"detail": "Primary contact transferred.", "contact_id": target.id})

            target = PropertyContact.objects.select_for_update().filter(
                pk=request.data.get("contact_id"), property=property_obj,
            ).first()
            if not target:
                return Response({"contact_id": "Choose an existing contact on this property."}, status=status.HTTP_400_BAD_REQUEST)
            if target.is_primary:
                return Response({"detail": "Transfer primary contact before changing or removing this contact."}, status=status.HTTP_409_CONFLICT)

            if action == "change-access":
                relationship = str(request.data.get("relationship") or "").upper()
                access_level = str(request.data.get("access_level") or "").upper()
                custom_permissions = request.data.get("custom_permissions") or []
                if relationship not in {"", *PropertyContact.Relationship.values}:
                    return Response({"relationship": "Choose a valid relationship."}, status=status.HTTP_400_BAD_REQUEST)
                if access_level not in PropertyContact.AccessLevel.values:
                    return Response({"access_level": "Choose a valid access level."}, status=status.HTTP_400_BAD_REQUEST)
                if not isinstance(custom_permissions, list):
                    return Response({"custom_permissions": "Choose a list of permissions."}, status=status.HTTP_400_BAD_REQUEST)
                permission_values = {value for name, value in vars(PropertyPermission).items() if name.isupper()}
                custom_permissions = sorted({str(value) for value in custom_permissions if str(value) in permission_values})
                if access_level == PropertyContact.AccessLevel.CUSTOM and not custom_permissions:
                    return Response({"custom_permissions": "Choose at least one custom permission."}, status=status.HTTP_400_BAD_REQUEST)
                target.relationship = relationship
                target.access_level = access_level
                target.custom_permissions = custom_permissions
                target.save(update_fields=("relationship", "access_level", "custom_permissions", "updated_at"))
                property_access_audit(
                    request, property_obj, "CONTACT_ACCESS_UPDATED", contact=target,
                    details={"access_level": access_level, "relationship": relationship},
                )
                return Response({"detail": "Property contact access updated.", "contact": property_contact_share_data(target)})

            role = str(request.data.get("role") or "").upper()
            permitted_roles = {choice for choice, _label in PropertyContact.Role.choices} - {PropertyContact.Role.PRIMARY}
            if role not in permitted_roles:
                return Response({"role": "Choose a non-primary property-contact role."}, status=status.HTTP_400_BAD_REQUEST)
            previous_role = target.role
            target.role = role
            target.save(update_fields=("role", "updated_at"))
            property_access_audit(
                request, property_obj, "CONTACT_ROLE_CHANGED", contact=target,
                details={"from": previous_role, "to": role},
            )
            create_notification(
                target.customer.portal_user, "PROPERTY_CONTACT_ROLE_CHANGED", "Property contact role changed",
                f"Your role for {property_obj.name or property_obj.property_type} is now {target.get_role_display()}.",
                f"/customer-properties/{property_obj.id}", request.user,
            )
            return Response({"detail": "Property contact role updated.", "contact_id": target.id, "role": target.role})


class CustomerPropertyShareRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        requests = PropertyContact.objects.filter(
            customer__portal_user=request.user,
            status=PropertyContact.Status.PENDING,
        ).select_related("property").order_by("-created_at")
        return Response([{
            "id": item.id,
            "property_id": item.property_id,
            "property_name": item.property.name or item.property.property_type,
            "property_type": item.property.property_type,
            "city": item.property.city,
            "relationship": item.relationship,
            "access_level": item.access_level,
            "custom_permissions": item.custom_permissions,
            "requested_at": item.created_at,
        } for item in requests])


class CustomerPropertyShareRequestRespondView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, contact_id):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        contact = PropertyContact.objects.select_for_update().select_related(
            "property", "customer",
        ).filter(
            pk=contact_id,
            customer__portal_user=request.user,
            status=PropertyContact.Status.PENDING,
        ).first()
        if not contact:
            return Response({"detail": "Property access request not found."}, status=status.HTTP_404_NOT_FOUND)
        decision = str(request.data.get("action") or "").upper()
        if decision not in {"ACCEPT", "DECLINE"}:
            return Response({"action": "Choose accept or decline."}, status=status.HTTP_400_BAD_REQUEST)
        contact.status = PropertyContact.Status.ACTIVE if decision == "ACCEPT" else PropertyContact.Status.DECLINED
        contact.save(update_fields=("status", "updated_at"))
        property_access_audit(
            request, contact.property,
            "PROPERTY_ACCESS_ACCEPTED" if decision == "ACCEPT" else "PROPERTY_ACCESS_DECLINED",
            contact=contact,
            details={"access_level": contact.access_level, "relationship": contact.relationship},
        )
        primary = contact.property.contacts.filter(is_primary=True).select_related("customer__portal_user").first()
        if primary:
            create_notification(
                primary.customer.portal_user,
                "PROPERTY_ACCESS_RESPONSE",
                "Property access response",
                f"{request.user.get_full_name() or request.user.mobile} {('accepted' if decision == 'ACCEPT' else 'declined')} access to {contact.property.name or contact.property.property_type}.",
                f"/customer-properties/{contact.property_id}/access",
                request.user,
            )
        return Response({"detail": "Property access accepted." if decision == "ACCEPT" else "Property access declined.", "property_id": contact.property_id, "status": contact.status})


class PropertyMeasurementPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        property_obj = Property.objects.select_related("customer").filter(
            contractor_property_scope(request.user), pk=pk,
        ).first()
        if not property_obj:
            return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
        record_id = request.query_params.get("measurement")
        record = None
        if record_id:
            record = PropertyMeasurement.objects.filter(id=record_id, property=property_obj).first()
            if not record:
                return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf = build_measurement_pdf(property_obj, record, language=document_language(request))
        response = HttpResponse(pdf.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="property-area-calculation-{property_obj.id}.pdf"'
        return response


# ============================================================
# CUSTOMER FOLLOW-UPS
# ============================================================

class CustomerFollowUpListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = CustomerFollowUpSerializer

    def get_queryset(self):

        customer_id = self.kwargs.get(
            "customer_id"
        )

        queryset = CustomerFollowUp.objects.filter(
            created_by=self.request.user,
            customer_id=customer_id
        )

        # Completed follow-ups are history — keep them out of the
        # working list unless explicitly requested with ?completed=all
        if self.request.query_params.get("completed") != "all":
            queryset = queryset.filter(is_completed=False)

        return queryset.order_by("-created_at")

    def perform_create(self, serializer):

        customer_id = self.kwargs.get(
            "customer_id"
        )

        customer = Customer.objects.filter(id=customer_id).filter(
            models.Q(
                contractor_connections__contractor=self.request.user,
                contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
            ) | models.Q(
                contractor=self.request.user,
                contractor_connections__isnull=True,
            )
        ).distinct().first()

        if not customer:
            raise ValidationError({
                "customer":
                    "Customer not found."
            })

        follow_up = serializer.save(
            customer=customer,
            created_by=self.request.user
        )
        if (
            follow_up.follow_up_type == CustomerFollowUp.FollowUpType.SITE_VISIT
            and customer.portal_user_id
        ):
            visit_time = (
                timezone.localtime(follow_up.next_follow_up).strftime("%d %b %Y, %I:%M %p")
                if follow_up.next_follow_up
                else "a date to be confirmed"
            )
            note = f" Details: {follow_up.comment}" if follow_up.comment else ""
            create_notification(
                customer.portal_user,
                "SITE_VISIT",
                "Site visit scheduled",
                f"Your contractor scheduled a site visit for {visit_time}.{note}",
                "/customer-dashboard",
                self.request.user,
            )


class CustomerTaskListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTaskSerializer

    def get_queryset(self):
        queryset = CustomerFollowUp.objects.select_related("customer").filter(
            created_by=self.request.user,
            next_follow_up__isnull=False,
        )
        if self.request.query_params.get("completed") != "all":
            queryset = queryset.filter(is_completed=False)
        return queryset.order_by("next_follow_up")


class CustomerTaskCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        task = CustomerFollowUp.objects.select_related("customer").filter(
            pk=pk,
            created_by=request.user,
            next_follow_up__isnull=False,
        ).first()
        if not task:
            return Response({"detail": "Task not found."}, status=status.HTTP_404_NOT_FOUND)
        update_fields = []
        if "is_completed" in request.data:
            completed = bool(request.data.get("is_completed"))
            task.is_completed = completed
            task.completed_at = timezone.now() if completed else None
            update_fields.extend(("is_completed", "completed_at"))
        if "next_follow_up" in request.data:
            next_follow_up = parse_datetime(str(request.data.get("next_follow_up") or ""))
            if not next_follow_up:
                return Response({"next_follow_up": "Enter a valid date and time."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(next_follow_up):
                next_follow_up = timezone.make_aware(next_follow_up)
            task.next_follow_up = next_follow_up
            task.is_completed = False
            task.completed_at = None
            update_fields.extend(("next_follow_up", "is_completed", "completed_at"))
        if "comment" in request.data:
            task.comment = str(request.data.get("comment") or "").strip()
            update_fields.append("comment")
        if not update_fields:
            return Response({"detail": "No task changes were provided."}, status=status.HTTP_400_BAD_REQUEST)
        task.save(update_fields=tuple(set(update_fields)))
        return Response(CustomerTaskSerializer(task).data)


def conversation_data(conversation, viewer):
    last = conversation.messages.order_by("-created_at").first()
    customer = conversation.customer
    contractor = conversation.contractor
    profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
    painter = conversation.painter
    other_user = contractor if viewer.id != contractor.id else (painter or (customer.portal_user if customer else None))
    online_cutoff = timezone.now() - timedelta(minutes=5)
    return {
        "id": conversation.id,
        "participant_type": "CUSTOMER" if customer else "PAINTER",
        "customer_id": customer.id if customer else None,
        "customer_bharath_id": customer.bharath_id if customer else "",
        "customer_name": customer.name if customer else "",
        "customer_mobile": customer.mobile if customer else "",
        "painter_id": painter.id if painter else None,
        "painter_name": painter.get_full_name() or painter.mobile if painter else "",
        "painter_mobile": painter.mobile if painter else "",
        "painter_bharath_id": painter.bharath_id if painter else "",
        "contractor_name": profile.company_name if profile else contractor.get_full_name() or contractor.mobile,
        "contractor_id": contractor.id,
        "contractor_mobile": contractor.mobile,
        "contractor_bharath_id": contractor.bharath_id or "",
        "is_online": bool(other_user and other_user.is_active and other_user.last_activity_at and other_user.last_activity_at >= online_cutoff),
        "last_message": chat_message_summary(last) if last else "",
        "last_message_at": last.created_at if last else conversation.created_at,
        "unread_count": conversation.messages.exclude(sender=viewer).filter(read_at__isnull=True).count(),
        "is_blocked": bool(conversation.blocked_by_id),
        "blocked_by_me": conversation.blocked_by_id == viewer.id,
    }


def create_notification(recipient, event_type, title, message, link="", actor=None):
    if recipient and (not actor or recipient.id != actor.id):
        return PortalNotification.objects.create(recipient=recipient, actor=actor, event_type=event_type, title=title, message=message, link=link)


CHAT_SAFETY_TERMS = {
    "drug-related": (
        "drug", "drugs", "narcotic", "narcotics", "cocaine", "heroin",
        "meth", "methamphetamine", "marijuana", "ganja", "hashish",
        "ecstasy", "mdma", "lsd", "opium",
    ),
    "sexual-assault": (
        "sexual assault", "sex assault", "sexual abuse", "sexual harassment",
        "rape", "raped", "raping", "molest", "molested", "molestation",
        "forced sex",
    ),
}


def blocked_chat_category(text):
    normalized = " ".join(re.findall(r"[a-z0-9]+", str(text or "").lower()))
    padded = f" {normalized} "
    for category, terms in CHAT_SAFETY_TERMS.items():
        if any(f" {term} " in padded for term in terms):
            return category
    return ""


def notify_blocked_chat(request, conversation, category):
    sender_identity = request.user.bharath_id or request.user.mobile or str(request.user.pk)
    message = (
        f"A {category} message was blocked in conversation #{conversation.pk}. "
        f"Sender: {request.user.role} {sender_identity}. The prohibited text was not stored."
    )
    admins = BharathUser.objects.filter(is_active=True).filter(
        models.Q(role=BharathUser.Roles.ADMIN) | models.Q(is_superuser=True)
    ).distinct()
    for admin in admins:
        create_notification(admin, "CHAT_SAFETY", "Blocked chat safety alert", message, "/messages", request.user)


def validate_chat_text(request, conversation, text, allow_empty=False):
    value = str(text or "").strip()
    if not value and not allow_empty:
        return None, Response({"text": "Message cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
    if len(value) > 4000:
        return None, Response({"text": "Message is too long."}, status=status.HTTP_400_BAD_REQUEST)
    category = blocked_chat_category(value)
    if category:
        notify_blocked_chat(request, conversation, category)
        return None, Response(
            {"text": "This message was blocked for safety. An administrator has been notified."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return value, None


def chat_message_data(item, viewer):
    can_change = item.sender_id == viewer.id and not item.deleted_at and timezone.now() <= item.created_at + timedelta(minutes=10)
    reply = item.reply_to
    return {
        "id": item.id,
        "sender": item.sender_id,
        "sender_role": item.sender.role,
        "text": "" if item.deleted_at else item.text,
        "contact": None if item.deleted_at or not item.contact_name else {"name": item.contact_name, "mobile": item.contact_mobile},
        "colour": None if item.deleted_at or not item.colour_code else {
            "brand": item.colour_brand, "name": item.colour_name,
            "code": item.colour_code, "hex": item.colour_hex,
        },
        "colour_comparison": [] if item.deleted_at else item.colour_comparison,
        "attachments": [] if item.deleted_at else [
            {"id": attachment.id, "name": attachment.file_name, "content_type": attachment.content_type, "size": attachment.size,
             "url": f"/quotations/chat/attachments/{attachment.id}/"}
            for attachment in item.attachments.all()
        ],
        "reply_to": None if not reply else {"id": reply.id, "text": chat_message_summary(reply)},
        "is_forwarded": bool(item.forwarded_from_id),
        "created_at": item.created_at,
        "edited_at": item.edited_at,
        "deleted_at": item.deleted_at,
        "read_at": item.read_at,
        "is_mine": item.sender_id == viewer.id,
        "can_edit": bool(can_change),
        "can_delete": bool(can_change),
    }


def chat_message_summary(item):
    if item.deleted_at:
        return "Message deleted"
    if item.text:
        return item.text[:120]
    if item.contact_name:
        return f"Contact: {item.contact_name}"
    if item.colour_code:
        return f"Colour: {item.colour_brand} {item.colour_code} {item.colour_name}"[:120]
    if item.colour_comparison:
        return "Colour comparison"
    attachment = item.attachments.first()
    return f"Attachment: {attachment.file_name}" if attachment else "Message"


CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024
CHAT_MAX_FILES = 5


def validate_chat_files(files):
    if len(files) > CHAT_MAX_FILES:
        return "Attach at most five files per message."
    for uploaded in files:
        if uploaded.size > CHAT_MAX_FILE_BYTES:
            return f"{uploaded.name} exceeds the 10 MB file limit."
        extension = Path(uploaded.name).suffix.lower()
        if extension == ".pdf":
            if uploaded.read(5) != b"%PDF-":
                return f"{uploaded.name} is not a valid PDF."
        elif extension in {".jpg", ".jpeg", ".png", ".webp"}:
            try:
                image = Image.open(uploaded)
                image.verify()
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    return f"{uploaded.name} is not a supported photo."
            except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
                return f"{uploaded.name} is not a valid photo."
        elif extension == ".vcf":
            if not uploaded.read(2048).lstrip().startswith(b"BEGIN:VCARD"):
                return f"{uploaded.name} is not a valid contact card."
        else:
            return f"{uploaded.name} must be a PDF, JPG, PNG, WEBP or VCF file."
        uploaded.seek(0)
    return ""


def contractor_can_message_painter(contractor, painter):
    from jobs.models import ApplicatorBooking, ContractorApplicatorTeam, JobApplication
    return (
        ContractorApplicatorTeam.objects.filter(
            contractor=contractor, painter=painter, is_active=True,
        ).exists()
        or JobApplication.objects.filter(
            job__contractor=contractor, painter=painter,
        ).exists()
        or ApplicatorBooking.objects.filter(
            contractor=contractor, applicator=painter,
        ).exists()
    )


def chat_targets_for(user):
    if user.role == BharathUser.Roles.PAINTER:
        from jobs.models import ApplicatorBooking, ContractorApplicatorTeam, JobApplication
        ids = set(ContractorApplicatorTeam.objects.filter(painter=user, is_active=True).values_list("contractor_id", flat=True))
        ids.update(JobApplication.objects.filter(painter=user).values_list("job__contractor_id", flat=True))
        ids.update(ApplicatorBooking.objects.filter(applicator=user).values_list("contractor_id", flat=True))
        contractors = BharathUser.objects.filter(pk__in=ids, role=BharathUser.Roles.CONTRACTOR, is_active=True).select_related("contractor_profile")
        return [{"type": "CONTRACTOR", "id": item.id, "name": item.contractor_profile.company_name if hasattr(item, "contractor_profile") and item.contractor_profile.company_name else item.get_full_name() or item.mobile, "subtitle": item.bharath_id or "Contractor"} for item in contractors]
    if user.role == BharathUser.Roles.CUSTOMER:
        connections = ContractorCustomerConnection.objects.filter(customer__portal_user=user, status=ContractorCustomerConnection.Status.CONNECTED, contractor__is_active=True).select_related("contractor", "contractor__contractor_profile")
        return [{"type": "CONTRACTOR", "id": item.contractor_id, "connection": item.id, "name": item.contractor.contractor_profile.company_name if hasattr(item.contractor, "contractor_profile") and item.contractor.contractor_profile.company_name else item.contractor.get_full_name() or item.contractor.mobile, "subtitle": item.contractor.bharath_id or "Contractor"} for item in connections]
    if user.role == BharathUser.Roles.CONTRACTOR:
        from jobs.models import ApplicatorBooking, ContractorApplicatorTeam, JobApplication
        painter_ids = set(ContractorApplicatorTeam.objects.filter(contractor=user, is_active=True).values_list("painter_id", flat=True))
        painter_ids.update(JobApplication.objects.filter(job__contractor=user).values_list("painter_id", flat=True))
        painter_ids.update(ApplicatorBooking.objects.filter(contractor=user).values_list("applicator_id", flat=True))
        painters = BharathUser.objects.filter(pk__in=painter_ids, role=BharathUser.Roles.PAINTER, is_active=True)
        targets = [{"type": "PAINTER", "id": item.id, "name": item.get_full_name() or item.mobile, "subtitle": item.bharath_id or "Paint Applicator"} for item in painters]
        connections = ContractorCustomerConnection.objects.filter(contractor=user, status=ContractorCustomerConnection.Status.CONNECTED).select_related("customer")
        targets.extend({"type": "CUSTOMER", "id": item.customer_id, "name": item.customer.name, "subtitle": item.customer.bharath_id or "Customer"} for item in connections)
        return targets
    return []


def notification_data(item, language="en"):
    is_message = item.event_type == "MESSAGE"
    from .transliteration import system_text, NOTIFICATIONS
    title = "New message" if is_message else item.title
    message = "Open your inbox to view it." if is_message else item.message
    return {"id": item.id, "event_type": item.event_type, "title": title, "message": message,
        "display_title": system_text(title, language) if is_message or title in NOTIFICATIONS['titles'] else title,
        "display_message": system_text(message, language) if is_message or message in NOTIFICATIONS['messages'] else message,
        "link": item.link, "is_read": bool(item.read_at), "created_at": item.created_at}


class PortalNotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        self.create_appointment_reminders(request.user)
        items = PortalNotification.objects.filter(recipient=request.user)[:50]
        pending_connection_count = 0
        if request.user.role == BharathUser.Roles.CUSTOMER:
            pending_connection_count = ContractorCustomerConnection.objects.filter(
                customer__portal_user=request.user,
                status=ContractorCustomerConnection.Status.PENDING,
            ).count()
        return Response({
            "unread_count": PortalNotification.objects.filter(recipient=request.user, read_at__isnull=True).count(),
            "pending_connection_count": pending_connection_count,
            "results": [notification_data(item, request.query_params.get('display_script', 'en')) for item in items],
        })

    def create_appointment_reminders(self, user):
        from datetime import timedelta
        from jobs.models import WorkSchedule
        tomorrow = timezone.localdate() + timedelta(days=1)
        schedules = WorkSchedule.objects.filter(proposed_start_date=tomorrow, status=WorkSchedule.Status.CONFIRMED).select_related("quotation__customer__portal_user", "quotation__contractor", "quotation__property")
        if user.role == BharathUser.Roles.CONTRACTOR:
            schedules = schedules.filter(quotation__contractor=user)
        elif user.role == BharathUser.Roles.CUSTOMER:
            schedules = schedules.filter(quotation__customer__portal_user=user)
        elif user.role == BharathUser.Roles.PAINTER:
            schedules = schedules.filter(painter_assignments__painter=user)
        else:
            return
        for schedule in schedules.distinct():
            quotation_number = schedule.quotation.quotation_number
            if not PortalNotification.objects.filter(recipient=user, event_type="APPOINTMENT_REMINDER", created_at__date=timezone.localdate(), message__contains=quotation_number).exists():
                property_name = schedule.quotation.property.name or schedule.quotation.property.property_type
                create_notification(user, "APPOINTMENT_REMINDER", "Work appointment tomorrow", f"{quotation_number} at {property_name} is scheduled to start tomorrow.", "/work-schedules")
        if user.role == BharathUser.Roles.CONTRACTOR:
            overdue = WorkSchedule.objects.filter(
                quotation__contractor=user,
                proposed_end_date__lt=timezone.localdate(),
            ).exclude(
                status__in=(WorkSchedule.Status.COMPLETED, WorkSchedule.Status.CANCELLED)
            ).select_related("quotation", "quotation__customer", "quotation__property")
            for schedule in overdue:
                quotation_number = schedule.quotation.quotation_number
                already_sent = PortalNotification.objects.filter(
                    recipient=user, event_type="PROJECT_OVERDUE",
                    created_at__date=timezone.localdate(), message__contains=quotation_number,
                ).exists()
                if not already_sent:
                    property_name = schedule.quotation.property.name or schedule.quotation.property.property_type
                    create_notification(
                        user, "PROJECT_OVERDUE", "Project completion update required",
                        f"{quotation_number} for {property_name} ended on {schedule.proposed_end_date}. Update the work status and complete the process.",
                        "/work-schedules",
                    )

    def patch(self, request):
        queryset = PortalNotification.objects.filter(recipient=request.user, read_at__isnull=True)
        notification_id = request.data.get("id")
        if notification_id:
            queryset = queryset.filter(pk=notification_id)
        queryset.update(read_at=timezone.now())
        return Response({"message": "Notifications marked as read."})


class ColourComparisonDraftView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def representation(shade_ids):
        ids = (shade_ids if isinstance(shade_ids, list) else [])[:8]
        ids += [None] * (8 - len(ids))
        return {"slots": [{"id": value, **colour_by_id(value)} if colour_by_id(value) else None for value in ids]}

    def get(self, request):
        draft = ColourComparisonDraft.objects.filter(user=request.user).first()
        return Response(self.representation(draft.shade_ids if draft else []))

    def put(self, request):
        ids = request.data.get("slots")
        if not isinstance(ids, list) or len(ids) != 8 or any(
            value is not None and (isinstance(value, bool) or not isinstance(value, int) or colour_by_id(value) is None)
            for value in ids
        ):
            return Response({"slots": "Provide eight valid colour IDs or null values."}, status=400)
        chosen = [value for value in ids if value is not None]
        if len(chosen) != len(set(chosen)):
            return Response({"slots": "A colour can only appear once."}, status=400)
        ColourComparisonDraft.objects.update_or_create(user=request.user, defaults={"shade_ids": ids})
        return Response(self.representation(ids))


class ChatColourListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip().casefold()[:80]
        group = str(request.query_params.get("group") or "All")
        try:
            offset = max(0, min(int(request.query_params.get("offset") or 0), 10000))
        except (TypeError, ValueError):
            offset = 0
        matches = (
            (index, item) for index, item in enumerate(colour_catalogue())
            if (group == "All" or item["group"] == group)
            and (not query or query in " ".join((item["name"], item["code"], item["hex"], item["brand"], item["group"])).casefold())
        )
        found = list(matches)
        return Response({
            "count": len(found),
            "results": [{"id": index, **item} for index, item in found[offset:offset + 60]],
            "next_offset": offset + 60 if offset + 60 < len(found) else None,
        })


class ChatContactListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(chat_targets_for(request.user))


class ChatConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        requested_conversation_id = request.query_params.get("conversation")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            from jobs.models import ContractorApplicatorTeam
            painter_ids = ContractorApplicatorTeam.objects.filter(contractor=request.user, is_active=True).values_list("painter_id", flat=True)
            for painter_id in painter_ids:
                ChatConversation.objects.get_or_create(contractor=request.user, painter_id=painter_id, customer=None)
            requested_painter_id = request.query_params.get("painter_id")
            if requested_painter_id:
                painter = BharathUser.objects.filter(
                    pk=requested_painter_id, role=BharathUser.Roles.PAINTER, is_active=True,
                ).first()
                if not painter or not contractor_can_message_painter(request.user, painter):
                    return Response({"detail": "This Paint Applicator is not connected to your work."}, status=status.HTTP_403_FORBIDDEN)
                ChatConversation.objects.get_or_create(
                    contractor=request.user, painter=painter, customer=None,
                )
            conversations = ChatConversation.objects.filter(contractor=request.user).filter(
                models.Q(painter__isnull=False) |
                models.Q(customer__contractor_connections__contractor=request.user,
                         customer__contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED)
            ).distinct()
            search = str(request.query_params.get("search") or "").strip()
            if search:
                conversations = conversations.filter(
                    models.Q(customer__name__icontains=search)
                    | models.Q(customer__mobile__icontains=search)
                    | models.Q(customer__email__icontains=search)
                    | models.Q(customer__bharath_id__icontains=search)
                    | models.Q(painter__first_name__icontains=search)
                    | models.Q(painter__last_name__icontains=search)
                    | models.Q(painter__mobile__icontains=search)
                    | models.Q(painter__bharath_id__icontains=search)
                )
            else:
                if requested_painter_id:
                    conversations = conversations.filter(painter_id=requested_painter_id)
                elif requested_conversation_id:
                    conversations = conversations.filter(
                        models.Q(messages__isnull=False) | models.Q(pk=requested_conversation_id)
                    ).distinct()
                else:
                    conversations = conversations.filter(messages__isnull=False).distinct()
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            conversations = ChatConversation.objects.filter(
                customer__portal_user=request.user,
                customer__contractor_connections__contractor=models.F("contractor"),
                customer__contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
            ).distinct()
        elif request.user.role == BharathUser.Roles.PAINTER:
            contractor_id = request.query_params.get("contractor_id")
            if contractor_id:
                contractor = BharathUser.objects.filter(
                    pk=contractor_id, role=BharathUser.Roles.CONTRACTOR, is_active=True,
                ).first()
                if not contractor or not contractor_can_message_painter(contractor, request.user):
                    return Response({"detail": "This contractor is not connected to your work."}, status=status.HTTP_403_FORBIDDEN)
                ChatConversation.objects.get_or_create(contractor=contractor, painter=request.user, customer=None)
            conversations = ChatConversation.objects.filter(painter=request.user)
        else:
            return Response([], status=status.HTTP_200_OK)
        conversations = conversations.select_related("customer", "contractor", "contractor__contractor_profile", "painter").annotate(
            recent_message_at=models.Max("messages__created_at"),
            requested_first=models.Case(models.When(pk=requested_conversation_id, then=0), default=1, output_field=models.IntegerField()) if requested_conversation_id else models.Value(1, output_field=models.IntegerField()),
        ).order_by("requested_first", models.F("recent_message_at").desc(nulls_last=True), "-updated_at")
        return Response([conversation_data(item, request.user) for item in conversations[:20]])

    def post(self, request):
        if request.user.role == BharathUser.Roles.PAINTER:
            contractor = BharathUser.objects.filter(
                pk=request.data.get("contractor"), role=BharathUser.Roles.CONTRACTOR, is_active=True,
            ).first()
            if not contractor or not contractor_can_message_painter(contractor, request.user):
                return Response({"contractor": "Select a contractor connected to your work."}, status=status.HTTP_400_BAD_REQUEST)
            conversation, _ = ChatConversation.objects.get_or_create(
                contractor=contractor, painter=request.user, customer=None,
            )
            conversation = ChatConversation.objects.select_related(
                "customer", "contractor", "contractor__contractor_profile", "painter"
            ).get(pk=conversation.pk)
            return Response(conversation_data(conversation, request.user))
        if request.user.role == BharathUser.Roles.CUSTOMER:
            connection = ContractorCustomerConnection.objects.select_related("customer", "contractor").filter(
                pk=request.data.get("connection"), customer__portal_user=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).first()
            if not connection:
                return Response({"connection": "Select one of your connected contractors."}, status=status.HTTP_400_BAD_REQUEST)
            conversation, _ = ChatConversation.objects.get_or_create(
                customer=connection.customer, contractor=connection.contractor,
                defaults={"connection": connection},
            )
            if conversation.connection_id != connection.id:
                conversation.connection = connection
                conversation.save(update_fields=("connection", "updated_at"))
            conversation = ChatConversation.objects.select_related(
                "customer", "contractor", "contractor__contractor_profile", "painter"
            ).get(pk=conversation.pk)
            return Response(conversation_data(conversation, request.user))
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        painter_id = request.data.get("painter")
        if painter_id:
            painter = BharathUser.objects.filter(
                pk=painter_id, role=BharathUser.Roles.PAINTER, is_active=True,
            ).first()
            if not painter or not contractor_can_message_painter(request.user, painter):
                return Response({"painter": "This Paint Applicator is not connected to your work."}, status=status.HTTP_400_BAD_REQUEST)
            conversation, _ = ChatConversation.objects.get_or_create(
                contractor=request.user, painter=painter, customer=None,
            )
            conversation = ChatConversation.objects.select_related(
                "customer", "contractor", "contractor__contractor_profile", "painter"
            ).get(pk=conversation.pk)
            return Response(conversation_data(conversation, request.user))
        connection = ContractorCustomerConnection.objects.select_related("customer").filter(
            contractor=request.user,
            customer_id=request.data.get("customer"),
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            return Response({"customer": "Select a connected customer."}, status=status.HTTP_400_BAD_REQUEST)
        conversation, _ = ChatConversation.objects.get_or_create(
            customer=connection.customer,
            contractor=request.user,
            defaults={"connection": connection},
        )
        if conversation.connection_id != connection.id:
            conversation.connection = connection
            conversation.save(update_fields=("connection", "updated_at"))
        conversation = ChatConversation.objects.select_related(
            "customer", "contractor", "contractor__contractor_profile", "painter"
        ).get(pk=conversation.pk)
        return Response(conversation_data(conversation, request.user))


class ChatMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get_conversation(self, request, pk):
        conversation = ChatConversation.objects.select_related("customer", "painter", "contractor").filter(pk=pk).first()
        if not conversation:
            return None
        allowed = (
            (conversation.customer and (conversation.contractor_id == request.user.id or conversation.customer.portal_user_id == request.user.id))
            or conversation.contractor_id == request.user.id
            or conversation.painter_id == request.user.id
        )
        if allowed and conversation.customer_id:
            allowed = ContractorCustomerConnection.objects.filter(
                customer_id=conversation.customer_id, contractor_id=conversation.contractor_id,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).exists()
        return conversation if allowed else None

    def get(self, request, pk):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        conversation.messages.exclude(sender=request.user).filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response([chat_message_data(item, request.user) for item in conversation.messages.select_related("sender", "reply_to").prefetch_related("attachments", "reply_to__attachments")])

    def post(self, request, pk):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        if conversation.blocked_by_id:
            return Response({"detail": "This conversation is blocked."}, status=status.HTTP_403_FORBIDDEN)
        files = request.FILES.getlist("files")
        file_error = validate_chat_files(files)
        if file_error:
            return Response({"files": file_error}, status=status.HTTP_400_BAD_REQUEST)
        contact_name = str(request.data.get("contact_name") or "").strip()
        contact_mobile = str(request.data.get("contact_mobile") or "").strip()
        if contact_name or contact_mobile:
            contact_mobile = canonical_mobile(contact_mobile)
            if not contact_name or len(contact_name) > 120 or not contact_mobile:
                return Response({"contact": "Enter a contact name and valid mobile number."}, status=status.HTTP_400_BAD_REQUEST)
        colour = None
        if "colour_id" in request.data:
            colour = colour_by_id(request.data.get("colour_id"))
            if not colour:
                return Response({"colour": "Select a colour from the catalogue."}, status=status.HTTP_400_BAD_REQUEST)
        colour_comparison = []
        if "colour_comparison" in request.data:
            groups = request.data.get("colour_comparison")
            if not isinstance(groups, list) or not 1 <= len(groups) <= 4:
                return Response({"colour_comparison": "Select at least one filled comparison section."}, status=status.HTTP_400_BAD_REQUEST)
            seen_colours = set()
            seen_sections = set()
            for group in groups:
                if not isinstance(group, dict):
                    return Response({"colour_comparison": "Invalid comparison section."}, status=status.HTTP_400_BAD_REQUEST)
                section = group.get("section")
                colour_ids = group.get("colours")
                if isinstance(section, bool) or not isinstance(section, int) or section not in (1, 2, 3, 4) or section in seen_sections:
                    return Response({"colour_comparison": "Invalid comparison section."}, status=status.HTTP_400_BAD_REQUEST)
                if not isinstance(colour_ids, list) or not 1 <= len(colour_ids) <= 2:
                    return Response({"colour_comparison": "Only filled shade cards can be shared."}, status=status.HTTP_400_BAD_REQUEST)
                seen_sections.add(section)
                shades = []
                for colour_id in colour_ids:
                    if isinstance(colour_id, bool) or not isinstance(colour_id, int) or colour_id in seen_colours:
                        return Response({"colour_comparison": "Select distinct catalogue shades."}, status=status.HTTP_400_BAD_REQUEST)
                    shade = colour_by_id(colour_id)
                    if not shade:
                        return Response({"colour_comparison": "A selected shade is unavailable."}, status=status.HTTP_400_BAD_REQUEST)
                    seen_colours.add(colour_id)
                    shades.append({"brand": shade["brand"], "name": shade["name"], "code": shade["code"], "hex": shade["hex"]})
                colour_comparison.append({"section": section, "colours": shades})
        reply_to = None
        if request.data.get("reply_to"):
            reply_to = ChatMessage.objects.filter(pk=request.data["reply_to"], conversation=conversation, deleted_at__isnull=True).first()
            if not reply_to:
                return Response({"reply_to": "The message to reply to is unavailable."}, status=status.HTTP_400_BAD_REQUEST)
        text, error = validate_chat_text(request, conversation, request.data.get("text"), allow_empty=bool(files or contact_name or colour or colour_comparison))
        if error:
            return error
        message = ChatMessage.objects.create(conversation=conversation, sender=request.user, text=text, reply_to=reply_to,
                                             contact_name=contact_name, contact_mobile=contact_mobile,
                                             colour_brand=colour["brand"] if colour else "", colour_name=colour["name"] if colour else "",
                                             colour_code=colour["code"] if colour else "", colour_hex=colour["hex"] if colour else "",
                                             colour_comparison=colour_comparison)
        for uploaded in files:
            extension = Path(uploaded.name).suffix.lower()
            content_type = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".vcf": "text/vcard"}[extension]
            ChatAttachment.objects.create(message=message, file=uploaded, file_name=Path(uploaded.name).name[:255],
                                          content_type=content_type, size=uploaded.size)
        conversation.save(update_fields=("updated_at",))
        recipient = None
        if conversation.customer:
            recipient = conversation.customer.portal_user if request.user.id == conversation.contractor_id else conversation.contractor
        elif conversation.painter_id == request.user.id:
            recipient = conversation.contractor
        else:
            recipient = conversation.painter
        create_notification(recipient, "MESSAGE", "New message", "Open your inbox to view it.", "/messages", request.user)
        return Response(chat_message_data(message, request.user), status=status.HTTP_201_CREATED)


class ChatMessageForwardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        source = ChatMessage.objects.select_related("conversation", "sender").prefetch_related("attachments").filter(pk=pk, deleted_at__isnull=True).first()
        if not source or not ChatMessageListCreateView().get_conversation(request, source.conversation_id):
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        target = ChatMessageListCreateView().get_conversation(request, request.data.get("conversation"))
        if not target:
            return Response({"detail": "Destination conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        if target.pk == source.conversation_id:
            return Response({"detail": "Choose a different conversation."}, status=status.HTTP_400_BAD_REQUEST)
        if target.blocked_by_id:
            return Response({"detail": "Destination conversation is blocked."}, status=status.HTTP_403_FORBIDDEN)
        if target.painter_id:
            if not contractor_can_message_painter(target.contractor, target.painter):
                return Response({"detail": "This work connection is no longer available."}, status=status.HTTP_403_FORBIDDEN)
        elif not ContractorCustomerConnection.objects.filter(
            contractor=target.contractor, customer=target.customer,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).exists():
            return Response({"detail": "This customer connection is no longer available."}, status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            forwarded = ChatMessage.objects.create(
                conversation=target, sender=request.user, text=source.text,
                contact_name=source.contact_name, contact_mobile=source.contact_mobile,
                colour_brand=source.colour_brand, colour_name=source.colour_name,
                colour_code=source.colour_code, colour_hex=source.colour_hex,
                colour_comparison=source.colour_comparison,
                forwarded_from=source,
            )
            for attachment in source.attachments.all():
                attachment.file.open("rb")
                try:
                    copy = ChatAttachment(message=forwarded, file_name=attachment.file_name,
                                          content_type=attachment.content_type, size=attachment.size)
                    copy.file.save(attachment.file_name, File(attachment.file), save=False)
                    copy.save()
                finally:
                    attachment.file.close()
            target.save(update_fields=("updated_at",))
        if target.customer_id:
            recipient = target.customer.portal_user if request.user.id == target.contractor_id else target.contractor
        else:
            recipient = target.contractor if request.user.id == target.painter_id else target.painter
        create_notification(recipient, "MESSAGE", "New message", "Open your inbox to view it.", "/messages", request.user)
        return Response(chat_message_data(forwarded, request.user), status=status.HTTP_201_CREATED)


class ChatConversationSafetyView(APIView):
    permission_classes = [IsAuthenticated]

    def get_conversation(self, request, pk):
        if request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser:
            return ChatConversation.objects.filter(pk=pk).first()
        return ChatMessageListCreateView().get_conversation(request, pk)

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.ADMIN and not request.user.is_superuser:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"is_blocked": bool(conversation.blocked_by_id), "blocked_by_admin": bool(conversation.blocked_by and (conversation.blocked_by.role == BharathUser.Roles.ADMIN or conversation.blocked_by.is_superuser))})

    def post(self, request, pk):
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        action = str(request.data.get("action") or "").strip().lower()
        if action == "block":
            if conversation.blocked_by_id and conversation.blocked_by_id != request.user.id:
                return Response({"detail": "This conversation is already blocked."}, status=status.HTTP_403_FORBIDDEN)
            conversation.blocked_by = request.user
            conversation.blocked_at = timezone.now()
            conversation.save(update_fields=("blocked_by", "blocked_at", "updated_at"))
            return Response({"is_blocked": True, "blocked_by_me": True})
        if action == "unblock":
            admin_unlock = (request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser) and conversation.blocked_by and (conversation.blocked_by.role == BharathUser.Roles.ADMIN or conversation.blocked_by.is_superuser)
            if conversation.blocked_by_id != request.user.id and not admin_unlock:
                return Response({"detail": "Only the person who blocked this conversation can unblock it."}, status=status.HTTP_403_FORBIDDEN)
            conversation.blocked_by = None
            conversation.blocked_at = None
            conversation.save(update_fields=("blocked_by", "blocked_at", "updated_at"))
            return Response({"is_blocked": False, "blocked_by_me": False})
        if action == "report":
            if request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser:
                return Response({"detail": "Administrators review reports in Support Desk."}, status=status.HTTP_403_FORBIDDEN)
            reason = str(request.data.get("reason") or "").strip()
            if len(reason) < 10 or len(reason) > 1000:
                return Response({"reason": "Describe the concern in 10 to 1000 characters."}, status=status.HTTP_400_BAD_REQUEST)
            subject = f"Chat safety report #{conversation.pk}"
            if SupportTicket.objects.filter(requester=request.user, subject=subject, created_at__gte=timezone.now() - timedelta(hours=24)).exists():
                return Response({"detail": "A report for this conversation was already submitted today."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            recent = list(conversation.messages.filter(deleted_at__isnull=True).select_related("sender").order_by("-created_at")[:10])
            evidence = "\n".join(f"{item.created_at.isoformat()} | user {item.sender_id}: {chat_message_summary(item)[:300]}" for item in reversed(recent))
            ticket = SupportTicket.objects.create(
                requester=request.user, chat_conversation=conversation, subject=subject, category=SupportTicket.Category.OTHER,
                priority=SupportTicket.Priority.HIGH,
                description=f"Conversation: {conversation.pk}\nReporter: {request.user.pk}\nReason: {reason}\nRecent messages:\n{evidence or '(none)'}",
                requester_seen_at=timezone.now(),
            )
            admins = BharathUser.objects.filter(is_active=True).filter(models.Q(role=BharathUser.Roles.ADMIN) | models.Q(is_superuser=True)).distinct()
            for admin in admins:
                create_notification(admin, "CHAT_REPORT", "Chat safety report", f"Conversation #{conversation.pk} was reported.", "/support-tickets", request.user)
            return Response({"detail": "Report submitted to the safety team."}, status=status.HTTP_201_CREATED)
        return Response({"action": "Choose block, unblock, or report."}, status=status.HTTP_400_BAD_REQUEST)


class ChatMessageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_message(self, request, pk):
        return ChatMessage.objects.select_related("sender", "conversation", "reply_to").prefetch_related("attachments").filter(
            pk=pk, sender=request.user,
        ).first()

    def patch(self, request, pk):
        message = self.get_message(request, pk)
        if not message:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        if message.deleted_at or timezone.now() > message.created_at + timedelta(minutes=10):
            return Response({"detail": "Messages can be edited only within 10 minutes of sending."}, status=status.HTTP_403_FORBIDDEN)
        text, error = validate_chat_text(request, message.conversation, request.data.get("text"), allow_empty=bool(message.contact_name or message.colour_code or message.attachments.exists()))
        if error:
            return error
        message.text = text
        message.edited_at = timezone.now()
        message.save(update_fields=("text", "edited_at"))
        message.conversation.save(update_fields=("updated_at",))
        return Response(chat_message_data(message, request.user))

    def delete(self, request, pk):
        message = self.get_message(request, pk)
        if not message:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        if message.deleted_at or timezone.now() > message.created_at + timedelta(minutes=10):
            return Response({"detail": "Messages can be deleted only within 10 minutes of sending."}, status=status.HTTP_403_FORBIDDEN)
        conversation = message.conversation
        for attachment in message.attachments.all():
            attachment.file.delete(save=False)
            attachment.delete()
        message.text = ""
        message.contact_name = ""
        message.contact_mobile = ""
        message.colour_brand = ""
        message.colour_name = ""
        message.colour_code = ""
        message.colour_hex = ""
        message.deleted_at = timezone.now()
        message.save(update_fields=("text", "contact_name", "contact_mobile", "colour_brand", "colour_name", "colour_code", "colour_hex", "deleted_at"))
        conversation.save(update_fields=("updated_at",))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        attachment = ChatAttachment.objects.select_related("message", "message__conversation").filter(pk=pk, message__deleted_at__isnull=True).first()
        if not attachment:
            return Response({"detail": "Attachment not found."}, status=status.HTTP_404_NOT_FOUND)
        conversation = ChatMessageListCreateView().get_conversation(request, attachment.message.conversation_id)
        if not conversation:
            return Response({"detail": "Attachment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return FileResponse(attachment.file.open("rb"), as_attachment=True,
                                filename=attachment.file_name, content_type=attachment.content_type)
        except (OSError, FileNotFoundError):
            return Response({"detail": "Attachment file is unavailable."}, status=status.HTTP_404_NOT_FOUND)


def service_request_data(item):
    contractor = item.connection.contractor if item.connection_id else item.customer.contractor
    profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
    return {
        "id": item.id,
        "customer": item.customer_id,
        "customer_bharath_id": item.customer.bharath_id,
        "customer_name": item.customer.name,
        "customer_mobile": item.customer.mobile,
        "contractor_name": profile.company_name if profile else contractor.get_full_name() or contractor.mobile,
        "service_type": item.service_type_id,
        "service_name": item.service_type.name if item.service_type else item.title,
        "title": item.title,
        "description": item.description,
        "preferred_date": item.preferred_date,
        "address": item.address,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "lead_id": item.lead.id if hasattr(item, "lead") else None,
    }


class ServiceRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def queryset(self, request):
        queryset = ServiceRequest.objects.select_related(
            "customer", "connection__contractor", "connection__contractor__contractor_profile",
            "customer__contractor", "customer__contractor__contractor_profile", "service_type"
        )
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(
                models.Q(connection__contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED)
                | models.Q(connection__isnull=True, customer__contractor=request.user)
            )
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            queryset = queryset.filter(customer__portal_user=request.user)
        else:
            return queryset.none()
        search = str(request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(customer__name__icontains=search)
                | models.Q(customer__mobile__icontains=search)
                | models.Q(title__icontains=search)
                | models.Q(description__icontains=search)
            )
        status_value = str(request.query_params.get("status") or "").strip().upper()
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset

    def get(self, request):
        queryset = self.queryset(request)
        data = [service_request_data(item) for item in queryset]
        field = "contractor_seen_at" if request.user.role == BharathUser.Roles.CONTRACTOR else "customer_seen_at"
        queryset.filter(**{f"{field}__isnull": True}).update(**{field: timezone.now()})
        return Response(data)

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Only customers can raise service requests."}, status=status.HTTP_403_FORBIDDEN)
        selector = request.data.get("connection") or request.data.get("customer")
        try:
            selector_id = int(selector)
            if selector_id < 1:
                raise ValueError
        except (TypeError, ValueError):
            return Response({"connection": "Select a valid connected contractor."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection = ContractorCustomerConnection.objects.select_related("customer", "contractor").filter(
                pk=selector_id,
                customer__portal_user=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).first()
            if not connection:
                try:
                    legacy_customer_id = int(request.data.get("customer"))
                except (TypeError, ValueError):
                    legacy_customer_id = None
                legacy_customer = Customer.objects.filter(pk=legacy_customer_id, portal_user=request.user).first() if legacy_customer_id else None
                legacy_connections = ContractorCustomerConnection.objects.filter(
                    customer=legacy_customer,
                    status=ContractorCustomerConnection.Status.CONNECTED,
                ) if legacy_customer else ContractorCustomerConnection.objects.none()
                if legacy_connections.count() == 1:
                    connection = legacy_connections.first()
            if not connection:
                return Response({"connection": "Select the contractor for this service request."}, status=status.HTTP_400_BAD_REQUEST)
            customer = connection.customer
            raw_service_type = request.data.get("service_type")
            try:
                service_type_id = int(raw_service_type) if raw_service_type not in (None, "") else None
            except (TypeError, ValueError):
                return Response({"service_type": "Select a valid service."}, status=status.HTTP_400_BAD_REQUEST)
            service = ServiceType.objects.filter(pk=service_type_id, is_active=True).filter(
                models.Q(created_by=connection.contractor) | models.Q(created_by__isnull=True)
            ).first() if service_type_id else None
            title = str(request.data.get("title") or (service.name if service else "")).strip()
            if not title:
                return Response({"title": "Select a service or enter a request title."}, status=status.HTTP_400_BAD_REQUEST)
            raw_preferred_date = request.data.get("preferred_date") or ""
            try:
                preferred_date = parse_date(str(raw_preferred_date)) if raw_preferred_date else None
            except ValueError:
                preferred_date = None
            if raw_preferred_date and not preferred_date:
                return Response({"preferred_date": "Enter a valid date."}, status=status.HTTP_400_BAD_REQUEST)
            item = ServiceRequest.objects.create(
                customer=customer, connection=connection, service_type=service, title=title,
                description=str(request.data.get("description") or "").strip(),
                preferred_date=preferred_date,
                address=str(request.data.get("address") or customer.address or "").strip(),
                customer_seen_at=timezone.now(),
            )
            Lead.objects.create(
                contractor=connection.contractor, customer=customer, service_request=item,
                service_type=service, title=title, description=item.description,
            )
            create_notification(connection.contractor, "SERVICE_REQUEST", "New service request", f"{customer.name}: {title}", "/service-requests", request.user)
            return Response(service_request_data(item), status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception(
                "Customer service request submission failed (user_id=%s, connection_id=%s)",
                request.user.pk,
                selector,
            )
            raise


def lead_data(item):
    quotation = item.quotations.order_by("-created_at").first()
    schedule = getattr(quotation, "work_schedule", None) if quotation else None
    return {
        "id": item.id, "customer": item.customer_id, "customer_bharath_id": item.customer.bharath_id, "customer_name": item.customer.name,
        "customer_mobile": item.customer.mobile, "service_request": item.service_request_id,
        "service_type": item.service_type_id, "service_name": item.service_type.name if item.service_type else item.title,
        "property": item.property_id, "property_name": (item.property.name or item.property.property_type) if item.property else "",
        "assigned_user": item.assigned_user_id,
        "reference_no": item.reference_no, "title": item.title, "description": item.description, "stage": item.stage,
        "source": item.source, "priority": item.priority,
        "estimated_value": item.estimated_value, "expected_start_date": item.expected_start_date,
        "site_visit_required": item.site_visit_required,
        "next_follow_up": item.next_follow_up, "notes": item.notes,
        "lost_reason": item.lost_reason, "lost_note": item.lost_note,
        "archived_at": item.archived_at, "is_history": bool(item.archived_at),
        "created_at": item.created_at,
        "quotation_id": quotation.id if quotation else None,
        "quotation_number": quotation.quotation_number if quotation else "",
        "quotation_status": quotation.status if quotation else "",
        "job_id": schedule.id if schedule else None,
        "job_status": schedule.status if schedule else "",
        "history": [{
            "id": event.id, "from_stage": event.from_stage, "to_stage": event.to_stage,
            "note": event.note, "created_at": event.created_at,
        } for event in item.stage_history.all()],
        "created_at": item.created_at, "updated_at": item.updated_at,
    }


class LeadListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)

        from jobs.models import WorkSchedule, WorkSchedulePainter
        queryset = Lead.objects.filter(contractor=request.user).select_related("customer", "service_type", "service_request", "property", "assigned_user").prefetch_related("stage_history", "quotations")
        search = str(request.query_params.get("search") or "").strip()
        stage = str(request.query_params.get("stage") or "").upper()
        source = str(request.query_params.get("source") or "").upper()
        priority = str(request.query_params.get("priority") or "").upper()
        view_scope = str(request.query_params.get("view") or "").strip().lower()
        date_from = parse_date(str(request.query_params.get("date_from") or ""))
        date_to = parse_date(str(request.query_params.get("date_to") or ""))
        if search:
            queryset = queryset.filter(models.Q(reference_no__icontains=search) | models.Q(customer__name__icontains=search) | models.Q(customer__mobile__icontains=search) | models.Q(customer__bharath_id__icontains=search) | models.Q(title__icontains=search) | models.Q(property__name__icontains=search) | models.Q(property__address__icontains=search) | models.Q(property__city__icontains=search))
        if stage:
            queryset = queryset.filter(stage=stage)
        if source:
            queryset = queryset.filter(source=source)
        if priority:
            queryset = queryset.filter(priority=priority)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        if view_scope == "open":
            queryset = queryset.exclude(stage__in=(Lead.Stage.WON, Lead.Stage.LOST, Lead.Stage.CANCELLED, Lead.Stage.COMPLETED))
        elif view_scope == "won":
            queryset = queryset.filter(stage=Lead.Stage.WON)
        elif view_scope == "lost":
            queryset = queryset.filter(stage=Lead.Stage.LOST)
        return Response([lead_data(item) for item in queryset])

    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        customer = Customer.objects.filter(pk=request.data.get("customer"), contractor=request.user).first()
        if not customer:
            return Response({"customer": "Select one of your existing customers."}, status=status.HTTP_400_BAD_REQUEST)
        title = str(request.data.get("title") or "").strip()
        if not title:
            return Response({"title": "Enter the requested service."}, status=status.HTTP_400_BAD_REQUEST)
        service = ServiceType.objects.filter(pk=request.data.get("service_type")).first()
        property_obj = Property.objects.filter(pk=request.data.get("property"), customer=customer).first()
        assigned_user = BharathUser.objects.filter(pk=request.data.get("assigned_user")).first()
        source = str(request.data.get("source") or Lead.Source.OTHER).upper()
        if source not in {choice[0] for choice in Lead.Source.choices}:
            source = Lead.Source.OTHER
        priority = str(request.data.get("priority") or Lead.Priority.MEDIUM).upper()
        if priority not in {choice[0] for choice in Lead.Priority.choices}:
            priority = Lead.Priority.MEDIUM
        expected_start = parse_date(str(request.data.get("expected_start_date") or ""))
        next_follow_up = parse_datetime(str(request.data.get("next_follow_up") or ""))
        if next_follow_up and timezone.is_naive(next_follow_up):
            next_follow_up = timezone.make_aware(next_follow_up)
        item = Lead.objects.create(
            contractor=request.user, customer=customer, service_type=service, property=property_obj,
            assigned_user=assigned_user, title=title, description=str(request.data.get("description") or "").strip(),
            source=source, priority=priority,
            estimated_value=request.data.get("estimated_value") or None,
            expected_start_date=expected_start,
            site_visit_required=bool(request.data.get("site_visit_required")),
            next_follow_up=next_follow_up,
            notes=str(request.data.get("notes") or "").strip(),
        )
        LeadStageHistory.objects.create(lead=item, to_stage=Lead.Stage.NEW, note="Opportunity created", changed_by=request.user)
        return Response(lead_data(item), status=status.HTTP_201_CREATED)


class LeadDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        item = Lead.objects.select_related("customer", "service_type", "service_request", "property", "assigned_user").prefetch_related("stage_history", "quotations").filter(pk=pk, contractor=request.user).first()
        if not item:
            return Response({"detail": "Opportunity not found."}, status=status.HTTP_404_NOT_FOUND)
        previous_stage = item.stage
        stage = str(request.data.get("stage") or previous_stage).upper()
        if stage not in {choice[0] for choice in Lead.Stage.choices}:
            return Response({"stage": "Select a valid opportunity stage."}, status=status.HTTP_400_BAD_REQUEST)
        if stage == Lead.Stage.LOST and previous_stage != Lead.Stage.LOST:
            lost_reason = str(request.data.get("lost_reason") or "").upper()
            if lost_reason not in {choice[0] for choice in Lead.LostReason.choices}:
                return Response({"lost_reason": "Select a reason for losing this opportunity."}, status=status.HTTP_400_BAD_REQUEST)
            item.lost_reason = lost_reason
            item.lost_note = str(request.data.get("lost_note") or "").strip()
        elif stage not in (Lead.Stage.LOST, Lead.Stage.CANCELLED) and previous_stage == Lead.Stage.LOST:
            # Reopen: clear the lost details and restore the opportunity
            item.lost_reason = ""
            item.lost_note = ""
            if item.archived_at:
                item.archived_at = None
        item.stage = stage
        if stage in (Lead.Stage.QUOTATION, Lead.Stage.WON, Lead.Stage.IN_PROGRESS, Lead.Stage.COMPLETED, Lead.Stage.LOST, Lead.Stage.CANCELLED) and not item.archived_at:
            item.archived_at = timezone.now()
        if "estimated_value" in request.data: item.estimated_value = request.data.get("estimated_value") or None
        if "priority" in request.data and str(request.data.get("priority")).upper() in {choice[0] for choice in Lead.Priority.choices}:
            item.priority = str(request.data.get("priority")).upper()
        if "source" in request.data and str(request.data.get("source")).upper() in {choice[0] for choice in Lead.Source.choices}:
            item.source = str(request.data.get("source")).upper()
        if "property" in request.data:
            item.property = Property.objects.filter(pk=request.data.get("property"), customer=item.customer).first() if request.data.get("property") else None
        if "assigned_user" in request.data:
            item.assigned_user = BharathUser.objects.filter(pk=request.data.get("assigned_user")).first() if request.data.get("assigned_user") else None
        if "expected_start_date" in request.data:
            item.expected_start_date = parse_date(str(request.data.get("expected_start_date") or ""))
        if "site_visit_required" in request.data:
            item.site_visit_required = bool(request.data.get("site_visit_required"))
        if "notes" in request.data:
            item.notes = str(request.data.get("notes") or "").strip()
        if "title" in request.data and str(request.data.get("title") or "").strip():
            item.title = str(request.data.get("title")).strip()
        if "description" in request.data:
            item.description = str(request.data.get("description") or "").strip()
        if "next_follow_up" in request.data:
            value = parse_datetime(str(request.data.get("next_follow_up") or ""))
            if value and timezone.is_naive(value):
                value = timezone.make_aware(value)
            item.next_follow_up = value
        item.save()
        if stage != previous_stage:
            note = str(request.data.get("stage_note") or "").strip() or {
                Lead.Stage.QUOTATION: "Quotation prepared",
                Lead.Stage.MEASUREMENT: "Area Calculation added",
                Lead.Stage.WON: "Opportunity won",
                Lead.Stage.LOST: f"Opportunity lost: {item.get_lost_reason_display() or 'reason not recorded'}",
            }.get(stage, f"Opportunity moved to {item.get_stage_display()}")
            LeadStageHistory.objects.create(lead=item, from_stage=previous_stage, to_stage=stage, note=note, changed_by=request.user)
        if item.service_request_id:
            mapping = {Lead.Stage.NEW: ServiceRequest.Status.NEW, Lead.Stage.CONTACTED: ServiceRequest.Status.REVIEWING, Lead.Stage.FOLLOW_UP: ServiceRequest.Status.REVIEWING, Lead.Stage.SITE_VISIT: ServiceRequest.Status.SITE_VISIT, Lead.Stage.QUOTATION: ServiceRequest.Status.QUOTATION, Lead.Stage.NEGOTIATION: ServiceRequest.Status.QUOTATION, Lead.Stage.WON: ServiceRequest.Status.ACCEPTED, Lead.Stage.IN_PROGRESS: ServiceRequest.Status.ACCEPTED, Lead.Stage.COMPLETED: ServiceRequest.Status.COMPLETED, Lead.Stage.CANCELLED: ServiceRequest.Status.CANCELLED, Lead.Stage.LOST: ServiceRequest.Status.CANCELLED}
            if stage in mapping:
                ServiceRequest.objects.filter(pk=item.service_request_id).update(
                    status=mapping[stage], contractor_seen_at=timezone.now(), customer_seen_at=None
                )
        return Response(lead_data(Lead.objects.select_related("customer", "service_type", "service_request").prefetch_related("stage_history", "quotations").get(pk=item.pk)))


def normalize_mobile(value):
    """Reduce any phone format to the last 10 digits for duplicate checks."""
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


class ClientSearchView(APIView):
    """Quick client lookup by normalized mobile / name / email for the contractor."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        query = str(request.query_params.get("query") or "").strip()
        if not query:
            return Response({"query": "Enter a mobile number, name or email."}, status=status.HTTP_400_BAD_REQUEST)
        digits = normalize_mobile(query)
        filters = models.Q()
        if digits and len(digits) >= 6:
            filters |= models.Q(mobile__icontains=digits) | models.Q(whatsapp__icontains=digits) | models.Q(alternate_mobile__icontains=digits)
        filters |= models.Q(name__icontains=query) | models.Q(email__icontains=query) | models.Q(bharath_id__icontains=query)
        customers = Customer.objects.filter(
            models.Q(
                contractor_connections__contractor=request.user,
                contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
            ) | models.Q(
                contractor=request.user,
                contractor_connections__isnull=True,
            )
        ).filter(filters).distinct()[:8]
        return Response([{
            "id": item.id, "bharath_id": item.bharath_id, "name": item.name, "mobile": item.mobile,
            "alternate_mobile": item.alternate_mobile, "email": item.email, "client_type": item.client_type,
            "city": item.city, "address": item.address,
            "properties": item.properties.count(),
            "open_opportunities": item.leads.exclude(stage__in=(Lead.Stage.WON, Lead.Stage.LOST, Lead.Stage.CANCELLED, Lead.Stage.COMPLETED)).count(),
            "completed_jobs": item.leads.filter(stage__in=(Lead.Stage.COMPLETED, Lead.Stage.WON)).count(),
            "created_at": item.created_at,
        } for item in customers])


class SiteVisitListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        queryset = SiteVisit.objects.filter(contractor=request.user).select_related("opportunity", "customer", "property", "assigned_person")
        status_filter = str(request.query_params.get("status") or "").upper()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        visit_date = parse_date(str(request.query_params.get("date") or ""))
        if visit_date:
            queryset = queryset.filter(scheduled_date=visit_date)
        return Response([site_visit_data(item) for item in queryset])

    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        opportunity = Lead.objects.filter(pk=request.data.get("opportunity"), contractor=request.user).first()
        if not opportunity:
            return Response({"opportunity": "Select one of your opportunities."}, status=status.HTTP_400_BAD_REQUEST)
        scheduled_date = parse_date(str(request.data.get("scheduled_date") or ""))
        if not scheduled_date:
            return Response({"scheduled_date": "Enter a valid visit date."}, status=status.HTTP_400_BAD_REQUEST)
        scheduled_time = str(request.data.get("scheduled_time") or "").strip() or None
        visit = SiteVisit.objects.create(
            contractor=request.user, opportunity=opportunity, customer=opportunity.customer,
            property=opportunity.property,
            scheduled_date=scheduled_date, scheduled_time=scheduled_time,
            contact_person=str(request.data.get("contact_person") or "").strip(),
            contact_mobile=str(request.data.get("contact_mobile") or "").strip(),
            notes=str(request.data.get("notes") or "").strip(),
            created_by=request.user,
        )
        LeadStageHistory.objects.create(lead=opportunity, to_stage=opportunity.stage, note=f"Site visit scheduled for {scheduled_date}", changed_by=request.user)
        return Response(site_visit_data(visit), status=status.HTTP_201_CREATED)


def site_visit_data(item):
    return {
        "id": item.id, "reference_no": item.reference_no,
        "opportunity": item.opportunity_id, "opportunity_reference": item.opportunity.reference_no,
        "opportunity_title": item.opportunity.title, "stage": item.opportunity.stage,
        "customer": item.customer_id, "customer_name": item.customer.name, "customer_mobile": item.customer.mobile,
        "property": item.property_id,
        "property_name": (item.property.name or item.property.property_type) if item.property else "",
        "scheduled_date": item.scheduled_date, "scheduled_time": item.scheduled_time,
        "assigned_person": item.assigned_person_id,
        "contact_person": item.contact_person, "contact_mobile": item.contact_mobile,
        "status": item.status, "notes": item.notes, "created_at": item.created_at,
    }


class SiteVisitDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        visit = SiteVisit.objects.filter(pk=pk, contractor=request.user).first()
        if not visit:
            return Response({"detail": "Site visit not found."}, status=status.HTTP_404_NOT_FOUND)
        new_status = str(request.data.get("status") or visit.status).upper()
        if new_status not in {choice[0] for choice in SiteVisit.Status.choices}:
            return Response({"status": "Select a valid visit status."}, status=status.HTTP_400_BAD_REQUEST)
        visit.status = new_status
        for field in ("scheduled_date", "scheduled_time", "contact_person", "contact_mobile", "notes"):
            if field in request.data:
                setattr(visit, field, request.data.get(field) or None if field in ("scheduled_date", "scheduled_time") else str(request.data.get(field) or "").strip())
        if "scheduled_date" in request.data and str(request.data.get("scheduled_date") or ""):
            visit.scheduled_date = parse_date(str(request.data.get("scheduled_date")))
        if "assigned_person" in request.data:
            visit.assigned_person = BharathUser.objects.filter(pk=request.data.get("assigned_person")).first() if request.data.get("assigned_person") else None
        visit.save()
        note_by_status = {
            SiteVisit.Status.COMPLETED: "Site visit completed",
            SiteVisit.Status.RESCHEDULED: "Site visit rescheduled",
            SiteVisit.Status.CANCELLED: "Site visit cancelled",
            SiteVisit.Status.NO_SHOW: "Customer did not show up",
        }
        if new_status in note_by_status:
            LeadStageHistory.objects.create(lead=visit.opportunity, to_stage=visit.opportunity.stage, note=note_by_status[new_status], changed_by=request.user)
        return Response(site_visit_data(visit))


class LeadConvertView(APIView):
    """Won → Job conversion. Creates the work schedule for the accepted quotation."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from jobs.models import WorkSchedule
        opportunity = Lead.objects.select_related("customer").filter(pk=pk, contractor=request.user).first()
        if not opportunity:
            return Response({"detail": "Opportunity not found."}, status=status.HTTP_404_NOT_FOUND)
        quotation = opportunity.quotations.select_related("property").order_by("-created_at").first()
        if not quotation:
            return Response({"detail": "A quotation is required before converting to a job."}, status=status.HTTP_400_BAD_REQUEST)
        if WorkSchedule.objects.filter(quotation=quotation).exists():
            return Response({"detail": "This opportunity has already been converted to a job.", "job": WorkSchedule.objects.get(quotation=quotation).pk}, status=status.HTTP_400_BAD_REQUEST)
        start_date = parse_date(str(request.data.get("start_date") or "")) or timezone.localdate()
        end_date = parse_date(str(request.data.get("end_date") or "")) or start_date
        with transaction.atomic():
            opportunity.stage = Lead.Stage.WON
            if not opportunity.archived_at:
                opportunity.archived_at = timezone.now()
            opportunity.save()
            schedule = WorkSchedule.objects.create(
                quotation=quotation,
                proposed_start_date=start_date,
                proposed_end_date=end_date,
                proposed_by=request.user,
                status=WorkSchedule.Status.CONFIRMED,
                contractor_accepted=True,
            )
            LeadStageHistory.objects.create(lead=opportunity, from_stage=Lead.Stage.WON, to_stage=Lead.Stage.WON, note=f"Converted to job {schedule.pk} (quotation {quotation.quotation_number})", changed_by=request.user)
        return Response({
            "detail": "Opportunity successfully converted to job.",
            "job": schedule.pk, "schedule_id": schedule.pk,
            "opportunity": lead_data(Lead.objects.select_related("customer", "service_type", "service_request", "property", "assigned_user").prefetch_related("stage_history", "quotations").get(pk=opportunity.pk)),
        }, status=status.HTTP_201_CREATED)


class ServiceRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response([])
        options = []
        connections = ContractorCustomerConnection.objects.filter(
            customer__portal_user=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).select_related("customer", "contractor", "contractor__contractor_profile")
        for connection in connections:
            customer = connection.customer
            contractor = connection.contractor
            profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
            services = ServiceType.objects.filter(
                models.Q(created_by=contractor) | models.Q(created_by__isnull=True), is_active=True
            ).order_by("name")
            options.append({
                # Kept as the selector value for existing frontend clients.
                "customer": connection.id,
                "customer_record": customer.id,
                "connection": connection.id,
                "contractor_id": contractor.bharath_id,
                "contractor_name": profile.company_name if profile else contractor.get_full_name() or contractor.mobile,
                "default_address": customer.address,
                "services": [{"id": service.id, "name": service.name} for service in services],
            })
        return Response(options)


class ServiceRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        item = ServiceRequest.objects.select_related("customer", "connection__contractor").filter(pk=pk).first()
        if not item:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        is_contractor = (
            item.connection.contractor_id == request.user.id
            if item.connection_id else item.customer.contractor_id == request.user.id
        )
        is_customer = item.customer.portal_user_id == request.user.id
        status_value = str(request.data.get("status") or "").upper()
        valid = {choice[0] for choice in ServiceRequest.Status.choices}
        if not (is_contractor or (is_customer and status_value == ServiceRequest.Status.CANCELLED)):
            return Response({"detail": "You cannot update this request."}, status=status.HTTP_403_FORBIDDEN)
        if status_value not in valid:
            return Response({"status": "Select a valid status."}, status=status.HTTP_400_BAD_REQUEST)
        item.status = status_value
        if is_contractor:
            item.contractor_seen_at = timezone.now()
            item.customer_seen_at = None
        else:
            item.customer_seen_at = timezone.now()
            item.contractor_seen_at = None
        item.save(update_fields=("status", "contractor_seen_at", "customer_seen_at", "updated_at"))
        return Response(service_request_data(ServiceRequest.objects.select_related("customer", "customer__contractor", "connection__contractor", "service_type").get(pk=item.pk)))


def ticket_data(ticket):
    customer = ticket.customer
    requester = ticket.requester or (customer.portal_user if customer else None)
    contractor = (
        ticket.connection.contractor if ticket.connection_id
        else (customer.contractor if customer else (requester if requester and requester.role == BharathUser.Roles.CONTRACTOR else None))
    )
    profile = contractor.contractor_profile if contractor and hasattr(contractor, "contractor_profile") else None
    requester_name = customer.name if customer else (requester.get_full_name() or requester.mobile if requester else "Unknown user")
    return {
        "id": ticket.id, "ticket_number": f"BP-TKT-{ticket.id:06d}",
        "chat_conversation_id": ticket.chat_conversation_id,
        "customer": ticket.customer_id, "customer_bharath_id": customer.bharath_id if customer else "", "customer_name": customer.name if customer else "",
        "customer_mobile": customer.mobile if customer else (requester.mobile if requester else ""),
        "customer_email": customer.email if customer else (requester.email if requester else ""),
        "requester_name": requester_name, "requester_role": requester.role if requester else "CUSTOMER",
        "contractor_name": profile.company_name if profile else (contractor.get_full_name() or contractor.mobile if contractor else ""),
        "category": ticket.category, "priority": ticket.priority,
        "subject": ticket.subject, "description": ticket.description,
        "attachment": ticket.attachment.url if ticket.attachment else "",
        "status": ticket.status, "contractor_response": ticket.contractor_response,
        "assigned_to": ticket.assigned_to_id,
        "assigned_to_name": ticket.assigned_to.get_full_name() if ticket.assigned_to_id else "",
        "message_count": ticket.messages.count(),
        "created_at": ticket.created_at, "updated_at": ticket.updated_at,
    }


class SupportTicketListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tickets = SupportTicket.objects.select_related("requester", "assigned_to", "customer", "customer__portal_user", "connection__contractor", "connection__contractor__contractor_profile", "customer__contractor", "customer__contractor__contractor_profile")
        if request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser:
            pass
        elif request.user.role == BharathUser.Roles.CONTRACTOR:
            tickets = tickets.filter(
                models.Q(requester=request.user)
                | models.Q(connection__contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED)
                | models.Q(connection__isnull=True, customer__contractor=request.user)
            )
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            tickets = tickets.filter(models.Q(requester=request.user) | models.Q(requester__isnull=True, customer__portal_user=request.user))
        elif request.user.role == BharathUser.Roles.PAINTER:
            tickets = tickets.filter(requester=request.user)
        else:
            tickets = tickets.none()
        search = str(request.query_params.get("search") or "").strip()
        if search:
            tickets = tickets.filter(
                models.Q(subject__icontains=search) | models.Q(description__icontains=search)
                | models.Q(customer__name__icontains=search) | models.Q(customer__mobile__icontains=search)
                | models.Q(customer__email__icontains=search) | models.Q(requester__mobile__icontains=search)
                | models.Q(requester__email__icontains=search) | models.Q(requester__first_name__icontains=search)
            )
        status_value = str(request.query_params.get("status") or "").upper()
        if status_value:
            tickets = tickets.filter(status=status_value)
        data = [ticket_data(ticket) for ticket in tickets]
        requester_filter = models.Q(requester=request.user)
        if request.user.role == BharathUser.Roles.CUSTOMER:
            requester_filter |= models.Q(requester__isnull=True, customer__portal_user=request.user)
        requester_ids = tickets.filter(requester_filter).values_list("pk", flat=True)
        SupportTicket.objects.filter(pk__in=requester_ids, requester_seen_at__isnull=True).update(requester_seen_at=timezone.now())
        SupportTicket.objects.filter(pk__in=tickets.exclude(requester_filter).values_list("pk", flat=True), handler_seen_at__isnull=True).update(handler_seen_at=timezone.now())
        return Response(data)

    def post(self, request):
        if request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser:
            return Response({"detail": "Support handlers manage tickets and cannot raise one here."}, status=status.HTTP_403_FORBIDDEN)
        customer = None
        connection = None
        if request.user.role == BharathUser.Roles.CUSTOMER:
            selector = request.data.get("connection") or request.data.get("customer")
            connection = ContractorCustomerConnection.objects.select_related("customer").filter(
                pk=selector,
                customer__portal_user=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ).first()
            if not connection:
                legacy_customer = Customer.objects.filter(pk=request.data.get("customer"), portal_user=request.user).first()
                available = ContractorCustomerConnection.objects.filter(
                    customer=legacy_customer, status=ContractorCustomerConnection.Status.CONNECTED,
                ) if legacy_customer else ContractorCustomerConnection.objects.none()
                if available.count() == 1:
                    connection = available.first()
            if not connection:
                return Response({"connection": "Select the related contractor."}, status=status.HTTP_400_BAD_REQUEST)
            customer = connection.customer
        subject = str(request.data.get("subject") or "").strip()
        description = str(request.data.get("description") or "").strip()
        categories = {choice[0] for choice in SupportTicket.Category.choices}
        priorities = {choice[0] for choice in SupportTicket.Priority.choices}
        if not subject or not description:
            return Response({"detail": "Subject and description are required."}, status=status.HTTP_400_BAD_REQUEST)
        attachment = request.FILES.get("attachment")
        if attachment and (attachment.size > 10 * 1024 * 1024 or not (attachment.content_type or "").startswith(("image/", "video/"))):
            return Response({"attachment": "Attach an image or video smaller than 10 MB."}, status=status.HTTP_400_BAD_REQUEST)
        ticket = SupportTicket.objects.create(
            customer=customer, connection=connection, requester=request.user, subject=subject, description=description,
            attachment=attachment,
            category=request.data.get("category") if request.data.get("category") in categories else SupportTicket.Category.OTHER,
            priority=request.data.get("priority") if request.data.get("priority") in priorities else SupportTicket.Priority.MEDIUM,
            requester_seen_at=timezone.now(),
        )
        for administrator in BharathUser.objects.filter(models.Q(role__in=(BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT)) | models.Q(is_superuser=True), is_active=True).distinct():
            create_notification(administrator, "SUPPORT_TICKET", "New support ticket", f"{request.user.get_full_name() or request.user.mobile}: {subject}", "/support-tickets", request.user)
        return Response(ticket_data(ticket), status=status.HTTP_201_CREATED)


class PublicSupportTicketView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "anon_support_ticket"

    def post(self, request):
        mobile = canonical_mobile(str(request.data.get("mobile") or ""))
        matches = matching_mobile_users(mobile, BharathUser.objects.filter(is_active=True)) if mobile else []
        if len(matches) != 1 or matches[0].role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER, BharathUser.Roles.CUSTOMER):
            return Response({"detail": "Enter the registered mobile number for an active account."}, status=status.HTTP_400_BAD_REQUEST)
        subject = str(request.data.get("subject") or "").strip()
        description = str(request.data.get("description") or "").strip()
        if not subject or not description or len(subject) > 180 or len(description) > 4000:
            return Response({"detail": "Enter a subject and a description of up to 4,000 characters."}, status=status.HTTP_400_BAD_REQUEST)
        attachment = request.FILES.get("attachment")
        if attachment and (attachment.size > 10 * 1024 * 1024 or not (attachment.content_type or "").startswith(("image/", "video/"))):
            return Response({"attachment": "Attach an image or video smaller than 10 MB."}, status=status.HTTP_400_BAD_REQUEST)
        user = matches[0]
        ticket = SupportTicket.objects.create(requester=user, subject=subject, description=description, attachment=attachment, category=SupportTicket.Category.OTHER, requester_seen_at=timezone.now())
        for administrator in BharathUser.objects.filter(models.Q(role__in=(BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT)) | models.Q(is_superuser=True), is_active=True).distinct():
            create_notification(administrator, "SUPPORT_TICKET", "New support ticket", f"{user.mobile}: {subject}", "/support-tickets", user)
        return Response({"ticket_number": f"BP-TKT-{ticket.pk:06d}"}, status=status.HTTP_201_CREATED)


class SupportTicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_ticket(self, request, pk):
        ticket = SupportTicket.objects.select_related("requester", "assigned_to", "customer", "customer__portal_user", "connection__contractor", "customer__contractor").prefetch_related("messages__sender").filter(pk=pk).first()
        if not ticket:
            return None
        allowed = (
            request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser
            or ticket.requester_id == request.user.id
            or (ticket.customer and ticket.customer.portal_user_id == request.user.id)
            or (ticket.connection_id and ticket.connection.status == ContractorCustomerConnection.Status.CONNECTED and ticket.connection.contractor_id == request.user.id)
            or (not ticket.connection_id and ticket.customer and ticket.customer.contractor_id == request.user.id)
        )
        return ticket if allowed else None

    def get(self, request, pk):
        ticket = self.get_ticket(request, pk)
        if not ticket:
            return Response({"detail": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
        if ticket.requester_id == request.user.id or (not ticket.requester_id and ticket.customer and ticket.customer.portal_user_id == request.user.id):
            ticket.requester_seen_at = timezone.now()
            ticket.save(update_fields=("requester_seen_at",))
        else:
            ticket.handler_seen_at = timezone.now()
            ticket.save(update_fields=("handler_seen_at",))
        data = ticket_data(ticket)
        data["activities"] = [{"type": "CREATED", "message": "Ticket raised", "attachment": ticket.attachment.url if ticket.attachment else "", "actor": data["requester_name"], "created_at": ticket.created_at}] + [{
            "id": item.id, "type": "MESSAGE", "message": item.message,
            "attachment": item.attachment.url if item.attachment else "",
            "actor": item.sender.get_full_name() or item.sender.mobile,
            "actor_role": item.sender.role, "status": item.status_snapshot,
            "is_mine": item.sender_id == request.user.id, "created_at": item.created_at,
        } for item in ticket.messages.all()]
        if request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser:
            data["internal_activities"] = [
                {"action": item.action, "reason": item.reason, "actor": item.actor.get_full_name() or item.actor.mobile,
                 "created_at": item.created_at, "target_type": item.target_type, "target_id": item.target_id}
                for item in ticket.actions.select_related("actor").all()
            ]
        return Response(data)

    def post(self, request, pk):
        ticket = self.get_ticket(request, pk)
        if not ticket:
            return Response({"detail": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get("internal_note") is not None:
            if request.user.role not in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) and not request.user.is_superuser:
                return Response({"detail": "Support access only."}, status=status.HTTP_403_FORBIDDEN)
            note = str(request.data.get("internal_note") or "").strip()
            if not note or len(note) > 4000:
                return Response({"internal_note": "Enter a note of up to 4000 characters."}, status=status.HTTP_400_BAD_REQUEST)
            item = SupportActionLog.objects.create(actor=request.user, ticket=ticket, action="INTERNAL_NOTE", target_type="TICKET", target_id=ticket.pk, reason=note)
            return Response({"id": item.pk, "message": "Internal note saved."}, status=status.HTTP_201_CREATED)
        message = str(request.data.get("message") or "").strip()
        if not message and not request.FILES.get("attachment"):
            return Response({"message": "Enter a response."}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > 4000:
            return Response({"message": "Response is too long."}, status=status.HTTP_400_BAD_REQUEST)
        attachment = request.FILES.get("attachment")
        if attachment and (attachment.size > 10 * 1024 * 1024 or not (attachment.content_type or "").startswith(("image/", "video/"))):
            return Response({"attachment": "Attach an image or video smaller than 10 MB."}, status=status.HTTP_400_BAD_REQUEST)
        item = SupportTicketMessage.objects.create(ticket=ticket, sender=request.user, message=message, attachment=attachment, status_snapshot=ticket.status)
        is_handler = (
            request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser
            or (ticket.connection_id and ticket.connection.contractor_id == request.user.id and ticket.requester_id != request.user.id)
            or (not ticket.connection_id and ticket.customer and ticket.customer.contractor_id == request.user.id and ticket.requester_id != request.user.id)
        )
        if is_handler:
            ticket.handler_seen_at = timezone.now()
            ticket.requester_seen_at = None
        else:
            ticket.requester_seen_at = timezone.now()
            ticket.handler_seen_at = None
        ticket.save(update_fields=("handler_seen_at", "requester_seen_at", "updated_at"))
        if is_handler:
            recipient = ticket.requester or (ticket.customer.portal_user if ticket.customer else None)
            create_notification(recipient, "SUPPORT_MESSAGE", "New support response", f"{ticket.subject}: {message[:120]}", "/support-tickets", request.user)
        else:
            for administrator in BharathUser.objects.filter(models.Q(role__in=(BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT)) | models.Q(is_superuser=True), is_active=True).distinct():
                create_notification(administrator, "SUPPORT_MESSAGE", "New ticket reply", f"{ticket_data(ticket)['requester_name']}: {message[:120]}", "/support-tickets", request.user)
        return Response({"id": item.id, "message": item.message, "attachment": item.attachment.url if item.attachment else "", "created_at": item.created_at}, status=status.HTTP_201_CREATED)

    def patch(self, request, pk):
        ticket = self.get_ticket(request, pk)
        can_manage = ticket and (
            request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT)
            or request.user.is_superuser
            or (ticket.connection_id and ticket.connection.status == ContractorCustomerConnection.Status.CONNECTED and ticket.connection.contractor_id == request.user.id)
            or (not ticket.connection_id and ticket.customer and ticket.customer.contractor_id == request.user.id)
        )
        if not can_manage:
            return Response({"detail": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
        status_value = str(request.data.get("status") or ticket.status).upper()
        if status_value not in {choice[0] for choice in SupportTicket.Status.choices}:
            return Response({"status": "Select a valid status."}, status=status.HTTP_400_BAD_REQUEST)
        is_staff_handler = request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser
        if status_value == SupportTicket.Status.NEEDS_ADMIN and not is_staff_handler:
            return Response({"status": "Only support staff can escalate a ticket."}, status=status.HTTP_403_FORBIDDEN)
        before = {"status": ticket.status, "priority": ticket.priority, "assigned_to": ticket.assigned_to_id}
        if is_staff_handler:
            priority = request.data.get("priority", ticket.priority)
            if priority not in {choice[0] for choice in SupportTicket.Priority.choices}:
                return Response({"priority": "Select a valid priority."}, status=status.HTTP_400_BAD_REQUEST)
            ticket.priority = priority
            if "assigned_to" in request.data:
                assignee_id = request.data.get("assigned_to")
                if assignee_id in (None, ""):
                    ticket.assigned_to = None
                else:
                    assignee = BharathUser.objects.filter(pk=assignee_id, role=BharathUser.Roles.SUPPORT, is_active=True).first()
                    if not assignee:
                        return Response({"assigned_to": "Select an active support staff member."}, status=status.HTTP_400_BAD_REQUEST)
                    ticket.assigned_to = assignee
        ticket.status = status_value
        new_response = str(request.data.get("contractor_response") or "").strip()
        ticket.contractor_response = new_response
        ticket.handler_seen_at = timezone.now()
        ticket.requester_seen_at = None
        ticket.save(update_fields=("status", "priority", "assigned_to", "contractor_response", "handler_seen_at", "requester_seen_at", "updated_at"))
        after = {"status": ticket.status, "priority": ticket.priority, "assigned_to": ticket.assigned_to_id}
        if is_staff_handler and before != after:
            SupportActionLog.objects.create(actor=request.user, ticket=ticket, action="TICKET_UPDATED", target_type="TICKET", target_id=ticket.pk, reason=str(request.data.get("reason") or "Ticket triage"), before=before, after=after)
            if ticket.assigned_to_id and ticket.assigned_to_id != before["assigned_to"]:
                create_notification(ticket.assigned_to, "SUPPORT_ASSIGNMENT", "Support ticket assigned", f"BP-TKT-{ticket.pk:06d}: {ticket.subject}", "/support-tickets", request.user)
            if ticket.status == SupportTicket.Status.NEEDS_ADMIN and before["status"] != ticket.status:
                for administrator in BharathUser.objects.filter(models.Q(role=BharathUser.Roles.ADMIN) | models.Q(is_superuser=True), is_active=True).distinct():
                    create_notification(administrator, "SUPPORT_ESCALATION", "Support case needs administrator", f"BP-TKT-{ticket.pk:06d}: {ticket.subject}", "/support-tickets", request.user)
        if new_response:
            SupportTicketMessage.objects.create(ticket=ticket, sender=request.user, message=new_response, status_snapshot=ticket.status)
        recipient = ticket.requester or (ticket.customer.portal_user if ticket.customer else None)
        create_notification(recipient, "SUPPORT_UPDATE", "Support ticket updated", f"{ticket.subject}: {ticket.get_status_display()}", "/support-tickets", request.user)
        return Response(ticket_data(ticket))


class AdminOperationsDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.ADMIN and not request.user.is_superuser:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)

        from jobs.models import WorkSchedule, WorkSchedulePainter
        today = timezone.localdate()
        active_schedule_statuses = (WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS)
        today_schedules = WorkSchedule.objects.filter(
            proposed_start_date__lte=today, proposed_end_date__gte=today,
            status__in=active_schedule_statuses,
        ).select_related("quotation__contractor", "quotation__customer", "quotation__property")
        contractor_work = {}
        for schedule in today_schedules:
            contractor_work.setdefault(schedule.quotation.contractor_id, []).append(schedule)
        today_assignments = WorkSchedulePainter.objects.filter(
            schedule__in=today_schedules,
            status__in=(WorkSchedulePainter.Status.ASSIGNED, WorkSchedulePainter.Status.IN_PROGRESS),
        ).select_related("painter", "schedule__quotation__customer", "schedule__quotation__property")
        applicator_work = {}
        for assignment in today_assignments:
            applicator_work.setdefault(assignment.painter_id, []).append(assignment.schedule)

        contractors = ContractorProfile.objects.select_related("user").filter(user__is_active=True).order_by("-user__created_at")
        painters = PainterProfile.objects.select_related("user").filter(user__is_active=True).order_by("-user__created_at")
        customers = Customer.objects.select_related("contractor", "portal_user").exclude(status=Customer.Status.CANCELLED).order_by("-created_at")
        quotations = Quotation.objects.select_related("contractor", "customer", "property").prefetch_related("items").order_by("-updated_at")
        messages = ChatMessage.objects.select_related(
            "sender", "conversation__customer", "conversation__customer__contractor", "conversation__customer__portal_user",
            "conversation__contractor", "conversation__painter"
        ).order_by("-created_at")

        contractor_rows = [{
            "id": profile.user_id,
            "name": profile.owner_name or profile.user.get_full_name() or profile.user.mobile,
            "company": profile.company_name,
            "mobile": profile.user.mobile,
            "email": profile.user.email,
            "bharath_id": profile.user.bharath_id,
            "working_today": bool(contractor_work.get(profile.user_id)),
            "current_work": " | ".join(f"{item.quotation.property.name or item.quotation.property.property_type} - {item.quotation.customer.name}" for item in contractor_work.get(profile.user_id, [])),
            "work_dates": " | ".join(f"{item.proposed_start_date} to {item.proposed_end_date}" for item in contractor_work.get(profile.user_id, [])),
            "verification_status": profile.user.verification_status,
            "service_areas": profile.service_areas,
            "address": profile.office_address,
            "gst_number": profile.gst_number,
            "number_of_painters": profile.number_of_painters,
            "team_size": profile.user.applicator_team_members.count(),
            "profile_completion": contractor_profile_completion(profile)["percent"],
            "created_at": profile.user.created_at,
        } for profile in contractors]
        painter_rows = [{
            "id": profile.user_id,
            "name": profile.user.get_full_name() or profile.user.mobile,
            "mobile": profile.user.mobile,
            "email": profile.user.email,
            "bharath_id": profile.user.bharath_id,
            "working_today": bool(applicator_work.get(profile.user_id)),
            "current_work": " | ".join(f"{item.quotation.property.name or item.quotation.property.property_type} - {item.quotation.customer.name}" for item in applicator_work.get(profile.user_id, [])),
            "work_dates": " | ".join(f"{item.proposed_start_date} to {item.proposed_end_date}" for item in applicator_work.get(profile.user_id, [])),
            "verification_status": profile.user.verification_status,
            "experience_years": profile.experience_years,
            "skills": profile.skills,
            "locations": profile.preferred_locations,
            "daily_wage": profile.daily_wage,
            "weekly_wage": profile.weekly_wage,
            "availability": profile.availability,
            "teams": profile.user.contractor_teams.count(),
            "created_at": profile.user.created_at,
        } for profile in painters]
        customer_rows = [{
            "id": item.id,
            "bharath_id": item.bharath_id,
            "name": item.name,
            "mobile": item.mobile,
            "email": item.email,
            "city": item.city,
            "address": item.address,
            "requirement": item.requirement,
            "status": item.status,
            "source": item.source,
            "contractor": (
                item.contractor.get_full_name() or item.contractor.mobile
                if item.contractor
                else "Unassigned"
            ),
            "contractor_id": item.contractor_id,
            "portal_enabled": bool(item.portal_user_id),
            "created_at": item.created_at,
        } for item in customers]
        quotation_rows = [{
            "id": item.id,
            "number": item.quotation_number,
            "contractor": item.contractor.get_full_name() or item.contractor.mobile,
            "customer": item.customer.name,
            "customer_bharath_id": item.customer.bharath_id,
            "property": item.property.name or item.property.property_type,
            "status": item.status,
            "subtotal": item.subtotal,
            "grand_total": item.grand_total,
            "items": item.items.count(),
            "quotation_date": item.quotation_date,
            "updated_at": item.updated_at,
        } for item in quotations]
        message_rows = [{
            "id": item.id,
            "conversation": item.conversation_id,
            "contractor": item.conversation.contractor.get_full_name() or item.conversation.contractor.mobile,
            "customer": item.conversation.customer.name if item.conversation.customer else (item.conversation.painter.get_full_name() or item.conversation.painter.mobile),
            "customer_bharath_id": item.conversation.customer.bharath_id if item.conversation.customer else item.conversation.painter.bharath_id,
            "sender": item.sender.get_full_name() or item.sender.mobile,
            "sender_role": item.sender.role,
            "text": item.text,
            "read": bool(item.read_at),
            "created_at": item.created_at,
        } for item in messages]
        return Response({
            "counts": {
                "contractors": len(contractor_rows), "applicators": len(painter_rows),
                "active_contractors": sum(1 for row in contractor_rows if row["working_today"]),
                "active_applicators": sum(1 for row in painter_rows if row["working_today"]),
                "customers": len(customer_rows), "quotations": len(quotation_rows),
                "messages": len(message_rows),
            },
            "contractors": contractor_rows,
            "applicators": painter_rows,
            "customers": customer_rows,
            "quotations": quotation_rows,
            "messages": message_rows,
        })


def admin_only(user):
    return user.role == BharathUser.Roles.ADMIN or user.is_superuser


class AdminSupportStaffView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request.user) and request.user.role != BharathUser.Roles.SUPPORT:
            return Response({"detail": "Support access only."}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role == BharathUser.Roles.SUPPORT:
            return Response([{"id": user.pk, "name": user.get_full_name()} for user in BharathUser.objects.filter(role=BharathUser.Roles.SUPPORT, is_active=True).order_by("first_name", "last_name")])
        return Response([{
            "id": user.pk, "name": user.get_full_name(), "mobile": user.mobile,
            "email": user.email, "is_active": user.is_active, "created_at": user.date_joined,
        } for user in BharathUser.objects.filter(role=BharathUser.Roles.SUPPORT).order_by("-date_joined")])

    @transaction.atomic
    def post(self, request):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get("name") or "").strip()
        email = str(request.data.get("email") or "").strip().lower()
        mobile = canonical_mobile(request.data.get("mobile"))
        if not name or not email or not mobile:
            return Response({"detail": "Name, valid mobile and email are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response({"email": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
        if matching_mobile_users(mobile) or BharathUser.objects.filter(email__iexact=email).exists() or BharathUser.objects.filter(recovery_email__iexact=email).exists():
            return Response({"detail": "The mobile or email is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        password = secrets.token_urlsafe(12)
        parts = name.split(maxsplit=1)
        user = BharathUser.objects.create_user(
            mobile=mobile, email=email, password=password,
            first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "",
            role=BharathUser.Roles.SUPPORT, is_active=True,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
            verification_notes="Support staff account created by administrator.",
        )
        SupportActionLog.objects.create(actor=request.user, action="STAFF_CREATED", target_type="USER", target_id=user.pk, reason="Created support staff account", after={"role": user.role, "is_active": True})
        return Response({"id": user.pk, "mobile": user.mobile, "temporary_password": password}, status=status.HTTP_201_CREATED)


class AdminSupportStaffDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        user = BharathUser.objects.select_for_update().filter(pk=pk, role=BharathUser.Roles.SUPPORT).first()
        if not user:
            return Response({"detail": "Support staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if "is_active" not in request.data or not isinstance(request.data["is_active"], bool):
            return Response({"is_active": "Choose whether this account is active."}, status=status.HTTP_400_BAD_REQUEST)
        before = {"is_active": user.is_active}
        user.is_active = request.data["is_active"]
        user.save(update_fields=("is_active", "updated_at"))
        SupportActionLog.objects.create(actor=request.user, action="STAFF_ACCESS_CHANGED", target_type="USER", target_id=user.pk, reason=str(request.data.get("reason") or "Staff access updated"), before=before, after={"is_active": user.is_active})
        return Response({"id": user.pk, "is_active": user.is_active})


class AdminReleaseDeletedCustomerMobilesView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        from .customer_identity import release_all_deleted_customer_mobiles
        customers, accounts = release_all_deleted_customer_mobiles()
        return Response({
            "message": f"Released numbers from {customers} deleted customer records and {accounts} suspended customer logins.",
            "customers": customers,
            "accounts": accounts,
        })


class AdminReleaseInactiveBusinessMobilesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        role = request.query_params.get("role")
        if role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            return Response({"detail": "Select contractor or painter accounts."}, status=status.HTTP_400_BAD_REQUEST)
        users = BharathUser.objects.filter(
            role=role, is_active=False,
            verification_status=BharathUser.VerificationStatus.SUSPENDED,
        ).exclude(mobile__startswith="D").order_by("-id")
        return Response({"accounts": [
            {"id": user.pk, "name": user.get_full_name() or user.bharath_id,
             "mobile": user.mobile, "bharath_id": user.bharath_id}
            for user in users
        ]})

    @transaction.atomic
    def post(self, request):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        role = request.data.get("role")
        ids = request.data.get("user_ids")
        if role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER) or not isinstance(ids, list) or not ids:
            return Response({"detail": "Select inactive contractor or painter accounts."}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > 100 or any(not isinstance(value, int) or isinstance(value, bool) for value in ids):
            return Response({"detail": "Select up to 100 valid accounts."}, status=status.HTTP_400_BAD_REQUEST)
        users = list(BharathUser.objects.select_for_update().filter(
            pk__in=ids, role=role, is_active=False,
            verification_status=BharathUser.VerificationStatus.SUSPENDED,
        ).exclude(mobile__startswith="D"))
        if len(users) != len(set(ids)):
            return Response({"detail": "Some selected accounts are no longer eligible. Refresh the list."}, status=status.HTTP_409_CONFLICT)
        from accounts.account_retirement import retire_business_account
        for user in users:
            retire_business_account(user)
        return Response({"message": f"Released numbers from {len(users)} inactive accounts.", "count": len(users)})


def next_bharath_id(role):
    prefix = "BP-C-" if role == BharathUser.Roles.CONTRACTOR else "BP-P-"
    numbers = []
    for value in BharathUser.objects.filter(role=role, bharath_id__startswith=prefix).values_list("bharath_id", flat=True):
        try: numbers.append(int(value.replace(prefix, "")))
        except (TypeError, ValueError): continue
    return f"{prefix}{max(numbers, default=0) + 1:06d}"


class AdminEntityListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, entity):
        if not admin_only(request.user): return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        if entity == "customers":
            contractor = BharathUser.objects.filter(pk=request.data.get("contractor_id"), role=BharathUser.Roles.CONTRACTOR).first()
            if not contractor: return Response({"contractor_id": "Select a contractor."}, status=status.HTTP_400_BAD_REQUEST)
            customer_data = {
                "name": str(request.data.get("name") or "").strip(),
                "mobile": str(request.data.get("mobile") or "").strip(),
                "email": str(request.data.get("email") or "").strip(),
                "city": str(request.data.get("city") or "").strip(),
                "address": str(request.data.get("address") or "").strip(),
                "source": request.data.get("source") or Customer.Source.OTHER,
                "status": request.data.get("status") or Customer.Status.NEW,
                "requirement": str(request.data.get("requirement") or "").strip(),
            }
            serializer = CustomerSerializer(data=customer_data, context={"request": request})
            serializer.is_valid(raise_exception=True)
            item = serializer.save(contractor=contractor)
            link_customer_portal(item)
            return Response({"id": item.id, "bharath_id": item.bharath_id, "message": "Customer created."}, status=status.HTTP_201_CREATED)
        role = BharathUser.Roles.CONTRACTOR if entity == "contractors" else BharathUser.Roles.PAINTER if entity == "applicators" else None
        if not role: return Response({"detail": "Unknown entity."}, status=status.HTTP_404_NOT_FOUND)
        mobile = str(request.data.get("mobile") or "").strip(); name = str(request.data.get("name") or "").strip()
        if not mobile or not name: return Response({"detail": "Name and mobile are required."}, status=status.HTTP_400_BAD_REQUEST)
        if role == BharathUser.Roles.CONTRACTOR and not str(request.data.get("email") or "").strip(): return Response({"email": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        if role == BharathUser.Roles.CONTRACTOR and not str(request.data.get("password") or "").strip(): return Response({"password": "Password is required."}, status=status.HTTP_400_BAD_REQUEST)
        mobile = canonical_mobile(mobile)
        if not mobile: return Response({"mobile": "Enter a valid mobile number with country code for international numbers."}, status=status.HTTP_400_BAD_REQUEST)
        if matching_mobile_users(mobile): return Response({"mobile": "This mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        password = str(request.data.get("password") or "").strip() or f"BP@{secrets.token_urlsafe(6)}"
        if len(password) < 8: return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
        parts = name.split(maxsplit=1); now = timezone.now()
        user = BharathUser.objects.create_user(mobile=mobile, email=str(request.data.get("email") or "").strip() or None, password=password, first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "", role=role, is_active=True, is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED, verified_at=now, badge_issued_at=now, bharath_id=next_bharath_id(role), verification_notes="Created by administrator.")
        if role == BharathUser.Roles.CONTRACTOR:
            ContractorProfile.objects.create(user=user, owner_name=name, company_name=str(request.data.get("company") or "").strip(), service_areas=str(request.data.get("service_areas") or "").strip(), office_address=str(request.data.get("address") or "").strip(), gst_number=str(request.data.get("gst_number") or "").strip(), number_of_painters=max(0, int(request.data.get("number_of_painters") or 0)))
        else:
            PainterProfile.objects.create(user=user, experience_years=max(0, int(request.data.get("experience_years") or 0)), skills=str(request.data.get("skills") or "").strip(), preferred_locations=str(request.data.get("locations") or "").strip(), daily_wage=request.data.get("daily_wage") or None, weekly_wage=request.data.get("weekly_wage") or None, availability=request.data.get("availability") or PainterProfile.Availability.AVAILABLE)
        return Response({"id": user.id, "message": "Account created.", "credentials": {"mobile": mobile, "password": password, "bharath_id": user.bharath_id}}, status=status.HTTP_201_CREATED)


class AdminPeopleExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        workbook = Workbook()
        contractor_sheet = workbook.active; contractor_sheet.title = "Contractors"
        contractor_sheet.append(["Bharath ID", "Company", "Owner", "Mobile", "Email", "Verification", "Service Areas", "Office Address", "GST Number", "Declared Applicators", "Active Team", "Created At"])
        for profile in ContractorProfile.objects.select_related("user").order_by("user__created_at"):
            contractor_sheet.append([profile.user.bharath_id, profile.company_name, profile.owner_name or profile.user.get_full_name(), profile.user.mobile, profile.user.email, profile.user.verification_status, profile.service_areas, profile.office_address, profile.gst_number, profile.number_of_painters, profile.user.applicator_team_members.count(), profile.user.created_at.replace(tzinfo=None)])
        applicator_sheet = workbook.create_sheet("Paint Applicators")
        applicator_sheet.append(["Bharath ID", "Name", "Mobile", "Email", "Verification", "Availability", "Experience Years", "Skills", "Preferred Locations", "Daily Wage", "Weekly Wage", "Contractor Teams", "Created At"])
        for profile in PainterProfile.objects.select_related("user").order_by("user__created_at"):
            applicator_sheet.append([profile.user.bharath_id, profile.user.get_full_name(), profile.user.mobile, profile.user.email, profile.user.verification_status, profile.availability, profile.experience_years, profile.skills, profile.preferred_locations, profile.daily_wage, profile.weekly_wage, profile.user.contractor_teams.count(), profile.user.created_at.replace(tzinfo=None)])
        customer_sheet = workbook.create_sheet("Customers")
        customer_sheet.append(["Customer Bharath ID", "Name", "Mobile", "Email", "City", "Address", "Status", "Source", "Requirement", "Contractor", "Contractor Bharath ID", "Portal Enabled", "Created At"])
        for item in Customer.objects.select_related("contractor", "portal_user").order_by("created_at"):
            customer_sheet.append([item.bharath_id, item.name, item.mobile, item.email, item.city, item.address, item.status, item.source, item.requirement, item.contractor.get_full_name() or item.contractor.mobile, item.contractor.bharath_id, bool(item.portal_user_id), item.created_at.replace(tzinfo=None)])
        for sheet in workbook.worksheets:
            sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions
            for cell in sheet[1]: cell.font = cell.font.copy(bold=True)
            for column in sheet.columns:
                letter = column[0].column_letter; sheet.column_dimensions[letter].width = min(max(len(str(cell.value or "")) for cell in column) + 2, 45)
        output = io.BytesIO(); workbook.save(output); output.seek(0)
        response = HttpResponse(output.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = f'attachment; filename="bharath-painters-people-{timezone.localdate()}.xlsx"'
        return response


class AdminEntityDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, entity, pk):
        if not admin_only(request.user): return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        if entity == "customers":
            item = Customer.objects.filter(pk=pk).first()
            if not item: return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
            if "mobile" in request.data:
                mobile = canonical_mobile(request.data["mobile"])
                if not mobile: return Response({"mobile": "Enter a valid mobile number with country code for international numbers."}, status=status.HTTP_400_BAD_REQUEST)
                if Customer.objects.exclude(pk=item.pk).filter(normalized_mobile=mobile).exists(): return Response({"mobile": "This customer mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)
            for field in ("name", "mobile", "email", "city", "address", "status", "source", "requirement"):
                if field in request.data: setattr(item, field, mobile if field == "mobile" else request.data[field])
            if "contractor_id" in request.data:
                contractor = BharathUser.objects.filter(pk=request.data["contractor_id"], role=BharathUser.Roles.CONTRACTOR).first()
                if not contractor: return Response({"contractor_id": "Select a contractor."}, status=status.HTTP_400_BAD_REQUEST)
                item.contractor = contractor
            item.save(); return Response({"message": "Customer updated."})
        role = BharathUser.Roles.CONTRACTOR if entity == "contractors" else BharathUser.Roles.PAINTER if entity == "applicators" else None
        user = BharathUser.objects.filter(pk=pk, role=role).first() if role else None
        if not user: return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
        if "mobile" in request.data:
            mobile = canonical_mobile(request.data["mobile"])
            if not mobile: return Response({"mobile": "Enter a valid mobile number with country code for international numbers."}, status=status.HTTP_400_BAD_REQUEST)
            if matching_mobile_users(mobile, exclude_pk=user.pk): return Response({"mobile": "This mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        if "name" in request.data:
            parts = str(request.data["name"]).strip().split(maxsplit=1); user.first_name = parts[0] if parts else ""; user.last_name = parts[1] if len(parts) > 1 else ""
        for field in ("email", "verification_status"):
            if field in request.data: setattr(user, field, request.data[field])
        if "mobile" in request.data: user.mobile = mobile
        if request.data.get("password"): user.set_password(str(request.data["password"]))
        user.is_verified = user.verification_status == BharathUser.VerificationStatus.VERIFIED; user.save()
        if role == BharathUser.Roles.CONTRACTOR:
            profile, _ = ContractorProfile.objects.get_or_create(user=user, defaults={"company_name": user.get_full_name(), "owner_name": user.get_full_name()}); mapping = {"company": "company_name", "name": "owner_name", "service_areas": "service_areas", "gst_number": "gst_number", "address": "office_address", "number_of_painters": "number_of_painters"}
        else:
            profile, _ = PainterProfile.objects.get_or_create(user=user); mapping = {"experience_years": "experience_years", "skills": "skills", "locations": "preferred_locations", "availability": "availability", "daily_wage": "daily_wage", "weekly_wage": "weekly_wage"}
        for source, target in mapping.items():
            if source in request.data: setattr(profile, target, request.data[source] if request.data[source] != "" else None if target in ("daily_wage", "weekly_wage") else "")
        profile.save(); return Response({"message": "Account updated."})

    def delete(self, request, entity, pk):
        if not admin_only(request.user): return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        reason = str(request.data.get("reason") or "").strip()
        if len(reason) < 10 or len(reason) > 1000:
            return Response({"reason": "Provide a deletion justification of 10 to 1000 characters."}, status=status.HTTP_400_BAD_REQUEST)
        if entity == "customers":
            item = Customer.objects.filter(pk=pk).first()
            if not item: return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
            item.status = Customer.Status.CANCELLED
            item.mobile = f"D{item.pk}"
            item.email = ""
            item.whatsapp = ""
            item.alternate_mobile = ""
            item.save(update_fields=("status", "mobile", "normalized_mobile", "email", "whatsapp", "alternate_mobile", "updated_at"))
            CustomerShareLink.objects.filter(connection__customer=item).delete()
            for contact in SavedCustomerContact.objects.filter(customer=item):
                details = dict(contact.details or {})
                for key in ("mobile", "phone", "email", "whatsapp", "alternate_mobile"):
                    details.pop(key, None)
                contact.details = details
                contact.save(update_fields=("details", "updated_at"))
            portal_user = item.portal_user
            if portal_user and not Customer.objects.filter(portal_user=portal_user).exclude(status=Customer.Status.CANCELLED).exists():
                portal_user.mobile = f"D{portal_user.pk}"
                portal_user.email = ""
                portal_user.recovery_email = None
                portal_user.recovery_email_verified = False
                portal_user.google_email = ""
                portal_user.google_subject = None
                portal_user.is_active = False
                portal_user.is_verified = False
                portal_user.verification_status = BharathUser.VerificationStatus.SUSPENDED
                portal_user.save(update_fields=("mobile", "email", "recovery_email", "recovery_email_verified", "google_email", "google_subject", "is_active", "is_verified", "verification_status", "updated_at"))
            SupportActionLog.objects.create(actor=request.user, action="ADMIN_DELETE_ACCOUNT", target_type="CUSTOMER", target_id=item.pk, reason=reason, before={"status": "ACTIVE"}, after={"status": "CANCELLED", "portal_access_removed": bool(portal_user)})
        else:
            role = BharathUser.Roles.CONTRACTOR if entity == "contractors" else BharathUser.Roles.PAINTER if entity == "applicators" else None
            user = BharathUser.objects.filter(pk=pk, role=role).first() if role else None
            if not user: return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
            from accounts.account_retirement import retire_business_account
            retire_business_account(user)
            SupportActionLog.objects.create(actor=request.user, action="ADMIN_DELETE_ACCOUNT", target_type="USER", target_id=user.pk, reason=reason, before={"is_active": True, "role": user.role}, after={"is_active": False, "identity_removed": True})
        return Response({"message": "Mobile number released and account access removed. Historical business records were preserved."})


class CustomerPortalDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        customers = Customer.objects.filter(portal_user=request.user)
        customer_ids = customers.values_list("id", flat=True)
        connections = ContractorCustomerConnection.objects.filter(
            customer__portal_user=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).select_related("customer", "contractor", "contractor__contractor_profile")
        pending_connections = ContractorCustomerConnection.objects.filter(
            customer__portal_user=request.user,
            status=ContractorCustomerConnection.Status.PENDING,
        )
        conversations = ChatConversation.objects.filter(customer_id__in=customer_ids)
        requests = ServiceRequest.objects.filter(customer_id__in=customer_ids).select_related("customer", "customer__contractor", "service_type")
        tickets = SupportTicket.objects.filter(customer_id__in=customer_ids).select_related("customer", "customer__contractor")
        properties = accessible_properties(request.user, PropertyPermission.VIEW_PROPERTY).select_related("customer")
        quotations = CustomerQuotationListView.customer_queryset(request.user).exclude(status=Quotation.Status.DRAFT).select_related("customer", "contractor", "property")
        work_changes = customer_work_change_scope(request.user).exclude(status=WorkChange.Status.DRAFT)
        return Response({
            "customer_name": request.user.get_full_name() or request.user.first_name or request.user.mobile,
            "customer_bharath_ids": list(customers.values_list("bharath_id", flat=True)),
            "counts": {
                "contractors": connections.count(),
                "pending_connection_requests": pending_connections.count(),
                "unread_messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": requests.count(),
                "open_tickets": tickets.exclude(status__in=(SupportTicket.Status.RESOLVED, SupportTicket.Status.CLOSED)).count(),
                "properties": properties.count(),
                "quotations": quotations.count(),
                "work_changes": work_changes.filter(status=WorkChange.Status.SENT_TO_CUSTOMER).count(),
            },
            "recent_requests": [service_request_data(item) for item in requests[:5]],
            "recent_tickets": [ticket_data(item) for item in tickets[:5]],
            "properties": [{
                "id": item.id, "name": item.name or item.property_type,
                "property_type": item.property_type, "city": item.city,
                "contractor_customer": item.customer_id,
            } for item in properties.order_by("-created_at")[:5]],
            "quotations": [{
                "id": item.id, "quotation_number": item.quotation_number,
                "status": item.status, "grand_total": item.grand_total,
                "quotation_date": item.quotation_date,
            } for item in quotations.order_by("-created_at")[:5]],
            "my_contractors": [connection_data(item, request.user.role) for item in connections[:5]],
            "pending_connection_count": pending_connections.count(),
        })


class ContractorCrmDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)

        from jobs.models import WorkSchedule, WorkSchedulePainter

        customers = Customer.objects.filter(
            contractor_connections__contractor=request.user,
            contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
        ).distinct()
        quotations = Quotation.objects.filter(
            contractor=request.user,
        ).exclude(
            status=Quotation.Status.CONVERTED,
        ).select_related("customer", "property")
        tasks = CustomerFollowUp.objects.filter(
            created_by=request.user,
            is_completed=False,
            next_follow_up__isnull=False,
        ).select_related("customer").order_by("next_follow_up")
        requests = ServiceRequest.objects.filter(
            models.Q(connection__contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED)
            | models.Q(connection__isnull=True, customer__contractor=request.user)
        ).select_related("customer", "service_type", "connection")
        conversations = ChatConversation.objects.filter(contractor=request.user)
        now = timezone.now()

        connected_customer_records = request.user.customer_connections.filter(
            status=ContractorCustomerConnection.Status.CONNECTED,
        )
        pipeline = [
            {"status": value, "label": label, "count": connected_customer_records.filter(customer_status=value).count()}
            for value, label in Customer.Status.choices
        ]
        recent_customers = customers.order_by("-updated_at")[:6]
        recent_quotations = quotations.order_by("-updated_at")[:6]

        profile = request.user.contractor_profile if hasattr(request.user, "contractor_profile") else None
        return Response({
            "contractor_name": profile.company_name if profile and profile.company_name else request.user.get_full_name() or request.user.mobile,
            "profile_completion": contractor_profile_completion(profile) if profile else {"percent": 0, "missing": []},
            "counts": {
                "customers": customers.count(),
                "active_leads": connected_customer_records.exclude(customer_status__in=(Customer.Status.WON, Customer.Status.LOST, Customer.Status.CANCELLED)).count(),
                "properties": Property.objects.filter(contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED, contractor_hidden_at__isnull=True).count(),
                "quotations": quotations.count(),
                "quotation_value": quotations.exclude(status__in=(Quotation.Status.REJECTED, Quotation.Status.CANCELLED, Quotation.Status.EXPIRED)).aggregate(total=models.Sum("grand_total"))["total"] or Decimal("0"),
                "due_tasks": tasks.filter(next_follow_up__lte=now).count(),
                "new_requests": requests.filter(status=ServiceRequest.Status.NEW).count(),
                "unread_messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "active_applicators": WorkSchedulePainter.objects.filter(
                    schedule__quotation__contractor=request.user,
                    schedule__proposed_start_date__lte=timezone.localdate(),
                    schedule__proposed_end_date__gte=timezone.localdate(),
                    schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
                    status__in=(WorkSchedulePainter.Status.ASSIGNED, WorkSchedulePainter.Status.IN_PROGRESS),
                ).values("painter_id").distinct().count(),
            },
            "pipeline": pipeline,
            "tasks": [{
                "id": item.id, "customer": item.customer_id, "customer_bharath_id": item.customer.bharath_id, "customer_name": item.customer.name,
                "customer_mobile": item.customer.mobile, "type": item.follow_up_type,
                "comment": item.comment, "next_follow_up": item.next_follow_up,
                "overdue": item.next_follow_up <= now,
            } for item in tasks[:6]],
            "recent_customers": [{
                "id": item.id, "bharath_id": item.bharath_id, "name": item.name, "mobile": item.mobile,
                "status": item.status, "city": item.city, "updated_at": item.updated_at,
            } for item in recent_customers],
            "recent_quotations": [{
                "id": item.id, "number": item.quotation_number, "customer": item.customer.name, "customer_bharath_id": item.customer.bharath_id,
                "property": item.property.name or item.property.property_type, "status": item.status,
                "amount": item.grand_total, "updated_at": item.updated_at,
            } for item in recent_quotations],
            "new_requests": [{
                "id": item.id, "customer": item.customer.name, "customer_bharath_id": item.customer.bharath_id,
                "title": item.title, "status": item.status, "created_at": item.created_at,
            } for item in requests.filter(status=ServiceRequest.Status.NEW)[:5]],
        })


def measurement_access_data(item):
    contractor = item.requesting_contractor
    return {
        "id": item.id, "customer": item.customer_id, "customer_bharath_id": item.customer.bharath_id, "customer_name": item.customer.name,
        "property_id": item.source_property_id,
        "target_property_id": item.target_property_id,
        "property_name": item.source_property.name or item.source_property.property_type,
        "property_type": item.source_property.property_type,
        "measurement_type": item.source_property.measurement_type,
        "measurement_date": item.source_property.updated_at,
        "status": item.status, "request_message": item.request_message,
        "customer_note": item.customer_note, "created_at": item.created_at,
        "decided_at": item.decided_at,
        "contractor_seen_at": item.contractor_seen_at, "customer_seen_at": item.customer_seen_at,
        "contractor_id": contractor.id, "contractor_name": contractor.get_full_name() or contractor.mobile,
        "contractor_mobile": contractor.mobile, "contractor_bharath_id": contractor.bharath_id,
    }


class MeasurementAccessContractorSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        term = str(request.query_params.get("search") or "").strip()
        if len(term) < 3:
            return Response([])
        contractors = BharathUser.objects.filter(
            role=BharathUser.Roles.CONTRACTOR, is_active=True, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).filter(models.Q(mobile__icontains=term) | models.Q(bharath_id__icontains=term)).select_related("contractor_profile")[:20]
        return Response([{"id": item.id, "name": item.contractor_profile.company_name if hasattr(item, "contractor_profile") else item.get_full_name() or item.mobile, "mobile": item.mobile, "bharath_id": item.bharath_id} for item in contractors])


class MeasurementAccessAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = Customer.objects.filter(
            pk=request.query_params.get("customer"),
            contractor_connections__contractor=request.user,
            contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
        ).distinct().first()
        if not customer:
            return Response([])
        if not customer.portal_user_id:
            link_customer_portal(customer)
            customer.refresh_from_db(fields=("portal_user",))
        if not customer.portal_user_id:
            return Response({"detail": "This customer has no portal login. Link the registered customer account before requesting approval."}, status=status.HTTP_400_BAD_REQUEST)
        properties = Property.objects.filter(
            customer_id__in=customer_identity_ids(customer),
            measurement_surfaces__measurement_record__submitted_at__isnull=False,
        ).exclude(contractor=request.user).distinct().order_by("-updated_at")
        return Response([{
            "id": item.id, "name": item.name or item.property_type,
            "property_type": item.property_type, "measurement_type": item.measurement_type,
            "updated_at": item.updated_at, "rooms": item.rooms.filter(measurement_record__submitted_at__isnull=False).count(),
            "surfaces": item.measurement_surfaces.filter(measurement_record__submitted_at__isnull=False).count(),
        } for item in properties])


class MeasurementAccessListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = MeasurementAccessRequest.objects.select_related("customer", "source_property")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(requesting_contractor=request.user)
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            queryset = queryset.filter(customer__portal_user=request.user)
        else:
            queryset = queryset.none()
        items = list(queryset)
        data = [measurement_access_data(item) for item in items]
        item_ids = [item.id for item in items]
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            MeasurementAccessRequest.objects.filter(
                id__in=item_ids, contractor_seen_at__isnull=True,
                status__in=(MeasurementAccessRequest.Status.APPROVED, MeasurementAccessRequest.Status.FRESH_REQUESTED, MeasurementAccessRequest.Status.REJECTED),
            ).update(contractor_seen_at=timezone.now())
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            MeasurementAccessRequest.objects.filter(
                id__in=item_ids, customer_seen_at__isnull=True,
                status=MeasurementAccessRequest.Status.PENDING,
            ).update(customer_seen_at=timezone.now())
        return Response(data)

    def post(self, request):
        if request.user.role == BharathUser.Roles.CUSTOMER:
            contractor = BharathUser.objects.filter(
                pk=request.data.get("contractor"), role=BharathUser.Roles.CONTRACTOR,
                is_active=True, is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
            ).first()
            source = Property.objects.filter(
                pk=request.data.get("source_property"), customer__portal_user=request.user,
                measurement_surfaces__measurement_record__submitted_at__isnull=False,
            ).select_related("customer").distinct().first()
            if not contractor or not source:
                return Response({"detail": "Select a property with an Area Calculation and a verified registered contractor."}, status=status.HTTP_400_BAD_REQUEST)
            item, _ = MeasurementAccessRequest.objects.update_or_create(
                requesting_contractor=contractor, customer=source.customer, source_property=source,
                defaults={"status": MeasurementAccessRequest.Status.APPROVED, "request_message": "Shared directly by customer.", "customer_note": str(request.data.get("customer_note") or "").strip(), "decided_at": timezone.now(), "contractor_seen_at": None, "customer_seen_at": timezone.now()},
            )
            create_notification(contractor, "MEASUREMENT_SHARED", "Customer shared an Area Calculation", f"{source.customer.name}: {source.name or source.property_type}", "/measurement-access", request.user)
            return Response(measurement_access_data(item), status=status.HTTP_201_CREATED)
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor or customer access only."}, status=status.HTTP_403_FORBIDDEN)
        customer = Customer.objects.filter(
            pk=request.data.get("customer"),
            contractor_connections__contractor=request.user,
            contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
        ).distinct().first()
        source = Property.objects.filter(pk=request.data.get("source_property"), measurement_surfaces__measurement_record__submitted_at__isnull=False).distinct().first()
        if customer and not customer.portal_user_id:
            link_customer_portal(customer)
            customer.refresh_from_db(fields=("portal_user",))
        identity_ids = customer_identity_ids(customer) if customer else []
        if not customer or not customer.portal_user_id or not source or source.customer_id not in identity_ids or source.contractor_id == request.user.id:
            return Response({"detail": "The previous Area Calculation is not available for this customer."}, status=status.HTTP_400_BAD_REQUEST)
        pending = MeasurementAccessRequest.objects.filter(
            requesting_contractor=request.user, customer=customer, source_property=source,
            status=MeasurementAccessRequest.Status.PENDING,
        ).first()
        if pending:
            pending.customer_seen_at = None
            pending.request_message = str(request.data.get("request_message") or "").strip()
            pending.save(update_fields=("customer_seen_at", "request_message", "updated_at"))
            item = pending
        else:
            item = MeasurementAccessRequest.objects.create(
                requesting_contractor=request.user, customer=customer, source_property=source,
                request_message=str(request.data.get("request_message") or "").strip(),
            )
        return Response(measurement_access_data(item), status=status.HTTP_201_CREATED)


class MeasurementAccessDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        item = MeasurementAccessRequest.objects.select_related("customer", "source_property").filter(pk=pk, customer__portal_user=request.user).first()
        if not item:
            return Response({"detail": "Access request not found."}, status=status.HTTP_404_NOT_FOUND)
        decision = str(request.data.get("status") or "").upper()
        allowed = {MeasurementAccessRequest.Status.APPROVED, MeasurementAccessRequest.Status.FRESH_REQUESTED, MeasurementAccessRequest.Status.REJECTED}
        if decision not in allowed:
            return Response({"status": "Select approve, fresh Area Calculation, or reject."}, status=status.HTTP_400_BAD_REQUEST)
        item.status = decision
        item.customer_note = str(request.data.get("customer_note") or "").strip()
        item.decided_at = timezone.now()
        item.customer_seen_at = timezone.now()
        item.contractor_seen_at = None
        item.save(update_fields=("status", "customer_note", "decided_at", "customer_seen_at", "contractor_seen_at", "updated_at"))
        return Response(measurement_access_data(item))


class ApprovedMeasurementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        access = MeasurementAccessRequest.objects.select_related("source_property").filter(
            pk=pk, requesting_contractor=request.user, status=MeasurementAccessRequest.Status.APPROVED,
        ).first()
        if not access:
            return Response({"detail": "Approved Area Calculation access was not found."}, status=status.HTTP_404_NOT_FOUND)
        property_obj = access.source_property
        records = property_obj.measurement_records.filter(
            submitted_at__isnull=False, surfaces__isnull=False
        ).distinct().select_related(
            "contractor", "contractor__contractor_profile"
        ).prefetch_related("surfaces__openings", "rooms").order_by("-measured_on", "-id")
        record_id = request.query_params.get("measurement")
        record = records.filter(id=record_id).first() if record_id else records.first()
        if record_id and not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        rooms = PropertyRoom.objects.filter(property=property_obj, measurement_record=record).order_by("id") if record else PropertyRoom.objects.none()
        surfaces = MeasurementSurface.objects.filter(property=property_obj, measurement_record=record).select_related("room").prefetch_related("openings").order_by("room_id", "id") if record else MeasurementSurface.objects.none()
        return Response({
            "property": {"name": property_obj.name or property_obj.property_type, "property_type": property_obj.property_type, "measurement_type": property_obj.measurement_type},
            "rooms": [{"id": room.id, "name": room.name} for room in rooms],
            "surfaces": [{
                "id": surface.id, "room": surface.room_id, "room_name": surface.room.name if surface.room else "Exterior",
                "name": surface.name, "surface_type": surface.surface_type,
                "length": surface.length, "breadth": surface.breadth,
                "gross_area": surface.gross_area, "deduction_area": surface.deduction_area,
                "addition_area": surface.addition_area, "net_area": surface.net_area,
                "openings": [{
                    "type": opening.opening_type, "name": opening.name,
                    "quantity": opening.quantity, "width": opening.width, "height": opening.height,
                    "effect": opening.effect, "deduction_mode": opening.deduction_mode,
                } for opening in surface.openings.all()],
            } for surface in surfaces],
            "notice": "Customer-approved read-only Area Calculation. Pricing, finishes, quotations, and contractor notes are excluded.",
        })


class MeasurementAccessPrepareQuotationView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        access = MeasurementAccessRequest.objects.select_related("customer", "source_property", "source_property__customer", "target_property").filter(
            pk=pk, requesting_contractor=request.user, status=MeasurementAccessRequest.Status.APPROVED,
        ).first()
        if not access:
            return Response({"detail": "Approved Area Calculation access was not found."}, status=status.HTTP_404_NOT_FOUND)
        if access.target_property_id:
            return Response({"customer": access.target_property.customer_id, "property": access.target_property_id})
        source_customer = access.source_property.customer
        customer = Customer.objects.filter(contractor=request.user, mobile=source_customer.mobile).first()
        if not customer:
            customer = Customer.objects.create(
                contractor=request.user, portal_user=source_customer.portal_user, name=source_customer.name,
                mobile=source_customer.mobile, email=source_customer.email, whatsapp=source_customer.whatsapp,
                address=source_customer.address, city=source_customer.city, pincode=source_customer.pincode,
                source=Customer.Source.OTHER, notes="Customer shared a property Area Calculation.",
            )
        source = access.source_property
        target = Property.objects.create(
            customer=customer, property_type=source.property_type, measurement_type=source.measurement_type,
            measurement_unit=source.measurement_unit, name=source.name, address=source.address,
            city=source.city, pincode=source.pincode, approximate_area=source.approximate_area,
        )
        ensure_legacy_primary_contact(target)
        source_record = source.measurement_records.filter(submitted_at__isnull=False).order_by("-measured_on", "-id").first()
        if not source_record:
            raise ValidationError({"measurement": "No submitted Area Calculation is available."})
        target_record = PropertyMeasurement.objects.create(
            property=target,
            contractor=request.user,
            measured_on=source_record.measured_on if source_record else timezone.localdate(),
            status=PropertyMeasurement.Status.COMPLETED,
            notes="Customer-approved shared Area Calculation.",
        )
        room_map = {}
        for room in source.rooms.filter(measurement_record=source_record):
            room_map[room.id] = PropertyRoom.objects.create(
                property=target, measurement_record=target_record, room_type=room.room_type, name=room.name, length=room.length,
                width=room.width, height=room.height, window_count=room.window_count,
                window_width=room.window_width, window_height=room.window_height,
                door_count=room.door_count, door_width=room.door_width, door_height=room.door_height,
            )
        for surface in source.measurement_surfaces.filter(measurement_record=source_record).prefetch_related("openings"):
            cloned = MeasurementSurface.objects.create(
                property=target, measurement_record=target_record, room=room_map.get(surface.room_id), work_area=surface.work_area,
                surface_type=surface.surface_type, name=surface.name, length=surface.length,
                breadth=surface.breadth, manual_area=surface.manual_area, paintable_sides=surface.paintable_sides,
                finish=surface.finish, rate=surface.rate, notes=surface.notes,
            )
            for opening in surface.openings.all():
                MeasurementOpening.objects.create(
                    surface=cloned, opening_type=opening.opening_type, name=opening.name,
                    quantity=opening.quantity, width=opening.width, height=opening.height,
                    deduction_mode=opening.deduction_mode, deduction_percentage=opening.deduction_percentage,
                    effect=opening.effect, separate_finish=opening.separate_finish, separate_rate=opening.separate_rate,
                )
        access.target_property = target
        access.save(update_fields=("target_property", "updated_at"))
        return Response({"customer": customer.id, "property": target.id}, status=status.HTTP_201_CREATED)


class PortalNotificationCountsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            from jobs.models import WorkSchedule
            conversations = ChatConversation.objects.filter(contractor=request.user)
            return Response({
                "messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": ServiceRequest.objects.filter(
                    models.Q(connection__contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED)
                    | models.Q(connection__isnull=True, customer__contractor=request.user),
                    contractor_seen_at__isnull=True,
                ).count(),
                "support_tickets": SupportTicket.objects.filter(
                    models.Q(requester=request.user, requester_seen_at__isnull=True)
                    | (models.Q(connection__contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED, handler_seen_at__isnull=True) & ~models.Q(requester=request.user))
                    | (models.Q(connection__isnull=True, customer__contractor=request.user, handler_seen_at__isnull=True) & ~models.Q(requester=request.user))
                ).distinct().count(),
                "tasks": CustomerFollowUp.objects.filter(created_by=request.user, is_completed=False, next_follow_up__lte=timezone.now()).count(),
                "measurement_access": MeasurementAccessRequest.objects.filter(
                    requesting_contractor=request.user,
                    status__in=(MeasurementAccessRequest.Status.APPROVED, MeasurementAccessRequest.Status.FRESH_REQUESTED),
                    contractor_seen_at__isnull=True,
                ).count(),
                "work_updates": WorkSchedule.objects.filter(
                    quotation__contractor=request.user,
                    payment_status=WorkSchedule.PaymentStatus.PENDING_CONFIRMATION,
                ).count(),
            })
        if request.user.role == BharathUser.Roles.CUSTOMER:
            from jobs.models import WorkSchedule
            customers = Customer.objects.filter(portal_user=request.user)
            progress_property_ids = accessible_properties(request.user, PropertyPermission.VIEW_PROGRESS).values("pk")
            payment_property_ids = accessible_properties(request.user, PropertyPermission.VIEW_PAYMENTS).values("pk")
            conversations = ChatConversation.objects.filter(customer__in=customers)
            return Response({
                "messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": ServiceRequest.objects.filter(customer__in=customers, customer_seen_at__isnull=True).count(),
                "support_tickets": SupportTicket.objects.filter(models.Q(requester=request.user) | models.Q(requester__isnull=True, customer__in=customers), requester_seen_at__isnull=True).count(),
                "measurement_access": MeasurementAccessRequest.objects.filter(customer__in=customers, status=MeasurementAccessRequest.Status.PENDING, customer_seen_at__isnull=True).count(),
                "connection_requests": ContractorCustomerConnection.objects.filter(customer__portal_user=request.user, status=ContractorCustomerConnection.Status.PENDING).count(),
                "tasks": 0,
                "work_updates": WorkSchedule.objects.filter(
                    (
                        models.Q(status__in=(WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED), customer_seen_update_at__isnull=True)
                        & models.Q(quotation__property_id__in=Subquery(progress_property_ids))
                    ) | (
                        models.Q(payment_status=WorkSchedule.PaymentStatus.AWAITING_PAYMENT)
                        & models.Q(quotation__property_id__in=Subquery(payment_property_ids))
                    ) | models.Q(
                        quotation__customer__portal_user=request.user,
                        quotation__property__isnull=True,
                        status__in=(WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED),
                        customer_seen_update_at__isnull=True,
                    ),
                ).distinct().count(),
            })
        if request.user.role == BharathUser.Roles.PAINTER:
            conversations = ChatConversation.objects.filter(painter=request.user)
            return Response({
                "messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": 0, "support_tickets": SupportTicket.objects.filter(requester=request.user, requester_seen_at__isnull=True).count(),
                "tasks": 0, "measurement_access": 0, "work_updates": 0,
            })
        if request.user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT) or request.user.is_superuser:
            return Response({
                "messages": 0,
                "service_requests": 0,
                "support_tickets": SupportTicket.objects.filter(handler_seen_at__isnull=True).count(),
                "tasks": 0,
                "measurement_access": 0,
                "work_updates": 0,
            })
        return Response({"messages": 0, "service_requests": 0, "support_tickets": 0, "tasks": 0, "measurement_access": 0})


class CustomerQuotationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        allowed_property_ids = accessible_properties(
            request.user, PropertyPermission.VIEW_QUOTATIONS,
        ).values("pk")
        quotation = Quotation.objects.select_related(
            "customer", "property", "contractor", "contractor__contractor_profile",
            "customer_contact__customer",
        ).prefetch_related(
            "items__room__property_room__room_type", "items__service_type", "items__paint_type", "items__paint_brand", "items__unit"
        ).filter(pk=pk).filter(
            Q(property_id__in=Subquery(allowed_property_ids))
            | Q(property__isnull=True, customer__portal_user=request.user)
        ).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        profile = quotation.contractor.contractor_profile if hasattr(quotation.contractor, "contractor_profile") else None
        contractor_snapshot = quotation.contractor_snapshot or {}
        property_snapshot = quotation.property_snapshot or {}
        response = Response({
            "id": quotation.id, "quotation_number": quotation.quotation_number,
            "property_id": quotation.property_id,
            "property_access": effective_property_permissions(request.user, quotation.property),
            "revision_of": quotation.revision_of_id,
            "version_number": quotation.version_number,
            "revision_changes": quotation_revision_changes(quotation),
            "quotation_date": quotation.quotation_date, "valid_until": quotation.valid_until,
            "status": quotation.status,
            "contractor_name": profile.company_name if profile else contractor_snapshot.get("company_name") or quotation.contractor.get_full_name() or quotation.contractor.mobile,
            "customer_contact": {
                "id": quotation.customer_contact_id,
                "name": quotation.customer_contact.customer.name,
                "role": quotation.customer_contact.role,
            } if quotation.customer_contact_id else None,
            "property_name": property_snapshot.get("name") or quotation.property.name or quotation.property.property_type,
            "subtotal": quotation.subtotal, "discount": quotation.discount,
            "gst_amount": quotation.gst_amount, "grand_total": quotation.grand_total,
            "terms": quotation.notes,
            "show_product_key_features": quotation.show_product_key_features,
            "product_details": consolidated_product_details(quotation),
            "customer_response_note": quotation.customer_response_note,
            "customer_responded_at": quotation.customer_responded_at,
            "accepted_via_receipt_at": quotation.accepted_via_receipt_at,
            "items": [{
                "id": item.id, "serial": index,
                "room": ", ".join(item.included_areas) if item.included_areas else (item.room.name if item.room else "General"),
                "included_areas": item.included_areas or [],
                "room_type": (
                    item.room.room_type_name_snapshot
                    if item.room and item.room.room_type_name_snapshot
                    else "Exterior" if quotation.property.measurement_type == "EXTERIOR" and item.room
                    else item.room.name if item.room else "General"
                ),
                "description": item.description,
                "service": item.service_name_snapshot or (item.service_type.name if item.service_type else ""),
                "paint_type": item.product_type_name_snapshot or (item.paint_type.name if item.paint_type else ""),
                "paint_type_features": (item.product_type_features_snapshot or (item.paint_type.key_features if item.paint_type else "")) if quotation.show_product_key_features else "",
                "paint_brand": item.brand_name_snapshot or (item.paint_brand.name if item.paint_brand else ""),
                "calculation_method": item.calculation_method,
                "is_additional_service": item.is_additional_service,
                "custom_unit": item.custom_unit,
                "coats": "-" if item.is_additional_service else item.coats,
                "quantity": item.quantity,
                "unit": item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else "sq ft"),
                "rate": item.rate, "amount": item.amount,
            } for index, item in enumerate(quotation.items.all(), 1)],
        })
        response["Cache-Control"] = "no-store, max-age=0"
        return response


class CustomerQuotationListView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def customer_queryset(user):
        allowed_property_ids = accessible_properties(
            user, PropertyPermission.VIEW_QUOTATIONS,
        ).values("pk")
        return Quotation.objects.filter(
            Q(property_id__in=Subquery(allowed_property_ids))
            | Q(property__isnull=True, customer__portal_user=user)
        )

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        quotations = self.customer_queryset(request.user).exclude(
            status=Quotation.Status.DRAFT
        ).select_related("contractor", "contractor__contractor_profile", "property", "work_schedule", "customer_contact__customer").order_by("-updated_at")
        property_id = request.query_params.get("property_id")
        if property_id:
            quotations = quotations.filter(property_id=property_id)
        property_id = request.query_params.get("property_id")
        if property_id:
            quotations = quotations.filter(property_id=property_id)
        results = []
        for item in quotations:
            profile = item.contractor.contractor_profile if hasattr(item.contractor, "contractor_profile") else None
            contractor_snapshot = item.contractor_snapshot or {}
            property_snapshot = item.property_snapshot or {}
            schedule = item.work_schedule if hasattr(item, "work_schedule") else None
            results.append({
                "id": item.id, "quotation_number": item.quotation_number,
                "property_id": item.property_id,
                "property_access": effective_property_permissions(request.user, item.property),
                "revision_of": item.revision_of_id, "version_number": item.version_number,
                "status": item.status, "status_display": item.get_status_display(),
                "customer_contact": {
                    "id": item.customer_contact_id,
                    "name": item.customer_contact.customer.name,
                    "role": item.customer_contact.role,
                } if item.customer_contact_id else None,
                "accepted_via_receipt_at": item.accepted_via_receipt_at,
                "grand_total": item.grand_total, "quotation_date": item.quotation_date,
                "updated_at": item.updated_at,
                "property_name": property_snapshot.get("name") or item.property.name or item.property.property_type,
                "contractor_name": profile.company_name if profile else contractor_snapshot.get("company_name") or item.contractor.get_full_name() or item.contractor.mobile,
                "contractor_owner": profile.owner_name if profile else contractor_snapshot.get("owner_name") or item.contractor.get_full_name(),
                "contractor_mobile": item.contractor.mobile,
                "contractor_bharath_id": item.contractor.bharath_id,
                "contractor_logo": request.build_absolute_uri(profile.company_logo.url) if profile and profile.company_logo else None,
                "contractor_logo_shape": profile.company_logo_shape if profile else contractor_snapshot.get("company_logo_shape") or "RECTANGLE",
                "contractor_logo_position": profile.company_logo_position if profile else contractor_snapshot.get("company_logo_position") or {"x": 50, "y": 50, "zoom": 1},
                "schedule_start_date": schedule.proposed_start_date if schedule else None,
                "schedule_end_date": schedule.proposed_end_date if schedule else None,
                "schedule_status": schedule.get_status_display() if schedule else "Not scheduled",
            })
        response = Response(results)
        response["Cache-Control"] = "no-store, max-age=0"
        return response


class CustomerQuotationActionView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        action = str(request.data.get("action") or "").upper()
        property_permission = (
            PropertyPermission.REQUEST_QUOTATION_CHANGES
            if action == "REVISION"
            else PropertyPermission.APPROVE_QUOTATIONS
        )
        allowed_property_ids = accessible_properties(
            request.user, property_permission,
        ).values("pk")
        quotation = Quotation.objects.select_for_update().filter(pk=pk).filter(
            Q(property_id__in=Subquery(allowed_property_ids))
            | Q(property__isnull=True, customer__portal_user=request.user)
        ).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        response_statuses = (Quotation.Status.SENT, Quotation.Status.VIEWED)
        revision_statuses = response_statuses + (
            Quotation.Status.ACCEPTED,
            Quotation.Status.SCHEDULED,
            Quotation.Status.IN_PROGRESS,
        )
        if (action == "REVISION" and quotation.status not in revision_statuses) or (
            action != "REVISION" and quotation.status not in response_statuses
        ):
            return Response(
                {"detail": "This quotation cannot be changed at its current stage."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        revision_root = quotation.revision_of or quotation
        latest_customer_version = Quotation.objects.filter(
            models.Q(pk=revision_root.pk) | models.Q(revision_of=revision_root),
        ).exclude(status=Quotation.Status.DRAFT).order_by("-version_number", "-id").first()
        if latest_customer_version and latest_customer_version.pk != quotation.pk:
            return Response(
                {"detail": "A newer quotation version is available. Open the latest revision to respond."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        statuses = {"APPROVE": Quotation.Status.ACCEPTED, "REJECT": Quotation.Status.REJECTED, "REVISION": Quotation.Status.REVISION_REQUESTED}
        if action not in statuses:
            return Response({"action": "Select approve, reject, or revision."}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get("note") or "").strip()
        if action == "REVISION" and not note:
            return Response({"note": "Explain the changes required."}, status=status.HTTP_400_BAD_REQUEST)
        responded_at = timezone.now()
        if action == "REVISION":
            revised = clone_quotation_revision(quotation, note, responded_at)
            create_notification(
                quotation.contractor,
                "QUOTATION_RESPONSE",
                "Quotation revision requested",
                f"{quotation.quotation_number}: {revised.quotation_number} draft is ready to edit",
                f"/quotations/{revised.id}",
                request.user,
            )
            return Response({
                "id": quotation.id,
                "status": quotation.status,
                "quotation_number": quotation.quotation_number,
                "version_number": quotation.version_number,
                "customer_response_note": quotation.customer_response_note,
                "customer_responded_at": quotation.customer_responded_at,
                "revision_id": revised.id,
                "revision_number": revised.quotation_number,
                "revision_version": revised.version_number,
            })
        quotation.status = statuses[action]
        quotation.customer_response_note = note
        quotation.customer_responded_at = responded_at
        quotation.save(update_fields=("status", "customer_response_note", "customer_responded_at", "updated_at"))
        # When an edited version is approved after scheduling/work start, keep
        # the existing project record and payments attached to the newly
        # approved commercial version.  The older quotation remains preserved.
        if action == "APPROVE" and quotation.version_number > 1:
            from jobs.models import WorkSchedule

            previous = previous_revision(quotation)
            schedule = WorkSchedule.objects.select_for_update().filter(quotation=previous).first() if previous else None
            if schedule:
                schedule.quotation = quotation
                schedule.save(update_fields=("quotation", "updated_at"))
                if schedule.status == WorkSchedule.Status.IN_PROGRESS:
                    quotation.status = Quotation.Status.IN_PROGRESS
                elif schedule.status in (WorkSchedule.Status.PENDING, WorkSchedule.Status.CONFIRMED):
                    quotation.status = Quotation.Status.SCHEDULED
                quotation.save(update_fields=("status", "updated_at"))
            if previous:
                previous.project_receipts.update(quotation=quotation)
        title = "Quotation accepted" if action == "APPROVE" else "Quotation rejected"
        notification_link = f"/work-schedules?quotation={quotation.id}" if action == "APPROVE" else f"/quotations/{quotation.id}"
        create_notification(quotation.contractor, "QUOTATION_RESPONSE", title, f"{quotation.quotation_number}: {quotation.get_status_display()}", notification_link, request.user)
        payload = {"id": quotation.id, "status": quotation.status, "customer_response_note": quotation.customer_response_note, "customer_responded_at": quotation.customer_responded_at}
        if action == "APPROVE":
            if quotation.status == Quotation.Status.IN_PROGRESS:
                payload.update({"next_step": "WORK_IN_PROGRESS", "schedule_url": "/work-schedules"})
            elif quotation.status == Quotation.Status.SCHEDULED:
                payload.update({"next_step": "EXISTING_SCHEDULE", "schedule_url": "/work-schedules"})
            else:
                payload.update({"next_step": "SCHEDULE", "schedule_url": f"/work-schedules?quotation={quotation.id}"})
        return Response(payload)


class CustomerQuotationPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        allowed_property_ids = accessible_properties(
            request.user, PropertyPermission.VIEW_QUOTATIONS,
        ).values("pk")
        quotation = Quotation.objects.select_related("customer", "property", "contractor", "contractor__contractor_profile").prefetch_related("items__service_type", "items__paint_type").filter(pk=pk).filter(
            Q(property_id__in=Subquery(allowed_property_ids))
            | Q(property__isnull=True, customer__portal_user=request.user)
        ).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_quotation_pdf(quotation, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{quotation.quotation_number}.pdf"'
        return response


class CustomerPropertyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        properties = accessible_properties(
            request.user, PropertyPermission.VIEW_PROPERTY,
        ).select_related(
            "customer", "contractor", "contractor__contractor_profile", "connection__contractor"
        ).annotate(room_count=models.Count("rooms", filter=models.Q(rooms__measurement_record__submitted_at__isnull=False), distinct=True), surface_count=models.Count("measurement_surfaces", filter=models.Q(measurement_surfaces__measurement_record__submitted_at__isnull=False), distinct=True)).order_by("-updated_at")
        data = []
        for item in properties:
            contractor = item.contractor or (item.connection.contractor if item.connection_id else item.customer.contractor)
            profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
            access_contact = item.contacts.filter(customer__portal_user=request.user).first()
            primary_contact = item.contacts.filter(is_primary=True, status=PropertyContact.Status.ACTIVE).select_related("customer").first()
            can_view_measurements = has_property_access(request.user, item, PropertyPermission.VIEW_MEASUREMENTS)
            data.append({
                "id": item.id, "name": item.name or item.property_type,
                "property_type": item.property_type, "measurement_type": item.measurement_type,
                "flat_number": item.flat_number, "block_name": item.block_name,
                "address": item.address, "city": item.city, "pincode": item.pincode,
                "approximate_area": item.approximate_area,
                "contractor_name": profile.company_name if profile else (contractor.get_full_name() or contractor.mobile if contractor else "Not assigned"),
                "contact_role": access_contact.role if access_contact else PropertyContact.Role.PRIMARY,
                "is_primary_contact": access_contact.is_primary if access_contact else True,
                "can_share_access": has_property_access(request.user, item, PropertyPermission.INVITE_CONTACTS),
                "can_manage_access": has_property_access(request.user, item, PropertyPermission.MANAGE_CONTACTS),
                "primary_contact_name": primary_contact.customer.name if primary_contact else item.customer.name,
                "can_view_measurements": can_view_measurements,
                "property_access": effective_property_permissions(request.user, item),
                "rooms": item.room_count if can_view_measurements else 0,
                "surfaces": item.surface_count if can_view_measurements else 0,
                "updated_at": item.updated_at,
            })
        return Response(data)


class CustomerPropertyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        property_obj = accessible_properties(
            request.user, PropertyPermission.VIEW_PROPERTY,
        ).select_related("customer", "contractor", "contractor__contractor_profile", "connection__contractor").filter(pk=pk).first()
        if not property_obj:
            return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
        contractor = property_obj.contractor or (property_obj.connection.contractor if property_obj.connection_id else property_obj.customer.contractor)
        profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
        access_contact = property_obj.contacts.filter(customer__portal_user=request.user).first()
        primary_contact = property_obj.contacts.filter(is_primary=True, status=PropertyContact.Status.ACTIVE).select_related("customer").first()
        can_view_measurements = has_property_access(request.user, property_obj, PropertyPermission.VIEW_MEASUREMENTS)
        records = PropertyMeasurement.objects.none()
        if can_view_measurements:
            records = property_obj.measurement_records.filter(
                submitted_at__isnull=False, surfaces__isnull=False
            ).distinct().select_related(
                "contractor", "contractor__contractor_profile"
            ).prefetch_related("surfaces__openings", "rooms").order_by("-measured_on", "-id")
        record_id = request.query_params.get("measurement")
        record = records.filter(id=record_id).first() if record_id else records.first()
        if record_id and not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        rooms = PropertyRoom.objects.filter(property=property_obj, measurement_record=record).order_by("id") if record and can_view_measurements else PropertyRoom.objects.none()
        surfaces = MeasurementSurface.objects.filter(property=property_obj, measurement_record=record).select_related("room").prefetch_related("openings").order_by("room_id", "id") if record and can_view_measurements else MeasurementSurface.objects.none()
        return Response({
            "property": {
                "id": property_obj.id, "name": property_obj.name or property_obj.property_type,
                "property_type": property_obj.property_type, "measurement_type": property_obj.measurement_type,
                "flat_number": property_obj.flat_number, "block_name": property_obj.block_name,
                "address": property_obj.address, "city": property_obj.city, "pincode": property_obj.pincode,
                "approximate_area": property_obj.approximate_area,
                "contractor_name": profile.company_name if profile else (contractor.get_full_name() or contractor.mobile if contractor else "Not assigned"),
                "contact_role": access_contact.role if access_contact else PropertyContact.Role.PRIMARY,
                "is_primary_contact": access_contact.is_primary if access_contact else True,
                "can_share_access": has_property_access(request.user, property_obj, PropertyPermission.INVITE_CONTACTS),
                "can_manage_access": has_property_access(request.user, property_obj, PropertyPermission.MANAGE_CONTACTS),
                "can_view_measurements": can_view_measurements,
                "property_access": effective_property_permissions(request.user, property_obj),
                "primary_contact_name": primary_contact.customer.name if primary_contact else property_obj.customer.name,
                "updated_at": property_obj.updated_at,
                "measurement_id": record.id if record else None,
                "measurement_reference": record.reference_no if record else "",
                "measurement_date": record.measured_on if record else None,
                "measurement_status": record.status if record else "",
            },
            "measurement_records": PropertyMeasurementSerializer(
                records, many=True, context={"request": request}
            ).data,
            "rooms": [{"id": room.id, "name": room.name} for room in rooms],
            "surfaces": [{
                "id": surface.id, "room": surface.room_id,
                "room_name": surface.room.name if surface.room else "Exterior",
                "name": surface.name, "surface_type": surface.surface_type,
                "length": surface.length, "breadth": surface.breadth,
                "gross_area": surface.gross_area, "deduction_area": surface.deduction_area,
                "addition_area": surface.addition_area, "net_area": surface.net_area,
                "openings": [{
                    "type": opening.opening_type, "name": opening.name,
                    "quantity": opening.quantity, "width": opening.width,
                    "height": opening.height, "effect": opening.effect,
                    "deduction_mode": opening.deduction_mode,
                } for opening in surface.openings.all()],
            } for surface in surfaces],
        })


class CustomerPropertyMeasurementPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        property_obj = accessible_properties(
            request.user, PropertyPermission.VIEW_PROPERTY,
        ).select_related("customer").filter(pk=pk).first()
        if not property_obj:
            return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
        if not has_property_access(request.user, property_obj, PropertyPermission.VIEW_MEASUREMENTS):
            return Response({"detail": "Area Calculation access is not included in your property permissions."}, status=status.HTTP_403_FORBIDDEN)
        record_id = request.query_params.get("measurement")
        records = property_obj.measurement_records.filter(submitted_at__isnull=False, surfaces__isnull=False).distinct()
        record = records.filter(id=record_id).first() if record_id else records.first()
        if not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf = build_measurement_pdf(property_obj, record, language=document_language(request))
        response = HttpResponse(pdf.getvalue(), content_type="application/pdf")
        filename = record.reference_no if record else f"property-{property_obj.id}"
        response["Content-Disposition"] = f'attachment; filename="{filename}-area-calculation.pdf"'
        return response


class QuotationSubmitView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    def post(self, request, pk):
        quotation = Quotation.objects.select_related("customer").filter(pk=pk, contractor=request.user, deleted_at__isnull=True).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        if quotation.connection_id and quotation.connection.status != ContractorCustomerConnection.Status.CONNECTED:
            return Response({"detail": "The customer must accept your connection request before you can send this quotation."}, status=status.HTTP_403_FORBIDDEN)
        if quotation.status != Quotation.Status.DRAFT:
            return Response(
                {"detail": "Only a draft quotation can be submitted. Previous versions are preserved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        temporary_password = None
        if not quotation.customer.portal_user_id:
            _, temporary_password = activate_customer_account(quotation.customer)
        is_revision = bool(quotation.customer_response_note or quotation.customer_responded_at)
        quotation.status = Quotation.Status.SENT
        quotation.sent_at = timezone.now()
        quotation.save(update_fields=("status", "sent_at", "updated_at"))
        notification_title = "Revised quotation received" if is_revision else "New quotation received"
        notification_message = f"{quotation.quotation_number} has been revised by your contractor" if is_revision else f"{quotation.quotation_number} from your contractor"
        create_notification(quotation.customer.portal_user, "QUOTATION", notification_title, notification_message, f"/customer-quotations/{quotation.id}", request.user)
        response_data = {"id": quotation.id, "status": quotation.status, "is_revision": is_revision, "customer_mobile": quotation.customer.mobile, "customer_email": quotation.customer.email, "customer_id": quotation.customer.bharath_id}
        if temporary_password:
            response_data["temporary_password"] = temporary_password
        return Response(response_data)


# ============================================================
# QUOTATIONS
# ============================================================

class QuotationListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    serializer_class = QuotationSerializer

    def get_queryset(self):
        queryset = Quotation.objects.filter(
            contractor=self.request.user, deleted_at__isnull=True,
        )
        if self.request.query_params.get("include_converted") not in {"1", "true", "yes"}:
            queryset = queryset.exclude(status=Quotation.Status.CONVERTED)
        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        customer = serializer.validated_data["customer"]
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer, contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({"customer": "A customer connection request is required before creating a quotation."})
        serializer.save(
            contractor=self.request.user,
            connection=connection,
            status=Quotation.Status.DRAFT,
        )



class QuotationDetailView(
    generics.RetrieveUpdateDestroyAPIView
):

    permission_classes = [
        IsAuthenticated,
        IsVerifiedContractor,
    ]

    serializer_class = QuotationSerializer

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        response["Cache-Control"] = "no-store, max-age=0"
        return response

    def get_queryset(self):

        return Quotation.objects.filter(
            contractor=self.request.user, deleted_at__isnull=True,
        )

    def perform_destroy(self, instance):
        if instance.status != Quotation.Status.DRAFT:
            raise ValidationError({
                "quotation": "Submitted quotation versions are preserved and cannot be deleted."
            })
        instance.deleted_at = timezone.now()
        instance.save(update_fields=("deleted_at", "updated_at"))
        SupportActionLog.objects.create(
            actor=self.request.user, action="DRAFT_QUOTATION_DELETED",
            target_type="QUOTATION", target_id=instance.pk,
            reason="Deleted by the quotation owner.",
            before={"deleted": False}, after={"deleted": True},
        )


class QuotationPdfView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    def get(self, request, pk):
        quotation = Quotation.objects.select_related("customer", "property", "contractor", "contractor__contractor_profile").prefetch_related("items__service_type", "items__paint_type").filter(pk=pk, contractor=request.user, deleted_at__isnull=True).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        included_sections = None
        if "sections" in request.query_params:
            included_sections = {
                section.strip()
                for section in request.query_params.get("sections", "").split(",")
                if section.strip()
            }
        response = HttpResponse(build_quotation_pdf(quotation, included_sections=included_sections, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{quotation.quotation_number}.pdf"'
        return response


class QuotationPreviewPdfView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    def post(self, request):
        serializer = QuotationSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        customer = serializer.validated_data["customer"]
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer,
            contractor=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({
                "customer": "A customer connection request is required before previewing a quotation."
            })

        with transaction.atomic():
            quotation = serializer.save(
                contractor=request.user,
                connection=connection,
                status=Quotation.Status.DRAFT,
            )
            quotation.quotation_number = "PREVIEW"
            pdf_bytes = build_quotation_pdf(quotation, language=document_language(request))
            transaction.set_rollback(True)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="quotation-preview.pdf"'
        response["Cache-Control"] = "no-store, max-age=0"
        return response




class QuotationCreateView(
    generics.CreateAPIView
):

    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    serializer_class = QuotationSerializer

    def perform_create(self, serializer):
        from billing.services import enforce_quotation_limit
        enforce_quotation_limit(self.request.user)
        customer = serializer.validated_data["customer"]
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer, contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({"customer": "A customer connection request is required before creating a quotation."})
        quotation = serializer.save(
            contractor=self.request.user,
            connection=connection,
            status=Quotation.Status.DRAFT,
        )


class CustomerBulkImportView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        try:
            rows = self.read_rows(request)
        except (ValueError, UnicodeDecodeError) as error:
            return Response({"file": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        if not rows:
            return Response({"file": "No customer rows were found."}, status=status.HTTP_400_BAD_REQUEST)
        existing = {self.mobile_key(value) for value in Customer.objects.values_list("mobile", flat=True)}
        created, skipped, errors = [], 0, []
        valid_statuses = {choice[0] for choice in Customer.Status.choices}
        valid_sources = {choice[0] for choice in Customer.Source.choices}
        for number, raw in enumerate(rows, 2):
            row = {self.header(key): value for key, value in raw.items() if key is not None}
            name = self.cell_text(row.get("name") or row.get("customer name"))
            mobile = self.cell_text(row.get("mobile") or row.get("mobile number") or row.get("phone") or row.get("phone number"))
            key = self.mobile_key(mobile)
            if not name or not key:
                errors.append({"row": number, "error": "Name and a valid mobile number are required; include +country code for international numbers."})
                continue
            if key in existing:
                skipped += 1
                continue
            status_value = str(row.get("status") or "NEW").strip().upper().replace(" ", "_")
            source_value = str(row.get("source") or "OTHER").strip().upper().replace(" ", "_")
            customer = Customer.objects.create(
                contractor=request.user, name=name, mobile=key,
                email=str(row.get("email") or "").strip(), whatsapp=str(row.get("whatsapp") or row.get("whatsapp number") or "").strip(),
                address=str(row.get("address") or "").strip(), city=str(row.get("city") or "").strip(), pincode=str(row.get("pincode") or row.get("pin code") or "").strip(),
                status=status_value if status_value in valid_statuses else "NEW", source=source_value if source_value in valid_sources else "OTHER",
                requirement=str(row.get("requirement") or "").strip(), notes=str(row.get("notes") or "").strip(),
            )
            now = timezone.now()
            connection = ContractorCustomerConnection.objects.create(
                customer=customer, contractor=request.user, requested_by=request.user,
                status=ContractorCustomerConnection.Status.CONNECTED,
                approval_method=ContractorCustomerConnection.ApprovalMethod.INITIAL_CREATOR,
                requested_at=now, connected_at=now, approved_at=now,
                customer_status=customer.status,
                customer_source=customer.source,
                customer_client_type=customer.client_type,
                requirement=customer.requirement,
                internal_notes=customer.notes,
                next_follow_up=customer.next_follow_up,
            )
            ChatConversation.objects.create(customer=customer, contractor=request.user, connection=connection)
            existing.add(key)
            serialized = CustomerSerializer(customer, context={"request": request}).data
            created.append(serialized)
        return Response({"created": len(created), "skipped": skipped, "errors": errors, "customers": created}, status=status.HTTP_201_CREATED)

    def read_rows(self, request):
        contacts = request.data.get("contacts")
        if isinstance(contacts, list):
            return contacts
        upload = request.FILES.get("file")
        if not upload:
            raise ValueError("Choose an Excel or CSV file.")
        if upload.name.lower().endswith(".csv"):
            return list(csv.DictReader(io.TextIOWrapper(upload.file, encoding="utf-8-sig")))
        if upload.name.lower().endswith(".xlsx"):
            values = load_workbook(upload, read_only=True, data_only=True).active.iter_rows(values_only=True)
            headers = next(values, None)
            return [] if not headers else [dict(zip(headers, row)) for row in values if any(value not in (None, "") for value in row)]
        raise ValueError("Only .xlsx and .csv files are supported.")

    @staticmethod
    def header(value):
        return " ".join(str(value).strip().lower().replace("_", " ").split())

    @staticmethod
    def mobile_key(value):
        return canonical_mobile(value)

    @staticmethod
    def cell_text(value):
        if value is None:
            return ""
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value).strip()


class QuotationRoomSyncView(APIView):

    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    @transaction.atomic
    def post(self, request, quotation_id):
        quotation = Quotation.objects.filter(
            id=quotation_id,
            contractor=request.user,
            deleted_at__isnull=True,
        ).first()
        if not quotation:
            return Response(
                {"detail": "Quotation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if quotation.status != Quotation.Status.DRAFT:
            return Response(
                {"detail": "This quotation version is preserved. Open a draft revision to change rooms."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_ids = request.data.get("property_room_ids")
        if not isinstance(raw_ids, list):
            return Response(
                {"property_room_ids": "A list of room IDs is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            selected_ids = {int(room_id) for room_id in raw_ids}
        except (TypeError, ValueError):
            return Response(
                {"property_room_ids": "Every room ID must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_custom_names = request.data.get("custom_room_names", [])
        if not isinstance(raw_custom_names, list):
            return Response(
                {"custom_room_names": "A list of room names is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        custom_names = []
        seen_names = set()
        for value in raw_custom_names:
            name = str(value or "").strip()
            key = name.casefold()
            if not name or key in seen_names:
                continue
            if len(name) > 150:
                return Response(
                    {"custom_room_names": "Room names cannot exceed 150 characters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            seen_names.add(key)
            custom_names.append(name)

        property_rooms = PropertyRoom.objects.filter(
            id__in=selected_ids,
            property=quotation.property,
        )
        if property_rooms.count() != len(selected_ids):
            return Response(
                {"property_room_ids": "One or more rooms do not belong to this quotation's property."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = {
            room.property_room_id: room
            for room in quotation.rooms.exclude(property_room__isnull=True)
        }
        removed = quotation.rooms.filter(
            property_room__isnull=False,
        ).exclude(property_room_id__in=selected_ids)
        removed_count = removed.count()
        removed.delete()

        added_count = 0
        for source in property_rooms:
            if source.id in existing:
                continue
            QuotationRoom.objects.create(
                quotation=quotation,
                property_room=source,
                name=source.name,
                length=source.length,
                width=source.width,
                height=source.height,
                window_count=source.window_count,
                window_width=source.window_width,
                window_height=source.window_height,
                door_count=source.door_count,
                door_width=source.door_width,
                door_height=source.door_height,
            )
            added_count += 1

        existing_custom_names = {
            room.name.strip().casefold()
            for room in quotation.rooms.filter(property_room__isnull=True)
        }
        for name in custom_names:
            if name.casefold() in existing_custom_names:
                continue
            QuotationRoom.objects.create(quotation=quotation, name=name)
            existing_custom_names.add(name.casefold())
            added_count += 1

        quotation_serializer = QuotationSerializer(
            quotation,
            context={"request": request},
        )
        return Response({
            "added": added_count,
            "removed": removed_count,
            "quotation": quotation_serializer.data,
        })



class CustomerDetailView(
    generics.RetrieveUpdateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = CustomerDetailSerializer

    def get_queryset(self):
        return Customer.objects.filter(
            models.Q(
                contractor_connections__contractor=self.request.user,
                contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
            ) | models.Q(saved_contacts__contractor=self.request.user) | models.Q(
                contractor_connections__contractor=self.request.user,
                contractor_connections__status=ContractorCustomerConnection.Status.PENDING,
            ) | models.Q(
                contractor=self.request.user,
                contractor_connections__isnull=True,
            )
        ).distinct()



    def update(self, request, *args, **kwargs):
        customer = self.get_object()
        connected = customer.contractor_connections.filter(contractor=request.user, status=ContractorCustomerConnection.Status.CONNECTED).exists()
        if not connected and customer.saved_contacts.filter(contractor=request.user).exists():
            return save_existing_customer_contact(request, customer, partial=kwargs.get("partial", False))
        return super().update(request, *args, **kwargs)


class CustomerWorkHistoryListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = CustomerWorkHistorySerializer

    def get_queryset(self):

        customer_id = self.kwargs.get(
            "customer_id"
        )

        return CustomerWorkHistory.objects.filter(
            customer_id=customer_id
        ).filter(
            models.Q(connection__contractor=self.request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED)
            | models.Q(connection__isnull=True, property__contractor=self.request.user)
        ).order_by("-created_at")

    def perform_create(self, serializer):

        customer_id = self.kwargs.get(
            "customer_id"
        )

        connection = ContractorCustomerConnection.objects.filter(
            customer_id=customer_id,
            contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).select_related("customer").first()

        if not connection:
            raise ValidationError({
                "customer":
                    "Customer not found."
            })

        property_obj = serializer.validated_data.get("property")
        if property_obj and property_obj.connection_id != connection.id:
            raise ValidationError({"property": "Select a property from this customer connection."})
        serializer.save(customer=connection.customer, connection=connection)


class WorkPhotoListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = WorkPhotoSerializer

    def get_queryset(self):

        work_history_id = self.kwargs.get(
            "work_history_id"
        )

        return WorkPhoto.objects.filter(
            work_history_id=work_history_id,
            work_history__connection__contractor=self.request.user,
            work_history__connection__status=ContractorCustomerConnection.Status.CONNECTED,
        ).order_by("-created_at")

    def perform_create(self, serializer):

        work_history_id = self.kwargs.get(
            "work_history_id"
        )

        work_history = CustomerWorkHistory.objects.filter(
            id=work_history_id,
            connection__contractor=self.request.user,
            connection__status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()

        if not work_history:

            raise ValidationError({
                "work_history":
                    "Previous work record not found."
            })

        serializer.save(
            work_history=work_history
        )



def measurement_record_for(request, property_obj, create=False):
    record_id = request.query_params.get("measurement") or request.data.get("measurement_record")
    if record_id:
        record = PropertyMeasurement.objects.filter(id=record_id, property=property_obj).first()
        if not record:
            raise ValidationError({"measurement": "Area Calculation record not found for this property."})
        return record
    if str(request.query_params.get("new") or "").lower() in {"1", "true", "yes"}:
        if create:
            return PropertyMeasurement.objects.create(
                property=property_obj, contractor=request.user
            )
        return None
    record = property_obj.measurement_records.order_by("-measured_on", "-id").first()
    if not record and create:
        record = PropertyMeasurement.objects.create(property=property_obj, contractor=request.user)
    return record


class PropertyMeasurementListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertyMeasurementSerializer

    def get_property(self):
        property_obj = Property.objects.filter(
            contractor_property_scope(self.request.user), id=self.kwargs["property_id"],
        ).first()
        if not property_obj:
            raise ValidationError({"property": "Property not found."})
        return property_obj

    def get_queryset(self):
        return PropertyMeasurement.objects.filter(
            property=self.get_property()
        ).filter(
            surfaces__isnull=False
        ).distinct().select_related(
            "contractor", "contractor__contractor_profile"
        ).prefetch_related("surfaces__openings", "rooms")

    def perform_create(self, serializer):
        property_obj = self.get_property()
        next_version = (PropertyMeasurement.objects.filter(property=property_obj, contractor=self.request.user).aggregate(max_version=models.Max("version"))["max_version"] or 0) + 1
        serializer.save(
            property=property_obj, contractor=self.request.user,
            connection=property_obj.connection, created_by=self.request.user,
            version=next_version,
        )

    def perform_update(self, serializer):
        customer = serializer.validated_data.get("customer", serializer.instance.customer)
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer, contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({"customer": "Connect with this customer before updating the property."})
        serializer.save(contractor=self.request.user, connection=connection)


class PropertyMeasurementSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Only the contractor can submit an Area Calculation."}, status=status.HTTP_403_FORBIDDEN)
        try:
            # This operation is idempotent. Avoid FOR UPDATE because the access
            # scope joins an optional connection and PostgreSQL cannot lock the
            # nullable side of that outer join. The UPDATE below serializes writes.
            record = PropertyMeasurement.objects.filter(
                contractor_property_scope(request.user, "property__"),
                pk=pk, contractor=request.user,
            ).first()
            if not record:
                return Response({"detail": "Area Calculation not found."}, status=status.HTTP_404_NOT_FOUND)
            if not record.surfaces.exists():
                return Response({"detail": "Add at least one surface before submitting."}, status=status.HTTP_400_BAD_REQUEST)
            if not record.submitted_at:
                record.submitted_at = timezone.now()
                if record.status != PropertyMeasurement.Status.LOCKED:
                    record.status = PropertyMeasurement.Status.COMPLETED
                record.save(update_fields=("submitted_at", "status", "updated_at"))
            return Response(PropertyMeasurementSerializer(record, context={"request": request}).data)
        except Exception:
            logger.exception(
                "Area Calculation submit failed (record_id=%s, user_id=%s)",
                pk, request.user.pk,
            )
            raise


class PropertyMeasurementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertyMeasurementSerializer

    def get_queryset(self):
        return PropertyMeasurement.objects.filter(
            contractor=self.request.user,
        ).filter(
            models.Q(connection__status=ContractorCustomerConnection.Status.CONNECTED)
            | models.Q(connection__isnull=True)
        ).select_related("contractor", "contractor__contractor_profile").prefetch_related("surfaces__openings", "rooms")

    def perform_update(self, serializer):
        serializer.save(submitted_at=None)

    def perform_destroy(self, instance):
        if instance.status == PropertyMeasurement.Status.LOCKED:
            raise ValidationError({"measurement": "An Area Calculation used in a quotation cannot be deleted."})
        instance.delete()


class PropertyRoomListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = PropertyRoomSerializer

    def get_queryset(self):
        property_id = self.kwargs.get(
            "property_id"
        )

        property_obj = Property.objects.filter(
            contractor_property_scope(self.request.user), id=property_id,
        ).first()
        if not property_obj:
            return PropertyRoom.objects.none()
        queryset = PropertyRoom.objects.filter(property=property_obj)
        record = measurement_record_for(self.request, property_obj)
        return queryset.filter(measurement_record=record).order_by("id") if record else queryset.none()

    def perform_create(self, serializer):

        property_id = self.kwargs.get(
            "property_id"
        )

        property_obj = Property.objects.filter(
            contractor_property_scope(self.request.user), id=property_id,
        ).first()

        if not property_obj:
            raise ValidationError({
                "property":
                    "Property not found."
            })

        serializer.save(property=property_obj, measurement_record=measurement_record_for(self.request, property_obj, create=True))


class PropertyRoomDetailView(generics.RetrieveUpdateDestroyAPIView):

    permission_classes = [IsAuthenticated]
    serializer_class = PropertyRoomSerializer

    def get_queryset(self):
        return PropertyRoom.objects.filter(contractor_property_scope(self.request.user, "property__"))

    def perform_destroy(self, instance):
        if (
            instance.measurement_record_id
            and instance.measurement_record.status == PropertyMeasurement.Status.LOCKED
        ):
            raise ValidationError({
                "room": "A room calculation used in a quotation cannot be deleted."
            })
        instance.delete()


class MeasurementSurfaceListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementSurfaceSerializer

    def get_property(self):
        property_obj = Property.objects.filter(
            contractor_property_scope(self.request.user), id=self.kwargs["property_id"],
        ).first()
        if not property_obj:
            raise ValidationError({"property": "Property not found."})
        return property_obj

    def get_queryset(self):
        property_obj = self.get_property()
        record = measurement_record_for(self.request, property_obj)
        if not record:
            return MeasurementSurface.objects.none()
        return MeasurementSurface.objects.filter(
            property=property_obj, measurement_record=record
        ).prefetch_related("openings").order_by("work_area", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["property_obj"] = self.get_property()
        return context

    def perform_create(self, serializer):
        property_obj = self.get_property()
        record = measurement_record_for(self.request, property_obj, create=True)
        serializer.save(property=property_obj, measurement_record=record)
        if record.status == PropertyMeasurement.Status.DRAFT:
            record.status = PropertyMeasurement.Status.IN_PROGRESS
            record.save(update_fields=("status", "updated_at"))


class MeasurementSurfaceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementSurfaceSerializer

    def get_queryset(self):
        return MeasurementSurface.objects.filter(
            contractor_property_scope(self.request.user, "property__")
        ).prefetch_related("openings")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["property_obj"] = self.get_object().property
        return context

    def ensure_editable(self, instance):
        if (
            instance.measurement_record_id
            and instance.measurement_record.status == PropertyMeasurement.Status.LOCKED
        ):
            raise ValidationError({
                "measurement": "An Area Calculation used in a quotation cannot be changed."
            })

    def perform_update(self, serializer):
        self.ensure_editable(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self.ensure_editable(instance)
        instance.delete()


class MeasurementOpeningListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementOpeningSerializer

    def get_surface(self):
        surface = MeasurementSurface.objects.filter(
            contractor_property_scope(self.request.user, "property__"), id=self.kwargs["surface_id"],
        ).first()
        if not surface:
            raise ValidationError({"surface": "Area surface not found."})
        return surface

    def get_queryset(self):
        return MeasurementOpening.objects.filter(surface=self.get_surface()).order_by("id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["surface"] = self.get_surface()
        return context

    def perform_create(self, serializer):
        wall = self.get_surface()
        linked = serializer.validated_data.get("linked_surface")
        if linked and (linked.property_id != wall.property_id or linked.measurement_record_id != wall.measurement_record_id or linked.work_area != MeasurementSurface.WorkArea.EXTERIOR):
            raise ValidationError({"linked_surface": "Select an exterior component from this property."})
        serializer.save(
            surface=wall,
            deduct_from_surface_type=(
                serializer.validated_data.get("deduct_from_surface_type")
                or wall.surface_type
            ),
            deduct_from_group_name=(
                serializer.validated_data.get("deduct_from_group_name")
                or (wall.area_group_name if wall.surface_type == "OTHER" else "")
            ),
        )


class MeasurementOpeningDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementOpeningSerializer

    def get_queryset(self):
        return MeasurementOpening.objects.filter(
            contractor_property_scope(self.request.user, "surface__property__")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["surface"] = self.get_object().surface
        return context


class RoomMeasurementSaveView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, property_id):
        property_obj = Property.objects.filter(
            contractor_property_scope(request.user), id=property_id,
        ).first()
        record = measurement_record_for(request, property_obj, create=True) if property_obj else None
        work_area = "EXTERIOR" if property_obj and property_obj.measurement_type == "EXTERIOR" else "INTERIOR"
        legacy_exterior = work_area == "EXTERIOR" and request.data.get("room_id") == "exterior"
        room = PropertyRoom.objects.filter(
            id=None if legacy_exterior else request.data.get("room_id"), property=property_obj
        ).first()
        if room and not room.measurement_record_id:
            room.measurement_record = record
            room.save(update_fields=("measurement_record", "updated_at"))
        elif room and room.measurement_record_id != record.id:
            room = None
        if not property_obj or (not room and not legacy_exterior):
            return Response({"room_id": "Select a valid room for this property."}, status=400)
        walls = request.data.get("walls", [])
        if not isinstance(walls, list):
            return Response({"walls": "Walls must be provided as a list."}, status=400)

        try:
            def number(value):
                return Decimal(str(value or 0))
            ceilings = request.data.get("ceilings") or ([request.data.get("ceiling")] if request.data.get("ceiling") else [])
            custom_areas = request.data.get("custom_areas", [])
            if not isinstance(custom_areas, list):
                raise ValueError("Custom areas must be provided as a list.")
            normalized_walls = []
            for index, wall in enumerate(walls):
                length, height = number(wall.get("length")), number(wall.get("breadth"))
                if length <= 0 or height <= 0:
                    raise ValueError(f"Wall {index + 1} needs length and height.")
                normalized_walls.append((wall, length, height))
            for ceiling in ceilings:
                if number(ceiling.get("length")) <= 0 or number(ceiling.get("breadth")) <= 0:
                    raise ValueError("Every ceiling needs length and width.")
            for custom_area in custom_areas:
                if not str(custom_area.get("area_group_name") or "").strip():
                    raise ValueError("Every custom area needs an area name such as Floor or Terrace.")
                if not str(custom_area.get("name") or "").strip():
                    raise ValueError("Every custom area line needs a name.")
                if number(custom_area.get("length")) <= 0 or number(custom_area.get("breadth")) <= 0:
                    raise ValueError("Every custom area needs length and width.")
            paintable_openings = request.data.get("paintable_openings", [])
            room_openings = request.data.get("openings", [])
            if not normalized_walls and not ceilings and not custom_areas and not paintable_openings and not room_openings:
                raise ValueError("Add at least one wall, ceiling, custom area, door, window, deduction or addition.")
            for opening in paintable_openings:
                if opening.get("surface_type") not in ("DOOR", "WINDOW"):
                    raise ValueError("Select a valid door or window area type.")
                if number(opening.get("length")) <= 0 or number(opening.get("breadth")) <= 0:
                    raise ValueError("Every paintable door and window needs height and width.")
            for opening in room_openings:
                if number(opening.get("height")) <= 0 or number(opening.get("width")) <= 0:
                    raise ValueError("Every deduction or addition needs height and width.")
        except (InvalidOperation, TypeError, ValueError) as exc:
            return Response({"measurements": str(exc)}, status=400)

        MeasurementSurface.objects.filter(
            property=property_obj, room=room, measurement_record=record, work_area=work_area, surface_type__in=["WALL", "CEILING", "DOOR", "WINDOW", "OTHER"]
        ).delete()
        created_ceilings = []
        for index, ceiling in enumerate(ceilings):
            created_ceilings.append(MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area,
                surface_type="CEILING", name=ceiling.get("name") or f"Ceiling {index + 1}", length=number(ceiling.get("length")),
                breadth=number(ceiling.get("breadth")), quantity=max(int(ceiling.get("quantity") or 1), 1), finish=ceiling.get("finish", ""),
                rate=number(ceiling.get("rate")),
            ))
        for index, custom_area in enumerate(custom_areas):
            MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area,
                surface_type="OTHER", name=str(custom_area.get("name") or f"Custom area {index + 1}").strip(),
                area_group_name=str(custom_area.get("area_group_name") or "").strip(),
                length=number(custom_area.get("length")), breadth=number(custom_area.get("breadth")),
                quantity=max(int(custom_area.get("quantity") or 1), 1),
                finish=custom_area.get("finish", ""), rate=number(custom_area.get("rate")),
            )
        for index, opening in enumerate(paintable_openings):
            quantity = max(int(opening.get("quantity") or 1), 1)
            MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area,
                surface_type=opening["surface_type"],
                name=opening.get("name") or f'{opening["surface_type"].title()} {index + 1}',
                length=number(opening.get("length")), breadth=number(opening.get("breadth")),
                manual_area=0, quantity=quantity,
                paintable_sides=max(min(int(opening.get("paintable_sides") or 1), 2), 1),
            )
        created_walls = []
        for index, (wall, length, height) in enumerate(normalized_walls):
            created_walls.append(MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area, surface_type="WALL",
                name=wall.get("name") or f"Wall {index + 1}", length=length, breadth=height,
                quantity=max(int(wall.get("quantity") or 1), 1),
                finish=wall.get("finish", ""), rate=number(wall.get("rate")),
            ))
        if any(opening.get("opening_type") == "CEILING" for opening in room_openings) and not created_ceilings:
            created_ceilings.append(MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area,
                surface_type="CEILING", name="__ROOM_ADJUSTMENTS__", length=0, breadth=0,
            ))
        if any(opening.get("opening_type") != "CEILING" for opening in room_openings) and not created_walls:
            created_walls.append(MeasurementSurface.objects.create(
                property=property_obj, room=room, measurement_record=record, work_area=work_area,
                surface_type="WALL", name="__ROOM_ADJUSTMENTS__", length=0, breadth=0,
            ))
        for opening in room_openings:
            target_surface = (
                created_ceilings[0]
                if opening.get("opening_type") == "CEILING"
                else created_walls[0]
            )
            MeasurementOpening.objects.create(
                surface=target_surface,
                opening_type=opening.get("opening_type", "OTHER"),
                name=opening.get("name", ""), quantity=max(int(opening.get("quantity") or 1), 1),
                width=number(opening.get("width")), height=number(opening.get("height")),
                deduction_mode=opening.get("deduction_mode", "FULL"),
                deduction_percentage=number(opening.get("deduction_percentage") or 100),
                effect=opening.get("effect", "DEDUCT"),
                deduct_from_surface_type=target_surface.surface_type,
                deduct_from_group_name=(
                    target_surface.area_group_name
                    if target_surface.surface_type == "OTHER"
                    else ""
                ),
                separate_finish=opening.get("separate_finish", ""),
                separate_rate=number(opening.get("separate_rate")),
            )
        result = MeasurementSurface.objects.filter(property=property_obj, room=room, measurement_record=record).prefetch_related("openings")
        if record.status == PropertyMeasurement.Status.DRAFT:
            record.status = PropertyMeasurement.Status.IN_PROGRESS
            record.save(update_fields=("status", "updated_at"))
        return Response(MeasurementSurfaceSerializer(result, many=True, context={"property_obj": property_obj, "request": request}).data)


def invoice_payload(invoice):
    return {"id": invoice.id, "quotation": invoice.quotation_id, "quotation_number": invoice.quotation_number_snapshot or (invoice.quotation.quotation_number if invoice.quotation_id else "Lump sum"),
            "invoice_source": "QUOTATION" if invoice.quotation_id else "LUMP_SUM", "tax_mode": invoice.tax_mode,
            "customer": invoice.customer_id, "property": invoice.site_property_id,
            "invoice_number": invoice.invoice_number, "invoice_date": invoice.invoice_date, "due_date": invoice.due_date,
            "status": invoice.status, "customer_name": invoice.customer_name, "customer_mobile": invoice.customer_mobile,
            "billing_address": invoice.billing_address, "property_name": invoice.property_name,
            "base_items": invoice.base_items or invoice.items, "measurement_adjustments": invoice.measurement_adjustments,
            "items": invoice.items,
            "subtotal": invoice.subtotal, "discount": invoice.discount, "gst_percentage": invoice.gst_percentage,
            "gst_amount": invoice.gst_amount, "grand_total": invoice.grand_total, "amount_paid": invoice.amount_paid,
            "payment_mode": invoice.payment_mode, "payment_reference": invoice.payment_reference,
            "payment_received_at": invoice.payment_received_at, "receipt_number": invoice.receipt_number,
            "payments": [{"id": payment.id, "received_date": payment.received_date, "amount": payment.amount,
                          "payment_mode": payment.payment_mode, "payment_reference": payment.payment_reference,
                          "notes": payment.notes, "created_at": payment.created_at} for payment in invoice.payments.all()],
            "can_edit": timezone.localdate(invoice.created_at) == timezone.localdate() and invoice.status not in {Invoice.Status.PAID, Invoice.Status.CANCELLED},
            "balance_due": invoice.balance_due, "notes": invoice.notes, "terms_conditions": invoice.terms_conditions,
             "created_at": invoice.created_at, "updated_at": invoice.updated_at}


def customer_invoice_payload(user, invoice):
    payload = invoice_payload(invoice)
    property_obj = invoice.quotation.property if invoice.quotation_id else invoice.site_property
    legacy_owner = bool(invoice.customer_id and invoice.customer.portal_user_id == user.pk)
    can_view_payments = (
        has_property_access(user, property_obj, PropertyPermission.VIEW_PAYMENTS)
        if property_obj else legacy_owner
    )
    if not can_view_payments:
        for field in (
            "amount_paid", "payment_mode", "payment_reference", "payment_received_at",
            "receipt_number", "payments", "balance_due",
        ):
            payload.pop(field, None)
    return payload


def invoice_financial_year(value=None):
    value = value or timezone.localdate()
    start = value.year if value.month >= 4 else value.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def next_invoice_number(tax_mode, invoice_date=None):
    financial_year = invoice_financial_year(invoice_date)
    sequence, _ = InvoiceNumberSequence.objects.select_for_update().get_or_create(
        tax_mode=tax_mode, financial_year=financial_year, defaults={"last_number": 0},
    )
    sequence.last_number += 1
    sequence.save(update_fields=("last_number", "updated_at"))
    prefix = "GST-INV" if tax_mode == Invoice.TaxMode.GST else "INV"
    return f"{prefix}-{financial_year}-{sequence.last_number:05d}"


def contractor_invoice_scope(user):
    return Invoice.objects.filter(contractor=user).filter(
        models.Q(quotation__work_schedule__status="COMPLETED") | models.Q(quotation__isnull=True)
    )


def recalculate_invoice(invoice, supplied_items=None, supplied_adjustments=None):
    items = supplied_items if supplied_items is not None else (invoice.base_items or invoice.items)
    adjustments = supplied_adjustments if supplied_adjustments is not None else invoice.measurement_adjustments
    invoice.base_items = items
    cleaned_adjustments = []
    for index, row in enumerate(adjustments or [], 1):
        surface = str(row.get("surface") or "").upper()
        action = str(row.get("action") or "ADD").upper()
        if surface not in {"WALL", "CEILING"} or action not in {"ADD", "REMOVE"}:
            continue
        first = Decimal(str(row.get("height") if surface == "WALL" else row.get("length") or 0))
        second = Decimal(str(row.get("length") if surface == "WALL" else row.get("width") or 0))
        quantity = max(Decimal(str(row.get("quantity") or 1)), Decimal("1"))
        area = (first * second * quantity).quantize(Decimal("0.01"))
        if area <= 0:
            continue
        rate = max(Decimal(str(row.get("rate") or 0)), Decimal("0"))
        cleaned_adjustments.append({**row, "id": row.get("id") or f"adjustment-{index}", "surface": surface,
                                    "action": action, "quantity": str(quantity), "area": str(area), "rate": str(rate)})
    invoice.measurement_adjustments = cleaned_adjustments
    adjusted_items = [dict(row) for row in items]
    grouped_adjustments = {
        "WALL": {"area": Decimal("0"), "amount": Decimal("0"), "ids": []},
        "CEILING": {"area": Decimal("0"), "amount": Decimal("0"), "ids": []},
    }
    for row in cleaned_adjustments:
        signed_area = Decimal(row["area"]) if row["action"] == "ADD" else -Decimal(row["area"])
        grouped_adjustments[row["surface"]]["area"] += signed_area
        grouped_adjustments[row["surface"]]["amount"] += signed_area * Decimal(row["rate"])
        grouped_adjustments[row["surface"]]["ids"].append(row["id"])
    for surface, group in grouped_adjustments.items():
        if not group["ids"]:
            continue
        effective_rate = abs(group["amount"] / group["area"]) if group["area"] else Decimal("0")
        adjusted_items.append({
            "service": "Painting",
            "room": "Final adjustment",
            "product_type": surface.title(),
            "description": f'Net {surface.title()} Adjustment',
            "brand": "",
            "unit": "Sq ft",
            "quantity": str(group["area"]),
            "rate": str(effective_rate),
            "amount_override": str(group["amount"]),
            "measurement_adjustment_ids": group["ids"],
        })
    items = adjusted_items
    cleaned = []
    subtotal = Decimal("0")
    for index, row in enumerate(items, 1):
        quantity = Decimal(str(row.get("quantity") or 0)); rate = Decimal(str(row.get("rate") or 0))
        amount = Decimal(str(row["amount_override"])) if "amount_override" in row else quantity * rate
        cleaned.append({**row, "serial": index, "quantity": str(quantity.quantize(Decimal("0.01"))), "rate": str(rate.quantize(Decimal("0.01"))), "amount": str(amount.quantize(Decimal("0.01")))})
        subtotal += amount
    invoice.items = cleaned; invoice.subtotal = subtotal
    taxable = max(subtotal - invoice.discount, Decimal("0")); invoice.gst_amount = taxable * invoice.gst_percentage / Decimal("100")
    invoice.grand_total = taxable + invoice.gst_amount
    if invoice.amount_paid >= invoice.grand_total and invoice.grand_total > 0:
        invoice.amount_paid = invoice.grand_total
        invoice.status = Invoice.Status.PAID
        invoice.payment_received_at = invoice.payment_received_at or timezone.now()
    if invoice.amount_paid > 0:
        # A receipt is issued the moment any payment (including an advance) is received,
        # not only when the invoice is settled in full.
        invoice.status = Invoice.Status.PAID if invoice.amount_paid >= invoice.grand_total and invoice.grand_total > 0 else Invoice.Status.PART_PAID
        invoice.payment_received_at = invoice.payment_received_at or timezone.now()
        invoice.receipt_number = invoice.receipt_number or f"BPR-{timezone.localdate():%Y%m%d}-{invoice.id:04d}"
    elif invoice.status != Invoice.Status.CANCELLED:
        invoice.status = Invoice.Status.ISSUED


class InvoiceListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        invoices = contractor_invoice_scope(request.user).select_related("quotation", "customer", "site_property")
        return Response([invoice_payload(item) for item in invoices])
    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        if not request.data.get("quotation"):
            customer = Customer.objects.filter(
                pk=request.data.get("customer"),
                contractor_connections__contractor=request.user,
                contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
            ).distinct().first()
            if not customer:
                return Response({"customer": "Select a connected customer."}, status=status.HTTP_400_BAD_REQUEST)
            if not customer.portal_user_id or not customer.bharath_id:
                return Response({"customer": "Create the Customer ID & Login before raising an invoice."}, status=status.HTTP_400_BAD_REQUEST)
            property_obj = None
            if request.data.get("property"):
                property_obj = Property.objects.filter(pk=request.data.get("property"), customer=customer).filter(contractor_property_scope(request.user)).first()
                if not property_obj:
                    return Response({"property": "The selected property does not belong to this customer."}, status=status.HTTP_400_BAD_REQUEST)
            tax_mode = request.data.get("tax_mode")
            if tax_mode not in Invoice.TaxMode.values:
                return Response({"tax_mode": "Choose With GST or Without GST."}, status=status.HTTP_400_BAD_REQUEST)
            supplied_items = request.data.get("items") or request.data.get("base_items") or []
            if not supplied_items:
                return Response({"items": "Add at least one invoice line."}, status=status.HTTP_400_BAD_REQUEST)
            invoice_date = parse_date(str(request.data.get("invoice_date") or "")) or timezone.localdate()
            address = request.data.get("billing_address") or ", ".join(filter(None, [customer.address, customer.city, customer.pincode]))
            invoice = Invoice.objects.create(
                contractor=request.user, customer=customer, site_property=property_obj,
                quotation=None, invoice_number=next_invoice_number(tax_mode, invoice_date),
                invoice_date=invoice_date, due_date=parse_date(str(request.data.get("due_date") or "")),
                tax_mode=tax_mode, customer_name=customer.name, customer_mobile=customer.mobile,
                billing_address=address, property_name=(property_obj.name or property_obj.property_type) if property_obj else request.data.get("property_name", ""),
                quotation_number_snapshot="Lump sum", base_items=supplied_items, items=supplied_items,
                discount=Decimal(str(request.data.get("discount") or 0)),
                gst_percentage=Decimal(str(request.data.get("gst_percentage") or (18 if tax_mode == Invoice.TaxMode.GST else 0))) if tax_mode == Invoice.TaxMode.GST else Decimal("0"),
                notes=request.data.get("notes", ""), terms_conditions=request.data.get("terms_conditions", ""),
                status=Invoice.Status.ISSUED,
            )
            recalculate_invoice(invoice, supplied_items, [])
            invoice.save()
            return Response(invoice_payload(invoice), status=status.HTTP_201_CREATED)
        # Lock the quotation so repeated clicks cannot create two invoices for it.
        quotation = Quotation.objects.select_for_update().select_related("customer", "property").prefetch_related("items__room", "items__service_category", "items__paint_type", "items__paint_brand", "items__unit").filter(pk=request.data.get("quotation"), contractor=request.user, deleted_at__isnull=True).first()
        if not quotation: return Response({"quotation": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        invoice = ensure_invoice_for_quotation(
            quotation,
            request.user,
            request.data.get("hsn_codes") or [],
        )
        created = getattr(invoice, "created_flag", False)
        return Response(invoice_payload(invoice), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def ensure_invoice_for_quotation(quotation, contractor, hsn_codes=None):
    """Return the invoice for a quotation, creating it from the quotation when missing."""
    schedule = getattr(quotation, "work_schedule", None)
    if not schedule or schedule.status != "COMPLETED":
        raise ValidationError({"quotation": "The final invoice can be created only after the project is completed."})
    existing = Invoice.objects.filter(quotation=quotation).first()
    if existing:
        if schedule.payment_status == "CONFIRMED" and schedule.advance_amount:
            record_advance_payment(existing, schedule, contractor)
        record_project_receipts(existing, quotation)
        if quotation.status != Quotation.Status.CONVERTED:
            quotation.status = Quotation.Status.CONVERTED
            quotation.save(update_fields=("status", "updated_at"))
        existing.created_flag = False
        return existing
    rows=[]
    hsn_codes = hsn_codes if isinstance(hsn_codes, list) else []
    for index, item in enumerate(current_scope(quotation), 1):
        rows.append({
            "serial": index,
            "service": item["service"] or "Painting",
            "room": item["room"],
            "product_type": item["material"],
            "description": item["description"],
            "brand": item["brand"],
            "unit": item["unit"],
            "quantity": str(item["quantity"]),
            "rate": str(item["rate"]),
            "amount": str(item["amount"]),
            "hsn_sac": str(hsn_codes[index - 1] if index - 1 < len(hsn_codes) else "").strip()[:50],
            "scope_origin": item["origin"],
            "work_change_number": item.get("change_number", ""),
        })
    customer_snapshot=quotation.customer_snapshot or {}
    property_snapshot=quotation.property_snapshot or {}
    address=", ".join(filter(None,[property_snapshot.get("address",quotation.property.address),property_snapshot.get("city",quotation.property.city),property_snapshot.get("pincode",quotation.property.pincode)]))
    invoice, created = Invoice.objects.get_or_create(
        quotation=quotation,
        defaults={
            "contractor": contractor,
            "invoice_number": f"TMP-{secrets.token_hex(6)}",
            "customer_name": customer_snapshot.get("name", quotation.customer.name),
            "customer_mobile": customer_snapshot.get("mobile", quotation.customer.mobile),
            "billing_address": address,
            "property_name": property_snapshot.get("name") or quotation.property.name or quotation.property.property_type,
            "contractor_snapshot": quotation.contractor_snapshot,
            "quotation_number_snapshot": quotation.quotation_number,
            "customer": quotation.customer,
            "site_property": quotation.property,
            "tax_mode": Invoice.TaxMode.GST if quotation.gst_percentage > 0 else Invoice.TaxMode.NON_GST,
            "base_items": rows,
            "items": rows,
            "discount": quotation.discount,
            "gst_percentage": quotation.gst_percentage,
            "notes": quotation.notes,
            "terms_conditions": quotation.terms_conditions,
            "status": Invoice.Status.ISSUED,
        },
    )
    if not created:
        invoice.created_flag = False
        return invoice
    invoice.invoice_number = next_invoice_number(invoice.tax_mode, invoice.invoice_date); recalculate_invoice(invoice,rows); invoice.save()
    if schedule.payment_status == "CONFIRMED" and schedule.advance_amount:
        record_advance_payment(invoice, schedule, contractor)
    record_project_receipts(invoice, quotation)
    quotation.status = Quotation.Status.CONVERTED
    quotation.save(update_fields=("status", "updated_at"))
    invoice.created_flag = True
    return invoice


def record_advance_payment(invoice, schedule, contractor):
    """Record a confirmed schedule advance as an invoice payment entry."""
    if invoice.payments.filter(notes__startswith=f"Advance payment (schedule #{schedule.id})").exists():
        return False
    if not schedule.advance_amount or schedule.advance_amount <= 0:
        raise ValidationError({"amount": "The confirmed advance amount must be greater than zero."})
    mode_map = {"CASH": "CASH", "UPI": "UPI", "ONLINE": "BANK_TRANSFER"}
    InvoicePayment.objects.create(
        invoice=invoice, received_date=timezone.localdate(schedule.payment_confirmed_at or timezone.now()),
        amount=schedule.advance_amount or Decimal("0"),
        payment_mode=mode_map.get(schedule.payment_mode, "OTHER"),
        payment_reference=schedule.payment_reference or "",
        notes=f"Advance payment (schedule #{schedule.id})",
    )
    sync_invoice_payments(invoice)
    return True


def record_project_receipts(invoice, quotation):
    """Carry every pre-invoice quotation receipt into the final invoice ledger once."""
    created = False
    for receipt in quotation.project_receipts.all():
        note = f"Quotation receipt ({receipt.receipt_number})"
        if invoice.payments.filter(notes=note).exists():
            continue
        InvoicePayment.objects.create(
            invoice=invoice, received_date=receipt.received_date, amount=receipt.amount,
            payment_mode=receipt.payment_mode, payment_reference=receipt.payment_reference,
            notes=note,
        )
        created = True
    if created:
        sync_invoice_payments(invoice)
    return created


def customer_invoice_scope(user):
    property_ids = accessible_properties(
        user, PropertyPermission.VIEW_INVOICES,
    ).values("pk")
    completed_project_invoices = Q(quotation__work_schedule__status="COMPLETED") & (
        Q(quotation__customer__portal_user=user)
        | Q(quotation__property_id__in=Subquery(property_ids))
        | Q(site_property_id__in=Subquery(property_ids))
    )
    standalone_invoices = Q(quotation__isnull=True) & (
        Q(customer__portal_user=user)
        | Q(site_property_id__in=Subquery(property_ids))
    )
    return Invoice.objects.filter(completed_project_invoices | standalone_invoices).distinct()


class CustomerInvoiceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        invoices = customer_invoice_scope(request.user).select_related("quotation", "customer", "site_property")
        property_id = request.query_params.get("property_id")
        if property_id:
            if not accessible_properties(request.user, PropertyPermission.VIEW_INVOICES).filter(pk=property_id).exists():
                return Response({"detail": "Invoice access is not available for this property."}, status=status.HTTP_403_FORBIDDEN)
            invoices = invoices.filter(Q(quotation__property_id=property_id) | Q(site_property_id=property_id))
        return Response([customer_invoice_payload(request.user, item) for item in invoices])


class InvoiceDetailView(APIView):
    permission_classes = [IsAuthenticated]
    def get_object(self, request, pk):
        return contractor_invoice_scope(request.user).select_related("quotation", "customer", "site_property").filter(pk=pk).first()
    def get(self, request, pk):
        item=self.get_object(request,pk)
        return Response(invoice_payload(item)) if item else Response({"detail":"Invoice not found."},status=status.HTTP_404_NOT_FOUND)
    def patch(self, request, pk):
        item=self.get_object(request,pk)
        if not item:return Response({"detail":"Invoice not found."},status=status.HTTP_404_NOT_FOUND)
        can_edit = timezone.localdate(item.created_at) == timezone.localdate() and item.status not in {Invoice.Status.PAID, Invoice.Status.CANCELLED}
        requested_fields = set(request.data.keys())
        payment_only = bool(requested_fields) and requested_fields.issubset({"amount_paid", "payment_mode", "payment_reference"})
        if item.status == Invoice.Status.CANCELLED and payment_only:
            return Response({"detail": "Payment cannot be updated on a cancelled invoice."}, status=status.HTTP_400_BAD_REQUEST)
        if not can_edit and not payment_only:
            if request.data.get("status") == Invoice.Status.CANCELLED and item.status != Invoice.Status.PAID:
                item.status = Invoice.Status.CANCELLED
                item.save(update_fields=("status", "updated_at"))
                return Response(invoice_payload(item))
            return Response({"detail": "The edit window has closed. Cancel this invoice and create a new invoice."}, status=status.HTTP_400_BAD_REQUEST)
        for field in ["invoice_date","due_date","status","customer_name","customer_mobile","billing_address","property_name","notes","terms_conditions"]:
            if field in request.data:setattr(item,field,request.data[field] or None if field=="due_date" else request.data[field])
        for field in ["discount","gst_percentage","amount_paid"]:
            if field in request.data:setattr(item,field,Decimal(str(request.data[field] or 0)))
        for field in ["payment_mode", "payment_reference"]:
            if field in request.data:setattr(item,field,request.data[field] or "")
        if item.amount_paid > 0 and not item.payment_mode:
            return Response({"payment_mode": "Select the payment mode when recording an amount received."}, status=status.HTTP_400_BAD_REQUEST)
        recalculate_invoice(item,request.data.get("base_items",request.data.get("items",item.base_items or item.items)),request.data.get("measurement_adjustments",item.measurement_adjustments));item.save();return Response(invoice_payload(item))
    def delete(self,request,pk):
        item=self.get_object(request,pk)
        if not item:return Response(status=status.HTTP_404_NOT_FOUND)
        item.delete();return Response(status=status.HTTP_204_NO_CONTENT)


class InvoicePdfView(APIView):
    permission_classes=[IsAuthenticated]
    def get(self,request,pk):
        item=contractor_invoice_scope(request.user).select_related("quotation", "customer", "site_property", "contractor__contractor_profile").filter(pk=pk).first()
        if not item:return Response({"detail":"Invoice not found."},status=status.HTTP_404_NOT_FOUND)
        response=HttpResponse(build_invoice_pdf(item, language=document_language(request)),content_type="application/pdf");response["Content-Disposition"]=f'attachment; filename="{item.invoice_number}.pdf"';return response


class InvoiceReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, pk):
        item = Invoice.objects.select_related("quotation", "quotation__customer", "customer", "contractor__contractor_profile").filter(pk=pk).filter(models.Q(quotation__work_schedule__status="COMPLETED") | models.Q(quotation__isnull=True)).first()
        allowed = item and (
            item.contractor_id == request.user.id
            or (item.quotation_id and item.quotation.customer.portal_user_id == request.user.id)
            or (item.customer_id and item.customer.portal_user_id == request.user.id)
            or (
                item.quotation_id
                and item.quotation.property_id
                and has_property_access(request.user, item.quotation.property, PropertyPermission.VIEW_PAYMENTS)
            )
        )
        if not allowed or item.status == Invoice.Status.CANCELLED or item.amount_paid <= 0:
            return Response({"detail": "Payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item.receipt_number:
            item.receipt_number = f"BPR-{timezone.localdate():%Y%m%d}-{item.id:04d}"
            item.payment_received_at = item.payment_received_at or item.updated_at
            item.save(update_fields=("receipt_number", "payment_received_at", "updated_at"))
        response = HttpResponse(build_invoice_receipt_pdf(item, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.receipt_number}.pdf"'
        return response


def sync_invoice_payments(invoice):
    invoice.amount_paid = invoice.payments.aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
    recalculate_invoice(invoice)
    invoice.save()


class InvoicePaymentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        invoice = contractor_invoice_scope(request.user).filter(pk=pk).first()
        if not invoice:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        if invoice.status == Invoice.Status.CANCELLED:
            return Response({"detail": "Payments cannot be added to a cancelled invoice."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get("amount") or 0))
        except (InvalidOperation, ValueError):
            amount = Decimal("0")
        if amount <= 0:
            return Response({"amount": "Enter an amount greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
        if amount > invoice.balance_due:
            return Response({"amount": f"Payment cannot exceed the remaining balance of {invoice.balance_due}."}, status=status.HTTP_400_BAD_REQUEST)
        payment_mode = str(request.data.get("payment_mode") or "")
        if payment_mode not in Invoice.PaymentMode.values:
            return Response({"payment_mode": "Select a valid payment mode."}, status=status.HTTP_400_BAD_REQUEST)
        received_date = request.data.get("received_date") or timezone.localdate()
        if str(received_date) > str(timezone.localdate()):
            return Response({"received_date": "Payment date cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST)
        InvoicePayment.objects.create(
            invoice=invoice, received_date=received_date, amount=amount, payment_mode=payment_mode,
            payment_reference=request.data.get("payment_reference") or "", notes=request.data.get("notes") or "",
        )
        sync_invoice_payments(invoice)
        return Response(invoice_payload(invoice), status=status.HTTP_201_CREATED)


class InvoicePaymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, payment_pk):
        invoice = contractor_invoice_scope(request.user).filter(pk=pk).first()
        if not invoice:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        payment = invoice.payments.filter(pk=payment_pk).first()
        if not payment:
            return Response({"detail": "Payment entry not found."}, status=status.HTTP_404_NOT_FOUND)
        payment.delete()
        sync_invoice_payments(invoice)
        return Response(invoice_payload(invoice))


class CustomerInvoicePdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        item = customer_invoice_scope(request.user).select_related("quotation", "customer", "site_property", "contractor__contractor_profile").filter(pk=pk).first()
        if not item:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        property_obj = item.quotation.property if item.quotation_id else item.site_property
        can_view_payments = has_property_access(request.user, property_obj, PropertyPermission.VIEW_PAYMENTS) if property_obj else bool(item.customer_id and item.customer.portal_user_id == request.user.id)
        response = HttpResponse(build_invoice_pdf(item, include_payment_details=can_view_payments, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.invoice_number}.pdf"'
        return response


class CustomerInvoiceReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        item = customer_invoice_scope(request.user).select_related("quotation", "customer", "site_property", "contractor__contractor_profile").filter(pk=pk).first()
        if not item or item.status == Invoice.Status.CANCELLED or item.amount_paid <= 0:
            return Response({"detail": "Payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        property_obj = item.quotation.property if item.quotation_id else item.site_property
        can_view_payments = has_property_access(request.user, property_obj, PropertyPermission.VIEW_PAYMENTS) if property_obj else bool(item.customer_id and item.customer.portal_user_id == request.user.id)
        if not can_view_payments:
            return Response({"detail": "Payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item.receipt_number:
            item.receipt_number = f"BPR-{timezone.localdate():%Y%m%d}-{item.id:04d}"
            item.payment_received_at = item.payment_received_at or item.updated_at
            item.save(update_fields=("receipt_number", "payment_received_at", "updated_at"))
        response = HttpResponse(build_invoice_receipt_pdf(item, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.receipt_number}.pdf"'
        return response

# ============================================================
# PROJECT SCOPES
# ============================================================

class ProjectScopeViewSet(viewsets.ModelViewSet):
    """One addressable service line per project, owned by the quotation."""

    permission_classes = [IsAuthenticated]
    serializer_class = ProjectScopeSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if user.role == BharathUser.Roles.ADMIN:
            queryset = ProjectScope.objects.all()
        elif user.role == BharathUser.Roles.CONTRACTOR:
            queryset = ProjectScope.objects.filter(quotation__contractor=user)
        else:
            return ProjectScope.objects.none()
        if self.request.query_params.get("quotation"):
            queryset = queryset.filter(quotation_id=self.request.query_params["quotation"])
        return queryset.select_related("category", "work_description", "unit")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["viewer"] = self.request.user
        return context

    def perform_create(self, serializer):
        quotation = serializer.validated_data["quotation"]
        if quotation.contractor_id != self.request.user.id and self.request.user.role != BharathUser.Roles.ADMIN:
            raise ValidationError({"quotation": "That quotation is not yours."})
        if quotation.status == Quotation.Status.CANCELLED:
            raise ValidationError({"quotation": "This project has been cancelled."})
        serializer.save(
            sort_order=(ProjectScope.objects.filter(quotation=quotation).aggregate(top=models.Max("sort_order"))["top"] or 0) + 10
        )


# ============================================================
# CONTRACTOR NETWORK
# ============================================================

class ContractorConnectionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.ADMIN}:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        rows = ContractorConnection.objects.filter(
            models.Q(requester=user) | models.Q(recipient=user)
        ).select_related("requester", "recipient")
        if request.query_params.get("status"):
            rows = rows.filter(status=request.query_params["status"])
        return Response(ContractorConnectionSerializer(rows, many=True, context={"viewer": user}).data)

    @transaction.atomic
    def post(self, request):
        user = request.user
        if user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        recipient_id = request.data.get("recipient")
        if not recipient_id:
            raise ValidationError({"recipient": "Choose a contractor."})
        if str(recipient_id) == str(user.id):
            raise ValidationError({"recipient": "You cannot connect with yourself."})

        recipient = BharathUser.objects.filter(
            pk=recipient_id, role=BharathUser.Roles.CONTRACTOR, is_active=True
        ).first()
        if recipient is None:
            raise ValidationError({"recipient": "That contractor is not available."})

        message = request.data.get("message", "")
        if not isinstance(message, str) or len(message) > 2000:
            raise ValidationError({"message": "Use a message of up to 2000 characters."})
        message = message.strip()
        connection = ContractorConnection.objects.select_for_update().filter(
            models.Q(requester=user, recipient=recipient) | models.Q(requester=recipient, recipient=user)
        ).first()
        if connection is not None:
            if connection.is_blocked or connection.status == ContractorConnection.Status.BLOCKED:
                raise ValidationError({"recipient": "This connection is blocked."})
            if connection.status == ContractorConnection.Status.CONNECTED:
                raise ValidationError({"recipient": "You are already connected."})
            if connection.status == ContractorConnection.Status.PENDING:
                raise ValidationError({"recipient": "A connection request is already pending."})
            connection.status = ContractorConnection.Status.PENDING
            connection.requester = user
            connection.recipient = recipient
            connection.message = message
            connection.discover_method = request.data.get("discover_method", "")
            connection.last_request_at = timezone.now()
            connection.request_count += 1
            connection.save(update_fields=["status", "requester", "recipient", "message", "discover_method", "last_request_at", "request_count", "updated_at"])
        else:
            connection = ContractorConnection.objects.create(
                requester=user,
                recipient=recipient,
                discover_method=request.data.get("discover_method", ""),
                message=message,
            )
        company = getattr(getattr(user, "contractor_profile", None), "company_name", "")
        sender = company or user.get_full_name() or user.mobile
        create_notification(
            recipient, "CONTRACTOR_CONNECTION_REQUEST", "New contractor connection request",
            f"{sender} wants to connect with you." + (f" Message: {message}" if message else ""),
            f"/messages?connection={connection.pk}", user,
        )
        return Response(
            ContractorConnectionSerializer(connection, context={"viewer": user}).data,
            status=status.HTTP_201_CREATED,
        )


class ContractorConnectionActionView(APIView):
    permission_classes = [IsAuthenticated]

    ACTION_BY_TARGET = {
        "accept": (ContractorConnection.Status.CONNECTED, "accepted_at"),
        "reject": (ContractorConnection.Status.REJECTED, "rejected_at"),
        "block": (ContractorConnection.Status.BLOCKED, "blocked_at"),
        "disconnect": (ContractorConnection.Status.DISCONNECTED, "disconnected_at"),
    }

    @transaction.atomic
    def post(self, request, pk, action):
        if action not in self.ACTION_BY_TARGET:
            return Response({"detail": "Unknown action."}, status=status.HTTP_404_NOT_FOUND)
        user = request.user
        connection = get_object_or_404(ContractorConnection.objects.select_for_update().select_related("requester", "recipient"), pk=pk)
        if user.id not in {connection.requester_id, connection.recipient_id}:
            raise ValidationError({"detail": "This connection is not yours."})

        target_status, stamp_field = self.ACTION_BY_TARGET[action]
        if action in {"accept", "reject"}:
            if connection.recipient_id != user.id:
                raise ValidationError({"detail": "Only the receiving contractor can accept or decline."})
            if connection.status != ContractorConnection.Status.PENDING:
                raise ValidationError({"detail": "This request is no longer pending."})
        if action in {"block", "disconnect"} and connection.status != ContractorConnection.Status.CONNECTED:
            raise ValidationError({"detail": "You can only block or disconnect a live connection."})

        if action == "block":
            connection.status_before_block = connection.status
            connection.is_blocked = True
        elif action == "disconnect":
            connection.is_blocked = False

        connection.status = target_status
        setattr(connection, stamp_field, timezone.now())
        if action == "reject":
            connection.rejection_reason = request.data.get("reason", "")[:150]
        connection.save()
        if action in {"accept", "reject"}:
            create_notification(
                connection.requester, "CONTRACTOR_CONNECTION_RESPONSE",
                "Connection accepted" if action == "accept" else "Connection declined",
                f"{user.get_full_name() or user.mobile} {'accepted' if action == 'accept' else 'declined'} your contractor connection request.",
                "/contractor-network", user,
            )
        return Response(ContractorConnectionSerializer(connection, context={"viewer": user}).data)
