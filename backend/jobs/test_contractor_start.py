"""Contractor start is independent of approval, payment and team readiness."""
from datetime import timedelta
from django.utils import timezone
from .test_schedule_work_items import ScheduleWorkItemTests
from .models import WorkSchedulePainter


class ContractorStartTests(ScheduleWorkItemTests):
    def start(self):
        return self.client.post(f"/api/jobs/work-schedules/{self.schedule.pk}/progress/", {"action": "START"}, format="json")

    def prepare(self, state="PENDING"):
        self.schedule.status = state
        self.schedule.payment_status = "NOT_REQUESTED"
        self.schedule.customer_accepted = False
        self.schedule.contractor_accepted = False
        self.schedule.proposed_start_date = timezone.localdate() + timedelta(days=2)
        self.schedule.proposed_end_date = timezone.localdate() + timedelta(days=3)
        self.schedule.save()
        self.quote.status = "REVISION_REQUESTED"
        self.quote.save()

    def test_start_without_approvals_payment_painters_or_scheduled_date(self):
        self.prepare()
        response = self.start()
        self.assertEqual(response.status_code, 200, response.data)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, "IN_PROGRESS")
        self.assertIsNotNone(self.schedule.work_started_at)
        self.assertEqual(self.schedule.payment_status, "NOT_REQUESTED")
        self.assertFalse(self.schedule.customer_accepted)
        self.assertFalse(self.schedule.contractor_accepted)
        self.assertEqual(self.save_line(self.payload()).status_code, 200)

    def test_start_does_not_accept_painter_assignment(self):
        self.prepare("CONFIRMED")
        assignment = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.worker, status="ASSIGNED")
        self.assertEqual(self.start().status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "ASSIGNED")

    def test_only_owner_can_start(self):
        self.prepare()
        for user in (self.other, self.portal, self.worker):
            self.client.force_authenticate(user)
            self.assertEqual(self.start().status_code, 404)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, "PENDING")

    def test_terminal_and_duplicate_start_rejected(self):
        for state in ("IN_PROGRESS", "COMPLETED", "CANCELLED"):
            self.prepare(state)
            self.assertEqual(self.start().status_code, 400)
