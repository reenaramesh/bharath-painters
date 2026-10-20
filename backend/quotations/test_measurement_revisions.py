from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
import time

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase
from rest_framework.exceptions import ValidationError

from accounts.models import BharathUser
from quotations.models import (
    ContractorCustomerConnection, Customer, MeasurementOpening, MeasurementSurface,
    Property, PropertyMeasurement, PropertyRoom, Quotation,
)
from quotations.serializers import QuotationSerializer


class MeasurementFixture:
    def setUp(self):
        super().setUp()
        self.owner = BharathUser.objects.create_user(mobile="9088811001", role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.other = BharathUser.objects.create_user(mobile="9088811002", role="CONTRACTOR")
        customer = Customer.objects.create(contractor=self.owner, name="Revision customer", mobile="9088811003")
        ContractorCustomerConnection.objects.create(contractor=self.owner, customer=customer, status="CONNECTED")
        self.property = Property.objects.create(customer=customer, contractor=self.owner, name="Revision site")
        self.record = PropertyMeasurement.objects.create(property=self.property, contractor=self.owner)
        self.room = PropertyRoom.objects.create(property=self.property, measurement_record=self.record, name="Living")
        self.surface = MeasurementSurface.objects.create(
            property=self.property, measurement_record=self.record, room=self.room,
            work_area="INTERIOR", surface_type="WALL", name="Wall", length=10, breadth=9,
        )
        self.opening = MeasurementOpening.objects.create(surface=self.surface, opening_type="WINDOW", width=2, height=3)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def url(self, name, pk=None):
        if name in {"property-room-list-create", "measurement-surface-list-create", "room-measurement-save", "property-measurement-records"}:
            return reverse(name, kwargs={"property_id": self.property.pk}) + f"?measurement={self.record.pk}"
        if name == "measurement-opening-list-create":
            return reverse(name, kwargs={"surface_id": self.surface.pk})
        return reverse(name, kwargs={"pk": pk or self.record.pk})

    def revision(self):
        self.record.refresh_from_db()
        return getattr(self.record, "edit_revision", -1)

    def bump(self):
        response = self.client.patch(self.url("property-measurement-record-detail"), {"notes": "Server edit"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)


class MeasurementRevisionTests(MeasurementFixture, APITestCase):
    def test_online_legacy_surface_opening_remains_supported_without_revision(self):
        surface = MeasurementSurface.objects.create(property=self.property,
            work_area="EXTERIOR", surface_type="WALL", name="Legacy exterior", length=10, breadth=9)
        url = reverse("measurement-opening-list-create", kwargs={"surface_id": surface.pk})
        response = self.client.post(url, {"opening_type": "WINDOW", "width": "2", "height": "3"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(MeasurementOpening.objects.filter(surface=surface).count(), 1)
        response = self.client.post(url, {"opening_type": "WINDOW", "width": "2", "height": "3", "expected_revision": 0}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
    def test_revisions_are_exposed_and_historical_version_is_read_only(self):
        parent = self.client.get(self.url("property-measurement-record-detail"))
        self.assertEqual(parent.data.get("edit_revision"), 0)
        for name, pk in [("property-room-detail", self.room.pk), ("measurement-surface-detail", self.surface.pk), ("measurement-opening-detail", self.opening.pk)]:
            response = self.client.get(self.url(name, pk))
            self.assertEqual(response.data.get("measurement_revision"), 0)
        response = self.client.patch(self.url("property-measurement-record-detail"), {"notes": "Changed", "edit_revision": 900, "version": 900, "expected_revision": 0}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data.get("edit_revision"), 1)
        self.assertEqual(response.data["version"], 1)

    def test_content_metadata_noop_does_not_advance_revision(self):
        self.bump()
        self.assertEqual(self.revision(), 1)
        response = self.client.patch(self.url("property-measurement-record-detail"), {"notes": "Server edit", "expected_revision": 1}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.revision(), 1)

    def test_quotation_lock_advances_content_revision_without_changing_historical_version(self):
        payload = {
            "customer": self.property.customer_id, "property": self.property.pk,
            "measurement_record": self.record.pk,
            "rooms": [{"property_room": self.room.pk, "name": self.room.name}],
            "items": [{"room_index": 0, "description": "Painting", "calculation_method": "MANUAL", "quantity": "90.00", "rate": "10.00"}],
        }
        response = self.client.post(reverse("quotation-create"), payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.revision(), 1)
        self.assertEqual(self.record.status, "LOCKED")
        self.assertEqual(self.record.version, 1)

    def test_draft_quotation_source_swap_locks_new_source_and_preserves_old_history(self):
        old = Quotation.objects.create(contractor=self.owner, customer=self.property.customer, property=self.property, measurement_record=self.record)
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(status="LOCKED", edit_revision=3)
        new = PropertyMeasurement.objects.create(property=self.property, contractor=self.owner)
        room = PropertyRoom.objects.create(property=self.property, measurement_record=new, name="New room")
        MeasurementSurface.objects.create(property=self.property, measurement_record=new, room=room, work_area="INTERIOR", surface_type="WALL", name="New wall", length=10, breadth=10)
        response = self.client.patch(reverse("quotation-detail", kwargs={"pk": old.pk}), {
            "measurement_record": new.pk, "rooms": [{"property_room": room.pk, "name": room.name}],
            "items": [{"room_index": 0, "description": "New source", "calculation_method": "MANUAL", "quantity": "100.00", "rate": "10.00"}],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        new.refresh_from_db()
        self.assertEqual(new.status, "LOCKED")
        self.assertEqual(new.edit_revision, 1)
        self.assertEqual(new.version, 2)
        self.assertEqual(self.revision(), 3)
        self.assertEqual(self.record.status, "LOCKED")
        self.assertEqual(self.record.version, 1)
        unchanged = self.client.patch(reverse("quotation-detail", kwargs={"pk": old.pk}), {"notes": "Draft note"}, format="json")
        self.assertEqual(unchanged.status_code, 200, unchanged.data)
        new.refresh_from_db()
        self.assertEqual(new.edit_revision, 1)

    def test_grouped_measurement_sources_are_revalidated_inside_the_source_lock(self):
        quantity = format(self.surface.net_area, ".2f")
        details = {
            "schema_version": 1, "kind": "group", "assignment_id": "walls",
            "surface": "WALL", "measurement_record": self.record.pk,
            "measurement_version": self.record.version, "room_ids": [self.room.pk],
            "contributions": [{"room_id": self.room.pk, "quantity": quantity, "sources": [
                {"surface_id": self.surface.pk, "original_area": quantity, "quantity": quantity},
            ]}],
        }
        serializer = QuotationSerializer(data={
            "customer": self.property.customer_id, "property": self.property.pk,
            "measurement_record": self.record.pk, "rooms": [],
            "items": [{"description": "Walls", "calculation_method": "MANUAL", "quantity": quantity,
                       "rate": "10.00", "specification_details": details}],
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        # Reproduce a content edit after HTTP validation and before save has
        # acquired the source lock, without mocking either validation or save.
        self.surface.length = 20
        self.surface.save()
        with self.assertRaises(ValidationError):
            serializer.save(contractor=self.owner)
        self.assertFalse(Quotation.objects.exists())

    def test_locked_measurement_can_be_published_without_changing_content(self):
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(status="LOCKED")
        response = self.client.post(self.url("property-measurement-submit"), {"expected_revision": 0}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "LOCKED")
        self.assertEqual(self.revision(), 1)

    def test_successful_child_deletions_advance_parent_once(self):
        for expected, (name, pk) in enumerate([
            ("measurement-surface-detail", self.surface.pk),
            ("property-room-detail", self.room.pk),
        ]):
            response = self.client.delete(self.url(name, pk), {"expected_revision": expected}, format="json")
            self.assertEqual(response.status_code, 204, getattr(response, "data", None))
            self.assertEqual(self.revision(), expected + 1)

    def test_all_existing_record_mutations_reject_stale_revision_without_writes(self):
        self.bump()
        requests = [
            ("post", self.url("property-room-list-create"), {"name": "Stale room"}),
            ("patch", self.url("property-room-detail", self.room.pk), {"name": "Stale room"}),
            ("delete", self.url("property-room-detail", self.room.pk), {}),
            ("post", self.url("measurement-surface-list-create"), {"name": "Stale wall", "work_area": "EXTERIOR", "surface_type": "WALL"}),
            ("patch", self.url("measurement-surface-detail", self.surface.pk), {"length": 20}),
            ("delete", self.url("measurement-surface-detail", self.surface.pk), {}),
            ("post", self.url("measurement-opening-list-create"), {"opening_type": "DOOR", "width": 2, "height": 7}),
            ("patch", self.url("measurement-opening-detail", self.opening.pk), {"width": 4}),
            ("delete", self.url("measurement-opening-detail", self.opening.pk), {}),
            ("post", self.url("room-measurement-save"), {"room_id": self.room.pk, "walls": [{"length": 20, "breadth": 9}]}),
            ("patch", self.url("property-measurement-record-detail"), {"notes": "Stale notes"}),
            ("delete", self.url("property-measurement-record-detail"), {}),
            ("post", self.url("property-measurement-submit"), {}),
        ]
        for method, url, payload in requests:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {**payload, "expected_revision": 0}, format="json")
                self.assertEqual(response.status_code, 409, response.data)
                self.assertEqual(self.revision(), 1)
                self.assertEqual(PropertyRoom.objects.filter(measurement_record=self.record).count(), 1)
                self.assertEqual(MeasurementSurface.objects.filter(measurement_record=self.record).count(), 1)
                self.assertEqual(MeasurementOpening.objects.filter(surface=self.surface).count(), 1)

    def test_invalid_revision_is_rejected_before_any_write(self):
        for expected in [True, False, -1, 0.0, 1.5, "bad", None, [], {}]:
            with self.subTest(expected=expected):
                response = self.client.patch(self.url("property-room-detail", self.room.pk), {"name": "Invalid", "expected_revision": expected}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
        self.room.refresh_from_db()
        self.assertEqual(self.room.name, "Living")

    def test_successful_room_surface_opening_and_combined_writes_advance_one_revision(self):
        requests = [
            ("patch", self.url("property-room-detail", self.room.pk), {"name": "Bedroom"}),
            ("patch", self.url("measurement-surface-detail", self.surface.pk), {"length": 11}),
            ("patch", self.url("measurement-opening-detail", self.opening.pk), {"width": 3}),
            ("delete", self.url("measurement-opening-detail", self.opening.pk), {}),
            ("post", self.url("measurement-opening-list-create"), {"opening_type": "DOOR", "width": 2, "height": 7}),
            ("post", self.url("room-measurement-save"), {"room_id": self.room.pk, "walls": [{"length": 12, "breadth": 9}]}),
        ]
        for expected, (method, url, payload) in enumerate(requests):
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {**payload, "expected_revision": expected}, format="json")
                self.assertIn(response.status_code, [200, 201, 204], getattr(response, "data", None))
                self.assertEqual(self.revision(), expected + 1)

    def test_unchanged_child_update_does_not_advance_revision(self):
        for name, pk, payload in [
            ("property-room-detail", self.room.pk, {"name": "Living"}),
            ("measurement-surface-detail", self.surface.pk, {"length": "10.00"}),
            ("measurement-opening-detail", self.opening.pk, {"width": "2.00"}),
        ]:
            response = self.client.patch(self.url(name, pk), {**payload, "expected_revision": 0}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(self.revision(), 0)

    def test_locked_record_blocks_all_content_mutations(self):
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(status="LOCKED")
        for method, url, payload in [
            ("patch", self.url("property-measurement-record-detail"), {"notes": "Locked"}),
            ("post", self.url("property-room-list-create"), {"name": "Locked"}),
            ("patch", self.url("property-room-detail", self.room.pk), {"name": "Locked"}),
            ("post", self.url("measurement-surface-list-create"), {"name": "Locked", "work_area": "EXTERIOR", "surface_type": "WALL"}),
            ("post", self.url("measurement-opening-list-create"), {"opening_type": "DOOR"}),
            ("patch", self.url("measurement-opening-detail", self.opening.pk), {"width": 5}),
            ("delete", self.url("measurement-opening-detail", self.opening.pk), {}),
            ("post", self.url("room-measurement-save"), {"room_id": self.room.pk, "walls": [{"length": 20, "breadth": 9}]}),
        ]:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, payload, format="json")
                self.assertEqual(response.status_code, 400, response.data)

    def test_same_property_different_measurement_room_and_linked_surface_are_rejected(self):
        foreign_record = PropertyMeasurement.objects.create(property=self.property, contractor=self.owner)
        foreign_room = PropertyRoom.objects.create(property=self.property, measurement_record=foreign_record, name="Other record")
        foreign_surface = MeasurementSurface.objects.create(property=self.property, measurement_record=foreign_record, work_area="EXTERIOR", surface_type="DOOR", name="Door")
        response = self.client.patch(self.url("measurement-surface-detail", self.surface.pk), {"room": foreign_room.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        response = self.client.patch(self.url("measurement-opening-detail", self.opening.pk), {"linked_surface": foreign_surface.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)

    def test_accessible_property_does_not_authorize_another_contractors_measurement(self):
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(contractor=self.other)
        for name, pk, payload in [
            ("property-room-detail", self.room.pk, {"name": "Foreign"}),
            ("measurement-surface-detail", self.surface.pk, {"length": 20}),
            ("measurement-opening-detail", self.opening.pk, {"width": 20}),
        ]:
            response = self.client.patch(self.url(name, pk), payload, format="json")
            self.assertIn(response.status_code, [400, 403, 404], response.data)

    def test_create_replay_keeps_original_acknowledgement_revision_after_server_edit(self):
        for name, payload in [
            ("property-room-list-create", {"name": "New room", "idempotency_key": "revision-room"}),
            ("measurement-surface-list-create", {"name": "New wall", "work_area": "EXTERIOR", "surface_type": "WALL", "idempotency_key": "revision-wall"}),
        ]:
            expected = max(self.revision(), 0)
            data = {**payload, "expected_revision": expected}
            created = self.client.post(self.url(name), data, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            self.assertEqual(created.data.get("measurement_revision"), expected + 1)
            self.client.patch(self.url("property-measurement-record-detail"), {"notes": name}, format="json")
            before = self.revision()
            replay = self.client.post(self.url(name), data, format="json")
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertEqual(replay.data.get("measurement_revision"), expected + 1)
            self.assertEqual(self.revision(), before)

    def test_new_room_replay_exposes_parent_identity_and_does_not_create_orphan_record(self):
        url = reverse("property-room-list-create", kwargs={"property_id": self.property.pk}) + "?new=1"
        payload = {"idempotency_key": "new-revision-room", "name": "Offline room"}
        created = self.client.post(url, payload, format="json")
        replay = self.client.post(url, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(created.data.get("measurement_revision"), 1)
        self.assertEqual(created.data["measurement_record"], replay.data["measurement_record"])
        self.assertEqual(PropertyMeasurement.objects.filter(property=self.property).count(), 2)

    def test_legacy_idempotency_acknowledgement_cannot_silently_rebase_offline(self):
        self.room.idempotency_key = "legacy-room"
        self.room.save()
        response = self.client.post(self.url("property-room-list-create"), {"name": "Living", "idempotency_key": "legacy-room", "expected_revision": 0}, format="json")
        self.assertEqual(response.status_code, 409, response.data)

    def test_invalid_surface_timestamp_is_controlled_conflict_without_writes(self):
        response = self.client.patch(self.url("measurement-surface-detail", self.surface.pk), {
            "length": 30, "expected_updated_at": "2026-02-30T12:00:00Z",
        }, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.surface.refresh_from_db()
        self.assertEqual(self.surface.length, 10)
        self.assertEqual(self.revision(), 0)

    def test_invalid_surface_timestamp_rejects_noop_precondition_too(self):
        response = self.client.patch(self.url("measurement-surface-detail", self.surface.pk), {
            "length": 10, "expected_updated_at": "2026-02-30T12:00:00Z",
        }, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(self.revision(), 0)

    def test_creation_fingerprint_keeps_legacy_nullable_empty_number_compatibility(self):
        payload = {"name": "Nullable fields", "idempotency_key": "nullable-room", "length": "", "room_type": ""}
        created = self.client.post(self.url("property-room-list-create"), payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        replay = self.client.post(self.url("property-room-list-create"), {**payload, "length": None, "room_type": None}, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)

    def test_room_and_surface_creation_keys_cannot_be_changed_or_cleared(self):
        for name, detail, payload in [
            ("property-room-list-create", "property-room-detail", {"name": "Stable room", "idempotency_key": "immutable-room"}),
            ("measurement-surface-list-create", "measurement-surface-detail", {"name": "Stable wall", "work_area": "EXTERIOR", "surface_type": "WALL", "idempotency_key": "immutable-wall"}),
        ]:
            created = self.client.post(self.url(name), payload, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            before = self.revision()
            url = self.url(detail, created.data["id"])
            for key in ["different-key", "", None]:
                changed = self.client.patch(url, {"idempotency_key": key}, format="json")
                self.assertEqual(changed.status_code, 400, changed.data)
                self.assertEqual(self.revision(), before)
            unchanged = self.client.patch(url, {"idempotency_key": payload["idempotency_key"]}, format="json")
            self.assertEqual(unchanged.status_code, 200, unchanged.data)
            self.assertEqual(self.revision(), before)

    def test_original_create_replay_survives_child_edits_and_retains_original_ack(self):
        for name, detail, payload in [
            ("property-room-list-create", "property-room-detail", {"name": "Original room", "length": "10.00", "width": 5, "height": 9, "idempotency_key": "original-room"}),
            ("measurement-surface-list-create", "measurement-surface-detail", {"name": "Original wall", "work_area": "EXTERIOR", "surface_type": "WALL", "length": "10.00", "breadth": 9, "idempotency_key": "original-wall"}),
        ]:
            expected = max(self.revision(), 0)
            original = {**payload, "expected_revision": expected}
            created = self.client.post(self.url(name), original, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            url = self.url(detail, created.data["id"])
            changed = self.client.patch(url, {"name": "Later name", "length": 20}, format="json")
            self.assertEqual(changed.status_code, 200, changed.data)
            before = self.revision()
            replay = self.client.post(self.url(name), original, format="json")
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertEqual(replay.data["measurement_revision"], expected + 1)
            self.assertEqual(replay.data["name"], "Later name")
            self.assertEqual(self.revision(), before)
            rejected = self.client.post(self.url(name), {**original, "length": 20}, format="json")
            self.assertEqual(rejected.status_code, 409, rejected.data)

    def test_create_fingerprints_normalize_numbers_defaults_and_metadata(self):
        for name, payload in [
            ("property-room-list-create", {"name": "Numbers", "length": "10.00", "window_count": "0", "idempotency_key": "number-room"}),
            ("measurement-surface-list-create", {"name": "Numbers", "work_area": "EXTERIOR", "surface_type": "WALL", "length": "10.00", "quantity": "1", "idempotency_key": "number-wall"}),
        ]:
            created = self.client.post(self.url(name), payload, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            numeric = {**payload, "length": 10, "expected_revision": created.data["measurement_revision"] - 1}
            if name == "property-room-list-create":
                numeric.update(window_count=0, section="", door_count=0)
            else:
                numeric.update(quantity=1, paintable_sides=1, room=None)
            replay = self.client.post(self.url(name), numeric, format="json")
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertEqual(replay.data["measurement_revision"], created.data["measurement_revision"])
            self.assertNotIn("idempotency_fingerprint", replay.data)
            self.assertNotIn("idempotency_revision", replay.data)

    def test_failed_combined_save_rolls_back_legacy_room_binding_and_parent_creation(self):
        legacy = PropertyRoom.objects.create(property=self.property, name="Legacy")
        before = PropertyMeasurement.objects.count()
        url = reverse("room-measurement-save", kwargs={"property_id": self.property.pk}) + "?new=1"
        response = self.client.post(url, {"room_id": legacy.pk, "walls": "invalid"}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        legacy.refresh_from_db()
        self.assertIsNone(legacy.measurement_record_id)
        self.assertEqual(PropertyMeasurement.objects.count(), before)


class MeasurementConcurrentRevisionTests(MeasurementFixture, TransactionTestCase):
    def test_legacy_room_binding_is_rechecked_after_waiting_for_property_lock(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock concurrency proof requires PostgreSQL")
        legacy = PropertyRoom.objects.create(property=self.property, name="Legacy")
        started = Event()
        worker_pid = []

        def edit_legacy():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(BharathUser.objects.get(pk=self.owner.pk))
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    worker_pid.append(cursor.fetchone()[0])
                started.set()
                return client.patch(self.url("property-room-detail", legacy.pk), {"name": "Unsafe edit"}, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=1) as executor:
            with transaction.atomic():
                Property.objects.select_for_update().get(pk=self.property.pk)
                future = executor.submit(edit_legacy)
                self.assertTrue(started.wait(timeout=10))
                deadline = time.monotonic() + 10
                blocked = False
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", worker_pid)
                        row = cursor.fetchone()
                    if row and row[0] == "Lock":
                        blocked = True
                        break
                    time.sleep(0.01)
                self.assertTrue(blocked, "The editing connection must wait for the property row lock")
                PropertyMeasurement.objects.filter(pk=self.record.pk).update(status="LOCKED")
                PropertyRoom.objects.filter(pk=legacy.pk).update(measurement_record=self.record)
            self.assertEqual(future.result(timeout=10), 400)
        legacy.refresh_from_db()
        self.assertEqual(legacy.name, "Legacy")

    def test_independent_postgres_connections_accept_only_one_writer_for_same_revision(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock concurrency proof requires PostgreSQL")
        barrier = Barrier(2)
        url = self.url("property-room-detail", self.room.pk)

        def write(name):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(BharathUser.objects.get(pk=self.owner.pk))
                barrier.wait(timeout=10)
                response = client.patch(url, {"name": name, "expected_revision": 0}, format="json")
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(write, ["Writer one", "Writer two"]))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.revision(), 1)
