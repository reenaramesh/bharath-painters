from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .lead_workflow import followup_time, owned_leads, sync_next_follow_up, workflow_data
from .models import CustomerFollowUp, LeadStageHistory
from .serializers import CustomerFollowUpSerializer
from .lead_access import active_employees, employee_followups, lead_reader, lock_employee_membership


def contractor_only(request):
    if request.user.role != "CONTRACTOR":
        raise PermissionDenied("Contractor access only.")


class LeadSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        lead_reader(request.user)
        rows = [workflow_data(lead) for lead in owned_leads(request.user, request.query_params)]
        if request.query_params.get("stage"):
            rows = [row for row in rows if row["workflow_stage"] == request.query_params["stage"]]
        keys = ("overdue", "today", "needs_action", "awaiting_decision", "in_progress", "payment_pending", "active", "closed", "need_call", "need_quotation", "post_quotation", "visits", "unassigned")
        return Response({"total": len(rows), "counts": {key: sum(int(row["queue_flags"][key]) for row in rows) for key in keys},
            "urgency": {key: {period: sum(int(row["queue_flags"][key] and row["queue_flags"][period]) for row in rows)
                for period in ("today", "overdue")} for key in keys}})


class LeadAssigneesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        contractor_only(request)
        employees = active_employees(request.user).select_related("painter").order_by("painter__first_name", "painter_id")
        return Response([{"id": membership.painter_id, "name": membership.painter.get_full_name() or membership.painter.mobile}
                         for membership in employees])


class LeadFollowUpView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        lead_reader(request.user)
        lead = get_object_or_404(owned_leads(request.user), pk=pk)
        rows = lead.follow_ups.filter(created_by_id=lead.contractor_id, customer=lead.customer).order_by("-created_at")
        if request.user.role == "PAINTER":
            visible = {task.pk for task in employee_followups(lead)}
            rows = rows.filter(pk__in=visible)
        return Response(CustomerFollowUpSerializer(rows, many=True).data)

    @transaction.atomic
    def post(self, request, pk):
        lead_reader(request.user)
        lead = get_object_or_404(owned_leads(request.user).select_for_update(of=("self",)), pk=pk)
        lock_employee_membership(request.user, lead)
        if request.user.role == "PAINTER":
            allowed = {"creation_key", "next_follow_up", "follow_up_type", "outcome", "comment", "next_action", "completed_task"}
            if set(request.data) - allowed:
                raise ValidationError({"detail": "Employees can record contact outcomes and follow-ups only."})
        creation_key = str(request.data.get("creation_key") or "").strip() or None
        if creation_key and len(creation_key) > 100:
            raise ValidationError({"creation_key": "Use at most 100 characters."})
        if creation_key:
            previous = lead.follow_ups.filter(created_by_id=lead.contractor_id, performed_by=request.user, creation_key=creation_key).first()
            if previous:
                return Response(CustomerFollowUpSerializer(previous).data)
        current_workflow = workflow_data(lead)
        if current_workflow["is_closed"]:
            raise ValidationError({"detail": "Reopen this lead before adding a follow-up."})
        due = followup_time(request.data.get("next_follow_up"))
        if request.data.get("outcome") in {"WON", "LOST"}:
            raise ValidationError({"outcome": "Quotation approval and lead closure remain contractor actions."})
        values = {key: request.data[key] for key in ("follow_up_type", "outcome", "comment", "next_action") if key in request.data}
        values.update(opportunity=lead.pk, next_follow_up=due, is_completed=not bool(due), creation_key=creation_key)
        serializer = CustomerFollowUpSerializer(data=values, context={"request": request, "lead_delegation": True})
        serializer.is_valid(raise_exception=True)
        task_id = request.data.get("completed_task")
        if task_id:
            task = get_object_or_404(CustomerFollowUp.objects.select_for_update(), pk=task_id, opportunity=lead, customer=lead.customer, created_by_id=lead.contractor_id)
            if request.user.role == "PAINTER" and task.pk not in {row.pk for row in employee_followups(lead)}:
                raise PermissionDenied("This scheduled action is private to the contractor.")
            if task.is_completed:
                return Response({"detail": "This follow-up was already completed. Refresh the lead and choose a pending action."}, status=409)
            task.is_completed, task.completed_at = True, timezone.now()
            task.completed_by = request.user
            task._lead_change_actor = request.user
            task.save(update_fields=("is_completed", "completed_at", "completed_by"))
        followup = serializer.save(customer=lead.customer, created_by=lead.contractor, performed_by=request.user,
                                   completed_by=request.user if not due else None)
        outcome = followup.outcome
        work_started = current_workflow["workflow_stage"] in {"WON", "IN_PROGRESS", "COMPLETED"}
        if outcome == "QUOTATION_REQUIRED" and not work_started:
            previous = lead.stage
            lead.stage = "QUOTATION"
            lead.save(update_fields=("stage", "updated_at"))
            LeadStageHistory.objects.create(lead=lead, from_stage=previous, to_stage=lead.stage, note="Quotation required", changed_by=request.user)
        elif outcome == "SITE_VISIT_REQUIRED" and not work_started:
            previous = lead.stage
            lead.stage = "SITE_VISIT"
            lead.save(update_fields=("stage", "updated_at"))
            LeadStageHistory.objects.create(lead=lead, from_stage=previous, to_stage=lead.stage, note="Site visit required", changed_by=request.user)
        elif outcome in {"NEGOTIATION", "REVISED_QUOTE"} and not work_started:
            previous = lead.stage
            lead.stage = "NEGOTIATION"
            lead.save(update_fields=("stage", "updated_at"))
            LeadStageHistory.objects.create(lead=lead, from_stage=previous, to_stage=lead.stage, note="Negotiation recorded in follow-up", changed_by=request.user)
        elif lead.stage == "NEW" and not work_started and outcome not in {"NO_RESPONSE", "WON", "LOST"}:
            lead.stage = "CONTACTED"
            lead.save(update_fields=("stage", "updated_at"))
            LeadStageHistory.objects.create(lead=lead, from_stage="NEW", to_stage="CONTACTED", note="Customer contact recorded", changed_by=request.user)
        sync_next_follow_up(lead.pk)
        # Retain the follow-up's contractor ownership so customer/task screens
        # see employee updates without changing their existing permission model.
        if request.user.pk != lead.contractor_id:
            lead.save(update_fields=("updated_at",))
        if outcome in {"QUOTATION_REQUIRED", "REVISED_QUOTE"}:
            from .views import create_notification
            create_notification(lead.contractor, "LEAD_QUOTATION_REQUIRED", "Quotation needs attention",
                f"{lead.reference_no}: an enquiry needs a quotation prepared or revised.", f"/opportunities/{lead.pk}", request.user)
        return Response(CustomerFollowUpSerializer(followup).data, status=201)
