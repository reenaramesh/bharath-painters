"""Synchronize stable source-linked ProjectScope rows from approved effective work."""
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import ProjectScope, Quotation, QuotationItem, WorkChangeItem
from .work_changes import current_scope


def _save_effective_row(quotation, *, row, source_item=None, source_change_item=None):
    key = row["key"]
    source = {"source_quotation_item": source_item} if source_item else {"source_work_change_item": source_change_item}
    scope = ProjectScope.objects.select_for_update().filter(quotation=quotation, **source).first()
    defaults = {
        "title": str(row["description"] or row["service"] or "Project work")[:200],
        "category": source_item.service_category if source_item else (
            source_change_item.new_service_type.category_master if source_change_item and source_change_item.new_service_type_id
            else source_change_item.original_item.service_category if source_change_item and source_change_item.original_item_id else None
        ),
        "unit": source_item.unit if source_item else (source_change_item.unit if source_change_item else None),
        "measurement_record": quotation.measurement_record,
        "quantity": Decimal(str(row["quantity"] or 0)),
        "unit_rate": Decimal(str(row["rate"] or 0)),
        "status": ProjectScope.Status.CONFIRMED,
    }
    if scope is None:
        scope = ProjectScope.objects.create(quotation=quotation, **source, **defaults)
    else:
        if scope.completed_quantity > defaults["quantity"]:
            raise ValidationError({"scope": f"The approved effective scope for {key} is below its already recorded completed quantity."})
        for field, value in defaults.items():
            setattr(scope, field, value)
        if scope.completed_quantity >= scope.quantity and scope.quantity > 0:
            scope.status = ProjectScope.Status.COMPLETED
        elif scope.completed_quantity > 0:
            scope.status = ProjectScope.Status.IN_PROGRESS
        elif scope.status in (ProjectScope.Status.PROPOSED, ProjectScope.Status.CANCELLED):
            scope.status = ProjectScope.Status.CONFIRMED
        scope.save()
    return scope


@transaction.atomic
def sync_project_scopes(quotation: Quotation):
    """Persist effective scope with source IDs; never infer links from text or quantities."""
    Quotation.objects.select_for_update().get(pk=quotation.pk)
    effective = {row["key"]: row for row in current_scope(quotation)}
    scopes = []
    items = quotation.items.select_related("service_category", "unit").order_by("id")
    for item in items:
        key = f"quotation-{item.pk}"
        row = effective.get(key)
        if row:
            scopes.append(_save_effective_row(quotation, row=row, source_item=item))
        else:
            scope = ProjectScope.objects.select_for_update().filter(quotation=quotation, source_quotation_item=item).first()
            if scope:
                if scope.completed_quantity > 0:
                    raise ValidationError({"scope": f"Approved work changes remove {key}, which already has recorded progress."})
                scope.quantity = Decimal("0")
                scope.status = ProjectScope.Status.CANCELLED
                scope.save(update_fields=("quantity", "status", "amount", "updated_at"))
                scopes.append(scope)

    for row in effective.values():
        change_id = row.get("source_change_item")
        if not change_id:
            continue
        line = WorkChangeItem.objects.select_related("new_service_type__category_master", "original_item__service_category", "unit").get(
            pk=change_id, work_change__quotation=quotation, work_change__status="APPROVED",
        )
        scopes.append(_save_effective_row(quotation, row=row, source_change_item=line))
    return scopes
