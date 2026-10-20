from unittest.mock import patch

from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Quotation, QuotationRoom, QuotationItem
from . import tests as fixtures
from . import test_grouped_specifications as grouped_fixtures


class DraftRepairTests(APITestCase):
    setUp = fixtures.QuotationApiTests.setUp

    def draft(self):
        quotation = Quotation.objects.create(
            contractor=self.contractor, customer=self.customer, property=self.property,
            connection=self.connection, notes="Original", quotation_type="MANUAL_LUMPSUM",
            quotation_number=f"DRAFT-REPAIR-{Quotation.objects.count() + 1}",
        )
        room = QuotationRoom.objects.create(quotation=quotation, property_room=self.room, name="Saved room", length=10)
        item = QuotationItem.objects.create(quotation=quotation, room=room, description="Saved work", calculation_method="MANUAL", quantity=2, rate=10, amount=20)
        return quotation, room, item

    def payload(self, quotation, room, item):
        return {
            "expected_updated_at": quotation.updated_at.isoformat(),
            "notes": "Edited", "discount_type": "PERCENTAGE", "discount_value": 10,
            "gst_mode": "GST_EXTRA", "gst_percentage": 18,
            "rooms": [{"id": room.id, "property_room": self.room.id, "name": room.name, "length": 12}],
            "items": [{"id": item.id, "room_index": 0, "description": "Edited work", "calculation_method": "MANUAL", "quantity": 3, "rate": 20}],
        }

    def save(self, quotation, payload):
        return self.client.patch(f"/api/quotations/{quotation.id}/draft/", payload, format="json")

    def test_save_reopen_edit_save_preserves_ids_relationships_and_totals(self):
        quotation, room, item = self.draft()
        for attempt in range(2):
            response = self.save(quotation, self.payload(quotation, room, item))
            self.assertEqual(response.status_code, 200, getattr(response, "data", None))
            quotation.refresh_from_db()
            reopened = self.client.get(reverse("quotation-detail", kwargs={"pk": quotation.id})).data
            self.assertEqual(reopened["rooms"][0]["id"], room.id)
            self.assertEqual(reopened["items"][0]["id"], item.id)
            self.assertEqual(reopened["customer"], self.customer.id)
            self.assertEqual(reopened["property"], self.property.id)
            self.assertEqual(reopened["notes"], "Edited")
            self.assertEqual(str(quotation.grand_total), "63.72")

    def test_stale_save_is_rejected_without_overwriting(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        self.assertEqual(self.save(quotation, payload).status_code, 200)
        payload["notes"] = "Stale edit"
        self.assertEqual(self.save(quotation, payload).status_code, 409)
        quotation.refresh_from_db()
        self.assertEqual(quotation.notes, "Edited")

    def test_invalid_reference_leaves_old_rooms_lines_and_metadata(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        payload["rooms"] = []
        payload["items"][0]["room_index"] = 9
        response = self.save(quotation, payload)
        self.assertEqual(response.status_code, 400)
        quotation.refresh_from_db()
        room.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(quotation.notes, "Original")
        self.assertEqual(room.length, 10)
        self.assertEqual(item.description, "Saved work")

    def test_runtime_failure_rolls_back_every_write(self):
        quotation, room, item = self.draft()
        with patch("quotations.serializers.QuotationSerializer.calculate_totals", side_effect=RuntimeError("test failure")):
            with self.assertRaises(RuntimeError):
                self.save(quotation, self.payload(quotation, room, item))
        quotation.refresh_from_db()
        room.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(quotation.notes, "Original")
        self.assertEqual(room.length, 10)
        self.assertEqual(item.description, "Saved work")

    def test_submitted_versions_reject_edit_delete_and_room_sync(self):
        quotation, room, item = self.draft()
        for state in Quotation.Status.values:
            if state == "DRAFT":
                continue
            quotation.status = state
            quotation.save()
            detail = reverse("quotation-detail", kwargs={"pk": quotation.id})
            self.assertEqual(self.client.patch(detail, {"notes": "Bad"}, format="json").status_code, 400, state)
            self.assertEqual(self.client.delete(detail).status_code, 400, state)
            self.assertEqual(self.save(quotation, self.payload(quotation, room, item)).status_code, 400, state)
            sync = reverse("quotation-room-sync", kwargs={"quotation_id": quotation.id})
            self.assertEqual(self.client.post(sync, {"property_room_ids": []}, format="json").status_code, 400, state)
            quotation.refresh_from_db()
            self.assertEqual(quotation.notes, "Original")
            self.assertIsNone(quotation.deleted_at)

    def test_missing_token_and_status_changes_are_rejected(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        del payload["expected_updated_at"]
        self.assertEqual(self.save(quotation, payload).status_code, 400)
        payload = self.payload(quotation, room, item)
        payload["status"] = "SENT"
        self.assertEqual(self.save(quotation, payload).status_code, 400)

    def test_failed_destructive_replacement_restores_removed_rows(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        payload["rooms"] = []
        payload["items"] = [{"description": "Replacement", "calculation_method": "MANUAL", "quantity": 1, "rate": 50}]
        with patch("quotations.serializers.QuotationSerializer.calculate_totals", side_effect=RuntimeError("late failure")):
            with self.assertRaises(RuntimeError):
                self.save(quotation, payload)
        self.assertEqual(list(quotation.rooms.values_list("pk", flat=True)), [room.pk])
        self.assertEqual(list(quotation.items.values_list("pk", flat=True)), [item.pk])

    def test_foreign_line_and_room_ids_cannot_modify_another_draft(self):
        quotation, room, item = self.draft()
        other, other_room, other_item = self.draft()
        for field, foreign_id in (("rooms", other_room.id), ("items", other_item.id)):
            payload = self.payload(quotation, room, item)
            payload[field][0]["id"] = foreign_id
            self.assertEqual(self.save(quotation, payload).status_code, 400)
        other.refresh_from_db()
        self.assertEqual(other.notes, "Original")

    def test_owner_verified_and_connected_guards_are_preserved(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        self.client.force_authenticate(None)
        self.assertEqual(self.save(quotation, payload).status_code, 401)
        self.client.force_authenticate(self.contractor)
        self.contractor.is_verified = False
        self.contractor.verification_status = "PENDING"
        self.contractor.save()
        self.assertEqual(self.save(quotation, payload).status_code, 403)
        self.contractor.is_verified = True
        self.contractor.verification_status = "VERIFIED"
        self.contractor.save()
        self.connection.status = "DISCONNECTED"
        self.connection.save()
        self.assertEqual(self.save(quotation, payload).status_code, 400)

    def test_legacy_patch_failure_is_also_atomic(self):
        quotation, room, item = self.draft()
        payload = {"notes": "Should roll back", "items": [{"id": item.id + 1000, "calculation_method": "MANUAL", "quantity": 1, "rate": 20}]}
        response = self.client.patch(reverse("quotation-detail", kwargs={"pk": quotation.id}), payload, format="json")
        self.assertEqual(response.status_code, 400)
        quotation.refresh_from_db()
        self.assertEqual(quotation.notes, "Original")

    def test_retained_line_cannot_silently_cascade_with_a_removed_room(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        payload["rooms"] = []
        del payload["items"][0]["room_index"]
        response = self.save(quotation, payload)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(QuotationItem.objects.filter(pk=item.pk).exists())

    def test_other_contractor_cannot_edit_or_delete(self):
        quotation, room, item = self.draft()
        other = type(self.contractor).objects.create_user(mobile="9000000088", password="test", role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.client.force_authenticate(other)
        detail = reverse("quotation-detail", kwargs={"pk": quotation.pk})
        self.assertEqual(self.save(quotation, self.payload(quotation, room, item)).status_code, 404)
        self.assertEqual(self.client.patch(detail, {"notes": "Forbidden"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(detail).status_code, 404)

    def test_detail_permissions_follow_status_and_customer_connection(self):
        quotation, room, item = self.draft()
        detail = reverse("quotation-detail", kwargs={"pk": quotation.pk})
        response = self.client.get(detail)
        self.assertTrue(response.data["can_edit"])
        self.assertTrue(response.data["can_delete"])
        self.connection.status = "DISCONNECTED"
        self.connection.save()
        response = self.client.get(detail)
        self.assertFalse(response.data["can_edit"])
        self.assertTrue(response.data["can_delete"])
        quotation.status = "ACCEPTED"
        quotation.save()
        response = self.client.get(detail)
        self.assertFalse(response.data["can_edit"])
        self.assertFalse(response.data["can_delete"])

    def test_new_rooms_are_saved_with_lines_and_saved_room_ids_stay_stable(self):
        quotation, room, item = self.draft()
        payload = self.payload(quotation, room, item)
        payload["rooms"].append({"name": "New custom room", "length": 8})
        payload["items"].append({"room_index": 1, "description": "New work", "calculation_method": "MANUAL", "quantity": 2, "rate": 30})
        response = self.save(quotation, payload)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["rooms"][0]["id"], room.id)
        added_room = next(entry for entry in response.data["rooms"] if entry["name"] == "New custom room")
        self.assertEqual(response.data["items"][-1]["room"], added_room["id"])


class GroupedDraftRepairTests(APITestCase):
    setUp = grouped_fixtures.GroupedSpecificationTests.setUp
    item = grouped_fixtures.GroupedSpecificationTests.item
    split = grouped_fixtures.GroupedSpecificationTests.split

    def test_grouped_draft_roundtrip_restores_saved_version_specifications_and_metadata(self):
        self.client.force_authenticate(self.contractor)
        created = self.client.post(reverse("quotation-create"), {
            "customer": self.customer.pk, "property": self.property.pk,
            "measurement_record": self.measurement.pk, "quotation_type": "MEASUREMENT",
            "rooms": [{"property_room": self.room.pk, "name": self.room.name}],
            "items": self.split(), "notes": "Saved notes", "terms_conditions": "Saved terms",
            "discount_type": "PERCENTAGE", "discount_value": 10, "gst_mode": "GST_EXTRA", "gst_percentage": 18,
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        saved = created.data
        original_ids = [item["id"] for item in saved["items"]]
        specifications = [item["specification_details"] for item in saved["items"]]
        for attempt in range(2):
            response = self.client.patch(reverse("quotation-draft-save", kwargs={"pk": saved["id"]}), {
                "expected_updated_at": saved["updated_at"], "rooms": saved["rooms"],
                "items": saved["items"], "notes": saved["notes"], "terms_conditions": saved["terms_conditions"],
                "discount_value": saved["discount_value"], "gst_percentage": saved["gst_percentage"],
            }, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            saved = self.client.get(reverse("quotation-detail", kwargs={"pk": saved["id"]})).data
            self.assertEqual([item["id"] for item in saved["items"]], original_ids)
            self.assertEqual([item["specification_details"] for item in saved["items"]], specifications)
            self.assertEqual(saved["measurement_record"], self.measurement.pk)
            self.assertEqual(saved["notes"], "Saved notes")
            self.assertEqual(saved["terms_conditions"], "Saved terms")
            self.assertEqual(saved["grand_total"], "4991.40")
        self.assertEqual(sum(surface.net_area for surface in self.measurement.surfaces.all()), 470)
