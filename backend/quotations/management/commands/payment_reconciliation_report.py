"""Read-only report comparing legacy project receipts/advances to invoice allocations.

This command never creates invoices, changes receipts, or updates payment totals.
Run it against an isolated copy or a read-only database connection before any
manual reconciliation decision.
"""

import json
from collections import Counter
from decimal import Decimal
from types import SimpleNamespace

from django.core.management.base import BaseCommand
from django.db import connection

from jobs.models import WorkSchedule
from quotations.models import InvoicePayment, ProjectReceipt


def allocation_status(payments, expected_amount):
    rows = list(payments)
    if not rows:
        return "MISSING", "0.00"
    amount = sum((row.amount for row in rows), start=Decimal("0"))
    if len(rows) > 1:
        return "MULTIPLE", str(amount)
    if amount != expected_amount:
        return "AMOUNT_MISMATCH", str(amount)
    return "ALLOCATED", str(amount)


class Command(BaseCommand):
    help = "Print a read-only reconciliation report for advances and quotation receipts."

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true", dest="as_json", help="Print machine-readable JSON.")

    def handle(self, *args, **options):
        rows = []
        counts = Counter()
        with connection.cursor() as cursor:
            payment_columns = {
                column.name for column in connection.introspection.get_table_description(
                    cursor, InvoicePayment._meta.db_table,
                )
            }
        has_source_links = {"source_schedule_id", "source_receipt_id"}.issubset(payment_columns)

        schedules = WorkSchedule.objects.filter(
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED,
            advance_amount__gt=0,
            quotation__invoice__isnull=False,
        ).select_related("quotation__invoice").order_by("id")
        for schedule in schedules.iterator():
            invoice = schedule.quotation.invoice
            existing = list(InvoicePayment.objects.filter(source_schedule=schedule)) if has_source_links else []
            if not existing:
                existing = self.legacy_rows(
                    invoice, notes__startswith=f"Advance payment (schedule #{schedule.pk})",
                )
            state, allocated = allocation_status(existing, schedule.advance_amount)
            if state == "ALLOCATED" and not (has_source_links and existing[0].source_schedule_id == schedule.pk):
                state = "LEGACY_MATCH"
            counts[state] += 1
            rows.append({
                "source_type": "schedule_advance", "source_id": schedule.pk,
                "quotation_id": schedule.quotation_id, "invoice_id": invoice.pk,
                "invoice_number": invoice.invoice_number, "expected_amount": str(schedule.advance_amount),
                "allocated_amount": allocated, "allocation_count": len(existing), "status": state,
            })

        receipts = ProjectReceipt.objects.filter(quotation__invoice__isnull=False).order_by("id").values(
            "id", "quotation_id", "receipt_number", "amount", "quotation__invoice__id",
            "quotation__invoice__invoice_number",
        )
        for receipt in receipts.iterator():
            invoice_id = receipt["quotation__invoice__id"]
            existing = list(InvoicePayment.objects.filter(source_receipt_id=receipt["id"])) if has_source_links else []
            if not existing:
                existing = self.legacy_rows(invoice_id, notes=f"Quotation receipt ({receipt['receipt_number']})")
            state, allocated = allocation_status(existing, receipt["amount"])
            if state == "ALLOCATED" and not (has_source_links and existing[0].source_receipt_id == receipt["id"]):
                state = "LEGACY_MATCH"
            counts[state] += 1
            rows.append({
                "source_type": "quotation_receipt", "source_id": receipt["id"],
                "quotation_id": receipt["quotation_id"], "invoice_id": invoice_id,
                "invoice_number": receipt["quotation__invoice__invoice_number"], "expected_amount": str(receipt["amount"]),
                "allocated_amount": allocated, "allocation_count": len(existing), "status": state,
            })

        if options["as_json"]:
            self.stdout.write(json.dumps({"summary": dict(counts), "sources": rows}, sort_keys=True))
            return

        self.stdout.write("Read-only reconciliation report; no records were changed.")
        self.stdout.write("Source type | source id | invoice | expected | allocated | rows | status")
        for row in rows:
            self.stdout.write(
                f"{row['source_type']} | {row['source_id']} | {row['invoice_number']} | "
                f"{row['expected_amount']} | {row['allocated_amount']} | "
                f"{row['allocation_count']} | {row['status']}"
            )
        summary = ", ".join(f"{key.lower()}={value}" for key, value in sorted(counts.items())) or "no invoice-linked sources"
        self.stdout.write(f"Summary: {summary}")

    @staticmethod
    def legacy_rows(invoice_id, **filters):
        return [
            SimpleNamespace(id=row["id"], amount=row["amount"], source_schedule_id=None, source_receipt_id=None)
            for row in InvoicePayment.objects.filter(invoice_id=invoice_id, **filters).values("id", "amount")
        ]
