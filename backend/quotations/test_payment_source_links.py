from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import BharathUser
from jobs.models import WorkSchedule
from quotations.models import Customer, Invoice, InvoicePayment, ProjectReceipt, Property, Quotation
from quotations.views import record_advance_payment, record_project_receipts


class InvoicePaymentSourceLinkTests(TestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9010710411", role="CONTRACTOR")
        self.customer = Customer.objects.create(name="Source Link Customer", mobile="9010710412")
        self.property = Property.objects.create(customer=self.customer, contractor=self.contractor, name="Source Link Site")
        self.quotation = Quotation.objects.create(
            customer=self.customer, contractor=self.contractor, property=self.property,
            quotation_number="SOURCE-LINK-Q1",
        )
        self.invoice = Invoice.objects.create(
            quotation=self.quotation, contractor=self.contractor, customer=self.customer,
            site_property=self.property, invoice_number="SOURCE-LINK-I1", grand_total=Decimal("100"),
        )

    def test_schedule_advance_allocation_keeps_a_source_link_and_retries_once(self):
        schedule = WorkSchedule.objects.create(
            quotation=self.quotation, proposed_by=self.contractor,
            proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate(),
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED, advance_amount=Decimal("20"),
            payment_mode="UPI", payment_reference="advance-ref",
        )

        self.assertTrue(record_advance_payment(self.invoice, schedule, self.contractor))
        self.assertFalse(record_advance_payment(self.invoice, schedule, self.contractor))

        payment = InvoicePayment.objects.get(invoice=self.invoice)
        self.assertEqual(payment.source_schedule_id, schedule.id)
        self.assertIsNone(payment.source_receipt_id)
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 1)

    def test_project_receipt_allocation_keeps_a_source_link_and_retries_once(self):
        receipt = ProjectReceipt.objects.create(
            contractor=self.contractor, quotation=self.quotation, receipt_number="SOURCE-PR-1",
            amount=Decimal("15"), payment_mode=ProjectReceipt.PaymentMode.CASH,
        )

        self.assertTrue(record_project_receipts(self.invoice, self.quotation))
        self.assertFalse(record_project_receipts(self.invoice, self.quotation))

        payment = InvoicePayment.objects.get(invoice=self.invoice)
        self.assertEqual(payment.source_receipt_id, receipt.id)
        self.assertIsNone(payment.source_schedule_id)
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 1)
