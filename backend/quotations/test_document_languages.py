from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from django.test import SimpleTestCase
import pymupdf

from .document_languages import LABELS
from .indic_pdf import render_document


class IndicDocumentTests(SimpleTestCase):
    def document(self, language, count=3):
        return render_document(language, "invoice", "INV-TEST-001", "Bharath Apps",
            [("customer", "Customer 123"), ("property", "A-1204")],
            ["description", "quantity", "rate", "amount"],
            [(LABELS[language]["description"], 2, Decimal("123.45"), Decimal("246.90"))] * count,
            [("total", Decimal("246.90"))], notes="User-written note retained exactly.")

    def test_every_indic_variant_embeds_fonts_and_has_searchable_text(self):
        for language in ("kn", "te", "hi", "ta"):
            with self.subTest(language=language):
                document = pymupdf.open(stream=self.document(language), filetype="pdf")
                extracted = "".join(page.get_text() for page in document)
                self.assertIn("246.90", extracted)
                self.assertIn("INV-TEST-001", extracted)
                self.assertIn("User-written note retained exactly.", extracted)
                self.assertTrue(any(document.extract_font(font[0])[3] for page in document for font in page.get_fonts()))
                self.assertNotIn("\ufffd", extracted)
                document.close()

    def test_long_tables_flow_to_multiple_a4_pages(self):
        document = pymupdf.open(stream=self.document("te", count=120), filetype="pdf")
        self.assertGreater(len(document), 1)
        self.assertTrue(all(abs(page.rect.width - 595) < 2 for page in document))
        self.assertIn("246.90", document[-1].get_text())
        document.close()

    def test_concurrent_document_languages_are_request_local(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            outputs = list(pool.map(self.document, ("kn", "te", "hi", "ta")))
        self.assertEqual(len(outputs), 4)
        self.assertTrue(all(output.startswith(b"%PDF") for output in outputs))
