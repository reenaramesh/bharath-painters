from django.urls import reverse
from django.utils import timezone

from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam

from .models import WorkOrderAssignment
from .tests import OutsourcingTestBase


class WorkOrderEmployeeResponseTests(OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.employee.is_verified = True
        self.employee.verification_status = BharathUser.VerificationStatus.VERIFIED
        self.employee.save(update_fields=("is_verified", "verification_status"))
        self.membership = ContractorApplicatorTeam.objects.create(
            contractor=self.receiving, painter=self.employee,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        )
        self.order = self.make_work_order(
            status="ACCEPTED", required_start_date=timezone.localdate(),
            required_end_date=timezone.localdate(),
        )
        self.client.force_authenticate(self.receiving)
        response = self.client.post(reverse("work-order-assignment", args=(self.order.pk,)), {"employee": self.employee.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assignment = WorkOrderAssignment.objects.get(work_order=self.order, employee=self.employee)

    def test_assigned_employee_can_accept_and_only_sees_a_safe_summary(self):
        self.client.force_authenticate(self.employee)
        response = self.client.get(reverse("work-order-my-assignments"))
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data[0]
        self.assertEqual(row["id"], self.assignment.pk)
        self.assertEqual(row["status"], "PROPOSED")
        self.assertNotIn("agreed_amount", row)
        self.assertNotIn("quotation", row)
        self.assertNotIn("wages", row)

        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.ACCEPTED)
        self.assertIsNotNone(self.assignment.responded_at)

    def test_assigned_employee_can_decline_and_cannot_respond_twice(self):
        self.client.force_authenticate(self.employee)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "REJECT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.DECLINED)
        first_response = self.assignment.responded_at
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.DECLINED)
        self.assertEqual(self.assignment.responded_at, first_response)

    def test_employee_can_start_and_complete_the_assigned_work(self):
        self.client.force_authenticate(self.employee)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "START"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.IN_PROGRESS)
        self.assertIsNotNone(self.assignment.work_started_at)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "IN_PROGRESS")

        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "COMPLETE"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.COMPLETED)
        self.assertIsNotNone(self.assignment.work_completed_at)

    def test_unassigned_worker_and_contractors_cannot_respond(self):
        other = BharathUser.objects.create_user(mobile="9000028201", role="PAINTER")
        self.client.force_authenticate(other)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 404)
        self.client.force_authenticate(self.receiving)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_inactive_membership_cannot_accept_and_terminal_order_is_not_assignable(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))
        self.client.force_authenticate(self.employee)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.PROPOSED)

    def test_cancellation_releases_active_employee_assignment_and_keeps_history(self):
        self.client.force_authenticate(self.main)
        response = self.client.post(
            reverse("work-order-transition", args=(self.order.pk,)),
            {"status": "CANCELLED", "note": "Project cancelled"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.RELEASED)
        self.assertIsNotNone(self.assignment.released_at)
        self.assertTrue(WorkOrderAssignment.objects.filter(pk=self.assignment.pk).exists())

    def test_one_pending_employee_blocks_work_start(self):
        second = BharathUser.objects.create_user(
            mobile="9000028202", role=BharathUser.Roles.PAINTER, is_active=True,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        ContractorApplicatorTeam.objects.create(
            contractor=self.receiving, painter=second,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        )
        self.client.force_authenticate(self.receiving)
        response = self.client.post(reverse("work-order-assignment", args=(self.order.pk,)), {"employee": second.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.client.force_authenticate(self.employee)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(reverse("work-order-assignment-response", args=(self.assignment.pk,)), {"action": "START"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, WorkOrderAssignment.Status.ACCEPTED)
