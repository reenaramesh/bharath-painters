"""Margin-only preparation over a frozen, complete customer quotation snapshot."""
from decimal import Decimal, ROUND_FLOOR
from rest_framework import serializers
from quotations.pricing import calculate_pricing
from quotations.discounts import discount_amount

CENT = Decimal("0.01")

class MarginLine(serializers.Serializer):
    source_item = serializers.IntegerField(min_value=1)
    margin_type = serializers.ChoiceField(choices=["PERCENTAGE", "FIXED"], default="PERCENTAGE")
    margin_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)

class MarginInput(serializers.Serializer):
    margin_mode = serializers.ChoiceField(choices=["LINE", "OVERALL"])
    margin_type = serializers.ChoiceField(choices=["PERCENTAGE", "FIXED"], default="PERCENTAGE")
    margin_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    lines = MarginLine(many=True, allow_empty=False)
    share_site_pin = serializers.BooleanField(default=False)
    share_customer_address = serializers.BooleanField(default=False)
    share_customer_contact = serializers.BooleanField(default=False)
    show_pricing_adjustment = serializers.BooleanField(default=False)
    gst_mode = serializers.ChoiceField(choices=["NO_GST", "GST_EXTRA", "GST_INCLUDED"], required=False)
    gst_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, required=False)


def allocate(amount, weights):
    """Allocate exact cents proportionally, with stable largest-remainder ties."""
    amount = Decimal(amount).quantize(CENT)
    total = sum(weights, Decimal(0))
    if not total:
        return [Decimal(0).quantize(CENT) for _ in weights]
    raw = [amount * weight / total / CENT for weight in weights]
    cents = [value.to_integral_value(rounding=ROUND_FLOOR) for value in raw]
    remaining = int(amount / CENT - sum(cents))
    for index in sorted(range(len(weights)), key=lambda index: (-(raw[index] - cents[index]), index))[:remaining]:
        cents[index] += 1
    return [value * CENT for value in cents]


def source_snapshot(quotation, items):
    from .pricing import public_specification
    amounts = [item.amount for item in items]
    settings = {key: getattr(quotation, key) for key in ("discount_mode", "discount_type", "discount_value", "gst_mode", "gst_percentage")}
    totals = calculate_pricing(items, settings)
    reductions = [discount_amount(item.amount, item.discount_type, item.discount_value) for item in items] if quotation.discount_mode == "LINE" else allocate(totals["discount"], amounts)
    eligible = [amount - reduction for amount, reduction in zip(amounts, reductions)]
    if quotation.gst_mode == "GST_INCLUDED":
        tax = allocate(totals["gst_amount"], eligible)
        eligible = [amount - included_tax for amount, included_tax in zip(eligible, tax)]
    prop = quotation.property
    customer = quotation.customer
    rows = []
    for item, basis in zip(items, eligible):
        spec = public_specification(item)
        rows.append({"id": item.pk, "description": item.description, "quantity": str(item.quantity), "rate": str(item.rate),
            "amount": str(item.amount), "eligible_amount": str(basis), "unit_name": item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else ""),
            "service_category": item.service_category_id, "category_name": item.service_category_name_snapshot or item.custom_service_category or (item.service_category.name if item.service_category else ""),
            "specification": spec, "discount_type": item.discount_type, "discount_value": str(item.discount_value)})
    return {"quotation_id": quotation.pk, "quotation_number": quotation.quotation_number, "revision": quotation.version_number,
        "items": rows, "subtotal": str(quotation.subtotal), "discount": str(totals["discount"]), "total": str(quotation.grand_total),
        "gst_mode": quotation.gst_mode, "gst_percentage": str(quotation.gst_percentage), "notes": quotation.notes, "terms": quotation.terms_conditions,
        "customer_name": customer.name, "customer_mobile": customer.mobile, "customer_email": getattr(customer, "email", ""),
        "site_address": prop.address if prop else "", "city": prop.city if prop else "", "site_pin": prop.google_maps_url if prop else ""}


