from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from tempfile import TemporaryDirectory
from django.core.files.base import ContentFile
from urllib.parse import urlsplit
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from quotations.models import Customer, Lead, Property, Quotation
from .models import ContractorApplicatorTeam, WorkPhoto, WorkSchedule, WorkSchedulePainter


class CustomerPainterConnectionTests(APITestCase):
    def setUp(self):
        verified = dict(is_verified=True, verification_status="VERIFIED")
        self.a = BharathUser.objects.create_user(mobile="9000871001", role="CONTRACTOR", **verified)
        self.b = BharathUser.objects.create_user(mobile="9000871002", role="CONTRACTOR", **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000871003", role="PAINTER", **verified)
        self.declined = BharathUser.objects.create_user(mobile="9000871004", role="PAINTER", **verified)
        self.stranger = BharathUser.objects.create_user(mobile="9000871005", role="PAINTER", **verified)
        for owner, name in ((self.a, "A private customer"), (self.b, "B private customer")):
            self.client.force_authenticate(owner)
            saved = self.client.post(reverse("customer-list-create"), {"mobile": "9087654312", "name": name}, format="json")
            self.assertIn(saved.status_code, (200, 201), saved.data)
            self.customer_id = saved.data["id"]
        self.customer = Customer.objects.get(pk=self.customer_id)
        self.site = Property.objects.create(contractor=self.b, customer=self.customer, name="B private site", address="Private site address")
        self.lead = Lead.objects.create(contractor=self.b, customer=self.customer, title="Painting")
        self.quote = Quotation.objects.create(contractor=self.b, customer=self.customer, property=self.site,
            lead=self.lead, quotation_number="CONNECTION-REVIEW", status="IN_PROGRESS", grand_total=100, notes="Private work scope")
        self.schedule = WorkSchedule.objects.create(quotation=self.quote, proposed_by=self.b,
            proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=1),
            status="IN_PROGRESS", payment_status="CONFIRMED")
        self.assignment = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.painter,
            status="IN_PROGRESS", wage_type="DAILY", agreed_wage=500)
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.b, painter=self.painter, employment_type="IN_HOUSE")
        self.photo = WorkPhoto.objects.create(schedule=self.schedule, uploaded_by=self.b, image="work_photos/review.png")
        self.client.force_authenticate(self.b)

    def test_schedule_and_photo_names_use_issuing_contractors_contact(self):
        schedules = self.client.get(reverse("work-schedule-list"))
        self.assertEqual(schedules.data[0]["customer"], "B private customer")
        photos = self.client.get(reverse("work-photo-list-create"))
        self.assertEqual(photos.data["schedules"][0]["customer"], "B private customer")
        self.assertEqual(photos.data["results"][0]["customer"], "B private customer")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "A private customer")

    def test_painter_sees_correct_customer_without_financial_quote_data(self):
        self.client.force_authenticate(self.painter)
        row = self.client.get(reverse("painter-assignment-list")).data[0]
        self.assertEqual(row["customer_name"], "B private customer")
        self.assertTrue(row["can_view_project"])
        self.assertNotIn("grand_total", row)

    def test_painter_completion_ignores_declined_and_released_workers(self):
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.declined, status="DECLINED")
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.stranger, status="RELEASED")
        self.client.force_authenticate(self.painter)
        response = self.client.post(reverse("painter-assignment-progress", args=[self.assignment.pk]), {"action": "COMPLETE"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.schedule.refresh_from_db(); self.quote.refresh_from_db(); self.lead.refresh_from_db()
        self.assertEqual((self.schedule.status, self.quote.status, self.lead.stage), ("COMPLETED", "COMPLETED", "COMPLETED"))
        self.client.force_authenticate(self.b)
        lead = self.client.get(reverse("lead-detail", args=[self.lead.pk])).data
        self.assertFalse(lead["is_closed"])
        self.assertEqual(lead["payment_status"], "INVOICE_NOT_RAISED")

    def test_contractor_completion_ignores_declined_but_requires_real_participant(self):
        self.assignment.status = "COMPLETED"; self.assignment.save()
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.declined, status="DECLINED")
        response = self.client.post(reverse("work-schedule-progress", args=[self.schedule.pk]), {"action": "COMPLETE"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.stage, "COMPLETED")
        WorkSchedule.objects.filter(pk=self.schedule.pk).update(status="IN_PROGRESS")
        self.assignment.status = "RELEASED"; self.assignment.save()
        response = self.client.post(reverse("work-schedule-progress", args=[self.schedule.pk]), {"action": "COMPLETE"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_other_participant_still_in_progress_prevents_completion(self):
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.declined, status="IN_PROGRESS")
        self.client.force_authenticate(self.painter)
        self.client.post(reverse("painter-assignment-progress", args=[self.assignment.pk]), {"action": "COMPLETE"}, format="json")
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, "IN_PROGRESS")

    def test_declined_assignment_is_redacted_and_project_actions_are_denied(self):
        self.assignment.status = "DECLINED"; self.assignment.save()
        self.client.force_authenticate(self.painter)
        row = self.client.get(reverse("painter-assignment-list")).data[0]
        self.assertFalse(row.get("can_view_project", True))
        for key in ("customer_name", "customer_bharath_id", "property_name", "address", "city", "pincode", "quotation_notes"):
            self.assertEqual(row[key], "", key)
        self.assertEqual(row["work_scope"], [])
        self.assertEqual(Decimal(row["agreed_wage"]), Decimal("500"))
        photos = self.client.get(reverse("work-photo-list-create"), {"schedule": self.schedule.pk})
        self.assertEqual(photos.data["schedules"], [])
        self.assertEqual(photos.data["results"], [])
        for action in ("ON_THE_WAY", "START", "COMPLETE"):
            response = self.client.post(reverse("painter-assignment-progress", args=[self.assignment.pk]), {"action": action}, format="json")
            self.assertIn(response.status_code, (400, 403, 404))
        upload = self.client.post(reverse("work-photo-list-create"), {"schedule": self.schedule.pk}, format="json")
        self.assertEqual(upload.status_code, 404)

    def test_released_worker_history_remains_without_site_details(self):
        self.assignment.status = "RELEASED"; self.assignment.save()
        self.client.force_authenticate(self.painter)
        history = self.client.get(reverse("job-activity")).data["results"]
        row = next(item for item in history if item["id"] == f"assignment-{self.assignment.pk}")
        self.assertEqual(row["location"], "")
        self.assertFalse(row.get("can_view_project", True))
        self.assertEqual(row["status"], "RELEASED")
        self.assertEqual(self.client.get(reverse("work-photo-list-create")).data["results"], [])

    def test_restricted_worker_cannot_submit_attendance_for_the_project(self):
        self.assignment.status = "RELEASED"; self.assignment.save()
        self.client.force_authenticate(self.painter)
        for values in ({"assignment": self.assignment.pk}, {"schedule": self.schedule.pk}):
            response = self.client.post(reverse("in-house-attendance", args=[self.member.pk]),
                {"date": str(timezone.localdate()), "status": "PRESENT", **values}, format="json")
            self.assertIn(response.status_code, (400, 403, 404), response.data)
        self.assertFalse(self.member.attendance_records.exists())

    def test_employee_context_identifies_the_employer_for_assignment_check_in(self):
        self.client.force_authenticate(self.painter)
        data = self.client.get(reverse("my-in-house-employment")).data
        self.assertEqual(data.get("contractor_id"), self.b.pk)
        self.assertEqual(data["membership_id"], self.member.pk)

    def test_connected_contractor_count_is_personal_and_distinct(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(reverse("painter-dashboard")).data["counts"]["active_contractors"], 0)
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.client.get(reverse("painter-dashboard")).data["counts"]["active_contractors"], 1)
        self.assignment.status = "DECLINED"; self.assignment.save()
        self.assertEqual(self.client.get(reverse("painter-dashboard")).data["counts"]["active_contractors"], 0)

    def test_other_contractor_and_painter_cannot_read_or_change_project(self):
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.get(reverse("work-schedule-list")).data, [])
        self.assertEqual(self.client.get(reverse("work-photo-list-create")).data["results"], [])
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(reverse("painter-assignment-list")).data, [])
        self.assertEqual(self.client.post(reverse("painter-assignment-progress", args=[self.assignment.pk]), {"action": "COMPLETE"}, format="json").status_code, 404)

    def test_photo_delivery_rechecks_access_even_for_an_existing_link(self):
        with TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            self.photo.image.save("private.png", ContentFile(b"\x89PNG\r\n\x1a\nprivate-photo"))
            self.client.force_authenticate(self.painter)
            photo = self.client.get(reverse("work-photo-list-create")).data["results"][0]
            parsed = urlsplit(photo["image"])
            self.assertIn("/api/jobs/work-photos/", parsed.path)
            url = parsed.path + "?" + parsed.query
            self.client.force_authenticate(None)
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(b"".join(response.streaming_content), b"\x89PNG\r\n\x1a\nprivate-photo")
            self.assertIn("no-store", response["Cache-Control"])
            self.assignment.status = "RELEASED"; self.assignment.save()
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.client.get(self.photo.image.url).status_code, 404)

    def test_customer_portal_keeps_its_profile_name_and_shared_project_access(self):
        self.client.force_authenticate(self.customer.portal_user)
        row = self.client.get(reverse("work-schedule-list")).data[0]
        self.assertEqual(row["customer"], self.customer.name)
        self.assertEqual(len(self.client.get(reverse("work-photo-list-create")).data["results"]), 1)

    def test_legacy_media_aliases_cannot_bypass_private_photo_delivery(self):
        from types import ModuleType
        from django.urls import path
        from .photo_delivery import guarded_media
        module = ModuleType("private_photo_media_review")
        module.urlpatterns = [path("media/<path:path>", guarded_media)]
        with TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media, ROOT_URLCONF=module):
            self.photo.image.save("private.png", ContentFile(b"private-photo"))
            name = self.photo.image.name
            self.client.force_authenticate(None)
            for alias in (name, "./"+name, "alias/../"+name, name.replace("work_photos", "WORK_PHOTOS"), "alias\\..\\"+name):
                self.assertEqual(self.client.get("/media/"+alias).status_code, 404, alias)

    def test_calendar_and_earnings_do_not_expose_released_site(self):
        self.member.is_active = False; self.member.save()
        self.assignment.status = "RELEASED"; self.assignment.save()
        self.client.force_authenticate(self.painter)
        calendar = self.client.get(reverse("applicator-availability"))
        self.assertEqual(calendar.status_code, 200, calendar.data)
        self.assertFalse(any(row["source"] == "ASSIGNMENT" for row in calendar.data["schedule"]))
        earnings = self.client.get(reverse("my-in-house-earnings"))
        self.assertEqual(earnings.status_code, 200)
        record = earnings.data["attendance"][0]
        self.assertEqual(record["property"], "")
        self.assertFalse(record["can_view_project"])
        self.assertEqual(record["earning"], Decimal("1000.00"))

    def test_attendance_rechecks_revocation_at_write_time(self):
        from .project_access import assignment_can_view_project
        count = 0
        def revoke_after_first_check(assignment):
            nonlocal count
            count += 1
            if count == 1:
                WorkSchedulePainter.objects.filter(pk=assignment.pk).update(status="RELEASED")
                return True
            return assignment_can_view_project(assignment)
        self.client.force_authenticate(self.painter)
        with patch("jobs.views.assignment_can_view_project", side_effect=revoke_after_first_check):
            response = self.client.post(reverse("in-house-attendance", args=[self.member.pk]),
                {"date": str(timezone.localdate()), "status": "PRESENT", "assignment": self.assignment.pk}, format="json")
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        self.assertFalse(self.member.attendance_records.exists())

    def test_photo_mutations_recheck_revocation_at_write_time(self):
        from .views import work_photo_access
        self.client.force_authenticate(self.painter)
        for action in ("upload", "delete"):
            WorkSchedulePainter.objects.filter(pk=self.assignment.pk).update(status="IN_PROGRESS")
            count = 0
            def revoke_after_first_check(user, schedule):
                nonlocal count
                count += 1
                if count == 1:
                    WorkSchedulePainter.objects.filter(pk=self.assignment.pk).update(status="RELEASED")
                    return True
                return work_photo_access(user, schedule)
            with patch("jobs.views.work_photo_access", side_effect=revoke_after_first_check):
                response = self.client.post(reverse("work-photo-list-create"), {"schedule":self.schedule.pk}) if action == "upload" else self.client.delete(reverse("work-photo-detail", args=[self.photo.pk]))
            self.assertEqual(response.status_code, 404, (action, response.data))
        self.assertTrue(WorkPhoto.objects.filter(pk=self.photo.pk).exists())
