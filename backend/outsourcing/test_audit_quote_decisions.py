"""A stale quote decision cannot overwrite an already committed decision."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase

from . import workflow
from .models import SubcontractQuote, WorkOrderEvent
from .tests import OutsourcingTestBase


class QuoteDecisionAuditTests(APITestCase):
    setUp = OutsourcingTestBase.setUp
    make_work_order = OutsourcingTestBase.make_work_order

    def test_stale_rejection_cannot_override_accepted_quote_or_add_event(self):
        order = self.make_work_order(status='ACCEPTED')
        quote = SubcontractQuote.objects.create(work_order=order, created_by=self.receiving,
                                                status='SENT', total=Decimal('150'))
        stale = SubcontractQuote.objects.get(pk=quote.pk)
        workflow.decide_quote(self.main, quote, 'ACCEPTED')
        events = WorkOrderEvent.objects.count()
        with self.assertRaises(ValidationError):
            workflow.decide_quote(self.main, stale, 'REJECTED')
        quote.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(quote.status, 'ACCEPTED')
        self.assertEqual(order.agreed_amount, quote.total)
        self.assertEqual(WorkOrderEvent.objects.count(), events)

    def test_stale_acceptance_cannot_override_rejected_quote(self):
        order = self.make_work_order(status='ACCEPTED', agreed_amount=Decimal('30'))
        quote = SubcontractQuote.objects.create(work_order=order, created_by=self.receiving,
                                                status='SENT', total=Decimal('150'))
        stale = SubcontractQuote.objects.get(pk=quote.pk)
        workflow.decide_quote(self.main, quote, 'REJECTED')
        events = WorkOrderEvent.objects.count()
        with self.assertRaises(ValidationError):
            workflow.decide_quote(self.main, stale, 'ACCEPTED')
        quote.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(quote.status, 'REJECTED')
        self.assertEqual(order.agreed_amount, Decimal('30'))
        self.assertEqual(WorkOrderEvent.objects.count(), events)
