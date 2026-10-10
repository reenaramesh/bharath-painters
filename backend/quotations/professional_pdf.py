"""Shared professional A4 PDF design for quotations, invoices and measurement reports."""

from .quotation_pdf_labels import quotation_room_area_label


from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
import re
from xml.sax.saxutils import escape

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import CondPageBreak, Flowable, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
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
QUOTATION_PDF_SECTION_KEYS = frozenset({
    "notes", "terms_conditions", "work_duration", "payment_terms",
    "product_details", "work_procedures", "company_name", "contractor_address",
    "contractor_contact", "contractor_registration", "quotation_metadata",
    "customer_details", "property_details", "quotation_items", "subtotal",
    "discount", "gst", "grand_total", "total_words", "prepared_signature",
    "authorized_signature", "footer_logo", "prepared_by", "inspected_by",
})
QUOTATION_PDF_DEFAULT_SECTION_KEYS = QUOTATION_PDF_SECTION_KEYS - {"prepared_by", "inspected_by"}

QUOTATION_COLOR_TEMPLATES = {
    "STUDIO": ("#142743", "#FF991F", "#B45A00"),
    "INDIGO": ("#25205C", "#7771E8", "#5147B3"),
    "FOREST": ("#153B32", "#D4A842", "#8A6417"),
    "CHARCOAL": ("#27313B", "#BD7959", "#8D4A32"),
    "COASTAL": ("#508398", "#C2C9CC"),
    "CORAL": ("#395F6E", "#FCB29B"),
    "MIST": ("#7B8285", "#D9EDF5"),
}


def _color_luminance(color):
    channels = [color.red, color.green, color.blue]
    linear = [channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4 for channel in channels]
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]


def _contrast_ratio(left, right):
    light, dark = sorted((_color_luminance(left), _color_luminance(right)), reverse=True)
    return (light + .05) / (dark + .05)


def _quotation_palette(profile):
    key = getattr(profile, "pdf_color_template", "STUDIO")
    if key == "CUSTOM":
        dark = getattr(profile, "pdf_custom_primary_color", "#142743")
        accent = getattr(profile, "pdf_custom_accent_color", "#FF991F")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", dark or "") or not re.fullmatch(r"#[0-9a-fA-F]{6}", accent or ""):
            dark, accent = QUOTATION_COLOR_TEMPLATES["STUDIO"][:2]
    else:
        dark, accent = QUOTATION_COLOR_TEMPLATES.get(key, QUOTATION_COLOR_TEMPLATES["STUDIO"])[:2]
    dark, accent = colors.HexColor(dark), colors.HexColor(accent)
    on_dark = max((colors.white, INK), key=lambda color: _contrast_ratio(color, dark))
    accent_on_dark = accent if _contrast_ratio(accent, dark) >= 4.5 else on_dark
    accent_text = accent
    while _contrast_ratio(accent_text, colors.white) < 4.5:
        accent_text = colors.Color(accent_text.red * .8, accent_text.green * .8, accent_text.blue * .8)
    text_hex = getattr(profile, "pdf_custom_text_color", "#172033")
    text_color = colors.HexColor(text_hex) if re.fullmatch(r"#[0-9a-fA-F]{6}", text_hex or "") else INK
    return {"dark": dark, "accent": accent, "accent_text": accent_text, "on_dark": on_dark, "accent_on_dark": accent_on_dark, "text": text_color}


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

