"""Shared professional A4 PDF design for quotations, invoices and measurement reports."""

from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import CondPageBreak, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from PIL import Image as PILImage, ImageDraw, ImageOps

from .product_details import consolidated_product_details

INK = colors.HexColor("#172033")
BLUE = colors.HexColor("#4F46E5")
BLUE_DARK = colors.HexColor("#312E81")
BLUE_PALE = colors.HexColor("#EEF2FF")
PURPLE_PALE = colors.HexColor("#F5F3FF")
SLATE = colors.HexColor("#64748B")
LINE = colors.HexColor("#D9E2F1")
PANEL = colors.HexColor("#F8FAFC")
GREEN_PALE = colors.HexColor("#ECFDF5")


def _register_fonts():
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"),
        (r"C:\Windows\Fonts\ARIALUNI.TTF", r"C:\Windows\Fonts\arialbd.ttf"),
        (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    ]
    for normal, bold in candidates:
        if Path(normal).exists() and Path(bold).exists():
            try:
                pdfmetrics.registerFont(TTFont("BP-Regular", normal))
                pdfmetrics.registerFont(TTFont("BP-Bold", bold))
                return "BP-Regular", "BP-Bold", True
            except Exception:
                continue
    return "Helvetica", "Helvetica-Bold", False


FONT, FONT_BOLD, HAS_RUPEE = _register_fonts()


def _indian_number(value, decimals=0):
    value = Decimal(str(value or 0))
    negative, value = value < 0, abs(value)
    if decimals == 0:
        value = value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    formatted = f"{value:.{decimals}f}"
    whole, fraction = formatted.split(".", 1) if decimals else (formatted, "")
    if len(whole) > 3:
        head, tail, pairs = whole[:-3], whole[-3:], []
        while head:
            pairs.insert(0, head[-2:])
            head = head[:-2]
        whole = ",".join(pairs + [tail])
    result = whole if decimals == 0 else f"{whole}.{fraction}"
    return f"-{result}" if negative else result


def money(value):
    return f"{'₹' if HAS_RUPEE else 'Rs.'} {_indian_number(value)}"


def area(value):
    return f"{_indian_number(value)} sq.ft"


def quantity(value):
    return f"{Decimal(str(value or 0)):,.0f}"


