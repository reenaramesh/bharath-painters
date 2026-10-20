from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
import json
import pymupdf
from django.urls import reverse
from . import test_pricing as pricing_fixture
from .models import SubcontractWorkOrder
from quotations.models import QuotationItem


class MarginWorkflowTests(pricing_fixture.ContractorPricingTests):
    def payload(self, **kwargs):
        return {"quotation": self.quotation.pk, "receiving_contractor": self.receiving.pk,
            "project_title": "Margin work", "material_mode": "WITH_MATERIAL", "quotation_item_ids": [self.line.pk],
            "pricing_input": {"margin_mode": "LINE", "lines": [{"source_item": self.line.pk, "margin_type": "PERCENTAGE", "margin_value": "10"}]}}

    def test_margin_source_snapshot_and_no_rate_override(self):
        self.line.custom_service_type="Custom finish"
        self.line.custom_product_type="Custom material"
        self.line.custom_brand="Custom brand"
        self.line.save()
        before = self.quotation.updated_at
        created = self.create_order()
        self.assertEqual(created.status_code, 201, created.data)
        source = created.data["private_pricing"]["source_snapshot"]
        self.assertEqual(source["items"][0]["specification"]["service"],"Custom finish")
        self.assertEqual(source["items"][0]["specification"]["product"],"Custom material")
        self.assertEqual(source["items"][0]["specification"]["brand"],"Custom brand")
        eligible = Decimal(source["items"][0]["eligible_amount"])
        expected = eligible - (eligible * Decimal("0.1")).quantize(Decimal("0.01"))
        self.assertEqual(Decimal(created.data["agreed_amount"]), expected)
        self.quotation.refresh_from_db()
        self.assertEqual(before, self.quotation.updated_at)
        payload = self.payload()
        payload["pricing_input"]["lines"][0]["unit_rate"] = "1"
        self.assertEqual(self.create_order(payload).status_code, 400)

    def test_overall_rounding_and_mixed_margins(self):
        second = QuotationItem.objects.create(quotation=self.quotation, description="Second work", quantity="3", rate="33.33", amount="99.99", unit=self.sqft)
        payload = self.payload()
        payload["quotation_item_ids"].append(second.pk)
        payload["pricing_input"]["lines"].append({"source_item": second.pk, "margin_type": "FIXED", "margin_value": "10"})
        for kind, value in [("PERCENTAGE", "12.34"), ("FIXED", "100.01")]:
            payload["pricing_input"].update(margin_mode="OVERALL", margin_type=kind, margin_value=value)
            created = self.create_order(payload)
            self.assertEqual(created.status_code, 201, created.data)
            private = created.data["private_pricing"]
            basis = sum(Decimal(line["eligible_amount"]) for line in private["source_snapshot"]["items"])
            retained = sum(Decimal(line["retained_amount"]) for line in private["margin"]["lines"])
            self.assertEqual(retained, Decimal(value) if kind == "FIXED" else (basis * Decimal(value)/100).quantize(Decimal("0.01")))
            lines = created.data["pricing_quote"]["quote_lines"]
            self.assertEqual(sum(Decimal(line["amount"]) for line in lines), basis - retained)
            for line in lines:
                self.assertEqual((Decimal(line["quantity"])*Decimal(line["unit_rate"])).quantize(Decimal("0.01")), Decimal(line["amount"]))
        payload["pricing_input"]["margin_mode"] = "LINE"
        self.assertEqual(self.create_order(payload).status_code, 201)
        payload["quotation_item_ids"] = [self.line.pk]
        self.assertEqual(self.create_order(payload).status_code, 400)

    def test_privacy_transparency_pin_and_pdf(self):
        self.property.address = "Secret home address"
        self.property.city = "Bengaluru"
        self.property.google_maps_url = "https://maps.google.com/?q=12.345,77.678"
        self.property.save()
        payload = self.payload()
        created = self.create_order(payload)
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        order = SubcontractWorkOrder.objects.get(pk=pk)
        order.status = "SENT"; order.save()
        self.authenticate(self.receiving)
        recipient = self.client.get(reverse("work-order-detail", kwargs={"pk": pk})).data
        self.assertNotIn("private_pricing", recipient)
        self.assertFalse(recipient["pricing_adjustment"])
        self.assertFalse(recipient["site_details"]["site_pin"])
        self.assertNotIn("Secret home address", json.dumps(recipient))
        pdf = self.client.get(reverse("work-order-pdf", kwargs={"pk": pk}))
        with pymupdf.open(stream=pdf.content, filetype="pdf") as document:
            text = " ".join(page.get_text() for page in document)
        self.assertNotIn("987.65", text)
        self.assertNotIn("Secret home address", text)
        self.assertIn(f"{order.agreed_amount:,.2f}", text)
        self.authenticate(self.main)
        projection = self.client.get(reverse("work-order-open-preview", kwargs={"pk": pk})).data
        self.assertNotIn("Secret home address", json.dumps(projection))
        self.assertNotIn("987.65", json.dumps(projection))
        self.assertEqual(projection["approximate_location"], "Bengaluru")
        order.status="DRAFT";order.save()
        payload["pricing_input"].update(share_site_pin=True, share_customer_address=True, share_customer_contact=True, show_pricing_adjustment=True)
        payload["expected_updated_at"]=order.updated_at.isoformat()
        saved=self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":pk}),payload,format="json")
        self.assertEqual(saved.status_code,200,saved.data)
        self.assertTrue(saved.data["pricing_adjustment"])
        self.assertTrue(saved.data["site_details"]["site_pin"])
        self.assertTrue(saved.data["site_details"]["customer_contact"])
        order.refresh_from_db()
        from . import workflow
        workflow.transition(self.main,order,"SENT")
        self.authenticate(self.receiving)
        recipient=self.client.get(reverse("work-order-detail",kwargs={"pk":pk})).data
        self.assertTrue(recipient["pricing_adjustment"])
        self.assertNotIn("private_pricing",recipient)
        pdf=self.client.get(reverse("work-order-pdf",kwargs={"pk":pk}))
        with pymupdf.open(stream=pdf.content,filetype="pdf") as document:
            text=" ".join(page.get_text() for page in document)
        self.assertIn("987.65",text)
        self.assertIn("Secret home address",text)
        self.authenticate(self.main)
        public=self.client.get(reverse("work-order-open-preview",kwargs={"pk":pk})).data
        self.assertNotIn("987.65",json.dumps(public))
        self.assertNotIn("Secret home address",json.dumps(public))
        self.assertNotIn("maps.google.com",json.dumps(public))

    def test_frozen_source_restore_atomic_failure_and_bounds(self):
        created=self.create_order()
        self.assertEqual(created.status_code,201,created.data)
        order=SubcontractWorkOrder.objects.get(pk=created.data["id"])
        source=deepcopy(order.private_pricing["source_snapshot"])
        self.line.rate=1;self.line.save()
        payload=self.payload();payload["expected_updated_at"]=order.updated_at.isoformat()
        payload["pricing_input"]["lines"][0]["margin_value"]="20"
        with patch("outsourcing.models.SubcontractQuoteLine.save",side_effect=RuntimeError("forced failure")):
            with self.assertRaises(RuntimeError):
                self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":order.pk}),payload,format="json")
        order.refresh_from_db();self.assertEqual(order.private_pricing["source_snapshot"],source)
        saved=self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":order.pk}),payload,format="json")
        self.assertEqual(saved.status_code,200,saved.data)
        self.assertEqual(saved.data["private_pricing"]["source_snapshot"],source)
        payload["expected_updated_at"]=saved.data["updated_at"]
        payload["pricing_input"]["lines"][0]["margin_value"]="101"
        self.assertEqual(self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":order.pk}),payload,format="json").status_code,400)

    def test_included_gst_is_not_margin_and_preview_does_not_save(self):
        self.line.quantity=1;self.line.rate=Decimal("118");self.line.amount=Decimal("118");self.line.save()
        self.quotation.discount_value=0;self.quotation.gst_mode="GST_INCLUDED";self.quotation.gst_percentage=18;self.quotation.save()
        payload=self.payload()
        before=SubcontractWorkOrder.objects.count()
        preview=self.client.post(reverse("work-order-margin-preview"),payload,format="json")
        self.assertEqual(preview.status_code,200,preview.data)
        self.assertEqual(preview.data["source_snapshot"]["items"][0]["eligible_amount"],"100.00")
        self.assertEqual(preview.data["totals"]["subtotal"],"90.00")
        self.assertEqual(preview.data["totals"]["grand_total"],"90.00")
        self.assertEqual(Decimal(preview.data["totals"]["gst_amount"]),Decimal("0.00"))
        payload["pricing_input"].update(gst_mode="GST_EXTRA",gst_percentage="18")
        preview=self.client.post(reverse("work-order-margin-preview"),payload,format="json")
        self.assertEqual(preview.status_code,200,preview.data)
        self.assertEqual(preview.data["totals"]["grand_total"],"106.20")
        self.assertEqual(SubcontractWorkOrder.objects.count(),before)

    def test_independent_location_permissions_and_recipient_access(self):
        self.property.address="Private address";self.property.city="City";self.property.google_maps_url="https://maps.google.com/?q=12,77";self.property.save()
        for permission in ("share_site_pin","share_customer_address","share_customer_contact"):
            payload=self.payload();payload["pricing_input"][permission]=True
            created=self.create_order(payload)
            self.assertEqual(created.status_code,201,created.data)
            pk=created.data["id"]
            self.authenticate(self.receiving)
            self.assertEqual(self.client.get(reverse("work-order-detail",kwargs={"pk":pk})).status_code,404)
            self.assertEqual(self.client.post(reverse("work-order-margin-preview"),{**payload,"work_order":pk},format="json").status_code,404)
            order=SubcontractWorkOrder.objects.get(pk=pk);order.status="SENT";order.save()
            data=self.client.get(reverse("work-order-detail",kwargs={"pk":pk})).data
            site=data["site_details"]
            self.assertEqual(bool(site["site_pin"]),permission=="share_site_pin")
            self.assertEqual(bool(site["address"]),permission=="share_customer_address")
            self.assertEqual(bool(site["customer_contact"]),permission=="share_customer_contact")
            self.assertNotIn("private_pricing",data)
            self.assertNotEqual(self.client.post(reverse("work-order-margin-preview"),{**payload,"work_order":pk},format="json").status_code,200)
            self.authenticate(self.main)
            public=self.client.get(reverse("work-order-open-preview",kwargs={"pk":pk})).data
            self.assertNotIn("Private address",json.dumps(public))
            self.assertNotIn("maps.google.com",json.dumps(public))

    def test_issued_identity_rejection_new_vendor_and_status_locks(self):
        from .tests import make_contractor,connect
        from . import workflow
        created=self.create_order()
        self.assertEqual(created.status_code,201,created.data)
        order=SubcontractWorkOrder.objects.get(pk=created.data["id"])
        workflow.transition(self.main,order,"SENT")
        identity=deepcopy(order.private_pricing["issued_identity"])
        self.receiving.first_name="Changed profile";self.receiving.save()
        self.authenticate(self.receiving)
        data=self.client.get(reverse("work-order-detail",kwargs={"pk":order.pk})).data
        self.assertEqual(data["receiving_contractor_name"],identity["vendor"])
        workflow.transition(self.receiving,order,"DECLINED",note="Different availability")
        self.authenticate(self.main)
        payload=self.payload();payload["expected_updated_at"]=order.updated_at.isoformat()
        self.assertEqual(self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":order.pk}),payload,format="json").status_code,400)
        vendor=make_contractor("9000000291");connect(self.main,vendor)
        payload["receiving_contractor"]=vendor.pk
        replacement=self.create_order(payload)
        self.assertEqual(replacement.status_code,201,replacement.data)
        self.assertNotEqual(replacement.data["id"],order.pk)
        order.refresh_from_db();self.assertEqual(order.status,"DECLINED")
        self.assertEqual(order.receiving_contractor_id,self.receiving.pk)
        self.assertEqual(order.private_pricing["issued_identity"],identity)

    def test_stale_edit_and_margin_only_api_lock(self):
        created=self.create_order()
        self.assertEqual(created.status_code,201,created.data)
        payload=self.payload();payload["expected_updated_at"]=created.data["updated_at"]
        url=reverse("work-order-draft-pricing",kwargs={"pk":created.data["id"]})
        saved=self.client.patch(url,payload,format="json")
        self.assertEqual(saved.status_code,200,saved.data)
        self.assertEqual(self.client.patch(url,payload,format="json").status_code,409)
        legacy=pricing_fixture.ContractorPricingTests.payload(self)
        legacy["expected_updated_at"]=saved.data["updated_at"]
        self.assertEqual(self.client.patch(url,legacy,format="json").status_code,400)

    def test_invalid_preview_ids_and_unknown_financial_fields(self):
        for key in ("quotation","work_order"):
            payload=self.payload();payload[key]={"invalid":"identifier"}
            self.assertEqual(self.client.post(reverse("work-order-margin-preview"),payload,format="json").status_code,400)
        payload=self.payload();payload["pricing_input"]["lines"][0]["amount"]="1"
        self.assertEqual(self.create_order(payload).status_code,400)
        payload=self.payload();payload["pricing_input"]["vendor_rate"]="1"
        self.assertEqual(self.create_order(payload).status_code,400)


# Reuse setup/helpers without rerunning inherited legacy payload cases.
for name in list(vars(pricing_fixture.ContractorPricingTests)):
    if name.startswith("test_") and name not in MarginWorkflowTests.__dict__:
        setattr(MarginWorkflowTests,name,None)
