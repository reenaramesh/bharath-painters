"""Lead-only delegation; employee membership never grants wider CRM access."""
from django.db.models import Exists, F, OuterRef, Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from jobs.models import ContractorApplicatorTeam
from .models import Customer, ContractorCustomerConnection, Lead, LeadStageHistory, PortalNotification


def active_employees(contractor=None):
    rows = ContractorApplicatorTeam.objects.filter(
        employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        is_active=True, painter__is_active=True, painter__role="PAINTER",
        painter__is_verified=True, painter__verification_status="VERIFIED",
        contractor__is_active=True, contractor__role="CONTRACTOR",
    ).exclude(contractor__verification_status="SUSPENDED")
    return rows.filter(contractor=contractor) if contractor is not None else rows


def lead_reader(user):
    if not user.is_active or user.role not in {"CONTRACTOR", "PAINTER"}:
        raise PermissionDenied("Contractor or assigned employee access only.")
    if user.role == "PAINTER" and not active_employees().filter(painter=user).exists():
        raise PermissionDenied("Active employee access required.")


def accessible_leads(user):
    lead_reader(user)
    if user.role == "CONTRACTOR":
        return Lead.objects.filter(contractor=user)
    memberships = active_employees().filter(painter=user, contractor_id=OuterRef("contractor_id"))
    connected = ContractorCustomerConnection.objects.filter(
        customer_id=OuterRef("customer_id"), contractor_id=OuterRef("contractor_id"), status="CONNECTED",
    )
    any_connection = ContractorCustomerConnection.objects.filter(
        customer_id=OuterRef("customer_id"), contractor_id=OuterRef("contractor_id"),
    )
    return Lead.objects.filter(assigned_user=user).annotate(
        employee_is_active=Exists(memberships), customer_is_connected=Exists(connected),
        customer_has_connection=Exists(any_connection),
    ).filter(employee_is_active=True).filter(
        Q(customer_is_connected=True) | Q(customer_has_connection=False, customer__contractor_id=F("contractor_id"))
    ).exclude(customer__status="CANCELLED").filter(Q(customer__portal_user__isnull=True) | Q(customer__portal_user__is_active=True, customer__portal_user__role="CUSTOMER"))


def resolve_assignee(contractor, value):
    if value is None:
        return None
    if value == contractor.pk:
        return contractor
    membership = active_employees(contractor).select_related("painter").select_for_update(of=("self",)).filter(painter_id=value).first()
    if not membership:
        raise ValidationError({"assigned_user": "Choose an active employee from your own team."})
    return membership.painter


def lock_employee_membership(user, lead):
    if user.role != "PAINTER":
        return
    # Membership removal and connection restrictions serialize with the write.
    # Do not lock account rows after a lead: schedule acceptance locks a painter
    # before updating the linked lead, so adding that lock here would deadlock.
    membership = active_employees(lead.contractor).select_related("painter").select_for_update(of=("self",)).filter(painter=user).first()
    if not membership:
        raise PermissionDenied("This lead assignment is no longer available.")
    customer = Customer.objects.select_for_update().get(pk=lead.customer_id)
    connection = ContractorCustomerConnection.objects.select_for_update().filter(customer=customer, contractor_id=lead.contractor_id).first()
    if (connection and connection.status != "CONNECTED") or (not connection and customer.contractor_id != lead.contractor_id) or customer.status == "CANCELLED":
        raise PermissionDenied("This customer relationship is no longer available.")
    if customer.portal_user_id:
        from accounts.models import BharathUser
        if not BharathUser.objects.filter(pk=customer.portal_user_id, is_active=True, role="CUSTOMER").exists():
            raise PermissionDenied("This customer account is unavailable.")


def assignment_changed(lead, previous_id, actor, initial=False):
    if not initial and previous_id == lead.assigned_user_id:
        return
    name = lead.assigned_user.get_full_name() or lead.assigned_user.mobile if lead.assigned_user_id else "Unassigned"
    note = f"Assigned to {name}" if initial else f"Assignment changed to {name}"
    LeadStageHistory.objects.create(lead=lead, from_stage=lead.stage, to_stage=lead.stage, note=note[:240], changed_by=actor)
    if lead.assigned_user_id and lead.assigned_user_id != lead.contractor_id:
        PortalNotification.objects.create(
            recipient=lead.assigned_user, actor=actor, event_type="LEAD_ASSIGNED",
            title="A lead has been assigned to you", message=f"{lead.reference_no}: review the enquiry and plan the next contact.",
            link=f"/opportunities/{lead.pk}",
        )


def employee_followups(lead):
    # Contractor NOTE entries are private. Conversation outcomes stay shared.
    return [task for task in lead.follow_ups.all()
            if task.created_by_id == lead.contractor_id and task.customer_id == lead.customer_id
            and (task.follow_up_type != "NOTE" or (task.performed_by_id and task.performed_by_id != lead.contractor_id))]


def lead_response(lead, viewer, detail=False):
    from .views import lead_data
    from .lead_workflow import activity_data
    data = lead_data(lead)
    employee = viewer.role == "PAINTER"
    profile = getattr(lead.contractor, "contractor_profile", None)
    data.update(
        assigned_user_name=(lead.assigned_user.get_full_name() or lead.assigned_user.mobile) if lead.assigned_user_id else "",
        contractor=lead.contractor_id,
        contractor_name=(profile.company_name if profile else "") or lead.contractor.get_full_name() or lead.contractor.mobile,
        can_manage_lead=not employee, can_assign=not employee, can_follow_up=not data["is_closed"],
    )
    if detail:
        data.update(activity_data(lead))
    if not employee:
        return data
    # Retain legacy keys, but never return the owner's private notes, amounts,
    # financial references, site details or contractor-only action destinations.
    for field in ("notes", "lost_note", "source_detail", "property_name"):
        data[field] = ""
    for field in ("estimated_value", "balance_due", "property", "job_id", "service_request"):
        data[field] = None
    data["history"] = [{**event, "note": ""} for event in data["history"]]
    tasks = employee_followups(lead)
    visible_ids = {task.pk for task in tasks}
    task_id = data["next_action"].get("task_id")
    data["next_action"] = {
        "label": "View history" if data["is_closed"] else "Record follow-up",
        "url": f"/opportunities/{lead.pk}" + ("" if data["is_closed"] else "?action=follow-up"),
        "kind": "CLOSED" if data["is_closed"] else "CALL", "due_at": data["next_action"]["due_at"],
        **({"task_id": task_id} if task_id in visible_ids else {}),
    }
    if detail:
        data["follow_ups"] = [task for task in data["follow_ups"] if task["id"] in visible_ids]
        data["timeline"] = [
            {**event, "title": "Lead progress updated", "note": ""} if event["type"] == "STAGE" else event
            for event in data["timeline"]
            if event["type"] == "STAGE" or (event["type"] == "FOLLOW_UP" and int(event["key"].split("-")[1]) in visible_ids)
        ]
        data["linked_quotations"] = [{**quote, "amount": None} for quote in data["linked_quotations"]]
        data["work_schedules"], data["visits"] = [], []
    return data
