import os
import re
from pathlib import Path
from decimal import Decimal

import pymupdf
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from accounts.models import BharathUser
from .models import Quotation, QuotationItem, PaintBrand
from .test_grouped_specifications import GroupedSpecificationTests
from .professional_pdf import build_quotation_pdf


class QuotationItemLayoutTests(TestCase):
    setUp = GroupedSpecificationTests.setUp

    def test_customer_response_exposes_only_display_specifications_to_the_owner(self):
        user=BharathUser.objects.create_user(mobile='9888000860',password='test-pass',role='CUSTOMER')
        self.customer.portal_user=user
        self.customer.save(update_fields=['portal_user'])
        quote=Quotation.objects.create(contractor=self.contractor,customer=self.customer,property=self.property,quotation_number='DISPLAY-QA',status='SENT')
        QuotationItem.objects.create(quotation=quote,description='Finish',quantity=10,rate=20,amount=200,specification_details={'painting_process':'PRIMER_PAINT','base_description':'Finish','surface':'WALL','room_ids':[self.room.id],'process_materials':{'primer':{'brand':'Private choice'}}})
        client=APIClient();client.force_authenticate(user)
        response=client.get(reverse('customer-quotation-detail',args=[quote.pk]))
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['items'][0]['specification_details'],{'painting_process':'PRIMER_PAINT','base_description':'Finish','surface':'WALL'})
        other=BharathUser.objects.create_user(mobile='9888000861',password='test-pass',role='CUSTOMER')
        client.force_authenticate(other)
        self.assertEqual(client.get(reverse('customer-quotation-detail',args=[quote.pk])).status_code,404)

    def test_pdf_columns_and_paint_only_values_for_draft_and_issued(self):
        quote = Quotation.objects.create(contractor=self.contractor,customer=self.customer,property=self.property,quotation_number='LAYOUT-QA',discount_mode='LINE',subtotal=6600,discount=100,grand_total=6500)
        brand = PaintBrand.objects.create(name='Paint Brand',created_by=self.contractor)
        item = QuotationItem.objects.create(quotation=quote,service_category=self.category,paint_type=self.product,paint_brand=brand,unit=self.unit,coats=2,quantity=330,rate=20,amount=6600,description='Generated scope | Smooth finish | Process',discount_type='FIXED',discount_value=100,specification_details={'kind':'group','name':'Interior Walls','painting_process':'PUTTY_PRIMER_PAINT','base_description':'Smooth finish','surface':'WALL','contributions':[{'room_name':'Bedroom','quantity':330}],'process_materials':{'primer':{'brand':'Primer Brand'},'putty':{'brand':'Putty Brand','coats':5}}})
        for status in ['DRAFT','SENT']:
            quote.status=status
            payload=build_quotation_pdf(quote)
            with pymupdf.open(stream=payload,filetype='pdf') as document:
                text=re.sub(r'\s+',' ',' '.join(page.get_text() for page in document))
                for heading in ['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Coats','Sqft','Rate','Total']:
                    self.assertIn(heading,text)
                self.assertNotIn('Putty + Primer + Paint',text)
                self.assertNotIn('Painting Process',text)
                self.assertIn('Paint Brand / Tractor Emulsion',text)
                self.assertIn('Smooth finish',text)
                self.assertIn('6,500.00',text)
                self.assertNotIn('Generated scope',text)
                self.assertNotIn('Primer Brand',text)
                self.assertNotIn('Putty Brand',text)
                if os.environ.get('QUOTATION_LAYOUT_ARTIFACT_DIR'):
                    out=Path(os.environ['QUOTATION_LAYOUT_ARTIFACT_DIR']);out.mkdir(parents=True,exist_ok=True)
                    (out / f'{status.lower()}-quotation.pdf').write_bytes(payload)
                    document[0].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(str(out / f'{status.lower()}-quotation.png'))
        item.refresh_from_db()
        self.assertEqual(item.quantity,Decimal('330'))
        self.assertEqual(item.rate,Decimal('20'))
