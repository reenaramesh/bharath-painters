import re
from collections import defaultdict
from django.db import models

from .models import Quotation, QuotationItem, QuotationRoom


def _copy_concrete_fields(instance, excluded):
    values = {}
    for field in instance._meta.concrete_fields:
        if field.primary_key or field.name in excluded or field.attname in excluded:
            continue
        if getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False):
            continue
        values[field.attname] = getattr(instance, field.attname)
    return values


def _base_number(quotation):
    root = quotation.revision_of or quotation
    return re.sub(r"-V\d+$", "", root.quotation_number, flags=re.IGNORECASE)


def clone_quotation_revision(quotation, note, responded_at):
    """Preserve the supplied quotation and create the next editable version."""
    root = quotation.revision_of or quotation
    next_version = quotation.version_number + 1
    base_number = _base_number(quotation)

    if quotation.version_number == 1 and not re.search(r"-V1$", quotation.quotation_number, re.IGNORECASE):
        quotation.quotation_number = f"{base_number}-V1"

    quotation.status = Quotation.Status.REVISION_REQUESTED
    quotation.customer_response_note = note
    quotation.customer_responded_at = responded_at
    quotation.save(
        update_fields=(
            "quotation_number",
            "status",
            "customer_response_note",
            "customer_responded_at",
            "updated_at",
        )
    )

    quotation_values = _copy_concrete_fields(
        quotation,
        {
            "quotation_number",
            "status",
            "sent_at",
            "customer_response_note",
            "customer_responded_at",
            "revision_of",
            "accepted_via_receipt_at",
            "version_number",
        },
    )
    revised = Quotation.objects.create(
        **quotation_values,
        quotation_number=f"{base_number}-V{next_version}",
        revision_of=root,
        version_number=next_version,
        status=Quotation.Status.DRAFT,
        sent_at=None,
        customer_response_note=note,
        customer_responded_at=responded_at,
    )

    room_map = {}
    for room in quotation.rooms.all().order_by("id"):
        room_values = _copy_concrete_fields(room, {"quotation"})
        cloned_room = QuotationRoom.objects.create(
            **room_values,
            quotation=revised,
        )
        room_map[room.id] = cloned_room

    for item in quotation.items.all().order_by("id"):
        item_values = _copy_concrete_fields(item, {"quotation", "room"})
        QuotationItem.objects.create(
            **item_values,
            quotation=revised,
            room=room_map.get(item.room_id),
        )
    return revised


def previous_revision(quotation):
    if quotation.version_number <= 1:
        return None
    root = quotation.revision_of or quotation
    return (
        Quotation.objects.filter(
            models.Q(pk=root.pk) | models.Q(revision_of=root),
            version_number=quotation.version_number - 1,
        )
        .prefetch_related("items__room", "items__service_type")
        .first()
    )


def quotation_revision_history(quotation, *, include_drafts=False):
    """Call only after detail authorization; keep private Drafts out of portal."""
    root_id = quotation.revision_of_id or quotation.pk
    versions = Quotation.objects.filter(
        models.Q(pk=root_id) | models.Q(revision_of_id=root_id),
        contractor_id=quotation.contractor_id, customer_id=quotation.customer_id,
        property_id=quotation.property_id, deleted_at__isnull=True,
    )
    if not include_drafts:
        versions = versions.exclude(status=Quotation.Status.DRAFT)
    return list(versions.order_by("version_number", "id").values(
        "id", "quotation_number", "version_number", "status", "quotation_date",
        "sent_at", "grand_total", "customer_responded_at",
    ))


