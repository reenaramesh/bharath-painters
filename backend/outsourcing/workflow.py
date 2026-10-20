"""Authority rules for subcontract work orders.

Every status change is checked here so the same rule cannot be bypassed by a
different endpoint. The two rules that matter most:

* a receiving contractor can never approve or complete their own work, and
* no actor can move money outside the ledger they belong to.
"""

from decimal import Decimal
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import DecimalValidator
from django.db import IntegrityError, models, transaction
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
    WorkOrderCompletionScope,
    WorkOrderEvent,
)
from quotations.models import ProjectScope

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
def transition(user, work_order, target_status, note="", scope_progress=None):
    SubcontractWorkOrder.objects.select_for_update(of=("self",)).get(pk=work_order.pk)
    work_order.refresh_from_db()
    # Corrections must go through request_correction so the note and the
    # correction record can never be skipped by the generic status endpoint.
    if target_status == SubcontractWorkOrder.Status.CORRECTION_REQUESTED:
        raise ValidationError(
            {"status": "Use the correction request to ask the other side for changes."}
        )
    reason = can_transition(user, work_order, target_status)
    if reason:
        raise ValidationError({"status": reason})

    active_assignments = work_order.assignments.exclude(status__in=("DECLINED", "RELEASED"))
    if target_status == SubcontractWorkOrder.Status.IN_PROGRESS and active_assignments.exclude(
        status__in=("ACCEPTED", "IN_PROGRESS", "COMPLETED")
    ).exists():
        raise ValidationError({"status": "Every active employee must accept their assignment before work starts."})
    if target_status == SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW and active_assignments.exclude(
        status="COMPLETED"
    ).exists():
        raise ValidationError({"status": "Every active employee assignment must be completed before sending work for review."})

    progress_rows = None
    if target_status == SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW and scope_progress is not None:
        if not isinstance(scope_progress, list):
            raise ValidationError({"scope_progress": "Provide a list of scope quantities."})
        shared = {row.pk: row for row in work_order.scopes.filter(is_included=True)}
        parsed = {}
        for item in scope_progress:
            try:
                scope_id = int(item.get("scope_id"))
                quantity = Decimal(str(item.get("quantity")))
            except (AttributeError, TypeError, ValueError, ArithmeticError):
                raise ValidationError({"scope_progress": "Each scope needs a valid ID and quantity."})
            if scope_id not in shared or not quantity.is_finite() or quantity < 0 or quantity > shared[scope_id].quantity:
                raise ValidationError({"scope_progress": "Reported quantity must be within the shared work order scope."})
            if scope_id in parsed:
                raise ValidationError({"scope_progress": "A scope can be reported only once per submission."})
            parsed[scope_id] = quantity
        if set(parsed) != set(shared):
            raise ValidationError({"scope_progress": "Report a quantity for every included scope."})
        progress_rows = [(shared[scope_id], quantity) for scope_id, quantity in parsed.items()]

    previous = work_order.status
    now = timezone.now()
    work_order.status = target_status
    field = TIMESTAMP_FIELDS.get(target_status)
    if field:
        setattr(work_order, field, getattr(work_order, field) or now)
    work_order.save(
        update_fields=(["status", field, "updated_at"] if field else ["status", "updated_at"])
    )
    if target_status == SubcontractWorkOrder.Status.CANCELLED:
        work_order.assignments.exclude(status__in=("COMPLETED", "DECLINED", "RELEASED")).update(
            status="RELEASED", released_at=now,
        )
    if work_order.material_mode:
        price=work_order.quotes.filter(is_current=True,created_by=work_order.main_contractor).first()
        if price is None:
            raise ValidationError({"pricing":"Save complete agreed pricing before changing status."})
        if target_status == "SENT":
            if work_order.private_pricing.get("margin"):
                from .serializers import user_label
                private = dict(work_order.private_pricing)
                private["issued_identity"] = {"issuer": user_label(work_order.main_contractor), "vendor": user_label(work_order.receiving_contractor)}
                work_order.private_pricing = private
                work_order.save(update_fields=["private_pricing"])
            price.status=SubcontractQuote.Status.SENT;price.sent_at=now
            price.save(update_fields=["status","sent_at","updated_at"])
        elif target_status in {"ACCEPTED","DECLINED","WITHDRAWN"}:
            price.status=SubcontractQuote.Status.ACCEPTED if target_status == "ACCEPTED" else SubcontractQuote.Status.REJECTED
            price.decided_at=now;price.decision_note=note[:250]
            price.save(update_fields=["status","decided_at","decision_note","updated_at"])

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
        if progress_rows is not None:
            WorkOrderCompletionScope.objects.bulk_create([
                WorkOrderCompletionScope(completion=completion, work_order_scope=scope, reported_quantity=quantity)
                for scope, quantity in progress_rows
            ])
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

    if target_status == SubcontractWorkOrder.Status.COMPLETED:
        completion = WorkOrderCompletion.objects.select_for_update().filter(work_order=work_order, is_current=True).first()
        if completion and completion.approved_at is None:
            completion.approved_by = user
            completion.approved_at = now
            completion.save(update_fields=("approved_by", "approved_at"))
            rows = list(completion.scope_progress.select_related("work_order_scope__project_scope"))
            unresolved_sources = [
                row.work_order_scope for row in rows
                if row.work_order_scope.project_scope_id is None and row.work_order_scope.source_quotation_item_id
            ]
            if unresolved_sources:
                from quotations.project_scope_sync import sync_project_scopes
                sync_project_scopes(work_order.quotation)
                for shared_scope in unresolved_sources:
                    if shared_scope.source_quotation_item.quotation_id != work_order.quotation_id:
                        raise ValidationError({"scope_progress": "A subcontract scope points to a different customer quotation."})
                    linked = ProjectScope.objects.select_for_update().filter(
                        quotation=work_order.quotation,
                        source_quotation_item=shared_scope.source_quotation_item,
                    ).first()
                    if linked is None:
                        raise ValidationError({"scope_progress": "The subcontract scope could not be linked to effective project work."})
                    shared_scope.project_scope = linked
                    shared_scope.save(update_fields=("project_scope",))
            project_scope_ids = sorted({row.work_order_scope.project_scope_id for row in rows if row.work_order_scope.project_scope_id})
            locked_scopes = {scope.pk: scope for scope in ProjectScope.objects.select_for_update().filter(pk__in=project_scope_ids)}
            for row in rows:
                project_scope = locked_scopes.get(row.work_order_scope.project_scope_id)
                if not project_scope:
                    continue
                previously_accepted = WorkOrderCompletionScope.objects.filter(
                    work_order_scope__project_scope=project_scope,
                    completion__approved_at__isnull=False,
                ).exclude(pk=row.pk).aggregate(total=models.Sum("accepted_quantity"))["total"] or Decimal("0")
                accepted = row.reported_quantity
                if previously_accepted + accepted > project_scope.quantity:
                    raise ValidationError({"scope_progress": f"Accepted work would exceed the remaining quantity for {project_scope.title}."})
                row.accepted_quantity = accepted
                row.save(update_fields=("accepted_quantity",))
                project_scope.completed_quantity = previously_accepted + accepted
                if project_scope.completed_quantity > 0 and project_scope.status not in (ProjectScope.Status.COMPLETED, ProjectScope.Status.CANCELLED):
                    project_scope.status = ProjectScope.Status.COMPLETED if project_scope.completed_quantity >= project_scope.quantity else ProjectScope.Status.IN_PROGRESS
                project_scope.save(update_fields=("completed_quantity", "status", "updated_at"))

    return work_order