PDF_FONT_FILES = {
    "CLASSIC": [
        (r"C:\Windows\Fonts\georgia.ttf", r"C:\Windows\Fonts\georgiab.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
    ],
    "CLEAN": [
        (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        ("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
    ],
    "COMPACT": [
        (r"C:\Windows\Fonts\tahoma.ttf", r"C:\Windows\Fonts\tahomabd.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"),
    ],
}


def _pdf_fonts(profile):
    key = getattr(profile, "pdf_font_template", "MODERN")
    if key == "MODERN":
        return FONT, FONT_BOLD
    for regular, bold in PDF_FONT_FILES.get(key, []):
        if Path(regular).exists() and Path(bold).exists():
            regular_name, bold_name = f"BP-{key}-Regular", f"BP-{key}-Bold"
            if regular_name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(regular_name, regular))
                pdfmetrics.registerFont(TTFont(bold_name, bold))
            return regular_name, bold_name
    return FONT, FONT_BOLD


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


def money(value, decimals=0):
    return f"{'₹' if HAS_RUPEE else 'Rs.'} {_indian_number(value, decimals)}"


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


def _styles(fonts=None, text_color=INK):
    regular, bold = fonts or (FONT, FONT_BOLD)
    sample = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("bp-body", parent=sample["BodyText"], fontName=regular, fontSize=9, leading=12, textColor=text_color),
        "small": ParagraphStyle("bp-small", parent=sample["BodyText"], fontName=regular, fontSize=7.6, leading=9.8, textColor=SLATE),
        "bold": ParagraphStyle("bp-bold", parent=sample["BodyText"], fontName=bold, fontSize=9, leading=12, textColor=text_color),
        "label": ParagraphStyle("bp-label", parent=sample["BodyText"], fontName=bold, fontSize=7, leading=8.8, textColor=BLUE, tracking=.6),
        "label_inverse": ParagraphStyle("bp-label-inverse", parent=sample["BodyText"], fontName=bold, fontSize=7, leading=8.8, textColor=colors.white, tracking=.6),
        "title": ParagraphStyle("bp-title", parent=sample["Title"], fontName=bold, fontSize=21, leading=24, textColor=BLUE_DARK),
        "title_center": ParagraphStyle("bp-title-center", parent=sample["Title"], fontName=bold, fontSize=21, leading=24, alignment=TA_CENTER, textColor=BLUE_DARK),
        "company": ParagraphStyle("bp-company", parent=sample["Heading2"], fontName=bold, fontSize=14, leading=17, textColor=text_color),
        "section": ParagraphStyle("bp-section", parent=sample["Heading3"], fontName=bold, fontSize=10.8, leading=14, textColor=text_color, spaceBefore=2*mm, spaceAfter=1.5*mm),
        "right": ParagraphStyle("bp-right", parent=sample["BodyText"], fontName=regular, fontSize=8.6, leading=10.8, alignment=TA_RIGHT, textColor=text_color),
    }


def _logo(profile, snapshot, prefer_profile=False):
    try:
        stored = snapshot.get("company_logo")
        profile_logo = getattr(profile, "company_logo", None) if profile else None
        profile_logo_name = getattr(profile_logo, "name", "")
        if not prefer_profile and "company_logo" in snapshot:
            profile_logo_name = ""
        path = (
            Path(profile_logo.path)
            if profile_logo_name
            else Path(settings.MEDIA_ROOT) / stored if stored and (not prefer_profile or profile is None) else None
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


def _contractor_context(user, snapshot=None, prefer_profile=False):
    snapshot, profile = snapshot or {}, getattr(user, "contractor_profile", None)
    def get(key, fallback=""):
        if prefer_profile and profile is not None:
            return getattr(profile, key, fallback)
        if not prefer_profile and key in snapshot:
            return snapshot[key]
        return snapshot.get(key) or fallback
    return {
        "profile": profile,
        "logo": _logo(profile, snapshot, prefer_profile=prefer_profile),
        "logo_shape": (
            getattr(profile, "company_logo_shape", "RECTANGLE")
            if (prefer_profile and profile is not None) or ("company_logo_shape" not in snapshot and getattr(getattr(profile, "company_logo", None), "name", ""))
            else snapshot.get("company_logo_shape") or "RECTANGLE"
        ),
        "company": get("company_name", getattr(profile, "company_name", "") or user.get_full_name() or "Contractor"),
        "tagline": get("tagline", getattr(profile, "tagline", "")),
        "address": get("office_address", getattr(profile, "office_address", "")),
        "mobile": user.mobile if prefer_profile else get("mobile", getattr(user, "mobile", "")),
        "email": user.email if prefer_profile else get("email", getattr(user, "email", "")),
        "website": get("website", getattr(profile, "website", "")),
        "gst": get("gst_number", getattr(profile, "gst_number", "")),
        "contractor_id": user.bharath_id if prefer_profile else get("bharath_id", getattr(user, "bharath_id", "")),
        "owner": get("owner_name", getattr(profile, "owner_name", "") or user.get_full_name()),
        "bank_name": getattr(profile, "bank_account_name", "") if profile else "",
        "bank_number": getattr(profile, "bank_account_number", "") if profile else "",
        "ifsc": getattr(profile, "bank_ifsc", "") if profile else "",
        "upi": getattr(profile, "upi_id", "") if profile else "",
    }


def _header(context, title, metadata, s, center_title=False, palette=None):
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
            ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("TEXTCOLOR", (0, 0), (0, -1), palette["dark"] if palette else BLUE_DARK),
            ("FONTNAME", (0, 0), (0, -1), s["bold"].fontName), ("FONTSIZE", (0, 0), (-1, -1), 7.4),
            ("ALIGN", (0, 0), (0, -1), "RIGHT"), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        right_block = Table([[Paragraph(title, document_title)], [meta_box]], colWidths=[75*mm])
        right_block.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        top = Table([[brand, right_block]], colWidths=[100*mm, 80*mm])
        top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 1.8, palette["accent"] if palette else BLUE), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
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


def _measurement_info_card(title, lines, s):
    values = [str(line).strip() for line in lines if line and str(line).strip()]
    body = "<br/>".join(
        f"<b>{_text(value)}</b>" if index == 0 else _text(value)
        for index, value in enumerate(values)
    ) or "-"
    compact_style = ParagraphStyle(
        f"bp-measurement-{title.lower()}-details",
        parent=s["body"], fontSize=8.5, leading=10.5, spaceAfter=0,
    )
    return Table(
        [[Paragraph(title.upper(), s["label"])], [Paragraph(body, compact_style)]],
        colWidths=[90*mm], hAlign="LEFT",
        style=TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
            ("TOPPADDING", (0, 1), (-1, 1), 0),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]),
    )


def _quotation_info_card(title, lines, s, accent_color=BLUE):
    title_style = ParagraphStyle("bp-quotation-info-title", parent=s["label"], fontSize=8.4, leading=9.5, spaceAfter=0, textColor=accent_color)
    detail_style = ParagraphStyle("bp-quotation-info-detail", parent=s["small"], fontSize=9.5, leading=11.5, spaceAfter=0)
    values = [str(line).strip() for line in lines if line and str(line).strip()]
    if values:
        details = [f'<b><font size="10.5" color="{s["bold"].textColor.hexval().replace("0x", "#")}">{_text(values[0])}</font></b>']
        details.extend(_text(line) for line in values[1:])
    else:
        details = ["-"]
    body = Paragraph("<br/>".join(details), detail_style)
    return _RoundedCardTable([[Paragraph(_text(title.upper()), title_style)], [body]], colWidths=[89*mm], minRowHeights=[19, 57], style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("TOPPADDING", (0, 1), (-1, -1), 0), ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))


class _RoundedCardTable(Table):
    def __init__(self, *args, radius=8, **kwargs):
        self.radius = radius
        super().__init__(*args, **kwargs)

    def drawOn(self, canvas, x, y, _sW=0):
        canvas.saveState()
        canvas.setFillColor(PANEL)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.6)
        canvas.roundRect(x, y, self._width, self._height, self.radius, fill=1, stroke=1)
        canvas.restoreState()
        super().drawOn(canvas, x, y, _sW)


def _cards(left, right, palette=None):
    return Table([[left, right]], colWidths=[90*mm, 90*mm], hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .5, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, palette["accent"] if palette else BLUE),
        ("LINEBEFORE", (1, 0), (1, -1), 2.5, palette["accent"] if palette else BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))


def _data_table(rows, widths, numeric_from=None, font_size=7.2, emphasis_columns=None, corner_radii=None, header_color=BLUE_DARK, fonts=None, header_text_color=colors.white, body_text_color=INK):
    table = Table(rows, colWidths=widths, repeatRows=1, splitByRow=1, cornerRadii=corner_radii)
    regular, bold = fonts or (FONT, FONT_BOLD)
    commands = [("BACKGROUND", (0, 0), (-1, 0), header_color), ("TEXTCOLOR", (0, 0), (-1, 0), header_text_color), ("FONTNAME", (0, 0), (-1, 0), bold), ("FONTNAME", (0, 1), (-1, -1), regular), ("GRID", (0, 0), (-1, -1), .4, LINE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PANEL]), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("FONTSIZE", (0, 0), (-1, -1), font_size), ("LEADING", (0, 0), (-1, -1), font_size + 2), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]
    commands.append(("TEXTCOLOR", (0, 1), (-1, -1), body_text_color))
    for column in emphasis_columns or []:
        commands.extend([
            ("FONTSIZE", (column, 0), (column, -1), font_size + .9),
            ("LEADING", (column, 0), (column, -1), font_size + 2.9),
        ])
    if numeric_from is not None: commands.append(("ALIGN", (numeric_from, 1), (-1, -1), "RIGHT"))
    table.setStyle(TableStyle(commands))
    return table


