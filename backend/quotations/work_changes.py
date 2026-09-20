from decimal import Decimal

from django.db.models import Sum

from .models import ProjectReceipt, WorkChange, WorkChangeItem


def payments_received(quotation):
    receipts = quotation.project_receipts.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    schedule = getattr(quotation, "work_schedule", None)
    advance = Decimal("0")
    if schedule and schedule.payment_status == "CONFIRMED" and schedule.advance_amount:
        advance = schedule.advance_amount
    return receipts + advance


def work_change_summary(quotation):
    approved = WorkChangeItem.objects.filter(
        work_change__quotation=quotation,
        work_change__status=WorkChange.Status.APPROVED,
    )
    additions = approved.filter(price_difference__gt=0).aggregate(total=Sum("price_difference"))["total"] or Decimal("0")
    signed_deductions = approved.filter(price_difference__lt=0).aggregate(total=Sum("price_difference"))["total"] or Decimal("0")
    net = additions + signed_deductions
    revised = quotation.grand_total + net
    paid = payments_received(quotation)
    return {
        "original_contract": quotation.grand_total,
        "approved_additions": additions,
        "approved_deductions": abs(signed_deductions),
        "net_work_changes": net,
        "revised_contract_value": revised,
        "payments_received": paid,
        "balance": max(revised - paid, Decimal("0")),
    }


def current_scope(quotation):
    scope = []
    by_original = {}
    for item in quotation.items.select_related("room", "service_type", "paint_type", "paint_brand", "unit").all():
        row = {
            "key": f"quotation-{item.id}",
            "source_item": item.id,
            "source_change_item": None,
            "room": item.room.name if item.room else "General",
            "service": item.service_name_snapshot or (item.service_type.name if item.service_type else ""),
            "material": item.product_type_name_snapshot or (item.paint_type.name if item.paint_type else ""),
            "brand": item.brand_name_snapshot or (item.paint_brand.name if item.paint_brand else ""),
            "description": item.description,
            "unit": item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else ""),
            "quantity": item.quantity,
            "rate": item.rate,
            "amount": item.amount,
            "origin": "ORIGINAL",
        }
        scope.append(row)
        by_original[item.id] = row

    approved_lines = WorkChangeItem.objects.filter(
        work_change__quotation=quotation,
        work_change__status=WorkChange.Status.APPROVED,
    ).select_related("work_change", "original_item").order_by("work_change__approved_at", "id")
    for line in approved_lines:
        if line.change_type == WorkChangeItem.ChangeType.ADD_WORK:
            scope.append(_changed_scope_row(line, line.changed_quantity))
            continue
        base = by_original.get(line.original_item_id)
        if not base:
            continue
        if line.change_type == WorkChangeItem.ChangeType.REMOVE_WORK:
            base["quantity"] = max(base["quantity"] - line.changed_quantity, Decimal("0"))
            base["amount"] = (base["quantity"] * base["rate"]).quantize(Decimal("0.01"))
        elif line.change_type in {WorkChangeItem.ChangeType.CHANGE_SERVICE, WorkChangeItem.ChangeType.CHANGE_MATERIAL}:
            base["quantity"] = max(base["quantity"] - line.changed_quantity, Decimal("0"))
            base["amount"] = (base["quantity"] * base["rate"]).quantize(Decimal("0.01"))
            scope.append(_changed_scope_row(line, line.changed_quantity))
        elif line.change_type == WorkChangeItem.ChangeType.CHANGE_QUANTITY:
            base["quantity"] = line.changed_quantity
            base["rate"] = line.new_rate
            base["amount"] = line.new_amount
    return [row for row in scope if row["quantity"] > 0]


def _changed_scope_row(line, quantity):
    return {
        "key": f"change-{line.id}",
        "source_item": line.original_item_id,
        "source_change_item": line.id,
        "room": line.area_name or "General",
        "service": line.new_service_snapshot or line.original_service_snapshot,
        "material": line.new_material_snapshot or line.original_material_snapshot,
        "brand": line.new_brand_snapshot or line.original_brand_snapshot,
        "description": line.description,
        "unit": line.unit_snapshot,
        "quantity": quantity,
        "rate": line.new_rate,
        "amount": line.new_amount,
        "origin": "WORK_CHANGE",
        "change_number": line.work_change.change_number,
    }
