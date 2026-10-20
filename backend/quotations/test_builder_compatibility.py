from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from . import test_grouped_specifications as fixture
from .specification_validation import validate_grouped_specifications


class BuilderCompatibilityTests(TestCase):
    def setUp(self):
        fixture.GroupedSpecificationTests.setUp(self)
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)

    def test_manual_specs_create_and_atomic_reopen_save_without_group_measurement(self):
        specifications = {"finish": "Saved satin", "work_specification": "Keep the original process"}
        response = self.client.post('/api/quotations/create/', {
            "customer": self.customer.pk, "property": self.property.pk,
            "quotation_type": "MANUAL_LUMPSUM", "rooms": [],
            "gst_mode": "NO_GST", "gst_percentage": 0,
            "items": [{"description": "Manual work", "service_category": self.category.pk,
                       "quantity": 2, "rate": "100.01", "calculation_method": "MANUAL",
                       "unit": None, "custom_unit": "Job", "specification_details": specifications}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        quotation = response.data
        edited = self.client.patch(f"/api/quotations/{quotation['id']}/draft/", {
            "expected_updated_at": quotation['updated_at'], "notes": "Edited notes",
            "rooms": quotation['rooms'], "items": quotation['items'],
        }, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        for field in ('id', 'quantity', 'rate', 'custom_unit', 'specification_details'):
            self.assertEqual(edited.data['items'][0][field], quotation['items'][0][field])
        self.assertEqual(edited.data['items'][0]['specification_details'], specifications)
        self.assertIsNone(edited.data['measurement_record'])

    def test_group_markers_still_require_measurement_and_valid_schema(self):
        for details in ({"kind": "group"}, {"schema_version": 1}, {"assignment_id": "claimed-group"}, {"contributions": []}):
            with self.assertRaises(ValidationError):
                validate_grouped_specifications([{"specification_details": details}], None)
        with self.assertRaises(ValidationError):
            validate_grouped_specifications([{"specification_details": {"finish": "x" * 100001}}], None)
        with self.assertRaises(ValidationError):
            validate_grouped_specifications([{"specification_details": ["invalid"]}], None)

    def test_mobile_manual_draft_payload_uses_existing_server_pricing_and_connection(self):
        response = self.client.post('/api/quotations/create/', {
            "customer": self.customer.pk, "property": self.property.pk,
            "quotation_type": "MANUAL_LUMPSUM", "rooms": [],
            "gst_mode": "GST_EXTRA", "gst_percentage": "18",
            "discount_mode": "OVERALL", "discount_type": "FIXED", "discount_value": "500",
            "notes": "Two coats; final color by customer.",
            "items": [{"description": "Interior painting", "calculation_method": "MANUAL",
                        "quantity": "900", "rate": "20", "unit": None, "custom_unit": "Job"}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "DRAFT")
        self.assertEqual(response.data["subtotal"], "18000.00")
        self.assertEqual(response.data["discount"], "500.00")
        self.assertEqual(response.data["gst_amount"], "3150.00")
        self.assertEqual(response.data["grand_total"], "20650.00")
        self.assertEqual(response.data["items"][0]["amount"], "18000.00")
