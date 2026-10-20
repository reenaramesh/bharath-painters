from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from .models import ApplicatorAttendance, ApplicatorLedgerEntry, ContractorApplicatorTeam


class EmployeeOvertimeTests(TestCase):
    def setUp(self):
        flags = {'is_verified': True, 'verification_status': 'VERIFIED'}
        self.owner = BharathUser.objects.create_user(mobile='9011907001', role='CONTRACTOR', **flags)
        self.other = BharathUser.objects.create_user(mobile='9011907002', role='CONTRACTOR', **flags)
        self.worker = BharathUser.objects.create_user(mobile='9011907003', role='PAINTER', **flags)
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=self.worker,
            employment_type='IN_HOUSE', salary_basis='DAILY', salary_amount='500', hourly_rate='100')
        self.today = timezone.localdate()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = f'/api/jobs/in-house-applicators/{self.member.pk}/overtime-settings/'

    def settings(self, wage='800', hours='8', **changes):
        payload = {'overtime_day_wage': wage, 'overtime_day_hours': hours, 'effective_from': str(self.today)}
        payload.update(changes)
        response = self.client.patch(self.url, payload, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', response.status_code))
        return response.data

    def attendance(self, hours='4', **changes):
        values = dict(membership=self.member, date=self.today, status='PRESENT',
                      approval_status='PENDING', overtime_hours=hours)
        values.update(changes)
        return ApplicatorAttendance.objects.create(**values)

    def review(self, row, decision='APPROVED'):
        response = self.client.post(f'/api/jobs/in-house-applicators/{row.membership_id}/attendance/{row.pk}/review/',
            {'decision': decision}, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', response.status_code))
        return response.data

    def ledger_total(self):
        return sum((row.amount if row.entry_type in ('EARNING', 'OVERTIME', 'BONUS', 'DEBIT_ADJUSTMENT')
                    else -row.amount if row.entry_type in ('PAYMENT', 'ADVANCE', 'CREDIT_ADJUSTMENT') else Decimal('0')
                    for row in self.member.ledger_entries.all()), Decimal('0'))

    def test_settings_save_and_preview_separate_employee_day_wage(self):
        data = self.settings()
        self.assertEqual(Decimal(data['overtime_hourly_rate']), Decimal('100'))
        self.assertEqual(data['overtime_rate_source'], 'DAY_WAGE')
        self.member.refresh_from_db()
        self.assertEqual(self.member.salary_amount, Decimal('500'))
        self.assertEqual(self.member.overtime_day_wage, Decimal('800'))
        self.assertEqual(len(data['overtime_rate_history']), 1)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_hourly_setting_is_used_directly_and_preserves_approved_rate(self):
        response = self.client.patch(self.url, {'overtime_rate_per_hour': '125.50', 'effective_from': str(self.today)}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['overtime_rate_per_hour']), Decimal('125.50'))
        self.assertEqual(Decimal(response.data['overtime_rate_history'][0]['hourly_rate']), Decimal('125.50'))
        row = self.attendance()
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('502'))
        response = self.client.patch(self.url, {'overtime_rate_per_hour': '200'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('502'))
        row.overtime_hours = Decimal('2')
        row.save(update_fields=['overtime_hours'])
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('251'))

    def test_hourly_setting_zero_clear_validation_and_legacy_equivalence(self):
        self.settings('1000.01')
        original = self.client.get(self.url).data
        self.assertEqual(Decimal(original['overtime_rate_per_hour']), Decimal('125.00125'))
        response = self.client.patch(self.url, {'overtime_rate_per_hour': original['overtime_rate_per_hour']}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.member.overtime_rate_revisions.count(), 1)
        for value in ('-1', 'NaN', 'Infinity', '99999999999999', '0.000001', True):
            self.assertEqual(self.client.patch(self.url, {'overtime_rate_per_hour': value}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(self.url, {'overtime_rate_per_hour': '100', 'overtime_day_wage': '800'}, format='json').status_code, 400)
        response = self.client.patch(self.url, {'overtime_rate_per_hour': '0'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['overtime_hourly_rate']), Decimal('0'))
        response = self.client.patch(self.url, {'overtime_rate_per_hour': None}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['overtime_rate_per_hour'])
        self.assertEqual(Decimal(response.data['overtime_hourly_rate']), Decimal('100'))

    def test_approved_overtime_posts_separately_and_retry_does_not_duplicate(self):
        row = self.attendance()
        first = self.review(row)
        self.assertEqual(first['earning_amount'], Decimal('500'))
        self.assertEqual(first['overtime_amount'], Decimal('400'))
        self.review(row)
        self.assertEqual(self.member.ledger_entries.filter(entry_type='EARNING').count(), 1)
        self.assertEqual(self.member.ledger_entries.filter(entry_type='OVERTIME').count(), 1)
        self.assertEqual(self.ledger_total(), Decimal('900'))

    def test_each_employee_can_have_different_overtime_rate(self):
        self.settings('800')
        worker = BharathUser.objects.create_user(mobile='9011907004', role='PAINTER')
        second = ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=worker,
            employment_type='IN_HOUSE', salary_basis='DAILY', salary_amount='500')
        original = self.url
        self.url = f'/api/jobs/in-house-applicators/{second.pk}/overtime-settings/'
        self.settings('1200')
        self.url = original
        self.assertEqual(self.review(self.attendance())['overtime_amount'], Decimal('400'))
        self.assertEqual(self.review(self.attendance(membership=second))['overtime_amount'], Decimal('600'))

    def test_rate_snapshot_and_independent_base_ot_corrections_and_rejection(self):
        self.settings()
        row = self.attendance()
        self.review(row)
        self.settings('1600')
        row.overtime_hours = Decimal('2')
        row.save(update_fields=['overtime_hours'])
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('200'))
        self.assertEqual(self.ledger_total(), Decimal('700'))
        before = self.member.ledger_entries.count()
        self.review(row)
        self.assertEqual(self.member.ledger_entries.count(), before)
        self.review(row, 'REJECTED')
        self.assertEqual(self.ledger_total(), Decimal('0'))
        self.assertEqual(self.member.ledger_entries.get(entry_type='OVERTIME').amount, Decimal('400'))
        self.review(row, 'APPROVED')
        self.assertEqual(self.ledger_total(), Decimal('700'))

    def test_effective_rate_history_preserves_earlier_dates(self):
        self.settings('1600')
        old = self.attendance(date=self.today - timedelta(days=1))
        self.assertEqual(self.review(old)['overtime_amount'], Decimal('400'))
        self.assertEqual(self.review(self.attendance())['overtime_amount'], Decimal('800'))

    def test_first_approval_with_zero_hours_preserves_rate_for_later_hours_correction(self):
        self.settings()
        row = self.attendance(hours='0')
        self.review(row)
        self.settings('1600')
        row.overtime_hours = Decimal('4')
        row.save(update_fields=['overtime_hours'])
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('400'))

    def test_clearing_day_wage_uses_legacy_fallback_and_retries_do_not_duplicate_history(self):
        self.settings('1600')
        self.settings('1600')
        self.assertEqual(self.member.overtime_rate_revisions.count(), 1)
        data = self.settings(None)
        self.assertEqual(Decimal(data['overtime_fallback_hourly_rate']), Decimal('100'))
        self.assertEqual(self.review(self.attendance())['overtime_amount'], Decimal('400'))

    def test_decimal_rounding_fixed_day_hours_and_explicit_zero(self):
        self.settings('1000.01', '8')
        self.assertEqual(self.review(self.attendance())['overtime_amount'], Decimal('500.01'))
        self.settings('800', '8')
        row = self.attendance(date=self.today + timedelta(days=1))
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('400'))
        self.settings('0', '8')
        row = self.attendance(date=self.today + timedelta(days=2))
        self.assertEqual(self.review(row)['overtime_amount'], Decimal('0'))

    def test_invalid_settings_do_not_write_history_or_change_employee(self):
        self.settings()
        for changes in ({'overtime_day_wage': '-1'}, {'overtime_day_wage': 'NaN'},
                {'overtime_day_wage': '100.001'}, {'overtime_day_hours': '0'},
                {'overtime_day_hours': '25'}, {'overtime_day_hours': '9'}, {'effective_from': 'wrong'},
                {'effective_from': str(self.today + timedelta(days=1))}):
            response = self.client.patch(self.url, changes, format='json')
            self.assertEqual(response.status_code, 400, changes)
        self.member.refresh_from_db()
        self.assertEqual(self.member.overtime_day_wage, Decimal('800'))
        self.assertEqual(self.member.overtime_rate_revisions.count(), 1)

    def test_settings_owner_permissions_and_inactive_employee(self):
        for actor, expected in ((self.other, 404), (self.worker, 403)):
            self.client.force_authenticate(actor)
            self.assertEqual(self.client.get(self.url).status_code, expected)
            self.assertEqual(self.client.patch(self.url, {'overtime_day_wage': '999'}, format='json').status_code, expected)
        self.client.force_authenticate(self.owner)
        self.member.is_active = False
        self.member.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.patch(self.url, {'overtime_day_wage': '999'}, format='json').status_code, 409)

    def test_non_object_unverified_and_old_effective_date_are_rejected(self):
        self.assertEqual(self.client.patch(self.url, [], format='json').status_code, 400)
        self.settings()
        self.assertEqual(self.client.patch(self.url, {'overtime_day_wage': '900',
            'effective_from': str(self.today - timedelta(days=1))}, format='json').status_code, 400)
        self.owner.is_verified = False
        self.assertEqual(self.client.patch(self.url, {'overtime_day_wage': '900'}, format='json').status_code, 403)
        self.assertEqual(self.member.overtime_rate_revisions.count(), 1)

    def test_monthly_yearly_and_balance_include_posted_overtime_once(self):
        self.settings()
        self.review(self.attendance())
        month = self.today.strftime('%Y-%m')
        response = self.client.get('/api/jobs/in-house-applicators/', {'month': month, 'payroll': '1'})
        self.assertEqual(response.status_code, 200)
        summary = response.data[0]['payroll_summary']
        self.assertEqual(summary['total'], Decimal('500'))
        self.assertEqual(summary['overtime_pay'], Decimal('400'))
        self.assertEqual(summary['gross_total'], Decimal('900'))
        response = self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {'month': month, 'wage_year': str(self.today.year)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['balance'], Decimal('900'))
        self.assertEqual(response.data['wage_year_summary']['totals']['total_earning'], Decimal('900'))

    def test_corrected_overtime_is_net_in_month_year_and_balance(self):
        self.settings()
        row = self.attendance()
        self.review(row)
        row.overtime_hours = Decimal('2')
        row.save(update_fields=['overtime_hours'])
        self.review(row)
        response = self.client.get(f'/api/jobs/in-house-applicators/{self.member.pk}/', {
            'month': self.today.strftime('%Y-%m'), 'wage_year': str(self.today.year)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['balance'], Decimal('700'))
        summary = response.data['wage_year_summary']['months'][self.today.month - 1]
        self.assertEqual(summary['overtime_pay'], Decimal('200'))
        self.assertEqual(summary['adjustments'], Decimal('0'))
        self.assertEqual(summary['total_earning'], Decimal('700'))
        self.client.force_authenticate(self.worker)
        response = self.client.get('/api/jobs/my-in-house-earnings/', {'membership_id': self.member.pk,
            'month': self.today.strftime('%Y-%m')})
        self.assertEqual(response.status_code, 200)
        original = next(entry for entry in response.data['ledger'] if entry['entry_type'] == 'OVERTIME')
        self.assertEqual(original['source_attendance'], row.pk)
        self.assertEqual(original['attendance_component'], 'OVERTIME')
        self.assertEqual(response.data['outstanding_balance'], Decimal('700'))
