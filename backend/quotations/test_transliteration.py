import json
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from .document_languages import document_language, label, standard_label
from .transliteration import format_system_text, system_text
from .indic_pdf import currency_words
from unittest.mock import patch
import pymupdf


class TransliterationTests(SimpleTestCase):
    def test_native_profile_retains_embedded_images_and_custom_details(self):
        from .indic_pdf import profile_pdf
        from accounts.test_profile_pdf_layout import ProfilePdfLayoutTests
        user, card = ProfilePdfLayoutTests().fixture()
        user.bharath_id = card['bharath_id'] = 'BP-SAVE-1'
        card.update(title='Save Painting', owner_name='Customer Save', work_skills=['Painting'],
            social_links=[{'label':'Custom website','url':'https://example.com/Save','short':'WEB','color':'#176b9b'}],
            customer_reviews={'rating':4,'count':1,'items':[{'customer_name':'Customer Save','rating':4,'date':'2026-10-06','comment':'Custom review Painting'}]})
        card['projects'][0].update(title='Invoice House', address='123 Painting Road', description='User custom description', work_completed='Custom work')
        with pymupdf.open(stream=profile_pdf(user, card, 'https://example.com/BP-SAVE-1', 'te'), filetype='pdf') as document:
            self.assertGreaterEqual(sum(len(page.get_images()) for page in document), 3)
            value=''.join(page.get_text() for page in document)
            for text in ['Save Painting','123 Painting Road','User custom description','Custom review Painting']:
                self.assertIn(text, value)
            self.assertIn('https://example.com/Save', [link.get('uri') for page in document for link in page.get_links()])
    def test_native_invoice_still_hides_restricted_payment_information(self):
        from .indic_pdf import invoice_pdf
        invoice = SimpleNamespace(items=[], subtotal=10, discount=0, gst_amount=0, grand_total=10, amount_paid=7, balance_due=3,
            invoice_number='INV-SAVE-1', contractor=SimpleNamespace(contractor_profile=None), contractor_snapshot={},
            customer_name='Save', property_name='Painting', invoice_date='2026-10-06', terms_conditions='Custom terms', notes='Custom notes')
        with patch('quotations.indic_pdf.render_document', return_value=b'%PDF') as render:
            invoice_pdf(invoice, 'te', include_payment_details=False)
            totals = render.call_args.args[7]
            self.assertNotIn('paid', [key for key, value in totals])
            self.assertNotIn('balance', [key for key, value in totals])
            self.assertEqual(render.call_args.args[4][0], ('customer', 'Save'))
            self.assertEqual(render.call_args.args[8], 'Custom terms')
            self.assertEqual(invoice.amount_paid, 7)

    def test_requested_telugu_spellings_and_shared_pdf_glossary(self):
        expected = {"Dashboard": "డ్యాష్‌బోర్డ్", "Customer": "కస్టమర్", "Painting": "పెయింటింగ్", "Quotation": "కొటేషన్", "Invoice": "ఇన్వాయిస్", "Save": "సేవ్", "Download Invoice": "డౌన్‌లోడ్ ఇన్వాయిస్", "Payment": "పేమెంట్"}
        for source, target in expected.items():
            self.assertEqual(system_text(source, "te"), target)
        self.assertEqual(label("te", "invoice"), system_text("Invoice", "te"))
        self.assertEqual(standard_label("te", "CASH"), system_text("Cash", "te"))

    def test_interpolated_customer_data_and_technical_tokens_are_preserved(self):
        for script in ("te", "kn", "hi", "ta"):
            self.assertEqual(format_system_text("Customer {name} paid {amount}", script, name="Save Painting", amount="123.45"), system_text("Customer", script) + " Save Painting " + system_text("paid", script) + " 123.45")
            protected = "Bharath Apps Bharath Painters Asian Paints https://example.com/Save person@example.com INV-SAVE-2026 sqft mm kg #176B9B {{name}} {amount} 0123456789"
            self.assertEqual(system_text(protected, script), protected)
            self.assertEqual(system_text("Unknownuncertainword", script), "Unknownuncertainword")

    def test_english_is_default_fallback_and_pdf_override_is_request_local(self):
        request = SimpleNamespace(query_params={}, user=SimpleNamespace(preferred_language="te"))
        self.assertEqual(document_language(request), "te")
        request.query_params["document_language"] = "hi"
        self.assertEqual(document_language(request), "hi")
        self.assertEqual(request.user.preferred_language, "te")
        request.query_params["document_language"] = "bad"
        with self.assertRaises(ValidationError):
            document_language(request)
        self.assertEqual(system_text("Save", "unknown"), "Save")

    def test_currency_words_preserve_paise_and_sign_without_mutating_amounts(self):
        amount = Decimal("123.45")
        self.assertEqual(currency_words(amount), "One Hundred Twenty Three Indian Rupees and Forty Five Paise Only")
        self.assertEqual(amount, Decimal("123.45"))
        self.assertEqual(currency_words(0), "Zero Indian Rupees Only")
        self.assertTrue(currency_words(-1).startswith("Minus One"))

    def test_only_the_selected_unicode_script_is_used(self):
        glossary = json.loads((Path(__file__).resolve().parents[2] / "shared/transliteration/glossary.json").read_text(encoding="utf8"))
        ranges = {"te": (0x0C00, 0x0C7F), "kn": (0x0C80, 0x0CFF), "hi": (0x0900, 0x097F), "ta": (0x0B80, 0x0BFF)}
        for script, words in glossary.items():
            low, high = ranges[script]
            for word, value in words.items():
                self.assertTrue(all(ord(char) < 128 or low <= ord(char) <= high or char in "\u200c\u200d" for char in value), (script, word, value))
