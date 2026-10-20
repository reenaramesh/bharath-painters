"""Attendance activation regressions; fixtures never touch business records."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier

from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from jobs.models import ApplicatorAttendance, ApplicatorAttendanceDecision, ApplicatorLedgerEntry
from jobs import test_attendance_earning_postings as attendance_fixtures


class AttendanceActivationSafetyTests(TestCase):
    setUp = attendance_fixtures.AttendanceEarningPostingTests.setUp

    def review(self, decision="APPROVED"):
        self.client.force_authenticate(self.contractor)
        return self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/",
            {"decision": decision}, format="json")

    def legacy(self, day=None, amount="500.00"):
        return ApplicatorLedgerEntry.objects.create(
            membership=self.member, date=day or self.day, entry_type="EARNING",
            amount=amount, note="Unlinked historical wage")

    def test_ambiguous_legacy_earning_blocks_approval_and_preserves_history(self):
        self.attendance.approval_status = "PENDING"
        self.attendance.save(update_fields=("approval_status",))
        original = self.legacy(amount="1800.00")
        response = self.review()
        self.assertEqual(response.status_code, 409, response.data)
        self.attendance.refresh_from_db(); original.refresh_from_db()
        self.assertEqual(self.attendance.approval_status, "PENDING")
        self.assertIsNone(original.source_attendance_id)
        self.assertEqual(original.amount, Decimal("1800.00"))
        self.assertEqual(ApplicatorLedgerEntry.objects.count(), 1)
        self.assertFalse(ApplicatorAttendanceDecision.objects.exists())

    def test_bulk_entry_rolls_back_every_day_when_one_day_has_legacy_overlap(self):
        self.legacy()
        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/",
            {"dates": [str(self.day - timedelta(days=1)), str(self.day)], "status": "HALF_DAY"}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.attendance.refresh_from_db()
        self.assertEqual(self.attendance.status, "PRESENT")
        self.assertEqual(ApplicatorAttendance.objects.count(), 1)
        self.assertEqual(ApplicatorLedgerEntry.objects.count(), 1)
        self.assertFalse(ApplicatorAttendanceDecision.objects.exists())

    def test_legacy_earning_on_another_day_does_not_block_posting(self):
        self.legacy(day=self.day - timedelta(days=1))
        self.assertEqual(self.review().status_code, 200)
        self.assertEqual(ApplicatorLedgerEntry.objects.count(), 2)

    def test_bonus_on_same_day_is_not_an_ambiguous_earning(self):
        ApplicatorLedgerEntry.objects.create(membership=self.member, date=self.day,
                                             entry_type="BONUS", amount="100.00")
        self.assertEqual(self.review().status_code, 200)
        self.assertEqual(ApplicatorLedgerEntry.objects.count(), 2)

    def test_current_expected_timestamp_allows_correction(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/",
            {"date": str(self.day), "status": "HALF_DAY",
             "expected_marked_at": self.attendance.marked_at.isoformat()}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.attendance.refresh_from_db()
        self.assertEqual(self.attendance.status, "HALF_DAY")

    def test_stale_and_malformed_timestamps_never_overwrite_attendance(self):
        self.client.force_authenticate(self.contractor)
        for version in [(self.attendance.marked_at - timedelta(seconds=1)).isoformat(),
                        "invalid", "2026-99-99T25:99:00Z"]:
            response = self.client.post(
                f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/",
                {"date": str(self.day), "status": "ABSENT", "expected_marked_at": version}, format="json")
            self.assertEqual(response.status_code, 409, response.data)
        self.attendance.refresh_from_db()
        self.assertEqual(self.attendance.status, "PRESENT")
        self.assertFalse(ApplicatorLedgerEntry.objects.exists())

    def test_daily_weekly_monthly_and_overtime_preserve_existing_policy(self):
        from jobs.views import attendance_earning_amount
        for basis, salary in [("DAILY", "500"), ("WEEKLY", "3000"), ("MONTHLY", "13000")]:
            self.member.salary_basis = basis; self.member.salary_amount = Decimal(salary)
            self.attendance.overtime_hours = Decimal("3")
            for state, expected in [("PRESENT", "500.00"), ("HALF_DAY", "250.00"),
                                    ("ABSENT", "0.00"), ("LEAVE", "0.00")]:
                self.attendance.status = state
                self.assertEqual(attendance_earning_amount(self.member, self.attendance), Decimal(expected))


class AttendancePostingConcurrencyTests(TransactionTestCase):
    setUp = attendance_fixtures.AttendanceEarningPostingTests.setUp

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_corrections_preserve_original_earning_and_reject_stale_writer(self):
        from jobs.attendance import sync_attendance_earning
        original, _, _, _ = sync_attendance_earning(self.member, self.attendance)
        expected = self.attendance.marked_at.isoformat()
        barrier = Barrier(2)

        def correct(state):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.contractor)
                barrier.wait(timeout=15)
                return client.post(
                    f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/",
                    {"date": str(self.day), "status": state, "expected_marked_at": expected},
                    format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(correct, ["HALF_DAY", "ABSENT"]))
        self.assertEqual(sorted(responses), [201, 409])
        self.attendance.refresh_from_db()
        original.refresh_from_db()
        self.assertEqual(original.amount, Decimal("500.00"))
        self.assertEqual(ApplicatorLedgerEntry.objects.filter(source_attendance=self.attendance).count(), 1)
        adjustment = ApplicatorLedgerEntry.objects.get(source_attendance_adjustment=self.attendance)
        self.assertEqual(adjustment.entry_type, "CREDIT_ADJUSTMENT")
        target = Decimal("250.00") if self.attendance.status == "HALF_DAY" else Decimal("0.00")
        self.assertEqual(original.amount - adjustment.amount, target)

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_approvals_create_exactly_one_earning_and_decision(self):
        self.attendance.approval_status = "PENDING"
        self.attendance.save(update_fields=("approval_status",))
        barrier = Barrier(2)

        def approve():
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(self.contractor)
                barrier.wait(timeout=15)
                return client.post(
                    f"/api/jobs/in-house-applicators/{self.member.pk}/attendance/{self.attendance.pk}/review/",
                    {"decision": "APPROVED"}, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(lambda _: approve(), range(2))), [200, 200])
        self.assertEqual(ApplicatorLedgerEntry.objects.filter(source_attendance=self.attendance).count(), 1)
        self.assertEqual(ApplicatorAttendanceDecision.objects.filter(attendance=self.attendance).count(), 1)
