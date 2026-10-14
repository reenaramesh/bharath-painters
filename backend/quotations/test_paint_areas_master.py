from copy import deepcopy
from unittest.mock import patch

from django.urls import reverse
from rest_framework.test import APITestCase

from . import test_grouped_specifications as fixtures
from .models import Quotation, ServiceCategory, PaintType, PaintBrand, WorkDescription
from .serializers import QuotationSerializer


class PaintAreasMasterTests(APITestCase):
    item = fixtures.GroupedSpecificationTests.item

    def setUp(self):
        fixtures.GroupedSpecificationTests.setUp(self)
        serializer = QuotationSerializer(data={"customer": self.customer.pk, "property": self.property.pk,
            "measurement_record": self.measurement.pk, "quotation_type": "MEASUREMENT", "rooms": [],
            "items": fixtures.GroupedSpecificationTests.split(self), "gst_mode": "NO_GST"})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.quote = serializer.save(contractor=self.contractor)
        self.client.force_authenticate(self.contractor)

    def payload(self, promote):
        saved = QuotationSerializer(self.quote).data
        items = deepcopy(saved["items"])
        items[0].update(service_category=None, paint_type=None, paint_brand=None,
            custom_service_category="Future Painting", custom_product_type="Future Finish", custom_brand="Future Brand",
            description="Future treatment", save_service_category_to_master=promote,
            save_product_type_to_master=promote, save_brand_to_master=promote, promote_to_master=promote)
        return {"expected_updated_at": saved["updated_at"], "rooms": saved["rooms"], "items": items}

    def save(self, payload):
        return self.client.patch(reverse("quotation-draft-save", kwargs={"pk": self.quote.pk}), payload, format="json")

    def test_explicit_master_options_save_once_and_restore_names_rates_and_ids(self):
        original_ids = list(self.quote.items.values_list("id", flat=True))
        response = self.save(self.payload(True))
        self.assertEqual(response.status_code, 200, response.data)
        first = response.data["items"][0]
        self.assertEqual(first["rate"], "10.00")
        self.assertEqual(response.data["grand_total"], "4700.00")
        self.assertEqual(first["paint_type_name"], "Future Finish")
        self.assertEqual(list(self.quote.items.values_list("id", flat=True)), original_ids)
        for model, name in [(ServiceCategory, "Future Painting"), (PaintType, "Future Finish"), (PaintBrand, "Future Brand"), (WorkDescription, "Future treatment")]:
            self.assertEqual(model.objects.filter(name=name, created_by=self.contractor).count(), 1)
        self.quote.refresh_from_db()
        repeated = self.save(self.payload(True))
        self.assertEqual(repeated.status_code, 200, repeated.data)
        self.assertEqual(WorkDescription.objects.filter(name="Future treatment", created_by=self.contractor).count(), 1)
        self.assertEqual(PaintType.objects.filter(name="Future Finish", created_by=self.contractor).count(), 1)

    def test_unchecked_options_save_custom_quote_values_without_creating_masters(self):
        response = self.save(self.payload(False))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["items"][0]["custom_product_type"], "Future Finish")
        self.assertEqual(response.data["items"][0]["paint_type_name"], "Future Finish")
        self.assertEqual(response.data["items"][0]["service_category_name"], "Future Painting")
        self.assertEqual(response.data["items"][0]["paint_type"], None)
        self.assertFalse(PaintType.objects.filter(name="Future Finish").exists())
        self.assertFalse(ServiceCategory.objects.filter(name="Future Painting").exists())
        self.assertFalse(PaintBrand.objects.filter(name="Future Brand").exists())
        self.assertFalse(WorkDescription.objects.filter(name="Future treatment").exists())

    def test_failed_atomic_save_rolls_back_master_creation_and_saved_values(self):
        before = list(self.quote.items.values())
        with patch("quotations.models.QuotationItem.save", side_effect=RuntimeError("QA failed line save")):
            with self.assertRaises(RuntimeError):
                self.save(self.payload(True))
        self.quote.refresh_from_db()
        self.assertEqual(list(self.quote.items.values()), before)
        self.assertFalse(PaintType.objects.filter(name="Future Finish").exists())
        self.assertFalse(ServiceCategory.objects.filter(name="Future Painting").exists())
        self.assertFalse(PaintBrand.objects.filter(name="Future Brand").exists())
        self.assertEqual(Quotation.objects.count(), 1)
