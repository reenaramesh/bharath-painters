from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from jobs.models import ApplicatorAttendance, ApplicatorAttendanceDecision, ApplicatorLedgerEntry, ContractorApplicatorTeam


class AttendanceEarningPostingTests(TestCase):
    def setUp(self):
        verified = {"is_verified": True, "verification_status": "VERIFIED"}
        self.contractor = BharathUser.objects.create_user(mobile="9000000611", role="CONTRACTOR", **verified)
        self.other = BharathUser.objects.create_user(mobile="9000000612", role="CONTRACTOR", **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000000613", role="PAINTER", **verified)
        self.member = ContractorApplicatorTeam.objects.create(
            contractor=self.contractor, painter=self.painter, employment_type="IN_HOUSE",
            salary_basis=ContractorApplicatorTeam.SalaryBasis.DAILY, salary_amount=Decimal("500"),
        )
        self.client = APIClient()
        self.day = timezone.localdate() - timedelta(days=1)
        self.attendance = ApplicatorAttendance.objects.create(membership=self.member, date=self.day, status="PRESENT")

    def test_only_authorized_contractor_approval_posts_idempotent_earning(self):
        url = f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/"
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, {"decision": "APPROVED"}, format="json").status_code, 404)
        self.client.force_authenticate(self.contractor)
        response = self.client.post(url, {"decision": "APPROVED"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["earning_amount"], Decimal("500.00"))
        self.client.post(url, {"decision": "APPROVED"}, format="json")
        self.assertEqual(ApplicatorLedgerEntry.objects.filter(source_attendance=self.attendance).count(), 1)
        self.assertEqual(ApplicatorLedgerEntry.objects.get(source_attendance=self.attendance).amount, Decimal("500.00"))

    def test_painter_submission_waits_for_contractor_review(self):
        today = timezone.localdate()
        self.client.force_authenticate(self.painter)
        response = self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/",
            {"date": str(today), "status": "PRESENT"}, format="json",
        )
        self.assertEqual(response.status_code, 400)  # A site assignment is required.
        self.assertFalse(ApplicatorLedgerEntry.objects.filter(source_attendance__date=today).exists())

    def test_rejection_keeps_source_posting_without_payable_amount(self):
        url = f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/"
        self.client.force_authenticate(self.contractor)
        self.client.post(url, {"decision": "APPROVED"}, format="json")
        response = self.client.post(url, {"decision": "REJECTED"}, format="json")
        self.assertEqual(response.data["earning_amount"], Decimal("0.00"))
        self.assertEqual(ApplicatorLedgerEntry.objects.filter(source_attendance=self.attendance).count(), 1)

    def test_attendance_corrections_append_source_linked_ledger_adjustments(self):
        review_url = f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/"
        attendance_url = f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/"
        self.attendance.approval_status = ApplicatorAttendance.ApprovalStatus.PENDING
        self.attendance.save(update_fields=("approval_status",))
        self.client.force_authenticate(self.contractor)
        self.client.post(review_url, {"decision": "APPROVED"}, format="json")
        base = ApplicatorLedgerEntry.objects.get(source_attendance=self.attendance)
        self.assertEqual(base.amount, Decimal("500.00"))

        self.client.post(attendance_url, {"date": str(self.day), "status": "HALF_DAY"}, format="json")
        self.client.post(attendance_url, {"date": str(self.day), "status": "HALF_DAY"}, format="json")
        corrections = ApplicatorLedgerEntry.objects.filter(source_attendance_adjustment=self.attendance)
        self.assertEqual(corrections.count(), 1)
        self.assertEqual(corrections.get().entry_type, ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT)
        self.assertEqual(corrections.get().amount, Decimal("250.00"))

        self.client.post(attendance_url, {"date": str(self.day), "status": "ABSENT"}, format="json")
        self.client.post(attendance_url, {"date": str(self.day), "status": "PRESENT"}, format="json")
        self.assertEqual(
            list(corrections.order_by("id").values_list("entry_type", "amount")),
            [
                (ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT, Decimal("250.00")),
                (ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT, Decimal("250.00")),
                (ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT, Decimal("500.00")),
            ],
        )
        self.assertEqual(base.amount, Decimal("500.00"))
        self.assertEqual(
            list(ApplicatorAttendanceDecision.objects.filter(attendance=self.attendance).values_list("decision", flat=True)),
            ["APPROVE", "CORRECT", "CORRECT", "CORRECT"],
        )

        detail = self.client.get(f"/api/jobs/in-house-applicators/{self.member.pk}/")
        self.assertEqual(detail.status_code, 200)
        attendance_row = next(row for row in detail.data["attendance"] if row["id"] == self.attendance.id)
        self.assertEqual([row["decision"] for row in attendance_row["decisions"]], ["APPROVE", "CORRECT", "CORRECT", "CORRECT"])
        adjustment_ids = {row.id for row in corrections}
        linked_ids = {row["id"] for row in detail.data["ledger"] if row["source_attendance"] == self.attendance.id}
        self.assertTrue(adjustment_ids.issubset(linked_ids))

    def test_manual_earning_writes_are_rejected_to_prevent_duplicate_accrual(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/ledger/",
            {"entry_type": "EARNING", "amount": "500", "date": str(self.day)}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ApplicatorLedgerEntry.objects.filter(membership=self.member).count(), 0)

    def test_ambiguous_legacy_earning_blocks_attendance_post_without_changing_either_record(self):
        legacy = ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=self.day,
            entry_type=ApplicatorLedgerEntry.EntryType.EARNING,
            amount=Decimal("1800.00"), note="Historical earning; source unknown",
        )
        self.client.force_authenticate(self.contractor)

        response = self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/",
            {"decision": "APPROVED"}, format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("accounting review is required", response.data["detail"].lower())
        legacy.refresh_from_db()
        self.attendance.refresh_from_db()
        self.assertEqual((legacy.amount, legacy.note), (Decimal("1800.00"), "Historical earning; source unknown"))
        self.assertEqual(self.attendance.approval_status, ApplicatorAttendance.ApprovalStatus.APPROVED)
        self.assertIsNone(self.attendance.reviewed_by_id)
        self.assertIsNone(self.attendance.reviewed_at)
        self.assertFalse(ApplicatorLedgerEntry.objects.filter(source_attendance=self.attendance).exists())
        self.assertFalse(ApplicatorAttendanceDecision.objects.filter(attendance=self.attendance).exists())
