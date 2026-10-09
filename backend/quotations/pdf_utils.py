from io import BytesIO
from decimal import Decimal
from pathlib import Path

from django.conf import settings

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape


BLUE = colors.HexColor("#0F766E")
LIGHT_BLUE = colors.HexColor("#E6FFFB")
LIGHT_GREY = colors.HexColor("#F1F5F9")
DARK = colors.HexColor("#172033")
MUTED = colors.HexColor("#64748B")
RULE = colors.HexColor("#CBD5E1")
YELLOW = colors.HexColor("#FDE68A")


def build_measurement_pdf(property_obj, measurement_record=None):
    buffer = BytesIO()
    surface_scope = property_obj.measurement_surfaces.all()
    room_scope = property_obj.rooms.all()
    if measurement_record:
        surface_scope = surface_scope.filter(measurement_record=measurement_record)
        room_scope = room_scope.filter(measurement_record=measurement_record)
    exterior_surfaces = list(surface_scope.filter(work_area="EXTERIOR").prefetch_related("openings"))
    exterior_report = property_obj.measurement_type == "EXTERIOR" or bool(exterior_surfaces)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4) if exterior_report else A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=14*mm, title=f"Area Calculation - {property_obj.name}")
    styles = getSampleStyleSheet()
    small = ParagraphStyle("measurement-small", parent=styles["BodyText"], fontSize=7.5, leading=9, textColor=DARK)
    heading = ParagraphStyle("measurement-heading", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=23, textColor=DARK)
    brand = ParagraphStyle("measurement-brand", parent=small, fontName="Helvetica-Bold", fontSize=9, leading=11, tracking=2, textColor=DARK)
    section_title = ParagraphStyle("measurement-section-title", parent=small, fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=DARK, spaceBefore=2*mm, spaceAfter=1*mm)
    report_date = str(__import__("datetime").date.today())
    title_block = [Paragraph("BHARATH PAINTERS", brand), Paragraph("Area Calculation Report", heading), Paragraph("Room-wise paintable-area calculations", small)]
    date_block = [Paragraph("Report date", ParagraphStyle("measurement-date-label", parent=small, alignment=TA_RIGHT)), Paragraph(report_date, ParagraphStyle("measurement-date", parent=small, fontName="Helvetica-Bold", alignment=TA_RIGHT))]
    report_header = Table([[title_block, date_block]], colWidths=[125*mm, 61*mm] if not exterior_report else [190*mm, 83*mm])
    report_header.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LINEBELOW", (0,0), (-1,-1), 1.2, DARK), ("BOTTOMPADDING", (0,0), (-1,-1), 7)]))
    story = [report_header, Spacer(1, 4*mm)]
    address = ", ".join(value for value in [property_obj.address, property_obj.city, property_obj.pincode] if value)
    meta = [
        ["Project", Paragraph(escape(property_obj.name or property_obj.property_type), small), "Date", str(measurement_record.measured_on if measurement_record else property_obj.updated_at.date())],
        ["Owner", Paragraph(escape(property_obj.customer.name), small), "Generated", report_date],
        ["Address", Paragraph(escape(address or "-"), small), "Input unit", property_obj.get_measurement_unit_display()],
    ]
    if measurement_record:
        contractor = measurement_record.contractor
        profile = getattr(contractor, "contractor_profile", None) if contractor else None
        contractor_name = getattr(profile, "company_name", "") or (contractor.get_full_name() if contractor else "") or (contractor.mobile if contractor else "Not assigned")
        meta.append(["Area Calculation ID", measurement_record.reference_no, "Calculated by", Paragraph(escape(contractor_name), small)])
    meta_table = Table(meta, colWidths=([22*mm, 73*mm, 23*mm, 68*mm] if not exterior_report else [24*mm, 130*mm, 25*mm, 70*mm]))
    meta_table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .5, RULE), ("BACKGROUND", (0,0), (0,-1), LIGHT_GREY), ("BACKGROUND", (2,0), (2,-1), LIGHT_GREY), ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"), ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"), ("TEXTCOLOR", (0,0), (0,-1), MUTED), ("TEXTCOLOR", (2,0), (2,-1), MUTED), ("FONTSIZE", (0,0), (-1,-1), 7.5), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("PADDING", (0,0), (-1,-1), 5)]))
    story += [meta_table, Spacer(1, 5*mm)]
    if exterior_report:
        story += [Paragraph("Exterior area calculation summary (all areas in sq ft)", section_title), Spacer(1, 2*mm)]
        rows = [["Type", "Name", "Dimensions", "Qty", "Sides", "Gross", "Wall deduction", "Paintable area", "Finish"]]
        total = Decimal("0")
        for item in exterior_surfaces:
            total += item.net_area
            rows.append([
                item.get_surface_type_display(), Paragraph(escape(item.name), small),
                f"{item.length} x {item.breadth}", str(item.quantity), str(item.paintable_sides),
                f"{item.gross_area:.0f}", f"{item.deduction_area:.0f}", f"{item.net_area:.0f}",
                Paragraph(escape(item.finish or "-"), small),
            ])
        valid_deductions = []
        for wall in (item for item in exterior_surfaces if item.surface_type == "WALL"):
            for opening in wall.openings.all():
                if opening.effect == "DEDUCT" and opening.opening_type in {"DOOR", "WINDOW"}:
                    valid_deductions.append((wall, opening))
        for wall, opening in valid_deductions:
            rows.append([
                f"{opening.get_opening_type_display()} deduction",
                Paragraph(escape(opening.name or opening.get_opening_type_display()), small),
                f"{opening.height} x {opening.width}", str(opening.quantity), "1",
                "-", f"-{opening.effective_deduction:.0f}", "Included in net wall",
                Paragraph(escape(f"Deducted from total walls ({wall.name})"), small),
            ])
        rows.append(["TOTAL", "", "", "", "", "", "", f"{total:.0f}", ""])
        table = Table(rows, repeatRows=1, colWidths=[29*mm, 45*mm, 30*mm, 15*mm, 15*mm, 24*mm, 28*mm, 28*mm, 45*mm])
        table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .45, RULE), ("BACKGROUND", (0,0), (-1,0), DARK), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#F8FAFC")]), ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#D1FAE5")), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"), ("ALIGN", (2,1), (7,-1), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("FONTSIZE", (0,0), (-1,-1), 7.2), ("LEADING", (0,0), (-1,-1), 9), ("PADDING", (0,0), (-1,-1), 4)]))
        story.append(table)
        doc.build(story, onFirstPage=_page, onLaterPages=_page)
        buffer.seek(0)
        return buffer
    story += [Paragraph("Wall calculations (all areas in sq ft)", section_title), Spacer(1, 2*mm)]
    rooms = room_scope.select_related("room_type").prefetch_related("measurement_surfaces__openings").all()
    wall_summary = [["Room / Area", "Walls", "Doors", "Windows", "Deductions", "Additions", "Net walls"]]
    ceiling_summary = [["Room / Area", "Ceiling", "Deductions", "Additions", "Net ceiling"]]
    wall_totals = [Decimal("0") for _ in range(6)]
    ceiling_totals = [Decimal("0") for _ in range(4)]
    detail_sets = []
    for room in rooms:
        surfaces = list(room.measurement_surfaces.filter(measurement_record=measurement_record) if measurement_record else room.measurement_surfaces.all())
        if not surfaces:
            continue
        walls = [item for item in surfaces if item.surface_type == "WALL"]
        ceilings = [item for item in surfaces if item.surface_type == "CEILING"]
        openings = [opening for surface in surfaces for opening in surface.openings.all()]
        wall_gross = sum((item.gross_area for item in walls), Decimal("0"))
        ceiling_gross = sum((item.gross_area for item in ceilings), Decimal("0"))
        doors = sum((item.area for item in openings if item.opening_type == "DOOR"), Decimal("0"))
        windows = sum((item.area for item in openings if item.opening_type == "WINDOW"), Decimal("0"))
        wall_deductions = sum((item.deduction_area for item in walls), Decimal("0"))
        ceiling_deductions = sum((item.deduction_area for item in ceilings), Decimal("0"))
        wall_additions = sum((item.addition_area for item in walls), Decimal("0"))
        ceiling_additions = sum((item.addition_area for item in ceilings), Decimal("0"))
        net_walls = max(wall_gross - wall_deductions + wall_additions, Decimal("0"))
        net_ceiling = max(ceiling_gross - ceiling_deductions + ceiling_additions, Decimal("0"))
        wall_values = [wall_gross, doors, windows, wall_deductions, wall_additions, net_walls]
        ceiling_values = [ceiling_gross, ceiling_deductions, ceiling_additions, net_ceiling]
        wall_totals = [current + value for current, value in zip(wall_totals, wall_values)]
        ceiling_totals = [current + value for current, value in zip(ceiling_totals, ceiling_values)]
        wall_summary.append([Paragraph(escape(room.name), small)] + [f"{value:.0f}" for value in wall_values])
        ceiling_summary.append([Paragraph(escape(room.name), small)] + [f"{value:.0f}" for value in ceiling_values])
        detail_sets.append((room, walls, ceilings, openings, net_walls))
    wall_summary.append(["ALL ROOMS TOTAL"] + [f"{value:.0f}" for value in wall_totals])
    ceiling_summary.append(["ALL ROOMS TOTAL"] + [f"{value:.0f}" for value in ceiling_totals])
    wall_table = Table(wall_summary, repeatRows=1, colWidths=[36*mm] + [25*mm]*6)
    wall_table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .45, RULE), ("BACKGROUND", (0,0), (-1,0), DARK), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#F8FAFC")]), ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#D1FAE5")), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"), ("ALIGN", (1,1), (-1,-1), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("FONTSIZE", (0,0), (-1,-1), 7.2), ("LEADING", (0,0), (-1,-1), 9), ("PADDING", (0,0), (-1,-1), 4)]))
    ceiling_table = Table(ceiling_summary, repeatRows=1, colWidths=[50*mm] + [34*mm]*4)
    ceiling_table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .45, RULE), ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#172554")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#F8FAFC")]), ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#DBEAFE")), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"), ("ALIGN", (1,1), (-1,-1), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("FONTSIZE", (0,0), (-1,-1), 7.2), ("LEADING", (0,0), (-1,-1), 9), ("PADDING", (0,0), (-1,-1), 4)]))
    story += [wall_table, Spacer(1, 5*mm), Paragraph("Ceiling calculations (all areas in sq ft)", section_title), Spacer(1, 2*mm), ceiling_table]
    detail_heading = ParagraphStyle("room-detail-heading", parent=styles["Heading2"], fontSize=13, leading=16, textColor=DARK, spaceBefore=5*mm, spaceAfter=2*mm)
    section_heading = ParagraphStyle("surface-heading", parent=small, fontName="Helvetica-Bold", fontSize=9, leading=11, spaceBefore=2*mm, spaceAfter=1*mm)
    def measurement_table(rows, widths, numeric_start=1):
        table = Table(rows, repeatRows=1, colWidths=widths)
        table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .45, RULE), ("BACKGROUND", (0,0), (-1,0), LIGHT_GREY), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("ALIGN", (numeric_start,1), (-1,-1), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("FONTSIZE", (0,0), (-1,-1), 7.2), ("LEADING", (0,0), (-1,-1), 9), ("PADDING", (0,0), (-1,-1), 4)]))
        return table
    for room, walls, ceilings, openings, net_walls in detail_sets:
        room_content = [Paragraph(escape(room.name), detail_heading)]
        if walls:
            wall_rows = [["Name", "Height", "Length", "Area (sq ft)"]] + [[Paragraph(escape(item.name), small), f"{item.breadth}", f"{item.length}", f"{item.gross_area:.0f}"] for item in walls]
            room_content += [Paragraph("Walls", section_heading), measurement_table(wall_rows, [62*mm, 38*mm, 38*mm, 48*mm])]
        if ceilings:
            ceiling_rows = [["Name", "Length", "Width", "Area (sq ft)"]] + [[Paragraph(escape(item.name), small), f"{item.length}", f"{item.breadth}", f"{item.gross_area:.0f}"] for item in ceilings]
            room_content += [Paragraph("Ceilings", section_heading), measurement_table(ceiling_rows, [62*mm, 38*mm, 38*mm, 48*mm])]
        if openings:
            opening_rows = [["Type", "Name", "Height", "Width", "Qty", "Sides", "Deduct", "Area"]]
            for item in openings:
                deducted = item.effect != "ADD" and item.deduction_mode != "IGNORE"
                area = item.effective_deduction if deducted else item.area
                opening_rows.append(["Other" if item.opening_type == "OTHER" else item.get_opening_type_display(), Paragraph(escape(item.name or "-"), small), f"{item.height}", f"{item.width}", str(item.quantity), str(getattr(item, "paintable_sides", 1)), "Yes" if deducted else "No", f"{area:.0f}"])
            room_content += [Paragraph("Deductions and additions", section_heading), measurement_table(opening_rows, [22*mm, 35*mm, 22*mm, 22*mm, 16*mm, 16*mm, 23*mm, 30*mm], numeric_start=2)]
        total_rows = [["Room totals", "Net walls", "Net ceiling"], ["", f"{net_walls:.0f}", f"{sum((item.net_area for item in ceilings), Decimal('0')):.0f}"]]
        totals_table = measurement_table(total_rows, [62*mm, 62*mm, 62*mm])
        totals_table.setStyle(TableStyle([("BACKGROUND", (0,1), (-1,1), colors.HexColor("#D1FAE5")), ("FONTNAME", (0,1), (-1,1), "Helvetica-Bold")]))
        room_content += [Spacer(1, 2*mm), totals_table]
        story.extend(room_content)
        story.append(Spacer(1, 3*mm))
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    buffer.seek(0)
    return buffer


