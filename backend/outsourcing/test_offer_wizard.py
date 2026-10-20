from copy import deepcopy
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch
from django.urls import reverse
from quotations.models import ContractorCustomerConnection, QuotationItem, Property
from . import test_pricing as fixtures
from .models import SubcontractWorkOrder
from .tests import make_contractor, connect


class OfferWizardTests(fixtures.ContractorPricingTests):
    def setUp(self):
        super().setUp()
        ContractorCustomerConnection.objects.get_or_create(customer=self.customer,contractor=self.main,defaults={"status":"CONNECTED","requested_by":self.main})
        self.second=QuotationItem.objects.create(quotation=self.quotation,description="Electrical finish",quantity=3,rate="33.33",amount="99.99",unit=self.sqft,service_category=self.electrical)
        self.other=make_contractor("9000000288");connect(self.main,self.other)

    def batch(self):
        return {"customer":self.customer.pk,"property":self.property.pk,"quotation":self.quotation.pk,"creation_key":str(uuid4()),
            "assignments":[{"receiving_contractor":self.receiving.pk,"quotation_item_ids":[self.line.pk],"project_title":"Painting work","pricing_input":{"margin_mode":"LINE","lines":[{"source_item":self.line.pk,"margin_type":"PERCENTAGE","margin_value":"10"}]}},
                {"receiving_contractor":self.other.pk,"quotation_item_ids":[self.second.pk],"project_title":"Electrical work","pricing_input":{"margin_mode":"OVERALL","margin_type":"FIXED","margin_value":"1","lines":[{"source_item":self.second.pk}]}}]}

    def save(self,payload=None):
        return self.client.post(reverse("work-order-allocation-drafts"),payload or self.batch(),format="json")

    def test_customer_property_quotation_catalog_and_permissions(self):
        data=self.client.get(reverse("work-order-offer-catalog")).data
        self.assertIn(self.customer.pk,[row["id"] for row in data["customers"]])
        self.assertEqual(data["properties"][0]["customer"],self.customer.pk)
        self.assertEqual(data["quotations"][0]["property"],self.property.pk)
        self.authenticate(self.receiving)
        data=self.client.get(reverse("work-order-offer-catalog")).data
        self.assertFalse(data["customers"]);self.assertFalse(data["properties"]);self.assertFalse(data["quotations"])

    def test_multiple_vendors_selected_basis_and_retry(self):
        payload=self.batch();before=self.quotation.updated_at
        saved=self.save(payload);self.assertEqual(saved.status_code,201,saved.data)
        orders=saved.data["work_orders"];self.assertEqual(len(orders),2)
        self.assertEqual([len(row["scopes"]) for row in orders],[1,1])
        self.assertTrue(all(row["status"]=="DRAFT" for row in orders))
        self.assertTrue(all(len(row["private_pricing"]["full_source_snapshot"]["items"])==2 for row in orders))
        self.quotation.refresh_from_db();self.assertEqual(self.quotation.updated_at,before)
        retry=self.save(payload);self.assertEqual(retry.status_code,200,retry.data)
        self.assertEqual(SubcontractWorkOrder.objects.count(),2)
        self.assertEqual(self.save().status_code,400)
        catalog=self.client.get(reverse("work-order-offer-catalog")).data
        self.assertEqual(set(catalog["quotations"][0]["allocated_item_ids"]),{self.line.pk,self.second.pk})

    def test_duplicate_foreign_scope_and_dependencies_rejected(self):
        payload=self.batch();payload["assignments"][1]["quotation_item_ids"]=[self.line.pk]
        payload["assignments"][1]["pricing_input"]["lines"]=[{"source_item":self.line.pk}]
        self.assertEqual(self.save(payload).status_code,400)
        payload=self.batch();payload["property"]=Property.objects.create(customer=self.customer,contractor=self.main,name="Other",property_type="2BHK").pk
        self.assertEqual(self.save(payload).status_code,404)
        payload=self.batch();payload["customer"]=self.other.pk
        self.assertNotEqual(self.save(payload).status_code,201)
        self.assertFalse(SubcontractWorkOrder.objects.exists())

    def test_atomic_batch_failure_and_unassigned_work(self):
        with patch("outsourcing.allocations.save_pricing",side_effect=RuntimeError("forced failure")):
            with self.assertRaises(RuntimeError):self.save()
        self.assertFalse(SubcontractWorkOrder.objects.exists())
        payload=self.batch();payload["assignments"]=payload["assignments"][:1]
        saved=self.save(payload);self.assertEqual(saved.status_code,201,saved.data)
        catalog=self.client.get(reverse("work-order-offer-catalog")).data
        self.assertEqual(catalog["quotations"][0]["allocated_item_ids"],[self.line.pk])

    def test_explicit_gst_and_allocated_draft_restoration(self):
        self.quotation.discount_value=0;self.quotation.gst_mode="GST_INCLUDED";self.quotation.gst_percentage=18;self.quotation.save()
        self.line.quantity=1;self.line.rate=118;self.line.amount=118;self.line.save()
        for mode,tax,total in [("NO_GST","0.00","90.00"),("GST_EXTRA","16.20","106.20"),("GST_INCLUDED","13.73","90.00")]:
            payload=self.batch();payload["assignments"]=payload["assignments"][:1]
            payload["assignments"][0]["pricing_input"].update(gst_mode=mode,gst_percentage="18")
            saved=self.save(payload);self.assertEqual(saved.status_code,201,saved.data)
            order=saved.data["work_orders"][0]
            self.assertEqual(order["pricing_quote"]["tax_amount"],tax);self.assertEqual(order["agreed_amount"],total)
            edit={"expected_updated_at":order["updated_at"],"quotation_item_ids":[self.line.pk],"pricing_input":payload["assignments"][0]["pricing_input"]}
            restored=self.client.patch(reverse("work-order-draft-pricing",kwargs={"pk":order["id"]}),edit,format="json")
            self.assertEqual(restored.status_code,200,restored.data)
            self.assertEqual(restored.data["agreed_amount"],total)
            record=SubcontractWorkOrder.objects.get(pk=order["id"]);record.status="DECLINED";record.save()


for name in vars(fixtures.ContractorPricingTests):
    if name.startswith("test_") and name not in OfferWizardTests.__dict__:setattr(OfferWizardTests,name,None)
