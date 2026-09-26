from django.urls import reverse
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection, Customer, Property, PropertyRoom,
    PropertyMeasurement, MeasurementSurface, MeasurementOpening, MeasurementAccessRequest, Quotation,
)


class DraftAndSubmissionTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000011111", password="test-password", role="CONTRACTOR",
            is_verified=True, verification_status="VERIFIED",
        )
        self.other = BharathUser.objects.create_user(mobile="9000022222", password="test-password", role="CONTRACTOR")
        self.portal_user = BharathUser.objects.create_user(mobile="9000033333", password="test-password", role="CUSTOMER")
        self.customer = Customer.objects.create(name="Independent customer", mobile=self.portal_user.mobile, portal_user=self.portal_user)
        self.connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor, status="CONNECTED", requested_by=self.portal_user)
        self.property = Property.objects.create(customer=self.customer, contractor=self.contractor, connection=self.connection, name="Customer home")
        self.record = PropertyMeasurement.objects.create(property=self.property, contractor=self.contractor, connection=self.connection)
        self.room = PropertyRoom.objects.create(property=self.property, measurement_record=self.record, name="Living room")
        self.surface = MeasurementSurface.objects.create(property=self.property, measurement_record=self.record, room=self.room, surface_type="WALL", length=10, breadth=8)
        self.client.force_authenticate(self.contractor)
        self.submit_url = reverse("property-measurement-submit", kwargs={"pk": self.record.id})
        self.detail_url = reverse("customer-property-detail", kwargs={"pk": self.property.id})
        self.pdf_url = reverse("customer-property-measurement-pdf", kwargs={"pk": self.property.id})

    def payload(self):
        return {
            "customer": self.customer.id, "property": self.property.id,
            "measurement_record": self.record.id,
            "rooms": [{"property_room": self.room.id, "name": self.room.name}],
            "items": [{"room_index": 0, "description": "Painting", "calculation_method": "MANUAL", "quantity": "80.00", "rate": "10.00"}],
        }

    def test_save_and_reopen_draft_for_self_registered_customer(self):
        response = self.client.post(reverse("quotation-create"), self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "DRAFT")
        quotation = Quotation.objects.get(pk=response.data["id"])
        self.assertEqual(quotation.items.count(), 1)
        self.assertEqual(quotation.rooms.get().property_room_id, self.room.id)
        listing = self.client.get(reverse("quotation-list-create"))
        self.assertIn(quotation.id, [row["id"] for row in listing.data])
        detail = self.client.get(reverse("quotation-detail", kwargs={"pk": quotation.id}))
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data["items"][0]["description"], "Painting")
        self.record.refresh_from_db()
        self.assertIsNone(self.record.submitted_at)
        self.client.force_authenticate(self.portal_user)
        self.assertEqual(self.client.get(self.detail_url).data["surfaces"], [])

    def test_failed_nested_save_rolls_back_draft(self):
        payload = self.payload()
        payload["items"][0]["room_index"] = 99
        response = self.client.post(reverse("quotation-create"), payload, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Quotation.objects.exists())

    def test_room_from_another_property_is_rejected(self):
        other_property = Property.objects.create(customer=self.customer, contractor=self.contractor, connection=self.connection)
        other_room = PropertyRoom.objects.create(property=other_property, name="Different property")
        payload = self.payload()
        payload["rooms"][0]["property_room"] = other_room.id
        response = self.client.post(reverse("quotation-create"), payload, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Quotation.objects.exists())

    def test_unsubmitted_measurements_hidden_from_portal_and_pdf(self):
        self.client.force_authenticate(self.portal_user)
        for record_status in ("DRAFT", "IN_PROGRESS", "COMPLETED", "LOCKED"):
            self.record.status = record_status
            self.record.save()
            response = self.client.get(self.detail_url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["measurement_records"], [])
            self.assertEqual(response.data["rooms"], [])
            self.assertEqual(response.data["surfaces"], [])
            self.assertEqual(self.client.get(self.detail_url, {"measurement": self.record.id}).status_code, 404)
            self.assertEqual(self.client.get(self.pdf_url).status_code, 404)
            self.assertEqual(self.client.get(self.pdf_url, {"measurement": self.record.id}).status_code, 404)
        listing = self.client.get(reverse("customer-property-list"))
        self.assertEqual(listing.data[0]["surfaces"], 0)
        self.assertEqual(listing.data[0]["rooms"], 0)

    def test_submit_publishes_only_selected_record_and_pdf(self):
        response = self.client.post(self.submit_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["submitted_at"])
        self.assertEqual(self.client.post(self.submit_url).data["submitted_at"], response.data["submitted_at"])
        draft = PropertyMeasurement.objects.create(property=self.property, contractor=self.contractor)
        MeasurementSurface.objects.create(property=self.property, measurement_record=draft, work_area="EXTERIOR", surface_type="WALL", length=99, breadth=99)
        self.client.force_authenticate(self.portal_user)
        detail = self.client.get(self.detail_url)
        self.assertEqual([row["id"] for row in detail.data["measurement_records"]], [self.record.id])
        self.assertEqual([row["id"] for row in detail.data["surfaces"]], [self.surface.id])
        self.assertEqual(self.client.get(self.pdf_url).status_code, 200)
        self.assertEqual(self.client.get(self.pdf_url, {"measurement": draft.id}).status_code, 404)

    def test_other_users_cannot_submit(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.submit_url).status_code, 404)
        self.client.force_authenticate(self.portal_user)
        self.assertEqual(self.client.post(self.submit_url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.submit_url).status_code, 401)

    def test_empty_measurement_cannot_be_submitted(self):
        self.surface.delete()
        self.assertEqual(self.client.post(self.submit_url).status_code, 400)

    def test_edits_require_resubmission(self):
        for change in (lambda: self.room.save(), lambda: self.surface.save(), lambda: MeasurementOpening.objects.create(surface=self.surface, opening_type="WINDOW", width=2, height=2)):
            self.assertEqual(self.client.post(self.submit_url).status_code, 200)
            change()
            self.record.refresh_from_db()
            self.assertIsNone(self.record.submitted_at)
            self.client.force_authenticate(self.portal_user)
            self.assertEqual(self.client.get(self.detail_url).data["surfaces"], [])
            self.client.force_authenticate(self.contractor)

    def test_existing_sharing_approval_does_not_expose_drafts(self):
        access = MeasurementAccessRequest.objects.create(customer=self.customer, source_property=self.property, requesting_contractor=self.other, status="APPROVED")
        self.client.force_authenticate(self.other)
        response = self.client.get(reverse("approved-measurements", kwargs={"pk": access.id}))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["surfaces"], [])

    def test_metadata_changes_require_resubmission(self):
        self.assertEqual(self.client.post(self.submit_url).status_code, 200)
        response = self.client.patch(reverse("property-measurement-record-detail", kwargs={"pk": self.record.id}), {"notes": "Unfinished changes"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["submitted_at"])
        self.client.force_authenticate(self.portal_user)
        self.assertEqual(self.client.get(self.detail_url).data["measurement_records"], [])

    def test_legacy_rows_without_measurement_record_remain_private(self):
        legacy_room = PropertyRoom.objects.create(property=self.property, name="Legacy room")
        MeasurementSurface.objects.create(property=self.property, room=legacy_room, surface_type="WALL", length=10, breadth=10)
        self.client.force_authenticate(self.portal_user)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.data["rooms"], [])
        self.assertEqual(response.data["surfaces"], [])
