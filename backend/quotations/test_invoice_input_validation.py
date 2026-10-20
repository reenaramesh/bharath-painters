"""Invoice financial input must fail atomically with an actionable 400."""
from decimal import Decimal

from django.urls import reverse
from rest_framework.test import APITestCase

from quotations import test_customer_activation_invoices as activation_fixtures
from quotations.models import Invoice


class InvoiceInputValidationTests(APITestCase):
    def setUp(self):
        activation_fixtures.CustomerActivationAndStandaloneInvoiceTests.setUp(self)
        self.customer = activation_fixtures.CustomerActivationAndStandaloneInvoiceTests.create_customer(self)
        self.url = reverse("invoice-list-create")
        self.payload = {"customer": self.customer.pk, "tax_mode": "GST",
                        "items": [{"quantity": "1", "rate": "100", "description": "Work"}]}

    def test_create_rejects_invalid_money_and_rows_without_persisting_invoice(self):
        changes = [
            {"discount": "NaN"}, {"discount": "-1"}, {"gst_percentage": "Infinity"},
            {"invoice_date": "2026-02-30"}, {"due_date": "bad-date"},
            {"items": "bad"}, {"items": [None]}, {"items": [{"quantity": "NaN", "rate": "1"}]},
            {"items": [{"quantity": "-1", "rate": "100"}]},
            {"items": [{"quantity": "1", "rate": "-1"}]},
            {"items": [{"quantity": "999999999999.99", "rate": "999999999999.99"}]},
        ]
        for change in changes:
            with self.subTest(change=change):
                response = self.client.post(self.url, {**self.payload, **change}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(Invoice.objects.count(), 0)

    def test_external_amount_override_cannot_change_line_price(self):
        response = self.client.post(self.url, {**self.payload,
            "items": [{"quantity": "1", "rate": "100", "amount_override": "-999"}]}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["id"])
        self.assertEqual(invoice.subtotal, Decimal("100"))
        self.assertEqual(invoice.grand_total, Decimal("118"))

    def test_update_rejects_invalid_rows_and_adjustments_atomically(self):
        created = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        url = reverse("invoice-detail", args=[created.data["id"]])
        for change in ({"items": [None]}, {"base_items": [{"quantity": "Infinity"}]},
                       {"invoice_date": "2026-02-30"}, {"due_date": "bad-date"},
                       {"measurement_adjustments": ["bad"]},
                       {"measurement_adjustments": [{"surface": "WALL", "height": "NaN"}]}):
            response = self.client.patch(url, change, format="json")
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(Invoice.objects.get(pk=created.data["id"]).grand_total, Decimal("118"))
