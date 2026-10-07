from decimal import Decimal

from django.urls import reverse
from rest_framework import status

from quotations.models import Quotation, QuotationItem
from . import workflow
from .models import SubcontractWorkOrder
from .models import SubcontractQuote
from .tests import OutsourcingTestBase


class QuotationScopeOfferTests(OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.line = QuotationItem.objects.create(
            quotation=self.quotation, description="Paint bedroom walls",
            service_category=self.painting, unit=self.sqft,
            quantity=Decimal("250"), rate=Decimal("85"),
        )
        self.other_line = QuotationItem.objects.create(
            quotation=self.quotation, description="Electrical work",
            service_category=self.electrical, unit=self.sqft,
            quantity=Decimal("20"), rate=Decimal("100"),
        )
        self.authenticate(self.main)

    def offer(self, ids, **extra):
        return self.client.post(reverse("work-order-list-create"), {
            "quotation": self.quotation.pk,
            "receiving_contractor": self.receiving.pk,
            "project_title": "Bedroom painting",
            "quotation_item_ids": ids, **extra,
        }, format="json")

    def test_selected_lines_are_snapshotted_without_customer_price(self):
        response = self.offer([self.line.pk])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order = SubcontractWorkOrder.objects.get()
        scope = order.scopes.get()
        self.assertEqual(scope.title_snapshot, self.line.description)
        self.assertEqual(scope.quantity, self.line.quantity)
        self.assertEqual(scope.unit_name_snapshot, self.sqft.name)
        self.assertEqual(scope.category, self.painting)
        self.assertEqual(scope.unit_rate, Decimal("0"))
        self.assertEqual(order.agreed_amount, Decimal("0"))
        self.line.description = "Changed later"
        self.line.quantity = Decimal("500")
        self.line.save()
        scope.refresh_from_db()
        self.assertEqual(scope.title_snapshot, "Paint bedroom walls")
        self.assertEqual(scope.quantity, Decimal("250"))

    def test_empty_and_foreign_line_selection_creates_nothing(self):
        for ids in ([], [999999], [self.line.pk, 999999], "not-a-list", [True]):
            with self.subTest(ids=ids):
                response = self.offer(ids)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
                self.assertFalse(SubcontractWorkOrder.objects.exists())

    def test_customer_amount_is_not_accepted_for_line_offer(self):
        response = self.offer([self.line.pk], agreed_amount="21250")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(SubcontractWorkOrder.objects.get().agreed_amount, Decimal("0"))

    def test_line_from_another_quotation_is_rejected(self):
        other = Quotation.objects.create(contractor=self.main, customer=self.customer,
            property=self.property, quotation_number="Q-OTHER", quotation_date=self.quotation.quotation_date)
        line = QuotationItem.objects.create(quotation=other, description="Other project",
            quantity=Decimal("1"), rate=Decimal("900"))
        response = self.offer([self.line.pk, line.pk])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(SubcontractWorkOrder.objects.exists())

    def test_recipient_cannot_fetch_original_priced_quotation_or_pdf(self):
        self.main.is_verified = True
        self.main.verification_status = "VERIFIED"
        self.main.save(update_fields=["is_verified", "verification_status"])
        self.receiving.is_verified = True
        self.receiving.verification_status = "VERIFIED"
        self.receiving.save(update_fields=["is_verified", "verification_status"])
        self.authenticate(self.receiving)
        for name in ("quotation-detail", "quotation-pdf"):
            response = self.client.get(reverse(name, args=[self.quotation.pk]))
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, name)
        response = self.client.get("/api/quotations/project-scopes/", {"quotation": self.quotation.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_legacy_scope_rates_are_private_in_list_detail_and_transition(self):
        order = self.make_work_order()
        workflow.share_scopes(order, [self.scope])
        workflow.transition(self.main, order, "SENT")
        self.authenticate(self.receiving)
        responses = [
            self.client.get(reverse("work-order-list-create")),
            self.client.get(reverse("work-order-detail", args=[order.pk])),
            self.client.post(reverse("work-order-transition", args=[order.pk]), {"status": "ACCEPTED"}, format="json"),
        ]
        for response in responses:
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            data = response.data[0] if isinstance(response.data, list) else response.data
            self.assertNotIn("unit_rate", data["scopes"][0])
        self.authenticate(self.main)
        detail = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertEqual(Decimal(detail.data["scopes"][0]["unit_rate"]), self.scope.unit_rate)

    def test_invalid_legacy_scope_does_not_leave_partial_order(self):
        response = self.client.post(reverse("work-order-list-create"), {
            "quotation": self.quotation.pk, "receiving_contractor": self.receiving.pk,
            "project_title": "Invalid scope", "project_scope_ids": [999999],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SubcontractWorkOrder.objects.exists())

    def test_long_description_is_preserved_in_offer(self):
        description = "Paint walls " + "x" * 205 + " including ceiling preparation"
        self.line.description = description
        self.line.save()
        response = self.offer([self.line.pk])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIn(description, response.data["agreed_scope_summary"])

    def test_recipient_cannot_forge_accepted_quote_to_reveal_customer_amount(self):
        order = self.make_work_order(agreed_amount=self.scope.amount)
        self.authenticate(self.receiving)
        response = self.client.post(reverse("work-order-quote", args=[order.pk]), {
            "status": "ACCEPTED", "is_current": True,
            "quote_lines": [{"description_snapshot": "Painting", "quantity": "1", "unit_rate": "900"}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "DRAFT")
        detail = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertIsNone(detail.data["agreed_amount"])

    def test_legacy_unconfirmed_amount_is_hidden_but_accepted_subcontract_price_is_visible(self):
        order = self.make_work_order(agreed_amount=self.scope.amount)
        self.authenticate(self.receiving)
        response = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertIsNone(response.data["agreed_amount"])
        self.authenticate(self.main)
        response = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertEqual(Decimal(response.data["agreed_amount"]), self.scope.amount)
        quote = SubcontractQuote.objects.create(work_order=order, status="ACCEPTED", total=Decimal("900"), is_current=True, created_by=self.receiving)
        order.agreed_amount = quote.total
        order.save(update_fields=["agreed_amount"])
        self.authenticate(self.receiving)
        response = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertEqual(Decimal(response.data["agreed_amount"]), quote.total)
        # Even historical accepted-status rows cannot unlock the customer total.
        order.agreed_amount = self.scope.amount
        order.save(update_fields=["agreed_amount"])
        response = self.client.get(reverse("work-order-detail", args=[order.pk]))
        self.assertEqual(Decimal(response.data["agreed_amount"]), quote.total)
