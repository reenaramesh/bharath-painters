"""Recipient-safe Work Order PDF. Selling references are never read here."""
from io import BytesIO
from html import escape
from decimal import Decimal
import json
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def build_work_order_pdf(order):
    from .serializers import user_label
    stream=BytesIO()
    styles=getSampleStyleSheet()
    text=lambda value:Paragraph(escape(str(value or "")).replace("\n","<br/>"),styles["BodyText"])
    money=lambda value:f"{Decimal(value or 0):,.2f}"
    story=[Paragraph("CONTRACTOR WORK ORDER",styles["Title"]),text(order.reference),text(order.project_title),
           text(f"Status: {order.status} | {order.material_mode.replace('_',' ') or 'Scope offer'}"),
           text(f"Main contractor: {user_label(order.main_contractor)}"),
           text(f"Recipient: {user_label(order.receiving_contractor) if order.receiving_contractor else 'Not selected'}"),
           text(order.site_address),Spacer(1,5*mm)]
    quote=order.quotes.filter(is_current=True,created_by=order.main_contractor).prefetch_related("quote_lines").first() if order.material_mode else None
    if quote:
        config=quote.pricing
        discount_label = 'Each line separately' if config.get('discount_mode') == 'LINE' else f"Overall {config.get('discount_type')} {config.get('discount_value')}"
        story.extend([text(f"Agreed discount: {discount_label}"),text(f"GST: {config.get('gst_mode')} {config.get('gst_percentage')} %"),Spacer(1,3*mm)])
        rows=[[text(label) for label in ["Work / specification","Quantity","Unit","Rate","Gross","Discount","Net"]]]
        from quotations.discounts import discount_amount
        for line in quote.quote_lines.all():
            spec=json.loads(line.specification or "{}")
            detail="\n".join(filter(None,[spec.get("description") or line.description_snapshot,spec.get("scope_name"),spec.get("service"),spec.get("product"),spec.get("brand"),spec.get("colour"),spec.get("features"),f"Coats: {spec.get('coats',1)}; Primer: {spec.get('primer_coats',0)}",", ".join(spec.get("rooms",[])),", ".join(spec.get("surfaces",[]))]))
            discount=discount_amount(line.amount,line.discount_type,line.discount_value) if quote.pricing.get("discount_mode") == "LINE" else Decimal("0")
            rows.append([text(detail),text(line.quantity),text(line.unit_name_snapshot),text(money(line.unit_rate)),text(money(line.amount)),text(money(discount)),text(money(line.amount-discount))])
        table=Table(rows,colWidths=[62*mm,17*mm,18*mm,21*mm,22*mm,21*mm,23*mm],repeatRows=1,hAlign="LEFT")
        table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#e8f0f5")),("GRID",(0,0),(-1,-1),.4,colors.HexColor("#cbd5e1")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5)]))
        story.extend([table,Spacer(1,5*mm),text(f"Subtotal: INR {money(quote.subtotal)}"),text(f"Discount: INR {money(quote.pricing.get('discount',0))}"),text(f"GST: INR {money(quote.tax_amount)}"),text(f"Contractor payable: INR {money(quote.total)}")])
    else:
        story.extend(text(f"{scope.title_snapshot} — {scope.quantity} {scope.unit_name_snapshot}") for scope in order.scopes.all())
    story.extend([Spacer(1,5*mm),text(order.agreed_scope_summary),text(order.instructions),text(order.terms)])
    SimpleDocTemplate(stream,rightMargin=13*mm,leftMargin=13*mm,topMargin=14*mm,bottomMargin=14*mm,title=order.reference).build(story)
    return stream.getvalue()
