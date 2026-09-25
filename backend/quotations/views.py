
from django.db import IntegrityError, models, transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from decimal import Decimal, InvalidOperation
from datetime import timedelta
import csv
import io
import secrets
import re
from openpyxl import Workbook, load_workbook
from .pdf_utils import build_quotation_pdf, build_measurement_pdf, build_invoice_pdf, build_invoice_receipt_pdf
from .revision_utils import clone_quotation_revision, previous_revision, quotation_revision_changes
from .product_details import consolidated_product_details

from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.exceptions import ValidationError
from accounts.models import BharathUser, ContractorProfile, PainterProfile


from .models import (
    Area, MeasurementSurfaceType,
    ServiceCategory,
    ServiceType,
    WorkDescription,
    PaintType,
    PaintBrand,
    PaintColor,
    Unit,
    Customer, ContractorCustomerConnection, CustomerConnectionAudit, normalize_indian_mobile,
    CustomerFollowUp,
    CustomerWorkHistory, ChatConversation, ChatMessage, PortalNotification, ServiceRequest, Lead, LeadStageHistory, SupportTicket, SupportTicketMessage, MeasurementAccessRequest,
    WorkPhoto,
    Property, ApartmentCommunity,
    Quotation, QuotationRoom, PropertyRoom, PropertyMeasurement, MeasurementSurface, MeasurementOpening, ActivityLog, Invoice, InvoiceNumberSequence, InvoicePayment, ProjectReceipt, WorkChange, WorkChangeItem,
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
    CustomerSerializer,
    PropertySerializer,
    QuotationSerializer,
    CustomerFollowUpSerializer,
    CustomerTaskSerializer,
    CustomerDetailSerializer,
    CustomerWorkHistorySerializer,
    WorkPhotoSerializer, PropertyRoomSerializer, PropertyMeasurementSerializer, MeasurementSurfaceSerializer,
    MeasurementOpeningSerializer, ActivityLogSerializer, WorkChangeSerializer, WorkChangeItemSerializer,
)
from .work_changes import current_scope, work_change_summary


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
        return queryset.filter(customer__portal_user=user).first()
    return None


class WorkChangeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = work_change_queryset()
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(contractor=request.user)
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            queryset = queryset.filter(customer__portal_user=request.user).exclude(status=WorkChange.Status.DRAFT)
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
        change = work_change_queryset().select_for_update().filter(pk=pk, customer__portal_user=request.user).first()
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
            quotations = Quotation.objects.filter(contractor=user).filter(models.Q(quotation_number__icontains=query) | models.Q(customer__name__icontains=query) | models.Q(property__name__icontains=query))[:6]
            results += [{"type": "Quotation", "title": x.quotation_number, "subtitle": x.customer.name, "link": f"/quotations/{x.id}"} for x in quotations]
            properties = Property.objects.filter(contractor=user, connection__status=ContractorCustomerConnection.Status.CONNECTED).filter(models.Q(name__icontains=query) | models.Q(city__icontains=query) | models.Q(address__icontains=query))[:6]
            results += [{"type": "Property", "title": x.name or x.property_type, "subtitle": x.city, "link": f"/properties/{x.id}"} for x in properties]
        elif user.role == BharathUser.Roles.CUSTOMER:
            quotations = Quotation.objects.filter(customer__portal_user=user).filter(models.Q(quotation_number__icontains=query) | models.Q(property__name__icontains=query))[:8]
            results += [{"type": "Quotation", "title": x.quotation_number, "subtitle": x.property.name or x.property.property_type, "link": f"/customer-quotations/{x.id}"} for x in quotations]
        elif user.role == BharathUser.Roles.ADMIN:
            people = BharathUser.objects.filter(models.Q(mobile__icontains=query) | models.Q(first_name__icontains=query) | models.Q(bharath_id__icontains=query))[:10]
            results += [{"type": x.get_role_display(), "title": x.get_full_name() or x.mobile, "subtitle": x.mobile, "link": "/contractors" if x.role == "CONTRACTOR" else "/painters"} for x in people]
        return Response(results[:18])


CONNECTION_REQUEST_COOLDOWN = timedelta(days=7)


def find_user_by_normalized_mobile(normalized_mobile, role=None):
    users = BharathUser.objects.all()
    if role:
        users = users.filter(role=role)
    return next((
        user for user in users
        if normalize_indian_mobile(user.mobile) == normalized_mobile
    ), None)


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
    if not customer.bharath_id:
        customer.bharath_id = next_available_customer_id(customer)
        customer.save(update_fields=("bharath_id", "updated_at"))
    if customer.portal_user_id:
        return customer.portal_user, None
    temporary_password = f"BP@{secrets.randbelow(900000) + 100000}"
    portal_user = find_customer_portal_user(customer.normalized_mobile)
    if portal_user:
        temporary_password = None
        changed = []
        if not portal_user.bharath_id:
            portal_user.bharath_id = customer.bharath_id
            changed.append("bharath_id")
        if changed:
            portal_user.save(update_fields=changed)
    else:
        portal_user = BharathUser.objects.create_user(
            mobile=customer.mobile, email=customer.email or None,
            password=temporary_password, first_name=customer.name,
            role=BharathUser.Roles.CUSTOMER, is_active=True, is_verified=False,
            verification_status=BharathUser.VerificationStatus.PENDING,
            bharath_id=customer.bharath_id,
        )
    customer.portal_user = portal_user
    customer.save(update_fields=("portal_user", "updated_at"))
    return portal_user, temporary_password


