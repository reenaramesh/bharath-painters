"""Schedule-scoped work tracking, separate from quotation prices and approvals."""
from collections.abc import Mapping
from hashlib import sha256
import json
from uuid import UUID

from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from quotations.models import Quotation, QuotationItem
from quotations.property_access import PropertyPermission, has_property_access
from quotations.quotation_pdf_labels import quotation_contribution_room_names, quotation_room_area_label
from .models import WorkSchedule, WorkScheduleLineProgress

STATUSES = {"NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"}
LOCKED_STATES = {"CANCELLED", "COMPLETED"}


def scope_for(item):
    return {"description": item.description, "service": item.service_name_snapshot,
            "product": item.product_type_name_snapshot, "brand": item.brand_name_snapshot,
            "room": item.room.name if item.room_id else ", ".join(str(area) for area in item.included_areas),
            "quantity": str(item.quantity), "unit": item.unit_name_snapshot or item.custom_unit,
            "coats": item.coats}


def scope_token(scope):
    return sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()


def display_scope_for(item):
    """Quotation labels only: do not alter stored work scopes or save tokens."""
    details = item.specification_details if isinstance(item.specification_details, dict) else {}
    rooms = quotation_contribution_room_names(details)
    room_name = details.get("room_name") if isinstance(details.get("room_name"), str) else ""
    return {
        "room": ", ".join(rooms) or quotation_room_area_label(item) or room_name,
        "service": item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type_id else ""),
        "product": item.product_type_name_snapshot or item.custom_product_type or (item.paint_type.name if item.paint_type_id else ""),
        "unit": item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit_id else ""),
    }


def contractor(user, schedule):
    return user.role == "CONTRACTOR" and schedule.quotation.contractor_id == user.pk


def accessible_schedule(user, pk):
    from .views import schedule_access
    schedule = WorkSchedule.objects.select_related("quotation__property", "quotation__customer").filter(pk=pk).first()
    if not schedule or not (contractor(user, schedule) or (user.role == "CUSTOMER" and schedule_access(user, schedule))):
        return None
    if user.role == "CUSTOMER" and schedule.quotation.property_id and not has_property_access(user, schedule.quotation.property, PropertyPermission.VIEW_PROGRESS):
        return None
    return schedule


def line_data(schedule, item, progress, user):
    current = item is not None
    scope = scope_for(item) if current else progress.scope_snapshot
    owner = contractor(user, schedule)
    data = {**scope, "item_id": item.pk if current else None, "progress_id": progress.pk if progress else None,
            "is_current": current, "can_edit": owner and current and schedule.status not in LOCKED_STATES,
            "steps": progress.steps if progress else [], "version": progress.version if progress else 0,
            "scope_token": scope_token(scope), "scope_changed": bool(progress and scope != progress.scope_snapshot),
            "updated_at": progress.updated_at if progress else None}
    # Display-only expansion: keep scope snapshots/tokens and old clients intact.
    details = item.specification_details if current else {}
    details = details if isinstance(details, dict) else {}
    surfaces = details.get('surfaces') or [details.get('surface')]
    surfaces = [surfaces] if isinstance(surfaces, str) else surfaces
    data['surfaces'] = [value for value in surfaces if isinstance(value, str) and value] if isinstance(surfaces, list) else []
    data['display_scope'] = display_scope_for(item) if current else {key: scope.get(key, "") for key in ("room", "service", "product", "unit")}
    if owner:
        data["note"] = progress.note if progress else ""
        data["updated_by"] = (progress.updated_by.get_full_name() or "Contractor") if progress and progress.updated_by_id else ""
    return data


def validate_update(data, schedule):
    if not isinstance(data, Mapping) or set(data) - {"version", "scope_token", "steps", "note"}:
        return "Provide work steps, a line note, version and quotation scope only."
    if type(data.get("version")) is not int or data["version"] < 0 or not isinstance(data.get("scope_token"), str):
        return "Reload this quotation line before saving."
    note, steps = data.get("note"), data.get("steps")
    if not isinstance(note, str) or len(note) > 4000 or "\x00" in note:
        return "The line note must be text of up to 4000 characters."
    if not isinstance(steps, list) or len(steps) > 40:
        return "Use up to 40 work steps per quotation line."
    seen = set()
    for step in steps:
        if not isinstance(step, dict) or set(step) != {"id", "label", "status"}:
            return "Each work step needs an ID, name and status."
        try:
            step_id = str(UUID(step["id"])) if isinstance(step["id"], str) else ""
        except ValueError:
            step_id = ""
        if not step_id or step_id in seen or step_id != step["id"]:
            return "Work-step IDs must be distinct valid IDs."
        seen.add(step_id)
        if not isinstance(step["label"], str) or not step["label"].strip() or len(step["label"]) > 120 or "\x00" in step["label"]:
            return "Give each work step a name of up to 120 characters."
        if not isinstance(step["status"], str) or step["status"] not in STATUSES:
            return "Choose a valid work-step status."
        if schedule.status != "IN_PROGRESS" and step["status"] != "NOT_STARTED":
            return "Start the scheduled work before recording work-step progress."
    return ""


class ScheduleWorkItemsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        schedule = accessible_schedule(request.user, pk)
        if not schedule:
            return Response({"detail": "Schedule not found."}, status=404)
        progress = list(schedule.line_progress.select_related("updated_by").order_by("pk"))
        linked = {row.item_id: row for row in progress if row.item_id}
        items = [line_data(schedule, item, linked.get(item.pk), request.user)
                 for item in schedule.quotation.items.select_related("room", "service_type", "paint_type", "unit").order_by("pk")]
        items.extend(line_data(schedule, None, row, request.user) for row in progress if row.item_id is None)
        return Response({"schedule": schedule.pk, "schedule_status": schedule.status,
                         "can_manage": contractor(request.user, schedule), "items": items})

    @transaction.atomic
    def patch(self, request, pk, item_id):
        schedule = accessible_schedule(request.user, pk)
        if not schedule:
            return Response({"detail": "Schedule not found."}, status=404)
        if not contractor(request.user, schedule):
            return Response({"detail": "Only the issuing contractor can update work steps."}, status=403)
        Quotation.objects.select_for_update(of=("self",)).get(pk=schedule.quotation_id)
        schedule = WorkSchedule.objects.select_for_update(of=("self",)).select_related("quotation").get(pk=pk)
        if schedule.status in LOCKED_STATES:
            return Response({"detail": "Completed or cancelled schedules are read-only."}, status=400)
        item = QuotationItem.objects.select_related("room", "service_type", "paint_type", "unit").filter(pk=item_id, quotation_id=schedule.quotation_id).first()
        if not item:
            return Response({"detail": "Quotation line not found in this schedule."}, status=404)
        error = validate_update(request.data, schedule)
        if error:
            return Response({"detail": error}, status=400)
        scope = scope_for(item)
        progress = schedule.line_progress.filter(item=item).first()
        version = progress.version if progress else 0
        if request.data["version"] != version or request.data["scope_token"] != scope_token(scope):
            return Response({"detail": "This line changed. Reload the latest saved work before saving again."}, status=409)
        if progress is None:
            progress = WorkScheduleLineProgress(schedule=schedule, item=item)
        progress.scope_snapshot = scope
        progress.steps = [{**step, "label": step["label"].strip()} for step in request.data["steps"]]
        progress.note = request.data["note"]
        progress.version = version + 1
        progress.updated_by = request.user
        progress.save()
        return Response(line_data(schedule, item, progress, request.user))
