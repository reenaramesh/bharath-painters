"""Read-only, contractor-scoped follow-up context, assembled in fixed batches."""
from datetime import date, datetime
import re
from zoneinfo import ZoneInfo

from django.db.models import Exists, F, OuterRef, Prefetch, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    ContractorCustomerConnection, Customer, CustomerFollowUp, CustomerWorkHistory,
    Lead, QuotationItem, SavedCustomerContact,
)

INDIA = ZoneInfo("Asia/Kolkata")
COMMUNICATION_TYPES = {"CALL", "WHATSAPP", "EMAIL", "MEETING", "OFFICE_MEETING", "SITE_VISIT"}
CLOSED_REQUIREMENTS = {"COMPLETED", "LOST", "CANCELLED"}
METHOD_LABELS = dict(CustomerFollowUp.FollowUpType.choices)
OUTCOME_LABELS = dict(CustomerFollowUp.Outcome.choices)


def available_customers(contractor):
    """A saved contact alone does not override connection/account restrictions."""
    if contractor.role != "CONTRACTOR" or not contractor.is_active:
        return Customer.objects.none()
    own_connected = ContractorCustomerConnection.objects.filter(
        customer_id=OuterRef("pk"), contractor=contractor, status="CONNECTED").exclude(customer_status="CANCELLED")
    any_connection = ContractorCustomerConnection.objects.filter(customer_id=OuterRef("pk"))
    return Customer.objects.annotate(
        finder_connected=Exists(own_connected), finder_has_connection=Exists(any_connection),
    ).filter(
        Q(finder_connected=True) | Q(contractor=contractor, finder_has_connection=False),
    ).exclude(status="CANCELLED").filter(
        Q(portal_user__isnull=True) | Q(portal_user__is_active=True, portal_user__role="CUSTOMER"),
    ).order_by("pk")


