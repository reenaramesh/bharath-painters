from decimal import Decimal
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone
from accounts.models import BharathUser


class OvertimeMigrationTests(TransactionTestCase):
    def test_existing_ot_sources_snapshots_and_money_are_preserved(self):
        old = ('jobs', '0040_populate_hourly_rate')
        new = ('jobs', '0041_employee_overtime_rates_and_postings')
        executor = MigrationExecutor(connection)
        executor.migrate([old])
        try:
            apps = executor.loader.project_state([old]).apps
            Member = apps.get_model('jobs', 'ContractorApplicatorTeam')
            Attendance = apps.get_model('jobs', 'ApplicatorAttendance')
            Ledger = apps.get_model('jobs', 'ApplicatorLedgerEntry')
            owner = BharathUser.objects.create_user(mobile='9011907091', role='CONTRACTOR')
            worker = BharathUser.objects.create_user(mobile='9011907092', role='PAINTER')
            member = Member.objects.create(contractor_id=owner.pk, painter_id=worker.pk,
                employment_type='IN_HOUSE', salary_basis='DAILY', salary_amount='500', hourly_rate='100')
            attendance = Attendance.objects.create(membership=member, date=timezone.localdate(),
                status='PRESENT', approval_status='APPROVED', overtime_hours='3')
            original = Ledger.objects.create(membership=member, date=attendance.date, entry_type='OVERTIME',
                amount='400', source_attendance=attendance)
            correction = Ledger.objects.create(membership=member, date=attendance.date,
                entry_type='CREDIT_ADJUSTMENT', amount='100', source_attendance_adjustment=attendance,
                reference=f'attendance-ot-correction:{attendance.pk}:1')
            from datetime import timedelta
            zero = Attendance.objects.create(membership=member, date=attendance.date - timedelta(days=1),
                status='PRESENT', approval_status='APPROVED', overtime_hours='0')
            rejected = Attendance.objects.create(membership=member, date=attendance.date - timedelta(days=2),
                status='PRESENT', approval_status='REJECTED', overtime_hours='4')
            Ledger.objects.create(membership=member, date=rejected.date, entry_type='OVERTIME', amount='0', source_attendance=rejected)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate([new])
        apps = executor.loader.project_state([new]).apps
        Ledger = apps.get_model('jobs', 'ApplicatorLedgerEntry')
        Attendance = apps.get_model('jobs', 'ApplicatorAttendance')
        posted = Ledger.objects.get(pk=original.pk)
        self.assertEqual(posted.amount, Decimal('400'))
        self.assertIsNone(posted.source_attendance_id)
        self.assertEqual(posted.source_overtime_attendance_id, attendance.pk)
        self.assertEqual(Ledger.objects.get(pk=correction.pk).attendance_component, 'OVERTIME')
        self.assertEqual(Attendance.objects.get(pk=attendance.pk).overtime_hourly_rate_snapshot, Decimal('100'))
        self.assertEqual(Attendance.objects.get(pk=zero.pk).overtime_hourly_rate_snapshot, Decimal('100'))
        self.assertEqual(Attendance.objects.get(pk=rejected.pk).overtime_hourly_rate_snapshot, Decimal('100'))
        # The existing base earning can now use its original unique source.
        Ledger.objects.create(membership_id=member.pk, date=attendance.date, entry_type='EARNING',
            amount='500', source_attendance_id=attendance.pk)
        self.assertEqual(Ledger.objects.count(), 4)
