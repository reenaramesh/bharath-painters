from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import ContractorCustomerConnection, Customer, Property, PropertyMeasurement, PropertyRoom


class MeasurementSurfaceIdempotencyTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9010710421", role="CONTRACTOR")
        customer = Customer.objects.create(contractor=self.contractor, name="Measurement Customer", mobile="9010710422")
        ContractorCustomerConnection.objects.create(
            contractor=self.contractor, customer=customer, status=ContractorCustomerConnection.Status.CONNECTED,
        )
        self.property = Property.objects.create(customer=customer, contractor=self.contractor, name="Measured Site")
        self.record = PropertyMeasurement.objects.create(property=self.property, contractor=self.contractor)
        self.room = PropertyRoom.objects.create(
            property=self.property, measurement_record=self.record, name="Living Room", painting_area="INTERIOR",
        )
        self.client.force_authenticate(self.contractor)
        self.url = f"{reverse('measurement-surface-list-create', kwargs={'property_id': self.property.pk})}?measurement={self.record.pk}"
        self.payload = {
            "idempotency_key": "mobile-wall-request-1", "work_area": "INTERIOR",
            "surface_type": "WALL", "name": "Wall 1", "length": "10.00", "breadth": "9.00",
            "manual_area": "0.00", "quantity": 1, "paintable_sides": 1, "room": self.room.pk,
        }

    def test_retry_returns_same_measurement_surface(self):
        first = self.client.post(self.url, self.payload, format="json")
        second = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data["id"], second.data["id"])

    def test_reused_key_with_different_measurement_is_conflict(self):
        first = self.client.post(self.url, self.payload, format="json")
        changed = {**self.payload, "length": "11.00"}
        second = self.client.post(self.url, changed, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT, second.data)

    def test_retry_of_surface_that_started_a_new_measurement_record_reuses_its_record(self):
        """New-record retries use exterior data; an old record's room is invalid."""
        url = f"{reverse('measurement-surface-list-create', kwargs={'property_id': self.property.pk})}?new=1"
        payload = {**self.payload, "work_area": "EXTERIOR", "room": None}
        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(PropertyMeasurement.objects.filter(surfaces__id=first.data["id"]).distinct().count(), 1)

    def test_room_retry_after_offline_new_draft_reuses_room_and_measurement_record(self):
        url = f"{reverse('property-room-list-create', kwargs={'property_id': self.property.pk})}?new=1"
        payload = {"idempotency_key": "mobile-room-request-2", "name": "Kitchen", "painting_area": "INTERIOR"}
        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["measurement_record"], second.data["measurement_record"])
