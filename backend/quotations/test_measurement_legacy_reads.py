"""Saved measurement reads before additive schema activation, in disposable DBs only."""
from contextlib import contextmanager

from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from quotations import test_measurement_revisions as fixtures
from quotations.models import PropertyMeasurement, PropertyRoom, MeasurementSurface


@contextmanager
def legacy_measurement_columns():
    assert str(connection.settings_dict["NAME"]).startswith("test_bharath_audit_"), "Disposable audit database required"
    fields = [(PropertyMeasurement, "edit_revision")]
    fields += [(model, field) for model in (PropertyRoom, MeasurementSurface)
               for field in ("idempotency_key", "idempotency_revision", "idempotency_fingerprint")]
    removed = []
    try:
        for model, name in fields:
            with connection.schema_editor() as editor:
                editor.remove_field(model, model._meta.get_field(name))
            removed.append((model, name))
        yield
    finally:
        for model, name in reversed(removed):
            with connection.schema_editor() as editor:
                editor.add_field(model, model._meta.get_field(name))


class LegacyMeasurementReadTests(fixtures.MeasurementFixture, TransactionTestCase):
    def setUp(self):
        super().setUp()
        PropertyMeasurement.objects.filter(pk=self.record.pk).update(version=7, notes="Historical dimensions")
        self.client.raise_request_exception = False

    def test_saved_records_rooms_surfaces_and_openings_remain_readable_without_new_columns(self):
        with legacy_measurement_columns():
            property_response = self.client.get(f"/api/quotations/properties/{self.property.pk}/")
            self.assertEqual(property_response.status_code, 200)
            self.assertIs(property_response.data.get("measurement_editing_available", True), False)
            response = self.client.get(self.url("property-measurement-records"))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data[0]["id"], self.record.pk)
            self.assertEqual(response.data[0]["version"], 7)
            self.assertEqual(response.data[0]["total_sqft"], "84.00")
            self.assertEqual(response.data[0]["notes"], "Historical dimensions")
            self.assertIsNone(response.data[0]["edit_revision"])
            self.assertFalse(response.data[0]["can_combine"])
            for name in ["property-room-list-create", "measurement-surface-list-create"]:
                child = self.client.get(self.url(name))
                self.assertEqual(child.status_code, 200, name)
                self.assertEqual(len(child.data), 1)
                self.assertIsNone(child.data[0]["measurement_revision"])
            detail = self.client.get(self.url("property-measurement-record-detail"))
            self.assertEqual(detail.status_code, 200)
            surface = self.client.get(self.url("measurement-surface-detail", self.surface.pk))
            self.assertEqual(surface.status_code, 200)
            self.assertEqual(surface.data["net_area"], "84.00")
            self.assertEqual(surface.data["openings"][0]["area"], "6.00")
            self.assertIsNone(surface.data["openings"][0]["measurement_revision"])
            pdf = self.client.get(f"/api/quotations/properties/{self.property.pk}/measurements/pdf/?measurement={self.record.pk}")
            self.assertEqual(pdf.status_code, 200)
            self.assertTrue(pdf.content.startswith(b"%PDF"))
        # No process-global schema cache may outlive activation.
        restored = self.client.get(self.url("property-measurement-record-detail"))
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.data["edit_revision"], 0)

    def test_legacy_schema_rejects_content_writes_without_partial_changes(self):
        with legacy_measurement_columns():
            before = self.snapshot()
            for method, path, payload in [
                ("post", self.url("property-measurement-records"), {}),
                ("post", self.url("property-room-list-create"), {"name": "Unsafe new room"}),
                ("post", self.url("measurement-surface-list-create"), {"name": "Unsafe surface"}),
                ("patch", self.url("property-room-detail", self.room.pk), {"name": "Unsafe rename"}),
                ("delete", self.url("measurement-surface-detail", self.surface.pk), {}),
                ("post", self.url("measurement-opening-list-create"), {"opening_type": "DOOR"}),
                ("post", self.url("room-measurement-save"), {"room_id": self.room.pk}),
                ("post", f"/api/quotations/measurement-records/{self.record.pk}/submit/", {}),
                ("post", f"/api/quotations/properties/{self.property.pk}/measurement-records/combine/", {"measurements": [self.record.pk, self.record.pk + 1]}),
            ]:
                response = getattr(self.client, method)(path, payload, format="json")
                self.assertEqual(response.status_code, 503, (method, path))
                self.assertEqual(self.snapshot(), before)

    def test_legacy_linked_components_keep_two_sided_area_and_single_opening_deduction(self):
        component = MeasurementSurface.objects.create(
            property=self.property, measurement_record=self.record,
            work_area="EXTERIOR", surface_type="WINDOW", name="Two-sided window",
            length=2, breadth=3, paintable_sides=2,
        )
        self.opening.linked_surface = component
        self.opening.save(update_fields=("linked_surface",))
        with legacy_measurement_columns():
            response = self.client.get(self.url("measurement-surface-detail", self.surface.pk))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["openings"][0]["area"], "12.00")
            self.assertEqual(response.data["openings"][0]["effective_deduction"], "6.00")
            self.assertEqual(response.data["net_area"], "84.00")
            records = self.client.get(self.url("property-measurement-records"))
            self.assertEqual(records.status_code, 200)
            self.assertEqual(records.data[0]["total_sqft"], "96.00")

    def snapshot(self):
        with connection.cursor() as cursor:
            result = []
            for table in ["quotations_propertymeasurement", "quotations_propertyroom", "quotations_measurementsurface", "quotations_measurementopening"]:
                cursor.execute(f'SELECT * FROM "{table}" ORDER BY id')
                result.append(cursor.fetchall())
            return result

    def test_legacy_read_access_still_rejects_unrelated_accounts(self):
        with legacy_measurement_columns():
            self.client.force_authenticate(self.other)
            response = self.client.get(self.url("property-measurement-record-detail"))
            self.assertEqual(response.status_code, 404)
            response = self.client.get(self.url("property-room-list-create"))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, [])