def _summary_cards(values, s, palette=None):
    cells = [[Paragraph(label.upper(), s["label"]), Paragraph(value, ParagraphStyle(f"summary-{index}", parent=s["bold"], fontSize=10, textColor=palette["text"] if palette else BLUE_DARK))] for index, (label, value) in enumerate(values)]
    return Table([cells], colWidths=[180*mm/len(cells)]*len(cells), style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL if palette else BLUE_PALE), ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, LINE), ("PADDING", (0, 0), (-1, -1), 6)]))


def _section(title, body, s, palette=None):
    if not body: return []
    return [CondPageBreak(28*mm), _detail_card(title, body, s, palette=palette)]


def _detail_card(title, body, s, width=180*mm, palette=None):
    if not body:
        return None
    clean_lines = [
        _text(line).strip()
        for line in str(body).replace("\r", "").split("\n")
        if _text(line).strip()
    ]
    content = "<br/>".join(clean_lines) or "-"
    title_text = Paragraph(_text(title).upper(), s["label_inverse"])
    body_text = Paragraph(content, s["body"])
    card = Table(
        [[title_text], [body_text]],
        colWidths=[width],
        hAlign="LEFT",
    )
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), palette["dark"] if palette else BLUE_DARK),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("LINEBEFORE", (0, 1), (0, -1), 3, palette["accent"] if palette else BLUE),
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


def _footer(canvas, document, company, palette=None, fonts=None, logo=None, logo_shape="RECTANGLE"):
    canvas.saveState(); width, height = canvas._pagesize
    if palette:
        regular, bold = fonts or (FONT, FONT_BOLD)
        canvas.setStrokeColor(palette["dark"])
        canvas.setLineWidth(.8)
        canvas.roundRect(15*mm, 5*mm, 180*mm, 16*mm, 8, fill=0, stroke=1)
        canvas.setStrokeColor(palette["accent"])
        canvas.setLineWidth(2.5)
        canvas.line(15*mm, 21*mm, 55*mm, 21*mm)
        if logo:
            original_width, original_height = logo.drawWidth, logo.drawHeight
            if logo_shape == "ROUND":
                logo.drawWidth = logo.drawHeight = 13*mm
            else:
                logo.drawWidth = 34*mm
                logo.drawHeight = original_height * logo.drawWidth / original_width
                if logo.drawHeight > 13*mm:
                    logo.drawWidth *= 13*mm / logo.drawHeight
                    logo.drawHeight = 13*mm
            logo.drawOn(canvas, 18*mm, 5*mm + (16*mm - logo.drawHeight)/2)
            logo.drawWidth, logo.drawHeight = original_width, original_height
        else:
            company_size = 8.2
            while company_size > 6.5 and pdfmetrics.stringWidth(company, bold, company_size) > 52*mm:
                company_size -= .2
            canvas.setFillColor(palette["text"])
            canvas.setFont(bold, company_size)
            canvas.drawString(18*mm, 12.5*mm, company)
        canvas.setFillColor(SLATE)
        canvas.setFont(regular, 8)
        canvas.drawCentredString(width/2, 12.5*mm, "Powered by Bharath Painters")
        canvas.drawRightString(width-18*mm, 12.5*mm, f"Page {document.page}")
        canvas.restoreState()
        return
    canvas.setFillColor(BLUE)
    canvas.rect(0, height-2.2*mm, width, 2.2*mm, fill=1, stroke=0)
    canvas.setStrokeColor(LINE); canvas.line(15*mm, 10*mm, width-15*mm, 10*mm)
    canvas.setFont(FONT, 6.8); canvas.setFillColor(SLATE)
    canvas.drawString(15*mm, 6.4*mm, company); canvas.drawCentredString(width/2, 6.4*mm, "Powered by Bharath Painters"); canvas.drawRightString(width-15*mm, 6.4*mm, f"Page {document.page}")
    canvas.restoreState()


class _AlignedDocTemplate(SimpleDocTemplate):
    def addPageTemplates(self, page_templates):
        for template in page_templates:
            for frame in template.frames:
                frame._leftPadding = frame._rightPadding = 0
                frame._topPadding = frame._bottomPadding = 0
                frame._geom()
        return super().addPageTemplates(page_templates)


def _doc(buffer, title, top_margin=12*mm, bottom_margin=15*mm, aligned=False):
    template = _AlignedDocTemplate if aligned else SimpleDocTemplate
    return template(buffer, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=top_margin, bottomMargin=bottom_margin, title=title, author="Bharath Painters")


