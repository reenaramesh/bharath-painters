from copy import deepcopy
from decimal import Decimal
import json
from unittest.mock import patch
from django.urls import reverse
from django.utils.dateparse import parse_datetime
from rest_framework import status
from . import tests as fixtures
from .models import SubcontractWorkOrder
from quotations.models import Quotation, QuotationItem


class ContractorPricingTests(fixtures.OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.quotation.status = Quotation.Status.ACCEPTED
        self.quotation.discount_value = Decimal("777.77")
        self.quotation.save()
        self.line = QuotationItem.objects.create(
            quotation=self.quotation, description="Paint walls", quantity=10, rate="987.65", amount="9876.50",
            unit=self.sqft, service_category=self.painting, coats=2,
            specification_details={"private_price":"987.65","primer_coats":1},
        )
        self.authenticate(self.main)

    def payload(self, mode="WITH_MATERIAL", rate="11.11", discount_mode="LINE"):
        line={"source_item":self.line.pk,"discount_type":"PERCENTAGE","discount_value":"10"}
        if rate is not None: line["unit_rate"]=rate
        return {"quotation":self.quotation.pk,"receiving_contractor":self.receiving.pk,
                "project_title":"Independent priced work","material_mode":mode,"quotation_item_ids":[self.line.pk],
                "pricing_input":{"discount_mode":discount_mode,"discount_type":"FIXED","discount_value":"5",
                                 "gst_mode":"NO_GST","gst_percentage":"0","lines":[line]}}

    def create_order(self, payload=None):
        return self.client.post(reverse("work-order-list-create"),payload or self.payload(),format="json")

    def test_independent_draft_restoration_discounts_and_pinned_source(self):
        before=self.quotation.updated_at
        response=self.create_order()
        self.assertEqual(response.status_code,201,response.data)
        order=SubcontractWorkOrder.objects.get(pk=response.data["id"])
        self.assertEqual(order.status,"DRAFT")
        self.assertEqual(order.agreed_amount,Decimal("99.99"))
        self.assertEqual(order.quotation_id,self.quotation.pk)
        data=self.client.get(reverse("work-order-detail",kwargs={"pk":order.pk})).data
        self.assertEqual(data["pricing_quote"]["quote_lines"][0]["unit_rate"],"11.11")
        self.assertEqual(data["private_pricing"]["lines"][0]["original_rate"],"987.65")
        self.quotation.refresh_from_db();self.line.refresh_from_db()
        self.assertEqual(self.quotation.updated_at,before)
        self.assertEqual(self.line.rate,Decimal("987.65"))
        for kind,value,total in [("PERCENTAGE","10","99.99"),("FIXED","5","106.10")]:
            payload=self.payload(discount_mode="OVERALL")
            payload["pricing_input"].update(discount_type=kind,discount_value=value)
            created=self.create_order(payload)
            self.assertEqual(created.status_code,201,created.data)
            self.assertEqual(Decimal(created.data["agreed_amount"]),Decimal(total))

    def test_creation_retry_reuses_the_draft_and_source_identifiers_survive_edit(self):
        from uuid import uuid4
        payload=self.payload();payload["creation_key"]=str(uuid4())
        first=self.create_order(payload);retry=self.create_order(payload)
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(retry.status_code,200,retry.data)
        self.assertEqual(first.data["id"],retry.data["id"])
        self.assertEqual(SubcontractWorkOrder.objects.count(),1)
        payload["expected_updated_at"]=first.data["updated_at"]
        saved=self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":first.data["id"]}),payload,format="json")
        self.assertEqual(saved.status_code,200,saved.data)
        self.assertEqual(first.data["scopes"][0]["id"],saved.data["scopes"][0]["id"])
        self.assertEqual(first.data["pricing_quote"]["quote_lines"][0]["id"],saved.data["pricing_quote"]["quote_lines"][0]["id"])

    def test_multiple_saved_material_lines_keep_specs_and_mixed_discounts(self):
        from quotations.models import PaintType, PaintBrand, ServiceType
        product=PaintType.objects.create(name="QA washable finish",service_category=self.painting,created_by=self.main)
        brand=PaintBrand.objects.create(name="QA brand",created_by=self.main)
        service=ServiceType.objects.create(name="QA ceiling process",category_master=self.painting,created_by=self.main)
        other=QuotationItem.objects.create(quotation=self.quotation,description="Ceiling finish",quantity=3,rate=40,amount=120,
            unit=self.sqft,service_category=self.painting,service_type=service,paint_type=product,paint_brand=brand,coats=3,
            included_areas=["Living room ceiling"],specification_details={"primer_coats":1,"selling_discount":"777.77",
              "contributions":[{"room_name":"Living room","sources":[{"name":"Ceiling 1","quantity":3,"rate":"987.65"}]}]})
        payload=self.payload();payload["quotation_item_ids"].append(other.pk)
        payload["pricing_input"].update(gst_mode="GST_EXTRA",gst_percentage="18")
        payload["pricing_input"]["lines"].append({"source_item":other.pk,"unit_rate":"7.50","discount_type":"FIXED","discount_value":"1.25"})
        response=self.create_order(payload)
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data["agreed_amount"],"143.06")
        self.assertEqual(response.data["pricing_quote"]["pricing"]["discount"],"12.36")
        self.assertEqual(response.data["pricing_quote"]["tax_amount"],"21.82")
        lines=response.data["pricing_quote"]["quote_lines"]
        self.assertEqual([line["quantity"] for line in lines],["10.00","3.00"])
        spec=json.loads(lines[1]["specification"])
        self.assertEqual((spec["service"],spec["product"],spec["brand"],spec["coats"],spec["primer_coats"]),
                         ("QA ceiling process","QA washable finish","QA brand",3,1))
        self.assertNotIn("selling_discount",spec)
        self.assertEqual(spec["surfaces"],["Living room - Ceiling 1: 3"])
        self.assertNotIn("987.65",json.dumps(spec))
        pdf=self.client.get(reverse("work-order-pdf",kwargs={"pk":response.data["id"]}))
        import pymupdf
        with pymupdf.open(stream=pdf.content,filetype="pdf") as document:
            text=" ".join("".join(page.get_text() for page in document).split())
        self.assertIn("143.06",text)
        self.assertIn("QA washable finish",text)
        self.assertNotIn("777.77",text)

    def test_labour_rates_must_be_explicit_or_use_private_adjustment(self):
        payload=self.payload("WITHOUT_MATERIAL",rate=None)
        failed=self.create_order(payload)
        self.assertEqual(failed.status_code,400,failed.data)
        self.assertEqual(SubcontractWorkOrder.objects.count(),0)
        payload["pricing_input"].update(labour_method="SELLING_PERCENT",adjustment_percent="50")
        payload["pricing_input"]["lines"][0]["discount_value"]="0"
        created=self.create_order(payload)
        self.assertEqual(created.status_code,201,created.data)
        self.assertEqual(created.data["pricing_quote"]["quote_lines"][0]["unit_rate"],"493.82")

    def test_recipients_only_see_agreed_values_and_acceptance_reuses_price_document(self):
        created=self.create_order()
        self.assertEqual(created.status_code,201,created.data)
        pk=created.data["id"]
        detail=reverse("work-order-detail",kwargs={"pk":pk})
        pdf_url=reverse("work-order-pdf",kwargs={"pk":pk})
        self.authenticate(self.receiving)
        self.assertEqual(self.client.get(detail).status_code,404)
        self.assertEqual(self.client.get(pdf_url).status_code,404)
        self.authenticate(self.main)
        sent=self.client.post(reverse("work-order-transition",kwargs={"pk":pk}),{"status":"SENT"},format="json")
        self.assertEqual(sent.status_code,200,sent.data)
        self.authenticate(self.receiving)
        data=self.client.get(detail).data
        text=json.dumps(data,default=str)
        self.assertNotIn("private_pricing",data)
        self.assertNotIn("987.65",text)
        self.assertNotIn("777.77",text)
        self.assertNotIn("private_price",text)
        self.assertEqual(data["agreed_amount"],"99.99")
        pdf=self.client.get(pdf_url)
        self.assertEqual(pdf.status_code,200)
        import pymupdf
        with pymupdf.open(stream=pdf.content,filetype="pdf") as document:
            rendered=" ".join("".join(page.get_text() for page in document).split())
        self.assertIn("99.99",rendered)
        self.assertNotIn("987.65",rendered)
        self.assertNotIn("9,876.50",rendered)
        accepted=self.client.post(reverse("work-order-transition",kwargs={"pk":pk}),{"status":"ACCEPTED"},format="json")
        self.assertEqual(accepted.status_code,200,accepted.data)
        self.assertEqual(SubcontractWorkOrder.objects.get(pk=pk).quotes.get(is_current=True).status,"ACCEPTED")
        self.authenticate(self.employee)
        self.assertEqual(self.client.get(detail).status_code,400)

    def test_draft_edit_is_atomic_and_stale_or_sent_edits_are_rejected(self):
        created=self.create_order()
        self.assertEqual(created.status_code,201,created.data)
        pk=created.data["id"]
        url=reverse("work-order-draft-pricing",kwargs={"pk":pk})
        payload=self.payload()
        payload["expected_updated_at"]=created.data["updated_at"]
        payload["pricing_input"]["lines"][0]["unit_rate"]="12.34"
        saved=self.client.patch(url,payload,format="json")
        self.assertEqual(saved.status_code,200,saved.data)
        self.assertEqual(saved.data["agreed_amount"],"111.06")
        self.assertEqual(self.client.patch(url,payload,format="json").status_code,409)
        payload["expected_updated_at"]=saved.data["updated_at"]
        payload["pricing_input"]["lines"][0]["unit_rate"]="88.88"
        payload["project_title"]="This failed change must roll back"
        with patch("outsourcing.models.SubcontractQuoteLine.save",side_effect=RuntimeError("late pricing failure")):
            with self.assertRaises(RuntimeError):self.client.patch(url,payload,format="json")
        order=SubcontractWorkOrder.objects.get(pk=pk)
        self.assertEqual(order.agreed_amount,Decimal("111.06"))
        self.assertEqual(order.updated_at,parse_datetime(saved.data["updated_at"]))
        self.assertEqual(order.project_title,"Independent priced work")
        self.assertEqual(order.quotes.get(is_current=True).quote_lines.get().unit_rate,Decimal("12.34"))
        self.client.post(reverse("work-order-transition",kwargs={"pk":pk}),{"status":"SENT"},format="json")
        self.assertEqual(self.client.patch(url,payload,format="json").status_code,400)

    def test_tax_fixed_line_discount_caps_and_validation(self):
        for mode,kind,value,gst,percent,total,tax in [
            ("LINE","PERCENTAGE","10","GST_EXTRA","18","117.99","18.00"),
            ("LINE","PERCENTAGE","10","GST_INCLUDED","18","99.99","15.25"),
            ("LINE","FIXED","5","GST_EXTRA","18","125.20","19.10"),
            ("LINE","FIXED","99999","GST_EXTRA","18","0.00","0.00"),
            ("OVERALL","PERCENTAGE","10","GST_EXTRA","18","117.99","18.00"),
            ("OVERALL","FIXED","5","GST_EXTRA","18","125.20","19.10"),
        ]:
            payload=self.payload(discount_mode=mode)
            payload["pricing_input"].update(discount_type=kind,discount_value=value,gst_mode=gst,gst_percentage=percent)
            payload["pricing_input"]["lines"][0].update(discount_type=kind,discount_value=value)
            response=self.create_order(payload)
            self.assertEqual(response.status_code,201,response.data)
            self.assertEqual(response.data["agreed_amount"],total)
            self.assertEqual(response.data["pricing_quote"]["tax_amount"],tax)
        payload=self.payload();payload["quotation_item_ids"]*=2
        self.assertEqual(self.create_order(payload).status_code,400)
        payload=self.payload();payload["pricing_input"]["lines"][0]["discount_value"]="101"
        self.assertEqual(self.create_order(payload).status_code,400)
        self.quotation.status="DRAFT";self.quotation.save()
        self.assertEqual(self.create_order().status_code,400)

    def test_recipient_and_customer_cannot_edit_pricing_or_read_private_quote(self):
        created=self.create_order();pk=created.data["id"]
        self.client.post(reverse("work-order-transition",kwargs={"pk":pk}),{"status":"SENT"},format="json")
        self.authenticate(self.receiving)
        private_url=reverse("quotation-detail",kwargs={"pk":self.quotation.pk})
        self.assertEqual(self.client.get(private_url).status_code,403)
        payload=self.payload();payload["expected_updated_at"]=created.data["updated_at"]
        self.assertEqual(self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":pk}),payload,format="json").status_code,400)
        quotes=self.client.get(reverse("work-order-quote",kwargs={"pk":pk}))
        self.assertNotIn("987.65",json.dumps(quotes.data,default=str))
        self.assertNotIn("777.77",json.dumps(quotes.data,default=str))
        self.assertEqual(self.client.patch(reverse("work-order-quote",kwargs={"pk":pk}),{"quote":created.data["pricing_quote"]["id"]},format="json").status_code,400)
        self.authenticate(self.customer_user)
        self.assertEqual(self.client.get(reverse("work-order-pdf",kwargs={"pk":pk})).status_code,400)
