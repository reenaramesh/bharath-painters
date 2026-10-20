"""Owned, read-only action queues; mutations stay in their existing workflows."""
from decimal import Decimal

from django.db.models import DecimalField, Exists, F, OuterRef, Q, Sum, Value
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser
from call_inbox.models import BlockedCaller, CallInboxEvent
from jobs.models import WorkSchedule
from outsourcing.dashboard import subcontract_attention
from .models import Invoice, ProjectReceipt, Quotation

PAGE_SIZE = 6


def money(value):
    return format(value or Decimal("0"), ".2f")


def project_summary(quotation):
    return {"quotation": quotation.pk, "number": quotation.quotation_number,
            "customer_name": quotation.customer.name, "property_name": quotation.property.name,
            "amount": money(quotation.grand_total)}


def finance_attention(contractor, today, offset):
    invoices = Invoice.objects.filter(contractor=contractor).filter(
        Q(quotation__work_schedule__status="COMPLETED") | Q(quotation__isnull=True),
    ).exclude(status=Invoice.Status.CANCELLED).annotate(remaining=Greatest(
        F("grand_total") - F("amount_paid"), Value(Decimal("0")),
        output_field=DecimalField(max_digits=16, decimal_places=2),
    ))
    overdue = invoices.filter(remaining__gt=0, due_date__lt=today).order_by("due_date", "id")
    advances = WorkSchedule.objects.filter(
        quotation__contractor=contractor, quotation__deleted_at__isnull=True,
        status__in=("PENDING", "CONFIRMED", "IN_PROGRESS"), advance_amount__gt=0,
    )
    return {
        "outstanding_total": money(invoices.aggregate(total=Sum("remaining"))["total"]),
        "overdue_total": money(overdue.aggregate(total=Sum("remaining"))["total"]),
        "overdue_count": overdue.count(),
        "pending_advance_total": money(advances.filter(payment_status="AWAITING_PAYMENT").aggregate(total=Sum("advance_amount"))["total"]),
        "pending_confirmation_total": money(advances.filter(payment_status="PENDING_CONFIRMATION").aggregate(total=Sum("advance_amount"))["total"]),
        "overdue_invoices": [{"id": row.id, "number": row.invoice_number, "due_date": row.due_date,
            "balance": money(row.remaining), "url": f"/invoices?invoice={row.id}&collections=overdue"}
            for row in overdue[offset:offset + PAGE_SIZE]],
    }


def completed_attention(contractor, offset):
    schedules = WorkSchedule.objects.filter(quotation__contractor=contractor,
        quotation__deleted_at__isnull=True, status="COMPLETED", quotation__invoice__isnull=True,
    ).select_related("quotation__customer", "quotation__property").order_by("-work_completed_at", "-id")
    count = schedules.count()
    return {"count": count, "has_more": count > offset + PAGE_SIZE, "items": [
        {**project_summary(row.quotation), "key": f"schedule-{row.pk}", "schedule": row.pk,
         "url": f"/quotations/{row.quotation_id}?action=invoice"}
        for row in schedules[offset:offset + PAGE_SIZE]]}


