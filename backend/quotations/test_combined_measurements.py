from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from .models import Customer, ContractorCustomerConnection, Property, PropertyMeasurement, PropertyRoom, MeasurementSurface, MeasurementOpening, Quotation, ProjectScope


class CombinedMeasurementTests(APITestCase):
    def setUp(self):
        self.owner = BharathUser.objects.create_user(mobile="9000000811", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000000812", role="CONTRACTOR")
        self.customer = Customer.objects.create(contractor=self.owner, name="Mixed home", mobile="9000000813")
        ContractorCustomerConnection.objects.create(contractor=self.owner, customer=self.customer, status="CONNECTED")
        self.property = Property.objects.create(contractor=self.owner, customer=self.customer, name="Combined home")
        self.records = [PropertyMeasurement.objects.create(property=self.property, contractor=self.owner) for _ in range(2)]
        self.rooms = [PropertyRoom.objects.create(property=self.property, measurement_record=record, name=area, painting_area=area) for record, area in zip(self.records, ["INTERIOR", "EXTERIOR"])]
        self.surfaces = [MeasurementSurface.objects.create(property=self.property, measurement_record=record, room=room, work_area=area, surface_type="WALL", name=area, length=10, breadth=10) for record, room, area in zip(self.records, self.rooms, ["INTERIOR", "EXTERIOR"])]
        self.opening = MeasurementOpening.objects.create(surface=self.surfaces[0], opening_type="WINDOW", width=2, height=5, deduction_mode="FULL")
        self.client.force_authenticate(self.owner)

    def combine(self, ids=None):
        return self.client.post(f"/api/quotations/properties/{self.property.id}/measurement-records/combine/", {"measurements": ids if ids is not None else [r.id for r in self.records]}, format="json")

    def test_combine_preserves_dimensions_deductions_and_one_reference(self):
        response = self.combine()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], self.records[0].id)
        self.assertEqual(response.data["interior_sqft"], "90.00")
        self.assertEqual(response.data["exterior_sqft"], "100.00")
        self.assertEqual(response.data["total_sqft"], "190.00")
        self.assertEqual(self.property.measurement_records.count(), 1)
        self.assertIn(self.records[1].reference_no, response.data["notes"])
        for obj in self.rooms + self.surfaces:
            obj.refresh_from_db()
            self.assertEqual(obj.measurement_record_id, self.records[0].id)
        self.opening.refresh_from_db()
        self.assertEqual(self.opening.surface_id, self.surfaces[0].id)
        self.assertEqual(self.surfaces[0].length, Decimal("10"))

    def test_linked_submitted_and_locked_records_are_rejected_atomically(self):
        for field, value in [("submitted_at", timezone.now()), ("status", "LOCKED")]:
            PropertyMeasurement.objects.filter(pk=self.records[1].id).update(**{field: value})
            self.assertEqual(self.combine().status_code, 400)
            self.assertEqual(self.property.measurement_records.count(), 2)
            PropertyMeasurement.objects.filter(pk=self.records[1].id).update(submitted_at=None, status="DRAFT")
        Quotation.objects.create(contractor=self.owner, customer=self.customer, property=self.property, measurement_record=self.records[1])
        self.assertEqual(self.combine().status_code, 400)
        self.assertEqual(self.property.measurement_records.count(), 2)

    def test_foreign_property_or_contractor_records_cannot_be_combined(self):
        foreign = PropertyMeasurement.objects.create(property=self.property, contractor=self.other)
        self.assertEqual(self.combine([self.records[0].id, foreign.id]).status_code, 400)
        other_property = Property.objects.create(contractor=self.owner, customer=self.customer, name="Other site")
        wrong_site = PropertyMeasurement.objects.create(property=other_property, contractor=self.owner)
        self.assertEqual(self.combine([self.records[0].id, wrong_site.id]).status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.combine().status_code, 404)

    def test_invalid_selection_is_rejected_without_changes(self):
        for ids in [[], [self.records[0].id], [self.records[0].id] * 2, [True, self.records[0].id], ["bad", 1], [10**30, self.records[0].id], None]:
            response = self.client.post(f"/api/quotations/properties/{self.property.id}/measurement-records/combine/", {"measurements": ids}, format="json")
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.property.measurement_records.count(), 2)

    def test_project_scope_and_disconnected_customer_are_protected(self):
        quote = Quotation.objects.create(contractor=self.owner, customer=self.customer, property=self.property)
        ProjectScope.objects.create(quotation=quote, measurement_record=self.records[1], title="Existing work", quantity=Decimal("0"), unit_rate=Decimal("0"))
        self.assertEqual(self.combine().status_code, 400)
        ContractorCustomerConnection.objects.filter(contractor=self.owner, customer=self.customer).update(status="DISCONNECTED")
        self.assertEqual(self.combine().status_code, 404)
        self.assertEqual(self.property.measurement_records.count(), 2)

    def test_non_object_request_body_is_rejected(self):
        response = self.client.post(f"/api/quotations/properties/{self.property.id}/measurement-records/combine/", [1, 2], format="json")
        self.assertEqual(response.status_code, 400)

    def test_one_measurement_accepts_interior_and_exterior_surface_saves(self):
        url = reverse("measurement-surface-list-create", kwargs={"property_id": self.property.id}) + f"?measurement={self.records[0].id}"
        response = self.client.post(url, {"work_area": "EXTERIOR", "surface_type": "WALL", "name": "Exterior in same record", "length": 5, "breadth": 10}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["measurement_record"], self.records[0].id)
        detail = self.client.get(reverse("property-measurement-record-detail", kwargs={"pk": self.records[0].id}))
        self.assertEqual(detail.data["interior_sqft"], "90.00")
        self.assertEqual(detail.data["exterior_sqft"], "50.00")
