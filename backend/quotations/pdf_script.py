"""Request-local phonetic system copy applied to an existing PDF layout."""
from html import escape
import re
import pymupdf
from .transliteration import system_text


DOCUMENT_LABELS = {
    "quotation", "quotation total", "invoice", "tax invoice", "invoice items", "invoice total",
    "invoice no.", "invoice date", "project ref.", "source", "bill to", "direct invoice",
    "customer details", "customer", "property details", "property site details", "property",
    "scope of work", "type of service", "description", "description / treatment", "product / brand",
    "hsn/sac", "sl.", "qty", "qty / area", "quantity", "rate", "rate (₹)", "amount", "amount (₹)",
    "subtotal", "discount", "gst", "taxable amount", "total in words", "prepared by", "inspected by",
    "authorized signature", "signature", "terms", "terms and conditions", "terms & conditions", "notes",
    "product details", "product details / warranty", "payment schedule", "payment terms", "work duration",
    "work procedures and safety", "additional details", "bank & payment details", "powered by bharath painters",
    "area calculation report", "area calculation details", "calculation no.", "calculation date", "version",
    "measurement remarks", "all room measurements", "all rooms total", "room / area", "room total",
    "category", "calculation", "reference", "name", "title", "area", "net area", "other areas",
    "wall", "walls", "ceiling", "ceilings", "door", "doors", "window", "windows", "other", "other surfaces",
    "net wall area", "net ceiling area", "wall total", "ceiling total", "door total", "window total",
    "door area", "window area", "door qty", "window qty", "wall additions", "wall deductions",
    "ceiling additions", "ceiling deductions", "length / width", "height / width", "coats",
    "add", "deduct", "ignore", "measured", "manual", "paintable", "lump sum",
    "paid", "amount paid", "balance", "balance due", "grand total", "tax", "date",
    "gross", "gross area", "deduction", "deductions", "addition", "additions", "net", "surface",
    "room", "room /", "net wall", "net ceiling", "length", "width", "height", "total", "action",
    "account name", "account number", "contractor id", "customer id", "mobile", "email",
}
PREFIXES = (
    "Account name: ", "Account number: ", "Contractor ID: ", "Customer ID: ", "Mobile / GSTIN: ",
    "Mobile: ", "Email: ", "GSTIN: ", "IFSC: ", "UPI: ", "Valid until ", "Created ", "Version ", "Page ",
)
NUMBER_WORDS = set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand lakh crore indian rupees only and paise".split())


def document_script_copy(source, language):
    parts = re.split(r"(\s+\|\s+)", source)
    if len(parts) > 1:
        return "".join(part if index % 2 else document_script_copy(part, language) for index, part in enumerate(parts))
    clean = source.strip()
    if clean.rstrip(":").casefold() in DOCUMENT_LABELS or re.fullmatch(r"GST\s*\([\d.,]+%\)", clean, re.I):
        return system_text(source, language)
    for prefix in PREFIXES:
        if source.casefold().startswith(prefix.casefold()):
            return system_text(source[:len(prefix)], language) + source[len(prefix):]
    words = re.findall(r"[A-Za-z]+", clean)
    if words and all(word.lower() in NUMBER_WORDS for word in words):
        return system_text(source, language)
    return source


def localize_document_pdf(content, language):
    return localize_pdf_copy(content, language, lambda source: document_script_copy(source, language))


def localize_pdf_copy(content, language, script_copy):
    if language == "en":
        return content
    from .indic_pdf import FONT_FILES, FONT_DIR
    archive = pymupdf.Archive(str(FONT_DIR))
    css = f"@font-face {{font-family: ProfileScript; src: url('{FONT_FILES[language]}');}} body {{margin:0;padding:0;}}"
    with pymupdf.open(stream=content, filetype="pdf") as document:
        for page in document:
            replacements = []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        localized = script_copy(span["text"])
                        if localized == span["text"]:
                            continue
                        rect = pymupdf.Rect(span["bbox"])
                        replacements.append((rect, span, localized))
                        page.add_redact_annot(rect, fill=False, cross_out=False)
            if not replacements:
                continue
            # Text-only removal leaves photos, QR, logo, panel fills and borders intact.
            page.apply_redactions(images=0, graphics=0, text=0)
            for rect, span, localized in replacements:
                color = f"#{span['color']:06x}"
                weight = "700" if "Bold" in span["font"] else "400"
                html = f'<div style="font-family:ProfileScript;font-size:{span["size"]}pt;font-weight:{weight};color:{color};line-height:1;white-space:nowrap;margin:0;padding:0">{escape(localized)}</div>'
                previous_streams = set(page.get_contents())
                spare, _scale = page.insert_htmlbox(rect, html, css=css, archive=archive, scale_low=0.25)
                if spare < 0:
                    raise ValueError("Document script text could not fit its original position.")
                # HarfBuzz ligatures need logical Unicode text for copying/accessibility.
                actual_text = (b"\xfe\xff" + localized.encode("utf-16-be")).hex().encode("ascii")
                for stream in set(page.get_contents()) - previous_streams:
                    commands = document.xref_stream(stream)
                    document.update_stream(stream, b"/Span <</ActualText <" + actual_text + b">>> BDC\n" + commands + b"\nEMC\n")
        return document.tobytes(garbage=4, deflate=True)

