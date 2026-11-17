"""Contractor-owned lead actions, activity and financial lifecycle projections."""
from datetime import datetime, time
from decimal import Decimal
import re
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError
from rest_framework import serializers
from .models import CustomerFollowUp, Invoice, Lead, Quotation

FULFILMENT = {"ACCEPTED", "SCHEDULED", "CONVERTED", "IN_PROGRESS", "COMPLETED"}
TERMINAL = {"LOST", "CANCELLED"}


class LeadWriteInput(serializers.Serializer):
    customer = serializers.IntegerField(min_value=1, required=False)
    property = serializers.IntegerField(min_value=1, allow_null=True, required=False)
    service_type = serializers.IntegerField(min_value=1, allow_null=True, required=False)
    assigned_user = serializers.IntegerField(min_value=1, allow_null=True, required=False)
    title = serializers.CharField(max_length=180, required=False)
    estimated_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), allow_null=True, required=False)
    expected_start_date = serializers.DateField(allow_null=True, required=False)
    next_follow_up = serializers.DateTimeField(allow_null=True, required=False)
    site_visit_required = serializers.BooleanField(required=False)
    source_detail = serializers.CharField(max_length=255, allow_blank=True, required=False)


def validated_lead_input(data):
    fields = LeadWriteInput(data=data)
    fields.is_valid(raise_exception=True)
    result = data.copy()
    result.update(fields.validated_data)
    return result


def create_lead_safely(**values):
    for attempt in range(4):
        try:
            with transaction.atomic():
                return Lead.objects.create(**values), True
        except IntegrityError:
            key = values.get("creation_key")
            existing = Lead.objects.filter(contractor=values["contractor"], creation_key=key).first() if key else None
            if existing:
                if existing.customer_id != values["customer"].pk or existing.title != values["title"]:
                    raise ValidationError({"creation_key": "This submission key belongs to another enquiry."})
                return existing, False
            if attempt == 3:
                raise


def owned_leads(user, params=None):
    from .customer_contacts import with_contractor_contact
    from .lead_access import accessible_leads
    from django.db.models import OuterRef
    rows = accessible_leads(user).select_related("contractor__contractor_profile", "customer", "service_type", "property", "assigned_user").prefetch_related(
        "stage_history", "follow_ups__performed_by", "follow_ups__completed_by", "site_visits", "quotations__work_schedule", "quotations__invoice", "quotations__project_receipts")
    params = params or {}
    search = str(params.get("search") or "").strip()
    if search:
        rows = with_contractor_contact(rows, OuterRef("contractor_id"), "customer__").filter(
            Q(reference_no__icontains=search) | Q(crm_name__icontains=search) | Q(crm_mobile__icontains=search) |
            Q(customer__bharath_id__icontains=search) | Q(title__icontains=search) | Q(description__icontains=search) |
            Q(service_type__name__icontains=search) | Q(property__name__icontains=search))
    assignee = params.get("assigned_user")
    if assignee == "unassigned":
        rows = rows.filter(assigned_user__isnull=True)
    elif assignee:
        try:
            value = serializers.IntegerField(min_value=1).run_validation(assignee)
        except serializers.ValidationError:
            raise ValidationError({"assigned_user": "Choose a valid employee or Unassigned."})
        rows = rows.filter(assigned_user_id=value)
    for field in ("source", "priority", "customer"):
        if params.get(field):
            value = params[field]
            if field == "customer":
                try:
                    value = serializers.IntegerField(min_value=1).run_validation(value)
                except serializers.ValidationError:
                    raise ValidationError({"customer": "Enter a valid customer ID."})
            rows = rows.filter(**{field: value})
    for key, lookup in (("date_from", "created_at__date__gte"), ("date_to", "created_at__date__lte")):
        try:
            value = parse_date(str(params.get(key) or ""))
        except ValueError:
            raise ValidationError({key: "Enter a valid date."})
        if value:
            rows = rows.filter(**{lookup: value})
    return rows


