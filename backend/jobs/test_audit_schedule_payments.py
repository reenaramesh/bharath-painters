"""Schedule advances cannot erase receipts or overrun other project collections."""
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from quotations.models import ProjectReceipt
from .models import WorkSchedule
from .test_contractor_scheduling import ContractorSchedulingTests


class SchedulePaymentAuditTests(APITestCase):
    setUp = ContractorSchedulingTests.setUp

    def schedule(self, **changes):
        self.quote.grand_total = Decimal('100')
        self.quote.save(update_fields=['grand_total'])
        values = dict(quotation=self.quote, proposed_by=self.owner,
                      proposed_start_date=self.today, proposed_end_date=self.today,
                      status='CONFIRMED', contractor_accepted=True, customer_accepted=True)
        values.update(changes)
        return WorkSchedule.objects.create(**values)

    def pay(self, schedule, action, **changes):
        return self.client.post(reverse('work-schedule-payment', args=[schedule.pk]),
                                {'action': action, 'amount': '80', 'mode': 'CASH', **changes}, format='json')

    def receipt(self):
        return ProjectReceipt.objects.create(contractor=self.owner, quotation=self.quote,
            receipt_number='AUDIT-PR-60', amount='60', payment_mode='CASH')

    def test_request_cannot_erase_confirmed_or_submitted_payment(self):
        schedule = self.schedule(advance_amount='50', payment_status='CONFIRMED',
                                 payment_mode='UPI', payment_reference='original-reference',
                                 payment_confirmed_at=timezone.now())
        for state in ['CONFIRMED', 'PENDING_CONFIRMATION']:
            schedule.payment_status = state
            schedule.save(update_fields=['payment_status'])
            before = list(WorkSchedule.objects.filter(pk=schedule.pk).values())
            self.assertEqual(self.pay(schedule, 'REQUEST').status_code, 400)
            self.assertEqual(list(WorkSchedule.objects.filter(pk=schedule.pk).values()), before)

    def test_request_and_record_reject_invalid_money_without_mutation(self):
        schedule = self.schedule()
        for action in ['REQUEST', 'RECORD']:
            for amount in ['NaN', 'Infinity', '-1', '0', 'bad', '1.001', '1000000000000']:
                with self.subTest(action=action, amount=amount):
                    self.assertEqual(self.pay(schedule, action, amount=amount).status_code, 400)
                    schedule.refresh_from_db()
                    self.assertEqual(schedule.payment_status, 'NOT_REQUESTED')

    def test_request_and_record_respect_other_project_receipts(self):
        schedule = self.schedule()
        self.receipt()
        for action in ['REQUEST', 'RECORD']:
            self.assertEqual(self.pay(schedule, action).status_code, 400)
        self.assertEqual(self.pay(schedule, 'REQUEST', amount='40').status_code, 200)
        self.assertEqual(self.pay(schedule, 'RECORD', amount='40').status_code, 200)
        schedule.refresh_from_db()
        self.assertEqual(schedule.advance_amount, Decimal('40'))
        self.assertEqual(schedule.payment_status, 'CONFIRMED')

    def test_confirmation_rechecks_balance_after_receipt_added(self):
        schedule = self.schedule(advance_amount='80', payment_status='PENDING_CONFIRMATION')
        self.receipt()
        self.assertEqual(self.pay(schedule, 'CONFIRM').status_code, 400)
        schedule.refresh_from_db()
        self.assertEqual(schedule.payment_status, 'PENDING_CONFIRMATION')

    def test_unpaid_request_can_be_revised_without_new_receipt(self):
        schedule = self.schedule()
        self.assertEqual(self.pay(schedule, 'REQUEST', amount='30').status_code, 200)
        self.assertEqual(self.pay(schedule, 'REQUEST', amount='40').status_code, 200)
        schedule.refresh_from_db()
        self.assertEqual(schedule.advance_amount, Decimal('40'))
        self.assertEqual(schedule.payment_status, 'AWAITING_PAYMENT')
        self.assertFalse(ProjectReceipt.objects.exists())