def contractor_property_scope(user, prefix=""):
    return (
        models.Q(**{f"{prefix}contractor": user, f"{prefix}connection__status": ContractorCustomerConnection.Status.CONNECTED})
        | models.Q(**{f"{prefix}contractor": user, f"{prefix}connection__isnull": True})
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
        "public_rating": None,
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
        if connection.status == ContractorCustomerConnection.Status.REJECTED and connection.rejected_at:
            cooldown_until = connection.rejected_at + CONNECTION_REQUEST_COOLDOWN
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
        "requested_at": connection.requested_at,
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
        data["customer"] = {"masked_customer_id": masked_customer_id(customer.bharath_id), "masked_mobile": masked_mobile(customer.mobile)}
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
        customer = Customer.objects.filter(normalized_mobile=normalized).first()
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


class ContractorCustomerConnectionRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        customer = Customer.objects.select_for_update().filter(normalized_mobile=normalized).first()
        if not customer:
            return Response({"detail": "Customer account not found. Check the mobile number first."}, status=status.HTTP_404_NOT_FOUND)
        connection = ContractorCustomerConnection.objects.select_for_update().filter(customer=customer, contractor=request.user).first()
        now = timezone.now()
        action = CustomerConnectionAudit.Actions.REQUESTED
        if connection:
            if connection.status == ContractorCustomerConnection.Status.CONNECTED:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_409_CONFLICT)
            if connection.status == ContractorCustomerConnection.Status.PENDING:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_409_CONFLICT)
            if connection.status == ContractorCustomerConnection.Status.BLOCKED:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_403_FORBIDDEN)
            if connection.status == ContractorCustomerConnection.Status.REJECTED and connection.rejected_at and now < connection.rejected_at + CONNECTION_REQUEST_COOLDOWN:
                return Response(safe_customer_lookup(customer, connection), status=status.HTTP_429_TOO_MANY_REQUESTS)
            connection.status = ContractorCustomerConnection.Status.PENDING
            connection.requested_at = now
            connection.requested_by = request.user
            connection.rejected_at = None
            connection.disconnected_at = None
            connection.rejection_reason = ""
            connection.save()
            action = CustomerConnectionAudit.Actions.RESENT
        else:
            connection = ContractorCustomerConnection.objects.create(customer=customer, contractor=request.user, requested_by=request.user)
        record_connection_audit(request, connection, action)
        public = contractor_public_data(request.user)
        create_notification(
            customer.portal_user, "CONNECTION_REQUEST", "New contractor connection request",
            f"{public['business_name']} wants to connect with your Bharath Painters account.",
            "/customer/connection-requests", request.user,
        )
        return Response({"state": "PENDING", "connection_id": connection.id, "message": "Connection request sent. Waiting for customer approval."}, status=status.HTTP_201_CREATED)


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
        return Response({"pending_count": queryset.filter(status=ContractorCustomerConnection.Status.PENDING).count(), "results": results})


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
            if connection.status != ContractorCustomerConnection.Status.PENDING:
                return Response({"detail": "Only a pending request can be accepted."}, status=status.HTTP_409_CONFLICT)
            connection.status = ContractorCustomerConnection.Status.CONNECTED
            connection.approved_at = now
            connection.connected_at = now
            connection.approval_method = ContractorCustomerConnection.ApprovalMethod.CUSTOMER_PORTAL
            connection.save()
            ChatConversation.objects.get_or_create(customer=connection.customer, contractor=connection.contractor, defaults={"connection": connection})
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.ACCEPTED)
            create_notification(connection.contractor, "CONNECTION_ACCEPTED", "Connection accepted", f"{masked_customer_id(connection.customer.bharath_id)} accepted your connection request.", "/customers", request.user)
        elif self.action == "reject":
            if connection.status != ContractorCustomerConnection.Status.PENDING:
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
            connection.status = ContractorCustomerConnection.Status.BLOCKED
            connection.blocked_at = now
            connection.save()
            record_connection_audit(request, connection, CustomerConnectionAudit.Actions.BLOCKED)
            create_notification(connection.contractor, "CONTRACTOR_BLOCKED", "Customer connection blocked", "You can no longer request this customer connection.", "/customers", request.user)
        return Response(connection_data(connection, request.user.role))


class CustomerConnectionAcceptView(CustomerConnectionActionView):
    action = "accept"


class CustomerConnectionRejectView(CustomerConnectionActionView):
    action = "reject"


class CustomerContractorDisconnectView(CustomerConnectionActionView):
    action = "disconnect"