def kickoff_attention(contractor, offset):
    family = Q(pk=OuterRef("family_id")) | Q(revision_of_id=OuterRef("family_id"))
    newer = Quotation.objects.filter(family, version_number__gt=OuterRef("version_number"))
    scheduled_family = WorkSchedule.objects.filter(
        Q(quotation_id=OuterRef("family_id")) | Q(quotation__revision_of_id=OuterRef("family_id")))
    proposals = Quotation.objects.filter(contractor=contractor, deleted_at__isnull=True, status="ACCEPTED").annotate(
        family_id=Coalesce("revision_of_id", "id"), has_newer=Exists(newer), has_schedule=Exists(scheduled_family),
    ).filter(has_newer=False, has_schedule=False).select_related("customer", "property").order_by("-updated_at", "-id")
    receipts = ProjectReceipt.objects.filter(quotation_id=OuterRef("quotation_id"), amount__gt=0)
    active = WorkSchedule.objects.filter(quotation__contractor=contractor, quotation__deleted_at__isnull=True,
        status__in=("PENDING", "CONFIRMED", "IN_PROGRESS"),
        payment_status__in=("NOT_REQUESTED", "AWAITING_PAYMENT", "PENDING_CONFIRMATION"),
    ).annotate(has_receipt=Exists(receipts)).exclude(payment_status="NOT_REQUESTED", has_receipt=True).select_related(
        "quotation__customer", "quotation__property").order_by("-updated_at", "-id")
    proposal_count, active_count = proposals.count(), active.count()
    count = proposal_count + active_count
    items = [{**project_summary(row), "key": f"quotation-{row.pk}", "stage": "PROPOSE_DATES",
        "url": f"/work-schedules?quotation={row.pk}"} for row in proposals[offset:offset + PAGE_SIZE]] if offset < proposal_count else []
    remaining = PAGE_SIZE - len(items)
    if remaining:
        start = max(0, offset - proposal_count)
        for row in active[start:start + remaining]:
            stage = {"AWAITING_PAYMENT": "AWAITING_PAYMENT", "PENDING_CONFIRMATION": "CONFIRM_ADVANCE"}.get(row.payment_status)
            if row.status == "PENDING":
                stage = "CONFIRM_DATES"
            elif not stage:
                stage = "REQUEST_ADVANCE" if row.status == "CONFIRMED" else "REVIEW_ADVANCE"
            items.append({**project_summary(row.quotation), "key": f"schedule-{row.pk}", "schedule": row.pk,
                "stage": stage, "payment_status": row.payment_status, "advance_amount": money(row.advance_amount),
                "url": f"/work-schedules?quotation={row.quotation_id}"})
    return {"count": count, "has_more": count > offset + PAGE_SIZE, "items": items}


def call_attention(contractor, offset):
    blocked = BlockedCaller.objects.filter(contractor=contractor).values("normalized_mobile")
    events = CallInboxEvent.objects.filter(contractor=contractor, booked_follow_up__isnull=True).filter(
        Q(review_status__in=("PENDING", "CUSTOMER_LINKED")) | Q(review_status="MATCHED", call_status="MISSED"),
    ).exclude(normalized_mobile__in=blocked).order_by("-occurred_at", "-id")
    count = events.count()
    return {"count": count, "has_more": count > offset + PAGE_SIZE, "items": [
        {"id": row.pk, "display_name": row.caller_name or row.phone_number, "phone_number": row.phone_number,
         "call_status": row.call_status, "url": f"/call-inbox?event={row.pk}&action=book"}
        for row in events[offset:offset + PAGE_SIZE]]}


def workflow_attention(contractor, *, page=1):
    offset = (page - 1) * PAGE_SIZE
    subcontracts = subcontract_attention(contractor, offset=offset, limit=PAGE_SIZE)
    subcontracts["review_has_more"] = subcontracts["review_count"] > offset + PAGE_SIZE
    subcontracts["additional_work_has_more"] = subcontracts["additional_work_count"] > offset + PAGE_SIZE
    return {"page": page, "page_size": PAGE_SIZE,
        "finance": finance_attention(contractor, timezone.localdate(), offset),
        "completed_projects": completed_attention(contractor, offset),
        "kickoff": kickoff_attention(contractor, offset), "subcontracts": subcontracts,
        "calls": call_attention(contractor, offset)}


class ContractorWorkflowAttentionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=403)
        try:
            page = int(request.query_params.get("page", "1"))
            if not 1 <= page <= 10000:
                raise ValueError
        except (TypeError, ValueError):
            return Response({"page": "Choose a page between 1 and 10000."}, status=400)
        response = Response(workflow_attention(request.user, page=page))
        response["Cache-Control"] = "no-store"
        return response
