"""One-page printable companion to the public contractor digital card."""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas


NAVY = colors.HexColor("#14374A")
TEAL = colors.HexColor("#176B9B")
PALE = colors.HexColor("#EAF4F8")
LINE = colors.HexColor("#DBE7ED")
MUTED = colors.HexColor("#607786")


def _image(pdf, image, x, y, width, height):
    if not image:
        return False
    try:
        image.open("rb")
        pdf.drawImage(ImageReader(image), x, y, width, height, preserveAspectRatio=True, anchor="c", mask="auto")
        return True
    except (OSError, ValueError):
        return False
    finally:
        image.close()


def _line(pdf, value, x, y, max_width, size=10, leading=14, color=NAVY, max_lines=3):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica", size)
    lines = simpleSplit(str(value or ""), "Helvetica", size, max_width)
    for part in lines[:max_lines]:
        pdf.drawString(x, y, part)
        y -= leading
    return y


def render_contractor_card_pdf(user, card, profile_url):
    profile = user.contractor_profile
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    pdf.setTitle(f"{card['title']} - Digital Profile")

    pdf.setFillColor(colors.HexColor("#F8FBFC"))
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.roundRect(30, 28, width - 60, height - 56, 16, fill=1, stroke=0)
    pdf.setFillColor(NAVY)
    pdf.roundRect(30, height - 149, width - 60, 121, 16, fill=1, stroke=0)
    pdf.rect(30, height - 149, width - 60, 17, fill=1, stroke=0)

    pdf.setFillColor(colors.white)
    pdf.roundRect(48, height - 100, 194, 56, 8, fill=1, stroke=0)
    if not _image(pdf, profile.company_logo, 55, height - 94, 180, 44):
        _line(pdf, card["title"], 59, height - 76, 174, 13, color=NAVY, max_lines=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(width - 49, height - 63, card["bharath_id"] or "")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(width - 49, height - 80, "Bharath Painters verified profile")

    pdf.setFillColor(PALE)
    pdf.roundRect(48, height - 230, 82, 94, 10, fill=1, stroke=0)
    if not _image(pdf, user.profile_photo, 51, height - 227, 76, 88):
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(89, height - 185, "Photo not added")
    pdf.setFillColor(TEAL)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(146, height - 173, "PAINTING CONTRACTOR")
    _line(pdf, card["title"], 146, height - 196, 320, 21, 23, NAVY, 1)
    _line(pdf, card["owner_name"], 146, height - 214, 290, 10, 13, MUTED, 1)
    if user.bharath_qr:
        _image(pdf, user.bharath_qr, width - 120, height - 236, 72, 72)

    left_x, right_x, box_y, box_h, box_w = 48, 306, 265, 317, 241
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(LINE)
    for x in (left_x, right_x):
        pdf.roundRect(x, box_y, box_w, box_h, 10, fill=1, stroke=1)

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(left_x + 16, box_y + box_h - 25, "About the work")
    place = ", ".join(card["service_areas"]) or "Service areas not added"
    y = _line(pdf, f"{card['title']} serves {place}.", left_x + 16, box_y + box_h - 44, box_w - 32, 9, 12, MUTED, 3)
    y -= 11
    for label, value in (
        ("COMPLETED PROJECTS", str(len(card["projects"]))),
        ("YEARS IN BUSINESS", str(card["years_in_business"] or "-")),
        ("WORKERS", str(card["workers"] or "-")),
    ):
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(left_x + 16, y, label)
        pdf.setFillColor(TEAL)
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawRightString(left_x + box_w - 16, y - 1, value)
        y -= 23
    y -= 4
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left_x + 16, y, "Work skills")
    y = _line(pdf, ", ".join(card["work_skills"]) or "Not added", left_x + 16, y - 17, box_w - 32, 9, 12, MUTED, 5)
    y -= 12
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left_x + 16, y, "Service areas")
    _line(pdf, place, left_x + 16, y - 17, box_w - 32, 9, 12, MUTED, 4)

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(right_x + 16, box_y + box_h - 25, "Completed projects")
    if not card["projects"]:
        _line(pdf, "No completed projects added yet.", right_x + 16, box_y + box_h - 47, box_w - 32, 9, 12, MUTED, 2)
    for index, project in enumerate(card["projects"][:4]):
        row_y = box_y + box_h - 91 - index * 64
        project_record = profile.completed_projects.filter(id=project["id"]).first()
        pdf.setFillColor(PALE)
        pdf.roundRect(right_x + 16, row_y, 49, 48, 5, fill=1, stroke=0)
        if project_record:
            _image(pdf, project_record.photo, right_x + 19, row_y + 3, 43, 42)
        pdf.setFillColor(NAVY)
        pdf.setFont("Helvetica-Bold", 9)
        for line_index, line in enumerate(simpleSplit(project["title"], "Helvetica-Bold", 9, box_w - 94)[:2]):
            pdf.drawString(right_x + 75, row_y + 32 - line_index * 11, line)
        summary = project["apartment_community"] or project["location"] or project["work_completed"]
        _line(pdf, summary, right_x + 75, row_y + 9, box_w - 94, 8, 10, MUTED, 1)
    if len(card["projects"]) > 4:
        _line(pdf, "View more projects on the online profile.", right_x + 16, box_y + 16, box_w - 32, 8, 10, MUTED, 1)

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(48, 232, "Contact & verify")
    _line(pdf, f"Mobile: {card['mobile']}", 48, 212, 240, 9, 12, MUTED, 1)
    if card["email"]:
        _line(pdf, f"Email: {card['email']}", 48, 197, 490, 9, 12, MUTED, 1)
    _line(pdf, f"Profile: {profile_url}", 48, 178, width - 96, 8, 11, TEAL, 2)
    pdf.setStrokeColor(LINE)
    pdf.line(48, 151, width - 48, 151)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(48, 134, "Verified by Bharath Painters")
    pdf.drawRightString(width - 48, 134, card["bharath_id"] or "")
    if card["projects"] or card["customer_reviews"]["items"]:
        pdf.showPage()
        pdf.setFillColor(colors.HexColor("#F8FBFC"))
        pdf.rect(0, 0, width, height, fill=1, stroke=0)
        pdf.setFillColor(NAVY)
        pdf.roundRect(30, height - 105, width - 60, 77, 12, fill=1, stroke=0)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(48, height - 68, "Project work & customer reviews")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(48, height - 85, card["title"])
        y = height - 130
        for project in card["projects"]:
            fields = [("Apartment / gated community", project["apartment_community"]),
                      ("Address", project["address"]), ("Location", project["location"]),
                      ("PIN code", project["pincode"]),
                      ("Project details", project["description"]), ("Work completed", project["work_completed"])]
            lines = []
            for label, value in fields:
                if value:
                    wrapped = simpleSplit(str(value).replace("\n", " "), "Helvetica", 9, width - 124)[:8]
                    lines.append((label, wrapped))
            card_height = 39 + sum(13 + 12 * max(1, len(wrapped)) for _, wrapped in lines)
            if y - card_height < 60:
                pdf.showPage()
                pdf.setFillColor(colors.HexColor("#F8FBFC"))
                pdf.rect(0, 0, width, height, fill=1, stroke=0)
                y = height - 45
            pdf.setFillColor(colors.white)
            pdf.setStrokeColor(LINE)
            pdf.roundRect(30, y - card_height, width - 60, card_height, 10, fill=1, stroke=1)
            pdf.setFillColor(NAVY)
            pdf.setFont("Helvetica-Bold", 12)
            title_lines = simpleSplit(project["title"], "Helvetica-Bold", 12, width - 90)
            pdf.drawString(45, y - 24, title_lines[0] if title_lines else "")
            cursor = y - 42
            for label, wrapped in lines:
                pdf.setFillColor(TEAL)
                pdf.setFont("Helvetica-Bold", 8)
                pdf.drawString(45, cursor, label.upper())
                cursor -= 12
                pdf.setFillColor(MUTED)
                pdf.setFont("Helvetica", 9)
                for line in wrapped:
                    pdf.drawString(45, cursor, line)
                    cursor -= 12
                cursor -= 1
            y -= card_height + 12
        if card["customer_reviews"]["items"]:
            if y < 100:
                pdf.showPage()
                pdf.setFillColor(colors.HexColor("#F8FBFC"))
                pdf.rect(0, 0, width, height, fill=1, stroke=0)
                y = height - 45
            pdf.setFillColor(NAVY)
            pdf.setFont("Helvetica-Bold", 15)
            pdf.drawString(35, y - 18, "Customer reviews")
            pdf.setFont("Helvetica", 10)
            pdf.drawRightString(width - 35, y - 18, f"{card['customer_reviews']['rating']} / 5  |  {card['customer_reviews']['count']} reviews")
            y -= 42
            for review in card["customer_reviews"]["items"]:
                comment_lines = simpleSplit(review["comment"].replace("\n", " "), "Helvetica", 9, width - 90)[:8]
                card_height = 43 + 12 * len(comment_lines)
                if y - card_height < 50:
                    pdf.showPage()
                    pdf.setFillColor(colors.HexColor("#F8FBFC"))
                    pdf.rect(0, 0, width, height, fill=1, stroke=0)
                    y = height - 45
                pdf.setFillColor(colors.white)
                pdf.setStrokeColor(LINE)
                pdf.roundRect(30, y - card_height, width - 60, card_height, 10, fill=1, stroke=1)
                pdf.setFillColor(NAVY)
                pdf.setFont("Helvetica-Bold", 10)
                pdf.drawString(45, y - 20, review["customer_name"])
                pdf.setFillColor(TEAL)
                pdf.drawRightString(width - 45, y - 20, f"{review['rating']} / 5")
                pdf.setFillColor(MUTED)
                pdf.setFont("Helvetica", 9)
                for index, line in enumerate(comment_lines):
                    pdf.drawString(45, y - 39 - index * 12, line)
                y -= card_height + 10
    pdf.save()
    return output.getvalue()
