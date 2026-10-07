from copy import deepcopy
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from accounts.models import BharathUser
from .models import Customer, ContractorCustomerConnection, Property, PropertyMeasurement, PropertyRoom, MeasurementSurface, Quotation, QuotationItem, PaintType, ServiceCategory, Unit
from .serializers import QuotationSerializer, QuotationItemSerializer
from .specification_validation import validate_grouped_specifications


class GroupedSpecificationTests(TestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9888000811", password="test-pass", role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.customer = Customer.objects.create(contractor=self.contractor, name="Grouped Customer", mobile="9888000812")
        self.connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor, status="CONNECTED")
        self.property = Property.objects.create(customer=self.customer, contractor=self.contractor, connection=self.connection, name="Grouped Home")
        self.measurement = PropertyMeasurement.objects.create(property=self.property, contractor=self.contractor, connection=self.connection, version=3)
        self.room = PropertyRoom.objects.create(property=self.property, measurement_record=self.measurement, name="Bedroom 1")
        self.walls = [MeasurementSurface.objects.create(property=self.property, measurement_record=self.measurement, room=self.room, work_area="INTERIOR", surface_type="WALL", name=f"Wall {index + 1}", manual_area=area) for index, area in enumerate([120,115,110,125])]
        self.category = ServiceCategory.objects.create(name="Painting", created_by=self.contractor)
        self.product = PaintType.objects.create(name="Tractor Emulsion", service_category=self.category, created_by=self.contractor)
        self.unit = Unit.objects.create(name="Sq ft", created_by=self.contractor)

    def item(self, kind, refs, quantities, assignment_id):
        sources = [{"surface_id": wall.id, "name": wall.name, "original_area": float(wall.net_area), "quantity": quantity} for wall, quantity in zip(refs, quantities)]
        total = sum(quantities)
        return {"service_category": self.category.id, "paint_type": self.product.id, "description": assignment_id, "quantity": total, "unit": self.unit.id, "rate": "10", "coats": 2, "calculation_method": "MANUAL", "included_areas": [f"Bedroom 1 - {assignment_id}: {total} sqft"], "specification_details": {
            "schema_version": 1, "kind": kind, "assignment_id": assignment_id, "name": assignment_id, "surface": "WALL", "measurement_record": self.measurement.id, "measurement_version": 3,
            "room_ids": [self.room.id], "surface_ids": [wall.id for wall in refs] if kind == "special" else [],
            "contributions": [{"room_id": self.room.id, "room_name": self.room.name, "quantity": total, "sources": sources}],
        }}

    def split(self):
        return [self.item("group", self.walls, [120,115,110,0], "Normal Walls"), self.item("special", [self.walls[-1]], [125], "Texture Wall")]

    def test_group_trace_roundtrip_and_existing_totals(self):
        payload = {"customer": self.customer.id, "property": self.property.id, "measurement_record": self.measurement.id, "quotation_type": "MEASUREMENT", "rooms": [], "items": self.split(), "discount_type": "PERCENTAGE", "discount_value": 10, "gst_mode": "GST_EXTRA", "gst_percentage": 18}
        serializer = QuotationSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        quote = serializer.save(contractor=self.contractor)
        self.assertEqual(quote.subtotal, Decimal("4700"))
        self.assertEqual(quote.discount, Decimal("470"))
        self.assertEqual(quote.gst_amount, Decimal("761.40"))
        self.assertEqual(quote.grand_total, Decimal("4991.40"))
        line = quote.items.order_by("id").first()
        self.assertEqual(QuotationItemSerializer(line).data["specification_details"]["contributions"][0]["sources"][-1]["surface_id"], self.walls[-1].id)
        self.assertEqual(sum(surface.net_area for surface in self.measurement.surfaces.all()), Decimal("470"))
        from .pdf_utils import build_quotation_pdf
        import pymupdf
        document = pymupdf.open(stream=build_quotation_pdf(quote), filetype="pdf")
        extracted = "".join(page.get_text() for page in document)
        self.assertIn("Bedroom 1", extracted)
        self.assertIn("Texture Wall", extracted)
        self.assertIn("345", extracted)
        self.assertIn("125", extracted)
        self.assertNotIn("345 sqft", extracted)
        self.assertNotIn("125 sqft", extracted)
        self.assertEqual(quote.items.order_by("id").first().included_areas, ["Bedroom 1 - Normal Walls: 345 sqft"])
        document.close()

    def test_duplicate_full_wall_group_is_rejected(self):
        item = self.item("group", self.walls, [120,115,110,125], "First")
        duplicate = deepcopy(item)
        duplicate["specification_details"]["assignment_id"] = "Second"
        with self.assertRaises(ValidationError):
            validate_grouped_specifications([item, duplicate], self.measurement)

    def test_connected_customer_grouped_creation_uses_existing_endpoint(self):
        client = APIClient()
        client.force_authenticate(self.contractor)
        response = client.post(reverse("quotation-create"), {"customer": self.customer.id, "property": self.property.id, "measurement_record": self.measurement.id, "quotation_type": "MEASUREMENT", "rooms": [], "items": self.split(), "gst_mode": "NO_GST", "gst_percentage": 0}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("4700"))
        self.assertEqual(response.data["items"][0]["specification_details"]["measurement_version"], 3)

    def test_grouped_pdf_preview_uses_existing_endpoint_without_saving(self):
        client = APIClient()
        client.force_authenticate(self.contractor)
        count = Quotation.objects.count()
        response = client.post(reverse("quotation-preview-pdf"), {"customer": self.customer.id, "property": self.property.id, "measurement_record": self.measurement.id, "rooms": [], "items": self.split(), "gst_mode": "NO_GST", "gst_percentage": 0}, format="json")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(Quotation.objects.count(), count)

    def test_duplicate_special_wall_is_rejected(self):
        items = self.split()
        duplicate = deepcopy(items[1])
        duplicate["specification_details"]["assignment_id"] = "Second Texture"
        with self.assertRaises(ValidationError):
            validate_grouped_specifications([*items, duplicate], self.measurement)

    def test_forged_total_record_version_or_surface_is_rejected(self):
        for mutation in ("quantity", "record", "version", "surface", "rooms", "selected_wall"):
            items = self.split()
            if mutation == "quantity": items[0]["quantity"] = 999
            if mutation == "record": items[0]["specification_details"]["measurement_record"] = 999999
            if mutation == "version": items[0]["specification_details"]["measurement_version"] = 99
            if mutation == "surface": items[0]["specification_details"]["contributions"][0]["sources"][0]["surface_id"] = 999999
            if mutation == "rooms": items[0]["specification_details"]["room_ids"] = [999999]
            if mutation == "selected_wall": items[1]["specification_details"]["surface_ids"] = [999999]
            with self.subTest(mutation=mutation), self.assertRaises(ValidationError):
                validate_grouped_specifications(items, self.measurement)

    def test_normal_quantity_cannot_double_count_texture_wall(self):
        items = self.split()
        items[0]["specification_details"]["contributions"][0]["sources"][-1]["quantity"] = 125
        items[0]["specification_details"]["contributions"][0]["quantity"] = 470
        items[0]["quantity"] = 470
        with self.assertRaises(ValidationError): validate_grouped_specifications(items, self.measurement)

    def test_legacy_lump_sum_lines_need_no_group_metadata(self):
        validate_grouped_specifications([{"quantity": 1, "rate": 1000}], None)
        serializer = QuotationItemSerializer(data={"description": "General plumbing", "quantity": 1, "rate": 1000, "calculation_method": "LUMPSUM"})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data.get("specification_details", {}), {})

    def test_saved_metadata_survives_normal_item_updates(self):
        quote = Quotation.objects.create(contractor=self.contractor, customer=self.customer, property=self.property, measurement_record=self.measurement)
        item_data = self.split()[0]
        details = item_data["specification_details"]
        line = QuotationItem.objects.create(quotation=quote, description="Walls", quantity=345, rate=10, specification_details=details)
        serializer = QuotationItemSerializer(line, data={"description": "Updated treatment", "rate": 12}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        line.refresh_from_db()
        self.assertEqual(line.specification_details, details)


class QuotationRoomAreaLabelTests(TestCase):
    def test_names_only_preserve_room_numbers_and_area_names(self):
        from types import SimpleNamespace
        from .quotation_pdf_labels import quotation_room_area_label
        item = SimpleNamespace(room=None, included_areas=["Bedroom 1 - Normal Walls: 345 sqft", "Bedroom 2 - Ceiling: 1,200.50 sq ft", "Main Hall", "Bedroom 3 (125 sqft)"])
        self.assertEqual(quotation_room_area_label(item), "Bedroom 1 - Normal Walls, Bedroom 2 - Ceiling, Main Hall, Bedroom 3")
        self.assertEqual(item.included_areas[0], "Bedroom 1 - Normal Walls: 345 sqft")

    def test_legacy_room_fallback(self):
        from types import SimpleNamespace
        from .quotation_pdf_labels import quotation_room_area_label
        self.assertEqual(quotation_room_area_label(SimpleNamespace(included_areas=[], room=SimpleNamespace(name="Bedroom 1"))), "Bedroom 1")

    def test_group_uses_surface_and_room_names_without_generated_group_title(self):
        from types import SimpleNamespace
        from .quotation_pdf_labels import quotation_room_area_label
        item = SimpleNamespace(included_areas=["living area - 2 Rooms - Walls: 480 sqft"], room=None, specification_details={"kind": "group", "name": "2 Rooms - Walls", "surface": "WALL", "contributions": [{"room_name": "living area", "quantity": 480}, {"room_name": "Hall", "quantity": 328.15}]})
        self.assertEqual(quotation_room_area_label(item), "Walls - living area, Hall")