def _quotation_pdf_header(context, quotation, s):
    contact_style = ParagraphStyle("bp-quotation-contact", parent=s["small"], fontSize=7.1, leading=8.8)
    brand_lines = [Paragraph(_text(context["company"]), s["company"])]
    for line in (context["tagline"], context["address"]):
        if line:
            brand_lines.append(Paragraph(_text(line), contact_style))
    contact_line = _joined([
        f"Mobile: {context['mobile']}" if context["mobile"] else "",
        f"Email: {context['email']}" if context["email"] else "",
    ], "  |  ")
    registration_line = _joined([
        f"GSTIN: {context['gst']}" if context["gst"] else "",
        f"Contractor ID: {context['contractor_id']}" if context["contractor_id"] else "",
        context["website"],
    ], "  |  ")
    for line in (contact_line, registration_line):
        if line:
            brand_lines.append(Paragraph(_text(line), contact_style))
    identity = Table([[line] for line in brand_lines], colWidths=[100*mm], style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    title = ParagraphStyle("bp-quotation-document-title", parent=s["title"], fontSize=23, leading=26, alignment=TA_RIGHT)
    number_style = ParagraphStyle("bp-quotation-document-number", parent=s["bold"], fontSize=11.5, leading=14, textColor=BLUE_DARK, alignment=TA_RIGHT)
    descriptor = ParagraphStyle("bp-quotation-document-descriptor", parent=s["small"], fontSize=7.2, leading=9, alignment=TA_RIGHT)
    metadata = [f"Version {quotation.version_number or 1}"]
    if quotation.quotation_date:
        metadata.append(f"Created {quotation.quotation_date}")
    if quotation.valid_until:
        metadata.append(f"Valid until {quotation.valid_until}")
    right_block = Table([
        [Paragraph("QUOTATION", title)],
        [Paragraph(_text(quotation.quotation_number), number_style)],
        [Paragraph(_text("  |  ".join(metadata)), descriptor)],
    ], colWidths=[80*mm], style=TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    header = Table([[identity, right_block]], colWidths=[100*mm, 80*mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 1.5, BLUE_DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [header]


class _QuotationBanner(Flowable):
    def __init__(self, context, quotation, palette, included_sections, fonts):
        super().__init__()
        self.context, self.quotation, self.palette = context, quotation, palette
        self.included_sections = included_sections
        self.font_regular, self.font_bold = fonts
        self.width = 180*mm
        address_style = ParagraphStyle(
            "quotation-banner-address", fontName=self.font_regular, fontSize=9.5,
            leading=10, textColor=palette["on_dark"],
        )
        self.address = Paragraph(_text(context["address"] if "contractor_address" in included_sections else ""), address_style)
        _, address_height = self.address.wrap(99*mm, 100)
        self.height = 78 + max(0, address_height - 20)

    def draw(self):
        c, palette, context, quotation = self.canv, self.palette, self.context, self.quotation
        c.setFillColor(palette["dark"])
        c.roundRect(0, 0, self.width, self.height, 8, fill=1, stroke=0)
        c.rect(0, 0, self.width, 8, fill=1, stroke=0)
        c.setFillColor(palette["accent"])
        c.rect(0, 0, self.width, 3, fill=1, stroke=0)
        diagonal = c.beginPath()
        diagonal.moveTo(120*mm, self.height)
        diagonal.lineTo(124*mm, self.height)
        diagonal.lineTo(107*mm, 3)
        diagonal.lineTo(103*mm, 3)
        diagonal.close()
        c.drawPath(diagonal, fill=1, stroke=0)

        company = str(context["company"]).upper() if "company_name" in self.included_sections else ""
        company_size = 15
        while company_size > 10 and pdfmetrics.stringWidth(company, self.font_bold, company_size) > 99*mm:
            company_size -= .5
        c.setFillColor(palette["on_dark"])
        c.setFont(self.font_bold, company_size)
        c.drawString(8*mm, self.height - 19, company)
        if "contractor_address" in self.included_sections:
            self.address.drawOn(c, 8*mm, self.height - 28 - self.address.height)

        contact = _joined([
            f"Mobile: {context['mobile']}" if context["mobile"] else "",
            f"Email: {context['email']}" if context["email"] else "",
        ], " | ")
        registration = _joined([
            f"GSTIN: {context['gst']}" if context["gst"] else "",
            f"Contractor ID: {context['contractor_id']}" if context["contractor_id"] else "",
        ], " | ")
        c.setFillColor(palette["on_dark"])
        for key, value, baseline in (("contractor_contact", contact, 21), ("contractor_registration", registration, 9)):
            if key not in self.included_sections:
                continue
            size = 9.25
            while size > 7 and pdfmetrics.stringWidth(value, self.font_regular, size) > 99*mm:
                size -= .25
            c.setFont(self.font_regular, size)
            c.drawString(8*mm, baseline, value)

        c.setFillColor(palette["on_dark"])
        c.setFont(self.font_bold, 18)
        c.drawRightString(self.width - 8*mm, self.height - 23, "QUOTATION")
        c.setFillColor(palette["accent_on_dark"])
        c.setFont(self.font_bold, 9.4)
        c.drawRightString(self.width - 8*mm, self.height - 40, quotation.quotation_number)
        if "quotation_metadata" in self.included_sections:
            metadata = [f"Version {quotation.version_number or 1}"]
            if quotation.quotation_date:
                metadata.append(f"Created {quotation.quotation_date}")
            if quotation.valid_until:
                metadata.append(f"Valid until {quotation.valid_until}")
            c.setFillColor(palette["on_dark"])
            c.setFont(self.font_regular, 6.6)
            c.drawRightString(self.width - 8*mm, self.height - 53, " | ".join(metadata))


def _quotation_pdf_footer(canvas, document, context, palette, included_sections, fonts):
    canvas.saveState()
    page_width, _ = canvas._pagesize
    canvas.setStrokeColor(palette["dark"])
    canvas.setLineWidth(.8)
    canvas.roundRect(15*mm, 5*mm, 180*mm, 16*mm, 8, fill=0, stroke=1)
    canvas.setStrokeColor(palette["accent"])
    canvas.setLineWidth(2.5)
    canvas.line(15*mm, 21*mm, 60*mm, 21*mm)
    logo = context["logo"] if "footer_logo" in included_sections else None
    if logo:
        original_width, original_height = logo.drawWidth, logo.drawHeight
        if context["logo_shape"] == "ROUND":
            logo.drawWidth = logo.drawHeight = 13*mm
        else:
            logo.drawWidth = 34*mm
            logo.drawHeight = original_height * logo.drawWidth / original_width
            if logo.drawHeight > 13*mm:
                logo.drawWidth *= 13*mm/logo.drawHeight
                logo.drawHeight = 13*mm
        logo.drawOn(canvas, 18*mm, 5*mm + (16*mm - logo.drawHeight)/2)
        logo.drawWidth, logo.drawHeight = original_width, original_height
    canvas.setFillColor(SLATE)
    canvas.setFont(fonts[0], 8.2)
    canvas.drawCentredString(page_width/2, 12.5*mm, "Powered by Bharath Painters")
    canvas.drawRightString(page_width - 18*mm, 12.5*mm, f"Page {document.page}")
    canvas.restoreState()


def _quotation_product_details(quotation):
    groups = []
    for line in consolidated_product_details(quotation).splitlines():
        match = re.match(r"^(.*?) \((.*?)\): (.*)$", line)
        if not match:
            groups.append([line, None, None])
            continue
        name, brand, description = match.groups()
        existing = next((row for row in groups if row[0] == name and row[2] == description), None)
        if existing:
            if brand not in existing[1]:
                existing[1].append(brand)
        else:
            groups.append([name, [brand], description])
    return "\n".join(
        f"{name} ({', '.join(brands)}): {description}" if brands else name
        for name, brands, description in groups
    )


def _quotation_display_sections(quotation, context, s, included_sections, palette):
    included = set(included_sections)

    def content_card(title, body, width):
        label_style = ParagraphStyle(f"bp-quotation-section-{title}", parent=s["label_inverse"], fontSize=7, leading=8.5, textColor=palette["on_dark"])
        body_style = ParagraphStyle(f"bp-quotation-section-body-{title}", parent=s["body"], fontSize=8, leading=10, spaceAfter=0)
        card = Table([
            [Paragraph(_text(title.upper()), label_style)],
            [Paragraph(_text(body).replace("\n", "<br/>"), body_style)],
        ], colWidths=[width], hAlign="LEFT", cornerRadii=[8]*4, style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), palette["dark"]), ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), .6, LINE), ("LEFTPADDING", (0, 0), (-1, 0), 8),
            ("RIGHTPADDING", (0, 0), (-1, 0), 8), ("TOPPADDING", (0, 0), (-1, 0), 5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5), ("LEFTPADDING", (0, 1), (-1, -1), 9),
            ("RIGHTPADDING", (0, 1), (-1, -1), 9), ("TOPPADDING", (0, 1), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 10), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return card

    story = []
    fields = [
        ("prepared_by", "Prepared by", quotation.prepared_by),
        ("inspected_by", "Inspected by", quotation.inspected_by),
        ("work_duration", "Work duration", quotation.work_duration),
        ("payment_terms", "Payment terms", quotation.payment_terms),
        ("product_details", "Product details", _quotation_product_details(quotation)),
        ("work_procedures", "Work procedures and safety", quotation.work_procedures),
        ("terms_conditions", "Terms", quotation.terms_conditions),
    ]
    visible_fields = [(label, value) for key, label, value in fields if key in included and value]
    if visible_fields:
        label_style = ParagraphStyle("bp-quotation-field-label", parent=s["label"], fontSize=6.5, leading=8, textColor=palette["accent_text"])
        value_style = ParagraphStyle("bp-quotation-field-value", parent=s["body"], fontSize=7.5, leading=9.5)
        field_cells = []
        terms_cell = None
        for label, value in visible_fields:
            cell = Table([
                [Paragraph(_text(label).upper(), label_style)],
                [Paragraph(_text(value).replace("\n", "<br/>"), value_style)],
            ], colWidths=[174*mm if label == "Terms" else 87*mm], style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            if label == "Terms":
                terms_cell = cell
            else:
                field_cells.append(cell)
        heading = "TERMS AND CONDITIONS" if terms_cell else "ADDITIONAL DETAILS"
        rows = [[Paragraph(heading, ParagraphStyle("quotation-terms-heading", parent=s["label_inverse"], textColor=palette["on_dark"])), ""]] + [
            [field_cells[index], field_cells[index + 1] if index + 1 < len(field_cells) else ""]
            for index in range(0, len(field_cells), 2)
        ]
        if terms_cell:
            rows.append([terms_cell, ""])
        grid_styles = [
            ("SPAN", (0, 0), (1, 0)),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, 0), palette["dark"]),
            ("BOX", (0, 0), (-1, -1), .6, LINE),
            ("INNERGRID", (0, 1), (-1, -1), .4, LINE),
            ("LEFTPADDING", (0, 0), (-1, 0), 8), ("RIGHTPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("LEFTPADDING", (0, 1), (-1, -1), 1.5*mm),
            ("RIGHTPADDING", (0, 1), (-1, -1), 1.5*mm),
            ("TOPPADDING", (0, 1), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 0),
            ("NOSPLIT", (0, 0), (-1, 1)),
        ]
        if len(field_cells) % 2:
            grid_styles.append(("SPAN", (0, len(rows) - (2 if terms_cell else 1)), (1, len(rows) - (2 if terms_cell else 1))))
        if terms_cell:
            grid_styles.append(("SPAN", (0, len(rows) - 1), (1, len(rows) - 1)))
        work_card = Table(rows, colWidths=[90*mm, 90*mm], hAlign="LEFT", repeatRows=1, cornerRadii=[8]*4, style=TableStyle(grid_styles))
        story.extend([Spacer(1, 4*mm), work_card])

    support_cards = []
    if "notes" in included and quotation.notes:
        support_cards.append(("Notes", quotation.notes))
    if len(support_cards) == 2:
        story.extend([Spacer(1, 4*mm), Table([[
            content_card(*support_cards[0], 87*mm), content_card(*support_cards[1], 87*mm),
        ]], colWidths=[90*mm, 90*mm], hAlign="LEFT", style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))])
    elif support_cards:
        story.extend([Spacer(1, 4*mm), content_card(*support_cards[0], 180*mm)])
    return story


