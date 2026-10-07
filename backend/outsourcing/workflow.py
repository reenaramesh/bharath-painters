"""Authority rules for subcontract work orders.

Every status change is checked here so the same rule cannot be bypassed by a
different endpoint. The two rules that matter most:

* a receiving contractor can never approve or complete their own work, and
* no actor can move money outside the ledger they belong to.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounts.models import BharathUser

from .models import (
    TWO_PLACES,
    AdditionalWorkRequest,
    CorrectionRequest,
    SubcontractInvoice,
    SubcontractInvoicePayment,
    SubcontractQuote,
    SubcontractWorkOrder,
    SubcontractWorkOrderScope,
    WageRecord,
    WorkOrderCompletion,
    WorkOrderEvent,
)

MAIN = "MAIN"
RECEIVING = "RECEIVING"
ADMIN = "ADMIN"

TRANSITIONS = {
    SubcontractWorkOrder.Status.DRAFT: {
        SubcontractWorkOrder.Status.SENT: MAIN,
        SubcontractWorkOrder.Status.CANCELLED: MAIN,
    },
    SubcontractWorkOrder.Status.SENT: {
        SubcontractWorkOrder.Status.ACCEPTED: RECEIVING,
        SubcontractWorkOrder.Status.DECLINED: RECEIVING,
        SubcontractWorkOrder.Status.WITHDRAWN: MAIN,
    },
    SubcontractWorkOrder.Status.ACCEPTED: {
        SubcontractWorkOrder.Status.SCHEDULED: MAIN,
        SubcontractWorkOrder.Status.IN_PROGRESS: RECEIVING,
        SubcontractWorkOrder.Status.CANCELLED: MAIN,
    },
    SubcontractWorkOrder.Status.SCHEDULED: {
        SubcontractWorkOrder.Status.IN_PROGRESS: RECEIVING,
        SubcontractWorkOrder.Status.CANCELLED: MAIN,
    },
    SubcontractWorkOrder.Status.IN_PROGRESS: {
        SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW: RECEIVING,
        SubcontractWorkOrder.Status.CANCELLED: MAIN,
    },
    SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW: {
        SubcontractWorkOrder.Status.COMPLETED: MAIN,
        SubcontractWorkOrder.Status.CORRECTION_REQUESTED: MAIN,
    },
    SubcontractWorkOrder.Status.CORRECTION_REQUESTED: {
        SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW: RECEIVING,
        SubcontractWorkOrder.Status.CANCELLED: MAIN,
    },
    SubcontractWorkOrder.Status.COMPLETED: {
        SubcontractWorkOrder.Status.IN_PROGRESS: MAIN,
    },
    SubcontractWorkOrder.Status.DECLINED: {
        SubcontractWorkOrder.Status.DRAFT: MAIN,
    },
    SubcontractWorkOrder.Status.WITHDRAWN: {
        SubcontractWorkOrder.Status.DRAFT: MAIN,
    },
    SubcontractWorkOrder.Status.CANCELLED: {},
}

TIMESTAMP_FIELDS = {
    SubcontractWorkOrder.Status.SENT: "sent_at",
    SubcontractWorkOrder.Status.ACCEPTED: "accepted_at",
    SubcontractWorkOrder.Status.DECLINED: "declined_at",
    SubcontractWorkOrder.Status.IN_PROGRESS: "started_at",
    SubcontractWorkOrder.Status.COMPLETED: "completed_at",
    SubcontractWorkOrder.Status.CANCELLED: "closed_at",
    SubcontractWorkOrder.Status.WITHDRAWN: "closed_at",
}


def authority_for(user, work_order):
    if getattr(user, "role", None) == BharathUser.Roles.ADMIN or getattr(user, "is_superuser", False):
        return ADMIN
    if user.id == work_order.main_contractor_id:
        return MAIN
    if user.id == work_order.receiving_contractor_id:
        return RECEIVING
    return None


def can_transition(user, work_order, target_status):
    """Return None when allowed, otherwise a reason string."""
    authority = authority_for(user, work_order)
    if authority is None:
        return "You are not part of this work order."
    allowed = TRANSITIONS.get(work_order.status, {})
    expected = allowed.get(target_status)
    if expected is None:
        return f"A work order that is {work_order.get_status_display().lower()} cannot move to that state."
    if expected == ADMIN:
        if authority != ADMIN:
            return "Only an administrator can make that change."
    elif expected != authority:
        if expected == MAIN and authority == RECEIVING:
            return "Only the main contractor can make that change."
        if expected == RECEIVING and authority == MAIN:
            return "Only the receiving contractor can make that change."
        return "You are not allowed to make that change."
    return None


@transaction.atomic
def transition(user, work_order, target_status, note=""):
    # Corrections must go through request_correction so the note and the
    # correction record can never be skipped by the generic status endpoint.
    if target_status == SubcontractWorkOrder.Status.CORRECTION_REQUESTED:
        raise ValidationError(
            {"status": "Use the correction request to ask the other side for changes."}
        )
    reason = can_transition(user, work_order, target_status)
    if reason:
        raise ValidationError({"status": reason})

    previous = work_order.status
    now = timezone.now()
    work_order.status = target_status
    field = TIMESTAMP_FIELDS.get(target_status)
    if field:
        setattr(work_order, field, getattr(work_order, field) or now)
    work_order.save(
        update_fields=(["status", field, "updated_at"] if field else ["status", "updated_at"])
    )

    WorkOrderEvent.objects.create(
        work_order=work_order,
        actor=user if getattr(user, "is_authenticated", False) else None,
        from_status=previous,
        to_status=target_status,
        note=note,
    )

    if target_status == SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW:
        WorkOrderCompletion.objects.filter(work_order=work_order, is_current=True).update(is_current=False)
        submission_number = (
            WorkOrderCompletion.objects.filter(work_order=work_order).count() + 1
        )
        completion = WorkOrderCompletion.objects.create(
            work_order=work_order,
            submitted_by=user,
            submission_number=submission_number,
            summary=note,
            is_current=True,
        )
        # Resubmitting clears every open correction the main contractor raised.
        resolved = CorrectionRequest.objects.filter(
            completion__work_order=work_order,
            resolved_at__isnull=True,
        ).update(resolved_at=now, resolution_note="Resolved by resubmission")
        if resolved:
            current = WorkOrderCompletion.objects.filter(
                work_order=work_order, is_current=True
            ).order_by("-submission_number").first()
            if current:
                current.open_correction_count = 0
                current.save(update_fields=["open_correction_count"])

    return work_order


@transaction.atomic
def request_correction(user, work_order, note):
    reason = can_transition(
        user, work_order, SubcontractWorkOrder.Status.CORRECTION_REQUESTED
    )
    if reason:
        raise ValidationError({"status": reason})
    if not (note or "").strip():
        raise ValidationError({"note": "Say what needs correcting."})

    completion = WorkOrderCompletion.objects.filter(
        work_order=work_order, is_current=True
    ).first()
    if completion is None:
        raise ValidationError({"status": "There is nothing submitted to review yet."})

    correction = CorrectionRequest.objects.create(
        work_order=work_order,
        completion=completion,
        requested_by=user,
        note=note,
    )
    completion.open_correction_count += 1
    completion.save(update_fields=["open_correction_count"])

    previous = work_order.status
    work_order.status = SubcontractWorkOrder.Status.CORRECTION_REQUESTED
    work_order.save(update_fields=["status", "updated_at"])
    WorkOrderEvent.objects.create(
        work_order=work_order,
        actor=user,
        from_status=previous,
        to_status=SubcontractWorkOrder.Status.CORRECTION_REQUESTED,
        note=note,
        event_type="CORRECTION_REQUESTED",
    )
    return correction


@transaction.atomic
def record_payment(user, invoice, amount, payment_mode, reference="", notes=""):
    if invoice.work_order.main_contractor_id != user.id:
        raise ValidationError({"payment": "Only the main contractor can record this payment."})
    if invoice.status == SubcontractInvoice.Status.VOID:
        raise ValidationError({"payment": "This invoice is void."})
    try:
        amount = amount.quantize(TWO_PLACES)
    except AttributeError:
        raise ValidationError({"amount": "Enter a valid amount."})
    if amount <= 0:
        raise ValidationError({"amount": "Enter an amount above zero."})
    if amount > invoice.balance:
        raise ValidationError({"amount": "That is more than the outstanding balance."})

    SubcontractInvoicePayment.objects.create(
        invoice=invoice,
        amount=amount,
        payment_mode=payment_mode,
        payment_reference=reference,
        notes=notes,
        recorded_by=user,
    )
    invoice.amount_paid = (invoice.amount_paid + amount).quantize(TWO_PLACES)
    invoice.balance = (invoice.total - invoice.amount_paid).quantize(TWO_PLACES)
    invoice.status = (
        SubcontractInvoice.Status.PAID
        if invoice.balance <= 0
        else SubcontractInvoice.Status.PART_PAID
    )
    invoice.save(update_fields=["amount_paid", "balance", "status", "updated_at"])
    return invoice


def share_scopes(work_order, project_scopes):
    """Snapshot the chosen project scopes onto the work order."""
    SubcontractWorkOrderScope.objects.filter(work_order=work_order).delete()
    rows = []
    for index, scope in enumerate(project_scopes):
        rows.append(
            SubcontractWorkOrderScope(
                work_order=work_order,
                project_scope=scope,
                category=scope.category,
                title_snapshot=scope.title,
                category_name_snapshot=scope.category_name_snapshot or (scope.category.name if scope.category_id else ""),
                work_description_snapshot=scope.work_description_snapshot,
                unit_name_snapshot=scope.unit_name_snapshot,
                quantity=scope.quantity,
                unit_rate=scope.unit_rate,
                sort_order=(index + 1) * 10,
            )
        )
    return SubcontractWorkOrderScope.objects.bulk_create(rows)


@transaction.atomic
def decide_quote(user, quote, decision, note=""):
    """Accept or reject a receiving contractor's quote. Main contractor only."""
    work_order = quote.work_order
    if work_order.main_contractor_id != user.id:
        raise ValidationError({"quote": "Only the main contractor can decide this quote."})
    if quote.status != SubcontractQuote.Status.SENT:
        raise ValidationError({"quote": "Only a sent quote can be decided."})
    if decision not in {SubcontractQuote.Status.ACCEPTED, SubcontractQuote.Status.REJECTED}:
        raise ValidationError({"quote": "Unsupported decision."})

    quote.status = decision
    quote.decided_at = timezone.now()
    quote.decision_note = note
    quote.is_current = decision == SubcontractQuote.Status.ACCEPTED
    quote.save(update_fields=["status", "decided_at", "decision_note", "is_current", "updated_at"])

    if decision == SubcontractQuote.Status.ACCEPTED:
        work_order.agreed_amount = quote.total
        work_order.save(update_fields=["agreed_amount", "updated_at"])

    WorkOrderEvent.objects.create(
        work_order=work_order,
        actor=user,
        event_type="QUOTE_DECIDED",
        note=f"{quote.reference} {decision.lower()}",
    )
    return quote