def india_date(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00")) if "T" in value else date.fromisoformat(value)
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            value = timezone.make_aware(value, INDIA)
        return value.astimezone(INDIA).date()
    return value


def followup_context(contractor, customers):
    """Return one context/customer without serializer queries or per-row fetches.

    Task callers may supply historical customers. Only their own contact and
    activity rows are used; current availability is returned as can_follow_up.
    """
    from call_inbox.models import CallInboxEvent
    from jobs.models import WorkSchedule

    customers = list(customers)
    ids = [customer.pk for customer in customers]
    if not ids:
        return {}
    allowed = set(available_customers(contractor).filter(pk__in=ids).values_list("pk", flat=True))
    contacts = {row.customer_id: row.details for row in SavedCustomerContact.objects.filter(
        contractor=contractor, customer_id__in=ids)}
    connections = {row.customer_id: row for row in ContractorCustomerConnection.objects.filter(
        contractor=contractor, customer_id__in=ids)}
    rows = {}
    phones = {}
    for customer in customers:
        # Intentionally blank local fields must stay blank. Without local data,
        # only the original owner's legacy fields are safe to project.
        details = contacts.get(customer.pk)
        if details is None:
            details = {key: getattr(customer, key, "") for key in ("name", "mobile", "requirement", "status")} if customer.contractor_id == contractor.pk else {}
        connection = connections.get(customer.pk)
        requirement = connection.requirement if connection else details.get("requirement", "")
        requirement_status = connection.customer_status if connection else details.get("status", customer.status)
        if requirement_status in CLOSED_REQUIREMENTS:
            requirement = ""
        rows[customer.pk] = {
            "customer": customer.pk,
            "customer_name": details.get("name") or "",
            "customer_mobile": details.get("mobile") or "",
            "customer_bharath_id": customer.bharath_id,
            "requirement": requirement or "",
            "active_lead_count": 0,
            "last_contact_at": None,
            "last_contact_outcome": "",
            "last_contact_method": "",
            "last_contact_outcome_code": "",
            "last_contact_method_code": "",
            "last_service_name": "",
            "last_service_date": None,
            "has_service_history": False,
            "next_follow_up": None,
            "pending_follow_up_count": 0,
            "can_follow_up": customer.pk in allowed,
        }
        if customer.normalized_mobile:
            phones[customer.normalized_mobile] = customer.pk

    leads = Lead.objects.filter(contractor=contractor, customer_id__in=ids, archived_at__isnull=True).exclude(
        stage__in=CLOSED_REQUIREMENTS).order_by("-updated_at", "-pk")
    requirements = {key: [row["requirement"]] if row["requirement"] else [] for key, row in rows.items()}
    for lead in leads.only("customer_id", "title"):
        row = rows[lead.customer_id]
        row["active_lead_count"] += 1
        if lead.title and lead.title not in requirements[lead.customer_id]:
            requirements[lead.customer_id].append(lead.title)
    for key, labels in requirements.items():
        rows[key]["requirement"] = "; ".join(labels)

    # Ties are stable: actual completed tasks/outcomes outrank captured calls at
    # the same instant. No created_at, link clicks, or private NOTE is evidence.
    attempts = {}

    def record_attempt(customer_id, at, method, outcome, rank, event_id):
        if not at:
            return
        if timezone.is_naive(at):
            at = timezone.make_aware(at, INDIA)
        key = (at, rank, event_id)
        if customer_id not in attempts or key > attempts[customer_id]:
            attempts[customer_id] = key
            rows[customer_id].update(last_contact_at=at,
                last_contact_method=METHOD_LABELS.get(method, method), last_contact_method_code=method,
                last_contact_outcome=OUTCOME_LABELS.get(outcome, outcome.replace("_", " ").title()),
                last_contact_outcome_code=outcome)

    tasks = CustomerFollowUp.objects.filter(created_by=contractor, customer_id__in=ids).only(
        "pk", "customer_id", "opportunity_id", "follow_up_type", "outcome", "comment",
        "next_follow_up", "is_completed", "completed_at", "follow_up_date")
    for task in tasks:
        row = rows[task.customer_id]
        if not task.is_completed and task.next_follow_up:
            row["pending_follow_up_count"] += 1
            if row["next_follow_up"] is None or task.next_follow_up < row["next_follow_up"]:
                row["next_follow_up"] = task.next_follow_up
        if task.follow_up_type not in COMMUNICATION_TYPES:
            continue
        at = None
        if task.is_completed and task.completed_at:
            at = task.completed_at
        elif task.outcome:
            at = task.follow_up_date
        elif task.opportunity_id is None and task.next_follow_up is None and task.comment.strip():
            at = task.follow_up_date
        record_attempt(task.customer_id, at, task.follow_up_type, task.outcome, 1, task.pk)

    calls = CallInboxEvent.objects.filter(contractor=contractor).filter(
        Q(matched_customer_id__in=ids) | Q(matched_customer__isnull=True, normalized_mobile__in=phones),
    ).only("pk", "matched_customer_id", "normalized_mobile", "occurred_at", "call_status")
    for call in calls:
        customer_id = call.matched_customer_id or phones.get(call.normalized_mobile)
        if customer_id in rows:
            record_attempt(customer_id, call.occurred_at, "CALL", call.call_status or "UNKNOWN", 0, call.pk)

    service_keys = {}

    def record_service(customer_id, name, work_date, source_rank, event_id):
        row = rows[customer_id]
        row["has_service_history"] = True
        work_date = india_date(work_date)
        key = (work_date is not None, work_date or date.min, source_rank, event_id)
        if customer_id not in service_keys or key > service_keys[customer_id]:
            service_keys[customer_id] = key
            row.update(last_service_name=name or "Completed work", last_service_date=work_date)

    histories = CustomerWorkHistory.objects.filter(customer_id__in=ids).filter(
        Q(connection__contractor=contractor, connection__status="CONNECTED", connection__customer_id=F("customer_id"))
        | Q(connection__isnull=True, property__contractor=contractor, property__customer_id=F("customer_id")),
    ).only("pk", "customer_id", "service_name", "work_date")
    for history in histories:
        record_service(history.customer_id, history.service_name, history.work_date, 1, history.pk)

    schedules = WorkSchedule.objects.filter(
        quotation__contractor=contractor, quotation__customer_id__in=ids,
        quotation__deleted_at__isnull=True, status="COMPLETED",
    ).select_related("quotation__lead").prefetch_related(Prefetch(
        "quotation__items", queryset=QuotationItem.objects.select_related("service_type").order_by("pk")))
    for schedule in schedules:
        quotation = schedule.quotation
        names = []
        for item in quotation.items.all():
            name = item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type_id else "")
            if name and name not in names:
                names.append(name)
        lead = quotation.lead
        name = ", ".join(names) or (lead.title if lead and lead.contractor_id == contractor.pk
                                   and lead.customer_id == quotation.customer_id else "Completed work")
        # Undated completed work is still history, never dated by its creation.
        record_service(quotation.customer_id, name, schedule.work_completed_at, 0, schedule.pk)
    for row in rows.values():
        for field in ("last_contact_at", "last_service_date", "next_follow_up"):
            if row[field] is not None:
                row[field] = row[field].isoformat()
    return rows