def _amount_words(number):
    ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    def under_thousand(value):
        parts = []
        if value >= 100:
            parts.extend([ones[value // 100], "Hundred"])
            value %= 100
        if value >= 20:
            parts.append(tens[value // 10])
            value %= 10
        if value:
            parts.append(ones[value])
        return " ".join(parts)
    value = int(Decimal(str(number or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if value == 0:
        return "Zero"
    parts = []
    for divisor, label in ((10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand")):
        if value >= divisor:
            parts.extend([under_thousand(value // divisor), label])
            value %= divisor
    if value:
        parts.append(under_thousand(value))
    return " ".join(parts)


def _text(value):
    return escape(str(value or "").strip())


def _joined(values, separator=", "):
    return separator.join(str(value).strip() for value in values if value and str(value).strip())


def _styles():
    sample = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("bp-body", parent=sample["BodyText"], fontName=FONT, fontSize=9, leading=12, textColor=INK),
        "small": ParagraphStyle("bp-small", parent=sample["BodyText"], fontName=FONT, fontSize=7.6, leading=9.8, textColor=SLATE),
        "bold": ParagraphStyle("bp-bold", parent=sample["BodyText"], fontName=FONT_BOLD, fontSize=9, leading=12, textColor=INK),
        "label": ParagraphStyle("bp-label", parent=sample["BodyText"], fontName=FONT_BOLD, fontSize=7, leading=8.8, textColor=BLUE, tracking=.6),
        "label_inverse": ParagraphStyle("bp-label-inverse", parent=sample["BodyText"], fontName=FONT_BOLD, fontSize=7, leading=8.8, textColor=colors.white, tracking=.6),
        "title": ParagraphStyle("bp-title", parent=sample["Title"], fontName=FONT_BOLD, fontSize=21, leading=24, textColor=BLUE_DARK),
        "title_center": ParagraphStyle("bp-title-center", parent=sample["Title"], fontName=FONT_BOLD, fontSize=21, leading=24, alignment=TA_CENTER, textColor=BLUE_DARK),
        "company": ParagraphStyle("bp-company", parent=sample["Heading2"], fontName=FONT_BOLD, fontSize=14, leading=17, textColor=INK),
        "section": ParagraphStyle("bp-section", parent=sample["Heading3"], fontName=FONT_BOLD, fontSize=10.8, leading=14, textColor=INK, spaceBefore=2*mm, spaceAfter=1.5*mm),
        "right": ParagraphStyle("bp-right", parent=sample["BodyText"], fontName=FONT, fontSize=8.6, leading=10.8, alignment=TA_RIGHT, textColor=INK),
    }


def _logo(profile, snapshot):
    try:
        stored = snapshot.get("company_logo")
        profile_logo = getattr(profile, "company_logo", None) if profile else None
        profile_logo_name = getattr(profile_logo, "name", "")
        path = (
            Path(profile_logo.path)
            if profile_logo_name
            else Path(settings.MEDIA_ROOT) / stored if stored else None
        )
        if path and path.exists():
            shape = (
                getattr(profile, "company_logo_shape", "RECTANGLE")
                if profile_logo_name
                else snapshot.get("company_logo_shape") or "RECTANGLE"
            )
            if shape == "ROUND":
                source = PILImage.open(path).convert("RGBA")
                fitted = ImageOps.fit(
                    source,
                    (600, 600),
                    method=PILImage.Resampling.LANCZOS,
                )
                mask = PILImage.new("L", (600, 600), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 599, 599), fill=255)
                circular = PILImage.new("RGBA", (600, 600), (255, 255, 255, 0))
                circular.paste(fitted, (0, 0), mask)
                stream = BytesIO()
                circular.save(stream, format="PNG")
                stream.seek(0)
                return Image(stream, width=18*mm, height=18*mm, mask="auto")
            return Image(str(path), width=29*mm, height=18*mm, kind="proportional")
    except (AttributeError, OSError, ValueError, TypeError, NotImplementedError):
        pass
    return None


def _contractor_context(user, snapshot=None):
    snapshot, profile = snapshot or {}, getattr(user, "contractor_profile", None)
    get = lambda key, fallback="": snapshot.get(key) or fallback
    return {
        "profile": profile,
        "logo": _logo(profile, snapshot),
        "logo_shape": (
            getattr(profile, "company_logo_shape", "RECTANGLE")
            if getattr(getattr(profile, "company_logo", None), "name", "")
            else snapshot.get("company_logo_shape") or "RECTANGLE"
        ),
        "company": get("company_name", getattr(profile, "company_name", "") or user.get_full_name() or "Contractor"),
        "tagline": get("tagline", getattr(profile, "tagline", "")),
        "address": get("office_address", getattr(profile, "office_address", "")),
        "mobile": get("mobile", getattr(user, "mobile", "")),
        "email": get("email", getattr(user, "email", "")),
        "website": get("website", getattr(profile, "website", "")),
        "gst": get("gst_number", getattr(profile, "gst_number", "")),
        "contractor_id": get("bharath_id", getattr(user, "bharath_id", "")),
        "owner": get("owner_name", getattr(profile, "owner_name", "") or user.get_full_name()),
        "bank_name": getattr(profile, "bank_account_name", "") if profile else "",
        "bank_number": getattr(profile, "bank_account_number", "") if profile else "",
        "ifsc": getattr(profile, "bank_ifsc", "") if profile else "",
        "upi": getattr(profile, "upi_id", "") if profile else "",
    }


def _header(context, title, metadata, s, center_title=False):
    details = [Paragraph(_text(v), s["small"]) for v in (context["tagline"], context["address"]) if v]
    gst = context["gst"]
    mobile = context["mobile"]
    same_mobile_and_gst = bool(gst and mobile and str(gst).strip() == str(mobile).strip())
    contact = _joined([f"Mobile: {mobile}" if mobile and not same_mobile_and_gst else "", f"Email: {context['email']}" if context["email"] else "", context["website"]], "  |  ")
    registration = _joined([f"Mobile / GSTIN: {gst}" if same_mobile_and_gst else f"GSTIN: {gst}" if gst else "", f"Contractor ID: {context['contractor_id']}" if context["contractor_id"] else ""], "  |  ")
    if contact: details.append(Paragraph(_text(contact), s["small"]))
    if registration: details.append(Paragraph(_text(registration), s["small"]))
    company_block = [Paragraph(_text(context["company"]), s["company"]), *details]
    logo_width = (22*mm if context["logo_shape"] == "ROUND" else 32*mm) if context["logo"] else 0
    company_width = 100*mm - logo_width
    company_table = Table([[line] for line in company_block], colWidths=[company_width], hAlign="LEFT")
    company_table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    brand = company_table
    if context["logo"]:
        brand = Table([[context["logo"], company_table]], colWidths=[logo_width, company_width], hAlign="LEFT", style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (0, 0), "LEFT"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    meta_rows = [[Paragraph(_text(label).upper(), s["label"]), Paragraph(_text(value), s["right"])] for label, value in metadata if value]
    meta = Table(meta_rows, colWidths=[29*mm, 49*mm], style=TableStyle([("LINEBELOW", (0, 0), (-1, -2), .35, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("PADDING", (0, 0), (-1, -1), 3)]))
    if center_title:
        document_title = ParagraphStyle("bp-document-title", parent=s["title"], fontSize=20, leading=23, alignment=TA_RIGHT)
        meta_box = Table(meta_rows, colWidths=[29*mm, 46*mm], style=TableStyle([
            ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .35, LINE),
            ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("TEXTCOLOR", (0, 0), (0, -1), BLUE_DARK),
            ("FONTNAME", (0, 0), (0, -1), FONT_BOLD), ("FONTSIZE", (0, 0), (-1, -1), 7.4),
            ("ALIGN", (0, 0), (0, -1), "RIGHT"), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        right_block = Table([[Paragraph(title, document_title)], [meta_box]], colWidths=[75*mm])
        right_block.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        top = Table([[brand, right_block]], colWidths=[100*mm, 80*mm])
        top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 1.8, BLUE), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
        return top
    title_meta = Table([[Paragraph(title, s["title"])], [meta]], colWidths=[80*mm])
    title_meta.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (0, 0), 2), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    top = Table([[brand, title_meta]], colWidths=[100*mm, 80*mm])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 1.7, BLUE), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return top


def _info_card(title, lines, s, background=True, border=True, first_style=None, detail_style=None, title_style=None, padding=7):
    contents = [Paragraph(title.upper(), title_style or s["label"])]
    first_style = first_style or s["bold"]
    detail_style = detail_style or s["body"]
    for index, line in enumerate(line for line in lines if line):
        contents.append(Paragraph(_text(line), first_style if index == 0 else detail_style))
    commands = [("LEFTPADDING", (0, 0), (-1, -1), padding), ("RIGHTPADDING", (0, 0), (-1, -1), padding), ("TOPPADDING", (0, 0), (-1, -1), padding), ("BOTTOMPADDING", (0, 0), (-1, -1), padding), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    return Table([[contents]], colWidths=[89*mm], hAlign="LEFT", style=TableStyle(commands))


def _cards(left, right):
    return Table([[left, right]], colWidths=[89*mm, 89*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .5, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, BLUE),
        ("LINEBEFORE", (1, 0), (1, -1), 2.5, BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))


def _data_table(rows, widths, numeric_from=None, font_size=7.2, emphasis_columns=None):
    table = Table(rows, colWidths=widths, repeatRows=1, splitByRow=1)
    commands = [("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD), ("FONTNAME", (0, 1), (-1, -1), FONT), ("GRID", (0, 0), (-1, -1), .4, LINE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PANEL]), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("FONTSIZE", (0, 0), (-1, -1), font_size), ("LEADING", (0, 0), (-1, -1), font_size + 2), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]
    for column in emphasis_columns or []:
        commands.extend([
            ("FONTSIZE", (column, 0), (column, -1), font_size + .9),
            ("LEADING", (column, 0), (column, -1), font_size + 2.9),
        ])
    if numeric_from is not None: commands.append(("ALIGN", (numeric_from, 1), (-1, -1), "RIGHT"))
    table.setStyle(TableStyle(commands))
    return table


def _summary_cards(values, s):
    cells = [[Paragraph(label.upper(), s["label"]), Paragraph(value, ParagraphStyle(f"summary-{index}", parent=s["bold"], fontSize=10, textColor=BLUE_DARK))] for index, (label, value) in enumerate(values)]
    return Table([cells], colWidths=[180*mm/len(cells)]*len(cells), style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLUE_PALE), ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, LINE), ("PADDING", (0, 0), (-1, -1), 6)]))


def _section(title, body, s):
    if not body: return []
    return [CondPageBreak(28*mm), _detail_card(title, body, s)]


def _detail_card(title, body, s, width=180*mm):
    if not body:
        return None
    clean_lines = [
        _text(line).strip()
        for line in str(body).replace("\r", "").split("\n")
        if _text(line).strip()
    ]
    content = "<br/>".join(clean_lines) or "-"
    title_text = Paragraph(
        f'<font color="#FFFFFF"><b>{_text(title).upper()}</b></font>',
        s["label"],
    )
    body_text = Paragraph(content, s["body"])
    card = Table(
        [[title_text], [body_text]],
        colWidths=[width],
        hAlign="LEFT",
    )
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("LINEBEFORE", (0, 1), (0, -1), 3, BLUE),
        ("LEFTPADDING", (0, 0), (-1, 0), 8),
        ("RIGHTPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("LEFTPADDING", (0, 1), (-1, -1), 10),
        ("RIGHTPADDING", (0, 1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return card


def _quotation_detail_cards(quotation, product_details, s):
    flowables = [Spacer(1, 5*mm)]
    compact = [
        ("Work duration", quotation.work_duration),
        ("Payment schedule", quotation.payment_terms),
    ]
    compact = [(title, body) for title, body in compact if body]
    if compact:
        if len(compact) == 2:
            cards = [
                _detail_card(title, body, s, 86.5*mm)
                for title, body in compact
            ]
            row = Table(
                [cards],
                colWidths=[88.5*mm, 88.5*mm],
                hAlign="LEFT",
            )
            row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            flowables.extend([KeepTogether(row), Spacer(1, 3*mm)])
        else:
            flowables.extend([
                KeepTogether(_detail_card(compact[0][0], compact[0][1], s)),
                Spacer(1, 3*mm),
            ])
    for title, body in [
        ("Scope of work", quotation.work_procedures),
        ("Product details / warranty", product_details),
        ("Terms & conditions", quotation.terms_conditions),
        ("Notes", quotation.notes),
    ]:
        card = _detail_card(title, body, s)
        if card:
            flowables.extend([CondPageBreak(26*mm), KeepTogether(card), Spacer(1, 3*mm)])
    return flowables


def _footer(canvas, document, company):
    canvas.saveState(); width, height = canvas._pagesize
    canvas.setFillColor(BLUE)
    canvas.rect(0, height-2.2*mm, width, 2.2*mm, fill=1, stroke=0)
    canvas.setStrokeColor(LINE); canvas.line(15*mm, 10*mm, width-15*mm, 10*mm)
    canvas.setFont(FONT, 6.8); canvas.setFillColor(SLATE)
    canvas.drawString(15*mm, 6.4*mm, company); canvas.drawCentredString(width/2, 6.4*mm, "Powered by Bharath Painters"); canvas.drawRightString(width-15*mm, 6.4*mm, f"Page {document.page}")
    canvas.restoreState()


def _doc(buffer, title, top_margin=12*mm):
    return SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=top_margin, bottomMargin=15*mm, title=title, author="Bharath Painters")


def _quotation_pdf_header(context, quotation, s):
    contact_style = ParagraphStyle("bp-quotation-contact", parent=s["small"], alignment=TA_RIGHT, leading=9.4)
    logo_width = (22*mm if context["logo_shape"] == "ROUND" else 32*mm) if context["logo"] else 0
    brand_width = 100*mm - logo_width
    brand_lines = [Paragraph(_text(context["company"]), s["company"])]
    if context["tagline"]:
        brand_lines.append(Paragraph(_text(context["tagline"]), s["small"]))
    if context["contractor_id"]:
        brand_lines.append(Paragraph(f"Contractor ID: {_text(context['contractor_id'])}", s["small"]))
    brand_text = Table([[line] for line in brand_lines], colWidths=[brand_width], hAlign="LEFT", style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    brand = brand_text
    if context["logo"]:
        brand = Table([[context["logo"], brand_text]], colWidths=[logo_width, brand_width], hAlign="LEFT", style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))

    contact_lines = [context["address"], f"Mobile: {context['mobile']}" if context["mobile"] else "", f"Email: {context['email']}" if context["email"] else "", f"GSTIN: {context['gst']}" if context["gst"] else "", context["website"]]
    contact_content = [Paragraph(_text(line), contact_style) for line in contact_lines if line] or [Paragraph("", contact_style)]
    contact = Table([[line] for line in contact_content], colWidths=[80*mm], hAlign="RIGHT", style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    top = Table([[brand, contact]], colWidths=[100*mm, 80*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 1.5, BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    status = quotation.get_status_display() if hasattr(quotation, "get_status_display") else str(quotation.status).replace("_", " ")
    title = ParagraphStyle("bp-quotation-document-title", parent=s["title"], fontSize=19, leading=21, alignment=0)
    quote_number = ParagraphStyle("bp-quotation-document-number", parent=s["bold"], fontSize=16, leading=18, textColor=BLUE_DARK)
    descriptor = ParagraphStyle("bp-quotation-document-descriptor", parent=s["small"], fontSize=7.1, leading=9)
    document_info = [Paragraph("QUOTATION", title), Paragraph(_text(quotation.quotation_number), quote_number)]
    document_info.append(Paragraph(f"Version {quotation.version_number or 1}  |  Created {quotation.quotation_date}  |  Valid until {quotation.valid_until or 'not specified'}", descriptor))
    document_block = Table([[item] for item in document_info], colWidths=[100*mm], hAlign="LEFT", style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    status_style = ParagraphStyle("bp-quotation-status", parent=s["bold"], fontSize=8, alignment=TA_RIGHT, textColor=BLUE_DARK)
    metadata = [[Paragraph("STATUS", s["label"]), Paragraph(_text(status.upper()), status_style)]]
    metadata_box = Table(metadata, colWidths=[24*mm, 53*mm], hAlign="RIGHT", style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [top, Spacer(1, 3*mm), Table([[document_block, metadata_box]], colWidths=[100*mm, 80*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))]


def _quotation_display_sections(quotation, product_details, context, s):
    def detail_content(title, body):
        return Table([[Paragraph(f'<font color="#FFFFFF"><b>{_text(title).upper()}</b></font>', s["label"])], [Paragraph(_text(body or "-").replace("\n", "<br/>"), s["body"])]], colWidths=[87*mm], hAlign="LEFT", style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("LEFTPADDING", (0, 0), (-1, 0), 8),
            ("RIGHTPADDING", (0, 0), (-1, 0), 8), ("TOPPADDING", (0, 0), (-1, 0), 5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5), ("LEFTPADDING", (0, 1), (-1, -1), 9),
            ("RIGHTPADDING", (0, 1), (-1, -1), 9), ("TOPPADDING", (0, 1), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
    notes_terms = Table([[detail_content("Notes", quotation.notes or "No notes"), detail_content("Terms and conditions", quotation.terms_conditions or "No terms added")]], colWidths=[90*mm, 90*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .5, LINE),
        ("LINEBEFORE", (0, 0), (-1, -1), 2.5, BLUE), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    values = [
        ("Prepared by", quotation.prepared_by or context["owner"] or "-"),
        ("Inspected by", quotation.inspected_by or context["owner"] or "-"),
        ("Work duration", quotation.work_duration or "-"),
        ("Payment terms", quotation.payment_terms or "-"),
        ("Product details", product_details or quotation.product_details or "-"),
        ("Work procedures and safety", quotation.work_procedures or "-"),
    ]
    label_style = ParagraphStyle("bp-quotation-field-label", parent=s["label"], fontSize=6.5, leading=8)
    value_style = ParagraphStyle("bp-quotation-field-value", parent=s["body"], fontSize=7.5, leading=9.5)
    field_cells = []
    for label, value in values:
        field_cells.append(Table([[Paragraph(_text(label).upper(), label_style)], [Paragraph(_text(value).replace("\n", "<br/>"), value_style)]], colWidths=[87*mm], style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])))
    detail_rows = [[field_cells[index], field_cells[index + 1]] for index in range(0, len(field_cells), 2)]
    detail_grid = Table(detail_rows, colWidths=[87*mm, 87*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("INNERGRID", (0, 0), (-1, -1), .4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    title = Paragraph("WORK AND PAYMENT DETAILS", s["label_inverse"])
    work_card = Table([[title], [detail_grid]], colWidths=[180*mm], hAlign="LEFT", style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("LEFTPADDING", (0, 0), (-1, 0), 8),
        ("RIGHTPADDING", (0, 0), (-1, 0), 8), ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5), ("LEFTPADDING", (0, 1), (-1, -1), 3),
        ("RIGHTPADDING", (0, 1), (-1, -1), 3), ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return [Spacer(1, 4*mm), notes_terms, Spacer(1, 4*mm), work_card]


def build_quotation_pdf(quotation):
    buffer, s = BytesIO(), _styles()
    context = _contractor_context(quotation.contractor, quotation.contractor_snapshot or {})
    doc = _doc(buffer, quotation.quotation_number, top_margin=8*mm)
    customer, prop, property_obj = quotation.customer_snapshot or {}, quotation.property_snapshot or {}, quotation.property
    property_name = prop.get("name") or property_obj.name or property_obj.get_property_type_display()
    address = _joined([prop.get("flat_number"), prop.get("block_name"), prop.get("address") or property_obj.address, prop.get("city") or property_obj.city, prop.get("pincode") or property_obj.pincode])
    customer_id = customer.get("bharath_id") or quotation.customer.bharath_id
    customer_gst = customer.get("gst_number") or getattr(quotation.customer, "gst_number", "")
    customer_mobile = customer.get("mobile") or quotation.customer.mobile
    if str(customer_mobile or "").strip() == str(context["mobile"] or "").strip():
        customer_mobile = ""
    customer_details = [customer.get("name") or quotation.customer.name, f"Customer ID: {customer_id}" if customer_id else "", customer_mobile, f"GSTIN: {customer_gst}" if customer_gst else ""]
    property_details = [property_name, property_obj.get_property_type_display(), address]
    story = _quotation_pdf_header(context, quotation, s)
    story += [Spacer(1, 3*mm), _cards(
        _info_card("Customer", customer_details, s, first_style=s["bold"], padding=9),
        _info_card("Property details", property_details, s, first_style=s["bold"], padding=9),
    )]
    story += [Spacer(1, 4*mm), Paragraph("QUOTATION SPECIFICATION &amp; ESTIMATE", s["section"])]
    rows = [["Sl.", "Type of service", "Room / Area", "Product description", "Product / Brand", "Qty / MOU", "Coats", "Rate / Amount"]]
    numeric_cell = ParagraphStyle("bp-quotation-number", parent=s["body"], fontSize=7, leading=8.6, alignment=TA_RIGHT)
    rate_amount_cell = ParagraphStyle("bp-quotation-rate-amount", parent=s["body"], fontSize=6.8, leading=8.5, alignment=TA_RIGHT)
    product_style = ParagraphStyle("bp-quotation-product", parent=s["body"], fontSize=7, leading=8.6, textColor=BLUE_DARK)
    for serial, item in enumerate(quotation.items.select_related("room", "service_type", "paint_type", "paint_brand", "unit").all(), 1):
        category = item.service_category_name_snapshot or item.custom_service_category or (item.service_category.name if item.service_category else "")
        service = item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type else "")
        room = item.room.name if item.room else ""
        product = item.product_type_name_snapshot or item.custom_product_type or (item.paint_type.name if item.paint_type else "")
        brand = item.brand_name_snapshot or item.custom_brand or (item.paint_brand.name if item.paint_brand else "")
        unit = item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else "")
        service_value = _joined([category, service], " / ")
        product_brand = Paragraph(f"{_text(product) or '-'}<br/><font color=\"#64748B\" size=6.2>{_text(brand)}</font>", product_style)
        quantity_value = Paragraph(f"{_text(_indian_number(item.quantity, 2))}<br/><font color=\"#64748B\" size=6.2>{_text(unit) or '-'}</font>", numeric_cell)
        coats = str(item.coats) if item.coats not in (None, "") else ""
        coat_value = "-" if item.is_additional_service or not coats else coats
        rate_amount = Paragraph(f"{_text(money(item.rate))}<br/><b>{_text(money(item.amount))}</b>", rate_amount_cell)
        rows.append([str(serial), Paragraph(_text(service_value) or "-", s["body"]), Paragraph(_text(room) or "-", s["body"]), Paragraph(_text(item.description) or "-", s["body"]), product_brand, quantity_value, Paragraph(_text(coat_value), numeric_cell), rate_amount])
    quotation_table = _data_table(rows, [7*mm, 26*mm, 23*mm, 41*mm, 34*mm, 20*mm, 12*mm, 17*mm], numeric_from=5, font_size=6.6, emphasis_columns=[5, 7])
    quotation_table.setStyle(TableStyle([("ALIGN", (0, 1), (0, -1), "CENTER"), ("ALIGN", (6, 1), (6, -1), "CENTER")]))
    story.append(quotation_table)
    totals = [["Subtotal", money(quotation.subtotal)]]
    if quotation.discount: totals.append(["Discount", f"- {money(quotation.discount)}"])
    if quotation.gst_amount: totals.append([f"GST ({quantity(quotation.gst_percentage)}%)", money(quotation.gst_amount)])
    totals.append(["QUOTATION TOTAL", money(quotation.grand_total)])
    total_table = Table(totals, colWidths=[42*mm, 35*mm], hAlign="RIGHT")
    total_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (0, -2), PANEL), ("BACKGROUND", (0, -1), (-1, -1), BLUE_DARK), ("TEXTCOLOR", (0, -1), (-1, -1), colors.white), ("FONTNAME", (0, 0), (-1, -1), FONT_BOLD), ("FONTSIZE", (0, -1), (-1, -1), 9.2), ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("PADDING", (0, 0), (-1, -1), 6)]))
    amount_words = _amount_words(quotation.grand_total)
    words_card = Table([[Paragraph("TOTAL IN WORDS", s["label"])], [Paragraph(f'<i>"{_text(amount_words)} Indian Rupees Only"</i>', s["body"])]], colWidths=[88*mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    totals_row = Table([[words_card, total_table]], colWidths=[95*mm, 80*mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [Spacer(1, 3*mm), totals_row]
    story += _quotation_display_sections(
        quotation,
        consolidated_product_details(quotation),
        context,
        s,
    )
    inspected = quotation.inspected_by or context["owner"]
    signature = Table([[Paragraph("CUSTOMER", s["label_inverse"]), Paragraph("INSPECTED BY", s["label_inverse"]), Paragraph("AUTHORIZED SIGNATURE", s["label_inverse"])], [Paragraph(_text(customer.get("name") or quotation.customer.name), s["body"]), Paragraph(_text(inspected), s["body"]), Paragraph(_text(context["company"]), s["body"])]], colWidths=[60*mm]*3)
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("TOPPADDING", (0, 1), (-1, 1), 11), ("BOTTOMPADDING", (0, 1), (-1, 1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7)]))
    story += [Spacer(1, 5*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _footer(c,d,context["company"]), onLaterPages=lambda c,d: _footer(c,d,context["company"]))
    return buffer.getvalue()


def _payment_qr(upi_id, company):
    if not upi_id: return None
    try:
        import qrcode
        image, stream = qrcode.make(f"upi://pay?pa={upi_id}&pn={company}"), BytesIO()
        image.save(stream, format="PNG"); stream.seek(0)
        return Image(stream, width=27*mm, height=27*mm)
    except Exception:
        return None


def build_invoice_pdf(invoice):
    buffer, s = BytesIO(), _styles()
    context = _contractor_context(invoice.contractor, invoice.contractor_snapshot or {})
    doc, quotation = _doc(buffer, invoice.invoice_number), invoice.quotation
    property_obj = quotation.property if quotation else invoice.site_property
    property_address = invoice.billing_address or _joined([
        getattr(property_obj, "address", ""), getattr(property_obj, "city", ""), getattr(property_obj, "pincode", "")
    ])
    tax_invoice = invoice.tax_mode == "GST"
    source_number = invoice.quotation_number_snapshot or (quotation.quotation_number if quotation else "Lump sum")
    property_type = property_obj.get_property_type_display() if property_obj else "Direct invoice"
    property_label = invoice.property_name or (property_obj.name if property_obj else "") or property_type
    story = [
        _header(context, "TAX INVOICE" if tax_invoice else "INVOICE", [("Invoice No.", invoice.invoice_number), ("Invoice Date", invoice.invoice_date), ("Source", source_number), ("Project Ref.", property_label)], s, center_title=True),
        Spacer(1, 4*mm),
        _cards(_info_card("Bill to", [invoice.customer_name, invoice.customer_mobile, property_address], s), _info_card("Property details", [property_label, property_type, property_address], s)),
        Spacer(1, 5*mm), Paragraph("INVOICE ITEMS", s["section"]),
    ]
    rows = [["Sl.", "Description", "Product / Brand", "HSN/SAC", "Qty / Area", "Rate", "Amount"]]
    for serial, row in enumerate(invoice.items or [], 1):
        coats = row.get("coats")
        coat_label = f"{coats} coat{'s' if str(coats) != '1' else ''}" if coats not in (None, "", "-") else ""
        service = _joined([row.get("category"), row.get("service")], " / ")
        description = _joined([service, row.get("room"), row.get("description"), coat_label], " - ")
        product = _joined([row.get("product_type"), row.get("brand")], " / ")
        qty = f"{quantity(row.get('quantity'))} {row.get('unit') or ''}".strip()
        rows.append([str(serial), Paragraph(_text(description), s["body"]), Paragraph(_text(product), s["body"]), _text(row.get("hsn_sac")), qty, money(row.get("rate")), money(row.get("amount"))])
    story.append(_data_table(rows, [8*mm, 53*mm, 34*mm, 18*mm, 22*mm, 20*mm, 25*mm], numeric_from=4))
    taxable = invoice.subtotal - invoice.discount
    totals = [["Subtotal", money(invoice.subtotal)]]
    if invoice.discount: totals.append(["Discount", f"- {money(invoice.discount)}"])
    totals.append(["Taxable Amount", money(taxable)])
    if invoice.gst_amount: totals.append([f"GST ({quantity(invoice.gst_percentage)}%)", money(invoice.gst_amount)])
    totals.append(["INVOICE TOTAL", money(invoice.grand_total)])
    total_table = Table(totals, colWidths=[43*mm, 37*mm], hAlign="RIGHT")
    total_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (0, -2), PANEL), ("BACKGROUND", (0, -1), (-1, -1), BLUE_DARK), ("TEXTCOLOR", (0, -1), (-1, -1), colors.white), ("FONTNAME", (0, 0), (-1, -1), FONT_BOLD), ("FONTSIZE", (0, -1), (-1, -1), 9.2), ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("PADDING", (0, 0), (-1, -1), 6)]))
    amount_words = _amount_words(invoice.grand_total)
    words_card = Table([[Paragraph("TOTAL IN WORDS", s["label"])], [Paragraph(f'<i>"{_text(amount_words)} Indian Rupees Only"</i>', s["body"])]], colWidths=[88*mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    totals_row = Table([[words_card, total_table]], colWidths=[95*mm, 80*mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [Spacer(1, 3*mm), totals_row]
    bank_lines = [f"Account name: {context['bank_name']}" if context["bank_name"] else "", f"Account number: {context['bank_number']}" if context["bank_number"] else "", f"IFSC: {context['ifsc']}" if context["ifsc"] else "", f"UPI: {context['upi']}" if context["upi"] else ""]
    bank_lines = [line for line in bank_lines if line]
    if bank_lines:
        qr = _payment_qr(context["upi"], context["company"])
        bank_title = Paragraph("BANK &amp; PAYMENT DETAILS", s["label_inverse"])
        bank_body = Paragraph("<br/>".join(_text(x) for x in bank_lines), s["body"])
        bank_content = Table([[bank_title], [bank_body]], colWidths=[137*mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("BACKGROUND", (0, 1), (-1, -1), colors.white), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 0), (-1, 0), 5), ("TOPPADDING", (0, 1), (-1, -1), 7), ("BOTTOMPADDING", (0, 1), (-1, -1), 7)]))
        bank = Table([[bank_content, qr or ""]], colWidths=[145*mm, 35*mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("BOX", (0, 0), (-1, -1), .6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
        story += [Spacer(1, 4*mm), KeepTogether(bank)]
    story += _section("Terms & conditions", invoice.terms_conditions, s)
    story += _section("Notes", invoice.notes, s)
    signature = Table([[Paragraph("AUTHORIZED SIGNATURE", s["label_inverse"])], [Paragraph(_text(context["company"]), s["body"])]], colWidths=[65*mm], hAlign="RIGHT")
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("TOPPADDING", (0, 1), (-1, 1), 13), ("BOTTOMPADDING", (0, 1), (-1, 1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    story += [Spacer(1, 5*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _footer(c,d,context["company"]), onLaterPages=lambda c,d: _footer(c,d,context["company"]))
    return buffer.getvalue()


def build_measurement_pdf(property_obj, measurement_record=None):
    buffer, s = BytesIO(), _styles()
    contractor = (measurement_record.contractor if measurement_record else None) or property_obj.contractor or property_obj.customer.contractor
    context = _contractor_context(contractor, {})
    reference = measurement_record.reference_no if measurement_record else f"PROPERTY-{property_obj.id}"
    measured_on = measurement_record.measured_on if measurement_record else property_obj.updated_at.date()
    doc = _doc(buffer, reference)
    surface_scope, room_scope = property_obj.measurement_surfaces.all(), property_obj.rooms.all()
    if measurement_record:
        surface_scope = surface_scope.filter(measurement_record=measurement_record)
        room_scope = room_scope.filter(measurement_record=measurement_record)
    surfaces = list(surface_scope.select_related("room").prefetch_related("openings"))
    wall = sum((x.net_area for x in surfaces if x.surface_type == "WALL"), Decimal("0"))
    ceiling = sum((x.net_area for x in surfaces if x.surface_type == "CEILING"), Decimal("0"))
    window_surfaces = [x for x in surfaces if x.surface_type == "WINDOW"]
    door_surfaces = [x for x in surfaces if x.surface_type == "DOOR"]
    other = sum((x.net_area for x in surfaces if x.surface_type not in {"WALL", "CEILING", "WINDOW", "DOOR"}), Decimal("0"))
    openings = [opening for surface in surfaces for opening in surface.openings.all()]

    def distinct_opening_total(candidate_surfaces, candidate_openings, opening_type, surface_type):
        typed_openings = [x for x in candidate_openings if x.opening_type == opening_type]
        total_area = sum((property_obj.area_to_sqft(x.quantity * x.width * x.height) for x in typed_openings), Decimal("0"))
        total_quantity = sum((Decimal(x.quantity) for x in typed_openings), Decimal("0"))
        for surface in (x for x in candidate_surfaces if x.surface_type == surface_type):
            duplicate = any(
                opening.surface.room_id == surface.room_id
                and opening.quantity == surface.quantity
                and {opening.height, opening.width} == {surface.length, surface.breadth}
                for opening in typed_openings
            )
            if not duplicate:
                total_area += surface.gross_area
                total_quantity += Decimal(surface.quantity)
        return total_area, total_quantity

    window_area, window_quantity = distinct_opening_total(surfaces, openings, "WINDOW", "WINDOW")
    door_area, door_quantity = distinct_opening_total(surfaces, openings, "DOOR", "DOOR")
    address = _joined([property_obj.flat_number, property_obj.block_name, property_obj.address, property_obj.city, property_obj.pincode])
    story = [
        _header(context, "AREA CALCULATION REPORT", [("Calculation No.", reference), ("Version", getattr(measurement_record, "version", "")), ("Calculation Date", measured_on)], s),
        Spacer(1, 4*mm),
        _cards(_info_card("Customer", [property_obj.customer.name, property_obj.customer.mobile], s), _info_card("Property", [property_obj.name or property_obj.get_property_type_display(), property_obj.get_property_type_display(), address], s)),
        Spacer(1, 4*mm),
        _summary_cards([("Net wall area", area(wall)), ("Net ceiling area", area(ceiling)), ("Other areas", area(other))], s),
        Spacer(1, 2.5*mm),
        _summary_cards([("Window area", area(window_area)), ("Window qty", quantity(window_quantity)), ("Door area", area(door_area)), ("Door qty", quantity(door_quantity))], s),
        Spacer(1, 4*mm),
    ]
    rooms = list(room_scope.select_related("room_type"))
    groups = [(room.name, [x for x in surfaces if x.room_id == room.id]) for room in rooms]
    unassigned = [x for x in surfaces if not x.room_id]
    if unassigned: groups.append((property_obj.name or "General area", unassigned))

    def room_values(room_surfaces):
        wall_surfaces = [x for x in room_surfaces if x.surface_type == "WALL"]
        ceiling_surfaces = [x for x in room_surfaces if x.surface_type == "CEILING"]
        other_surfaces = [
            x for x in room_surfaces
            if x.surface_type not in {"WALL", "CEILING"} and x.name != "__ROOM_ADJUSTMENTS__"
        ]
        surface_groups = {}
        for surface in other_surfaces:
            category = (
                (surface.area_group_name or surface.name or "Other").strip()
                if surface.surface_type == "OTHER"
                else surface.get_surface_type_display().replace("Paintable ", "")
            )
            surface_groups.setdefault(category, []).append(surface)
        room_openings = [opening for surface in room_surfaces for opening in surface.openings.all()]
        wall_openings = [opening for surface in wall_surfaces for opening in surface.openings.all()]
        ceiling_openings = [opening for surface in ceiling_surfaces for opening in surface.openings.all()]
        door_total, _ = distinct_opening_total(room_surfaces, room_openings, "DOOR", "DOOR")
        window_total, _ = distinct_opening_total(room_surfaces, room_openings, "WINDOW", "WINDOW")
        return {
            "walls": wall_surfaces,
            "ceilings": ceiling_surfaces,
            "other_surfaces": other_surfaces,
            "surface_groups": surface_groups,
            "openings": room_openings,
            "wall_gross": sum((x.gross_area for x in wall_surfaces), Decimal("0")),
            "wall_deductions": sum((x.deduction_area for x in wall_surfaces), Decimal("0")),
            "wall_additions": sum((x.addition_area for x in wall_surfaces), Decimal("0")),
            "net_walls": sum((x.net_area for x in wall_surfaces), Decimal("0")),
            "ceiling_gross": sum((x.gross_area for x in ceiling_surfaces), Decimal("0")),
            "ceiling_deductions": sum((x.effective_deduction for x in ceiling_openings if x.effect == "DEDUCT"), Decimal("0")),
            "ceiling_additions": sum((x.area for x in ceiling_openings if x.effect == "ADD"), Decimal("0")),
            "net_ceiling": sum((x.net_area for x in ceiling_surfaces), Decimal("0")),
            "other_area": sum((x.net_area for x in other_surfaces), Decimal("0")),
            "doors": door_total,
            "windows": window_total,
        }

    populated_groups = [(name, room_surfaces, room_values(room_surfaces)) for name, room_surfaces in groups if room_surfaces]
    wall_groups = [group for group in populated_groups if any(group[2][key] for key in ("wall_gross", "doors", "windows", "wall_deductions", "wall_additions", "net_walls"))]
    ceiling_groups = [group for group in populated_groups if any(group[2][key] for key in ("ceiling_gross", "ceiling_deductions", "ceiling_additions", "net_ceiling"))]
    wall_rows = [["Room / Area", "Walls", "Doors", "Windows", "Deductions", "Additions", "Net Walls"]]
    ceiling_rows = [["Room / Area", "Ceiling", "Deductions", "Additions", "Net Ceiling"]]
    surface_rows = [["Room / Area", "Category", "Lines", "Gross", "Deductions", "Additions", "Net Area"]]
    for room_name, _, values in wall_groups:
        wall_rows.append([Paragraph(_text(room_name), s["body"]), area(values["wall_gross"]), area(values["doors"]), area(values["windows"]), area(values["wall_deductions"]), area(values["wall_additions"]), area(values["net_walls"])])
    for room_name, _, values in ceiling_groups:
        ceiling_rows.append([Paragraph(_text(room_name), s["body"]), area(values["ceiling_gross"]), area(values["ceiling_deductions"]), area(values["ceiling_additions"]), area(values["net_ceiling"])])
    for room_name, _, values in populated_groups:
        for category, grouped_surfaces in values["surface_groups"].items():
            surface_rows.append([
                Paragraph(_text(room_name), s["bold"]),
                Paragraph(_text(category), s["body"]),
                str(len(grouped_surfaces)),
                area(sum((surface.gross_area for surface in grouped_surfaces), Decimal("0"))),
                area(sum((surface.deduction_area for surface in grouped_surfaces), Decimal("0"))),
                area(sum((surface.addition_area for surface in grouped_surfaces), Decimal("0"))),
                area(sum((surface.net_area for surface in grouped_surfaces), Decimal("0"))),
            ])
    if len(wall_rows) > 1:
        wall_rows.append([
            Paragraph("ALL ROOMS TOTAL", s["bold"]),
            area(sum((x[2]["wall_gross"] for x in wall_groups), Decimal("0"))),
            area(sum((x[2]["doors"] for x in wall_groups), Decimal("0"))),
            area(sum((x[2]["windows"] for x in wall_groups), Decimal("0"))),
            area(sum((x[2]["wall_deductions"] for x in wall_groups), Decimal("0"))),
            area(sum((x[2]["wall_additions"] for x in wall_groups), Decimal("0"))),
            area(sum((x[2]["net_walls"] for x in wall_groups), Decimal("0"))),
        ])
        wall_table = _data_table(wall_rows, [38*mm, 24*mm, 22*mm, 22*mm, 26*mm, 24*mm, 24*mm], numeric_from=1, font_size=7.1)
        wall_table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), GREEN_PALE), ("FONTNAME", (0, -1), (-1, -1), FONT_BOLD)]))
        story.extend([Paragraph("WALL", s["section"]), wall_table, Spacer(1, 4*mm)])
    if len(ceiling_rows) > 1:
        ceiling_rows.append([
            Paragraph("ALL ROOMS TOTAL", s["bold"]),
            area(sum((x[2]["ceiling_gross"] for x in ceiling_groups), Decimal("0"))),
            area(sum((x[2]["ceiling_deductions"] for x in ceiling_groups), Decimal("0"))),
            area(sum((x[2]["ceiling_additions"] for x in ceiling_groups), Decimal("0"))),
            area(sum((x[2]["net_ceiling"] for x in ceiling_groups), Decimal("0"))),
        ])
        ceiling_table = _data_table(ceiling_rows, [48*mm, 33*mm, 33*mm, 33*mm, 33*mm], numeric_from=1, font_size=7.2)
        ceiling_table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), BLUE_PALE), ("FONTNAME", (0, -1), (-1, -1), FONT_BOLD)]))
        story.extend([Paragraph("CEILING", s["section"]), ceiling_table, Spacer(1, 5*mm)])
    if len(surface_rows) > 1:
        surface_rows.append([
            Paragraph("ALL ROOMS TOTAL", s["bold"]),
            "",
            "",
            area(sum((surface.gross_area for _, _, values in populated_groups for surface in values["other_surfaces"]), Decimal("0"))),
            area(sum((surface.deduction_area for _, _, values in populated_groups for surface in values["other_surfaces"]), Decimal("0"))),
            area(sum((surface.addition_area for _, _, values in populated_groups for surface in values["other_surfaces"]), Decimal("0"))),
            area(sum((x[2]["other_area"] for x in populated_groups), Decimal("0"))),
        ])
        surface_table = _data_table(surface_rows, [34*mm, 38*mm, 16*mm, 23*mm, 24*mm, 22*mm, 23*mm], numeric_from=2, font_size=7.0)
        surface_table.setStyle(TableStyle([
            ("BACKGROUND", (0, -1), (-1, -1), PURPLE_PALE),
            ("FONTNAME", (0, -1), (-1, -1), FONT_BOLD),
        ]))
        story.extend([Paragraph("SURFACES", s["section"]), surface_table, Spacer(1, 5*mm)])

    story.extend([Paragraph("AREA CALCULATION DETAILS", s["section"])])
    linear = property_obj.linear_unit_label
    for room_name, room_surfaces, values in populated_groups:
        rows = [["Category", "Name", "Height / Width", "Length / Width", "Qty", "Calculation", "Action", "Area"]]
        linked_surface_ids = {x.linked_surface_id for x in values["openings"] if x.linked_surface_id}
        opening_types = {x.opening_type for x in values["openings"]}
        for surface in room_surfaces:
            if surface.name == "__ROOM_ADJUSTMENTS__":
                continue
            if surface.id in linked_surface_ids:
                continue
            if surface.surface_type in {"WINDOW", "DOOR"} and surface.surface_type in opening_types:
                continue
            category = (
                surface.area_group_name or surface.name
                if surface.surface_type == "OTHER"
                else surface.get_surface_type_display().replace("Paintable ", "")
            )
            first_dimension = quantity(surface.length) if not surface.manual_area else ""
            second_dimension = quantity(surface.breadth) if not surface.manual_area else ""
            if surface.manual_area:
                calculation = f"Manual {quantity(surface.manual_area)} {property_obj.input_area_unit_label}"
            else:
                factors = [quantity(surface.length), quantity(surface.breadth)]
                if surface.quantity != 1:
                    factors.append(quantity(surface.quantity))
                if surface.paintable_sides != 1:
                    factors.append(f"{surface.paintable_sides} sides")
                calculation = " x ".join(factors)
            rows.append([category, Paragraph(_text(surface.name), s["body"]), first_dimension, second_dimension, str(surface.quantity), calculation, "Measured", area(surface.gross_area)])
        for opening in values["openings"]:
            measured_area = property_obj.area_to_sqft(opening.quantity * opening.width * opening.height)
            if opening.effect == "ADD":
                action = "Add"
            elif opening.deduction_mode == "IGNORE":
                action = "Reference"
            elif opening.deduction_mode == "PERCENTAGE":
                action = f"Deduct {quantity(opening.deduction_percentage)}%"
            else:
                action = "Deduct"
            calculation = f"{quantity(opening.height)} x {quantity(opening.width)}"
            if opening.quantity != 1:
                calculation += f" x {opening.quantity}"
            rows.append([opening.get_opening_type_display(), Paragraph(_text(opening.name), s["body"]), quantity(opening.height), quantity(opening.width), str(opening.quantity), calculation, action, area(measured_area)])
        totals = [
            ("Wall total", values["wall_gross"]),
            ("Door total", values["doors"]),
            ("Window total", values["windows"]),
            ("Wall deductions", values["wall_deductions"]),
            ("Wall additions", values["wall_additions"]),
            ("Net wall area", values["net_walls"]),
            ("Ceiling total", values["ceiling_gross"]),
            ("Ceiling deductions", values["ceiling_deductions"]),
            ("Ceiling additions", values["ceiling_additions"]),
            ("Net ceiling area", values["net_ceiling"]),
            ("Other surfaces", values["other_area"]),
            ("Room total", values["net_walls"] + values["net_ceiling"] + values["other_area"]),
        ]
        total_row_indexes = []
        for label, value in totals:
            if not value:
                continue
            total_row_indexes.append(len(rows))
            rows.append([Paragraph(label, s["bold"]), "", "", "", "", "", "", area(value)])
        if len(rows) > 1:
            table = _data_table(rows, [20*mm, 24*mm, 22*mm, 22*mm, 12*mm, 38*mm, 20*mm, 22*mm], numeric_from=2, font_size=6.8)
            total_styles = []
            for row_index in total_row_indexes:
                total_styles.extend([("SPAN", (0, row_index), (6, row_index)), ("BACKGROUND", (0, row_index), (-1, row_index), GREEN_PALE), ("FONTNAME", (0, row_index), (-1, row_index), FONT_BOLD)])
            total_styles.extend([("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2)])
            table.setStyle(TableStyle(total_styles))
            story.append(KeepTogether([Paragraph(_text(room_name), s["section"]), table, Spacer(1, 2*mm)]))
    if measurement_record and measurement_record.notes: story += _section("Measurement remarks", measurement_record.notes, s)
    prepared = measurement_record.created_by.get_full_name() if measurement_record and measurement_record.created_by else context["owner"]
    signature = Table([[Paragraph("PREPARED BY", s["label"]), Paragraph("SIGNATURE", s["label"])], [Paragraph(_text(prepared), s["body"]), ""]], colWidths=[90*mm, 90*mm])
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, LINE), ("INNERGRID", (0, 0), (-1, -1), .5, LINE), ("BACKGROUND", (0, 0), (-1, 0), BLUE_PALE), ("TOPPADDING", (0, 1), (-1, 1), 12), ("BOTTOMPADDING", (0, 1), (-1, 1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    story += [Spacer(1, 4*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _footer(c,d,context["company"]), onLaterPages=lambda c,d: _footer(c,d,context["company"]))
    buffer.seek(0)
    return buffer