def prepare_margins(quotation, mode, payload, items, existing=None, allocation_source=None):
    from .pricing import APPROVED
    if mode not in ("WITH_MATERIAL", "WITHOUT_MATERIAL") or (not existing and (quotation.status not in APPROVED or quotation.deleted_at)):
        raise serializers.ValidationError({"quotation": "Select an approved quotation revision."})
    serializer = MarginInput(data=payload)
    serializer.is_valid(raise_exception=True)
    config = serializer.validated_data
    if set(payload) - set(serializer.fields) or any(set(line) - set(MarginLine().fields) for line in payload["lines"]):
        raise serializers.ValidationError({"pricing_input": "Only margin and visibility fields are accepted."})
    forbidden = {"unit_rate", "discount_mode", "discount_type", "discount_value", "labour_method", "adjustment_percent"}
    if forbidden.intersection(payload) or any(forbidden.intersection(line) for line in payload["lines"]):
        raise serializers.ValidationError({"pricing_input": "Only margin type and value are editable financial inputs."})
    frozen = existing.private_pricing.get("source_snapshot") if existing else None
    if not frozen and allocation_source:
        frozen = {**allocation_source, "items": [line for line in allocation_source["items"] if line["id"] in {item.pk for item in items}]}
    if not frozen:
        source_ids = list(quotation.items.values_list("id", flat=True))
        if set(source_ids) != {item.pk for item in items}:
            raise serializers.ValidationError({"lines": "Import every line from the accepted quotation; scope cannot be excluded."})
        frozen = source_snapshot(quotation, list(quotation.items.select_related("unit", "service_category", "paint_type", "paint_brand", "service_type", "color").order_by("id")))
    ids = [line["source_item"] for line in config["lines"]]
    source_ids = [line["id"] for line in frozen["items"]]
    if len(ids) != len(set(ids)) or set(ids) != set(source_ids) or set(ids) != {item.pk for item in items}:
        raise serializers.ValidationError({"lines": "Keep every unique saved source line."})
    by_id = {item.pk: item for item in items}
    choices = {line["source_item"]: line for line in config["lines"]}
    bases = [Decimal(line["eligible_amount"]) for line in frozen["items"]]
    def reduction(amount, kind, value):
        if (kind == "PERCENTAGE" and value > 100) or (kind == "FIXED" and value > amount):
            raise serializers.ValidationError({"margin_value": "Margin cannot exceed the eligible value or 100%."})
        return discount_amount(amount, kind, value)
    if config["margin_mode"] == "OVERALL":
        retained = allocate(reduction(sum(bases), config["margin_type"], config["margin_value"]), bases)
    else:
        retained = [reduction(basis, choices[line["id"]]["margin_type"], choices[line["id"]]["margin_value"]) for line, basis in zip(frozen["items"], bases)]
    prepared = []
    for snapshot, basis, margin in zip(frozen["items"], bases, retained):
        quantity = Decimal(snapshot["quantity"])
        if quantity <= 0:
            raise serializers.ValidationError({"quantity": "Source quantities must be positive."})
        amount = (basis - margin).quantize(CENT)
        rate = (amount / quantity).quantize(Decimal("0.000000000001"))
        if amount > Decimal("999999999999.99") or rate > Decimal("9999999999.99"):
            raise serializers.ValidationError({"lines": "Amount exceeds the supported limit."})
        prepared.append({"item": by_id[snapshot["id"]], "snapshot": snapshot, "quantity": quantity, "unit_rate": rate.quantize(CENT),
            "exact_rate": str(rate), "amount": amount, "discount_type": "FIXED", "discount_value": Decimal(0)})
    # Customer GST defines the source basis, never the Work Order's tax choice.
    previous_quote = existing.quotes.filter(is_current=True, created_by=existing.main_contractor).first() if existing else None
    prior_tax = previous_quote.pricing if previous_quote else {}
    settings = {"basis": "MARGIN", "discount_mode": "OVERALL", "discount_type": "FIXED", "discount_value": Decimal(0),
        "gst_mode": config.get("gst_mode", prior_tax.get("gst_mode", "NO_GST")), "gst_percentage": config.get("gst_percentage", prior_tax.get("gst_percentage", "0"))}
    if settings["gst_mode"] != "NO_GST" and Decimal(settings["gst_percentage"]) <= 0:
        raise serializers.ValidationError({"gst_percentage": "Enter the applicable Work Order GST percentage."})
    private = dict(existing.private_pricing) if existing else {}
    if allocation_source:
        private["full_source_snapshot"] = allocation_source
        private["allocated_item_ids"] = [line["id"] for line in frozen["items"]]
    private.update({"source_snapshot": frozen, "source_reference": frozen["quotation_number"], "source_revision": frozen["revision"],
        "margin": {key: str(config[key]) for key in ("margin_mode", "margin_type", "margin_value")},
        "sharing_permissions": {key: config[key] for key in ("share_site_pin", "share_customer_address", "share_customer_contact", "show_pricing_adjustment")}})
    private["margin"]["lines"] = [{"source_item": line["id"], "margin_type": choices[line["id"]]["margin_type"], "margin_value": str(choices[line["id"]]["margin_value"]), "eligible_amount": str(basis), "retained_amount": str(margin)} for line, basis, margin in zip(frozen["items"], bases, retained)]
    return {"mode": mode, "settings": settings, "lines": prepared, "private": private, "totals": calculate_pricing(prepared, settings)}
