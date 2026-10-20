"""Standalone invoices must participate in the existing revenue ledger."""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from billing import test_phase1_permissions as finance_fixtures
from quotations.models import Invoice, InvoicePayment, PropertyContact


class StandaloneRevenueTests(APITestCase):
    def setUp(self):
        finance_fixtures.CustomerFinancePermissionTests.setUp(self)
        self.client.force_authenticate(self.contractor)
        self.standalone = Invoice.objects.create(
            contractor=self.contractor, customer=self.customer, site_property=self.property,
            invoice_number="STANDALONE-REVENUE", customer_name="Owner", grand_total="200",
            amount_paid="50", status="PART_PAID",
        )
        InvoicePayment.objects.create(invoice=self.standalone, amount="50", payment_mode="CASH")

    def revenue(self):
        return self.client.get("/api/billing/contractor-revenue/", {"year": timezone.localdate().year})

    def payload(self, **changes):
        return {"document_type": "INVOICE", "invoice": self.standalone.pk, "amount": "10",
                "payment_mode": "CASH", "idempotency_key": "standalone-revenue-key", **changes}

    def post(self, **changes):
        return self.client.post("/api/billing/contractor-revenue/receipts/", self.payload(**changes), format="json")

    def test_standalone_totals_dues_and_payment_picker_match_project_ledger(self):
        response = self.revenue()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["invoices_raised"], Decimal("300"))
        self.assertEqual(response.data["total_collected"], Decimal("80"))
        self.assertEqual(response.data["outstanding"], Decimal("220"))
        self.assertIn(self.standalone.pk, [row["id"] for row in response.data["open_invoices"]])
        self.assertEqual(response.data["customer_dues"][0]["due"], Decimal("220"))

    def test_receipt_retry_and_conflict_use_existing_invoice_payment_ledger(self):
        first = self.post()
        retry = self.post()
        conflict = self.post(amount="11")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first.data["payment_id"], retry.data["payment_id"])
        self.assertEqual(conflict.status_code, 409, conflict.data)
        self.standalone.refresh_from_db()
        self.assertEqual(self.standalone.amount_paid, Decimal("60"))
        self.assertEqual(self.standalone.payments.count(), 2)

    def test_receipt_cannot_overpay_or_accept_negative_amounts(self):
        for amount in ("151", "-1", "NaN"):
            response = self.post(amount=amount)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.standalone.payments.count(), 1)

    def test_cancelled_or_foreign_invoice_cannot_be_paid_or_appear_as_due(self):
        self.standalone.status = "CANCELLED"
        self.standalone.save(update_fields=("status",))
        self.assertEqual(self.post().status_code, 400)
        cancelled_revenue = self.revenue().data
        self.assertNotIn(self.standalone.pk, [row["id"] for row in cancelled_revenue["open_invoices"]])
        self.assertEqual(cancelled_revenue["outstanding"], Decimal("70"))
        self.assertEqual(cancelled_revenue["total_collected"], Decimal("80"))
        self.assertIn(f"invoice-{self.standalone.payments.get().pk}", [row["id"] for row in cancelled_revenue["receipts"]])
        other = BharathUser.objects.create_user(mobile="9010710099", role="CONTRACTOR")
        self.standalone.status = "ISSUED"
        self.standalone.contractor = other
        self.standalone.save(update_fields=("status", "contractor"))
        self.assertEqual(self.post().status_code, 400)
        response = self.revenue()
        self.assertEqual(response.data["invoices_raised"], Decimal("100"))
        self.assertEqual(response.data["total_collected"], Decimal("30"))

    def test_unfinished_project_invoice_gate_is_preserved(self):
        schedule = self.quotation.work_schedule
        schedule.status = "IN_PROGRESS"
        schedule.save(update_fields=("status",))
        response = self.post(invoice=self.invoice.pk)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertNotIn(self.invoice.pk, [row["id"] for row in self.revenue().data["invoices"]])

    def test_overpaid_invoice_does_not_offset_another_invoice_outstanding(self):
        self.standalone.amount_paid = Decimal("250")
        self.standalone.save(update_fields=("amount_paid",))
        self.assertEqual(self.revenue().data["outstanding"], Decimal("70"))

    def test_customer_finance_includes_owned_standalone_with_property_permissions(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/billing/customer-finance/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["total_billed"], Decimal("300"))
        self.assertEqual(response.data["total_paid"], Decimal("80"))
        self.assertEqual(response.data["balance_due"], Decimal("220"))
        self.client.force_authenticate(self.viewer)
        PropertyContact.objects.create(property=self.property, customer=self.contact_customer,
            access_level="CUSTOM", custom_permissions=["view_invoices"], status="ACTIVE")
        response = self.client.get("/api/billing/customer-finance/")
        self.assertEqual(response.data["total_billed"], Decimal("300"))
        self.assertIsNone(response.data["total_paid"])
        self.assertEqual(response.data["receipts"], [])

    def test_propertyless_standalone_uses_customer_identity_not_name_or_mobile(self):
        self.standalone.site_property = None
        self.standalone.save(update_fields=("site_property",))
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/billing/customer-finance/")
        self.assertEqual(response.data["total_billed"], Decimal("300"))
        self.client.force_authenticate(self.viewer)
        response = self.client.get("/api/billing/customer-finance/")
        self.assertNotEqual(response.data["total_billed"], Decimal("300"))

    def test_cancelled_customer_payment_history_survives_without_reopening_debt(self):
        self.standalone.status = "CANCELLED"
        self.standalone.save(update_fields=("status",))
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/billing/customer-finance/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["total_billed"], Decimal("100"))
        self.assertEqual(response.data["balance_due"], Decimal("70"))
        historical = next(row for row in response.data["receipts"] if row["id"] == f"invoice-{self.standalone.payments.get().pk}")
        self.assertEqual(historical["amount"], Decimal("50"))
        self.assertTrue(historical["download_url"])
        self.client.force_authenticate(self.viewer)
        private_response = self.client.get("/api/billing/customer-finance/")
        self.assertEqual(private_response.data["receipts"], [])
