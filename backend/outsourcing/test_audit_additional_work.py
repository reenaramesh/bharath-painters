"""Additional-work decisions validate money and preserve pending requests on errors."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse

from . import workflow
from .models import AdditionalWorkRequest, WorkOrderEvent
from .tests import OutsourcingTestBase


class AdditionalWorkDecisionAuditTests(OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.order = self.make_work_order(status='IN_PROGRESS')
        self.extra = AdditionalWorkRequest.objects.create(
            work_order=self.order, requested_by=self.receiving,
            description='Extra ceiling', estimated_amount=Decimal('125.50'))
        self.authenticate(self.main)

    def decide(self, **values):
        return self.client.post(reverse('work-order-additional-work-decision', args=[self.order.pk]),
                                {'request': self.extra.pk, 'decision': 'APPROVED', **values}, format='json')

    def test_invalid_amounts_leave_pending_request_and_events_unchanged(self):
        events = WorkOrderEvent.objects.count()
        for amount in ['invalid', 'NaN', 'Infinity', '-1', '0.001', '1000000000000']:
            with self.subTest(amount=amount):
                response = self.decide(approved_amount=amount)
                self.assertEqual(response.status_code, 400, response.data)
                self.extra.refresh_from_db()
                self.assertEqual(self.extra.status, 'PENDING')
                self.assertIsNone(self.extra.decided_at)
                self.assertEqual(WorkOrderEvent.objects.count(), events)

    def test_unknown_or_pending_decisions_cannot_hide_request(self):
        for decision in ['UNKNOWN', 'PENDING', '']:
            with self.subTest(decision=decision):
                response = self.decide(decision=decision)
                self.assertEqual(response.status_code, 400, response.data)
                self.extra.refresh_from_db()
                self.assertEqual(self.extra.status, 'PENDING')
                self.assertIsNone(self.extra.decided_at)

    def test_missing_amount_defaults_to_estimate(self):
        self.assertEqual(self.decide().status_code, 200)
        self.extra.refresh_from_db()
        self.assertEqual(self.extra.approved_amount, Decimal('125.50'))

    def test_zero_amount_is_valid_and_stale_second_decision_is_rejected(self):
        stale = AdditionalWorkRequest.objects.get(pk=self.extra.pk)
        self.assertEqual(self.decide(approved_amount='0.00').status_code, 200)
        with self.assertRaises(ValidationError):
            workflow.decide_additional_work(self.main, stale, 'DECLINED')
        self.extra.refresh_from_db()
        self.assertEqual(self.extra.status, 'APPROVED')
        self.assertEqual(self.extra.approved_amount, Decimal('0'))

    def test_receiver_cannot_decide_and_decline_remains_supported(self):
        self.authenticate(self.receiving)
        self.assertEqual(self.decide().status_code, 400)
        self.authenticate(self.main)
        self.assertEqual(self.decide(decision='DECLINED').status_code, 200)
        self.extra.refresh_from_db()
        self.assertEqual(self.extra.status, 'DECLINED')
