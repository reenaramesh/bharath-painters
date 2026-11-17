from datetime import timedelta
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections, connections
from django.test import skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient

from accounts.models import BharathUser
from quotations.models import ActivityLog, Customer, Property, PropertyContact, Quotation, QuotationItem
from .models import WorkSchedule


class ScheduleWorkItemTests(APITestCase):
    def setUp(self):
        self.owner = BharathUser.objects.create_user(mobile="9000842001", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000842002", role="CONTRACTOR")
        self.portal = BharathUser.objects.create_user(mobile="9000842003", role="CUSTOMER")
        self.worker = BharathUser.objects.create_user(mobile="9000842004", role="PAINTER")
        self.customer = Customer.objects.create(contractor=self.owner, portal_user=self.portal,
                                                name="Work client", mobile="9000842003")
        self.site = Property.objects.create(contractor=self.owner, customer=self.customer, name="Test site", address="Test address")
        self.quote = Quotation.objects.create(contractor=self.owner, customer=self.customer, property=self.site,
                                              quotation_number="STEPS-TEST", status="IN_PROGRESS")
        self.schedule = WorkSchedule.objects.create(quotation=self.quote, proposed_by=self.owner,
            proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=2),
            status="IN_PROGRESS", payment_status="CONFIRMED")
        self.item = QuotationItem.objects.create(quotation=self.quote, description="Living room walls", quantity=120, rate=25, coats=2)
        self.url = f"/api/jobs/work-schedules/{self.schedule.pk}/work-items/"
        self.client.force_authenticate(self.owner)

    def payload(self, **changes):
        current = self.client.get(self.url).data["items"][0]
        return {"version": current["version"], "scope_token": current["scope_token"],
                "steps": [{"id": str(uuid4()), "label": "Primer", "status": "IN_PROGRESS"},
                          {"id": str(uuid4()), "label": "First coat", "status": "NOT_STARTED"}],
                "note": "Contractor private note", **changes}

    def test_surface_display_is_additive_and_does_not_change_existing_scope_tokens(self):
        self.item.specification_details = {'surfaces': ['WALL', 'CEILING']}
        self.item.save()
        before = self.payload()
        line = self.client.get(self.url).data['items'][0]
        self.assertEqual(line['surfaces'], ['WALL', 'CEILING'])
        self.assertEqual(line['scope_token'], before['scope_token'])
        self.assertEqual(self.save_line(before).status_code, 200)

    def save_line(self, data):
        return self.client.patch(f"{self.url}{self.item.pk}/", data, format="json")

    def test_header_resolves_grouped_rooms_and_custom_names_without_changing_save_scope(self):
        before = self.payload()
        # Legacy snapshots may be blank even though the quotation has saved names.
        QuotationItem.objects.filter(pk=self.item.pk).update(
            custom_service_type="Interior painting", custom_product_type="Emulsion",
            specification_details={"kind": "group", "surface": "WALL", "contributions": [
                {"room_name": "Living room", "quantity": 100},
                {"room_name": "Bedroom", "quantity": 20},
                {"room_name": "Living room", "quantity": 10},
                {"room_name": "Unused room", "quantity": 0},
            ]})
        line = self.client.get(self.url).data["items"][0]
        self.assertEqual(line["display_scope"]["room"], "Living room, Bedroom")
        self.assertEqual(line["display_scope"]["service"], "Interior painting")
        self.assertEqual(line["display_scope"]["product"], "Emulsion")
        self.assertEqual(line["scope_token"], before["scope_token"])
        saved = self.save_line(before)
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["display_scope"], line["display_scope"])

    def test_header_resolves_master_names_and_keeps_saved_snapshot_names(self):
        from quotations.models import ServiceType, PaintType, Unit
        service = ServiceType.objects.create(name="Wall painting")
        product = PaintType.objects.create(name="Interior emulsion")
        unit = Unit.objects.create(name="sq ft")
        QuotationItem.objects.filter(pk=self.item.pk).update(
            service_type=service, paint_type=product, unit=unit,
            specification_details={"room_name": "Main hall"})
        line = self.client.get(self.url).data["items"][0]
        self.assertEqual(line["display_scope"], {"room": "Main hall", "service": "Wall painting",
                                                "product": "Interior emulsion", "unit": "sq ft"})
        QuotationItem.objects.filter(pk=self.item.pk).update(
            service_name_snapshot="Saved service", product_type_name_snapshot="Saved product")
        line = self.client.get(self.url).data["items"][0]
        self.assertEqual(line["display_scope"]["service"], "Saved service")
        self.assertEqual(line["display_scope"]["product"], "Saved product")

    def test_header_ignores_incomplete_saved_room_details(self):
        for details in (["legacy"], {"kind": "group", "contributions": None},
                        {"kind": "group", "contributions": [None, {"room_name": "Hall", "quantity": None},
                            {"room_name": ["invalid"], "quantity": 10},
                            {"room_name": "Invalid quantity", "quantity": "unknown"}]}):
            with self.subTest(details=details):
                QuotationItem.objects.filter(pk=self.item.pk).update(specification_details=details)
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["items"][0]["display_scope"]["room"], "")
                saved = self.save_line(self.payload())
                self.assertEqual(saved.status_code, 200, saved.data)

    def test_read_is_lazy_and_save_keeps_separate_steps_without_changing_parent(self):
        loaded = self.client.get(self.url)
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.data["items"][0]["description"], "Living room walls")
        self.assertEqual(loaded.data["items"][0]["steps"], [])
        self.assertFalse(self.schedule.line_progress.exists())
        response = self.save_line(self.payload())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([s["status"] for s in response.data["steps"]], ["IN_PROGRESS", "NOT_STARTED"])
        self.schedule.refresh_from_db(); self.quote.refresh_from_db()
        self.assertEqual((self.schedule.status, self.quote.status), ("IN_PROGRESS", "IN_PROGRESS"))

    def test_customer_reads_progress_without_private_note_and_cannot_edit(self):
        self.assertEqual(self.save_line(self.payload()).status_code, 200)
        self.assertNotIn("Contractor private note", str(list(ActivityLog.objects.values("metadata"))))
        self.client.force_authenticate(self.portal)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("note", response.data["items"][0])
        self.assertFalse(response.data["items"][0]["can_edit"])
        self.assertNotIn("rate", response.data["items"][0])
        self.assertEqual(self.save_line({}).status_code, 403)

    def test_other_contractor_and_painter_are_denied(self):
        for user in (self.other, self.worker):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code, 404)
            self.assertIn(self.save_line({}).status_code, (403, 404))

    def test_schedule_only_customer_permission_does_not_grant_work_progress(self):
        PropertyContact.objects.filter(property=self.site, customer=self.customer).update(role="AUTHORIZED_CONTACT",
            is_primary=False, access_level="CUSTOM", custom_permissions=["view_property", "view_schedules"], status="ACTIVE")
        self.client.force_authenticate(self.portal)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_version_conflict_blocks_duplicate_and_stale_scope_saves(self):
        payload = self.payload()
        self.assertEqual(self.save_line(payload).status_code, 200)
        self.assertEqual(self.save_line(payload).status_code, 409)
        self.assertEqual(self.schedule.line_progress.count(), 1)
        payload = self.payload()
        self.item.description = "Revised work"; self.item.save()
        self.assertEqual(self.save_line(payload).status_code, 409)

    def test_bad_steps_and_cross_quotation_ids_are_rejected_without_writes(self):
        baseline = self.payload()
        for changes in ({"steps": "bad"}, {"note": "x" * 4001}, {"note": "bad\x00note"}, {"version": True},
                        {"steps": [{"id": str(uuid4()), "label": "", "status": "DONE"}]},
                        {"quotation": self.quote.pk}, {"steps": [baseline["steps"][0]] * 2}):
            response = self.save_line({**baseline, **changes})
            self.assertEqual(response.status_code, 400, response.data)
        other_quote = Quotation.objects.create(contractor=self.other, customer=self.customer,
            property=self.site, quotation_number="OTHER-STEPS")
        other_item = QuotationItem.objects.create(quotation=other_quote, description="Private scope", quantity=1, rate=1)
        self.assertEqual(self.client.patch(f"{self.url}{other_item.pk}/", baseline, format="json").status_code, 404)
        self.assertFalse(self.schedule.line_progress.exists())

    def test_schedule_rules_are_not_bypassed_and_locked_work_is_read_only(self):
        baseline = self.payload()
        WorkSchedule.objects.filter(pk=self.schedule.pk).update(status="CONFIRMED")
        self.assertEqual(self.save_line(baseline).status_code, 400)
        baseline["steps"] = [{**step, "status": "NOT_STARTED"} for step in baseline["steps"]]
        self.assertEqual(self.save_line(baseline).status_code, 200)
        for status in ("COMPLETED", "CANCELLED"):
            WorkSchedule.objects.filter(pk=self.schedule.pk).update(status=status)
            self.assertFalse(self.client.get(self.url).data["items"][0]["can_edit"])
            self.assertEqual(self.save_line(self.payload()).status_code, 400)

    def test_deleted_quotation_line_retains_read_only_snapshot_and_notes(self):
        self.assertEqual(self.save_line(self.payload()).status_code, 200)
        self.item.delete()
        row = self.client.get(self.url).data["items"][0]
        self.assertIsNone(row["item_id"])
        self.assertFalse(row["is_current"])
        self.assertFalse(row["can_edit"])
        self.assertEqual(row["description"], "Living room walls")
        self.assertEqual(row["note"], "Contractor private note")
        self.assertEqual(self.schedule.line_progress.count(), 1)


class ScheduleWorkItemConcurrencyTests(APITransactionTestCase):
    def setUp(self):
        ScheduleWorkItemTests.setUp(self)

    @skipUnlessDBFeature("has_select_for_update")
    def test_simultaneous_first_save_creates_one_tracker_and_preserves_winning_update(self):
        payload = ScheduleWorkItemTests.payload(self)
        barrier = Barrier(2)
        def perform(index):
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(self.owner)
                barrier.wait(timeout=15)
                return client.patch(f"{self.url}{self.item.pk}/", {**payload, "note": f"Editor {index}"}, format="json").status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(perform, index) for index in range(2)]
            self.assertEqual(sorted(future.result(timeout=30) for future in futures), [200, 409])
        self.assertEqual(self.schedule.line_progress.count(), 1)
        self.assertIn(self.schedule.line_progress.get().note, ("Editor 0", "Editor 1"))
