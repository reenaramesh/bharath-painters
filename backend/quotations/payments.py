"""Shared customer-payment validation and serialized invoice posting."""
from decimal import Decimal
import hashlib

from django.db import connection, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import APIException

from .models import Invoice, InvoicePayment, ProjectReceipt


class PaymentConflict(APIException):
    status_code = 409
    default_code = "payment_request_conflict"
    default_detail = "This request key was already used for another payment."


def payment_request_key(data):
    key = str(data.get("idempotency_key") or "").strip() or None
    if key and len(key) > 100:
        raise serializers.ValidationError({"idempotency_key": "Use at most 100 characters."})
    return key


def lock_payment_request(key):
    """Serialize one key across both legacy payment tables on PostgreSQL."""
    if key and connection.vendor == "postgresql":
        lock_id = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big", signed=True)
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_id])


def payment_values(data, *, require_reference=False):
    amount_field = serializers.DecimalField(max_digits=14, decimal_places=2,
                                           min_value=Decimal("0.01"))
    try:
        amount = amount_field.run_validation(data.get("amount"))
    except serializers.ValidationError as error:
        raise serializers.ValidationError({"amount": error.detail})
    mode = str(data.get("payment_mode") or "").upper()
    if mode not in Invoice.PaymentMode.values:
        raise serializers.ValidationError({"payment_mode": "Select a valid payment mode."})
    reference = str(data.get("payment_reference") or "").strip()
    if len(reference) > 120:
        raise serializers.ValidationError({"payment_reference": "Use at most 120 characters."})
    if require_reference and mode != Invoice.PaymentMode.CASH and not reference:
        raise serializers.ValidationError({"payment_reference": "Enter the transaction, cheque or payment reference."})
    date_value = data.get("received_date")
    try:
        received_date = serializers.DateField().run_validation(date_value) if date_value not in (None, "") else timezone.localdate()
    except serializers.ValidationError as error:
        raise serializers.ValidationError({"received_date": error.detail})
    if received_date > timezone.localdate():
        raise serializers.ValidationError({"received_date": "Payment date cannot be in the future."})
    return {"amount": amount, "payment_mode": mode, "payment_reference": reference,
            "received_date": received_date, "notes": str(data.get("notes") or "").strip()}


def assert_replay_matches(existing, values, *, date_supplied=True):
    if any(getattr(existing, field) != value for field, value in values.items()
           if field != "received_date" or date_supplied):
        raise PaymentConflict()


def require_reconciled_payment_history(invoice, paid):
    if invoice.amount_paid > paid:
        raise PaymentConflict("This invoice has a historical paid summary without matching payment entries. Accounting review is required before recording another payment. No records were changed.")


def is_source_allocation(payment):
    """Recognize existing legacy allocations without fabricating source FKs."""
    if payment.source_receipt_id or payment.source_schedule_id:
        return True
    quotation_id = payment.invoice.quotation_id
    if not quotation_id:
        return False
    from jobs.models import WorkSchedule
    schedule_id = WorkSchedule.objects.filter(quotation_id=quotation_id).values_list("pk", flat=True).first()
    if schedule_id and payment.notes.startswith(f"Advance payment (schedule #{schedule_id})"):
        return True
    prefix = "Quotation receipt ("
    if payment.notes.startswith(prefix) and payment.notes.endswith(")"):
        number = payment.notes[len(prefix):-1]
        return ProjectReceipt.objects.filter(quotation_id=quotation_id, receipt_number=number).exists()
    return False


@transaction.atomic
def create_invoice_payment(user, invoice, data, *, require_reference=False):
    values = payment_values(data, require_reference=require_reference)
    key = payment_request_key(data)
    lock_payment_request(key)
    # Refetch even for service callers holding stale Python instances.
    current = Invoice.objects.select_for_update(of=("self",)).get(pk=invoice.pk, contractor=user)
    if current.status == Invoice.Status.CANCELLED:
        raise serializers.ValidationError({"detail": "Payments cannot be added to a cancelled invoice."})
    if key:
        existing = InvoicePayment.objects.filter(idempotency_key=key).first()
        if existing:
            if existing.invoice_id != current.pk:
                raise PaymentConflict()
            assert_replay_matches(existing, values, date_supplied=bool(data.get("received_date")))
            return existing, True
        receipt = ProjectReceipt.objects.filter(idempotency_key=key).first()
        if receipt:
            if receipt.contractor_id != user.pk or receipt.quotation_id != current.quotation_id:
                raise PaymentConflict()
            assert_replay_matches(receipt, values, date_supplied=bool(data.get("received_date")))
            allocation = current.payments.filter(source_receipt=receipt).first()
            if allocation:
                return allocation, True
            raise PaymentConflict("This payment already has a project receipt. Review its allocation instead of recording it again.")
    paid = current.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    require_reconciled_payment_history(current, paid)
    balance = max(current.grand_total - paid, Decimal("0"))
    if values["amount"] > balance:
        raise serializers.ValidationError({"amount": f"Payment cannot exceed the remaining balance of {balance}."})
    payment = InvoicePayment.objects.create(invoice=current, idempotency_key=key, **values)
    from .views import sync_invoice_payments
    sync_invoice_payments(current)
    payment.invoice = current
    return payment, False
