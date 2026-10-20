from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch

from django.urls import reverse
from rest_framework.test import APITestCase

from . import test_grouped_specifications as fixtures
from .models import Quotation, MeasurementSurface, PaintType, PaintBrand, ServiceType


class QuotationPhase3Tests(APITestCase):
    def setUp(self):
        fixtures.GroupedSpecificationTests.setUp(self)
        self.texture_product = PaintType.objects.create(name="Texture material", service_category=self.category, created_by=self.contractor)
        self.brand = PaintBrand.objects.create(name="Saved brand", created_by=self.contractor)
        self.service = ServiceType.objects.create(name="Saved finish service", category_master=self.category, created_by=self.contractor)
    item = fixtures.GroupedSpecificationTests.item
    split = fixtures.GroupedSpecificationTests.split

    def payload(self, mode="LINE"):
        items = self.split()
        items[0].update(discount_type="PERCENTAGE", discount_value="10", service_type=self.service.pk, paint_brand=self.brand.pk)
        items[1].update(discount_type="FIXED", discount_value="50", paint_type=self.texture_product.pk)
        return {"customer": self.customer.pk, "property": self.property.pk,
                "measurement_record": self.measurement.pk, "rooms": [], "items": items,
                "discount_mode": mode, "discount_type": "PERCENTAGE", "discount_value": "10",
                "gst_mode": "GST_EXTRA", "gst_percentage": "18"}

    def create(self, payload):
        self.client.force_authenticate(self.contractor)
        return self.client.post(reverse("quotation-create"), payload, format="json")

    def test_line_percentage_fixed_discounts_and_gst_roundtrip_preview(self):
        payload = self.payload()
        response = self.create(payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["discount"]), Decimal("395"))
        self.assertEqual(Decimal(response.data["grand_total"]), Decimal("5079.90"))
        saved = response.data
        for attempt in range(2):
            saved["items"][0].update(rate="12.00", discount_value="20.00")
            result = self.client.patch(reverse("quotation-draft-save", kwargs={"pk": saved["id"]}), {
                "expected_updated_at": saved["updated_at"], "rooms": saved["rooms"], "items": saved["items"], "discount_mode": "LINE",
            }, format="json")
            self.assertEqual(result.status_code, 200, result.data)
            saved = self.client.get(reverse("quotation-detail", kwargs={"pk": saved["id"]})).data
            self.assertEqual(saved["items"][0]["discount_value"], "20.00")
            self.assertEqual(Decimal(saved["items"][0]["net_amount"]), Decimal("3312"))
            self.assertEqual(Decimal(saved["grand_total"]), Decimal("5324.16"))
            self.assertEqual(saved["items"][0]["paint_brand"], self.brand.pk)
            self.assertEqual(saved["items"][0]["service_type"], self.service.pk)
            self.assertEqual(saved["items"][0]["unit"], self.unit.pk)
            self.assertEqual(saved["items"][0]["coats"], 2)
            self.assertEqual(saved["items"][1]["paint_type"], self.texture_product.pk)
        payload["items"][0].update(rate="12.00", discount_value="20.00")
        before = Quotation.objects.count()
        preview = self.client.post(reverse("quotation-preview-pdf"), payload, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(Quotation.objects.count(), before)
        import pymupdf
        with pymupdf.open(stream=preview.content, filetype="pdf") as document:
            text = " ".join("".join(page.get_text() for page in document).split())
        self.assertIn("Line discount", text)
        self.assertIn("5,324.16", text)
        self.assertIn("Sixteen Paise", text)

    def test_overall_percentage_and_fixed_modes_do_not_apply_line_discounts(self):
        for kind, value, discount in [("PERCENTAGE", "10", "470"), ("FIXED", "125", "125")]:
            payload = self.payload("OVERALL")
            payload.update(discount_type=kind, discount_value=value)
            response = self.create(payload)
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(Decimal(response.data["discount"]), Decimal(discount))
            self.assertEqual(Decimal(response.data["items"][0]["net_amount"]), Decimal("3450"))

    def test_invalid_line_discount_rolls_back_creation(self):
        for value in ("-1", "101", "NaN"):
            payload = self.payload()
            payload["items"][0]["discount_value"] = value
            self.assertEqual(self.create(payload).status_code, 400)
        self.assertFalse(Quotation.objects.exists())

    def test_line_tax_modes_rounding_and_fixed_cap(self):
        for gst_mode, tax, total in [("GST_INCLUDED", "656.69", "4305.00"), ("NO_GST", "0.00", "4305.00")]:
            payload = self.payload()
            payload["gst_mode"] = gst_mode
            response = self.create(payload)
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["gst_amount"], tax)
            self.assertEqual(response.data["grand_total"], total)
        payload = self.payload()
        payload["items"] = [{"description": "Tiny line", "quantity": 1, "rate": ".05", "calculation_method": "MANUAL", "discount_type": "PERCENTAGE", "discount_value": 10}]
        response = self.create(payload)
        self.assertEqual(response.data["discount"], "0.00")
        self.assertEqual(response.data["grand_total"], "0.06")
        payload["items"][0].update(discount_type="FIXED", discount_value="999")
        response = self.create(payload)
        self.assertEqual(response.data["discount"], "0.05")
        self.assertEqual(response.data["grand_total"], "0.00")

    def test_discount_save_runtime_failure_and_validation_leave_saved_values(self):
        saved = self.create(self.payload()).data
        quotation = Quotation.objects.get(pk=saved["id"])
        request = {"expected_updated_at": saved["updated_at"], "rooms": saved["rooms"], "items": deepcopy(saved["items"]), "discount_mode": "OVERALL", "discount_value": 500}
        request["items"][0]["discount_value"] = 25
        url = reverse("quotation-draft-save", kwargs={"pk": quotation.pk})
        with patch("quotations.serializers.QuotationSerializer.calculate_totals", side_effect=RuntimeError("late failure")):
            with self.assertRaises(RuntimeError):
                self.client.patch(url, request, format="json")
        quotation.refresh_from_db()
        self.assertEqual(quotation.discount_mode, "LINE")
        self.assertEqual(quotation.grand_total, Decimal("5079.90"))
        self.assertEqual(quotation.items.first().discount_value, Decimal("10"))
        request["items"][0]["discount_value"] = 101
        self.assertEqual(self.client.patch(url, request, format="json").status_code, 400)
        self.assertEqual(quotation.items.first().discount_value, Decimal("10"))

    def test_multi_surface_group_counts_each_source_once_and_retains_materials(self):
        ceiling = MeasurementSurface.objects.create(property=self.property, measurement_record=self.measurement, room=self.room, work_area="INTERIOR", surface_type="CEILING", name="Ceiling", manual_area=80)
        payload = self.payload()
        group = payload["items"][0]
        details = group["specification_details"]
        details["surfaces"] = ["WALL", "CEILING"]
        details["contributions"][0]["sources"].append({"surface_id": ceiling.pk, "quantity": 80, "original_area": 80})
        details["contributions"][0]["quantity"] += 80
        group["quantity"] += 80
        response = self.create(payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["subtotal"], "5500.00")
        self.assertEqual(response.data["grand_total"], "5929.50")
        self.assertEqual(response.data["items"][0]["paint_type"], self.product.pk)
        saved = response.data
        reopened = self.client.patch(reverse("quotation-draft-save", kwargs={"pk": saved["id"]}), {
            "expected_updated_at": saved["updated_at"], "rooms": saved["rooms"], "items": saved["items"],
        }, format="json")
        self.assertEqual(reopened.status_code, 200, reopened.data)
        self.assertEqual(reopened.data["items"][0]["specification_details"]["surfaces"], ["WALL", "CEILING"])
        self.assertEqual(reopened.data["grand_total"], "5929.50")
        duplicate = deepcopy(group)
        duplicate["specification_details"]["assignment_id"] = "duplicate"
        payload["items"].append(duplicate)
        self.assertEqual(self.create(payload).status_code, 400)

    def test_full_group_cannot_silently_omit_a_measured_surface(self):
        payload = self.payload()
        group = payload["items"][0]
        contribution = group["specification_details"]["contributions"][0]
        removed = contribution["sources"].pop(0)
        contribution["quantity"] -= removed["quantity"]
        group["quantity"] -= removed["quantity"]
        self.assertEqual(self.create(payload).status_code, 400)

    def test_pdf_preserves_fractional_gst_percentage_and_paise(self):
        self.client.force_authenticate(self.contractor)
        payload = self.payload()
        payload["gst_percentage"] = "18.50"
        response = self.client.post(reverse("quotation-preview-pdf"), payload, format="json")
        self.assertEqual(response.status_code, 200)
        import pymupdf
        with pymupdf.open(stream=response.content, filetype="pdf") as document:
            text = " ".join("".join(page.get_text() for page in document).split())
        self.assertIn("GST (18.5%)", text)
        self.assertIn("5,101.42", text)
        self.assertIn("Forty Two Paise", text)