@transaction.atomic
def request_correction(user, work_order, note):
    SubcontractWorkOrder.objects.select_for_update(of=("self",)).get(pk=work_order.pk)
    work_order.refresh_from_db()
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


class PaymentConflict(ValidationError):
    """An optional request key was already used for different payment data."""


@transaction.atomic
def record_payment(user, invoice, amount, payment_mode, reference="", notes="", received_date=None, idempotency_key=None):
    invoice = SubcontractInvoice.objects.select_for_update(of=("self",)).select_related("work_order").get(pk=invoice.pk)
    if invoice.work_order.main_contractor_id != user.id:
        raise ValidationError({"payment": "Only the main contractor can record this payment."})
    if invoice.status == SubcontractInvoice.Status.VOID:
        raise ValidationError({"payment": "This invoice is void."})
    try:
        amount = Decimal(str(amount))
        if not amount.is_finite():
            raise ValueError
        amount = amount.quantize(TWO_PLACES)
    except (ArithmeticError, ValueError, TypeError):
        raise ValidationError({"amount": "Enter a valid amount."})
    if amount <= 0 or amount >= Decimal("1000000000000"):
        raise ValidationError({"amount": "Enter a positive amount within the supported range."})
    if payment_mode not in SubcontractInvoice.PaymentMode.values:
        raise ValidationError({"payment_mode": "Select a valid payment mode."})
    supplied_date = received_date is not None
    received_date = received_date or timezone.localdate()
    if type(received_date) is not date or received_date > timezone.localdate():
        raise ValidationError({"received_date": "Enter a valid payment date that is not in the future."})
    reference = str(reference or "").strip()
    notes = str(notes or "").strip()
    if len(reference) > 120 or len(notes) > 250:
        raise ValidationError({"payment": "Payment reference or notes are too long."})
    key = str(idempotency_key or "").strip() or None
    if key and len(key) > 100:
        raise ValidationError({"idempotency_key": "Use a request key of at most 100 characters."})

    def replay(existing):
        if (existing.invoice_id != invoice.pk or existing.recorded_by_id != user.pk or
                existing.amount != amount or existing.payment_mode != payment_mode or
                existing.payment_reference != reference or existing.notes != notes or
                (supplied_date and existing.received_date != received_date)):
            raise PaymentConflict({"idempotency_key": "This request key was already used for a different payment."})
        return invoice

    if key:
        existing = SubcontractInvoicePayment.objects.filter(idempotency_key=key).first()
        if existing:
            return replay(existing)

    paid = invoice.payments.aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
    if amount > invoice.total - paid:
        raise ValidationError({"amount": "That is more than the outstanding balance."})
    try:
        # A distinct invoice can concurrently use the same globally unique key.
        # Keep its uniqueness failure inside a savepoint before inspecting it.
        with transaction.atomic():
            SubcontractInvoicePayment.objects.create(
                invoice=invoice, amount=amount, received_date=received_date,
                payment_mode=payment_mode, payment_reference=reference,
                notes=notes, recorded_by=user, idempotency_key=key,
            )
    except IntegrityError:
        existing = SubcontractInvoicePayment.objects.filter(idempotency_key=key).first() if key else None
        if existing is None:
            raise
        return replay(existing)
    invoice.amount_paid = (paid + amount).quantize(TWO_PLACES)
    invoice.balance = (invoice.total - invoice.amount_paid).quantize(TWO_PLACES)
    invoice.status = (
        SubcontractInvoice.Status.PAID
        if invoice.balance <= 0
        else SubcontractInvoice.Status.PART_PAID
    )
    invoice.save(update_fields=["amount_paid", "balance", "status", "updated_at"])
    return invoice