@transaction.atomic
def decide_additional_work(user, request_, decision, approved_amount=None, note=""):
    work_order = request_.work_order
    if work_order.main_contractor_id != user.id:
        raise ValidationError({"request": "Only the main contractor can decide this."})
    if request_.status != AdditionalWorkRequest.Status.PENDING:
        raise ValidationError({"request": "This request was already decided."})

    request_.status = decision
    request_.decided_by = user
    request_.decided_at = timezone.now()
    request_.decision_note = note
    if decision == AdditionalWorkRequest.Status.APPROVED:
        request_.approved_amount = (
            approved_amount if approved_amount is not None else request_.estimated_amount
        )
    request_.save()
    WorkOrderEvent.objects.create(
        work_order=work_order,
        actor=user,
        event_type="ADDITIONAL_WORK_DECIDED",
        note=f"{decision.lower()} {request_.approved_amount or request_.estimated_amount}",
    )
    return request_


def can_view_wage_ledger(user, work_order):
    """Wages are private to the receiving contractor who employs the worker."""
    return user.id == work_order.receiving_contractor_id


def can_record_wages(user, work_order):
    return can_view_wage_ledger(user, work_order)


@transaction.atomic
def record_wage(user, work_order, employee, amount, wage_type, days_worked=0, accrued_on=None, note=""):
    if not can_record_wages(user, work_order):
        raise ValidationError({"wage": "Only the receiving contractor can record wages here."})
    if employee.role != BharathUser.Roles.PAINTER:
        raise ValidationError({"employee": "Wages can only be recorded for employees."})
    return WageRecord.objects.create(
        work_order=work_order,
        employee=employee,
        recorded_by=user,
        amount=amount,
        wage_type=wage_type,
        days_worked=days_worked,
        accrued_on=accrued_on or timezone.localdate(),
        note=note,
    )