def build_quotation_pdf(quotation, included_sections=None):
    buffer = BytesIO()
    included_sections = (
        QUOTATION_PDF_DEFAULT_SECTION_KEYS
        if included_sections is None
        else set(included_sections) & QUOTATION_PDF_SECTION_KEYS
    )
    context = _contractor_context(quotation.contractor, quotation.contractor_snapshot or {}, prefer_profile=quotation.status == "DRAFT")
    fonts = _pdf_fonts(context["profile"])
    palette = _quotation_palette(context["profile"])
    s = _styles(fonts, palette["text"])
    doc = _doc(buffer, quotation.quotation_number, top_margin=8*mm, bottom_margin=26*mm, aligned=True)
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
    story = [_QuotationBanner(context, quotation, palette, included_sections, fonts), Spacer(1, 6)]
    visible_cards = []
    if "customer_details" in included_sections:
        visible_cards.append(_quotation_info_card("Customer details", customer_details, s, palette["accent_text"]))
    if "property_details" in included_sections:
        visible_cards.append(_quotation_info_card("Property site details", property_details, s, palette["accent_text"]))
    if visible_cards:
        info_cards = Table(
            [[visible_cards[0], "", visible_cards[1]]] if len(visible_cards) == 2 else [[visible_cards[0], "", ""]],
            colWidths=[89*mm, 2*mm, 89*mm], style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        )
        story += [Spacer(1, 2*mm), info_cards, Spacer(1, 10)]
    rows = [["Sl.", "Type of service", "Room / Area", "Product / Brand", "Description / treatment", "Qty", "Coats", "Rate (₹)", "Amount (₹)"]]
    table_body_style = ParagraphStyle("bp-quotation-table-body", parent=s["body"], fontSize=7, leading=8.5, spaceAfter=0)
    numeric_cell = ParagraphStyle("bp-quotation-number", parent=table_body_style, alignment=TA_RIGHT)
    rate_amount_cell = ParagraphStyle("bp-quotation-rate-amount", parent=table_body_style, alignment=TA_RIGHT)
    product_style = table_body_style
    for serial, item in enumerate(quotation.items.select_related("room", "service_type", "paint_type", "paint_brand", "unit").all(), 1):
        category = item.service_category_name_snapshot or item.custom_service_category or (item.service_category.name if item.service_category else "")
        service = item.service_name_snapshot or item.custom_service_type or (item.service_type.name if item.service_type else "")
        room = quotation_room_area_label(item)
        product = item.product_type_name_snapshot or item.custom_product_type or (item.paint_type.name if item.paint_type else "")
        brand = item.brand_name_snapshot or item.custom_brand or (item.paint_brand.name if item.paint_brand else "")
        unit = item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else "")
        service_value = _joined([category, service], " / ")
        product_brand = Paragraph(f"{_text(product) or '-'}<br/>{_text(brand)}", product_style)
        quantity_value = Paragraph(f"{_text(_indian_number(item.quantity, 2))}<br/><font color=\"#64748B\" size=6.2>{_text(unit) or '-'}</font>", numeric_cell)
        coats = str(item.coats) if item.coats not in (None, "") else ""
        coat_value = "-" if item.is_additional_service or not coats else coats
        rate_value = Paragraph(_text(_indian_number(item.rate, 2)), numeric_cell)
        amount_value = Paragraph(f"<b>{_text(_indian_number(item.amount, 2))}</b>", rate_amount_cell)
        description = _text(item.description) or "-"
        if quotation.discount_mode == "LINE" and "discount" in included_sections:
            from .discounts import line_discount
            reduction = line_discount(item)
            description += f"<br/><font size=6.2>Line discount {_text(money(reduction, 2))}<br/>Net {_text(money(item.amount - reduction, 2))}</font>"
        rows.append([str(serial), Paragraph(_text(service_value) or "-", table_body_style), Paragraph(_text(room) or "-", table_body_style), product_brand, Paragraph(description, table_body_style), quantity_value, Paragraph(_text(coat_value), numeric_cell), rate_value, amount_value])
    quotation_table = _data_table(rows, [7*mm, 23*mm, 20*mm, 27*mm, 39*mm, 16*mm, 10*mm, 17*mm, 21*mm], numeric_from=5, font_size=7, emphasis_columns=[], corner_radii=[8]*4, header_color=palette["dark"], fonts=fonts, body_text_color=palette["text"])
    quotation_table.setStyle(TableStyle([
        ("TEXTCOLOR", (0, 0), (-1, 0), palette["on_dark"]),
        ("ALIGN", (0, 1), (0, -1), "CENTER"), ("ALIGN", (6, 1), (6, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    if "quotation_items" in included_sections:
        story.append(quotation_table)
    totals = []
    if "subtotal" in included_sections:
        totals.append(["Subtotal", money(quotation.subtotal, 2)])
    if "discount" in included_sections and quotation.discount:
        totals.append(["Discount", f"- {money(quotation.discount, 2)}"])
    if "gst" in included_sections and quotation.gst_amount:
        totals.append([f"GST ({_indian_number(quotation.gst_percentage, 2).rstrip('0').rstrip('.')}%)", money(quotation.gst_amount, 2)])
    if "grand_total" in included_sections:
        totals.append(["QUOTATION TOTAL", money(quotation.grand_total, 2)])
    total_table = None
    if totals:
        total_table = Table(totals, colWidths=[42*mm, 35*mm], hAlign="RIGHT", cornerRadii=[8]*4)
        total_styles = [("GRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (0, -1), PANEL), ("FONTNAME", (0, 0), (-1, -1), fonts[1]), ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
        total_styles.append(("TEXTCOLOR", (0, 0), (-1, -1), palette["text"]))
        if "grand_total" in included_sections:
            total_styles += [("BACKGROUND", (0, -1), (-1, -1), palette["dark"]), ("TEXTCOLOR", (0, -1), (-1, -1), palette["on_dark"]), ("FONTSIZE", (0, -1), (-1, -1), 9.2)]
        total_table.setStyle(TableStyle(total_styles))
    whole_rupees = int(quotation.grand_total)
    paise = int((quotation.grand_total - whole_rupees) * 100)
    amount_words = f"{_amount_words(whole_rupees)} Indian Rupees"
    if paise:
        amount_words += f" and {_amount_words(paise)} Paise"
    words_label = ParagraphStyle("quotation-total-words-label", parent=s["label"], textColor=palette["accent_text"])
    words_card = Table([[Paragraph("TOTAL IN WORDS", words_label)], [Paragraph(f'<i>"{_text(amount_words)} Only"</i>', s["body"])]], colWidths=[88*mm], cornerRadii=[8]*4, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    if "total_words" in included_sections or total_table:
        totals_row = Table([[words_card if "total_words" in included_sections else "", total_table or ""]], colWidths=[95*mm, 80*mm], style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story += [Spacer(1, 3*mm), totals_row]
    story += _quotation_display_sections(
        quotation,
        context,
        s,
        included_sections,
        palette,
    )
    signature_headers = []
    signature_values = []
    if "prepared_signature" in included_sections:
        signature_headers.append("PREPARED BY")
        signature_values.append(Paragraph("", s["body"]))
    if "authorized_signature" in included_sections:
        signature_headers.append("AUTHORIZED SIGNATURE")
        signature_values.append(Paragraph(_text(context["company"]), s["body"]))
    if signature_headers:
        signature_width = 180*mm/len(signature_headers)
        signature = Table([
            [Paragraph(label, ParagraphStyle("quotation-signature-heading", parent=s["label_inverse"], textColor=palette["on_dark"])) for label in signature_headers],
            signature_values,
        ], colWidths=[signature_width]*len(signature_headers), cornerRadii=[8]*4)
        signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (-1, 0), palette["dark"]), ("TEXTCOLOR", (0, 0), (-1, 0), palette["on_dark"]), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7)]))
        story += [Spacer(1, 4*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _quotation_pdf_footer(c,d,context,palette,included_sections,fonts), onLaterPages=lambda c,d: _quotation_pdf_footer(c,d,context,palette,included_sections,fonts))
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
    buffer = BytesIO()
    context = _contractor_context(invoice.contractor, invoice.contractor_snapshot or {}, prefer_profile=True)
    palette = _quotation_palette(context["profile"])
    fonts = _pdf_fonts(context["profile"])
    s = _styles(fonts, palette["text"])
    s["label"].textColor = palette["accent_text"]
    s["title"].textColor = palette["dark"]
    s["label_inverse"].textColor = palette["on_dark"]
    doc, quotation = _doc(buffer, invoice.invoice_number, bottom_margin=26*mm, aligned=True), invoice.quotation
    property_obj = quotation.property if quotation else invoice.site_property
    property_address = invoice.billing_address or _joined([
        getattr(property_obj, "address", ""), getattr(property_obj, "city", ""), getattr(property_obj, "pincode", "")
    ])
    tax_invoice = invoice.tax_mode == "GST"
    source_number = invoice.quotation_number_snapshot or (quotation.quotation_number if quotation else "Lump sum")
    property_type = property_obj.get_property_type_display() if property_obj else "Direct invoice"
    property_label = invoice.property_name or (property_obj.name if property_obj else "") or property_type
    story = [
        _header(context, "TAX INVOICE" if tax_invoice else "INVOICE", [("Invoice No.", invoice.invoice_number), ("Invoice Date", invoice.invoice_date), ("Source", source_number), ("Project Ref.", property_label)], s, center_title=True, palette=palette),
        Spacer(1, 4*mm),
        _cards(_info_card("Bill to", [invoice.customer_name, invoice.customer_mobile, property_address], s), _info_card("Property details", [property_label, property_type, property_address], s), palette=palette),
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
    story.append(_data_table(rows, [8*mm, 53*mm, 34*mm, 18*mm, 22*mm, 20*mm, 25*mm], numeric_from=4, header_color=palette["dark"], header_text_color=palette["on_dark"], fonts=fonts, body_text_color=palette["text"]))
    taxable = invoice.subtotal - invoice.discount
    totals = [["Subtotal", money(invoice.subtotal)]]
    if invoice.discount: totals.append(["Discount", f"- {money(invoice.discount)}"])
    totals.append(["Taxable Amount", money(taxable)])
    if invoice.gst_amount: totals.append([f"GST ({quantity(invoice.gst_percentage)}%)", money(invoice.gst_amount)])
    totals.append(["INVOICE TOTAL", money(invoice.grand_total)])
    total_table = Table(totals, colWidths=[43*mm, 37*mm], hAlign="RIGHT")
    total_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .45, LINE), ("BACKGROUND", (0, 0), (0, -2), PANEL), ("BACKGROUND", (0, -1), (-1, -1), palette["dark"]), ("TEXTCOLOR", (0, -1), (-1, -1), palette["on_dark"]), ("FONTNAME", (0, 0), (-1, -1), fonts[1]), ("FONTSIZE", (0, -1), (-1, -1), 9.2), ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("PADDING", (0, 0), (-1, -1), 6)]))
    total_table.setStyle(TableStyle([("TEXTCOLOR", (0, 0), (-1, -2), palette["text"])]))
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
        bank_content = Table([[bank_title], [bank_body]], colWidths=[137*mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), palette["dark"]), ("BACKGROUND", (0, 1), (-1, -1), colors.white), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 0), (-1, 0), 5), ("TOPPADDING", (0, 1), (-1, -1), 7), ("BOTTOMPADDING", (0, 1), (-1, -1), 7)]))
        bank = Table([[bank_content, qr or ""]], colWidths=[145*mm, 35*mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("BOX", (0, 0), (-1, -1), .6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
        story += [Spacer(1, 4*mm), KeepTogether(bank)]
    story += _section("Terms & conditions", invoice.terms_conditions, s, palette)
    story += _section("Notes", invoice.notes, s, palette)
    signature = Table([[Paragraph("AUTHORIZED SIGNATURE", s["label_inverse"])], [Paragraph(_text(context["company"]), s["body"])]], colWidths=[65*mm], hAlign="RIGHT")
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("BACKGROUND", (0, 0), (-1, 0), palette["dark"]), ("TEXTCOLOR", (0, 0), (-1, 0), palette["on_dark"]), ("TOPPADDING", (0, 1), (-1, 1), 13), ("BOTTOMPADDING", (0, 1), (-1, 1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    story += [Spacer(1, 5*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _footer(c,d,context["company"],palette,fonts), onLaterPages=lambda c,d: _footer(c,d,context["company"],palette,fonts))
    return buffer.getvalue()


def _measurement_pdf_header(context, reference, version, measured_on, s, palette):
    heading_style = ParagraphStyle(
        "bp-measurement-banner-title", parent=s["title"],
        fontSize=17, leading=20, textColor=palette["on_dark"],
    )
    heading = Table(
        [[Paragraph("AREA CALCULATION REPORT", heading_style)]],
        colWidths=[180*mm], cornerRadii=[8]*4,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), palette["dark"]),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]),
    )
    contact = _joined([
        f"Mobile: {context['mobile']}" if context["mobile"] else "",
        f"Email: {context['email']}" if context["email"] else "",
    ], "  |  ")
    registration = _joined([
        f"GSTIN: {context['gst']}" if context["gst"] else "",
        f"Contractor ID: {context['contractor_id']}" if context["contractor_id"] else "",
    ], "  |  ")
    company_style = ParagraphStyle(
        "bp-measurement-company", parent=s["company"],
        leading=16, spaceBefore=0, spaceAfter=0,
    )
    detail_style = ParagraphStyle(
        "bp-measurement-company-details", parent=s["small"],
        leading=9.5, spaceBefore=0, spaceAfter=0,
    )
    detail_parts = [_text(value) for value in (context["tagline"], context["address"], contact, registration) if value]
    company_lines = [Paragraph(_text(context["company"]), company_style)]
    if detail_parts:
        company_lines.append(Paragraph("<br/>".join(detail_parts), detail_style))
    metadata = [
        ("CALCULATION NO.", reference),
        ("VERSION", version),
        ("CALCULATION DATE", measured_on),
    ]
    meta_rows = [
        [Paragraph(label, s["label"]), Paragraph(_text(value), s["right"])]
        for label, value in metadata if value not in (None, "")
    ]
    meta_table = Table(meta_rows, colWidths=[28*mm, 42*mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    details = Table([[company_lines, meta_table]], colWidths=[110*mm, 70*mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.4, palette["accent"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [heading, details]


def build_measurement_pdf(property_obj, measurement_record=None):
    buffer = BytesIO()
    contractor = (measurement_record.contractor if measurement_record else None) or property_obj.contractor or property_obj.customer.contractor
    context = _contractor_context(contractor, {}, prefer_profile=True)
    palette = _quotation_palette(context["profile"])
    fonts = _pdf_fonts(context["profile"])
    s = _styles(fonts, palette["text"])
    s["label"].textColor = palette["accent_text"]
    s["label_inverse"].textColor = palette["on_dark"]
    s["title"].textColor = palette["dark"]
    reference = measurement_record.reference_no if measurement_record else f"PROPERTY-{property_obj.id}"
    measured_on = measurement_record.measured_on if measurement_record else property_obj.updated_at.date()
    doc = _doc(buffer, reference, top_margin=8*mm, bottom_margin=23*mm, aligned=True)
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
        typed_openings = [x for x in candidate_openings if x.opening_type == opening_type and x.area > 0]
        total_area = sum((property_obj.area_to_sqft(x.quantity * x.width * x.height) for x in typed_openings), Decimal("0"))
        total_quantity = sum((Decimal(x.quantity) for x in typed_openings), Decimal("0"))
        for surface in (x for x in candidate_surfaces if x.surface_type == surface_type):
            if surface.gross_area <= 0:
                continue
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
        *_measurement_pdf_header(context, reference, getattr(measurement_record, "version", ""), measured_on, s, palette),
        Spacer(1, 10),
        _cards(_measurement_info_card("Customer", [property_obj.customer.name, property_obj.customer.mobile], s), _measurement_info_card("Property", [property_obj.name or property_obj.get_property_type_display(), property_obj.get_property_type_display(), address], s), palette=palette),
        Spacer(1, 2*mm),
    ]
    measured_cards = [(label, area(value)) for label, value in [
        ("Net wall area", wall), ("Net ceiling area", ceiling), ("Other areas", other),
    ] if value > 0]
    if measured_cards:
        story.extend([_summary_cards(measured_cards, s, palette=palette), Spacer(1, 1*mm)])
    opening_cards = []
    if window_area > 0:
        opening_cards.extend([("Window area", area(window_area)), ("Window qty", quantity(window_quantity))])
    if door_area > 0:
        opening_cards.extend([("Door area", area(door_area)), ("Door qty", quantity(door_quantity))])
    if opening_cards:
        story.extend([_summary_cards(opening_cards, s, palette=palette), Spacer(1, 2*mm)])
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

    populated_groups = [(name, room_surfaces, room_values(room_surfaces)) for name, room_surfaces in groups if any(surface.gross_area > 0 or surface.addition_area > 0 or surface.deduction_area > 0 or any(opening.area > 0 for opening in surface.openings.all()) for surface in room_surfaces)]
    # One shared room list for every measured surface, including balconies/custom areas.
    column_specs = [
        ("Walls", "net_walls", "wall_present"),
        ("Ceilings", "net_ceiling", "ceiling_present"),
        ("Doors", "doors", "doors"),
        ("Windows", "windows", "windows"),
    ]
    for _, _, values in populated_groups:
        values["wall_present"] = any(values[key] > 0 for key in ("wall_gross", "wall_deductions", "wall_additions"))
        values["ceiling_present"] = any(values[key] > 0 for key in ("ceiling_gross", "ceiling_deductions", "ceiling_additions"))
        values["other_measured"] = sum((surface.net_area for surface in values["other_surfaces"]
            if surface.surface_type not in {"DOOR", "WINDOW"}), Decimal("0"))
        values["other_gross"] = sum((surface.gross_area for surface in values["other_surfaces"]
            if surface.surface_type not in {"DOOR", "WINDOW"}), Decimal("0"))
        values["other_present"] = any(surface.gross_area > 0 or surface.deduction_area > 0 or surface.addition_area > 0
            for surface in values["other_surfaces"] if surface.surface_type not in {"DOOR", "WINDOW"})
        values["room_net"] = values["net_walls"] + values["net_ceiling"] + values["other_area"]
    column_specs.append(("Other surfaces", "other_measured", "other_present"))
    visible_columns = [spec for spec in column_specs if any(values[spec[2]] > 0 for _, _, values in populated_groups)]
    common_rows = [["Room / Area", *[label for label, _, _ in visible_columns], "Net Area"]]
    for room_name, _, values in populated_groups:
        common_rows.append([Paragraph(_text(room_name), s["body"]),
            *[area(values[key]) if values[presence] > 0 else "-" for _, key, presence in visible_columns],
            area(values["room_net"])])
    if len(common_rows) > 1:
        common_rows.append([Paragraph("ALL ROOMS TOTAL", s["bold"]),
            *[area(sum((values[key] for _, _, values in populated_groups), Decimal("0"))) for _, key, _ in visible_columns],
            area(sum((values["room_net"] for _, _, values in populated_groups), Decimal("0")))])
        numeric_width = 140*mm / (len(visible_columns) + 1)
        common_table = _data_table(common_rows, [40*mm] + [numeric_width]*(len(visible_columns)+1),
            numeric_from=1, font_size=7.1, header_color=palette["dark"], header_text_color=palette["on_dark"],
            body_text_color=palette["text"], fonts=fonts, corner_radii=[8]*4)
        common_table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), PANEL), ("FONTNAME", (0, -1), (-1, -1), fonts[1])]))
        story.extend([Paragraph("ALL ROOM MEASUREMENTS", s["section"]), common_table, Spacer(1, 2*mm)])

    story.extend([Paragraph("AREA CALCULATION DETAILS", s["section"])])
    linear = property_obj.linear_unit_label
    for room_name, room_surfaces, values in populated_groups:
        rows = [["Category", "Name", "Height / Width", "Length / Width", "Qty", "Calculation", "Action", "Area"]]
        linked_surface_ids = {x.linked_surface_id for x in values["openings"] if x.linked_surface_id}
        opening_types = {x.opening_type for x in values["openings"]}
        for surface in room_surfaces:
            if surface.gross_area <= 0:
                continue
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
            if opening.area <= 0:
                continue
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
            table = _data_table(rows, [20*mm, 24*mm, 22*mm, 22*mm, 12*mm, 38*mm, 20*mm, 22*mm], numeric_from=2, font_size=6.8, header_color=palette["dark"], header_text_color=palette["on_dark"], body_text_color=palette["text"], fonts=fonts, corner_radii=[8]*4)
            total_styles = []
            for row_index in total_row_indexes:
                total_styles.extend([("SPAN", (0, row_index), (6, row_index)), ("BACKGROUND", (0, row_index), (-1, row_index), PANEL), ("FONTNAME", (0, row_index), (-1, row_index), fonts[1])])
            total_styles.extend([("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2)])
            table.setStyle(TableStyle(total_styles))
            story.append(KeepTogether([Paragraph(_text(room_name), s["section"]), table, Spacer(1, 2*mm)]))
    if measurement_record and measurement_record.notes: story += _section("Measurement remarks", measurement_record.notes, s, palette)
    prepared = measurement_record.created_by.get_full_name() if measurement_record and measurement_record.created_by else context["owner"]
    signature = Table([[Paragraph("PREPARED BY", s["label"]), Paragraph("SIGNATURE", s["label"])], [Paragraph(_text(prepared), s["body"]), ""]], colWidths=[90*mm, 90*mm])
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, LINE), ("INNERGRID", (0, 0), (-1, -1), .5, LINE), ("BACKGROUND", (0, 0), (-1, 0), PANEL), ("TOPPADDING", (0, 1), (-1, 1), 12), ("BOTTOMPADDING", (0, 1), (-1, 1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    story += [Spacer(1, 1*mm), KeepTogether(signature)]
    doc.build(story, onFirstPage=lambda c,d: _footer(c,d,context["company"],palette,fonts,context["logo"],context["logo_shape"]), onLaterPages=lambda c,d: _footer(c,d,context["company"],palette,fonts,context["logo"],context["logo_shape"]))
    buffer.seek(0)
    return buffer
