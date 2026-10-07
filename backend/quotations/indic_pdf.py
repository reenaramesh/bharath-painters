"""Indic PDF variants using PyMuPDF Story's HarfBuzz text shaping.

Every language choice is an argument. No process-global locale/font mutation.
Business values and free text are escaped and preserved, never translated.
"""

from .quotation_pdf_labels import quotation_room_area_label

from html import escape
from io import BytesIO
from pathlib import Path

import pymupdf

from .document_languages import label, standard_label
from .transliteration import system_text
from decimal import Decimal, ROUND_HALF_UP

FONT_DIR = Path(__file__).parent / "fonts"
FONT_FILES = {"kn": "NotoSansKannada.ttf", "te": "NotoSansTelugu.ttf", "hi": "NotoSansDevanagari.ttf", "ta": "NotoSansTamil.ttf"}


def text(value):
    return escape(str(value if value is not None else ""))


def render_document(language, kind, reference, company, metadata, headings, rows, totals=(), terms="", notes="", media=(), sections=()):
    font = FONT_FILES[language]
    css = f"""
    @font-face {{ font-family: Document; src: url('{font}'); }}
    @font-face {{ font-family: Kannada; src: url('NotoSansKannada.ttf'); }}
    @font-face {{ font-family: Telugu; src: url('NotoSansTelugu.ttf'); }}
    @font-face {{ font-family: Hindi; src: url('NotoSansDevanagari.ttf'); }}
    @font-face {{ font-family: Tamil; src: url('NotoSansTamil.ttf'); }}
    body {{ font-family: Document, Kannada, Telugu, Hindi, Tamil, sans-serif; font-size: 10pt; color: #172033; }}
    h1 {{ font-size: 22pt; color: #176b9b; }}
    h2 {{ font-size: 13pt; }}
    table {{ width: 100%; border-collapse: collapse; margin: 12pt 0; }}
    td, th {{ border: 0.5pt solid #cad4df; padding: 5pt; overflow-wrap: anywhere; }}
    th {{ background: #edf3f8; text-align: left; }}
    p {{ overflow-wrap: anywhere; }}
    """
    archive = pymupdf.Archive(str(FONT_DIR))
    for name, data, caption in media:
        archive.add((data, name))
    html = '<div>' + ''.join(f"<img src='{text(name)}' width='100' height='100' alt='{text(caption)}'> " for name, data, caption in media[:3]) + '</div>' if media else ''
    html += f"<h2>{text(company)}</h2><h1>{text(label(language, kind))}</h1><p>{text(reference)}</p>"
    html += "".join(f"<p><b>{text(label(language, key))}:</b> {text(value)}</p>" for key, value in metadata)
    if headings or rows:
        html += "<table><thead><tr>" + "".join(f"<th>{text(label(language, key))}</th>" for key in headings) + "</tr></thead><tbody>"
        html += "".join("<tr>" + "".join(f"<td>{text(value)}</td>" for value in row) + "</tr>" for row in rows)
        html += "</tbody></table>"
    html += "".join(f"<p><b>{text(label(language, key))}:</b> {text(value)}</p>" for key, value in totals)
    for key, value in (("terms", terms), ("notes", notes)):
        if value:
            html += f"<h2>{text(label(language, key))}</h2><p>{text(value).replace(chr(10), '<br>')}</p>"
    for heading, fields, image_name in sections:
        html += f"<h2>{text(heading)}</h2>"
        if image_name:
            html += f"<img src='{text(image_name)}' width='160' height='120'>"
        html += ''.join(f"<p><b>{text(label(language, key))}:</b> {text(value).replace(chr(10), '<br>')}</p>" for key, value in fields if value not in (None, ''))
    output = BytesIO()
    writer = pymupdf.DocumentWriter(output)
    story = pymupdf.Story(html=html, user_css=css, archive=archive)
    page = pymupdf.paper_rect("a4")
    content = page + (36, 36, -36, -48)
    story.write(writer, lambda rect_num, filled: (page, content, None))
    writer.close()
    document = pymupdf.open(stream=output.getvalue(), filetype="pdf")
    for index, pdf_page in enumerate(document):
        pdf_page.insert_htmlbox(
            pymupdf.Rect(36, page.height - 38, page.width - 36, page.height - 12),
            f"<div style='font-size:8pt'>{text(label(language, 'page'))} {index + 1} / {len(document)} · {text(reference)}<br>{text(label(language, 'footer'))}</div>",
            css=css, archive=pymupdf.Archive(str(FONT_DIR)),
        )
    result = document.tobytes(garbage=4, deflate=True)
    document.close()
    return result


