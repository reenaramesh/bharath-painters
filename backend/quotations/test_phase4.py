"""Document and revision parity against isolated connected-customer fixtures."""
from decimal import Decimal

import pymupdf
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from . import test_grouped_specifications as fixtures
from .models import Quotation
from .revision_utils import clone_quotation_revision, quotation_revision_changes
from .serializers import QuotationSerializer


class QuotationPhase4Tests(APITestCase):
    item = fixtures.GroupedSpecificationTests.item

    def setUp(self):
        fixtures.GroupedSpecificationTests.setUp(self)
        self.client.force_authenticate(self.contractor)
        serializer = QuotationSerializer(data={
            "customer": self.customer.pk, "property": self.property.pk,
            "measurement_record": self.measurement.pk, "quotation_type": "MEASUREMENT",
            "items": fixtures.GroupedSpecificationTests.split(self), "rooms": [],
            "gst_mode": "NO_GST", "discount_mode": "LINE",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.quote = serializer.save(contractor=self.contractor)
        self.quote.status = Quotation.Status.SENT
        self.quote.save(update_fields=["status"])
        self.portal = BharathUser.objects.create_user(
            mobile=self.customer.mobile, password="test-pass", role=BharathUser.Roles.CUSTOMER,
        )
        self.customer.portal_user = self.portal
        self.customer.save(update_fields=["portal_user"])

    def portal_detail(self, quote=None):
        self.client.force_authenticate(self.portal)
        return self.client.get(reverse("customer-quotation-detail", kwargs={"pk": (quote or self.quote).pk}))

    def test_scope_caption_matches_owner_pdf_and_customer_portal(self):
        from .quotation_pdf_labels import quotation_room_area_label
        expected = quotation_room_area_label(self.quote.items.first())
        response = self.portal_detail()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["items"][0]["room"], expected)
        self.assertEqual(response.data["items"][0]["service_category"], "Painting")

    def test_empty_snapshots_do_not_leak_current_customer_or_property_into_pdf(self):
        self.quote.customer_snapshot.update(name="Original Customer", gst_number="")
        self.quote.property_snapshot.update(name="Original Site", address="", city="", pincode="")
        self.quote.save(update_fields=["customer_snapshot", "property_snapshot"])
        self.customer.gst_number = "NEWGST-MUST-NOT-LEAK"
        self.customer.save(update_fields=["gst_number"])
        self.property.address = "NEW-ADDRESS-MUST-NOT-LEAK"
        self.property.save(update_fields=["address"])
        response = self.client.get(reverse("quotation-detail", kwargs={"pk": self.quote.pk}))
        self.assertEqual(response.data["property_details"]["address"], "")
        self.assertEqual(response.data["customer_details"]["name"], "Original Customer")
        pdf = self.client.get(reverse("quotation-pdf", kwargs={"pk": self.quote.pk}))
        self.assertEqual(pdf.status_code, 200)
        with pymupdf.open(stream=pdf.content, filetype="pdf") as doc:
            text = " ".join(page.get_text() for page in doc)
        self.assertNotIn("NEWGST-MUST-NOT-LEAK", text)
        self.assertNotIn("NEW-ADDRESS-MUST-NOT-LEAK", text)
        self.assertIn("Original Customer", text)
        self.assertIn("Original Site", text)

    def test_discount_only_revision_has_net_price_comparison(self):
        revised = clone_quotation_revision(self.quote, "Change line discount", None)
        line = revised.items.first()
        line.discount_type = "PERCENTAGE"
        line.discount_value = 10
        line.save(update_fields=["discount_type", "discount_value"])
        changes = quotation_revision_changes(revised)
        self.assertEqual(len(changes["discount_changes"]), 1)
        self.assertEqual(changes["price_changes"][0]["previous_net"], Decimal("3450"))
        self.assertEqual(changes["price_changes"][0]["current_net"], Decimal("3105"))
        self.assertEqual(changes["price_changes"][0]["net_difference"], Decimal("-345"))
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.items.first().discount_value, 0)

    def test_specification_only_revision_is_explained(self):
        revised = clone_quotation_revision(self.quote, "Change coats and specification", None)
        line = revised.items.first()
        line.coats = 3
        line.specification_details = {**line.specification_details, "work_specification": "New finish"}
        line.save(update_fields=["coats", "specification_details"])
        changes = quotation_revision_changes(revised)
        self.assertEqual(len(changes["specification_changes"]), 1)
        self.assertIn("coats", changes["specification_changes"][0]["fields"])
        self.assertIn("specification_details", changes["specification_changes"][0]["fields"])
        self.assertFalse(changes["added_lines"])
        self.assertFalse(changes["removed_lines"])

    def test_history_excludes_unsent_drafts_for_customer_only(self):
        revised = clone_quotation_revision(self.quote, "Private unsent changes", None)
        owner = self.client.get(reverse("quotation-detail", kwargs={"pk": self.quote.pk}))
        self.assertEqual([row["id"] for row in owner.data["revision_history"]], [self.quote.pk, revised.pk])
        portal = self.portal_detail()
        self.assertEqual([row["id"] for row in portal.data["revision_history"]], [self.quote.pk])
        hidden = self.portal_detail(revised)
        self.assertEqual(hidden.status_code, 404)
        revised.status = Quotation.Status.SENT
        revised.save(update_fields=["status"])
        portal = self.portal_detail(revised)
        self.assertEqual([row["id"] for row in portal.data["revision_history"]], [self.quote.pk, revised.pk])

    def test_history_and_pdf_remain_inaccessible_to_unrelated_customer(self):
        stranger = BharathUser.objects.create_user(mobile="9999988441", password="test-pass", role=BharathUser.Roles.CUSTOMER)
        self.client.force_authenticate(stranger)
        for name in ("customer-quotation-detail", "customer-quotation-pdf"):
            response = self.client.get(reverse(name, kwargs={"pk": self.quote.pk}))
            self.assertEqual(response.status_code, 404)

    def test_overall_discount_gst_and_notes_changes_are_explicit_without_recalculating_history(self):
        revised = clone_quotation_revision(self.quote, "Change commercial settings", None)
        saved = QuotationSerializer(revised).data
        updated = self.client.patch(reverse("quotation-draft-save", kwargs={"pk": revised.pk}), {
            "rooms": saved["rooms"], "items": saved["items"],
            "expected_updated_at": revised.updated_at.isoformat(), "discount_mode": "OVERALL",
            "discount_type": "FIXED", "discount_value": "100", "gst_mode": "GST_EXTRA",
            "gst_percentage": "18", "notes": "Revised saved terms",
        }, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        revised.refresh_from_db()
        changes = quotation_revision_changes(revised)
        for field in ("discount_mode", "discount_value", "gst_mode", "gst_percentage", "notes"):
            self.assertIn(field, changes["quotation_changes"])
        self.assertEqual(changes["previous_total"], Decimal("4700.00"))
        self.assertEqual(changes["current_total"], Decimal("5428.00"))
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.grand_total, Decimal("4700.00"))

    def test_customer_response_retry_does_not_create_extra_revisions(self):
        self.client.force_authenticate(self.portal)
        url = reverse("customer-quotation-action", kwargs={"pk": self.quote.pk})
        requested = self.client.post(url, {"action": "REVISION", "note": "Revise finish"}, format="json")
        self.assertEqual(requested.status_code, 200, requested.data)
        repeated = self.client.post(url, {"action": "REVISION", "note": "Revise finish"}, format="json")
        self.assertEqual(repeated.status_code, 400)
        self.assertEqual(Quotation.objects.filter(revision_of=self.quote).count(), 1)

    def test_rejection_keeps_original_scope_and_totals(self):
        before = list(self.quote.items.values())
        self.client.force_authenticate(self.portal)
        response = self.client.post(reverse("customer-quotation-action", kwargs={"pk": self.quote.pk}), {"action": "REJECT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.status, "REJECTED")
        self.assertEqual(self.quote.grand_total, Decimal("4700.00"))
        self.assertEqual(list(self.quote.items.values()), before)

    def test_portal_preserves_separate_saved_notes_terms_and_gst_settings(self):
        self.quote.notes = "Saved notes"
        self.quote.terms_conditions = "Saved conditions"
        self.quote.payment_terms = "Saved payment agreement"
        self.quote.work_procedures = "Saved work procedure"
        self.quote.save(update_fields=["notes", "terms_conditions", "payment_terms", "work_procedures"])
        response = self.portal_detail()
        self.assertEqual(response.data["terms"], "Saved notes")  # Old API key retained.
        self.assertEqual(response.data["notes"], "Saved notes")
        self.assertEqual(response.data["terms_conditions"], "Saved conditions")
        self.assertEqual(response.data["payment_terms"], "Saved payment agreement")
        self.assertEqual(response.data["work_procedures"], "Saved work procedure")
        self.assertEqual(response.data["gst_mode"], "NO_GST")