@transaction.atomic
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
def share_quotation_items(work_order, items):
    """Copy selected quotation work without copying customer commercial terms."""
    rows = []
    long_descriptions = []
    for index, item in enumerate(items):
        if len(item.description) > 200:
            long_descriptions.append(item.description)
        rows.append(SubcontractWorkOrderScope(
            work_order=work_order,
            category=item.service_category,
            title_snapshot=(item.description or item.service_name_snapshot or "Service")[:200],
            category_name_snapshot=item.service_category_name_snapshot or item.custom_service_category or (item.service_category.name if item.service_category else ""),
            work_description_snapshot=(item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type else ""))[:200],
            unit_name_snapshot=item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else ""),
            quantity=item.quantity,
            unit_rate=Decimal("0"),
            sort_order=(index + 1) * 10,
        ))
    if long_descriptions:
        # Keep full quotation wording without widening existing snapshot columns.
        work_order.agreed_scope_summary = "\n\n".join(filter(None, [
            work_order.agreed_scope_summary,
            "Full service descriptions:\n" + "\n".join(long_descriptions),
        ]))
        work_order.save(update_fields=["agreed_scope_summary", "updated_at"])
    return SubcontractWorkOrderScope.objects.bulk_create(rows)


@transaction.atomic
def decide_quote(user, quote, decision, note=""):
    """Accept or reject a receiving contractor's quote. Main contractor only."""
    SubcontractWorkOrder.objects.select_for_update(of=("self",)).get(pk=quote.work_order_id)
    SubcontractQuote.objects.select_for_update(of=("self",)).get(pk=quote.pk)
    quote.refresh_from_db()
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
    AdditionalWorkRequest.objects.select_for_update().get(pk=request_.pk)
    request_.refresh_from_db()
    work_order = request_.work_order
    if work_order.main_contractor_id != user.id:
        raise ValidationError({"request": "Only the main contractor can decide this."})
    if request_.status != AdditionalWorkRequest.Status.PENDING:
        raise ValidationError({"request": "This request was already decided."})
    if decision not in {AdditionalWorkRequest.Status.APPROVED, AdditionalWorkRequest.Status.DECLINED}:
        raise ValidationError({"decision": "Choose APPROVED or DECLINED."})
    if approved_amount is not None or decision == AdditionalWorkRequest.Status.APPROVED:
        try:
            amount = Decimal(str(approved_amount if approved_amount is not None else request_.estimated_amount))
            if not amount.is_finite() or amount < 0:
                raise ValueError
            DecimalValidator(max_digits=14, decimal_places=2)(amount)
        except (ArithmeticError, TypeError, ValueError, ValidationError):
            raise ValidationError({"approved_amount": "Enter a nonnegative amount with at most 12 whole digits and 2 decimal places."})
        approved_amount = amount

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