def company_name(record):
    profile = getattr(record.contractor, "contractor_profile", None)
    snapshot = getattr(record, "contractor_snapshot", {}) or {}
    return snapshot.get("company_name") or getattr(profile, "company_name", "") or "Bharath Apps"


def quotation_pdf(quotation, language, included_sections=None):
    allowed = lambda key: included_sections is None or key in included_sections
    rows = []
    if allowed("quotation_items"):
        for item in quotation.items.select_related("paint_type", "paint_brand", "service_type", "room", "unit"):
            areas = quotation_room_area_label(item)
            material = item.product_type_name_snapshot or item.custom_product_type or (item.paint_type.name if item.paint_type else "")
            brand = item.brand_name_snapshot or item.custom_brand or (item.paint_brand.name if item.paint_brand else "")
            service = item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type else "")
            details = [item.description, f"{label(language, 'included_areas')}: {areas}" if areas else "", f"{label(language, 'work')}: {service}" if service else "", f"{label(language, 'material')}: {material}" if material else "", f"{label(language, 'brand')}: {brand}" if brand else "", f"{label(language, 'coats')}: {item.coats}" if not item.is_additional_service else ""]
            rows.append((" · ".join(value for value in details if value), item.quantity, item.rate, item.amount))
    metadata = []
    if allowed("customer_details"):
        metadata.append(("customer", (quotation.customer_snapshot or {}).get("name") or quotation.customer.name))
    if allowed("property_details"):
        metadata.append(("property", (quotation.property_snapshot or {}).get("name") or quotation.property.name))
    if allowed("quotation_metadata"):
        metadata.append(("date", quotation.quotation_date))
    totals = []
    for key, section, value in (("subtotal", "subtotal", quotation.subtotal), ("discount", "discount", quotation.discount), ("tax", "gst", quotation.gst_amount), ("total", "grand_total", quotation.grand_total)):
        if allowed(section):
            totals.append((key, value))
    if allowed("grand_total"):
        totals.append(("total_words", system_text(currency_words(quotation.grand_total), language)))
    return render_document(language, "quotation", quotation.quotation_number, company_name(quotation),
        metadata, ["description", "quantity", "rate", "amount"], rows, totals,
        terms=quotation.terms_conditions if included_sections is None or "terms_conditions" in included_sections else "",
        notes=quotation.notes if included_sections is None or "notes" in included_sections else "")


def invoice_pdf(invoice, language, include_payment_details=True):
    rows = [(item.get("description", ""), item.get("quantity", 0), item.get("rate", 0), item.get("amount", 0)) for item in invoice.items]
    totals = [("subtotal", invoice.subtotal), ("discount", invoice.discount), ("tax", invoice.gst_amount), ("total", invoice.grand_total)]
    if include_payment_details:
        totals += [("paid", invoice.amount_paid), ("balance", invoice.balance_due)]
    totals.append(("total_words", system_text(currency_words(invoice.grand_total), language)))
    return render_document(language, "invoice", invoice.invoice_number, company_name(invoice),
        [("customer", invoice.customer_name), ("property", invoice.property_name), ("date", invoice.invoice_date)],
        ["description", "quantity", "rate", "amount"], rows, totals, invoice.terms_conditions, invoice.notes)


def measurement_pdf(property_obj, record, language):
    if record is None:
        record = property_obj.measurement_records.order_by("-measured_on", "-id").first()
    surfaces = record.surfaces.select_related("room").prefetch_related("openings") if record else []
    rows = [(surface.room.name if surface.room else "", surface.name, surface.length, surface.breadth,
             surface.gross_area, surface.deduction_area, surface.addition_area, surface.net_area) for surface in surfaces]
    html_bytes = render_document(language, "measurement", record.reference_no if record else str(property_obj.pk),
        company_name(record) if record and record.contractor_id else "Bharath Apps",
        [("customer", property_obj.customer.name), ("property", property_obj.name), ("date", record.measured_on if record else ""),
         ("linear_unit", getattr(property_obj, 'linear_unit_label', 'ft')), ("area_unit", 'sq ft')],
        ["room", "surface", "length", "width", "gross", "deduction", "addition", "net"], rows)
    return BytesIO(html_bytes)


