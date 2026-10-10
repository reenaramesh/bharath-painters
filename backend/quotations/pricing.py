"""Shared Decimal discount/GST totals for quotation and agreed work pricing."""
from decimal import Decimal
from .discounts import discount_amount

CENT = Decimal("0.01")


def value(obj, name, default=None):
    return obj.get(name, default) if isinstance(obj, dict) else getattr(obj, name, default)


def calculate_pricing(items, settings):
    items = list(items)
    subtotal = sum((Decimal(value(item,"amount",0) or 0) for item in items),Decimal("0")).quantize(CENT)
    discount = (
        sum((discount_amount(value(item,"amount",0),value(item,"discount_type","FIXED"),value(item,"discount_value",0)) for item in items),Decimal("0"))
        if value(settings,"discount_mode","OVERALL") == "LINE"
        else discount_amount(subtotal,value(settings,"discount_type","FIXED"),value(settings,"discount_value",0))
    )
    taxable = (subtotal-discount).quantize(CENT)
    percentage = max(Decimal(value(settings,"gst_percentage",0) or 0),Decimal("0"))
    mode = value(settings,"gst_mode","NO_GST")
    gst = Decimal("0")
    total = taxable
    if mode == "GST_EXTRA":
        gst = (taxable*percentage/Decimal("100")).quantize(CENT)
        total = taxable+gst
    elif mode == "GST_INCLUDED" and percentage > 0:
        gst = (taxable*percentage/(Decimal("100")+percentage)).quantize(CENT)
    return {"subtotal":subtotal,"discount":discount,"gst_amount":gst,"grand_total":total.quantize(CENT)}
