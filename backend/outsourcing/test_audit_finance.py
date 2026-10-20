"""Regression evidence for subcontract money/state races on disposable PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier
import time
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import close_old_connections, transaction
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient

from . import workflow
from .models import SubcontractInvoice, SubcontractInvoicePayment, SubcontractWorkOrder, WorkOrderCompletion, WorkOrderEvent
from .serializers import SubcontractInvoiceSerializer
from .tests import OutsourcingTestBase as _Fixture, make_contractor


class FinanceFixture:
    setUp = _Fixture.setUp
    authenticate = _Fixture.authenticate

    @transaction.atomic
    def make_work_order(self, **kwargs):
        return _Fixture.make_work_order(self, **kwargs)

    @transaction.atomic
    def invoice(self, **kwargs):
        order = self.make_work_order(status='COMPLETED')
        return SubcontractInvoice.objects.create(work_order=order, total=Decimal('100'), subtotal=Decimal('100'),
                                                issued_at=timezone.now(), status='ISSUED', **kwargs)

    def post_payment(self, invoice, user=None, **kwargs):
        self.authenticate(user or self.main)
        return self.client.post(reverse('work-order-payment', args=[invoice.work_order_id]),
                                {'invoice': invoice.pk, 'amount': '25.00', 'payment_mode': 'CASH', **kwargs}, format='json')


class SubcontractFinanceAuditTests(FinanceFixture, APITestCase):
    def test_identical_payment_key_replays_without_new_money(self):
        invoice = self.invoice()
        first = self.post_payment(invoice, idempotency_key='audit-retry')
        second = self.post_payment(invoice, idempotency_key='audit-retry')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertNotIn('idempotency_key', second.data['payments'][0])
        self.assertEqual(invoice.payments.count(), 1)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('25'))

    def test_changed_payment_key_payload_returns_conflict(self):
        invoice = self.invoice()
        self.post_payment(invoice, idempotency_key='audit-conflict')
        response = self.post_payment(invoice, amount='26.00', idempotency_key='audit-conflict')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_changed_payment_key_notes_or_date_returns_conflict(self):
        invoice = self.invoice()
        self.post_payment(invoice, idempotency_key='audit-metadata')
        response = self.post_payment(invoice, notes='different', idempotency_key='audit-metadata')
        self.assertEqual(response.status_code, 409, response.data)
        response = self.post_payment(invoice, received_date=str(timezone.localdate() - timedelta(days=1)), idempotency_key='audit-metadata')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_unchanged_key_without_date_replays_across_midnight(self):
        invoice = self.invoice()
        today = timezone.localdate()
        with patch('outsourcing.workflow.timezone.localdate', return_value=today - timedelta(days=1)):
            first = self.post_payment(invoice, idempotency_key='audit-midnight')
        self.assertEqual(first.status_code, 200, first.data)
        response = self.post_payment(invoice, idempotency_key='audit-midnight')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_payment_key_cannot_move_between_invoices(self):
        first, second = self.invoice(), self.invoice()
        self.post_payment(first, idempotency_key='audit-cross-invoice')
        response = self.post_payment(second, idempotency_key='audit-cross-invoice')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(second.payments.count(), 0)

    def test_different_actor_cannot_replay_main_payment(self):
        invoice = self.invoice()
        self.post_payment(invoice, idempotency_key='audit-actor')
        for user in [self.receiving, make_contractor('9000000991'), make_contractor('9000000992', role='ADMIN')]:
            with self.subTest(role=user.role, id=user.pk):
                response = self.post_payment(invoice, user=user, idempotency_key='audit-actor')
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_cross_actor_key_conflict_on_own_invoice_is_generic(self):
        invoice = self.invoice()
        self.post_payment(invoice, idempotency_key='audit-key-owned')
        other = make_contractor('9000000993')
        order = self.make_work_order(main_contractor=other, status='COMPLETED')
        own = SubcontractInvoice.objects.create(work_order=order, total=Decimal('100'))
        response = self.post_payment(own, user=other, idempotency_key='audit-key-owned')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(own.payments.count(), 0)
        self.assertNotIn(str(invoice.pk), str(response.data))

    def test_empty_key_remains_legacy_non_idempotent(self):
        invoice = self.invoice()
        self.assertEqual(self.post_payment(invoice).status_code, 200)
        self.assertEqual(self.post_payment(invoice, idempotency_key='').status_code, 200)
        self.assertEqual(invoice.payments.count(), 2)

    def test_request_key_is_not_silently_truncated(self):
        invoice = self.invoice()
        response = self.post_payment(invoice, idempotency_key='x' * 101)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(invoice.payments.count(), 0)

    def test_payment_date_is_preserved(self):
        invoice = self.invoice()
        yesterday = timezone.localdate() - timedelta(days=1)
        response = self.post_payment(invoice, received_date=str(yesterday))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(invoice.payments.get().received_date, yesterday)

    def test_future_payment_date_is_rejected(self):
        invoice = self.invoice()
        response = self.post_payment(invoice, received_date=str(timezone.localdate() + timedelta(days=1)))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(invoice.payments.count(), 0)

    def test_noncash_reference_remains_optional_for_existing_clients(self):
        invoice = self.invoice()
        response = self.post_payment(invoice, payment_mode='UPI')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_stale_invoice_cache_cannot_allow_overpayment(self):
        invoice = self.invoice()
        SubcontractInvoicePayment.objects.create(invoice=invoice, amount=Decimal('80'), payment_mode='CASH', recorded_by=self.main)
        response = self.post_payment(invoice)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(invoice.payments.count(), 1)

    def test_successful_payment_derives_cache_from_actual_ledger(self):
        invoice = self.invoice()
        SubcontractInvoicePayment.objects.create(invoice=invoice, amount=Decimal('10'), payment_mode='CASH', recorded_by=self.main)
        response = self.post_payment(invoice)
        self.assertEqual(response.status_code, 200, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('35'))
        self.assertEqual(invoice.balance, Decimal('65'))

    def test_service_invalid_amounts_become_validation_errors_without_writes(self):
        invoice = self.invoice()
        for value in ['NaN', 'Infinity', '-Infinity', '-1', '0']:
            with self.subTest(value=value):
                error = None
                try:
                    workflow.record_payment(self.main, invoice, Decimal(value), 'CASH')
                except Exception as exc:
                    error = exc
                self.assertIsInstance(error, ValidationError)
        self.assertEqual(invoice.payments.count(), 0)

    def test_invoice_create_permissions_and_repeated_requests(self):
        order = self.make_work_order(status='COMPLETED')
        payload = {'total': '100.00', 'subtotal': '100.00'}
        endpoint = reverse('work-order-invoice', args=[order.pk])
        for user in [self.receiving, make_contractor('9000000994'), make_contractor('9000000995', role='ADMIN')]:
            self.authenticate(user)
            response = self.client.post(endpoint, payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.authenticate(self.main)
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 201)
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 400)
        self.assertEqual(order.invoices.count(), 1)

    def test_invoice_money_cannot_be_negative_but_zero_is_compatible(self):
        self.authenticate(self.main)
        for field in ['subtotal', 'tax_amount', 'total']:
            with self.subTest(field=field):
                order = self.make_work_order(status='COMPLETED')
                payload = {'subtotal': '100.00', 'tax_amount': '0.00', 'total': '100.00', field: '-1.00'}
                response = self.client.post(reverse('work-order-invoice', args=[order.pk]), payload, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(order.invoices.count(), 0)
        order = self.make_work_order(status='COMPLETED')
        response = self.client.post(reverse('work-order-invoice', args=[order.pk]),
                                    {'subtotal': '0', 'tax_amount': '0', 'total': '0'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_legacy_transition_rejects_stale_second_acceptance(self):
        order = self.make_work_order(status='SENT', material_mode='')
        first = SubcontractWorkOrder.objects.get(pk=order.pk)
        stale = SubcontractWorkOrder.objects.get(pk=order.pk)
        workflow.transition(self.receiving, first, 'ACCEPTED')
        with self.assertRaises(ValidationError):
            workflow.transition(self.receiving, stale, 'ACCEPTED')
        self.assertEqual(WorkOrderEvent.objects.filter(work_order=order, to_status='ACCEPTED').count(), 1)

    def test_stale_correction_cannot_reopen_newly_completed_work(self):
        order = self.make_work_order(status='SUBMITTED_FOR_REVIEW', material_mode='')
        WorkOrderCompletion.objects.create(work_order=order, submitted_by=self.receiving, submission_number=1)
        stale = SubcontractWorkOrder.objects.get(pk=order.pk)
        workflow.transition(self.main, order, 'COMPLETED')
        with self.assertRaises(ValidationError):
            workflow.request_correction(self.main, stale, 'Outdated correction')
        order.refresh_from_db()
        self.assertEqual(order.status, 'COMPLETED')
        self.assertEqual(order.correction_requests.count(), 0)


class SubcontractFinanceConcurrencyTests(FinanceFixture, TransactionTestCase):
    def concurrent_requests(self, invoices, key, amounts=None):
        gate = Barrier(2)
        amounts = amounts or ['25.00', '25.00']

        def pay(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.main)
                gate.wait(timeout=10)
                invoice = invoices[index]
                return client.post(reverse('work-order-payment', args=[invoice.work_order_id]),
                                   {'invoice': invoice.pk, 'amount': amounts[index], 'payment_mode': 'CASH',
                                    'idempotency_key': key}, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(pay, range(2)))

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_same_key_retries_post_money_once(self):
        invoice = self.invoice()
        self.assertEqual(self.concurrent_requests([invoice, invoice], 'audit-concurrent-retry'), [200, 200])
        self.assertEqual(invoice.payments.count(), 1)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('25'))

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_changed_payload_same_key_conflicts(self):
        invoice = self.invoice()
        responses = self.concurrent_requests([invoice, invoice], 'audit-concurrent-conflict', ['25.00', '26.00'])
        self.assertEqual(sorted(responses), [200, 409])
        self.assertEqual(invoice.payments.count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_cross_invoice_key_conflict_is_handled_after_unique_race(self):
        invoices = [self.invoice(), self.invoice()]
        gate = Barrier(2)
        original_save = SubcontractInvoicePayment.save

        def synchronized_save(payment, *args, **kwargs):
            gate.wait(timeout=10)
            return original_save(payment, *args, **kwargs)

        with patch.object(SubcontractInvoicePayment, 'save', synchronized_save):
            responses = self.concurrent_requests(invoices, 'audit-global-concurrent-key')
        self.assertEqual(sorted(responses), [200, 409])
        self.assertEqual(SubcontractInvoicePayment.objects.filter(invoice__in=invoices).count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_payments_cannot_both_spend_same_balance(self):
        invoice = self.invoice()
        gate = Barrier(2)

        def pay():
            close_old_connections()
            try:
                stale = SubcontractInvoice.objects.get(pk=invoice.pk)
                gate.wait(timeout=10)
                try:
                    workflow.record_payment(self.main, stale, Decimal('80'), 'CASH')
                    return 'accepted'
                except ValidationError:
                    return 'rejected'
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: pay(), range(2)))
        self.assertEqual(sorted(results), ['accepted', 'rejected'])
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('80'))
        self.assertEqual(invoice.balance, Decimal('20'))
        self.assertEqual(invoice.payments.count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_invoice_creation_produces_only_one_invoice(self):
        order = self.make_work_order(status='COMPLETED')
        gate = Barrier(2)
        original_get = __import__('outsourcing.views', fromlist=['get_work_order_for']).get_work_order_for
        original_create = SubcontractInvoiceSerializer.create

        def synchronized_get(user, pk):
            found = original_get(user, pk)
            gate.wait(timeout=10)
            return found

        def slower_create(serializer, validated):
            # Widen only the existing check/insert window; both requests still
            # execute the real serializer, endpoint and database transaction.
            time.sleep(0.15)
            return original_create(serializer, validated)

        def create():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.main)
                return client.post(reverse('work-order-invoice', args=[order.pk]), {'total': '100.00', 'subtotal': '100.00'}, format='json').status_code
            finally:
                close_old_connections()

        with patch('outsourcing.views.get_work_order_for', synchronized_get), patch.object(SubcontractInvoiceSerializer, 'create', slower_create):
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _: create(), range(2)))
        self.assertEqual(sorted(responses), [201, 400])
        self.assertEqual(order.invoices.count(), 1)
