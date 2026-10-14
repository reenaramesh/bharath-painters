from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam, ApplicatorAttendance, ApplicatorLedgerEntry


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
