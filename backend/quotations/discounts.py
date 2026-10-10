"""Discount reductions shared by the existing quotation engine and documents."""
from decimal import Decimal


def discount_amount(amount, kind, value):
    amount = Decimal(amount or 0)
    value = max(Decimal(value or 0), Decimal("0"))
    reduction = amount * min(value, Decimal("100")) / Decimal("100") if kind == "PERCENTAGE" else value
    return min(reduction, amount).quantize(Decimal("0.01"))


def line_discount(item):
    return discount_amount(item.amount, item.discount_type, item.discount_value) if item.quotation.discount_mode == "LINE" else Decimal("0.00")