def finder_options(params):
    category = params.get("category", "all")
    date_type = params.get("date_type", "next_follow_up")
    if category not in {"all", "requirements", "serviced"}:
        raise ValidationError({"category": "Choose all, requirements, or serviced."})
    if date_type not in {"next_follow_up", "last_contact", "last_service"}:
        raise ValidationError({"date_type": "Choose next_follow_up, last_contact, or last_service."})
    dates = {}
    for field in ("date_from", "date_to"):
        value = params.get(field)
        if value in (None, ""):
            dates[field] = None
            continue
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value)):
                raise ValueError
            dates[field] = date.fromisoformat(value)
        except (ValueError, TypeError):
            raise ValidationError({field: "Enter a valid date as YYYY-MM-DD."})
    if dates["date_from"] and dates["date_to"] and dates["date_from"] > dates["date_to"]:
        raise ValidationError({"date_to": "The end date must be on or after the start date."})
    integers = {}
    for field, default in (("page", 1), ("page_size", 25)):
        try:
            value = str(params.get(field, default))
            if not value.isdecimal() or int(value) < 1:
                raise ValueError
            integers[field] = int(value)
        except (ValueError, TypeError):
            raise ValidationError({field: "Enter a positive whole number."})
    integers["page_size"] = min(integers["page_size"], 100)
    missing = params.get("missing_date", "0")
    if missing not in ("0", "1", "", None):
        raise ValidationError({"missing_date": "Use 1 for dates that have not been recorded."})
    return {"category": category, "date_type": date_type, "missing": missing == "1", **dates, **integers}


class CustomerFollowUpCandidatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != "CONTRACTOR" or not request.user.is_active:
            raise PermissionDenied("Contractor access only.")
        options = finder_options(request.query_params)
        rows = list(followup_context(request.user, available_customers(request.user)).values())
        search = str(request.query_params.get("search") or "").strip().casefold()
        date_field = {"next_follow_up": "next_follow_up", "last_contact": "last_contact_at", "last_service": "last_service_date"}[options["date_type"]]
        filtered = []
        for row in rows:
            if not row["can_follow_up"]:
                continue
            if options["category"] == "requirements" and not (row["requirement"] or row["active_lead_count"]):
                continue
            if options["category"] == "serviced" and not row["has_service_history"]:
                continue
            if search and not any(search in str(row[key] or "").casefold() for key in (
                    "customer_name", "customer_mobile", "customer_bharath_id", "requirement", "last_service_name")):
                continue
            selected = india_date(row[date_field])
            if options["missing"]:
                if selected is not None:
                    continue
            elif options["date_from"] or options["date_to"]:
                if selected is None or (options["date_from"] and selected < options["date_from"]) or (options["date_to"] and selected > options["date_to"]):
                    continue
            filtered.append(row)
        # Repeatable pages, including customers with no due date or history.
        filtered.sort(key=lambda row: (row["customer_name"].casefold(), row["customer"]))
        start = (options["page"] - 1) * options["page_size"]
        return Response({"count": len(filtered), "page": options["page"], "page_size": options["page_size"],
                         "results": filtered[start:start + options["page_size"]]})
