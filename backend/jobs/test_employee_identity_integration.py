from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser, PainterProfile
from jobs.models import ApplicatorAttendance, ApplicatorLedgerEntry, ContractorApplicatorTeam, WorkSchedule, WorkSchedulePainter
from quotations.models import Customer, Property, Quotation


class EmployeeIdentityIntegrationTests(TestCase):
    def setUp(self):
        verified = {"is_verified": True, "verification_status": BharathUser.VerificationStatus.VERIFIED}
        self.contractor = BharathUser.objects.create_user(mobile="9000000811", password="contractor-pass", role=BharathUser.Roles.CONTRACTOR, **verified)
        self.other_contractor = BharathUser.objects.create_user(mobile="9000000812", password="other-pass", role=BharathUser.Roles.CONTRACTOR, **verified)
        self.employee = BharathUser.objects.create_user(mobile="+919000000813", password="employee-pass", first_name="Existing", last_name="Painter", role=BharathUser.Roles.PAINTER, bharath_id="BP-P-000813", **verified)
        self.profile = PainterProfile.objects.create(user=self.employee, skills="Existing skills")
        self.member = ContractorApplicatorTeam.objects.create(
            contractor=self.other_contractor, painter=self.employee,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            employee_code="BPE-2026-0001", salary_basis=ContractorApplicatorTeam.SalaryBasis.DAILY,
            salary_amount=Decimal("700.00"),
        )
        self.attendance = ApplicatorAttendance.objects.create(
            membership=self.member, date=timezone.localdate() - timedelta(days=2),
            status=ApplicatorAttendance.Status.PRESENT,
            approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED,
        )
        self.earning = ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=self.attendance.date,
            entry_type=ApplicatorLedgerEntry.EntryType.EARNING, amount=Decimal("700.00"),
            source_attendance=self.attendance,
        )
        ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=self.attendance.date,
            entry_type=ApplicatorLedgerEntry.EntryType.BONUS, amount=Decimal("25.00"), note="Safety bonus",
        )
        ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=self.attendance.date,
            entry_type=ApplicatorLedgerEntry.EntryType.PAYMENT, amount=Decimal("100.00"), payment_mode="CASH",
        )
        ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=self.attendance.date,
            entry_type=ApplicatorLedgerEntry.EntryType.ADVANCE, amount=Decimal("50.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)

    def test_contractors_link_verified_account_without_replacing_identity_or_existing_history(self):
        response = self.client.post(reverse("contractor-create-applicator"), {
            "name": "A different submitted name", "mobile": "9000000813", "employment_type": "IN_HOUSE",
            "trade": "PAINTER", "job_title": "APPLICATOR", "salary_basis": "MONTHLY", "salary_amount": "24000",
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["linked_existing_account"])
        self.assertNotIn("credentials", response.data)
        self.assertNotIn("activation_url", response.data)
        self.assertEqual(response.data["member"]["id"], self.employee.id)
        linked = ContractorApplicatorTeam.objects.get(contractor=self.contractor, painter=self.employee)
        self.assertEqual(linked.employment_type, ContractorApplicatorTeam.EmploymentType.IN_HOUSE)
        self.assertEqual(linked.salary_amount, Decimal("24000"))
        self.assertEqual(ContractorApplicatorTeam.objects.filter(painter=self.employee).count(), 2)
        self.assertEqual(ApplicatorAttendance.objects.get(pk=self.attendance.pk).membership_id, self.member.pk)
        self.assertEqual(ApplicatorLedgerEntry.objects.get(pk=self.earning.pk).membership_id, self.member.pk)
        self.employee.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual((self.employee.first_name, self.employee.last_name), ("Existing", "Painter"))
        self.assertTrue(self.employee.check_password("employee-pass"))
        self.assertEqual(self.profile.skills, "Existing skills")

        with patch("jobs.views.enforce_employee_limit", side_effect=AssertionError("Duplicate employee linking must not consume a new slot.")):
            duplicate = self.client.post(reverse("contractor-create-applicator"), {
                "name": "Changed name", "mobile": "+91 90000 00813", "employment_type": "IN_HOUSE",
            }, format="json")
        self.assertEqual(duplicate.status_code, 200, duplicate.data)
        self.assertEqual(duplicate.data["member"]["membership_id"], linked.pk)
        self.assertEqual(ContractorApplicatorTeam.objects.filter(contractor=self.contractor, painter=self.employee).count(), 1)
        self.assertEqual(ContractorApplicatorTeam.objects.get(pk=linked.pk).salary_amount, Decimal("24000"))
        self.assertEqual(linked.attendance_records.count(), 0)

    def test_employee_can_select_only_own_employer_membership_and_read_its_history(self):
        self.client.force_authenticate(self.employee)
        selected = self.client.get(reverse("my-in-house-employment"), {"membership_id": self.member.pk})
        self.assertEqual(selected.status_code, 200, selected.data)
        self.assertEqual(selected.data["membership_id"], self.member.pk)
        self.assertEqual(selected.data["contractor_name"], self.other_contractor.get_full_name() or self.other_contractor.mobile)

        earnings = self.client.get(reverse("my-in-house-earnings"), {"membership_id": self.member.pk, "month": self.attendance.date.strftime("%Y-%m")})
        self.assertEqual(earnings.status_code, 200, earnings.data)
        self.assertEqual(earnings.data["membership_id"], self.member.pk)
        self.assertEqual(earnings.data["attendance_earning"], Decimal("700.00"))
        self.assertEqual(earnings.data["recorded_earnings"], Decimal("725.00"))
        self.assertEqual(earnings.data["payments_total"], Decimal("100.00"))
        self.assertEqual(earnings.data["advances_total"], Decimal("50.00"))
        self.assertEqual(earnings.data["outstanding_balance"], Decimal("575.00"))
        self.assertTrue(any(row["entry_type"] == "PAYMENT" for row in earnings.data["ledger"]))

        denied = self.client.get(reverse("my-in-house-employment"), {"membership_id": 999999})
        self.assertEqual(denied.status_code, 404)
        denied_earnings = self.client.get(reverse("my-in-house-earnings"), {"membership_id": 999999, "month": self.attendance.date.strftime("%Y-%m")})
        self.assertEqual(denied_earnings.status_code, 404)
        stranger = BharathUser.objects.create_user(mobile="9000000817", password="stranger-pass", role=BharathUser.Roles.PAINTER)
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get(reverse("my-in-house-employment"), {"membership_id": self.member.pk}).status_code, 404)
        self.assertEqual(self.client.get(reverse("my-in-house-earnings"), {"membership_id": self.member.pk}).status_code, 404)

    def test_unverified_mobile_match_is_not_linked_or_modified(self):
        unverified = BharathUser.objects.create_user(mobile="+919000000814", password="private-pass", role=BharathUser.Roles.PAINTER)
        response = self.client.post(reverse("contractor-create-applicator"), {
            "name": "Other painter", "mobile": unverified.mobile, "employment_type": "IN_HOUSE",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ContractorApplicatorTeam.objects.filter(contractor=self.contractor).count(), 0)
        unverified.refresh_from_db()
        self.assertTrue(unverified.check_password("private-pass"))

    def test_self_attendance_cannot_be_posted_to_another_employer_membership(self):
        customer = Customer.objects.create(
            contractor=self.other_contractor, name="Work customer", mobile="9000000815",
            normalized_mobile="+919000000815",
        )
        prop = Property.objects.create(customer=customer, contractor=self.other_contractor, name="Assigned site")
        quotation = Quotation.objects.create(
            contractor=self.other_contractor, customer=customer, property=prop,
            quotation_number="EMPLOYEE-LINK-WORKFLOW-1", status=Quotation.Status.IN_PROGRESS,
        )
        today = timezone.localdate()
        schedule = WorkSchedule.objects.create(
            quotation=quotation, proposed_by=self.other_contractor,
            proposed_start_date=today, proposed_end_date=today,
            contractor_accepted=True, customer_accepted=True, status=WorkSchedule.Status.IN_PROGRESS,
        )
        WorkSchedulePainter.objects.create(schedule=schedule, painter=self.employee, status=WorkSchedulePainter.Status.IN_PROGRESS)
        linked = self.client.post(reverse("contractor-create-applicator"), {
            "name": "Existing Painter", "mobile": "9000000813", "employment_type": "IN_HOUSE",
        }, format="json")
        self.assertEqual(linked.status_code, 201, linked.data)
        contractor_membership_id = linked.data["member"]["membership_id"]
        self.client.force_authenticate(self.employee)

        response = self.client.post(
            reverse("in-house-attendance", args=(contractor_membership_id,)),
            {"date": str(today), "status": "PRESENT", "schedule": schedule.pk}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ApplicatorAttendance.objects.filter(membership_id=contractor_membership_id, date=today).count(), 0)

    def test_link_login_assignment_checkin_approval_and_payments_share_one_identity(self):
        linked = self.client.post(reverse("contractor-create-applicator"), {
            "name": "Submitted contact name", "mobile": "9000000813", "employment_type": "IN_HOUSE",
            "salary_basis": "DAILY", "salary_amount": "700",
        }, format="json")
        self.assertEqual(linked.status_code, 201, linked.data)
        member_id = linked.data["member"]["membership_id"]

        customer = Customer.objects.create(contractor=self.contractor, name="New site", mobile="9000000816")
        prop = Property.objects.create(customer=customer, contractor=self.contractor, name="Employee work site")
        quotation = Quotation.objects.create(
            contractor=self.contractor, customer=customer, property=prop,
            quotation_number="EMPLOYEE-LINK-WORKFLOW-2", status=Quotation.Status.SCHEDULED,
        )
        today = timezone.localdate()
        schedule = WorkSchedule.objects.create(
            quotation=quotation, proposed_by=self.contractor,
            proposed_start_date=today, proposed_end_date=today,
            contractor_accepted=True, customer_accepted=True,
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED,
            status=WorkSchedule.Status.CONFIRMED,
        )
        self.client.force_authenticate(self.contractor)
        assigned = self.client.put(reverse("work-schedule-painters", args=(schedule.pk,)), {"painters": [self.employee.pk]}, format="json")
        self.assertEqual(assigned.status_code, 200, assigned.data)
        assignment = WorkSchedulePainter.objects.get(schedule=schedule, painter=self.employee)

        self.client.force_authenticate(user=None)
        login = self.client.post("/api/accounts/login/", {"identifier": self.employee.mobile, "password": "employee-pass"}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data["user"]["id"], self.employee.pk)
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get(reverse("my-in-house-employment"), {"membership_id": member_id}).status_code, 200)
        accepted = self.client.post(reverse("painter-assignment-progress", args=(assignment.pk,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        started = self.client.post(reverse("painter-assignment-progress", args=(assignment.pk,)), {"action": "START"}, format="json")
        self.assertEqual(started.status_code, 200, started.data)
        check_in = self.client.post(reverse("in-house-attendance", args=(member_id,)), {
            "date": str(today), "status": "PRESENT", "schedule": schedule.pk,
        }, format="json")
        self.assertEqual(check_in.status_code, 201, check_in.data)
        self.assertEqual(check_in.data["approval_status"], ApplicatorAttendance.ApprovalStatus.PENDING)
        attendance = ApplicatorAttendance.objects.get(membership_id=member_id, date=today)
        self.assertFalse(ApplicatorLedgerEntry.objects.filter(source_attendance=attendance).exists())

        self.client.force_authenticate(self.contractor)
        review = self.client.post(reverse("in-house-attendance-review", args=(member_id, attendance.pk)), {"decision": "APPROVED"}, format="json")
        self.assertEqual(review.status_code, 200, review.data)
        for entry_type, amount in (("BONUS", "25"), ("PAYMENT", "100"), ("ADVANCE", "50")):
            response = self.client.post(reverse("in-house-ledger", args=(member_id,)), {
                "entry_type": entry_type, "amount": amount, "date": str(today),
            }, format="json")
            self.assertEqual(response.status_code, 201, response.data)

        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        earnings = self.client.get(reverse("my-in-house-earnings"), {"membership_id": member_id, "month": today.strftime("%Y-%m")})
        self.assertEqual(earnings.status_code, 200, earnings.data)
        self.assertEqual(earnings.data["attendance_earning"], Decimal("700.00"))
        self.assertEqual(earnings.data["payments_total"], Decimal("100.00"))
        self.assertEqual(earnings.data["advances_total"], Decimal("50.00"))
        self.assertEqual(earnings.data["outstanding_balance"], Decimal("575.00"))
        directory_detail = self.client.get(reverse("in-house-applicator-detail", args=(member_id,)))
        self.assertEqual(directory_detail.status_code, 200)
        self.assertTrue(any(row["entry_type"] == "PAYMENT" for row in directory_detail.data["ledger"]))
        self.assertEqual(ContractorApplicatorTeam.objects.filter(painter=self.employee).count(), 2)