class CustomerContractorBlockView(CustomerConnectionActionView):
    action = "block"


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
        today = timezone.localdate()
        return Response({
            "total": queryset.count(),
            "today": queryset.filter(created_at__date=today).count(),
            "flagged": queryset.filter(is_flagged=True, reviewed_at__isnull=True).count(),
            "active_users": queryset.exclude(actor=None).values("actor").distinct().count(),
            "by_action": list(queryset.values("action").annotate(count=models.Count("id")).order_by("-count")),
            "by_module": list(queryset.values("module").annotate(count=models.Count("id")).order_by("-count")[:8]),
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
        serializer.save(created_by=None if self.request.user.role == BharathUser.Roles.ADMIN else self.request.user)

    def visible_master_data(self, model_class):
        user = self.request.user
        if user.role == BharathUser.Roles.ADMIN:
            return model_class.objects.filter(models.Q(created_by__isnull=True) | models.Q(created_by__role=BharathUser.Roles.ADMIN), is_active=True)
        return model_class.objects.filter(models.Q(created_by=user) | models.Q(created_by__isnull=True) | models.Q(created_by__role=BharathUser.Roles.ADMIN), is_active=True)


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
    mobile_key = "".join(character for character in customer.mobile if character.isdigit())[-10:]
    if len(mobile_key) != 10:
        return customer
    portal_user = next(
        (
            user for user in BharathUser.objects.filter(role=BharathUser.Roles.CUSTOMER)
            if "".join(character for character in user.mobile if character.isdigit())[-10:] == mobile_key
        ),
        None,
    )
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
    mobile_key = "".join(character for character in customer.mobile if character.isdigit())[-10:]
    candidates = Customer.objects.all()
    if customer.portal_user_id:
        candidates = candidates.filter(
            models.Q(portal_user_id=customer.portal_user_id) |
            models.Q(portal_user__isnull=True)
        )
    matching = []
    for candidate in candidates.only("id", "mobile", "portal_user_id"):
        candidate_key = "".join(character for character in candidate.mobile if character.isdigit())[-10:]
        same_portal = customer.portal_user_id and candidate.portal_user_id == customer.portal_user_id
        same_mobile = len(mobile_key) == 10 and candidate_key == mobile_key
        if same_portal or same_mobile:
            matching.append(candidate.id)
    return matching

class CustomerListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = CustomerSerializer

    def get_queryset(self):
        if self.request.user.role != BharathUser.Roles.CONTRACTOR:
            return Customer.objects.none()
        return Customer.objects.filter(
            contractor_connections__contractor=self.request.user,
            contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
        ).distinct().order_by("-updated_at")

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_indian_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": ["Enter a valid Indian mobile number."]}, status=status.HTTP_400_BAD_REQUEST)
        existing = Customer.objects.select_for_update().filter(normalized_mobile=normalized).first()
        if existing:
            connection = ContractorCustomerConnection.objects.filter(customer=existing, contractor=request.user).first()
            return Response(safe_customer_lookup(existing, connection), status=status.HTTP_409_CONFLICT)
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
            existing = Customer.objects.filter(normalized_mobile=normalized).first()
            if not existing:
                raise
            connection = ContractorCustomerConnection.objects.filter(
                customer=existing, contractor=request.user,
            ).first()
            return Response(safe_customer_lookup(existing, connection), status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        connection = ContractorCustomerConnection.objects.create(
            customer=customer, contractor=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
            requested_by=request.user,
            requested_at=now, connected_at=now, approved_at=now,
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
        output = self.get_serializer(customer).data
        output["connection_status"] = connection.status
        return Response(output, status=status.HTTP_201_CREATED)


class CustomerActivateAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        customer = Customer.objects.select_for_update().filter(
            pk=pk,
            contractor_connections__contractor=request.user,
            contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
        ).distinct().first()
        if request.user.role != BharathUser.Roles.CONTRACTOR or not customer:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        _, temporary_password = activate_customer_account(customer)
        payload = CustomerSerializer(customer, context={"request": request}).data
        payload["account_created"] = True
        payload["already_active"] = temporary_password is None
        if temporary_password:
            payload["temporary_password"] = temporary_password
        return Response(payload)


# ============================================================
# CUSTOMER PROPERTIES
# ============================================================

class PropertyListCreateView(
    generics.ListCreateAPIView
):

    permission_classes = [IsAuthenticated]

    serializer_class = PropertySerializer

    def get_queryset(self):
        return Property.objects.filter(contractor_property_scope(self.request.user)).order_by("-created_at")

    def perform_create(self, serializer):
        customer = serializer.validated_data["customer"]
        connection = ContractorCustomerConnection.objects.filter(
            customer=customer, contractor=self.request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            raise ValidationError({"customer": "Connect with this customer before creating a property."})
        if "measurement_unit" in self.request.data:
            serializer.save(contractor=self.request.user, connection=connection)
            return
        profile = getattr(self.request.user, "contractor_profile", None)
        serializer.save(contractor=self.request.user, connection=connection, measurement_unit=getattr(profile, "default_measurement_unit", "FEET"))


class PropertyDetailView(generics.RetrieveUpdateDestroyAPIView):

    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer

    def get_queryset(self):
        return Property.objects.filter(contractor_property_scope(self.request.user))


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
        pdf = build_measurement_pdf(property_obj, record)
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
        "last_message": last.text if last else "",
        "last_message_at": last.created_at if last else conversation.created_at,
        "unread_count": conversation.messages.exclude(sender=viewer).filter(read_at__isnull=True).count(),
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


def validate_chat_text(request, conversation, text):
    value = str(text or "").strip()
    if not value:
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
    return {
        "id": item.id,
        "sender": item.sender_id,
        "sender_role": item.sender.role,
        "text": item.text,
        "created_at": item.created_at,
        "read_at": item.read_at,
        "is_mine": item.sender_id == viewer.id,
    }


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


def notification_data(item):
    return {"id": item.id, "event_type": item.event_type, "title": item.title, "message": item.message, "link": item.link, "is_read": bool(item.read_at), "created_at": item.created_at}


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
            "results": [notification_data(item) for item in items],
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


class ChatConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            from jobs.models import ContractorApplicatorTeam
            painter_ids = ContractorApplicatorTeam.objects.filter(contractor=request.user, is_active=True).values_list("painter_id", flat=True)
            for painter_id in painter_ids:
                ChatConversation.objects.get_or_create(contractor=request.user, painter_id=painter_id, customer=None)
            requested_painter_id = request.query_params.get("painter_id")
            requested_conversation_id = request.query_params.get("conversation")
            if requested_painter_id:
                painter = BharathUser.objects.filter(
                    pk=requested_painter_id, role=BharathUser.Roles.PAINTER, is_active=True,
                ).first()
                if not painter or not contractor_can_message_painter(request.user, painter):
                    return Response({"detail": "This Paint Applicator is not connected to your work."}, status=status.HTTP_403_FORBIDDEN)
                ChatConversation.objects.get_or_create(
                    contractor=request.user, painter=painter, customer=None,
                )
            conversations = ChatConversation.objects.filter(contractor=request.user)
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
            conversations = ChatConversation.objects.filter(customer__portal_user=request.user)
        elif request.user.role == BharathUser.Roles.PAINTER:
            contractor_id = request.query_params.get("contractor_id")
            if contractor_id:
                contractor = BharathUser.objects.filter(
                    pk=contractor_id, role=BharathUser.Roles.CONTRACTOR, is_active=True,
                ).first()
                if not contractor:
                    return Response({"detail": "Contractor not found."}, status=status.HTTP_404_NOT_FOUND)
                ChatConversation.objects.get_or_create(contractor=contractor, painter=request.user, customer=None)
            conversations = ChatConversation.objects.filter(painter=request.user)
        else:
            return Response([], status=status.HTTP_200_OK)
        conversations = conversations.select_related("customer", "contractor", "contractor__contractor_profile", "painter").annotate(
            recent_message_at=models.Max("messages__created_at")
        ).order_by(models.F("recent_message_at").desc(nulls_last=True), "-updated_at")
        return Response([conversation_data(item, request.user) for item in conversations[:20]])

    def post(self, request):
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
        return conversation if allowed else None

    def get(self, request, pk):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        conversation.messages.exclude(sender=request.user).filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response([chat_message_data(item, request.user) for item in conversation.messages.select_related("sender")])

    def post(self, request, pk):
        BharathUser.objects.filter(pk=request.user.pk).update(last_activity_at=timezone.now())
        conversation = self.get_conversation(request, pk)
        if not conversation:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        text, error = validate_chat_text(request, conversation, request.data.get("text"))
        if error:
            return error
        message = ChatMessage.objects.create(conversation=conversation, sender=request.user, text=text)
        conversation.save(update_fields=("updated_at",))
        recipient = None
        if conversation.customer:
            recipient = conversation.customer.portal_user if request.user.id == conversation.contractor_id else conversation.contractor
        elif conversation.painter_id == request.user.id:
            recipient = conversation.contractor
        else:
            recipient = conversation.painter
        create_notification(recipient, "MESSAGE", "New message", f"{request.user.get_full_name() or request.user.mobile}: {text[:120]}", "/messages", request.user)
        return Response(chat_message_data(message, request.user), status=status.HTTP_201_CREATED)


class ChatMessageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_message(self, request, pk):
        return ChatMessage.objects.select_related("sender", "conversation").filter(
            pk=pk, sender=request.user,
        ).first()

    def patch(self, request, pk):
        message = self.get_message(request, pk)
        if not message:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        text, error = validate_chat_text(request, message.conversation, request.data.get("text"))
        if error:
            return error
        message.text = text
        message.save(update_fields=("text",))
        message.conversation.save(update_fields=("updated_at",))
        return Response(chat_message_data(message, request.user))

    def delete(self, request, pk):
        message = self.get_message(request, pk)
        if not message:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        conversation = message.conversation
        message.delete()
        conversation.save(update_fields=("updated_at",))
        return Response(status=status.HTTP_204_NO_CONTENT)


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

    def post(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Only customers can raise service requests."}, status=status.HTTP_403_FORBIDDEN)
        selector = request.data.get("connection") or request.data.get("customer")
        connection = ContractorCustomerConnection.objects.select_related("customer", "contractor").filter(
            pk=selector,
            customer__portal_user=request.user,
            status=ContractorCustomerConnection.Status.CONNECTED,
        ).first()
        if not connection:
            legacy_customer = Customer.objects.filter(pk=request.data.get("customer"), portal_user=request.user).first()
            legacy_connections = ContractorCustomerConnection.objects.filter(
                customer=legacy_customer,
                status=ContractorCustomerConnection.Status.CONNECTED,
            ) if legacy_customer else ContractorCustomerConnection.objects.none()
            if legacy_connections.count() == 1:
                connection = legacy_connections.first()
        if not connection:
            return Response({"connection": "Select the contractor for this service request."}, status=status.HTTP_400_BAD_REQUEST)
        customer = connection.customer
        service = ServiceType.objects.filter(pk=request.data.get("service_type"), is_active=True).filter(
            models.Q(created_by=connection.contractor) | models.Q(created_by__isnull=True)
        ).first()
        title = str(request.data.get("title") or (service.name if service else "")).strip()
        if not title:
            return Response({"title": "Select a service or enter a request title."}, status=status.HTTP_400_BAD_REQUEST)
        preferred_date = request.data.get("preferred_date") or None
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
        "customer": ticket.customer_id, "customer_bharath_id": customer.bharath_id if customer else "", "customer_name": customer.name if customer else "",
        "customer_mobile": customer.mobile if customer else (requester.mobile if requester else ""),
        "customer_email": customer.email if customer else (requester.email if requester else ""),
        "requester_name": requester_name, "requester_role": requester.role if requester else "CUSTOMER",
        "contractor_name": profile.company_name if profile else (contractor.get_full_name() or contractor.mobile if contractor else ""),
        "category": ticket.category, "priority": ticket.priority,
        "subject": ticket.subject, "description": ticket.description,
        "status": ticket.status, "contractor_response": ticket.contractor_response,
        "message_count": ticket.messages.count(),
        "created_at": ticket.created_at, "updated_at": ticket.updated_at,
    }


class SupportTicketListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tickets = SupportTicket.objects.select_related("requester", "customer", "customer__portal_user", "connection__contractor", "connection__contractor__contractor_profile", "customer__contractor", "customer__contractor__contractor_profile")
        if request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser:
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
        if request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser:
            return Response({"detail": "Administrators manage tickets and cannot raise one here."}, status=status.HTTP_403_FORBIDDEN)
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
        ticket = SupportTicket.objects.create(
            customer=customer, connection=connection, requester=request.user, subject=subject, description=description,
            category=request.data.get("category") if request.data.get("category") in categories else SupportTicket.Category.OTHER,
            priority=request.data.get("priority") if request.data.get("priority") in priorities else SupportTicket.Priority.MEDIUM,
            requester_seen_at=timezone.now(),
        )
        for administrator in BharathUser.objects.filter(models.Q(role=BharathUser.Roles.ADMIN) | models.Q(is_superuser=True), is_active=True).distinct():
            create_notification(administrator, "SUPPORT_TICKET", "New support ticket", f"{request.user.get_full_name() or request.user.mobile}: {subject}", "/support-tickets", request.user)
        return Response(ticket_data(ticket), status=status.HTTP_201_CREATED)


class SupportTicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_ticket(self, request, pk):
        ticket = SupportTicket.objects.select_related("requester", "customer", "customer__portal_user", "connection__contractor", "customer__contractor").prefetch_related("messages__sender").filter(pk=pk).first()
        if not ticket:
            return None
        allowed = (
            request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser
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
        data["activities"] = [{"type": "CREATED", "message": "Ticket raised", "actor": data["requester_name"], "created_at": ticket.created_at}] + [{
            "id": item.id, "type": "MESSAGE", "message": item.message,
            "actor": item.sender.get_full_name() or item.sender.mobile,
            "actor_role": item.sender.role, "status": item.status_snapshot,
            "is_mine": item.sender_id == request.user.id, "created_at": item.created_at,
        } for item in ticket.messages.all()]
        return Response(data)

    def post(self, request, pk):
        ticket = self.get_ticket(request, pk)
        if not ticket:
            return Response({"detail": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
        message = str(request.data.get("message") or "").strip()
        if not message:
            return Response({"message": "Enter a response."}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > 4000:
            return Response({"message": "Response is too long."}, status=status.HTTP_400_BAD_REQUEST)
        item = SupportTicketMessage.objects.create(ticket=ticket, sender=request.user, message=message, status_snapshot=ticket.status)
        is_handler = (
            request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser
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
            for administrator in BharathUser.objects.filter(models.Q(role=BharathUser.Roles.ADMIN) | models.Q(is_superuser=True), is_active=True).distinct():
                create_notification(administrator, "SUPPORT_MESSAGE", "New ticket reply", f"{ticket_data(ticket)['requester_name']}: {message[:120]}", "/support-tickets", request.user)
        return Response({"id": item.id, "message": item.message, "created_at": item.created_at}, status=status.HTTP_201_CREATED)

    def patch(self, request, pk):
        ticket = self.get_ticket(request, pk)
        can_manage = ticket and (
            request.user.role == BharathUser.Roles.ADMIN
            or request.user.is_superuser
            or (ticket.connection_id and ticket.connection.status == ContractorCustomerConnection.Status.CONNECTED and ticket.connection.contractor_id == request.user.id)
            or (not ticket.connection_id and ticket.customer and ticket.customer.contractor_id == request.user.id)
        )
        if not can_manage:
            return Response({"detail": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
        status_value = str(request.data.get("status") or ticket.status).upper()
        if status_value not in {choice[0] for choice in SupportTicket.Status.choices}:
            return Response({"status": "Select a valid status."}, status=status.HTTP_400_BAD_REQUEST)
        ticket.status = status_value
        ticket.contractor_response = str(request.data.get("contractor_response", ticket.contractor_response) or "").strip()
        ticket.handler_seen_at = timezone.now()
        ticket.requester_seen_at = None
        ticket.save(update_fields=("status", "contractor_response", "handler_seen_at", "requester_seen_at", "updated_at"))
        if ticket.contractor_response:
            SupportTicketMessage.objects.create(ticket=ticket, sender=request.user, message=ticket.contractor_response, status_snapshot=ticket.status)
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

        contractors = ContractorProfile.objects.select_related("user").order_by("-user__created_at")
        painters = PainterProfile.objects.select_related("user").order_by("-user__created_at")
        customers = Customer.objects.select_related("contractor", "portal_user").order_by("-created_at")
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
            "contractor": item.contractor.get_full_name() or item.contractor.mobile,
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
        if BharathUser.objects.filter(mobile=mobile).exists(): return Response({"mobile": "This mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        password = str(request.data.get("password") or "").strip() or f"BP@{secrets.token_urlsafe(6)}"
        if len(password) < 8: return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
        parts = name.split(maxsplit=1); now = timezone.now()
        user = BharathUser.objects.create_user(mobile=mobile, email=str(request.data.get("email") or "").strip() or None, password=password, first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "", role=role, is_active=True, is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED, verified_at=now, badge_issued_at=now, bharath_id=next_bharath_id(role), verification_notes="Created by administrator.")
        if role == BharathUser.Roles.CONTRACTOR:
            ContractorProfile.objects.create(user=user, owner_name=name, company_name=str(request.data.get("company") or name).strip(), service_areas=str(request.data.get("service_areas") or "").strip(), office_address=str(request.data.get("address") or "").strip(), gst_number=str(request.data.get("gst_number") or "").strip(), number_of_painters=max(0, int(request.data.get("number_of_painters") or 0)))
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
            for field in ("name", "mobile", "email", "city", "address", "status", "source", "requirement"):
                if field in request.data: setattr(item, field, request.data[field])
            if "contractor_id" in request.data:
                contractor = BharathUser.objects.filter(pk=request.data["contractor_id"], role=BharathUser.Roles.CONTRACTOR).first()
                if not contractor: return Response({"contractor_id": "Select a contractor."}, status=status.HTTP_400_BAD_REQUEST)
                item.contractor = contractor
            item.save(); return Response({"message": "Customer updated."})
        role = BharathUser.Roles.CONTRACTOR if entity == "contractors" else BharathUser.Roles.PAINTER if entity == "applicators" else None
        user = BharathUser.objects.filter(pk=pk, role=role).first() if role else None
        if not user: return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
        if "mobile" in request.data and BharathUser.objects.exclude(pk=user.pk).filter(mobile=request.data["mobile"]).exists(): return Response({"mobile": "This mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        if "name" in request.data:
            parts = str(request.data["name"]).strip().split(maxsplit=1); user.first_name = parts[0] if parts else ""; user.last_name = parts[1] if len(parts) > 1 else ""
        for field in ("mobile", "email", "verification_status"):
            if field in request.data: setattr(user, field, request.data[field])
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
        if entity == "customers":
            item = Customer.objects.filter(pk=pk).first()
            if not item: return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
            item.status = Customer.Status.CANCELLED; item.save(update_fields=("status", "updated_at"))
        else:
            role = BharathUser.Roles.CONTRACTOR if entity == "contractors" else BharathUser.Roles.PAINTER if entity == "applicators" else None
            user = BharathUser.objects.filter(pk=pk, role=role).first() if role else None
            if not user: return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
            user.is_active = False; user.is_verified = False; user.verification_status = BharathUser.VerificationStatus.SUSPENDED; user.save(update_fields=("is_active", "is_verified", "verification_status", "updated_at"))
        return Response({"message": "Record deactivated."})


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
        properties = Property.objects.filter(customer_id__in=customer_ids).select_related("customer")
        quotations = Quotation.objects.filter(customer_id__in=customer_ids).exclude(status=Quotation.Status.DRAFT).select_related("customer", "contractor")
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
            "counts": {
                "customers": customers.count(),
                "active_leads": connected_customer_records.exclude(customer_status__in=(Customer.Status.WON, Customer.Status.LOST, Customer.Status.CANCELLED)).count(),
                "properties": Property.objects.filter(contractor=request.user, connection__status=ContractorCustomerConnection.Status.CONNECTED).count(),
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
            measurement_surfaces__isnull=False,
        ).exclude(contractor=request.user).distinct().order_by("-updated_at")
        return Response([{
            "id": item.id, "name": item.name or item.property_type,
            "property_type": item.property_type, "measurement_type": item.measurement_type,
            "updated_at": item.updated_at, "rooms": item.rooms.count(),
            "surfaces": item.measurement_surfaces.count(),
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
                measurement_surfaces__isnull=False,
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
        source = Property.objects.filter(pk=request.data.get("source_property"), measurement_surfaces__isnull=False).distinct().first()
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
            surfaces__isnull=False
        ).distinct().select_related(
            "contractor", "contractor__contractor_profile"
        ).prefetch_related("surfaces__openings", "rooms").order_by("-measured_on", "-id")
        record_id = request.query_params.get("measurement")
        record = records.filter(id=record_id).first() if record_id else records.first()
        if record_id and not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        rooms = PropertyRoom.objects.filter(property=property_obj, measurement_record=record).order_by("id")
        surfaces = MeasurementSurface.objects.filter(property=property_obj, measurement_record=record).select_related("room").prefetch_related("openings").order_by("room_id", "id")
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
        source_record = source.measurement_records.order_by("-measured_on", "-id").first()
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
            conversations = ChatConversation.objects.filter(customer__in=customers)
            return Response({
                "messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": ServiceRequest.objects.filter(customer__in=customers, customer_seen_at__isnull=True).count(),
                "support_tickets": SupportTicket.objects.filter(models.Q(requester=request.user) | models.Q(requester__isnull=True, customer__in=customers), requester_seen_at__isnull=True).count(),
                "measurement_access": MeasurementAccessRequest.objects.filter(customer__in=customers, status=MeasurementAccessRequest.Status.PENDING, customer_seen_at__isnull=True).count(),
                "connection_requests": ContractorCustomerConnection.objects.filter(customer__portal_user=request.user, status=ContractorCustomerConnection.Status.PENDING).count(),
                "tasks": 0,
                "work_updates": WorkSchedule.objects.filter(
                    models.Q(status__in=(WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED), customer_seen_update_at__isnull=True)
                    | models.Q(payment_status=WorkSchedule.PaymentStatus.AWAITING_PAYMENT),
                    quotation__customer__portal_user=request.user,
                ).distinct().count(),
            })
        if request.user.role == BharathUser.Roles.PAINTER:
            conversations = ChatConversation.objects.filter(painter=request.user)
            return Response({
                "messages": ChatMessage.objects.filter(conversation__in=conversations, read_at__isnull=True).exclude(sender=request.user).count(),
                "service_requests": 0, "support_tickets": SupportTicket.objects.filter(requester=request.user, requester_seen_at__isnull=True).count(),
                "tasks": 0, "measurement_access": 0, "work_updates": 0,
            })
        if request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser:
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
        quotation = Quotation.objects.select_related(
            "customer", "property", "contractor", "contractor__contractor_profile"
        ).prefetch_related(
            "items__room__property_room__room_type", "items__service_type", "items__paint_type", "items__paint_brand", "items__unit"
        ).filter(pk=pk, customer__portal_user=request.user).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        profile = quotation.contractor.contractor_profile if hasattr(quotation.contractor, "contractor_profile") else None
        contractor_snapshot = quotation.contractor_snapshot or {}
        property_snapshot = quotation.property_snapshot or {}
        return Response({
            "id": quotation.id, "quotation_number": quotation.quotation_number,
            "revision_of": quotation.revision_of_id,
            "version_number": quotation.version_number,
            "revision_changes": quotation_revision_changes(quotation),
            "quotation_date": quotation.quotation_date, "valid_until": quotation.valid_until,
            "status": quotation.status,
            "contractor_name": contractor_snapshot.get("company_name") or (profile.company_name if profile else quotation.contractor.get_full_name() or quotation.contractor.mobile),
            "property_name": property_snapshot.get("name") or quotation.property.name or quotation.property.property_type,
            "subtotal": quotation.subtotal, "discount": quotation.discount,
            "gst_amount": quotation.gst_amount, "grand_total": quotation.grand_total,
            "terms": quotation.notes,
            "show_product_key_features": quotation.show_product_key_features,
            "product_details": consolidated_product_details(quotation),
            "customer_response_note": quotation.customer_response_note,
            "customer_responded_at": quotation.customer_responded_at,
            "items": [{
                "id": item.id, "serial": index,
                "room": item.room.name if item.room else "General",
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


class CustomerQuotationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        quotations = Quotation.objects.filter(customer__portal_user=request.user).exclude(
            status=Quotation.Status.DRAFT
        ).select_related("contractor", "contractor__contractor_profile", "property", "work_schedule").order_by("-updated_at")
        results = []
        for item in quotations:
            profile = item.contractor.contractor_profile if hasattr(item.contractor, "contractor_profile") else None
            contractor_snapshot = item.contractor_snapshot or {}
            property_snapshot = item.property_snapshot or {}
            schedule = item.work_schedule if hasattr(item, "work_schedule") else None
            results.append({
                "id": item.id, "quotation_number": item.quotation_number,
                "revision_of": item.revision_of_id, "version_number": item.version_number,
                "status": item.status, "status_display": item.get_status_display(),
                "grand_total": item.grand_total, "quotation_date": item.quotation_date,
                "updated_at": item.updated_at,
                "property_name": property_snapshot.get("name") or item.property.name or item.property.property_type,
                "contractor_name": contractor_snapshot.get("company_name") or (profile.company_name if profile else item.contractor.get_full_name() or item.contractor.mobile),
                "contractor_owner": contractor_snapshot.get("owner_name") or (profile.owner_name if profile else item.contractor.get_full_name()),
                "contractor_mobile": contractor_snapshot.get("mobile", item.contractor.mobile),
                "contractor_bharath_id": contractor_snapshot.get("bharath_id", item.contractor.bharath_id),
                "contractor_logo": request.build_absolute_uri(profile.company_logo.url) if profile and profile.company_logo else None,
                "contractor_logo_shape": contractor_snapshot.get("company_logo_shape") or (profile.company_logo_shape if profile else "RECTANGLE"),
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
        quotation = Quotation.objects.select_for_update().filter(pk=pk, customer__portal_user=request.user).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        action = str(request.data.get("action") or "").upper()
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
        quotation = Quotation.objects.select_related("customer", "property", "contractor", "contractor__contractor_profile").prefetch_related("items__service_type", "items__paint_type").filter(pk=pk, customer__portal_user=request.user).exclude(status=Quotation.Status.DRAFT).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_quotation_pdf(quotation), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{quotation.quotation_number}.pdf"'
        return response


class CustomerPropertyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        properties = Property.objects.filter(customer__portal_user=request.user).select_related(
            "customer", "contractor", "contractor__contractor_profile", "connection__contractor"
        ).annotate(room_count=models.Count("rooms", distinct=True), surface_count=models.Count("measurement_surfaces", distinct=True)).order_by("-updated_at")
        data = []
        for item in properties:
            contractor = item.contractor or (item.connection.contractor if item.connection_id else item.customer.contractor)
            profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
            data.append({
                "id": item.id, "name": item.name or item.property_type,
                "property_type": item.property_type, "measurement_type": item.measurement_type,
                "flat_number": item.flat_number, "block_name": item.block_name,
                "address": item.address, "city": item.city, "pincode": item.pincode,
                "approximate_area": item.approximate_area,
                "contractor_name": profile.company_name if profile else contractor.get_full_name() or contractor.mobile,
                "rooms": item.room_count, "surfaces": item.surface_count, "updated_at": item.updated_at,
            })
        return Response(data)


class CustomerPropertyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        property_obj = Property.objects.select_related("customer", "contractor", "contractor__contractor_profile", "connection__contractor").filter(
            pk=pk, customer__portal_user=request.user
        ).first()
        if not property_obj:
            return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
        contractor = property_obj.contractor or (property_obj.connection.contractor if property_obj.connection_id else property_obj.customer.contractor)
        profile = contractor.contractor_profile if hasattr(contractor, "contractor_profile") else None
        records = property_obj.measurement_records.filter(
            surfaces__isnull=False
        ).distinct().select_related(
            "contractor", "contractor__contractor_profile"
        ).prefetch_related("surfaces__openings", "rooms").order_by("-measured_on", "-id")
        record_id = request.query_params.get("measurement")
        record = records.filter(id=record_id).first() if record_id else records.first()
        if record_id and not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        rooms = PropertyRoom.objects.filter(property=property_obj, measurement_record=record).order_by("id")
        surfaces = MeasurementSurface.objects.filter(property=property_obj, measurement_record=record).select_related("room").prefetch_related("openings").order_by("room_id", "id")
        return Response({
            "property": {
                "id": property_obj.id, "name": property_obj.name or property_obj.property_type,
                "property_type": property_obj.property_type, "measurement_type": property_obj.measurement_type,
                "flat_number": property_obj.flat_number, "block_name": property_obj.block_name,
                "address": property_obj.address, "city": property_obj.city, "pincode": property_obj.pincode,
                "approximate_area": property_obj.approximate_area,
                "contractor_name": profile.company_name if profile else contractor.get_full_name() or contractor.mobile,
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
        property_obj = Property.objects.select_related("customer").filter(
            pk=pk, customer__portal_user=request.user
        ).first()
        if not property_obj:
            return Response({"detail": "Property not found."}, status=status.HTTP_404_NOT_FOUND)
        record_id = request.query_params.get("measurement")
        record = property_obj.measurement_records.filter(id=record_id).first() if record_id else property_obj.measurement_records.first()
        if record_id and not record:
            return Response({"detail": "Area Calculation record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf = build_measurement_pdf(property_obj, record)
        response = HttpResponse(pdf.getvalue(), content_type="application/pdf")
        filename = record.reference_no if record else f"property-{property_obj.id}"
        response["Content-Disposition"] = f'attachment; filename="{filename}-area-calculation.pdf"'
        return response


class QuotationSubmitView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    def post(self, request, pk):
        quotation = Quotation.objects.select_related("customer").filter(pk=pk, contractor=request.user).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
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
            contractor=self.request.user
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
            raise ValidationError({"customer": "Connect with this customer before creating a quotation."})
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

    def get_queryset(self):

        return Quotation.objects.filter(
            contractor=self.request.user
        )

    def perform_destroy(self, instance):
        if instance.status != Quotation.Status.DRAFT:
            raise ValidationError({
                "quotation": "Submitted quotation versions are preserved and cannot be deleted."
            })
        instance.delete()


class QuotationPdfView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedContractor]

    def get(self, request, pk):
        quotation = Quotation.objects.select_related("customer", "property", "contractor", "contractor__contractor_profile").prefetch_related("items__service_type", "items__paint_type").filter(pk=pk, contractor=request.user).first()
        if not quotation:
            return Response({"detail": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_quotation_pdf(quotation), content_type="application/pdf")
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
                "customer": "Connect with this customer before previewing a quotation."
            })

        with transaction.atomic():
            quotation = serializer.save(
                contractor=request.user,
                connection=connection,
                status=Quotation.Status.DRAFT,
            )
            quotation.quotation_number = "PREVIEW"
            pdf_bytes = build_quotation_pdf(quotation)
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
            raise ValidationError({"customer": "Connect with this customer before creating a quotation."})
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
            if not name or len(key) != 10:
                errors.append({"row": number, "error": "Name and a valid 10-digit mobile are required."})
                continue
            if key in existing:
                skipped += 1
                continue
            status_value = str(row.get("status") or "NEW").strip().upper().replace(" ", "_")
            source_value = str(row.get("source") or "OTHER").strip().upper().replace(" ", "_")
            customer = Customer.objects.create(
                contractor=request.user, name=name, mobile=mobile,
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
        return "".join(character for character in str(value) if character.isdigit())[-10:]

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
            ) | models.Q(
                contractor=self.request.user,
                contractor_connections__isnull=True,
            )
        ).distinct()



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
        quotation = Quotation.objects.select_for_update().select_related("customer", "property").prefetch_related("items__room", "items__service_category", "items__paint_type", "items__paint_brand", "items__unit").filter(pk=request.data.get("quotation"), contractor=request.user).first()
        if not quotation: return Response({"quotation": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        invoice = ensure_invoice_for_quotation(quotation, request.user)
        created = getattr(invoice, "created_flag", False)
        return Response(invoice_payload(invoice), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def ensure_invoice_for_quotation(quotation, contractor):
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


class CustomerInvoiceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        invoices = Invoice.objects.filter(models.Q(quotation__customer__portal_user=request.user, quotation__work_schedule__status="COMPLETED") | models.Q(customer__portal_user=request.user, quotation__isnull=True)).select_related("quotation", "customer", "site_property").distinct()
        return Response([invoice_payload(item) for item in invoices])


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
        response=HttpResponse(build_invoice_pdf(item),content_type="application/pdf");response["Content-Disposition"]=f'attachment; filename="{item.invoice_number}.pdf"';return response


class InvoiceReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, pk):
        item = Invoice.objects.select_related("quotation", "quotation__customer", "customer", "contractor__contractor_profile").filter(pk=pk).filter(models.Q(quotation__work_schedule__status="COMPLETED") | models.Q(quotation__isnull=True)).first()
        allowed = item and (
            item.contractor_id == request.user.id
            or (item.quotation_id and item.quotation.customer.portal_user_id == request.user.id)
            or (item.customer_id and item.customer.portal_user_id == request.user.id)
        )
        if not allowed or item.status == Invoice.Status.CANCELLED or item.amount_paid <= 0:
            return Response({"detail": "Payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item.receipt_number:
            item.receipt_number = f"BPR-{timezone.localdate():%Y%m%d}-{item.id:04d}"
            item.payment_received_at = item.payment_received_at or item.updated_at
            item.save(update_fields=("receipt_number", "payment_received_at", "updated_at"))
        response = HttpResponse(build_invoice_receipt_pdf(item), content_type="application/pdf")
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
        item = Invoice.objects.select_related("quotation", "customer", "site_property", "contractor__contractor_profile").filter(pk=pk).filter(models.Q(quotation__customer__portal_user=request.user, quotation__work_schedule__status="COMPLETED") | models.Q(customer__portal_user=request.user, quotation__isnull=True)).first()
        if not item:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_invoice_pdf(item), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.invoice_number}.pdf"'
        return response


class CustomerInvoiceReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = Invoice.objects.select_related("quotation", "customer", "site_property", "contractor__contractor_profile").filter(pk=pk).filter(models.Q(quotation__customer__portal_user=request.user, quotation__work_schedule__status="COMPLETED") | models.Q(customer__portal_user=request.user, quotation__isnull=True)).first()
        if not item or item.status == Invoice.Status.CANCELLED or item.amount_paid <= 0:
            return Response({"detail": "Payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item.receipt_number:
            item.receipt_number = f"BPR-{timezone.localdate():%Y%m%d}-{item.id:04d}"
            item.payment_received_at = item.payment_received_at or item.updated_at
            item.save(update_fields=("receipt_number", "payment_received_at", "updated_at"))
        response = HttpResponse(build_invoice_receipt_pdf(item), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.receipt_number}.pdf"'
        return response