def receipt_pdf(record, language, kind):
    if kind == "invoice":
        reference, customer, property_name = record.receipt_number or record.invoice_number, record.customer_name, record.property_name
        rows = [(payment.received_date, standard_label(language, payment.payment_mode), payment.payment_reference, payment.amount) for payment in record.payments.all()]
        total = record.amount_paid
        company = company_name(record)
    else:
        quotation = record.quotation
        customer, property_name, company = quotation.customer.name, quotation.property.name, company_name(quotation)
        if kind == "advance":
            reference = record.advance_receipt_number or quotation.quotation_number
            rows = [(record.payment_confirmed_at, standard_label(language, record.payment_mode), record.payment_reference, record.advance_amount)]
            total = record.advance_amount
        else:
            reference = record.receipt_number
            rows = [(record.received_date, standard_label(language, record.payment_mode), record.payment_reference, record.amount)]
            total = record.amount
    note = ""
    if kind == "advance":
        note = system_text("This receipt confirms advance payment against the quotation. It is not a tax invoice. The advance will be adjusted in the final invoice after project completion.", language)
        if getattr(record, "payment_note", ""):
            note += "\n" + record.payment_note
    return render_document(language, "advance_receipt" if kind == "advance" else "receipt", reference, company,
        [("customer", customer), ("property", property_name)], ["date", "mode", "reference", "amount"], rows,
        [("paid", total), ("total_words", system_text(currency_words(total), language))], notes=note)


def currency_words(number):
    from .professional_pdf import _amount_words
    amount = Decimal(str(number or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    negative = amount < 0
    amount = abs(amount)
    rupees = int(amount)
    paise = int((amount - rupees) * 100)
    value = ("Minus " if negative else "") + _amount_words(rupees) + " Indian Rupees"
    if paise:
        value += " and " + _amount_words(paise) + " Paise"
    return value + " Only"


def profile_pdf(user, card, profile_url, language):
    metadata = [("owner", card.get("owner_name", "")), ("mobile", card.get("mobile", "")),
        ("email", card.get("email", "")), ("reference", user.bharath_id),
        ("service_areas", ", ".join(card.get("service_areas", []))),
        ("services", ", ".join(card.get("work_skills", []))),
        ("years", card.get("years_in_business") or "-"), ("workers", card.get("workers") or "-"),
        ("verify", profile_url)]
    profile = getattr(user, 'contractor_profile', None)
    media, sections = [], []
    def add_image(field, name, caption):
        if not field:
            return None
        try:
            field.open('rb')
            content = field.read()
            suffix = Path(field.name).suffix or '.png'
            filename = name + suffix.lower()
            media.append((filename, content, caption))
            return filename
        except Exception:
            return None
        finally:
            close = getattr(field, 'close', None)
            if close:
                close()
    add_image(getattr(profile, 'company_logo', None), 'company-logo', label(language, 'logo'))
    add_image(getattr(user, 'profile_photo', None), 'owner-photo', label(language, 'photo'))
    add_image(getattr(user, 'bharath_qr', None), 'profile-qr', label(language, 'verify'))
    for project in card.get('projects', []):
        stored = profile.completed_projects.filter(id=project['id']).first() if profile and project.get('id') else None
        image_name = add_image(getattr(stored, 'photo', None), 'project-' + str(project.get('id', len(sections))), project.get('title', ''))
        fields = [(key, project.get(source, '')) for key, source in [('community','apartment_community'),('location','location'),('address','address'),('pincode','pincode'),('description','description'),('work_completed','work_completed'),('completed_on','completed_on_display')]]
        sections.append((project.get('title',''), fields, image_name))
    for link in card.get('social_links', []):
        sections.append((link.get('label',''), [('reference', link.get('url',''))], None))
    reviews = card.get('customer_reviews', {})
    if reviews.get('count'):
        metadata.append(('rating', f"{reviews.get('rating')} / 5 ({reviews.get('count')})"))
    for review in reviews.get('items', []):
        sections.append((review.get('customer_name',''), [('rating', review.get('rating')), ('date', review.get('date')), ('notes', review.get('comment',''))], None))
    return render_document(language, "profile", user.bharath_id, card.get("title", "Bharath Apps"), metadata,
        [], [], media=media, sections=sections)
