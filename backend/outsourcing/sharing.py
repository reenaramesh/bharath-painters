"""Allowlisted vendor projections; precise location never enters open previews."""
from urllib.parse import urlsplit


def recipient_details(order, open_platform=False):
    source = order.private_pricing.get("source_snapshot", {})
    permissions = order.private_pricing.get("sharing_permissions", {})
    result = {"approximate_location": source.get("city", ""), "site_pin": "", "address": "", "customer_contact": None}
    if open_platform:
        return result
    if permissions.get("share_site_pin"):
        candidate = source.get("site_pin", "")
        try:
            parsed = urlsplit(candidate)
        except ValueError:
            parsed = urlsplit("")
        if parsed.scheme == "https" and parsed.hostname in ("maps.app.goo.gl", "maps.google.com", "www.google.com", "google.com", "goo.gl"):
            result["site_pin"] = candidate
    if permissions.get("share_customer_address"):
        result["address"] = source.get("site_address", "")
    if permissions.get("share_customer_contact"):
        result["customer_contact"] = {"name": source.get("customer_name", ""), "mobile": source.get("customer_mobile", ""), "email": source.get("customer_email", "")}
    return result


def pricing_adjustment(order):
    if not order.private_pricing.get("sharing_permissions", {}).get("show_pricing_adjustment"):
        return None
    source = order.private_pricing.get("source_snapshot", {})
    margin = order.private_pricing.get("margin", {})
    by_id = {line["source_item"]: line for line in margin.get("lines", [])}
    return {"mode": margin.get("margin_mode"), "lines": [{"description": line["description"], "original_rate": line["rate"], "original_amount": line["amount"],
        "eligible_amount": line["eligible_amount"], "retained_amount": by_id.get(line["id"], {}).get("retained_amount", "0.00")} for line in source.get("items", [])]}


def open_projection(order):
    quote = order.quotes.filter(is_current=True, created_by=order.main_contractor).first()
    return {"reference": order.reference, "approximate_location": recipient_details(order, True)["approximate_location"],
        "lines": [{"description": line.source_scope.specification_snapshot.get("description", line.description_snapshot) if line.source_scope else line.description_snapshot, "quantity": str(line.quantity), "unit": line.unit_name_snapshot,
                   "rate": line.source_scope.specification_snapshot.get("vendor_rate", str(line.unit_rate)) if line.source_scope else str(line.unit_rate), "amount": str(line.amount),
                   "specification": line.source_scope.specification_snapshot if line.source_scope else {}} for line in quote.quote_lines.all()] if quote else [],
        "payable": str(quote.total) if quote else None}