def quotation_revision_changes(quotation):
    previous = previous_revision(quotation)
    if not previous:
        return None

    def key(item):
        details = item.specification_details or {}
        if details.get("assignment_id"):
            return ("assignment", details["assignment_id"])
        return (
            (item.room.name if item.room else "General").strip().lower(),
            item.service_type_id,
            (item.description or "").strip().lower(),
        )

    previous_groups = defaultdict(list)
    current_groups = defaultdict(list)
    for item in previous.items.all().order_by("id"):
        previous_groups[key(item)].append(item)
    for item in quotation.items.all().order_by("id"):
        current_groups[key(item)].append(item)

    added = []
    removed = []
    price_changes = []
    discount_changes = []
    specification_changes = []
    from .discounts import line_discount
    from .quotation_pdf_labels import quotation_room_area_label

    def line_summary(item):
        return {
            "description": item.description or "Quotation line",
            "room": quotation_room_area_label(item) or "General",
            "service": (
                item.service_name_snapshot
                or (item.service_type.name if item.service_type else "")
                or item.custom_service_type
                or item.custom_service_category
                or item.service_category_name_snapshot
                or "Service"
            ),
            "amount": item.amount,
        }

    for item_key in dict.fromkeys([*previous_groups, *current_groups]):
        old_rows = previous_groups[item_key]
        new_rows = current_groups[item_key]
        common = min(len(old_rows), len(new_rows))
        for index in range(common):
            old = old_rows[index]
            new = new_rows[index]
            old_net, new_net = old.amount - line_discount(old), new.amount - line_discount(new)
            if old.rate != new.rate or old.amount != new.amount or old_net != new_net:
                price_changes.append(
                    {
                        "description": new.description or "Quotation line",
                        "room": quotation_room_area_label(new) or "General",
                        "service": (
                            new.service_name_snapshot
                            or (new.service_type.name if new.service_type else "")
                            or new.custom_service_type
                            or new.custom_service_category
                            or new.service_category_name_snapshot
                            or "Service"
                        ),
                        "previous_price": old.amount,
                        "current_price": new.amount,
                        "difference": new.amount - old.amount,
                        "previous_net": old_net,
                        "current_net": new_net,
                        "net_difference": new_net - old_net,
                    }
                )
            if (old.discount_type, old.discount_value) != (new.discount_type, new.discount_value):
                discount_changes.append({**line_summary(new),
                    "previous_type": old.discount_type, "previous_value": old.discount_value,
                    "current_type": new.discount_type, "current_value": new.discount_value,
                    "previous_discount": line_discount(old), "current_discount": line_discount(new),
                })
            scope_fields = (
                "description", "quantity", "coats", "calculation_method", "included_areas",
                "service_category_id", "service_type_id", "paint_type_id", "paint_brand_id", "unit_id",
                "custom_service_category", "custom_service_type", "custom_product_type", "custom_brand", "custom_unit",
                "service_category_name_snapshot", "service_name_snapshot", "product_type_name_snapshot",
                "brand_name_snapshot", "unit_name_snapshot", "specification_details",
            )
            changed = {field: {"previous": getattr(old, field), "current": getattr(new, field)}
                       for field in scope_fields if getattr(old, field) != getattr(new, field)}
            if changed:
                specification_changes.append({**line_summary(new), "fields": changed})
        added.extend(line_summary(item) for item in new_rows[common:])
        removed.extend(line_summary(item) for item in old_rows[common:])

    return {
        "previous_id": previous.id,
        "previous_number": previous.quotation_number,
        "previous_version": previous.version_number,
        "previous_total": previous.grand_total,
        "current_total": quotation.grand_total,
        "amount_difference": quotation.grand_total - previous.grand_total,
        "added_lines": added,
        "removed_lines": removed,
        "price_changes": price_changes,
        "discount_changes": discount_changes,
        "specification_changes": specification_changes,
        "quotation_changes": {
            field: {"previous": getattr(previous, field), "current": getattr(quotation, field)}
            for field in ("discount_mode", "discount_type", "discount_value", "gst_mode", "gst_percentage",
                          "notes", "terms_conditions", "payment_terms", "work_duration", "work_procedures")
            if getattr(previous, field) != getattr(quotation, field)
        },
    }
