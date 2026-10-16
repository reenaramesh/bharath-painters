from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from jobs.models import WorkSchedule
from quotations.models import Customer, Invoice, InvoicePayment, Property, PropertyContact, Quotation


class CustomerFinancePermissionTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9010710001", role="CONTRACTOR")
        self.owner = BharathUser.objects.create_user(mobile="9010710002", role="CUSTOMER")
        self.viewer = BharathUser.objects.create_user(mobile="9010710003", role="CUSTOMER")
        self.customer = Customer.objects.create(name="Owner", mobile=self.owner.mobile, portal_user=self.owner)
        self.contact_customer = Customer.objects.create(name="Viewer", mobile=self.viewer.mobile, portal_user=self.viewer)
        self.property = Property.objects.create(customer=self.customer, contractor=self.contractor, name="Finance site")
        self.quotation = Quotation.objects.create(customer=self.customer, contractor=self.contractor, property=self.property, quotation_number="PHASE1-Q1")
        WorkSchedule.objects.create(quotation=self.quotation, proposed_by=self.contractor,
            proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate(), status="COMPLETED")
        self.invoice = Invoice.objects.create(quotation=self.quotation, contractor=self.contractor,
            customer=self.customer, site_property=self.property, invoice_number="PHASE1-PRIVATE-INVOICE",
            grand_total=Decimal("100"), amount_paid=Decimal("30"), receipt_number="PHASE1-RECEIPT")
        InvoicePayment.objects.create(invoice=self.invoice, amount=Decimal("30"), payment_mode="UPI", payment_reference="PRIVATE-REF")
        self.client.force_authenticate(self.viewer)

    def grant(self, *permissions):
        PropertyContact.objects.update_or_create(property=self.property, customer=self.contact_customer,
            defaults={"access_level": "CUSTOM", "custom_permissions": list(permissions), "status": "ACTIVE"})

    def finance(self, filtered=False):
        return self.client.get("/api/billing/customer-finance/", {"property_id": self.property.pk} if filtered else {})

    def test_invoice_only_unfiltered_does_not_disclose_payment_information(self):
        self.grant("view_invoices")
        response = self.finance()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_billed"], Decimal("100"))
        for field in ("total_paid", "balance_due", "advance_credit", "receipts_count"):
            self.assertIsNone(response.data[field], field)
        self.assertEqual(response.data["receipts"], [])
        self.assertEqual(response.data["permissions"], {"view_invoices": True, "view_payments": False})

    def test_invoice_only_filtered_returns_available_invoice_total(self):
        self.grant("view_invoices")
        response = self.finance(filtered=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_billed"], Decimal("100"))
        self.assertIsNone(response.data["total_paid"])

    def test_payment_only_retains_finance_without_invoice_document(self):
        self.grant("view_payments")
        for filtered in (False, True):
            response = self.finance(filtered)
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(response.data["total_billed"])
            self.assertEqual(response.data["total_paid"], Decimal("30"))
            self.assertEqual(response.data["balance_due"], Decimal("70"))
            self.assertEqual(response.data["receipts_count"], 1)
            self.assertIsNone(response.data["receipts"][0]["document"])
            self.assertEqual(response.data["receipts"][0]["reference"], "PRIVATE-REF")
            self.assertIsNone(response.data["receipts"][0]["download_url"])
            self.assertEqual(response.data["receipts"][0]["download_unavailable_reason"], "Invoice access is required to download this receipt.")

    def test_primary_and_full_finance_secondary_retain_totals(self):
        self.grant("view_invoices", "view_payments")
        for user in (self.owner, self.viewer):
            self.client.force_authenticate(user)
            for filtered in (False, True):
                response = self.finance(filtered)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["total_billed"], Decimal("100"))
                self.assertEqual(response.data["total_paid"], Decimal("30"))
                self.assertEqual(response.data["balance_due"], Decimal("70"))

    def test_unrelated_customer_has_no_financial_information(self):
        response = self.finance()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["total_billed"])
        self.assertIsNone(response.data["total_paid"])
        self.assertEqual(response.data["receipts"], [])
        self.assertEqual(self.finance(filtered=True).status_code, 403)

    def test_mixed_properties_do_not_use_invoice_right_for_payment_aggregate(self):
        self.grant("view_invoices")
        other_property = Property.objects.create(customer=self.customer, contractor=self.contractor, name="Payment site")
        PropertyContact.objects.create(property=other_property, customer=self.contact_customer,
            access_level="CUSTOM", custom_permissions=["view_payments"])
        other_quote = Quotation.objects.create(customer=self.customer, contractor=self.contractor, property=other_property, quotation_number="PHASE1-Q2")
        WorkSchedule.objects.create(quotation=other_quote, proposed_by=self.contractor,
            proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate(), status="COMPLETED")
        invoice = Invoice.objects.create(quotation=other_quote, contractor=self.contractor, customer=self.customer,
            invoice_number="OTHER-PRIVATE", grand_total=Decimal("200"), amount_paid=Decimal("50"))
        InvoicePayment.objects.create(invoice=invoice, amount=Decimal("50"), payment_mode="CASH")
        response = self.finance()
        self.assertEqual(response.data["total_billed"], Decimal("100"))
        self.assertEqual(response.data["total_paid"], Decimal("50"))
        self.assertEqual(response.data["balance_due"], Decimal("150"))
        self.assertEqual(response.data["receipts_count"], 1)
        self.assertIsNone(response.data["receipts"][0]["document"])

    def test_revoked_secondary_contact_loses_both_financial_scopes(self):
        self.grant("view_invoices", "view_payments")
        PropertyContact.objects.filter(property=self.property, customer=self.contact_customer).update(status="REVOKED")
        response = self.finance()
        self.assertEqual(response.data["receipts"], [])
        self.assertIsNone(response.data["total_paid"])
        self.assertEqual(self.finance(filtered=True).status_code, 403)

    def test_authorized_empty_scope_returns_zero_not_unavailable(self):
        self.grant("view_invoices", "view_payments")
        self.invoice.delete()
        response = self.finance(filtered=True)
        self.assertEqual(response.data["total_billed"], Decimal("0"))
        self.assertEqual(response.data["total_paid"], Decimal("0"))
        self.assertEqual(response.data["receipts_count"], 0)