def followup_time(value):
    if not value:
        return None
    try:
        result = parse_datetime(str(value))
    except (ValueError, TypeError):
        result = None
    if not result:
        raise ValidationError({"next_follow_up": "Enter a valid date and time."})
    return timezone.make_aware(result) if timezone.is_naive(result) else result


@transaction.atomic
def sync_next_follow_up(lead_id):
    lead = Lead.objects.select_for_update().filter(pk=lead_id).first()
    if not lead:
        return
    next_date = CustomerFollowUp.objects.filter(opportunity=lead, created_by_id=lead.contractor_id,
        customer_id=lead.customer_id, is_completed=False, next_follow_up__isnull=False).order_by("next_follow_up").values_list("next_follow_up", flat=True).first()
    Lead.objects.filter(pk=lead_id).update(next_follow_up=next_date)


def fulfilment_phase(quote, lead):
    if quote.status in FULFILMENT:
        return quote.status
    if quote.status != "REVISION_REQUESTED":
        return None
    # Revision requests overwrite the commercial status, not the existing job.
    schedule = getattr(quote, "work_schedule", None)
    if schedule and schedule.status != "CANCELLED":
        return schedule.status if schedule.status in {"IN_PROGRESS", "COMPLETED"} else "ACCEPTED"
    if quote.accepted_via_receipt_at:
        return "ACCEPTED"
    numbers = {quote.quotation_number}
    if quote.version_number == 1:
        numbers.add(re.sub(r"-V1$", "", quote.quotation_number, flags=re.IGNORECASE))
    accepted_notes = {f"{prefix}: {number}" for prefix in ("Quotation accepted", "Quotation accepted — lead won") for number in numbers}
    if any(event.to_stage == "WON" and event.note in accepted_notes for event in lead.stage_history.all()):
        return "ACCEPTED"
    return None


def proposal_families(lead):
    families = {}
    for quote in lead.quotations.all():
        if quote.contractor_id != lead.contractor_id or quote.customer_id != lead.customer_id or quote.deleted_at:
            continue
        families.setdefault(quote.revision_of_id or quote.pk, []).append(quote)
    chosen = []
    for versions in families.values():
        # Accepted work remains authoritative while a new version is a draft.
        work = [q for q in versions if fulfilment_phase(q, lead)]
        chosen.append(max(work or versions, key=lambda q: (q.version_number, q.pk)))
    return chosen


