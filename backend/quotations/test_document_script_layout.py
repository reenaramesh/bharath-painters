from io import BytesIO
from unittest.mock import patch
from django.test import SimpleTestCase
from reportlab.pdfgen import canvas
import pymupdf
from quotations import pdf_utils


def sample_pdf(title):
    output=BytesIO();pdf=canvas.Canvas(output)
    pdf.setFillColorRGB(.08,.22,.3);pdf.roundRect(35,720,520,80,12,fill=1,stroke=0)
    pdf.setFillColorRGB(1,1,1);pdf.setFont('Helvetica-Bold',20);pdf.drawString(50,760,title)
    pdf.setFillColorRGB(0,0,0);pdf.setFont('Helvetica',10)
    pdf.drawString(50,680,'Customer details');pdf.drawString(50,660,'Original Customer')
    pdf.drawString(50,630,'Description');pdf.drawString(50,610,'Original product description')
    pdf.drawString(50,580,'1234.50');pdf.showPage();pdf.drawString(50,760,'Terms and conditions');pdf.drawString(50,730,'Original custom terms');pdf.save()
    return output.getvalue()

class DocumentScriptLayoutTests(SimpleTestCase):
    def compare(self,source,result):
        with pymupdf.open(stream=source,filetype='pdf') as original,pymupdf.open(stream=result,filetype='pdf') as localized:
            self.assertEqual(len(original),len(localized))
            for left,right in zip(original,localized):
                self.assertEqual(left.rect,right.rect)
                self.assertEqual([{k:v for k,v in value.items() if k!='seqno'} for value in left.get_drawings()],[{k:v for k,v in value.items() if k!='seqno'} for value in right.get_drawings()])
            text=''.join(page.get_text() for page in localized)
            for value in ['Original Customer','Original product description','1234.50','Original custom terms']:self.assertIn(value,text)
            self.assertNotIn('Customer details',text)

    def test_primary_downloads_use_existing_templates_for_every_script(self):
        for language in ['kn','te','hi','ta']:
            for kind,builder,renderer,title in [('quotation',pdf_utils.build_quotation_pdf,'_professional_quotation_pdf','QUOTATION'),('invoice',pdf_utils.build_invoice_pdf,'_professional_invoice_pdf','INVOICE'),('measurement',pdf_utils.build_measurement_pdf,'_professional_measurement_pdf','AREA CALCULATION REPORT')]:
                with self.subTest(language=language,kind=kind):
                    original=sample_pdf(title);source=BytesIO(original) if kind=='measurement' else original
                    with patch('quotations.pdf_utils.'+renderer,return_value=source) as canonical:
                        kwargs={'language':language}
                        if kind=='quotation':kwargs['included_sections']=['quotation_items','grand_total']
                        result=builder(object(),**kwargs)
                    canonical.assert_called_once()
                    if kind=='quotation':self.assertEqual(canonical.call_args.kwargs['included_sections'],['quotation_items','grand_total'])
                    if kind=='measurement':self.assertIsInstance(result,BytesIO);result=result.getvalue()
                    self.compare(original,result)

    def test_hidden_payment_invoice_keeps_its_restricted_template(self):
        original=sample_pdf('INVOICE')
        with patch('quotations.pdf_utils._legacy_invoice_pdf',return_value=original) as restricted,patch('quotations.pdf_utils._professional_invoice_pdf') as full:
            result=pdf_utils.build_invoice_pdf(object(),include_payment_details=False,language='te')
        restricted.assert_called_once();self.assertFalse(restricted.call_args.kwargs['include_payment_details']);full.assert_not_called()
        self.compare(original,result)
