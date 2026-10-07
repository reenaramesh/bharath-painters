"""Generate isolated fixtures; no database or production records are used."""
import os
import sys
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as Obj

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
import pymupdf
from quotations.indic_pdf import quotation_pdf, invoice_pdf, measurement_pdf, receipt_pdf, profile_pdf, render_document
from quotations.transliteration import system_text


class Rows(list):
    def all(self): return self
    def select_related(self, *args): return self
    def prefetch_related(self, *args): return self


out = ROOT / 'tmp/transliteration/pdfs'
out.mkdir(parents=True, exist_ok=True)
contractor = Obj(contractor_profile=Obj(company_name='Save Painting Company'))
customer = Obj(name='Customer Save', address='123 Painting Road')
property_obj = Obj(pk=1, name='Invoice House', customer=customer, linear_unit_label='ft')
item = Obj(description='User-written Painting Save Waterproofing', quantity=2, rate=Decimal('123.45'), amount=Decimal('246.90'),
    included_areas=['Painting Room'], room=None, product_type_name_snapshot='Custom Paint', custom_product_type='', paint_type=None,
    brand_name_snapshot='Save Brand', custom_brand='', paint_brand=None, service_name_snapshot='Painting', custom_service_type='',
    service_type=None, unit=None, coats=2, is_additional_service=False)
quotation = Obj(quotation_number='QT-SAVE-001', contractor=contractor, contractor_snapshot={}, customer=customer, property=property_obj,
    customer_snapshot={}, property_snapshot={}, quotation_date='2026-10-06', items=Rows([item] * 60),
    subtotal=Decimal('246.90'), discount=0, gst_amount=0, grand_total=Decimal('246.90'),
    terms_conditions='Custom terms: Save Painting at 123 Road. ' * 25, notes='Custom note: customer@example.com #176B9B 42 sqft')
invoice = Obj(invoice_number='INV-SAVE-001', contractor=contractor, contractor_snapshot={}, customer_name='Customer Save', property_name='Invoice House',
    invoice_date='2026-10-06', items=[vars(item)] * 60, subtotal=Decimal('246.90'), discount=0, gst_amount=0, grand_total=Decimal('246.90'),
    amount_paid=Decimal('123.45'), balance_due=Decimal('123.45'), terms_conditions=quotation.terms_conditions, notes=quotation.notes,
    receipt_number='REC-SAVE-001', payments=Rows([Obj(received_date='2026-10-06', payment_mode='CASH', payment_reference='PAY-SAVE-001', amount=Decimal('123.45'))]))
surface = Obj(room=Obj(name='Painting Room'), name='Custom Wall', length=10, breadth=12, gross_area=120, deduction_area=10, addition_area=2, net_area=112)
record = Obj(reference_no='AREA-SAVE-001', contractor=contractor, contractor_id=1, contractor_snapshot={}, surfaces=Rows([surface] * 60), measured_on='2026-10-06')
advance = Obj(quotation=quotation, advance_receipt_number='ADV-SAVE-001', payment_confirmed_at='2026-10-06', payment_mode='CASH', payment_reference='PAY-SAVE-001', advance_amount=Decimal('123.45'))
project_receipt = Obj(quotation=quotation, receipt_number='PROJECT-SAVE-001', received_date='2026-10-06', payment_mode='CASH', payment_reference='PAY-SAVE-001', amount=Decimal('123.45'))
user = Obj(bharath_id='BP-SAVE-001')
card = dict(title='Save Painting Company', owner_name='Customer Save', mobile='9876543210', email='customer@example.com', service_areas=['Painting Road'], work_skills=['Painting'], projects=[dict(title='Save Project', location='Invoice House', description='Custom Painting', work_completed='User note')])
report = []
for script in ('te', 'kn', 'hi', 'ta'):
    documents = {
        'quotation': quotation_pdf(quotation, script), 'invoice': invoice_pdf(invoice, script),
        'measurement': measurement_pdf(property_obj, record, script).getvalue(),
        'receipt': receipt_pdf(invoice, script, 'invoice'), 'advance': receipt_pdf(advance, script, 'advance'),
        'project-receipt': receipt_pdf(project_receipt, script, 'project'),
        'profile': profile_pdf(user, card, 'https://example.com/BP-SAVE-001', script),
        'package': render_document(script, 'package_invoice', 'PKG-SAVE-001', 'Bharath Apps', [('customer', customer.name)], ['amount'], [('123.45',)], notes=system_text('This is a computer-generated document.', script)),
    }
    for kind, data in documents.items():
        path = out / f'{kind}-{script}.pdf'
        path.write_bytes(data)
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            text = ''.join(page.get_text() for page in doc)
            assert '\ufffd' not in text
            assert 'Customer Save' in text or kind == 'measurement'
            assert any(doc.extract_font(font[0])[3] for page in doc for font in page.get_fonts())
            if kind in ('quotation', 'invoice', 'measurement'):
                assert len(doc) > 1
            for index, page in enumerate(doc):
                for block in page.get_text('blocks'):
                    assert block[0] >= 0 and block[2] <= page.rect.width + 1, (path, index, block)
                page.get_pixmap(matrix=pymupdf.Matrix(1.2, 1.2)).save(out / f'{kind}-{script}-{index+1}.png')
            report.append(dict(file=path.name, pages=len(doc), embedded_fonts=True, protected_customer='Customer Save' in text))
import json
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(f'Generated and checked {len(report)} PDF variants in {out}')