def workflow_data(lead):
    quotes = proposal_families(lead)
    work = [q for q in quotes if fulfilment_phase(q, lead)]
    all_quotes = [q for q in lead.quotations.all() if q.contractor_id == lead.contractor_id and q.customer_id == lead.customer_id and not q.deleted_at]
    total, paid, balance, missing_invoices = Decimal("0"), Decimal("0"), Decimal("0"), 0
    work_phases, work_actions, outstanding_invoices, uninvoiced_quotes = [], [], [], []
    for quote in work:
        family = [q for q in all_quotes if (q.revision_of_id or q.pk) == (quote.revision_of_id or quote.pk)]
        schedules = [getattr(q, "work_schedule", None) for q in family]
        schedules = [schedule for schedule in schedules if schedule and schedule.status != "CANCELLED"]
        phase = "IN_PROGRESS" if any(s.status == "IN_PROGRESS" for s in schedules) else "COMPLETED" if schedules and all(s.status == "COMPLETED" for s in schedules) else fulfilment_phase(quote, lead)
        work_phases.append(phase)
        schedule = next((s for s in schedules if s.status == "IN_PROGRESS"), next((s for s in schedules if s.status != "COMPLETED"), None))
        work_actions.append((phase, quote, schedule))
        invoices = [getattr(q, "invoice", None) for q in family]
        invoices = [i for i in invoices if i and i.contractor_id == lead.contractor_id and i.customer_id == lead.customer_id and i.status != Invoice.Status.CANCELLED]
        invoice = max(invoices, key=lambda i: i.pk) if invoices else None
        project_total = invoice.grand_total if invoice else quote.grand_total
        project_paid = invoice.amount_paid if invoice else sum((r.amount for q in family for r in q.project_receipts.all() if r.contractor_id == lead.contractor_id), Decimal("0"))
        if not invoice:
            uninvoiced_quotes.append(quote)
        elif project_total > project_paid:
            outstanding_invoices.append(invoice.pk)
        total += project_total
        paid += project_paid
        balance += max(project_total - project_paid, Decimal("0"))
        missing_invoices += int(invoice is None)
    stage = lead.stage
    if work and stage not in TERMINAL:
        stage = "COMPLETED" if all(phase == "COMPLETED" for phase in work_phases) else "IN_PROGRESS" if "IN_PROGRESS" in work_phases else "WON"
    completed = stage == "COMPLETED"
    payment_status = ("INVOICE_NOT_RAISED" if completed else "NOT_INVOICED") if missing_invoices or (completed and not work) else "PAYMENT_PENDING" if balance > 0 else "SETTLED" if work else "NOT_STARTED"
    closed = stage in TERMINAL or (completed and bool(work) and payment_status == "SETTLED")
    primary = max(work or quotes, key=lambda q: (q.created_at, q.pk)) if quotes else None
    tasks = [t for t in lead.follow_ups.all() if t.created_by_id == lead.contractor_id and t.customer_id == lead.customer_id]
    pending = sorted([t for t in tasks if not t.is_completed and t.next_follow_up], key=lambda t: t.next_follow_up)
    scheduled = []
    for visit in lead.site_visits.all():
        if visit.contractor_id == lead.contractor_id and visit.customer_id == lead.customer_id and visit.status in {"SCHEDULED", "RESCHEDULED"}:
            due = timezone.make_aware(datetime.combine(visit.scheduled_date, visit.scheduled_time or time(9)))
            scheduled.append((due, {"label": "Complete site visit", "url": f"/site-visits?visit={visit.pk}", "kind": "SITE_VISIT", "visit_id": visit.pk}))
    for task in pending:
        scheduled.append((task.next_follow_up, {"label": task.next_action or "Log follow-up", "url": f"/opportunities/{lead.pk}?action=follow-up", "kind": task.follow_up_type, "task_id": task.pk}))
    scheduled.sort(key=lambda entry: entry[0])
    due, action = scheduled[0] if scheduled else (None, None)
    if closed:
        due, action = None, {"label": "View history", "url": f"/opportunities/{lead.pk}", "kind": "CLOSED"}
    elif not action:
        quote_url = f"/quotations/{primary.pk}" if primary else f"/quotations/new?customer={lead.customer_id}&lead={lead.pk}"
        if completed:
            if payment_status == "INVOICE_NOT_RAISED":
                invoice_url = f"/quotations/{uninvoiced_quotes[0].pk}?action=invoice" if uninvoiced_quotes else quote_url + ("&" if "?" in quote_url else "?") + "action=invoice"
                action = {"label": "Raise invoice", "url": invoice_url, "kind": "FINANCE"}
            else:
                action = {"label": "Collect payment", "url": f"/invoices?invoice={outstanding_invoices[0]}&collections=outstanding", "kind": "FINANCE"}
        elif stage in {"WON", "IN_PROGRESS"}:
            unfinished = [entry for entry in work_actions if entry[0] != "COMPLETED"]
            target = next((entry for entry in unfinished if entry[0] == "IN_PROGRESS"), unfinished[0] if unfinished else None)
            target_quote, schedule = (target[1], target[2]) if target else (primary, None)
            # Before the revised commercial terms are approved, resolve the revision.
            revision_pending = target_quote and target_quote.status == "REVISION_REQUESTED" and not schedule
            action = {"label": "Review revision" if revision_pending else "Open work schedule" if schedule else "Schedule work", "url": f"/quotations/{target_quote.pk}" if revision_pending else f"/work-schedules?quotation={schedule.quotation_id if schedule else target_quote.pk}" if target_quote else f"/opportunities/{lead.pk}", "kind": "QUOTATION" if revision_pending else "WORK"}
        elif stage in {"NEW", "CONTACTED", "FOLLOW_UP", "NEGOTIATION"}:
            action = {"label": "Contact customer" if stage == "NEW" else "Log follow-up", "url": f"/opportunities/{lead.pk}?action=follow-up", "kind": "CALL"}
        else:
            action = {"label": "Prepare quotation" if not primary else "Share quotation" if primary.status == "DRAFT" else "Follow up quotation", "url": quote_url if not primary or primary.status == "DRAFT" else f"/opportunities/{lead.pk}?action=follow-up", "kind": "QUOTATION"}
    action = {**action, "due_at": due}
    now = timezone.now()
    # One commercial action per lead, regardless of quotation version count.
    category = None
    if not closed and stage not in {"WON", "IN_PROGRESS", "COMPLETED"}:
        request_dates = [t.created_at for t in tasks if t.outcome in {"QUOTATION_REQUIRED", "REVISED_QUOTE"}]
        shared_dates = [q.sent_at or q.created_at for q in quotes if q.status in {"SENT", "VIEWED"}]
        requested_quote = bool(request_dates) and (not shared_dates or max(request_dates) > max(shared_dates))
        if requested_quote or any(q.status in {"DRAFT", "REVISION_REQUESTED", "REJECTED", "EXPIRED"} for q in quotes) or (not quotes and stage == "QUOTATION"):
            category = "need_quotation"
        elif stage in {"SITE_VISIT", "MEASUREMENT"} or (action and action["kind"] == "SITE_VISIT"):
            category = "visits"
        elif any(q.status in {"SENT", "VIEWED"} for q in quotes):
            category = "post_quotation"
        else:
            category = "need_call"
    if not closed and category == "need_quotation" and not scheduled:
        target = next((q for q in quotes if q.status in {"DRAFT", "REVISION_REQUESTED", "REJECTED", "EXPIRED"}), primary)
        action = {"label": "Prepare quotation" if not target else "Complete quotation" if target.status == "DRAFT" else "Review quotation",
                  "url": f"/quotations/{target.pk}" if target else f"/quotations/new?customer={lead.customer_id}&lead={lead.pk}",
                  "kind": "QUOTATION", "due_at": due}
    flags = {
        "overdue": bool(not closed and due and due < now),
        "today": bool(not closed and due and timezone.localtime(due).date() == timezone.localdate()),
        "needs_action": not closed and not due,
        "awaiting_decision": not closed and not work and any(q.status in {"SENT", "VIEWED", "REVISION_REQUESTED", "REJECTED", "EXPIRED"} for q in quotes),
        "in_progress": not closed and stage == "IN_PROGRESS",
        "payment_pending": not closed and completed,
        "active": not closed, "closed": closed,
        **{key: category == key for key in ("need_call", "need_quotation", "post_quotation", "visits")},
        "unassigned": not closed and lead.assigned_user_id is None,
    }
    return {"workflow_stage": stage, "payment_status": payment_status, "balance_due": format(balance, ".2f"),
            "is_closed": closed, "next_action": action, "queue_flags": flags, "action_category": category, "primary_quotation": primary,
            "last_activity_at": max([lead.updated_at] + [t.completed_at or t.created_at for t in tasks] + [e.created_at for e in lead.stage_history.all()]), "followup_records": tasks}


