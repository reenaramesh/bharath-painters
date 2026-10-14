"""Phase 1 customer identity and contractor-relationship regressions."""
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection, Customer, Lead, MeasurementAccessRequest,
    MeasurementOpening, MeasurementSurface, Property, PropertyMeasurement, PropertyRoom,
)


class Phase1CustomerRelationshipTests(APITestCase):
    def setUp(self):
        flags = {"is_verified": True, "verification_status": "VERIFIED"}
        self.owner = BharathUser.objects.create_user(mobile="9000011101", role="CONTRACTOR", **flags)
        self.receiver = BharathUser.objects.create_user(mobile="9000011102", role="CONTRACTOR", **flags)
        self.outsider = BharathUser.objects.create_user(mobile="9000011103", role="CONTRACTOR", **flags)
        self.customer_user = BharathUser.objects.create_user(mobile="9000011104", role="CUSTOMER")
        self.customer = Customer.objects.create(
            contractor=self.owner, portal_user=self.customer_user, name="Shared customer",
            mobile="+91 9000011104",
        )
        self.owner_connection = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.owner, status="CONNECTED",
        )
        self.connection = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.receiver, status="CONNECTED",
        )
        self.source = Property.objects.create(
            customer=self.customer, contractor=self.owner, connection=self.owner_connection,
            name="Original property", city="Bengaluru",
        )
        self.record = PropertyMeasurement.objects.create(
            property=self.source, contractor=self.owner, status="COMPLETED",
        )
        self.room = PropertyRoom.objects.create(
            property=self.source, measurement_record=self.record, name="Utility", painting_area="EXTERIOR",
        )
        self.surface = MeasurementSurface.objects.create(
            property=self.source, measurement_record=self.record, room=self.room,
            work_area="EXTERIOR", surface_type="OTHER", area_group_name="Texture Walls",
            name="Repeated walls", length=10, breadth=10, quantity=3,
        )
        MeasurementOpening.objects.create(
            surface=self.surface, opening_type="WINDOW", name="Window", quantity=2,
            width=2, height=3, deduction_mode="FULL", effect="DEDUCT",
        )
        # Adding measurement rows invalidates publication, so publish only after
        # the fixture's room, surface, and opening data are complete.
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(submitted_at=timezone.now())
        self.record.refresh_from_db()
        self.access = MeasurementAccessRequest.objects.create(
            requesting_contractor=self.receiver, customer=self.customer, source_property=self.source,
            status="APPROVED",
        )
        self.url = reverse("measurement-access-prepare-quotation", kwargs={"pk": self.access.pk})
        self.client.force_authenticate(self.receiver)

    def test_connected_shared_customer_can_create_opportunity_without_duplicate_identity(self):
        search = self.client.get(reverse("client-search"), {"query": "Shared customer"})
        self.assertEqual(search.status_code, 200)
        self.assertEqual([row["id"] for row in search.data], [self.customer.pk])
        response = self.client.post(reverse("lead-list"), {
            "customer": self.customer.pk, "title": "Exterior painting",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Lead.objects.get().customer_id, self.customer.pk)
        self.assertEqual(Lead.objects.get().contractor_id, self.receiver.pk)
        self.assertEqual(Customer.objects.count(), 1)

    def test_unconnected_contractor_cannot_lookup_or_create_customer_opportunity(self):
        self.client.force_authenticate(self.outsider)
        search = self.client.get(reverse("client-search"), {"query": self.customer.mobile})
        self.assertEqual(search.data, [])
        response = self.client.post(reverse("lead-list"), {
            "customer": self.customer.pk, "title": "Not authorized",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Lead.objects.count(), 0)

    def test_revoked_creator_connection_does_not_authorize_opportunity(self):
        self.owner_connection.status = "DISCONNECTED"
        self.owner_connection.save(update_fields=["status"])
        self.client.force_authenticate(self.owner)
        response = self.client.post(reverse("lead-list"), {
            "customer": self.customer.pk, "title": "Revoked",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Lead.objects.count(), 0)

    def test_legacy_creator_without_any_connection_keeps_existing_opportunity_access(self):
        legacy_owner = BharathUser.objects.create_user(mobile="9000011110", role="CONTRACTOR")
        legacy = Customer.objects.create(contractor=legacy_owner, name="Legacy customer", mobile="9000011190")
        self.client.force_authenticate(legacy_owner)
        response = self.client.post(reverse("lead-list"), {
            "customer": legacy.pk, "title": "Legacy customer",
        }, format="json")
        self.assertEqual(response.status_code, 201)

    def test_opportunity_cannot_link_other_contractors_private_property(self):
        response = self.client.post(reverse("lead-list"), {
            "customer": self.customer.pk, "property": self.source.pk, "title": "Wrong property",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Lead.objects.count(), 0)

    def test_shared_measurement_reuses_identity_and_preserves_owner_and_measurements(self):
        self.assertIsNotNone(self.record.submitted_at)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["customer"], self.customer.pk)
        target = Property.objects.get(pk=response.data["property"])
        self.assertEqual(target.customer_id, self.customer.pk)
        self.assertEqual(target.contractor_id, self.receiver.pk)
        self.assertEqual(target.connection_id, self.connection.pk)
        copied_record = target.measurement_records.get()
        self.assertEqual(copied_record.contractor_id, self.receiver.pk)
        self.assertEqual(copied_record.connection_id, self.connection.pk)
        copied = target.measurement_surfaces.get()
        self.assertEqual(copied.quantity, 3)
        self.assertEqual(copied.area_group_name, "Texture Walls")
        self.assertEqual(copied.room.painting_area, "EXTERIOR")
        self.assertEqual(copied.net_area, self.surface.net_area)
        self.assertEqual(copied.net_area, Decimal("288"))
        self.assertEqual(Customer.objects.count(), 1)
        self.source.refresh_from_db()
        self.assertEqual(self.source.contractor_id, self.owner.pk)

    def test_prepare_repeated_request_reuses_target(self):
        first = self.client.post(self.url)
        second = self.client.post(self.url)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data, second.data)
        self.assertEqual(Property.objects.count(), 2)

    def test_sharing_approval_does_not_silently_grant_connection_consent(self):
        for state in ["PENDING", "REJECTED", "DISCONNECTED", "BLOCKED"]:
            with self.subTest(state=state):
                self.connection.status = state
                self.connection.save(update_fields=["status"])
                response = self.client.post(self.url)
                self.assertEqual(response.status_code, 403)
                self.assertNotIn("customer", response.data)
                self.assertEqual(Customer.objects.count(), 1)
                self.assertEqual(Property.objects.count(), 1)
                self.connection.refresh_from_db()
                self.assertEqual(self.connection.status, state)

    def test_revocation_after_preparation_does_not_return_target_ids(self):
        self.assertEqual(self.client.post(self.url).status_code, 201)
        self.connection.status = "DISCONNECTED"
        self.connection.save(update_fields=["status"])
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("customer", response.data)

    def test_other_contractor_and_customer_cannot_prepare_another_access_request(self):
        for user in [self.outsider, self.customer_user]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.post(self.url)
                self.assertIn(response.status_code, [403, 404])
                self.assertNotIn("customer", response.data)
                self.assertEqual(Property.objects.count(), 1)

    def test_pending_sharing_request_cannot_prepare(self):
        self.access.status = "PENDING"
        self.access.save(update_fields=["status"])
        self.assertEqual(self.client.post(self.url).status_code, 404)

    def test_source_without_submitted_measurement_leaves_no_partial_copy(self):
        self.record.submitted_at = None
        self.record.save(update_fields=["submitted_at"])
        self.client.raise_request_exception = False
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Property.objects.count(), 1)
        self.assertEqual(Customer.objects.count(), 1)

    def test_global_mobile_uniqueness_is_unchanged(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Customer.objects.create(contractor=self.receiver, name="Duplicate", mobile="919000011104")
