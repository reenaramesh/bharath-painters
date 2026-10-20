from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from jobs.models import ApplicatorAttendance, ApplicatorLedgerEntry, ContractorApplicatorTeam


class EmployeeProfileHistoryTests(TestCase):
    def setUp(self):
        verified = {"is_verified": True, "verification_status": BharathUser.VerificationStatus.VERIFIED}
        self.contractor = BharathUser.objects.create_user(mobile="9000000921", role="CONTRACTOR", **verified)
        self.other = BharathUser.objects.create_user(mobile="9000000922", role="CONTRACTOR", **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000000923", role="PAINTER", **verified)
        self.member = ContractorApplicatorTeam.objects.create(
            contractor=self.contractor, painter=self.painter,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            employee_code="BPE-2026-0923", job_title="Applicator",
            salary_basis=ContractorApplicatorTeam.SalaryBasis.MONTHLY,
            salary_amount=Decimal("25000.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)

    def test_salary_change_is_dated_audited_and_applies_only_from_effective_date(self):
        earlier = timezone.localdate() - timedelta(days=40)
        today = timezone.localdate()
        attendance = ApplicatorAttendance.objects.create(
            membership=self.member, date=earlier, status=ApplicatorAttendance.Status.PRESENT,
            approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED,
        )
        old_posting = ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=earlier, entry_type=ApplicatorLedgerEntry.EntryType.EARNING,
            amount=Decimal("961.54"), source_attendance=attendance,
        )
        response = self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {
            "salary_amount": "30000.00", "salary_basis": "MONTHLY", "effective_from": str(today),
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        history = self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/history/")
        self.assertEqual(history.status_code, 200, history.data)
        changes = history.data["salary_changes"]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["previous_salary_amount"], "25000.00")
        self.assertEqual(changes[0]["salary_amount"], "30000.00")
        self.assertEqual(str(changes[0]["effective_from"]), str(today))
        self.assertEqual(changes[0]["changed_by"], self.contractor.get_full_name() or self.contractor.mobile)
        new_attendance = ApplicatorAttendance.objects.create(
            membership=self.member, date=today, status=ApplicatorAttendance.Status.PRESENT,
            approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED,
        )
        self.assertEqual(self.client.post(f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/", {
            "date": str(today), "status": "PRESENT",
        }, format="json").status_code, 201)
        new_posting = ApplicatorLedgerEntry.objects.get(source_attendance=new_attendance)
        self.assertEqual(new_posting.amount, Decimal("1153.85"))
        self.client.force_authenticate(self.painter)
        earnings = self.client.get("/api/jobs/my-in-house-earnings/", {"membership_id": self.member.pk, "month": earlier.strftime("%Y-%m")})
        self.assertEqual(earnings.data["attendance_earning"], Decimal("961.54"))
        self.client.force_authenticate(self.contractor)
        old_posting.refresh_from_db()
        self.assertEqual(old_posting.amount, Decimal("961.54"))

    def test_custom_field_values_are_typed_required_and_contractor_scoped(self):
        created = self.client.post("/api/jobs/in-house-employee-fields/", {
            "label": "Uniform size", "field_type": "CHOICE", "options": ["S", "M", "L"],
            "required": True, "sort_order": 1,
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        field_id = created.data["id"]

        missing = self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {"job_title": "Senior", "custom_fields": {}}, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertIn(str(field_id), str(missing.data))

        invalid = self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {
            "custom_fields": {str(field_id): "XX"},
        }, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(self.member.custom_fields, {})

        saved = self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {
            "custom_fields": {str(field_id): "M"},
        }, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.custom_fields[str(field_id)], "M")
        history = self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/history/")
        self.assertIn("Uniform size", str(history.data["profile_changes"]))

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/jobs/in-house-employee-fields/").data, [])
        self.assertEqual(self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {"custom_fields": {str(field_id): "L"}}, format="json").status_code, 404)

    def test_archived_field_values_remain_and_employee_can_read_own_history(self):
        created = self.client.post("/api/jobs/in-house-employee-fields/", {"label": "Locker", "field_type": "TEXT"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        field_id = created.data["id"]
        self.assertEqual(self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {"custom_fields": {str(field_id): "A-14"}}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/jobs/in-house-employee-fields/{field_id}/", {"is_active": False}, format="json").status_code, 200)

        self.client.force_authenticate(self.painter)
        own_history = self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/history/")
        self.assertEqual(own_history.status_code, 200, own_history.data)
        self.assertIn("A-14", str(own_history.data))
        self.assertEqual(self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/history/").status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/history/").status_code, 404)

    def test_field_types_validate_and_unauthenticated_field_access_is_denied(self):
        typed_fields = []
        for field_type, extra in (
            ("NUMBER", {}), ("DATE", {}), ("BOOLEAN", {}),
        ):
            response = self.client.post("/api/jobs/in-house-employee-fields/", {
                "label": field_type.title(), "field_type": field_type, **extra,
            }, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            typed_fields.append(response.data["id"])
        for field_id, invalid_value in zip(typed_fields, ("not-a-number", "31-02-2026", "yes")):
            response = self.client.patch(f"/api/jobs/in-house-applicators/{self.member.pk}/", {
                "custom_fields": {str(field_id): invalid_value},
            }, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/jobs/in-house-employee-fields/").status_code, 401)