def filter_lead_rows(rows, params):
    stage, queue = params.get("stage"), params.get("queue")
    view = str(params.get("view") or "").lower()
    if stage:
        rows = [row for row in rows if row["workflow_stage"] == stage]
    if queue:
        rows = [row for row in rows if row["queue_flags"].get(queue)]
    elif view == "open":
        rows = [row for row in rows if not row["is_closed"]]
    elif view in {"won", "lost"}:
        rows = [row for row in rows if row["workflow_stage"] == view.upper()]
    return sorted(rows, key=lambda row: (row["is_closed"], not row["queue_flags"]["overdue"], row["next_action"]["due_at"] or timezone.now()+timezone.timedelta(days=3650), {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(row["priority"], 1), -row["id"]))


def activity_data(lead):
    tasks = [t for t in lead.follow_ups.all() if t.created_by_id == lead.contractor_id and t.customer_id == lead.customer_id]
    followups = [{"id": t.pk, "follow_up_type": t.follow_up_type, "outcome": t.outcome, "comment": t.comment,
                  "next_follow_up": t.next_follow_up, "next_action": t.next_action, "is_completed": t.is_completed, "created_at": t.created_at,
                  "performed_by": t.performed_by_id or t.created_by_id,
                  "performed_by_name": (t.performed_by or lead.contractor).get_full_name() or (t.performed_by or lead.contractor).mobile,
                  "completed_by": t.completed_by_id} for t in sorted(tasks, key=lambda task: task.created_at, reverse=True)]
    timeline = [{"key": f"stage-{e.pk}", "type": "STAGE", "title": e.note or e.to_stage, "at": e.created_at} for e in lead.stage_history.all()]
    timeline += [{"key": f"followup-{t.pk}", "type": "FOLLOW_UP", "title": t.get_follow_up_type_display() + (f" · {t.get_outcome_display()}" if t.outcome else ""), "note": t.comment, "at": t.created_at,
                 "actor_name": (t.performed_by or lead.contractor).get_full_name() or (t.performed_by or lead.contractor).mobile} for t in tasks]
    quotes, schedules, visits = [], [], []
    for quote in lead.quotations.all():
        if quote.contractor_id != lead.contractor_id or quote.customer_id != lead.customer_id or quote.deleted_at:
            continue
        quotes.append({"id": quote.pk, "number": quote.quotation_number, "status": quote.status, "version": quote.version_number, "amount": format(quote.grand_total, ".2f")})
        timeline.append({"key": f"quote-{quote.pk}", "type": "QUOTATION", "title": f"{quote.quotation_number} · {quote.get_status_display()}", "at": quote.updated_at})
        schedule = getattr(quote, "work_schedule", None)
        if schedule:
            schedules.append({"id": schedule.pk, "quotation": quote.pk, "status": schedule.status, "start": schedule.proposed_start_date, "end": schedule.proposed_end_date})
        invoice = getattr(quote, "invoice", None)
        if invoice and invoice.contractor_id == lead.contractor_id and invoice.customer_id == lead.customer_id:
            timeline.append({"key": f"invoice-{invoice.pk}", "type": "FINANCE", "title": f"Invoice {invoice.invoice_number} · {invoice.get_status_display()}", "at": invoice.updated_at})
        for receipt in quote.project_receipts.all():
            if receipt.contractor_id == lead.contractor_id:
                timeline.append({"key": f"receipt-{receipt.pk}", "type": "FINANCE", "title": f"Payment recorded · {receipt.receipt_number}", "at": receipt.created_at})
    for visit in lead.site_visits.all():
        if visit.contractor_id == lead.contractor_id and visit.customer_id == lead.customer_id:
            visits.append({"id": visit.pk, "status": visit.status, "date": visit.scheduled_date, "time": visit.scheduled_time, "notes": visit.notes})
            timeline.append({"key": f"visit-{visit.pk}", "type": "SITE_VISIT", "title": f"Site visit · {visit.get_status_display()}", "note": visit.notes, "at": visit.updated_at})
    return {"follow_ups": followups, "timeline": sorted(timeline, key=lambda e: e["at"], reverse=True),
            "linked_quotations": quotes, "work_schedules": schedules, "visits": visits}
