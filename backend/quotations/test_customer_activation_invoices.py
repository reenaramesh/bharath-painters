from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import Customer, Invoice


class CustomerActivationAndStandaloneInvoiceTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000012345", password="Pass123!", role="CONTRACTOR", bharath_id="BP-CT-009999",
        )
        self.client.force_authenticate(self.contractor)

    def create_customer(self):
        response = self.client.post(
            reverse("customer-list-create"), {"name": "Delayed Login Customer", "mobile": "9742801234"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return Customer.objects.get(pk=response.data["id"])

    def test_customer_creation_does_not_create_id_or_login(self):
        customer = self.create_customer()
        self.assertIsNone(customer.bharath_id)
        self.assertIsNone(customer.portal_user_id)

    def test_explicit_activation_creates_one_id_and_login(self):
        customer = self.create_customer()
        first = self.client.post(reverse("customer-activate-account", args=[customer.id]), {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["bharath_id"], f"BP-C-{customer.id:06d}")
        self.assertIn("temporary_password", first.data)
        second = self.client.post(reverse("customer-activate-account", args=[customer.id]), {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["already_active"])
        self.assertNotIn("temporary_password", second.data)
        customer.refresh_from_db()
        self.assertIsNotNone(customer.portal_user_id)

    def test_activation_skips_customer_id_used_by_an_existing_login(self):
        customer = self.create_customer()
        colliding_id = f"BP-C-{customer.id:06d}"
        BharathUser.objects.create_user(
            mobile="9000098765",
            password="Pass123!",
            role="CONTRACTOR",
            bharath_id=colliding_id,
        )

        response = self.client.post(
            reverse("customer-activate-account", args=[customer.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.data["bharath_id"], colliding_id)
        customer.refresh_from_db()
        self.assertEqual(customer.portal_user.bharath_id, customer.bharath_id)

    def test_gst_and_non_gst_lump_sum_invoices_use_separate_sequences(self):
        customer = self.create_customer()
        self.client.post(reverse("customer-activate-account", args=[customer.id]), {}, format="json")
        base = {
            "customer": customer.id,
            "items": [{"service": "Painting", "description": "Agreed work", "unit": "Job", "quantity": 1, "rate": 10000}],
        }
        non_gst = self.client.post(reverse("invoice-list-create"), {**base, "tax_mode": "NON_GST"}, format="json")
        gst = self.client.post(reverse("invoice-list-create"), {**base, "tax_mode": "GST", "gst_percentage": 18}, format="json")
        second_non_gst = self.client.post(reverse("invoice-list-create"), {**base, "tax_mode": "NON_GST"}, format="json")
        self.assertEqual(non_gst.status_code, status.HTTP_201_CREATED)
        self.assertEqual(gst.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_non_gst.status_code, status.HTTP_201_CREATED)
        self.assertTrue(non_gst.data["invoice_number"].endswith("00001"))
        self.assertTrue(gst.data["invoice_number"].startswith("GST-INV-"))
        self.assertTrue(gst.data["invoice_number"].endswith("00001"))
        self.assertTrue(second_non_gst.data["invoice_number"].endswith("00002"))
        self.assertEqual(Invoice.objects.filter(quotation__isnull=True).count(), 3)
