"""Invoice editing contracts exercised against persisted payment history."""
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from quotations.models import Invoice, InvoicePayment


class InvoiceContentSaveTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9011700810", role="CONTRACTOR")
        self.invoice = Invoice.objects.create(
            contractor=self.contractor, invoice_number="CONTENT-SAVE", status="PART_PAID",
            amount_paid=Decimal("100"), grand_total=Decimal("200"),
            base_items=[{"description": "Agreed work", "quantity": "1", "rate": "200"}],
        )
        InvoicePayment.objects.create(invoice=self.invoice, amount="100", payment_mode="CASH")
        self.client.force_authenticate(self.contractor)
        self.url = f"/api/quotations/invoices/{self.invoice.pk}/"

    def test_invoice_details_save_with_existing_ledger_payments(self):
        response = self.client.patch(self.url, {"notes": "Updated invoice notes"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("100"))
        self.assertEqual(self.invoice.payment_mode, "")
        self.assertEqual(self.invoice.notes, "Updated invoice notes")
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_direct_payment_update_still_requires_mode(self):
        response = self.client.patch(self.url, {"amount_paid": "150", "payment_mode": ""}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("payment_mode", response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("100"))
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_closed_edit_window_remains_closed(self):
        Invoice.objects.filter(pk=self.invoice.pk).update(created_at=timezone.now() - timedelta(days=1))
        response = self.client.patch(self.url, {"notes": "Updated notes"}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.notes, "")
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_direct_payment_with_mode_can_still_save(self):
        for _ in range(2):
            response = self.client.patch(self.url, {"amount_paid": "150", "payment_mode": "UPI"}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.payment_mode, "UPI")
        self.assertEqual(self.invoice.amount_paid, Decimal("150"))
        self.assertEqual(self.invoice.payments.count(), 2)
        self.assertEqual(self.invoice.payments.order_by("id").last().amount, Decimal("50"))

    def test_same_day_cancellation_preserves_status_and_payment_history(self):
        response = self.client.patch(self.url, {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "CANCELLED")
        self.assertEqual(self.invoice.amount_paid, Decimal("100"))
        self.assertEqual(self.invoice.payments.count(), 1)
        self.assertEqual(self.invoice.payments.get().amount, Decimal("100"))
        payment = self.client.post(f"{self.url}payments/", {"amount": "1", "payment_mode": "CASH"}, format="json")
        self.assertEqual(payment.status_code, 400, payment.data)

    def test_same_day_unpaid_cancellation_does_not_reissue_invoice(self):
        self.invoice.payments.all().delete()
        self.invoice.amount_paid = Decimal("0")
        self.invoice.status = "ISSUED"
        self.invoice.save(update_fields=("amount_paid", "status"))
        response = self.client.patch(self.url, {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "CANCELLED")
