"""Customer payment contract and independent-connection regressions."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch
from datetime import timedelta

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from billing import test_phase1_permissions as finance_fixtures
from quotations.models import Invoice, InvoicePayment, ProjectReceipt, Quotation


class CustomerPaymentAuditTests(TestCase):
    client_class = APIClient

    def setUp(self):
        finance_fixtures.CustomerFinancePermissionTests.setUp(self)
        self.invoice.base_items = [{"description": "Approved work", "quantity": "1", "rate": "100"}]
        self.invoice.save(update_fields=("base_items",))
        self.client.force_authenticate(self.contractor)

    def payload(self, **changes):
        return {"document_type": "INVOICE", "invoice": self.invoice.pk,
                "amount": "10.00", "payment_mode": "CASH", "idempotency_key": "audit-payment-key", **changes}

    def post(self, payload):
        return self.client.post("/api/billing/contractor-revenue/receipts/", payload, format="json")

    def test_same_key_with_changed_invoice_payment_payload_is_conflict(self):
        first = self.post(self.payload())
        self.assertEqual(first.status_code, 201, first.data)
        response = self.post(self.payload(amount="20.00"))
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 2)

    def test_same_key_with_changed_project_receipt_payload_is_conflict(self):
        quotation = Quotation.objects.create(customer=self.customer, contractor=self.contractor,
            property=self.property, quotation_number="AUDIT-RECEIPT", grand_total="100.00")
        data = self.payload(document_type="QUOTATION", quotation=quotation.pk)
        self.assertEqual(self.post(data).status_code, 201)
        self.assertEqual(self.post({**data, "amount": "20.00"}).status_code, 409)
        self.assertEqual(ProjectReceipt.objects.filter(quotation=quotation).count(), 1)

    def test_omitted_date_retry_after_midnight_keeps_original_payment(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)
        tomorrow = timezone.localdate() + timedelta(days=1)
        with patch("quotations.payments.timezone.localdate", return_value=tomorrow):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.invoice.payments.count(), 2)

    def test_project_receipt_retry_after_conversion_returns_original_receipt(self):
        quotation = Quotation.objects.create(customer=self.customer, contractor=self.contractor,
            property=self.property, quotation_number="AUDIT-CONVERTED", grand_total="100.00")
        data = self.payload(document_type="QUOTATION", quotation=quotation.pk)
        first = self.post(data)
        self.assertEqual(first.status_code, 201, first.data)
        quotation.status = "CONVERTED"; quotation.save(update_fields=("status",))
        second = self.post(data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(ProjectReceipt.objects.filter(quotation=quotation).count(), 1)

    def test_invoice_endpoint_retries_do_not_double_count(self):
        url = f"/api/quotations/invoices/{self.invoice.pk}/payments/"
        first = self.client.post(url, self.payload(), format="json")
        second = self.client.post(url, self.payload(), format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("40.00"))
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 2)

    def test_nonfinite_amounts_are_validation_errors_on_both_invoice_writers(self):
        for amount in ["NaN", "Infinity", "-Infinity", "1e100"]:
            for url in ["/api/billing/contractor-revenue/receipts/",
                        f"/api/quotations/invoices/{self.invoice.pk}/payments/"]:
                response = self.client.post(url, self.payload(amount=amount), format="json")
                self.assertEqual(response.status_code, 400, (url, amount, response.data))
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 1)

    def test_invalid_payment_date_is_rejected_without_posting(self):
        for value in ["invalid", "2026-99-99", "2026-02-30"]:
            response = self.post(self.payload(received_date=value))
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 1)

    def test_source_allocated_payment_cannot_be_deleted_independently(self):
        from quotations.models import ProjectReceipt
        receipt = ProjectReceipt.objects.create(contractor=self.contractor, quotation=self.quotation,
            receipt_number="AUDIT-SOURCE", amount="10.00", payment_mode="CASH")
        payment = InvoicePayment.objects.create(invoice=self.invoice, source_receipt=receipt,
            amount="10.00", payment_mode="CASH")
        response = self.client.delete(f"/api/quotations/invoices/{self.invoice.pk}/payments/{payment.pk}/")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(InvoicePayment.objects.filter(pk=payment.pk).exists())

    def test_recalculation_preserves_actual_payments_above_revised_invoice_total(self):
        from quotations.views import sync_invoice_payments
        InvoicePayment.objects.create(invoice=self.invoice, amount="80.00", payment_mode="CASH")
        sync_invoice_payments(self.invoice)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("110.00"))
        self.assertEqual(self.invoice.balance_due, Decimal("0.00"))
        self.assertEqual(self.invoice.status, "PAID")

    def test_source_allocation_updates_the_callers_invoice_total(self):
        from quotations.views import record_project_receipts
        ProjectReceipt.objects.create(contractor=self.contractor, quotation=self.quotation,
            receipt_number="AUDIT-CALLER", amount="10.00", payment_mode="CASH")
        self.assertTrue(record_project_receipts(self.invoice, self.quotation))
        self.assertEqual(self.invoice.amount_paid, Decimal("40.00"))

    def test_legacy_invoice_summary_increase_posts_only_the_delta_once(self):
        url = f"/api/quotations/invoices/{self.invoice.pk}/"
        payload = {"amount_paid": "40.00", "payment_mode": "CASH"}
        first = self.client.patch(url, payload, format="json")
        second = self.client.patch(url, payload, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(self.invoice.payments.count(), 2)
        self.assertEqual(sum(self.invoice.payments.values_list("amount", flat=True)), Decimal("40.00"))
        response = self.client.patch(url, {"amount_paid": "1", "payment_mode": "CASH"}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("40.00"))

    def test_invoice_with_payments_cannot_be_deleted(self):
        response = self.client.delete(f"/api/quotations/invoices/{self.invoice.pk}/")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(Invoice.objects.filter(pk=self.invoice.pk).exists())
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_unreconciled_legacy_summary_blocks_new_accrual(self):
        self.invoice.payments.all().delete()
        response = self.post(self.payload())
        self.assertEqual(response.status_code, 409, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("30.00"))
        self.assertEqual(self.invoice.payments.count(), 0)

    def test_source_allocation_does_not_replace_an_unreconciled_legacy_summary(self):
        from quotations.views import record_project_receipts
        from quotations.payments import PaymentConflict
        self.invoice.payments.all().delete()
        ProjectReceipt.objects.create(contractor=self.contractor, quotation=self.quotation,
            receipt_number="AUDIT-LEGACY-SUMMARY", amount="10.00", payment_mode="CASH")
        with self.assertRaises(PaymentConflict):
            record_project_receipts(self.invoice, self.quotation)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("30.00"))
        self.assertFalse(self.invoice.payments.exists())


class CustomerPaymentConcurrencyTests(TransactionTestCase):
    client_class = APIClient
    def setUp(self):
        finance_fixtures.CustomerFinancePermissionTests.setUp(self)
        self.invoice.base_items = [{"description": "Approved work", "quantity": "1", "rate": "100"}]
        self.invoice.save(update_fields=("base_items",))

    @skipUnlessDBFeature("has_select_for_update")
    def test_stale_invoice_objects_cannot_overpay_with_concurrent_receipts(self):
        from billing.views import record_invoice_receipt
        self.invoice.amount_paid = Decimal("0.00")
        self.invoice.save(update_fields=("amount_paid",))
        self.invoice.payments.all().delete()
        barrier = Barrier(2)

        def pay():
            close_old_connections()
            try:
                invoice = Invoice.objects.get(pk=self.invoice.pk)
                request = SimpleNamespace(user=self.contractor,
                    data={"amount": "80.00", "payment_mode": "CASH"})
                barrier.wait(timeout=15)
                return record_invoice_receipt(request, invoice).status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(lambda _: pay(), range(2)))
        self.assertEqual(sorted(codes), [201, 400])
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("80.00"))
        self.assertEqual(self.invoice.payments.count(), 1)
