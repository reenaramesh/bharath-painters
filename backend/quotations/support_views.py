"""Narrow, audited support tools. Support staff never receive admin privileges."""

from django.conf import settings
from django.core.mail import send_mail
from django.db import models, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import BharathUser
from accounts.mobile import matching_mobile_users, normalize_mobile
from .models import Customer, Invoice, Property, PropertyMeasurement, Quotation, SupportActionLog, SupportTicket


def can_handle_support(user):
    return user.is_superuser or user.role in (BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT)


class SupportAuditView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser and request.user.role != BharathUser.Roles.ADMIN:
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        actions = SupportActionLog.objects.select_related("actor", "ticket").order_by("-created_at")[:100]
        return Response([{
            "id": item.pk, "actor": item.actor.get_full_name() or item.actor.mobile,
            "action": item.action, "target_type": item.target_type, "target_id": item.target_id,
            "ticket_id": item.ticket_id, "reason": item.reason, "created_at": item.created_at,
        } for item in actions])


class SupportSearchView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_search"

    def get(self, request):
        if not can_handle_support(request.user):
            return Response({"detail": "Support access only."}, status=status.HTTP_403_FORBIDDEN)
        query = str(request.query_params.get("q") or "").strip()
        if len(query) < 3 or len(query) > 100:
            return Response({"detail": "Search with at least 3 characters."}, status=status.HTTP_400_BAD_REQUEST)
        normalized_mobile = normalize_mobile(query)
        mobile_matches = {user.pk for user in matching_mobile_users(query)} if normalized_mobile else set()
        users = BharathUser.objects.filter(
            models.Q(mobile__icontains=query) | models.Q(email__icontains=query)
            | models.Q(recovery_email__icontains=query) | models.Q(bharath_id__icontains=query)
            | models.Q(first_name__icontains=query) | models.Q(last_name__icontains=query)
            | models.Q(pk__in=mobile_matches),
        )
        if request.user.role == BharathUser.Roles.SUPPORT:
            users = users.filter(role__in=(BharathUser.Roles.CUSTOMER, BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER))
        users = users.order_by("-id")[:20]
        customer_lookup = (
            models.Q(name__icontains=query) | models.Q(mobile__icontains=query)
            | models.Q(bharath_id__icontains=query) | models.Q(email__icontains=query)
        )
        if normalized_mobile:
            customer_lookup |= models.Q(normalized_mobile=normalized_mobile)
        customers = Customer.objects.filter(customer_lookup).select_related("contractor")[:20]
        quotation_lookup = (
            models.Q(quotation_number__icontains=query) | models.Q(customer__name__icontains=query)
            | models.Q(customer__bharath_id__icontains=query) | models.Q(customer__mobile__icontains=query)
        )
        if normalized_mobile:
            quotation_lookup |= models.Q(customer__normalized_mobile=normalized_mobile)
        quotations = Quotation.objects.filter(quotation_lookup).select_related("customer", "contractor")[:20]
        invoices = Invoice.objects.filter(
            models.Q(invoice_number__icontains=query) | models.Q(customer_name__icontains=query)
            | models.Q(customer_mobile__icontains=query) | models.Q(quotation_number_snapshot__icontains=query),
        ).select_related("contractor")[:20]
        properties = Property.objects.filter(
            models.Q(name__icontains=query) | models.Q(customer__name__icontains=query)
            | models.Q(customer__bharath_id__icontains=query)
            | models.Q(customer__mobile__icontains=query),
        ).select_related("customer")[:20]
        measurements = PropertyMeasurement.objects.filter(
            models.Q(reference_no__icontains=query) | models.Q(property__name__icontains=query)
            | models.Q(property__customer__name__icontains=query)
            | models.Q(property__customer__mobile__icontains=query),
        ).select_related("property")[:20]
        return Response({
            "accounts": [{"id": item.pk, "name": item.get_full_name(), "role": item.role, "mobile": item.mobile,
                          "email": item.email, "bharath_id": item.bharath_id, "active": item.is_active,
                          "email_verified": bool(item.recovery_email_verified and item.recovery_email),
                          "verification_status": item.verification_status,
                          "has_password": item.has_usable_password(),
                          "created_at": item.date_joined} for item in users],
            "customers": [{"id": item.pk, "name": item.name, "bharath_id": item.bharath_id,
                           "mobile": item.mobile, "status": item.status, "contractor": item.contractor.get_full_name()} for item in customers],
            "quotations": [{"id": item.pk, "number": item.quotation_number, "status": item.status,
                            "customer": item.customer.name, "contractor": item.contractor.get_full_name(),
                            "contractor_id": item.contractor_id, "deleted": bool(item.deleted_at),
                            "has_invoice": Invoice.objects.filter(quotation=item).exists()} for item in quotations],
            "invoices": [{"id": item.pk, "number": item.invoice_number, "status": item.status,
                          "customer": item.customer_name, "amount": str(item.grand_total),
                          "paid": str(item.amount_paid)} for item in invoices],
            "properties": [{"id": item.pk, "name": item.name, "customer": item.customer.name} for item in properties],
            "measurements": [{"id": item.pk, "reference": item.reference_no, "status": item.status,
                              "property": item.property.name} for item in measurements],
        })


class SupportActionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_action"

    @transaction.atomic
    def post(self, request):
        if not can_handle_support(request.user):
            return Response({"detail": "Support access only."}, status=status.HTTP_403_FORBIDDEN)
        action = str(request.data.get("action") or "").upper()
        reason = str(request.data.get("reason") or "").strip()
        if len(reason) < 10 or len(reason) > 1000:
            return Response({"reason": "Describe the reason in 10 to 1000 characters."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ticket_id = int(request.data.get("ticket_id"))
            target_id = int(request.data.get("target_id"))
        except (TypeError, ValueError):
            return Response({"detail": "Select a support ticket and record."}, status=status.HTTP_400_BAD_REQUEST)
        ticket = SupportTicket.objects.select_for_update().filter(pk=ticket_id).first()
        allowed_statuses = (SupportTicket.Status.OPEN, SupportTicket.Status.IN_PROGRESS, SupportTicket.Status.NEEDS_ADMIN) if request.user.is_superuser or request.user.role == BharathUser.Roles.ADMIN else (SupportTicket.Status.OPEN, SupportTicket.Status.IN_PROGRESS)
        if not ticket or ticket.status not in allowed_statuses:
            return Response({"detail": "Choose an open support ticket."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "LINK_RECORD":
            target_type = str(request.data.get("target_type") or "").upper()
            target_models = {
                "USER": BharathUser, "CUSTOMER": Customer, "QUOTATION": Quotation,
                "INVOICE": Invoice, "PROPERTY": Property, "MEASUREMENT": PropertyMeasurement,
            }
            model = target_models.get(target_type)
            if not model or not model.objects.filter(pk=target_id).exists():
                return Response({"detail": "The selected record was not found."}, status=status.HTTP_404_NOT_FOUND)
            SupportActionLog.objects.create(actor=request.user, ticket=ticket, action=action, target_type=target_type, target_id=target_id, reason=reason)
            return Response({"message": "Record linked to the support ticket."})

        if action == "SEND_RECOVERY_INSTRUCTIONS":
            user = BharathUser.objects.filter(pk=target_id, is_active=True).first()
            if not user or ticket.requester_id != user.pk:
                return Response({"detail": "The ticket must be raised by this account owner."}, status=status.HTTP_403_FORBIDDEN)
            if not user.recovery_email or not user.recovery_email_verified:
                return Response({"detail": "This account has no verified recovery email."}, status=status.HTTP_400_BAD_REQUEST)
            if not settings.DEBUG and settings.EMAIL_BACKEND in (
                "django.core.mail.backends.console.EmailBackend",
                "django.core.mail.backends.locmem.EmailBackend",
            ):
                return Response({"detail": "Email delivery is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            login_url = settings.FRONTEND_URL
            try:
                send_mail(
                    "Bharath Painters account recovery",
                    f"Support ticket BP-TKT-{ticket.pk:06d}: To reset your password, open {login_url}/forgot-password and follow the steps. Never share your password or OTP with support staff.",
                    settings.DEFAULT_FROM_EMAIL, [user.recovery_email], fail_silently=False,
                )
            except Exception:
                return Response({"detail": "Recovery instructions could not be delivered. Check email delivery settings."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            SupportActionLog.objects.create(actor=request.user, ticket=ticket, action=action, target_type="USER", target_id=user.pk, reason=reason, after={"sent_at": timezone.now().isoformat()})
            return Response({"message": "Recovery instructions sent to the account's verified email."})

        if action in ("RESTORE_DELETED_QUOTATION", "CANCEL_DRAFT_QUOTATION"):
            quotation = Quotation.objects.select_for_update().filter(pk=target_id).first()
            if not quotation or ticket.requester_id != quotation.contractor_id:
                return Response({"detail": "The ticket must be raised by this quotation's contractor."}, status=status.HTTP_403_FORBIDDEN)
            if Invoice.objects.filter(quotation=quotation).exists() or hasattr(quotation, "work_schedule"):
                return Response({"detail": "This quotation has an invoice or schedule and needs administrator review."}, status=status.HTTP_400_BAD_REQUEST)
            before = {"status": quotation.status, "deleted": bool(quotation.deleted_at)}
            if action == "RESTORE_DELETED_QUOTATION" and quotation.status == Quotation.Status.DRAFT and quotation.deleted_at:
                quotation.deleted_at = None
            elif action == "CANCEL_DRAFT_QUOTATION" and quotation.status == Quotation.Status.DRAFT and not quotation.deleted_at:
                quotation.status = Quotation.Status.CANCELLED
            else:
                return Response({"detail": "This action is not available for the quotation's current status."}, status=status.HTTP_400_BAD_REQUEST)
            quotation.save(update_fields=("status", "deleted_at", "updated_at"))
            SupportActionLog.objects.create(actor=request.user, ticket=ticket, action=action, target_type="QUOTATION", target_id=quotation.pk, reason=reason, before=before, after={"status": quotation.status, "deleted": bool(quotation.deleted_at)})
            return Response({"message": f"Quotation {quotation.quotation_number} has been updated."})

        return Response({"action": "This support action is not available."}, status=status.HTTP_400_BAD_REQUEST)
