import re

import pymupdf
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import Quotation
from .professional_pdf import build_quotation_pdf
from .test_grouped_specifications import GroupedSpecificationTests


class MasterTerminologyTests(APITestCase):
    setUp = GroupedSpecificationTests.setUp

    def test_master_contracts_and_owner_permissions_are_unchanged(self):
        self.client.force_authenticate(self.contractor)
        other = BharathUser.objects.create_user(mobile="9888000899", password="test-pass", role="CONTRACTOR")
        for prefix, payload in [
            ("service-category", {"name": "New finish"}),
            ("paint-type", {"name": "New product", "service_category": self.category.pk, "default_price": "12.50"}),
            ("work-description", {"name": "New description", "service_category": self.category.pk}),
        ]:
            with self.subTest(prefix=prefix):
                self.client.force_authenticate(self.contractor)
                created = self.client.post(reverse(prefix + "-list-create"), payload, format="json")
                self.assertEqual(created.status_code, 201, created.data)
                pk = created.data["id"]
                detail = reverse(prefix + "-detail", kwargs={"pk": pk})
                edited = self.client.patch(detail, {"name": payload["name"] + " edited"}, format="json")
                self.assertEqual(edited.status_code, 200, edited.data)
                if "service_category" in payload:
                    self.assertEqual(edited.data["service_category"], self.category.pk)
                if "default_price" in payload:
                    self.assertEqual(str(edited.data["default_price"]), "12.50")
                self.client.force_authenticate(other)
                denied = self.client.patch(detail, {"name": "Not authorized"}, format="json")
                self.assertIn(denied.status_code, (403, 404))
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "Tractor Emulsion")
        self.assertEqual(self.product.service_category_id, self.category.pk)

    def test_draft_and_issued_pdf_use_the_current_quotation_columns(self):
        quote = Quotation.objects.create(contractor=self.contractor, customer=self.customer,
            property=self.property, quotation_number="LABEL-1", status="DRAFT")
        before = (quote.subtotal, quote.grand_total, quote.customer_id, quote.property_id)
        for status, expected in [("DRAFT", "Service / Product Category"), ("SENT", "Service / Product Category")]:
            quote.status = status
            with pymupdf.open(stream=build_quotation_pdf(quote), filetype="pdf") as document:
                text = re.sub(r"\s+", " ", " ".join(page.get_text() for page in document))
                self.assertIn(expected, text)
                self.assertNotIn("Painting Process", text)
                self.assertIn("Brand / Product", text)
                self.assertNotIn("Type of service", text)
        quote.refresh_from_db()
        self.assertEqual((quote.subtotal, quote.grand_total, quote.customer_id, quote.property_id), before)
