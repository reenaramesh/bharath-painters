"""Backfill: record every confirmed work-schedule advance onto its quotation invoice.

Run:  python manage.py sync_advance_payments
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from jobs.models import WorkSchedule


class Command(BaseCommand):
    help = "Record confirmed schedule advances as invoice payments and issue receipt numbers."

    def handle(self, *args, **options):
        synced = skipped = failed = 0
        schedules = (
            WorkSchedule.objects.filter(payment_status=WorkSchedule.PaymentStatus.CONFIRMED, advance_amount__isnull=False)
            .select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor")
            .exclude(advance_amount__lte=0)
        )
        for schedule in schedules:
            try:
                from quotations.views import ensure_invoice_for_quotation, record_advance_payment
                with transaction.atomic():
                    invoice = ensure_invoice_for_quotation(schedule.quotation, schedule.quotation.contractor)
                    record_advance_payment(invoice, schedule, schedule.quotation.contractor)
                synced += 1
                self.stdout.write(f"Synced schedule #{schedule.id} ({schedule.quotation.quotation_number}) to {invoice.invoice_number}")
            except Exception as exc:
                failed += 1
                self.stderr.write(f"FAILED schedule #{schedule.id}: {exc}")
        self.stdout.write(self.style.SUCCESS(f"Done. synced={synced} failed={failed}"))