def _words(number):
    ones = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"]
    tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    def under_thousand(value):
        parts=[]
        if value >= 100: parts += [ones[value//100], "Hundred"]; value %= 100
        if value >= 20: parts.append(tens[value//10]); value %= 10
        if value: parts.append(ones[value])
        return " ".join(parts)
    value = int(round(number))
    if value == 0: return "Zero"
    parts=[]
    for divisor, label in ((10000000,"Crore"),(100000,"Lakh"),(1000,"Thousand")):
        if value >= divisor:
            parts += [under_thousand(value//divisor), label]; value %= divisor
    if value: parts.append(under_thousand(value))
    return " ".join(parts)


def _page(canvas, document):
    canvas.saveState()
    page_width, _ = canvas._pagesize
    canvas.setStrokeColor(colors.HexColor("#9CA3AF"))
    canvas.line(15*mm, 10*mm, page_width - 15*mm, 10*mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(15*mm, 6.5*mm, "Thank you for your business")
    canvas.drawRightString(page_width - 15*mm, 6.5*mm, f"Page {document.page}")
    canvas.restoreState()


def build_quotation_pdf(quotation):
    buffer=BytesIO()
    doc=SimpleDocTemplate(buffer,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=15*mm,title=quotation.quotation_number)
    styles=getSampleStyleSheet()
    small=ParagraphStyle("small",parent=styles["BodyText"],fontName="Helvetica",fontSize=8.5,leading=11,textColor=DARK)
    small_bold=ParagraphStyle("small-bold",parent=small,fontName="Helvetica-Bold")
    label=ParagraphStyle("label",parent=small,fontName="Helvetica-Bold",fontSize=7,leading=8,textColor=MUTED)
    center=ParagraphStyle("center",parent=small,alignment=TA_CENTER,fontSize=7.5,leading=9,textColor=MUTED)
    right=ParagraphStyle("right",parent=small,alignment=TA_RIGHT)
    profile=getattr(quotation.contractor,"contractor_profile",None)
    contractor_data=quotation.contractor_snapshot or {}
    customer_data=quotation.customer_snapshot or {}
    property_data=quotation.property_snapshot or {}
    company=contractor_data.get("company_name") or (profile.company_name if profile else "Bharath Painters")
    address=contractor_data.get("office_address") or (profile.office_address if profile and profile.office_address else "Office address not provided")
    contractor_mobile=contractor_data.get("mobile", quotation.contractor.mobile)
    contractor_email=contractor_data.get("email", quotation.contractor.email)
    contact=f"Mobile: {contractor_mobile} | Email: {contractor_email}"
    gst_number=contractor_data.get("gst_number") or (profile.gst_number if profile else "")
    pan_number=contractor_data.get("pan_number") or (profile.pan_number if profile else "")
    tax=" | ".join(x for x in [f"GSTIN: {gst_number}" if gst_number else "",f"PAN: {pan_number}" if pan_number else ""] if x)
    story=[]
    title=ParagraphStyle("quotation-title",parent=styles["Title"],fontName="Helvetica-Bold",fontSize=22,leading=25,textColor=DARK)
    eyebrow=ParagraphStyle("quotation-eyebrow",parent=small,fontName="Helvetica-Bold",fontSize=8,leading=9,textColor=BLUE,tracking=1.2)
    company_text=[Paragraph(escape(company),title),Paragraph("QUOTATION",eyebrow),Paragraph(escape(address),small),Paragraph(escape(contact),small)]
    if tax: company_text.append(Paragraph(tax,small))
    meta=[["DATE",str(quotation.quotation_date)],["Estimate #",quotation.quotation_number],["Customer ID",customer_data.get("bharath_id", quotation.customer.bharath_id)],["Valid Until",str(quotation.valid_until or "-")]]
    meta_table=Table(meta,colWidths=[28*mm,35*mm])
    meta_table.setStyle(TableStyle([("BOX",(0,0),(-1,-1),.7,RULE),("INNERGRID",(0,0),(-1,-1),.35,RULE),("BACKGROUND",(0,0),(0,-1),LIGHT_GREY),("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("TEXTCOLOR",(0,0),(0,-1),MUTED),("FONTSIZE",(0,0),(-1,-1),8),("PADDING",(0,0),(-1,-1),5)]))
    header=Table([[company_text,meta_table]],colWidths=[113*mm,67*mm])
    header.setStyle(TableStyle([("LINEBELOW",(0,0),(-1,-1),1.5,BLUE),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(0,0),0),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
    story.append(header)
    logo=""
    snapshot_logo=contractor_data.get("company_logo")
    if snapshot_logo or (profile and profile.company_logo):
        try:
            logo_path=Path(settings.MEDIA_ROOT) / snapshot_logo if snapshot_logo else Path(profile.company_logo.path)
            logo=Image(str(logo_path),width=50*mm,height=27*mm,kind="proportional")
        except (OSError,ValueError): logo=""
    property_obj=quotation.property
    customer_name=customer_data.get("name", quotation.customer.name)
    customer_mobile=customer_data.get("mobile", quotation.customer.mobile)
    property_name=property_data.get("name") or property_obj.name or property_obj.property_type
    property_address=" - ".join(x for x in [property_data.get("address", property_obj.address),property_data.get("city", property_obj.city)] if x)
    owner_name=contractor_data.get("owner_name") or (profile.owner_name if profile else quotation.contractor.get_full_name())
    customer_block=[Paragraph(customer_name,small_bold),Paragraph(customer_mobile or "",small),Paragraph(property_name,small_bold),Paragraph(property_address,small)]
    inspector=[logo,Paragraph(f"Inspected & estimated by<br/><b>{owner_name}</b>",center)] if logo else [Paragraph(f"<b>{company}</b><br/>Inspected & estimated by<br/>{owner_name}",center)]
    customer_table=Table([[Paragraph("Customer",center),Paragraph("Inspected & Estimated By",center)],[customer_block,inspector]],colWidths=[102*mm,78*mm],rowHeights=[7*mm,40*mm])
    customer_table.setStyle(TableStyle([("BOX",(0,0),(-1,-1),.7,RULE),("INNERGRID",(0,0),(-1,-1),.35,RULE),("BACKGROUND",(0,0),(-1,0),LIGHT_GREY),("TEXTCOLOR",(0,0),(-1,0),MUTED),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("VALIGN",(0,1),(-1,-1),"MIDDLE"),("ALIGN",(1,1),(1,1),"CENTER"),("PADDING",(0,0),(-1,-1),5)]))
    story += [customer_table,Spacer(1,3*mm)]
    rows=[["Sl.","Type of service","Room / Area","Product type","Product description","Brand","MOU","Qty","Coats","Rate","Total"]]
    for index,item in enumerate(quotation.items.all(),1):
        category=item.service_category_name_snapshot or item.custom_service_category or (item.service_category.name if item.service_category else (item.service_type.category if item.service_type else "-"))
        product=item.product_type_name_snapshot or item.custom_product_type or (item.paint_type.name if item.paint_type else "-")
        product_markup = escape(product)
        brand=item.brand_name_snapshot or item.custom_brand or (item.paint_brand.name if item.paint_brand else "-")
        unit=item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else "-")
        room_name=item.room.name if item.room else "-"
        description = item.description or "-"
        room_prefix = f"{room_name} - "
        if room_name != "-" and description.lower().startswith(room_prefix.lower()):
            description = description[len(room_prefix):]
        rows.append([str(index),Paragraph(escape(category),small),Paragraph(escape(room_name),small),Paragraph(product_markup,small),Paragraph(escape(description),small),Paragraph(escape(brand),small),Paragraph(escape(unit),small),f"{item.quantity:.0f}",str(item.coats or 1),f"Rs. {item.rate:,.0f}",f"Rs. {item.amount:,.0f}"])
    while len(rows)<5: rows.append([""]*11)
    service_table=Table(rows,repeatRows=1,colWidths=[6*mm,20*mm,18*mm,20*mm,41*mm,16*mm,10*mm,10*mm,8*mm,15*mm,16*mm],rowHeights=[9*mm]+[None]*(len(rows)-1))
    service_table.setStyle(TableStyle([("BOX",(0,0),(-1,-1),.7,RULE),("INNERGRID",(0,0),(-1,-1),.35,RULE),("BACKGROUND",(0,0),(-1,0),DARK),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("ALIGN",(0,0),(0,-1),"CENTER"),("ALIGN",(7,1),(-1,-1),"RIGHT"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#F8FAFC")]),("FONTSIZE",(0,0),(-1,-1),6.2),("LEADING",(0,0),(-1,-1),8),("PADDING",(0,0),(-1,-1),3.5)]))
    story += [service_table,Spacer(1,2*mm)]
    painting_subtotal=sum((item.amount for item in quotation.items.all() if not item.is_additional_service),Decimal("0"))
    additional_subtotal=sum((item.amount for item in quotation.items.all() if item.is_additional_service),Decimal("0"))
    totals=[["Painting Subtotal",f"Rs. {painting_subtotal:,.0f}"]]
    if additional_subtotal: totals.append(["Additional Services",f"Rs. {additional_subtotal:,.0f}"])
    totals += [["Discount",f"Rs. {quotation.discount:,.0f}"],[f"GST {quotation.gst_percentage}%",f"Rs. {quotation.gst_amount:,.0f}"],["Grand Total",f"Rs. {quotation.grand_total:,.0f}"]]
    totals_table=Table(totals,colWidths=[35*mm,32*mm],hAlign="RIGHT")
    totals_table.setStyle(TableStyle([("BOX",(0,0),(-1,-1),.7,RULE),("INNERGRID",(0,0),(-1,-1),.35,RULE),("BACKGROUND",(0,0),(0,-2),LIGHT_GREY),("BACKGROUND",(0,-1),(-1,-1),BLUE),("TEXTCOLOR",(0,-1),(-1,-1),colors.white),("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("ALIGN",(0,0),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),5)]))
    words=Paragraph(f"<b>{_words(quotation.grand_total)} Rupees Only</b>",small)
    summary=Table([[words,totals_table]],colWidths=[110*mm,70*mm])
    summary.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"BOTTOM"),("PADDING",(0,0),(-1,-1),0)]))
    story.append(summary)
    if quotation.notes:
        note=Table([[Paragraph(f"<b>Note:</b> {quotation.notes}",small)]],colWidths=[180*mm])
        note.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT_BLUE),("BOX",(0,0),(-1,-1),.7,RULE),("PADDING",(0,0),(-1,-1),6)]))
        story.append(note)
    reference_details=[]
    if quotation.payment_terms:
        reference_details.append(("Payment terms", quotation.payment_terms))
    from .product_details import consolidated_product_details
    product_details = consolidated_product_details(quotation)
    if product_details:
        reference_details.append(("Product details", product_details))
    if quotation.work_duration:
        reference_details.append(("Work duration", quotation.work_duration))
    if quotation.work_procedures:
        reference_details.append(("Work procedures", quotation.work_procedures))
    if reference_details:
        story += [Spacer(1,3*mm), Table([[Paragraph("WORK AND PAYMENT DETAILS",small_bold)]],colWidths=[180*mm],style=TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT_GREY),("BOX",(0,0),(-1,-1),.7,RULE),("PADDING",(0,0),(-1,-1),5)]))]
        for label,value in reference_details:
            story.append(Table([[Paragraph(f"<b>{label}:</b> {escape(value).replace(chr(10), '<br/>')}",small)]],colWidths=[180*mm],style=TableStyle([("BOX",(0,0),(-1,-1),.5,RULE),("PADDING",(0,0),(-1,-1),5)])))
    terms=[line.strip() for line in (quotation.terms_conditions or "").splitlines() if line.strip()]
    if terms:
        story += [Spacer(1,3*mm),Table([[Paragraph("TERMS AND CONDITIONS",small_bold)]],colWidths=[180*mm],style=TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT_GREY),("BOX",(0,0),(-1,-1),.7,RULE),("PADDING",(0,0),(-1,-1),5)]))]
        for index,line in enumerate(terms,1):
            story.append(Table([[Paragraph(f"{index}. {escape(line)}",small)]],colWidths=[180*mm],style=TableStyle([("BOX",(0,0),(-1,-1),.5,RULE),("PADDING",(0,0),(-1,-1),5)])))
    prepared_by=quotation.prepared_by or (profile.owner_name if profile else quotation.contractor.get_full_name())
    inspected_by=quotation.inspected_by or (profile.owner_name if profile else quotation.contractor.get_full_name())
    signoff=KeepTogether([Spacer(1,4*mm),Table([[Paragraph("Prepared By",small_bold),Paragraph("Inspected By",small_bold),Paragraph("Thanks and Regards",small_bold)],[Paragraph(escape(prepared_by or "-"),small),Paragraph(escape(inspected_by or "-"),small),Paragraph(escape(company),small)]],colWidths=[60*mm]*3,style=TableStyle([("BOX",(0,0),(-1,-1),.7,RULE),("INNERGRID",(0,0),(-1,-1),.35,RULE),("BACKGROUND",(0,0),(-1,0),LIGHT_BLUE),("PADDING",(0,0),(-1,-1),5)]))])
    story.append(signoff)
    doc.build(story,onFirstPage=_page,onLaterPages=_page)
    return buffer.getvalue()


def build_invoice_pdf(invoice, include_payment_details=True):
    buffer=BytesIO();doc=SimpleDocTemplate(buffer,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=15*mm,title=invoice.invoice_number)
    styles=getSampleStyleSheet();small=ParagraphStyle("invoice-small",parent=styles["BodyText"],fontSize=7.2,leading=9,textColor=DARK);title=ParagraphStyle("invoice-title",parent=styles["Title"],fontSize=23,textColor=colors.white)
    profile=getattr(invoice.contractor,"contractor_profile",None);contractor_data=invoice.contractor_snapshot or {};company=contractor_data.get("company_name") or (profile.company_name if profile else "Bharath Painters")
    banner=Table([[Paragraph("TAX INVOICE" if invoice.tax_mode == "GST" else "INVOICE",title)]],colWidths=[180*mm],style=TableStyle([("BACKGROUND",(0,0),(-1,-1),BLUE),("PADDING",(0,0),(-1,-1),7)]))
    source_number = invoice.quotation_number_snapshot or (invoice.quotation.quotation_number if invoice.quotation_id else "Lump sum")
    meta=[["Invoice #",invoice.invoice_number,"Invoice date",str(invoice.invoice_date)],["Source",source_number,"Due date",str(invoice.due_date or "-")],["Status",invoice.get_status_display(),"Balance due",f"Rs. {invoice.balance_due:,.0f}" if include_payment_details else "-"]]
    meta_table=Table(meta,colWidths=[24*mm,64*mm,24*mm,68*mm],style=TableStyle([("GRID",(0,0),(-1,-1),.5,colors.grey),("BACKGROUND",(0,0),(0,-1),LIGHT_GREY),("BACKGROUND",(2,0),(2,-1),LIGHT_GREY),("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("FONTNAME",(2,0),(2,-1),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),7.5),("PADDING",(0,0),(-1,-1),4)]))
    office_address=contractor_data.get("office_address") or (profile.office_address if profile else "")
    bill=Table([[Paragraph(f"<b>FROM</b><br/>{escape(company)}<br/>{escape(office_address)}",small),Paragraph(f"<b>BILL TO</b><br/>{escape(invoice.customer_name)}<br/>{escape(invoice.customer_mobile)}<br/>{escape(invoice.billing_address)}<br/><b>Project:</b> {escape(invoice.property_name)}",small)]],colWidths=[90*mm,90*mm],style=TableStyle([("BOX",(0,0),(-1,-1),.6,colors.grey),("INNERGRID",(0,0),(-1,-1),.5,colors.grey),("VALIGN",(0,0),(-1,-1),"TOP"),("PADDING",(0,0),(-1,-1),6)]))
    rows=[["Sl.","Service","Room / Area","Product","Description","Brand","MOU","Qty","Rate","Amount"]]
    for i,row in enumerate(invoice.items,1):rows.append([str(i),Paragraph(escape(str(row.get("service") or "-")),small),Paragraph(escape(str(row.get("room") or "-")),small),Paragraph(escape(str(row.get("product_type") or "-")),small),Paragraph(escape(str(row.get("description") or "-")),small),Paragraph(escape(str(row.get("brand") or "-")),small),str(row.get("unit") or "-"),str(row.get("quantity") or 0),f"Rs. {Decimal(str(row.get('rate') or 0)):,.0f}",f"Rs. {Decimal(str(row.get('amount') or 0)):,.0f}"])
    table=Table(rows,repeatRows=1,colWidths=[6*mm,21*mm,18*mm,20*mm,37*mm,16*mm,12*mm,12*mm,17*mm,21*mm],style=TableStyle([("GRID",(0,0),(-1,-1),.5,colors.grey),("BACKGROUND",(0,0),(-1,0),LIGHT_BLUE),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("ALIGN",(7,1),(-1,-1),"RIGHT"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("FONTSIZE",(0,0),(-1,-1),6),("PADDING",(0,0),(-1,-1),3)]))
    totals=[["Subtotal",f"Rs. {invoice.subtotal:,.0f}"],["Discount",f"Rs. {invoice.discount:,.0f}"],[f"GST {invoice.gst_percentage}%",f"Rs. {invoice.gst_amount:,.0f}"],["Grand total",f"Rs. {invoice.grand_total:,.0f}"]]
    if include_payment_details:
        totals += [["Amount paid",f"Rs. {invoice.amount_paid:,.0f}"],["Balance due",f"Rs. {invoice.balance_due:,.0f}"]]
    total_table=Table(totals,colWidths=[40*mm,35*mm],hAlign="RIGHT",style=TableStyle([("GRID",(0,0),(-1,-1),.6,colors.grey),("BACKGROUND",(0,0),(0,-1),LIGHT_GREY),("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("ALIGN",(0,0),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),5)]))
    story=[banner,Spacer(1,3*mm),Paragraph(f"<b>{escape(company)}</b>",styles["Heading2"]),meta_table,Spacer(1,3*mm),bill,Spacer(1,4*mm),table,Spacer(1,3*mm),total_table]
    if invoice.notes:story += [Spacer(1,3*mm),Paragraph(f"<b>Notes:</b> {escape(invoice.notes)}",small)]
    if invoice.terms_conditions:story += [Spacer(1,2*mm),Paragraph(f"<b>Terms and conditions:</b><br/>{escape(invoice.terms_conditions).replace(chr(10),'<br/>')}",small)]
    doc.build(story,onFirstPage=_page,onLaterPages=_page);return buffer.getvalue()


def build_invoice_receipt_pdf(invoice):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm, topMargin=20*mm, bottomMargin=20*mm, title=invoice.receipt_number or "Payment Receipt")
    styles = getSampleStyleSheet()
    profile = getattr(invoice.contractor, "contractor_profile", None)
    contractor_data = invoice.contractor_snapshot or {}
    company = profile.company_name if profile else contractor_data.get("company_name") or "Bharath Painters"
    title = ParagraphStyle("receipt-title", parent=styles["Title"], fontSize=22, textColor=colors.white)
    small = ParagraphStyle("receipt-small", parent=styles["BodyText"], fontSize=9, leading=13, textColor=DARK)
    banner = Table([[Paragraph("PAYMENT RECEIPT", title)]], colWidths=[166*mm], style=TableStyle([("BACKGROUND", (0,0), (-1,-1), BLUE), ("PADDING", (0,0), (-1,-1), 10)]))
    details = [
        ["Receipt number", invoice.receipt_number or "-", "Received on", str(invoice.payment_received_at or invoice.updated_at)],
        ["Invoice number", invoice.invoice_number, "Payments", str(invoice.payments.count())],
        ["Customer", invoice.customer_name, "Payment history", "Listed below"],
        ["Project", invoice.property_name or "-", "Amount received", f"Rs. {invoice.amount_paid:,.0f}"],
        ["Invoice total", f"Rs. {invoice.grand_total:,.0f}", "Balance", f"Rs. {invoice.balance_due:,.0f}"],
    ]
    table = Table(details, colWidths=[31*mm, 52*mm, 31*mm, 52*mm], style=TableStyle([("GRID", (0,0), (-1,-1), .6, RULE), ("BACKGROUND", (0,0), (0,-1), LIGHT_GREY), ("BACKGROUND", (2,0), (2,-1), LIGHT_GREY), ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"), ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8), ("PADDING", (0,0), (-1,-1), 7)]))
    payment_rows = [["Date", "Mode", "Reference", "Amount"]]
    for payment in invoice.payments.all():
        payment_rows.append([str(payment.received_date), payment.get_payment_mode_display(), payment.payment_reference or "-", f"Rs. {payment.amount:,.0f}"])
    payment_table = Table(payment_rows, colWidths=[36*mm, 38*mm, 58*mm, 34*mm], style=TableStyle([("GRID", (0,0), (-1,-1), .5, RULE), ("BACKGROUND", (0,0), (-1,0), LIGHT_BLUE), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("ALIGN", (-1,1), (-1,-1), "RIGHT"), ("FONTSIZE", (0,0), (-1,-1), 8), ("PADDING", (0,0), (-1,-1), 6)]))
    story = [banner, Spacer(1, 5*mm), Paragraph(f"<b>{escape(company)}</b>", styles["Heading2"]), Paragraph("Payment received in full." if invoice.balance_due <= 0 else f"Advance payment received. Balance due: Rs. {invoice.balance_due:,.0f}", small), Spacer(1, 5*mm), table, Spacer(1, 6*mm), Paragraph("<b>Payment history</b>", styles["Heading3"]), Spacer(1, 2*mm), payment_table]
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buffer.getvalue()


def build_advance_receipt_pdf(schedule):
    """Standalone receipt issued before the project invoice exists."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm, topMargin=20*mm, bottomMargin=20*mm, title=schedule.advance_receipt_number or "Advance Payment Receipt")
    styles = getSampleStyleSheet()
    profile = getattr(schedule.quotation.contractor, "contractor_profile", None)
    contractor_data = schedule.quotation.contractor_snapshot or {}
    customer_data = schedule.quotation.customer_snapshot or {}
    property_data = schedule.quotation.property_snapshot or {}
    company = profile.company_name if profile else contractor_data.get("company_name") or "Bharath Painters"
    title = ParagraphStyle("advance-title", parent=styles["Title"], fontSize=21, textColor=colors.white)
    small = ParagraphStyle("advance-small", parent=styles["BodyText"], fontSize=9, leading=13, textColor=DARK)
    property_obj = schedule.quotation.property
    address = ", ".join(filter(None, [property_data.get("address", property_obj.address), property_data.get("city", property_obj.city), property_data.get("pincode", property_obj.pincode)]))
    received_on = schedule.payment_confirmed_at.date() if schedule.payment_confirmed_at else schedule.updated_at.date()
    banner = Table([[Paragraph("ADVANCE PAYMENT RECEIPT", title)]], colWidths=[166*mm], style=TableStyle([("BACKGROUND", (0,0), (-1,-1), BLUE), ("PADDING", (0,0), (-1,-1), 10)]))
    details = [
        ["Receipt number", schedule.advance_receipt_number or "-", "Received on", str(received_on)],
        ["Quotation", schedule.quotation.quotation_number, "Payment mode", schedule.payment_mode or "-"],
        ["Customer", customer_data.get("name", schedule.quotation.customer.name), "Reference", schedule.payment_reference or "-"],
        ["Project", property_data.get("name") or property_obj.name or property_obj.property_type, "Advance received", f"Rs. {schedule.advance_amount:,.0f}"],
        ["Address", Paragraph(escape(address or "-"), small), "Quotation total", f"Rs. {schedule.quotation.grand_total:,.0f}"],
    ]
    table = Table(details, colWidths=[31*mm, 52*mm, 31*mm, 52*mm], style=TableStyle([("GRID", (0,0), (-1,-1), .6, RULE), ("BACKGROUND", (0,0), (0,-1), LIGHT_GREY), ("BACKGROUND", (2,0), (2,-1), LIGHT_GREY), ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"), ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 7)]))
    note = "This receipt confirms advance payment against the quotation. It is not a tax invoice. The advance will be adjusted in the final invoice after project completion."
    story = [banner, Spacer(1, 5*mm), Paragraph(f"<b>{escape(company)}</b>", styles["Heading2"]), Paragraph(note, small), Spacer(1, 5*mm), table]
    if schedule.payment_note:
        story += [Spacer(1, 4*mm), Paragraph(f"<b>Payment note:</b> {escape(schedule.payment_note)}", small)]
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buffer.getvalue()


def build_project_receipt_pdf(receipt):
    buffer = BytesIO()
    quotation = receipt.quotation
    profile = getattr(receipt.contractor, "contractor_profile", None)
    contractor_data = quotation.contractor_snapshot or {}
    customer_data = quotation.customer_snapshot or {}
    property_data = quotation.property_snapshot or {}
    company = profile.company_name if profile else contractor_data.get("company_name") or "Bharath Painters"
    property_obj = quotation.property
    address = ", ".join(filter(None, [property_data.get("address", property_obj.address), property_data.get("city", property_obj.city), property_data.get("pincode", property_obj.pincode)]))
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm, topMargin=20*mm, bottomMargin=20*mm, title=receipt.receipt_number)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("project-receipt-title", parent=styles["Title"], fontSize=21, textColor=colors.white)
    small = ParagraphStyle("project-receipt-small", parent=styles["BodyText"], fontSize=9, leading=13, textColor=DARK)
    banner = Table([[Paragraph("PAYMENT RECEIPT", title)]], colWidths=[166*mm], style=TableStyle([("BACKGROUND", (0,0), (-1,-1), BLUE), ("PADDING", (0,0), (-1,-1), 10)]))
    details = [
        ["Receipt number", receipt.receipt_number, "Received on", str(receipt.received_date)],
        ["Quotation", quotation.quotation_number, "Payment mode", receipt.get_payment_mode_display()],
        ["Customer", customer_data.get("name", quotation.customer.name), "Reference", receipt.payment_reference or "-"],
        ["Project", property_data.get("name") or property_obj.name or property_obj.property_type, "Amount received", f"Rs. {receipt.amount:,.0f}"],
        ["Address", Paragraph(escape(address or "-"), small), "Quotation total", f"Rs. {quotation.grand_total:,.0f}"],
    ]
    table = Table(details, colWidths=[31*mm, 52*mm, 31*mm, 52*mm], style=TableStyle([("GRID", (0,0), (-1,-1), .6, RULE), ("BACKGROUND", (0,0), (0,-1), LIGHT_GREY), ("BACKGROUND", (2,0), (2,-1), LIGHT_GREY), ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"), ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 7)]))
    note = "Payment received against the quotation. This is a receipt, not a tax invoice. It will be adjusted in the final invoice after project completion."
    story = [banner, Spacer(1, 5*mm), Paragraph(f"<b>{escape(company)}</b>", styles["Heading2"]), Paragraph(note, small), Spacer(1, 5*mm), table]
    if receipt.notes:
        story += [Spacer(1, 4*mm), Paragraph(f"<b>Note:</b> {escape(receipt.notes)}", small)]
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buffer.getvalue()


# Preserve every existing endpoint while routing the three primary business
# documents through the shared professional design system.
from .professional_pdf import (
    build_invoice_pdf as _professional_invoice_pdf,
    build_measurement_pdf as _professional_measurement_pdf,
    build_quotation_pdf as _professional_quotation_pdf,
)

_legacy_invoice_pdf = build_invoice_pdf
_english_invoice_receipt_pdf = build_invoice_receipt_pdf
_english_advance_receipt_pdf = build_advance_receipt_pdf
_english_project_receipt_pdf = build_project_receipt_pdf


def build_quotation_pdf(quotation, included_sections=None, language="en"):
    content = _professional_quotation_pdf(quotation, included_sections=included_sections)
    if language == "en":
        return content
    from .pdf_script import localize_document_pdf
    return localize_document_pdf(content, language)


def build_invoice_pdf(invoice, include_payment_details=True, language="en"):
    content = _professional_invoice_pdf(invoice) if include_payment_details else _legacy_invoice_pdf(invoice, include_payment_details=False)
    if language == "en":
        return content
    from .pdf_script import localize_document_pdf
    return localize_document_pdf(content, language)


def build_measurement_pdf(property_obj, measurement_record=None, language="en"):
    content = _professional_measurement_pdf(property_obj, measurement_record)
    if language == "en":
        return content
    from .pdf_script import localize_document_pdf
    return BytesIO(localize_document_pdf(content.getvalue(), language))


def build_invoice_receipt_pdf(invoice, language="en"):
    if language == "en":
        return _english_invoice_receipt_pdf(invoice)
    from .indic_pdf import receipt_pdf
    return receipt_pdf(invoice, language, "invoice")


def build_advance_receipt_pdf(schedule, language="en"):
    if language == "en":
        return _english_advance_receipt_pdf(schedule)
    from .indic_pdf import receipt_pdf
    return receipt_pdf(schedule, language, "advance")


def build_project_receipt_pdf(receipt, language="en"):
    if language == "en":
        return _english_project_receipt_pdf(receipt)
    from .indic_pdf import receipt_pdf
    return receipt_pdf(receipt, language, "project")
