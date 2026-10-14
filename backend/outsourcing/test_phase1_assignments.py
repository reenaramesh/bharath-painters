from django.urls import reverse
from django.utils import timezone

from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam
from .models import WorkOrderAssignment
from .tests import OutsourcingTestBase


class Phase1AssignmentTests(OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.employee.is_verified = True
        self.employee.verification_status = "VERIFIED"
        self.employee.save(update_fields=["is_verified", "verification_status"])
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.receiving, painter=self.employee, employment_type="IN_HOUSE")
        self.order = self.make_work_order(status="ACCEPTED")
        self.url = reverse("work-order-assignment", args=[self.order.pk])
        self.authenticate(self.receiving)

    def assign(self, employee=None):
        return self.client.post(self.url, {"employee": (employee or self.employee).pk}, format="json")

    def test_outsider_worker_cannot_be_assigned(self):
        outsider = BharathUser.objects.create_user(mobile="9000017201", role="PAINTER", is_verified=True, verification_status="VERIFIED")
        response = self.assign(outsider)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.order.assignments.exists())

    def test_other_contractors_member_cannot_be_assigned(self):
        self.member.contractor = self.main
        self.member.save(update_fields=["contractor"])
        self.assertEqual(self.assign().status_code, 400)

    def test_inactive_membership_cannot_be_assigned(self):
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        self.assertEqual(self.assign().status_code, 400)

    def test_inactive_and_unverified_accounts_cannot_be_assigned(self):
        for field, value in [("is_active", False), ("is_verified", False), ("verification_status", "PENDING")]:
            with self.subTest(field=field):
                self.employee.is_active = True
                self.employee.is_verified = True
                self.employee.verification_status = "VERIFIED"
                setattr(self.employee, field, value)
                self.employee.save(update_fields=["is_active", "is_verified", "verification_status"])
                self.assertEqual(self.assign().status_code, 400)
        self.assertFalse(self.order.assignments.exists())

    def test_active_inhouse_member_is_eligible(self):
        response = self.assign()
        self.assertEqual(response.status_code, 201, response.data)

    def test_active_flexible_member_is_eligible(self):
        self.member.employment_type = "FLEXIBLE"
        self.member.save(update_fields=["employment_type"])
        response = self.assign()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.order.assignments.get().employee, self.employee)

    def test_duplicate_live_assignment_is_rejected_without_reset(self):
        assignment = WorkOrderAssignment.objects.create(work_order=self.order, employee=self.employee, assigned_by=self.receiving, status="ACCEPTED", responded_at=timezone.now(), note="Saved")
        response = self.assign()
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual((assignment.status, assignment.note), ("ACCEPTED", "Saved"))
        self.assertIsNotNone(assignment.responded_at)
        self.assertEqual(self.order.assignments.count(), 1)

    def test_released_assignment_can_be_reproposed_on_same_record(self):
        assignment = WorkOrderAssignment.objects.create(work_order=self.order, employee=self.employee, assigned_by=self.receiving, status="RELEASED", released_at=timezone.now(), note="Retain history")
        response = self.assign()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], assignment.pk)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "PROPOSED")
        self.assertIsNone(assignment.released_at)
        self.assertEqual(assignment.note, "Retain history")

    def test_released_assignment_cannot_be_reproposed_after_membership_removal(self):
        assignment = WorkOrderAssignment.objects.create(work_order=self.order, employee=self.employee, status="RELEASED", released_at=timezone.now())
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        self.assertEqual(self.assign().status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "RELEASED")

    def test_wrong_actor_and_wrong_order_state_are_rejected(self):
        self.authenticate(self.main)
        self.assertEqual(self.assign().status_code, 400)
        self.authenticate(self.receiving)
        self.order.status = "COMPLETED"
        self.order.save(update_fields=["status"])
        self.assertEqual(self.assign().status_code, 400)
        self.assertFalse(self.order.assignments.exists())

    def test_assigned_employee_cannot_access_commercial_work_order(self):
        WorkOrderAssignment.objects.create(work_order=self.order, employee=self.employee, status="ACCEPTED")
        self.authenticate(self.employee)
        response = self.client.get(reverse("work-order-detail", args=[self.order.pk]))
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("quotation", response.data)
