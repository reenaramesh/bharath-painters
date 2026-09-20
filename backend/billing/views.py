from django.db import models, transaction
from django.db.models import Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
from decimal import Decimal
from calendar import monthrange
from io import BytesIO
from django.http import HttpResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser
from jobs.models import WorkSchedule
from quotations.models import Invoice, InvoicePayment, PortalNotification, ProjectReceipt, Quotation
from quotations.pdf_utils import build_project_receipt_pdf
from .models import Advertisement, BillingNotification, BillingPlan, PackageRequest, Subscription
from .services import billing_summary, plan_data
from .serializers import BillingPlanSerializer


def admin_only(request):
    return request.user.role == BharathUser.Roles.ADMIN


def next_number(prefix, pk):
    return f"{prefix}-{timezone.localdate():%Y%m%d}-{pk:06d}"


def monthly_end(start):
    year, month = (start.year + 1, 1) if start.month == 12 else (start.year, start.month + 1)
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1])) - timedelta(days=1)


def plan_end(start, plan):
    months = {BillingPlan.Validity.ONE_MONTH: 1, BillingPlan.Validity.THREE_MONTHS: 3, BillingPlan.Validity.SIX_MONTHS: 6, BillingPlan.Validity.ONE_YEAR: 12}.get(plan.validity)
    if not months:
        return None
    year = start.year + (start.month - 1 + months) // 12
    month = (start.month - 1 + months) % 12 + 1
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1])) - timedelta(days=1)


def months_end(start, months):
    year = start.year + (start.month - 1 + months) // 12
    month = (start.month - 1 + months) % 12 + 1
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1])) - timedelta(days=1)


def request_data(item):
    return {"id": item.id, "plan_id": item.plan_id, "plan_name": item.plan.name, "audience": item.plan.audience, "billing_cycle": item.plan.billing_cycle, "status": item.status, "requested_at": item.requested_at, "start_date": item.requested_start_date, "end_date": item.requested_end_date, "duration_months": item.duration_months, "amount": item.amount, "payment_status": item.payment_status, "payment_mode": item.payment_mode, "payment_reference": item.payment_reference, "payment_note": item.payment_note, "invoice_number": item.invoice_number, "receipt_number": item.receipt_number, "is_renewal": item.is_renewal, "admin_note": item.admin_note}


def activate_request(item, reviewer=None):
    item.requested_start_date = item.requested_start_date or timezone.localdate()
    if not item.requested_end_date:
        item.requested_end_date = plan_end(item.requested_start_date, item.plan)
    if item.requested_start_date <= timezone.localdate():
        Subscription.objects.filter(user=item.user, is_active=True).update(is_active=False, cancelled_at=timezone.now())
    subscription = Subscription.objects.create(user=item.user, plan=item.plan, start_date=item.requested_start_date, end_date=item.requested_end_date, is_active=True, activated_at=timezone.now())
    item.subscription = subscription; item.status = PackageRequest.Status.APPROVED; item.reviewed_at = timezone.now(); item.reviewed_by = reviewer
    if item.amount > 0:
        item.payment_status = PackageRequest.PaymentStatus.CONFIRMED; item.payment_confirmed_at = timezone.now(); item.receipt_number = item.receipt_number or next_number("BPR", item.id)
    item.save()
    BillingNotification.objects.create(user=item.user, title="Package activated", message=f"{item.plan.name} is active from {item.requested_start_date} to {item.requested_end_date or 'ongoing'}.")
    return subscription


class MyBillingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(billing_summary(request.user))


class PlanListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        audience = request.user.role
        if audience == BharathUser.Roles.ADMIN:
            return Response([plan_data(plan) for plan in BillingPlan.objects.all()])
        if audience not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER}:
            return Response([])
        return Response([plan_data(plan) for plan in BillingPlan.objects.filter(audience=audience, is_active=True)])

    def post(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        serializer = BillingPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PlanDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        return BillingPlan.objects.filter(pk=pk).first()

    def patch(self, request, pk):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        plan = self.get_object(pk)
        if not plan:
            return Response({"detail": "Package not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BillingPlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        plan = self.get_object(pk)
        if not plan:
            return Response({"detail": "Package not found."}, status=status.HTTP_404_NOT_FOUND)
        if plan.subscriptions.exists():
            plan.is_active = False
            plan.save(update_fields=["is_active", "updated_at"])
            return Response({"detail": "Package has subscriptions, so it was deactivated instead of deleted."})
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PackageAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        users = BharathUser.objects.filter(
            role__in=[BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER], is_active=True,
        ).select_related("contractor_profile").order_by("role", "first_name", "mobile")
        rows = []
        for user in users:
            summary = billing_summary(user)
            latest_subscription = Subscription.objects.select_related("plan").filter(user=user).order_by("-created_at").first()
            active_subscription = summary["subscription"]
            if active_subscription and summary["plan"] and float(summary["plan"]["price"]) > 0:
                membership_status = "ACTIVE_PAID"
            elif latest_subscription and not latest_subscription.is_active:
                membership_status = "INACTIVE"
            else:
                membership_status = "FREE"
            company_name = user.contractor_profile.company_name if user.role == BharathUser.Roles.CONTRACTOR and hasattr(user, "contractor_profile") else ""
            rows.append({
                "id": user.id, "name": company_name or user.get_full_name() or user.mobile,
                "mobile": user.mobile, "bharath_id": user.bharath_id, "role": user.role,
                "plan": summary["plan"], "subscription": active_subscription,
                "membership_status": membership_status,
                "latest_subscription": None if not latest_subscription else {
                    "id": latest_subscription.id, "plan_name": latest_subscription.plan.name,
                    "start_date": latest_subscription.start_date, "end_date": latest_subscription.end_date,
                    "is_active": latest_subscription.is_active,
                },
            })
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        user = BharathUser.objects.filter(
            pk=request.data.get("user_id"), role__in=[BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER], is_active=True,
        ).first()
        plan = BillingPlan.objects.filter(pk=request.data.get("plan_id"), is_active=True).first()
        if not user:
            return Response({"user_id": "Select a valid Contractor or Paint Applicator."}, status=status.HTTP_400_BAD_REQUEST)
        if not plan:
            return Response({"plan_id": "Select an active package."}, status=status.HTTP_400_BAD_REQUEST)
        if plan.audience != user.role:
            return Response({"plan_id": "This package is not available for the selected user's portal."}, status=status.HTTP_400_BAD_REQUEST)
        from django.utils.dateparse import parse_date
        start_date = parse_date(str(request.data.get("start_date") or "")) or timezone.localdate()
        end_date = parse_date(str(request.data.get("end_date") or "")) or None
        if not end_date:
            end_date = plan_end(start_date, plan)
        if plan.validity == BillingPlan.Validity.CUSTOM_DATES and not end_date:
            return Response({"end_date": "Expiry date is required for a custom-date package."}, status=status.HTTP_400_BAD_REQUEST)
        if end_date and end_date < start_date:
            return Response({"end_date": "Expiry date cannot be before the start date."}, status=status.HTTP_400_BAD_REQUEST)
        Subscription.objects.filter(user=user, is_active=True).update(is_active=False)
        subscription = Subscription.objects.create(user=user, plan=plan, start_date=start_date, end_date=end_date, is_active=True)
        return Response({
            "message": f"{plan.name} assigned to {user.get_full_name() or user.mobile}.",
            "subscription_id": subscription.id,
        }, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def patch(self, request, pk):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        subscription = Subscription.objects.select_related("user", "plan").filter(pk=pk).first()
        if not subscription:
            return Response({"detail": "User subscription not found."}, status=status.HTTP_404_NOT_FOUND)
        plan = BillingPlan.objects.filter(pk=request.data.get("plan_id") or subscription.plan_id).first()
        if not plan or plan.audience != subscription.user.role:
            return Response({"plan_id": "Select a package for this user's portal."}, status=status.HTTP_400_BAD_REQUEST)
        start_date = parse_date(str(request.data.get("start_date") or subscription.start_date))
        supplied_end = request.data.get("end_date", subscription.end_date)
        end_date = parse_date(str(supplied_end)) if supplied_end else None
        if not end_date and plan.validity != BillingPlan.Validity.CUSTOM_DATES:
            end_date = plan_end(start_date, plan)
        if plan.validity == BillingPlan.Validity.CUSTOM_DATES and not end_date:
            return Response({"end_date": "Expiry date is required for a custom-date package."}, status=status.HTTP_400_BAD_REQUEST)
        if end_date and end_date < start_date:
            return Response({"end_date": "Expiry date cannot be before the start date."}, status=status.HTTP_400_BAD_REQUEST)
        subscription.plan = plan
        subscription.start_date = start_date
        subscription.end_date = end_date
        subscription.is_active = bool(request.data.get("is_active", subscription.is_active))
        subscription.cancelled_at = None if subscription.is_active else timezone.now()
        subscription.save()
        return Response({"message": f"{plan.name} subscription updated.", "subscription_id": subscription.id})


class ContractorPackageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER}:
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            "current": billing_summary(request.user),
            "plans": [plan_data(plan) for plan in BillingPlan.objects.filter(audience=request.user.role, is_active=True)],
            "requests": [request_data(item) for item in PackageRequest.objects.filter(user=request.user).select_related("plan")[:20]],
        })

    @transaction.atomic
    def post(self, request):
        if request.user.role not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER}:
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        plan = BillingPlan.objects.filter(pk=request.data.get("plan_id"), audience=request.user.role, is_active=True).first()
        if not plan:
            return Response({"plan_id": "Select an active package for your portal."}, status=status.HTTP_400_BAD_REQUEST)
        if PackageRequest.objects.filter(user=request.user, plan=plan, status__in=[PackageRequest.Status.PENDING, PackageRequest.Status.AWAITING_PAYMENT, PackageRequest.Status.PAYMENT_SUBMITTED]).exists():
            return Response({"detail": "Your request for this package is already pending."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            duration_months = int(request.data.get("duration_months", 1))
        except (TypeError, ValueError):
            duration_months = 0
        if duration_months < 1 or duration_months > 12:
            return Response({"duration_months": "Choose between 1 and 12 months."}, status=status.HTTP_400_BAD_REQUEST)
        start_date = timezone.localdate()
        end_date = months_end(start_date, duration_months)
        is_renewal = Subscription.objects.filter(user=request.user, plan=plan).exists()
        amount = plan.discounted_price * duration_months
        paid = amount > 0
        item = PackageRequest.objects.create(user=request.user, plan=plan, requested_start_date=start_date, requested_end_date=end_date, duration_months=duration_months, amount=amount, is_renewal=is_renewal, status=PackageRequest.Status.AWAITING_PAYMENT if paid else PackageRequest.Status.PENDING, payment_status=PackageRequest.PaymentStatus.AWAITING if paid else PackageRequest.PaymentStatus.NOT_REQUIRED)
        item.invoice_number = next_number("BPI", item.id); item.save(update_fields=["invoice_number"])
        if plan.billing_cycle == BillingPlan.Cycle.FREE and plan.price == 0:
            activate_request(item)
            return Response({"message": f"{plan.name} is now active.", "status": item.status}, status=status.HTTP_201_CREATED)
        if paid:
            return Response({"message": "Package selected. Submit payment details for admin confirmation.", "status": item.status, "request": request_data(item)}, status=status.HTTP_201_CREATED)
        return Response({"message": "Package registration sent to admin for approval.", "status": item.status, "request": request_data(item)}, status=status.HTTP_201_CREATED)


class PackagePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = PackageRequest.objects.filter(pk=pk, user=request.user, status__in=[PackageRequest.Status.AWAITING_PAYMENT, PackageRequest.Status.PAYMENT_SUBMITTED]).first()
        if not item:
            return Response({"detail": "Awaiting-payment package request not found."}, status=status.HTTP_404_NOT_FOUND)
        mode = str(request.data.get("payment_mode") or "").upper(); reference = str(request.data.get("payment_reference") or "").strip()
        if mode not in {"UPI", "BANK_TRANSFER", "CASH", "CARD", "OTHER"}:
            return Response({"payment_mode": "Choose UPI, bank transfer, cash, card, or other."}, status=status.HTTP_400_BAD_REQUEST)
        if mode != "CASH" and not reference:
            return Response({"payment_reference": "Payment reference is required."}, status=status.HTTP_400_BAD_REQUEST)
        item.payment_mode = mode; item.payment_reference = reference; item.payment_note = str(request.data.get("payment_note") or "").strip(); item.payment_status = PackageRequest.PaymentStatus.SUBMITTED; item.status = PackageRequest.Status.PAYMENT_SUBMITTED; item.payment_submitted_at = timezone.now(); item.save()
        BillingNotification.objects.create(user=request.user, title="Payment submitted", message=f"Payment for {item.plan.name} is waiting for admin confirmation.")
        return Response({"message": "Payment submitted for confirmation.", "request": request_data(item)})


class BillingDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        query = PackageRequest.objects.select_related("plan", "user").filter(pk=pk)
        item = query.first() if admin_only(request) else query.filter(user=request.user).first()
        if not item:
            return Response({"detail": "Billing document not found."}, status=status.HTTP_404_NOT_FOUND)
        is_receipt = item.payment_status == PackageRequest.PaymentStatus.CONFIRMED
        buffer = BytesIO(); pdf = canvas.Canvas(buffer, pagesize=A4); pdf.setTitle(item.receipt_number if is_receipt else item.invoice_number)
        pdf.setFont("Helvetica-Bold", 18); pdf.drawString(50, 790, "BHARATH PAINTERS"); pdf.setFont("Helvetica-Bold", 14); pdf.drawString(50, 755, "PAYMENT RECEIPT" if is_receipt else "PACKAGE INVOICE")
        lines = [("Document no.", item.receipt_number if is_receipt else item.invoice_number), ("Customer", item.user.get_full_name() or item.user.mobile), ("Mobile", item.user.mobile), ("Package", item.plan.name), ("Period", f"{item.requested_start_date} to {item.requested_end_date or 'Ongoing'}"), ("Amount", f"INR {item.amount}"), ("Payment status", item.get_payment_status_display()), ("Payment mode", item.payment_mode or "Pending"), ("Reference", item.payment_reference or "-")]
        y=710; pdf.setFont("Helvetica", 11)
        for label,value in lines: pdf.drawString(50,y,f"{label}: {value}"); y-=28
        pdf.drawString(50, y-20, "This is a computer-generated document."); pdf.showPage(); pdf.save(); buffer.seek(0)
        response=HttpResponse(buffer.getvalue(),content_type="application/pdf"); response["Content-Disposition"]=f'attachment; filename="{item.receipt_number if is_receipt else item.invoice_number}.pdf"'; return response


class AdminPackageRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        items = PackageRequest.objects.select_related("user", "user__contractor_profile", "plan").all()
        return Response([{**request_data(item), "contractor": item.user.contractor_profile.company_name if hasattr(item.user, "contractor_profile") and item.user.contractor_profile.company_name else item.user.get_full_name() or item.user.mobile, "role": item.user.role, "mobile": item.user.mobile, "bharath_id": item.user.bharath_id} for item in items])

    @transaction.atomic
    def patch(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        item = PackageRequest.objects.select_related("plan", "user").filter(pk=request.data.get("request_id"), status__in=[PackageRequest.Status.PENDING, PackageRequest.Status.PAYMENT_SUBMITTED]).first()
        if not item:
            return Response({"detail": "Pending request not found."}, status=status.HTTP_404_NOT_FOUND)
        decision = str(request.data.get("decision") or "").upper()
        if decision not in {PackageRequest.Status.APPROVED, PackageRequest.Status.REJECTED}:
            return Response({"decision": "Choose APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)
        if decision == PackageRequest.Status.APPROVED:
            if item.amount > 0 and item.payment_status != PackageRequest.PaymentStatus.SUBMITTED:
                return Response({"detail": "Payment must be submitted before approval."}, status=status.HTTP_400_BAD_REQUEST)
            item.admin_note = str(request.data.get("admin_note") or "").strip()
            activate_request(item, request.user)
        else:
            item.status = decision; item.admin_note = str(request.data.get("admin_note") or "").strip(); item.reviewed_by = request.user; item.reviewed_at = timezone.now(); item.save()
            item.payment_status = PackageRequest.PaymentStatus.REJECTED if item.amount > 0 else item.payment_status; item.save(update_fields=["payment_status"])
            BillingNotification.objects.create(user=item.user, title="Package request rejected", message=item.admin_note or f"Your request for {item.plan.name} was rejected.")
        return Response({"message": f"Package request {decision.lower()}."})


class BillingNotificationView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        BillingNotification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"message": "Billing notifications marked as read."})


class AdminRevenueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not admin_only(request):
            return Response({"detail": "Admin access only."}, status=status.HTTP_403_FORBIDDEN)
        confirmed = PackageRequest.objects.filter(payment_status=PackageRequest.PaymentStatus.CONFIRMED).select_related("user", "user__contractor_profile", "plan")
        years = list(confirmed.filter(payment_confirmed_at__isnull=False).dates("payment_confirmed_at", "year", order="DESC"))
        try:
            year = int(request.query_params.get("year") or timezone.localdate().year)
        except ValueError:
            year = timezone.localdate().year
        try:
            month = int(request.query_params.get("month") or 0)
        except ValueError:
            month = 0
        filtered = confirmed.filter(payment_confirmed_at__year=year)
        if 1 <= month <= 12:
            filtered = filtered.filter(payment_confirmed_at__month=month)
        monthly = confirmed.filter(payment_confirmed_at__year=year).annotate(period=TruncMonth("payment_confirmed_at")).values("period").annotate(total=Sum("amount")).order_by("period")
        modes = filtered.values("payment_mode").annotate(total=Sum("amount")).order_by("-total")
        transactions = []
        for item in filtered.order_by("-payment_confirmed_at"):
            company = item.user.contractor_profile.company_name if hasattr(item.user, "contractor_profile") else ""
            transactions.append({"id": item.id, "date": item.payment_confirmed_at, "receipt_number": item.receipt_number, "user": company or item.user.get_full_name() or item.user.mobile, "role": item.user.role, "bharath_id": item.user.bharath_id, "mobile": item.user.mobile, "plan": item.plan.name, "months": item.duration_months, "mode": item.payment_mode or "OTHER", "reference": item.payment_reference, "amount": item.amount})
        return Response({
            "year": year, "month": month,
            "available_years": [value.year for value in years] or [timezone.localdate().year],
            "total": filtered.aggregate(value=Sum("amount"))["value"] or 0,
            "payments_count": filtered.count(),
            "monthly": [{"month": row["period"].month, "total": row["total"]} for row in monthly],
            "payment_modes": [{"mode": row["payment_mode"] or "OTHER", "total": row["total"]} for row in modes],
            "transactions": transactions,
        })


class ContractorRevenueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        try:
            year = int(request.query_params.get("year") or timezone.localdate().year)
            month = int(request.query_params.get("month") or 0)
        except ValueError:
            return Response({"detail": "Select a valid year and month."}, status=status.HTTP_400_BAD_REQUEST)
        advances = WorkSchedule.objects.filter(
            quotation__contractor=request.user,
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED,
            advance_amount__gt=0,
        ).select_related("quotation__customer", "quotation__property")
        manual_receipts = ProjectReceipt.objects.filter(contractor=request.user).select_related("quotation__customer", "quotation__property")
        invoice_payments = InvoicePayment.objects.filter(
            invoice__contractor=request.user,
            invoice__quotation__work_schedule__status=WorkSchedule.Status.COMPLETED,
        ).exclude(Q(notes__startswith="Advance payment (schedule #") | Q(notes__startswith="Quotation receipt (")).select_related("invoice", "invoice__quotation__customer")
        invoices = Invoice.objects.filter(
            contractor=request.user,
            quotation__work_schedule__status=WorkSchedule.Status.COMPLETED,
        ).exclude(status=Invoice.Status.CANCELLED).select_related("quotation__customer")
        years = set(value.year for value in advances.filter(payment_confirmed_at__isnull=False).dates("payment_confirmed_at", "year"))
        years.update(value.year for value in manual_receipts.dates("received_date", "year"))
        years.update(value.year for value in invoice_payments.dates("received_date", "year"))
        years.update(value.year for value in invoices.dates("invoice_date", "year"))
        filtered_advances = advances.filter(payment_confirmed_at__year=year)
        filtered_manual = manual_receipts.filter(received_date__year=year)
        filtered_payments = invoice_payments.filter(received_date__year=year)
        filtered_invoices = invoices.filter(invoice_date__year=year)
        if 1 <= month <= 12:
            filtered_advances = filtered_advances.filter(payment_confirmed_at__month=month)
            filtered_manual = filtered_manual.filter(received_date__month=month)
            filtered_payments = filtered_payments.filter(received_date__month=month)
            filtered_invoices = filtered_invoices.filter(invoice_date__month=month)
        advance_total = filtered_advances.aggregate(value=Sum("advance_amount"))["value"] or Decimal("0")
        manual_total = filtered_manual.aggregate(value=Sum("amount"))["value"] or Decimal("0")
        invoice_payment_total = filtered_payments.aggregate(value=Sum("amount"))["value"] or Decimal("0")
        invoice_total = filtered_invoices.aggregate(value=Sum("grand_total"))["value"] or Decimal("0")
        outstanding = filtered_invoices.aggregate(value=Sum("grand_total") - Sum("amount_paid"))["value"] or Decimal("0")
        credit_total = filtered_advances.exclude(status=WorkSchedule.Status.COMPLETED).aggregate(value=Sum("advance_amount"))["value"] or Decimal("0")
        credit_total += filtered_manual.exclude(quotation__work_schedule__status=WorkSchedule.Status.COMPLETED).aggregate(value=Sum("amount"))["value"] or Decimal("0")
        receipts = []
        for item in filtered_advances.order_by("-payment_confirmed_at"):
            receipts.append({
                "id": f"advance-{item.id}", "kind": "ADVANCE", "date": item.payment_confirmed_at,
                "receipt_number": item.advance_receipt_number, "customer": item.quotation.customer.name,
                "project": item.quotation.property.name or item.quotation.property.property_type,
                "document": item.quotation.quotation_number, "mode": item.payment_mode or "OTHER",
                "reference": item.payment_reference, "amount": item.advance_amount,
                "download_url": f"/jobs/work-schedules/{item.id}/advance-receipt/",
            })
        for item in filtered_manual.order_by("-received_date", "-id"):
            receipts.append({
                "id": f"quotation-{item.id}", "kind": "QUOTATION RECEIPT", "date": item.received_date,
                "receipt_number": item.receipt_number, "customer": item.quotation.customer.name,
                "project": item.quotation.property.name or item.quotation.property.property_type,
                "document": item.quotation.quotation_number, "mode": item.payment_mode,
                "reference": item.payment_reference, "amount": item.amount,
                "download_url": f"/billing/contractor-revenue/receipts/{item.id}/pdf/",
            })
        for item in filtered_payments.order_by("-received_date", "-id"):
            receipts.append({
                "id": f"invoice-{item.id}", "kind": "INVOICE PAYMENT", "date": item.received_date,
                "receipt_number": item.invoice.receipt_number, "customer": item.invoice.customer_name,
                "project": item.invoice.property_name, "document": item.invoice.invoice_number,
                "mode": item.payment_mode or "OTHER", "reference": item.payment_reference,
                "amount": item.amount, "download_url": f"/quotations/invoices/{item.invoice_id}/receipt/",
            })
        invoice_rows = [{
            "id": item.id, "invoice_number": item.invoice_number, "date": item.invoice_date,
            "customer": item.customer_name, "project": item.property_name, "status": item.status,
            "total": item.grand_total, "paid": item.amount_paid, "balance": item.balance_due,
        } for item in filtered_invoices.order_by("-invoice_date", "-id")]
        due_map = {}
        for item in invoices.filter(grand_total__gt=models.F("amount_paid")):
            customer = item.quotation.customer
            key = customer.id
            row = due_map.setdefault(key, {
                "customer_id": customer.id, "customer": customer.name, "mobile": customer.mobile,
                "bharath_id": customer.bharath_id, "invoice_count": 0, "billed": Decimal("0"),
                "received": Decimal("0"), "due": Decimal("0"), "invoices": [], "projects": [],
            })
            row["invoice_count"] += 1; row["billed"] += item.grand_total; row["received"] += item.amount_paid; row["due"] += item.balance_due
            row["invoices"].append(item.invoice_number)
            if item.property_name and item.property_name not in row["projects"]:
                row["projects"].append(item.property_name)
        open_invoices = [{
            "id": item.id, "number": item.invoice_number, "customer": item.customer_name,
            "project": item.property_name, "total": item.grand_total, "paid": item.amount_paid,
            "balance": item.balance_due,
        } for item in invoices.filter(grand_total__gt=models.F("amount_paid")).order_by("-invoice_date", "-id")]
        return Response({
            "year": year, "month": month, "available_years": sorted(years, reverse=True) or [timezone.localdate().year],
            "total_collected": advance_total + manual_total + invoice_payment_total, "advance_received": advance_total + manual_total,
            "invoice_payments": invoice_payment_total, "invoices_raised": invoice_total,
            "outstanding": max(outstanding, Decimal("0")), "credits": credit_total,
            "receipts_count": len(receipts), "invoices_count": len(invoice_rows),
            "receipts": sorted(receipts, key=lambda row: str(row["date"]), reverse=True), "invoices": invoice_rows,
            "quotations": contractor_receipt_quotations(request.user),
            "open_invoices": open_invoices,
            "customer_dues": sorted(due_map.values(), key=lambda row: row["due"], reverse=True),
        })


def contractor_receipt_quotations(contractor):
    quotations = Quotation.objects.filter(
        contractor=contractor,
        status__in=(Quotation.Status.ACCEPTED, Quotation.Status.SCHEDULED, Quotation.Status.IN_PROGRESS, Quotation.Status.COMPLETED),
    ).select_related("customer", "property").prefetch_related("project_receipts")
    rows = []
    for quotation in quotations.order_by("-updated_at"):
        received = quotation.project_receipts.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        schedule = getattr(quotation, "work_schedule", None)
        if schedule and schedule.payment_status == WorkSchedule.PaymentStatus.CONFIRMED:
            received += schedule.advance_amount or Decimal("0")
        rows.append({
            "id": quotation.id, "number": quotation.quotation_number, "customer": quotation.customer.name,
            "project": quotation.property.name or quotation.property.property_type,
            "total": quotation.grand_total, "received": received,
            "balance": max(quotation.grand_total - received, Decimal("0")),
        })
    return rows


class ContractorProjectReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        document_type = str(request.data.get("document_type") or "QUOTATION").upper()
        if document_type == "INVOICE":
            invoice = Invoice.objects.select_for_update().select_related("quotation__customer").filter(
                pk=request.data.get("invoice"), contractor=request.user,
                quotation__work_schedule__status=WorkSchedule.Status.COMPLETED,
            ).exclude(status=Invoice.Status.CANCELLED).first()
            if not invoice:
                return Response({"invoice": "Select an active final invoice."}, status=status.HTTP_400_BAD_REQUEST)
            return record_invoice_receipt(request, invoice)
        quotation = Quotation.objects.select_for_update().select_related("customer", "property").filter(
            pk=request.data.get("quotation"), contractor=request.user,
            status__in=(Quotation.Status.ACCEPTED, Quotation.Status.SCHEDULED, Quotation.Status.IN_PROGRESS, Quotation.Status.COMPLETED),
        ).first()
        if not quotation:
            return Response({"quotation": "Select an active quotation."}, status=status.HTTP_400_BAD_REQUEST)
        schedule = getattr(quotation, "work_schedule", None)
        if hasattr(quotation, "invoice") and schedule and schedule.status == WorkSchedule.Status.COMPLETED:
            return Response({"quotation": "The final invoice already exists. Record this payment inside the invoice."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get("amount") or 0))
        except Exception:
            amount = Decimal("0")
        if amount <= 0:
            return Response({"amount": "Enter an amount greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
        received = quotation.project_receipts.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        if schedule and schedule.payment_status == WorkSchedule.PaymentStatus.CONFIRMED:
            received += schedule.advance_amount or Decimal("0")
        if received + amount > quotation.grand_total:
            return Response({"amount": f"Payment cannot exceed the quotation balance of {max(quotation.grand_total - received, Decimal('0'))}."}, status=status.HTTP_400_BAD_REQUEST)
        mode = str(request.data.get("payment_mode") or "").upper()
        if mode not in ProjectReceipt.PaymentMode.values:
            return Response({"payment_mode": "Select a valid payment mode."}, status=status.HTTP_400_BAD_REQUEST)
        reference = str(request.data.get("payment_reference") or "").strip()
        if mode != ProjectReceipt.PaymentMode.CASH and not reference:
            return Response({"payment_reference": "Enter the transaction, cheque or payment reference."}, status=status.HTTP_400_BAD_REQUEST)
        received_date = parse_date(str(request.data.get("received_date") or "")) or timezone.localdate()
        if received_date > timezone.localdate():
            return Response({"received_date": "Payment date cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST)
        receipt = ProjectReceipt.objects.create(
            contractor=request.user, quotation=quotation, receipt_number=f"TMP-{timezone.now().timestamp()}",
            received_date=received_date, amount=amount, payment_mode=mode,
            payment_reference=reference, notes=str(request.data.get("notes") or "").strip(),
        )
        receipt.receipt_number = f"PR-{received_date:%Y%m%d}-{receipt.id:05d}"
        receipt.save(update_fields=("receipt_number", "updated_at"))
        customer_user = quotation.customer.portal_user
        if customer_user:
            PortalNotification.objects.create(recipient=customer_user, actor=request.user, event_type="PAYMENT", title="Payment receipt generated", message=f"{receipt.receipt_number}: {quotation.quotation_number} payment received.", link="/work-schedules")
        return Response({"id": receipt.id, "receipt_number": receipt.receipt_number}, status=status.HTTP_201_CREATED)


def record_invoice_receipt(request, invoice):
    try:
        amount = Decimal(str(request.data.get("amount") or 0))
    except Exception:
        amount = Decimal("0")
    if amount <= 0:
        return Response({"amount": "Enter an amount greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
    if amount > invoice.balance_due:
        return Response({"amount": f"Payment cannot exceed the invoice balance of {invoice.balance_due}."}, status=status.HTTP_400_BAD_REQUEST)
    mode = str(request.data.get("payment_mode") or "").upper()
    if mode not in Invoice.PaymentMode.values:
        return Response({"payment_mode": "Select a valid payment mode."}, status=status.HTTP_400_BAD_REQUEST)
    reference = str(request.data.get("payment_reference") or "").strip()
    if mode != Invoice.PaymentMode.CASH and not reference:
        return Response({"payment_reference": "Enter the transaction, cheque or payment reference."}, status=status.HTTP_400_BAD_REQUEST)
    received_date = parse_date(str(request.data.get("received_date") or "")) or timezone.localdate()
    if received_date > timezone.localdate():
        return Response({"received_date": "Payment date cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST)
    InvoicePayment.objects.create(
        invoice=invoice, received_date=received_date, amount=amount, payment_mode=mode,
        payment_reference=reference, notes=str(request.data.get("notes") or "").strip(),
    )
    from quotations.views import sync_invoice_payments
    sync_invoice_payments(invoice)
    return Response({
        "id": invoice.id, "receipt_number": invoice.receipt_number,
        "download_url": f"/quotations/invoices/{invoice.id}/receipt/",
    }, status=status.HTTP_201_CREATED)


class ContractorProjectReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        receipt = ProjectReceipt.objects.select_related("quotation__customer", "quotation__property", "contractor__contractor_profile").filter(pk=pk, contractor=request.user).first()
        if not receipt:
            return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_project_receipt_pdf(receipt), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{receipt.receipt_number}.pdf"'
        return response


class CustomerProjectFinanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response({"detail": "Customer access only."}, status=status.HTTP_403_FORBIDDEN)
        advances = WorkSchedule.objects.filter(
            quotation__customer__portal_user=request.user,
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED,
        ).select_related("quotation", "quotation__property", "quotation__contractor")
        quotation_receipts = ProjectReceipt.objects.filter(
            quotation__customer__portal_user=request.user,
        ).select_related("quotation", "quotation__property", "quotation__contractor")
        invoices = Invoice.objects.filter(
            quotation__customer__portal_user=request.user,
            quotation__work_schedule__status=WorkSchedule.Status.COMPLETED,
        ).exclude(status=Invoice.Status.CANCELLED).select_related("quotation", "contractor")
        invoice_payments = InvoicePayment.objects.filter(
            invoice__in=invoices,
        ).exclude(
            Q(notes__startswith="Advance payment (schedule #") |
            Q(notes__startswith="Quotation receipt (")
        ).select_related("invoice", "invoice__quotation__property", "invoice__contractor")

        receipts = []
        for item in advances.order_by("-payment_confirmed_at"):
            receipts.append({
                "id": f"advance-{item.id}", "date": item.payment_confirmed_at,
                "receipt_number": item.advance_receipt_number, "kind": "ADVANCE",
                "contractor": item.quotation.contractor.get_full_name() or item.quotation.contractor.mobile,
                "project": item.quotation.property.name or item.quotation.property.property_type,
                "document": item.quotation.quotation_number, "mode": item.payment_mode or "OTHER",
                "reference": item.payment_reference, "amount": item.advance_amount,
                "download_url": f"/jobs/work-schedules/{item.id}/advance-receipt/",
            })
        for item in quotation_receipts.order_by("-received_date", "-id"):
            receipts.append({
                "id": f"quotation-{item.id}", "date": item.received_date,
                "receipt_number": item.receipt_number, "kind": "QUOTATION RECEIPT",
                "contractor": item.quotation.contractor.get_full_name() or item.quotation.contractor.mobile,
                "project": item.quotation.property.name or item.quotation.property.property_type,
                "document": item.quotation.quotation_number, "mode": item.payment_mode,
                "reference": item.payment_reference, "amount": item.amount,
                "download_url": f"/billing/customer-finance/receipts/{item.id}/pdf/",
            })
        for item in invoice_payments.order_by("-received_date", "-id"):
            receipts.append({
                "id": f"invoice-{item.id}", "date": item.received_date,
                "receipt_number": item.invoice.receipt_number, "kind": "INVOICE PAYMENT",
                "contractor": item.invoice.contractor.get_full_name() or item.invoice.contractor.mobile,
                "project": item.invoice.property_name, "document": item.invoice.invoice_number,
                "mode": item.payment_mode, "reference": item.payment_reference, "amount": item.amount,
                "download_url": f"/quotations/customer-portal/invoices/{item.invoice_id}/receipt/",
            })

        billed = invoices.aggregate(value=Sum("grand_total"))["value"] or Decimal("0")
        invoice_paid = invoices.aggregate(value=Sum("amount_paid"))["value"] or Decimal("0")
        due = sum((item.balance_due for item in invoices), Decimal("0"))
        unadjusted_advances = advances.filter(quotation__invoice__isnull=True).aggregate(value=Sum("advance_amount"))["value"] or Decimal("0")
        unadjusted_receipts = quotation_receipts.filter(quotation__invoice__isnull=True).aggregate(value=Sum("amount"))["value"] or Decimal("0")
        credits = unadjusted_advances + unadjusted_receipts
        return Response({
            "total_billed": billed, "total_paid": invoice_paid + credits,
            "balance_due": due, "advance_credit": credits,
            "receipts_count": len(receipts),
            "receipts": sorted(receipts, key=lambda row: str(row["date"]), reverse=True),
        })


class CustomerProjectReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        receipt = ProjectReceipt.objects.select_related(
            "quotation__customer", "quotation__property", "contractor__contractor_profile",
        ).filter(pk=pk, quotation__customer__portal_user=request.user).first()
        if not receipt:
            return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_project_receipt_pdf(receipt), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{receipt.receipt_number}.pdf"'
        return response


class AdvertisementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CUSTOMER:
            return Response([])
        today = timezone.localdate()
        ads = Advertisement.objects.filter(is_active=True).filter(
            Q(start_date__isnull=True) | Q(start_date__lte=today),
            Q(end_date__isnull=True) | Q(end_date__gte=today),
        )
        return Response([{
            "id": ad.id, "title": ad.title, "description": ad.description,
            "image_url": ad.image_url, "target_url": ad.target_url, "placement": ad.placement,
        } for ad in ads])
