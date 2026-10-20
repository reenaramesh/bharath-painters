from copy import deepcopy
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from . import test_phase3 as phase3
from . import test_grouped_specifications as fixtures
from .models import Quotation
from .pricing import calculate_pricing


class CombinedDiscountTests(APITestCase):
    setUp = phase3.QuotationPhase3Tests.setUp
    item = fixtures.GroupedSpecificationTests.item
    split = fixtures.GroupedSpecificationTests.split
    payload = phase3.QuotationPhase3Tests.payload
    create = phase3.QuotationPhase3Tests.create

    def test_combined_totals_all_tax_modes_caps_and_rounding(self):
        items = [{'amount':3450, 'discount_type':'PERCENTAGE', 'discount_value':10},
                 {'amount':1250, 'discount_type':'FIXED', 'discount_value':50}]
        settings = dict(discount_mode='BOTH', discount_type='PERCENTAGE', discount_value=10, gst_mode='GST_EXTRA', gst_percentage=18)
        totals = calculate_pricing(items, settings)
        self.assertEqual(totals['discount'], Decimal('825.50'))
        self.assertEqual(totals['grand_total'], Decimal('4571.91'))
        self.assertEqual(calculate_pricing(items, {**settings,'gst_mode':'GST_INCLUDED'})['gst_amount'], Decimal('591.03'))
        self.assertEqual(calculate_pricing(items, {**settings,'gst_mode':'NO_GST'})['grand_total'], Decimal('3874.50'))
        self.assertEqual(calculate_pricing(items, {**settings,'discount_type':'FIXED','discount_value':100000})['grand_total'], 0)
        small = [{'amount':Decimal('0.15'),'discount_type':'PERCENTAGE','discount_value':10}]
        self.assertEqual(calculate_pricing(small,{**settings,'gst_mode':'NO_GST'})['grand_total'], Decimal('0.12'))

    def test_combined_create_reopen_atomic_edit_pdf_and_rollback(self):
        payload = self.payload('BOTH')
        created = self.create(payload)
        self.assertEqual(created.status_code,201,created.data)
        saved = created.data
        self.assertEqual(Decimal(saved['discount']),Decimal('825.50'))
        self.assertEqual(Decimal(saved['grand_total']),Decimal('4571.91'))
        self.assertEqual(Decimal(saved['items'][0]['net_amount']),Decimal('3105'))
        reopened = self.client.get(reverse('quotation-detail',kwargs={'pk':saved['id']})).data
        self.assertEqual(reopened['discount_mode'],'BOTH')
        request = {'expected_updated_at':reopened['updated_at'],'rooms':reopened['rooms'],'items':reopened['items'],'discount_mode':'BOTH','discount_type':'FIXED','discount_value':'125'}
        edited = self.client.patch(reverse('quotation-draft-save',kwargs={'pk':saved['id']}),request,format='json')
        self.assertEqual(edited.status_code,200,edited.data)
        self.assertEqual(Decimal(edited.data['grand_total']),Decimal('4932.40'))
        self.assertEqual([item['id'] for item in edited.data['items']],[item['id'] for item in saved['items']])
        invalid = deepcopy(request)
        invalid['expected_updated_at'] = edited.data['updated_at']
        invalid['discount_value'] = 999
        invalid['items'][0]['rate'] = '-1'
        failed = self.client.patch(reverse('quotation-draft-save',kwargs={'pk':saved['id']}),invalid,format='json')
        self.assertEqual(failed.status_code,400)
        restored = self.client.get(reverse('quotation-detail',kwargs={'pk':saved['id']})).data
        self.assertEqual(restored['discount_value'],'125.00')
        self.assertEqual(restored['grand_total'],edited.data['grand_total'])
        payload.update(discount_type='FIXED',discount_value='125')
        count = Quotation.objects.count()
        pdf = self.client.post(reverse('quotation-preview-pdf'),payload,format='json')
        self.assertEqual(pdf.status_code,200)
        self.assertEqual(Quotation.objects.count(),count)
        import pymupdf
        with pymupdf.open(stream=pdf.content,filetype='pdf') as document:
            text = ' '.join(''.join(page.get_text() for page in document).split())
        self.assertIn('Line discount',text)
        self.assertIn('Overall discount',text)
        self.assertIn('4,932.40',text)

    def test_combined_work_order_source_uses_remaining_line_values(self):
        from outsourcing.margins import source_snapshot
        created = self.create(self.payload('BOTH'))
        self.assertEqual(created.status_code,201,created.data)
        quotation = Quotation.objects.get(pk=created.data['id'])
        before = quotation.updated_at
        snapshot = source_snapshot(quotation,quotation.items.order_by('pk'))
        self.assertEqual([Decimal(item['eligible_amount']) for item in snapshot['items']],[Decimal('2794.50'),Decimal('1080.00')])
        quotation.refresh_from_db()
        self.assertEqual(quotation.updated_at,before)

    def test_customer_portal_uses_combined_saved_amounts_and_preserves_permissions(self):
        from accounts.models import BharathUser
        from .property_access import ensure_legacy_primary_contact
        created = self.create(self.payload('BOTH'))
        self.assertEqual(created.status_code,201,created.data)
        portal = BharathUser.objects.create_user(mobile=self.customer.mobile,password='test-pass',role='CUSTOMER')
        self.customer.portal_user = portal
        self.customer.save(update_fields=['portal_user'])
        ensure_legacy_primary_contact(self.property)
        Quotation.objects.filter(pk=created.data['id']).update(status='SENT')
        self.client.force_authenticate(portal)
        url = reverse('customer-quotation-detail',kwargs={'pk':created.data['id']})
        response = self.client.get(url)
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['discount_mode'],'BOTH')
        self.assertEqual(Decimal(response.data['grand_total']),Decimal('4571.91'))
        self.assertEqual(Decimal(response.data['items'][0]['discount_amount']),Decimal('345.00'))
        self.assertEqual(Decimal(response.data['items'][0]['net_amount']),Decimal('3105.00'))
        unrelated = BharathUser.objects.create_user(mobile='9888000919',password='test-pass',role='CUSTOMER')
        self.client.force_authenticate(unrelated)
        self.assertEqual(self.client.get(url).status_code,404)
