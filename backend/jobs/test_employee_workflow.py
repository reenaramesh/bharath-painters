from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam, ApplicatorAttendance, ApplicatorLedgerEntry, ApplicatorSalaryRevision


class EmployeeWorkflowTests(TestCase):
    def setUp(self):
        verified = {'is_verified': True, 'verification_status': 'VERIFIED'}
        self.contractor = BharathUser.objects.create_user(mobile='9000000521', role='CONTRACTOR', **verified)
        self.other = BharathUser.objects.create_user(mobile='9000000522', role='CONTRACTOR', **verified)
        self.painter = BharathUser.objects.create_user(mobile='9000000523', role='PAINTER', **verified)
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.contractor, painter=self.painter, employment_type='IN_HOUSE', joined_on=timezone.localdate()-timedelta(days=30), salary_basis='DAILY', salary_amount=500)
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)
        self.url = f'/api/jobs/in-house-applicators/{self.member.pk}/attendance/'
        self.today = timezone.localdate()
        self.yesterday = self.today-timedelta(days=1)

    def test_multiple_days_are_saved_once_and_unselected_days_remain(self):
        untouched = ApplicatorAttendance.objects.create(membership=self.member, date=self.today-timedelta(days=2), status='ABSENT', note='Keep')
        response = self.client.post(self.url, {'dates': [str(self.yesterday), str(self.today), str(self.today)], 'status': 'HALF_DAY', 'overtime_hours': '1.5', 'note': 'Selected days'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data['results']), 2)
        self.assertEqual(self.member.attendance_records.count(), 3)
        untouched.refresh_from_db()
        self.assertEqual(untouched.note, 'Keep')
        self.assertEqual(self.member.attendance_records.get(date=self.today).overtime_hours, Decimal('1.5'))

    def test_invalid_day_prevents_all_replacements(self):
        row = ApplicatorAttendance.objects.create(membership=self.member, date=self.yesterday, status='ABSENT', note='Saved')
        response = self.client.post(self.url, {'dates': [str(self.yesterday), str(self.today+timedelta(days=1))], 'status': 'PRESENT'}, format='json')
        self.assertEqual(response.status_code, 400)
        row.refresh_from_db()
        self.assertEqual((row.status, row.note), ('ABSENT', 'Saved'))
        self.assertEqual(self.member.attendance_records.count(), 1)

    def test_failure_rolls_back_existing_and_new_days(self):
        row = ApplicatorAttendance.objects.create(membership=self.member, date=self.yesterday, status='ABSENT', note='Saved')
        update = ApplicatorAttendance.objects.update_or_create
        calls = []
        def fail_second(*args, **kwargs):
            calls.append(kwargs)
            if len(calls) == 2:
                raise RuntimeError('Simulated write failure')
            return update(*args, **kwargs)
        with patch('jobs.views.ApplicatorAttendance.objects.update_or_create', side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, {'dates': [str(self.yesterday), str(self.today)], 'status': 'PRESENT'}, format='json')
        row.refresh_from_db()
        self.assertEqual((row.status, row.note), ('ABSENT', 'Saved'))
        self.assertFalse(self.member.attendance_records.filter(date=self.today).exists())

    def test_batch_permissions_and_single_day_compatibility(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, {'dates': [str(self.today)], 'status': 'PRESENT'}, format='json').status_code, 404)
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.client.post(self.url, {'dates': [str(self.today)], 'status': 'PRESENT'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(self.url, {'date': str(self.yesterday), 'status': 'PRESENT'}, format='json').status_code, 403)
        self.client.force_authenticate(self.contractor)
        response = self.client.post(self.url, {'date': str(self.today), 'status': 'PRESENT'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('id', response.data)
        self.assertNotIn('results', response.data)

    def test_invalid_selection_and_nonfinite_overtime_are_validation_errors(self):
        for dates, hours in [([], '0'), (['invalid'], '0'), ([str(self.today)], 'NaN'), ([str(self.today)], 'Infinity')]:
            with self.subTest(dates=dates, hours=hours):
                self.assertEqual(self.client.post(self.url, {'dates': dates, 'status': 'PRESENT', 'overtime_hours': hours}, format='json').status_code, 400)
        self.assertEqual(self.member.attendance_records.count(), 0)

    def test_removal_preserves_employee_account_attendance_and_wages(self):
        ApplicatorAttendance.objects.create(membership=self.member, date=self.today, status='PRESENT')
        ApplicatorLedgerEntry.objects.create(membership=self.member, date=self.today, entry_type='PAYMENT', amount=500)
        response = self.client.patch(f'/api/jobs/in-house-applicators/{self.member.pk}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.member.refresh_from_db()
        self.assertFalse(self.member.is_active)
        self.assertEqual(self.member.attendance_records.count(), 1)
        self.assertEqual(self.member.ledger_entries.get().amount, Decimal('500'))
        self.painter.refresh_from_db()
        self.assertTrue(self.painter.is_active)
        self.assertEqual(self.client.post(self.url, {'date': str(self.today), 'status': 'PRESENT'}, format='json').status_code, 404)

    def test_employee_directory_includes_attendance_totals_filtered_by_month_and_date(self):
        ApplicatorAttendance.objects.create(membership=self.member, date=self.today-timedelta(days=2), status='PRESENT', overtime_hours=Decimal('1.5'))
        ApplicatorAttendance.objects.create(membership=self.member, date=self.today-timedelta(days=1), status='HALF_DAY', overtime_hours=Decimal('0.5'))
        ApplicatorAttendance.objects.create(membership=self.member, date=self.today, status='ABSENT')
        url = '/api/jobs/in-house-applicators/'

        month_response = self.client.get(url, {'month': self.today.strftime('%Y-%m')})
        self.assertEqual(month_response.status_code, 200)
        self.assertEqual(month_response.data[0]['attendance_metrics'], {
            'present_days': 1,
            'overtime_hours': Decimal('2.00'),
            'absents': 1,
            'total_present_days': Decimal('1.5'),
        })

        date_response = self.client.get(url, {'month': self.today.strftime('%Y-%m'), 'date': str(self.today)})
        self.assertEqual(date_response.status_code, 200)
        self.assertEqual(date_response.data[0]['attendance_metrics'], {
            'present_days': 0,
            'overtime_hours': Decimal('0'),
            'absents': 1,
            'total_present_days': Decimal('0'),
        })

    def test_payroll_rows_use_approved_days_and_dated_rates_without_bonus(self):
        first_day = self.today.replace(day=1)
        second_day = first_day + timedelta(days=1)
        third_day = first_day + timedelta(days=2)
        fourth_day = first_day + timedelta(days=3)
        self.member.salary_amount = Decimal('600.00')
        self.member.save(update_fields=('salary_amount',))
        ApplicatorSalaryRevision.objects.create(
            membership=self.member, previous_salary_basis='DAILY', previous_salary_amount=Decimal('500.00'),
            salary_basis='DAILY', salary_amount=Decimal('600.00'), effective_from=third_day,
            changed_by=self.contractor,
        )
        ApplicatorAttendance.objects.create(membership=self.member, date=first_day, status='PRESENT', approval_status='APPROVED')
        ApplicatorAttendance.objects.create(membership=self.member, date=second_day, status='LEAVE', approval_status='APPROVED')
        ApplicatorAttendance.objects.create(membership=self.member, date=third_day, status='HALF_DAY', approval_status='APPROVED')
        ApplicatorAttendance.objects.create(membership=self.member, date=fourth_day, status='PRESENT', approval_status='PENDING')
        ApplicatorLedgerEntry.objects.create(membership=self.member, date=third_day, entry_type='BONUS', amount=Decimal('200.00'))

        response = self.client.get('/api/jobs/in-house-applicators/', {
            'month': first_day.strftime('%Y-%m'), 'payroll': '1',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        summary = response.data[0]['payroll_summary']
        self.assertEqual(summary['earned_days'], Decimal('1.5'))
        self.assertIsNone(summary['day_wage'])
        self.assertTrue(summary['day_wage_varies'])
        self.assertEqual(summary['total'], Decimal('800.00'))
        self.assertEqual(summary['bonus_total'], Decimal('200.00'))
        self.assertEqual(summary['leave_days'], 1)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/jobs/in-house-applicators/', {
            'month': first_day.strftime('%Y-%m'), 'payroll': '1',
        }).data, [])

    def test_yearly_wage_summary_preserves_adjustment_sources_and_monthly_totals(self):
        from datetime import date

        january = date(2026, 1, 5)
        february = date(2026, 2, 6)
        attendance = ApplicatorAttendance.objects.create(
            membership=self.member, date=january, status='PRESENT',
            approval_status='APPROVED', overtime_hours=Decimal('2.00'),
        )
        ApplicatorAttendance.objects.create(
            membership=self.member, date=february, status='HALF_DAY',
            approval_status='APPROVED', overtime_hours=Decimal('1.00'),
        )
        for day, kind, value, source in [
            (january, 'EARNING', '500.00', None),
            (january, 'BONUS', '100.00', None),
            (january, 'ADVANCE', '200.00', None),
            (january, 'DEBIT_ADJUSTMENT', '75.00', attendance),
            (january, 'CREDIT_ADJUSTMENT', '25.00', None),
            (january, 'PAYMENT', '50.00', None),
            (february, 'EARNING', '250.00', None),
        ]:
            ApplicatorLedgerEntry.objects.create(
                membership=self.member, date=day, entry_type=kind,
                amount=Decimal(value), source_attendance_adjustment=source,
                reference='attendance correction' if source else '',
            )
        response = self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {
            'month': '2026-01', 'wage_year': '2026',
        })
        self.assertEqual(response.status_code, 200)
        year = response.data['wage_year_summary']
        self.assertEqual(len(year['months']), 12)
        january_summary, february_summary = year['months'][:2]
        self.assertEqual(january_summary['days_worked'], Decimal('1'))
        self.assertEqual(january_summary['overtime_hours'], Decimal('2.00'))
        self.assertEqual(january_summary['earning'], Decimal('600.00'))
        self.assertEqual(january_summary['advance_deduction'], Decimal('200.00'))
        self.assertEqual(january_summary['adjustments'], Decimal('50.00'))
        self.assertEqual(january_summary['total_earning'], Decimal('450.00'))
        self.assertTrue(any(row['source_attendance'] == attendance.pk for row in january_summary['adjustment_entries']))
        self.assertEqual(february_summary['total_earning'], Decimal('250.00'))
        self.assertEqual(year['totals']['total_earning'], Decimal('700.00'))
        self.assertEqual(len(response.data['ledger']), 6)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {'wage_year': '2026'}).status_code, 404)
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {'wage_year': '2026'}).status_code, 200)

    def test_yearly_overtime_is_recorded_once_and_included_in_total(self):
        day = self.today.replace(day=1)
        attendance = ApplicatorAttendance.objects.create(membership=self.member, date=day,
            status='PRESENT', approval_status='APPROVED', overtime_hours=Decimal('2'))
        ApplicatorLedgerEntry.objects.create(membership=self.member, date=day,
            entry_type='EARNING', amount=Decimal('500'))
        ApplicatorLedgerEntry.objects.create(membership=self.member, date=day,
            entry_type='OVERTIME', amount=Decimal('125'), source_attendance=attendance)
        response = self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {
            'month': day.strftime('%Y-%m'), 'wage_year': str(day.year),
        })
        self.assertEqual(response.status_code, 200)
        summary = response.data['wage_year_summary']['months'][day.month - 1]
        self.assertEqual(summary['overtime_pay'], Decimal('125'))
        self.assertEqual(summary['overtime_hours'], Decimal('2'))
        self.assertEqual(summary['total_earning'], Decimal('625'))

    def test_yearly_wages_include_ledger_rows_beyond_detail_limit(self):
        from datetime import date

        ApplicatorLedgerEntry.objects.bulk_create([
            ApplicatorLedgerEntry(
                membership=self.member, date=date(2026, 3, 1),
                entry_type='BONUS', amount=Decimal('1.00'),
            ) for _ in range(371)
        ])
        response = self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {
            'month': '2026-03', 'wage_year': '2026',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['ledger']), 370)
        self.assertEqual(response.data['wage_year_summary']['months'][2]['total_earning'], Decimal('371.00'))
        self.assertEqual(self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {
            'wage_year': 'wrong',
        }).status_code, 400)
