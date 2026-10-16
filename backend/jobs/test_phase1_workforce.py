from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import Customer, Property, Quotation
from .models import (
    ApplicatorAttendance, ApplicatorBooking, ApplicatorLedgerEntry, ContractorApplicatorTeam,
    WorkSchedule, WorkSchedulePainter,
)


class Phase1WorkforceTests(APITestCase):
    def setUp(self):
        verified = dict(is_verified=True, verification_status="VERIFIED")
        self.owner = BharathUser.objects.create_user(mobile="9000017101", role="CONTRACTOR", **verified)
        self.other = BharathUser.objects.create_user(mobile="9000017102", role="CONTRACTOR", **verified)
        self.worker = BharathUser.objects.create_user(mobile="9000017103", role="PAINTER", **verified)
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=self.worker, employment_type="IN_HOUSE")
        self.today = timezone.localdate()
        self.schedule = self.make_schedule(self.owner, "9000017111", "P1-A")
        self.other_schedule = self.make_schedule(self.other, "9000017112", "P1-B", offset=10)
        self.assignment = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.worker, painter_note="Retain response", responded_at=timezone.now())
        self.other_assignment = WorkSchedulePainter.objects.create(schedule=self.other_schedule, painter=self.worker)
        self.client.force_authenticate(self.owner)

    def make_schedule(self, contractor, mobile, number, offset=0):
        customer = Customer.objects.create(contractor=contractor, name="Private customer " + number, mobile=mobile)
        site = Property.objects.create(customer=customer, contractor=contractor, name="Private site " + number, property_type="2BHK")
        quote = Quotation.objects.create(contractor=contractor, customer=customer, property=site, quotation_number=number, quotation_date=self.today, status="SCHEDULED")
        return WorkSchedule.objects.create(quotation=quote, proposed_start_date=self.today + timedelta(days=offset), proposed_end_date=self.today + timedelta(days=offset + 1), proposed_by=contractor, status="CONFIRMED", customer_accepted=True, contractor_accepted=True)

    def assign(self, painters):
        return self.client.put(reverse("work-schedule-painters", args=[self.schedule.pk]), {"painters": painters}, format="json")

    def new_worker(self, active=True, member_active=True):
        worker = BharathUser.objects.create_user(mobile="9000017104", role="PAINTER", is_active=active, is_verified=True, verification_status="VERIFIED")
        ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=worker, employment_type="FLEXIBLE", is_active=member_active)
        return worker

    def test_employer_detail_excludes_other_contractor_assignments(self):
        response = self.client.get(reverse("in-house-applicator-detail", args=[self.member.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["assignments"]], [self.assignment.pk])
        self.assertNotIn("Private customer P1-B", str(response.data))

    def test_worker_retains_own_assignments_and_outsider_is_denied(self):
        self.client.force_authenticate(self.worker)
        response = self.client.get(reverse("in-house-applicator-detail", args=[self.member.pk]))
        self.assertEqual({row["id"] for row in response.data["assignments"]}, {self.assignment.pk, self.other_assignment.pk})
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("in-house-applicator-detail", args=[self.member.pk])).status_code, 404)

    def test_legacy_team_delete_deactivates_and_preserves_history(self):
        attendance = ApplicatorAttendance.objects.create(membership=self.member, date=self.today, status="PRESENT")
        ledger = ApplicatorLedgerEntry.objects.create(membership=self.member, date=self.today, entry_type="PAYMENT", amount=Decimal("500"))
        response = self.client.delete(reverse("contractor-applicator-team-detail", args=[self.member.pk]))
        self.assertEqual(response.status_code, 204)
        self.assertTrue(ContractorApplicatorTeam.objects.filter(pk=self.member.pk).exists())
        self.member.refresh_from_db()
        self.assertFalse(self.member.is_active)
        self.assertTrue(ApplicatorAttendance.objects.filter(pk=attendance.pk).exists())
        self.assertTrue(ApplicatorLedgerEntry.objects.filter(pk=ledger.pk).exists())
        self.assertTrue(WorkSchedulePainter.objects.filter(pk=self.assignment.pk).exists())
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.is_active)
        self.assertEqual(self.client.delete(reverse("contractor-applicator-team-detail", args=[self.member.pk])).status_code, 204)

    def test_new_assignment_requires_active_membership(self):
        worker = self.new_worker(member_active=False)
        self.assertEqual(self.assign([self.worker.pk, worker.pk]).status_code, 400)
        self.assertFalse(WorkSchedulePainter.objects.filter(schedule=self.schedule, painter=worker).exists())

    def test_new_assignment_requires_active_account(self):
        worker = self.new_worker(active=False)
        self.assertEqual(self.assign([self.worker.pk, worker.pk]).status_code, 400)

    def test_active_flexible_member_can_be_assigned(self):
        worker = self.new_worker()
        response = self.assign([self.worker.pk, worker.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(WorkSchedulePainter.objects.filter(schedule=self.schedule, painter=worker).exists())

    def test_confirmed_booking_remains_an_eligible_relationship(self):
        worker = self.new_worker(member_active=False)
        ApplicatorBooking.objects.create(contractor=self.owner, applicator=worker, status="CONFIRMED", start_date=self.today, end_date=self.today + timedelta(days=1), work_type="Painting", pincode="560001")
        response = self.assign([self.worker.pk, worker.pk])
        self.assertEqual(response.status_code, 200, response.data)

    def test_outsider_cannot_assign_to_another_contractors_schedule(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.assign([self.worker.pk]).status_code, 400)

    def test_existing_assignment_is_retained_after_membership_deactivation(self):
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        response = self.assign([self.worker.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(WorkSchedulePainter.objects.filter(schedule=self.schedule, painter=self.worker).exists())
