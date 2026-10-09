from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock,patch
from django.test import SimpleTestCase
from django.utils import timezone
from quotations.views import InvoiceDetailView

class InvoiceContentSaveTests(SimpleTestCase):
    def invoice(self):
        return SimpleNamespace(id=17,created_at=timezone.now(),status='PART_PAID',amount_paid=Decimal('100'),payment_mode='',payment_reference='',base_items=[],items=[],measurement_adjustments=[],save=Mock())
    def response(self, data):
        invoice=self.invoice()
        view=InvoiceDetailView()
        with patch.object(view,'get_object',return_value=invoice),patch('quotations.views.recalculate_invoice'),patch('quotations.views.invoice_payload',return_value={'id':17}):
            response=view.patch(SimpleNamespace(user=object(),data=data),17)
        return response,invoice
    def test_invoice_details_save_with_existing_ledger_payments(self):
        response,invoice=self.response({'notes':'Updated invoice notes','base_items':[]})
        self.assertEqual(response.status_code,200)
        self.assertEqual(invoice.amount_paid,Decimal('100'))
        self.assertEqual(invoice.payment_mode,'')
        invoice.save.assert_called_once()
    def test_direct_payment_update_still_requires_mode(self):
        response,invoice=self.response({'amount_paid':'150','payment_mode':''})
        self.assertEqual(response.status_code,400)
        self.assertIn('payment_mode',response.data)
        invoice.save.assert_not_called()

    def test_closed_edit_window_remains_closed(self):
        invoice=self.invoice();invoice.created_at-=timedelta(days=1)
        view=InvoiceDetailView()
        with patch.object(view,'get_object',return_value=invoice):
            response=view.patch(SimpleNamespace(user=object(),data={'notes':'Updated notes'}),17)
        self.assertEqual(response.status_code,400)
        invoice.save.assert_not_called()
    def test_direct_payment_with_mode_can_still_save(self):
        response,invoice=self.response({'amount_paid':'150','payment_mode':'UPI'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(invoice.payment_mode,'UPI')
