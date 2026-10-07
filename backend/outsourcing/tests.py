from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import BharathUser, ProviderProfile, ProviderServiceClaim
from quotations.models import (
    ContractorConnection,
    Customer,
    Property,
    ProjectScope,
    Quotation,
    ServiceCategory,
    Unit,
    WorkDescription,
)

from . import workflow
from .models import (
    CorrectionRequest,
    SubcontractInvoice,
    SubcontractQuote,
    SubcontractWorkOrder,
    WageRecord,
    WorkOrderAssignment,
)
from .models import financial_year


def make_contractor(mobile, role="CONTRACTOR"):
    return BharathUser.objects.create_user(
        mobile=mobile,
        password="Pass123!",
        role=role,
        first_name="Test",
        last_name=mobile[-2:],
    )


def connect(requester, recipient):
    return ContractorConnection.objects.create(
        requester=requester,
        recipient=recipient,
        status=ContractorConnection.Status.CONNECTED,
        accepted_at=timezone.now(),
    )


class OutsourcingTestBase(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.main = make_contractor("9000000201")
        self.receiving = make_contractor("9000000202")
        self.employee = make_contractor("9000000203", role="PAINTER")
        self.customer_user = make_contractor("9000000204", role="CUSTOMER")
        self.connection = connect(self.main, self.receiving)

        self.painting = ServiceCategory.objects.create(
            name="Painting",
            workspace_name="Bharath Painters",
            contractor_label="Painter",
            employee_singular_label="Employee",
            employee_plural_label="Employees",
            icon=ServiceCategory.Icon.PAINT_ROLLER,
        )
        self.electrical = ServiceCategory.objects.create(
            name="Electrical",
            workspace_name="Bharath Electricals",
            contractor_label="Electrician",
            employee_singular_label="Technician",
            employee_plural_label="Technicians",
            icon=ServiceCategory.Icon.ELECTRICAL,
        )
        self.sqft = Unit.objects.create(name="sq ft")
        self.painting.units.add(self.sqft)
        self.electrical.units.add(self.sqft)

        self.customer = Customer.objects.create(
            contractor=self.main,
            portal_user=self.customer_user,
            name="Ramesh Kumar",
            mobile="9742839992",
        )
        self.property = Property.objects.create(
            customer=self.customer,
            contractor=self.main,
            property_type=Property.PropertyType.TWO_BHK,
            name="Sunrise Flats",
        )
        self.quotation = Quotation.objects.create(
            contractor=self.main,
            customer=self.customer,
            property=self.property,
            quotation_number="Q-TEST-0001",
            quotation_date=timezone.localdate(),
        )
        self.scope = ProjectScope.objects.create(
            quotation=self.quotation,
            title="Interior wall painting",
            category=self.painting,
            unit=self.sqft,
            quantity=Decimal("1200"),
            unit_rate=Decimal("38"),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def make_work_order(self, **overrides):
        fields = {
            "quotation": self.quotation,
            "main_contractor": self.main,
            "receiving_contractor": self.receiving,
            "connection": self.connection,
            "project_title": "Interior wall painting",
        }
        fields.update(overrides)
        return SubcontractWorkOrder.objects.create(**fields)


class WorkOrderCreationTests(OutsourcingTestBase):
    def test_main_contractor_can_send_work_to_a_connected_contractor(self):
        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-list-create"),
            {
                "quotation": self.quotation.pk,
                "receiving_contractor": self.receiving.pk,
                "project_title": "Interior wall painting",
                "project_scope_ids": [self.scope.pk],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        work_order = SubcontractWorkOrder.objects.get()
        self.assertEqual(work_order.reference, f"WO/{financial_year()}/00001")
        self.assertEqual(work_order.status, SubcontractWorkOrder.Status.DRAFT)
        self.assertEqual(work_order.main_contractor, self.main)
        self.assertEqual(work_order.scopes.count(), 1)
        self.assertEqual(work_order.scopes.first().quantity, Decimal("1200"))

    def test_scope_snapshot_survives_later_scope_edits(self):
        self.authenticate(self.main)
        self.client.post(
            reverse("work-order-list-create"),
            {
                "quotation": self.quotation.pk,
                "receiving_contractor": self.receiving.pk,
                "project_title": "Interior wall painting",
                "project_scope_ids": [self.scope.pk],
            },
            format="json",
        )
        shared = SubcontractWorkOrder.objects.get().scopes.first()
        self.scope.quantity = Decimal("999")
        self.scope.save()

        shared.refresh_from_db()
        self.assertEqual(shared.quantity, Decimal("1200"))

    def test_cannot_send_work_to_an_unconnected_contractor(self):
        outsider = make_contractor("9000000205")
        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-list-create"),
            {
                "quotation": self.quotation.pk,
                "receiving_contractor": outsider.pk,
                "project_title": "Interior wall painting",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("connected", str(response.data).lower())

    def test_cannot_send_work_to_yourself(self):
        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-list-create"),
            {
                "quotation": self.quotation.pk,
                "receiving_contractor": self.main.pk,
                "project_title": "Interior wall painting",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_send_work_on_someone_elses_quotation(self):
        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-list-create"),
            {
                "quotation": self.quotation.pk,
                "receiving_contractor": self.main.pk,
                "project_title": "Interior wall painting",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_sees_no_work_orders(self):
        self.make_work_order()
        self.authenticate(self.customer_user)
        listing = self.client.get(reverse("work-order-list-create"))
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data, [])

        detail = self.client.get(reverse("work-order-detail", args=[1]))
        self.assertEqual(detail.status_code, status.HTTP_400_BAD_REQUEST)


class WorkOrderWorkflowTests(OutsourcingTestBase):
    def test_full_lifecycle_from_draft_to_invoice(self):
        work_order = self.make_work_order()
        self.authenticate(self.main)

        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "SENT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "SENT")
        work_order.refresh_from_db()
        self.assertIsNotNone(work_order.sent_at)

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "ACCEPTED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        work_order.refresh_from_db()

        response = self.client.post(
            reverse("work-order-assignment", args=[work_order.pk]),
            {"employee": self.employee.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW", note="Walls finished")
        self.assertEqual(work_order.completions.count(), 1)

        workflow.transition(self.main, work_order, "COMPLETED")
        self.assertEqual(work_order.completions.count(), 1)

        self.authenticate(self.main)
        invoice_response = self.client.post(
            reverse("work-order-invoice", args=[work_order.pk]),
            {"subtotal": "45000", "tax_amount": "0", "total": "45000", "issue_date": "2026-02-01"},
            format="json",
        )
        self.assertEqual(invoice_response.status_code, status.HTTP_201_CREATED, invoice_response.data)
        invoice = SubcontractInvoice.objects.get()
        self.assertEqual(invoice.status, SubcontractInvoice.Status.ISSUED)
        self.assertEqual(invoice.balance, Decimal("45000.00"))

        payment = self.client.post(
            reverse("work-order-payment", args=[work_order.pk]),
            {"invoice": invoice.pk, "amount": "20000", "payment_mode": "UPI"},
            format="json",
        )
        self.assertEqual(payment.status_code, status.HTTP_200_OK, payment.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, SubcontractInvoice.Status.PART_PAID)
        self.assertEqual(invoice.balance, Decimal("25000.00"))

        final = self.client.post(
            reverse("work-order-payment", args=[work_order.pk]),
            {"invoice": invoice.pk, "amount": "25000", "payment_mode": "BANK_TRANSFER"},
            format="json",
        )
        self.assertEqual(final.status_code, status.HTTP_200_OK, final.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, SubcontractInvoice.Status.PAID)
        self.assertEqual(invoice.balance, Decimal("0.00"))

    def test_receiving_contractor_cannot_approve_their_own_work(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW")

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "COMPLETED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("main contractor", str(response.data).lower())
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, "SUBMITTED_FOR_REVIEW")

    def test_main_contractor_cannot_mark_the_work_in_progress(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")

        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "IN_PROGRESS"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("receiving contractor", str(response.data).lower())

    def test_correction_request_blocks_completion_until_resubmitted(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW", note="First pass")

        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-correction", args=[work_order.pk]),
            {"note": "Patch the seepage stain near the window."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "CORRECTION_REQUESTED")
        self.assertEqual(len(response.data["correction_requests"]), 1)

        blocked = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "COMPLETED"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

        self.authenticate(self.receiving)
        resubmit = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "SUBMITTED_FOR_REVIEW", "note": "Stain patched"},
            format="json",
        )
        self.assertEqual(resubmit.status_code, status.HTTP_200_OK, resubmit.data)
        self.assertEqual(resubmit.data["status"], "SUBMITTED_FOR_REVIEW")
        self.assertIsNotNone(resubmit.data["correction_requests"][0]["resolved_at"])
        self.assertEqual(resubmit.data["completions"][0]["open_correction_count"], 0)

        self.authenticate(self.main)
        finished = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "COMPLETED"},
            format="json",
        )
        self.assertEqual(finished.status_code, status.HTTP_200_OK, finished.data)

    def test_a_correction_cannot_be_smuggled_through_the_status_endpoint(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW")

        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "CORRECTION_REQUESTED", "note": "Seepage stain near the window."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, "SUBMITTED_FOR_REVIEW")
        self.assertEqual(CorrectionRequest.objects.filter(work_order=work_order).count(), 0)

    def test_only_main_contractor_can_raise_a_correction(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW")

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-correction", args=[work_order.pk]),
            {"note": "Looks fine to me."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_outsider_cannot_move_a_work_order(self):
        work_order = self.make_work_order()
        self.authenticate(make_contractor("9000000206"))
        response = self.client.post(
            reverse("work-order-transition", args=[work_order.pk]),
            {"status": "SENT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_every_transition_is_written_to_the_audit_trail(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        self.authenticate(self.receiving)
        response = self.client.get(reverse("work-order-events", args=[work_order.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["from_status"], "DRAFT")
        self.assertEqual(response.data[0]["to_status"], "SENT")


class LedgerSeparationTests(OutsourcingTestBase):
    def test_wage_ledger_is_invisible_to_the_main_contractor(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        WorkOrderAssignment.objects.create(
            work_order=work_order,
            employee=self.employee,
            assigned_by=self.receiving,
            status=WorkOrderAssignment.Status.ACCEPTED,
        )
        workflow.record_wage(self.receiving, work_order, self.employee, Decimal("900"), "DAILY", days_worked=1)

        self.authenticate(self.main)
        listing = self.client.get(reverse("work-order-wage", args=[work_order.pk]))
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data, [])

        attempt = self.client.post(
            reverse("work-order-wage", args=[work_order.pk]),
            {"employee": self.employee.pk, "amount": "900", "wage_type": "DAILY"},
            format="json",
        )
        self.assertEqual(attempt.status_code, status.HTTP_400_BAD_REQUEST)

    def test_receiving_contractor_can_only_wage_assigned_employees(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        stranger = make_contractor("9000000207", role="PAINTER")

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-wage", args=[work_order.pk]),
            {"employee": stranger.pk, "amount": "900", "wage_type": "DAILY"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        WorkOrderAssignment.objects.create(
            work_order=work_order,
            employee=self.employee,
            assigned_by=self.receiving,
            status=WorkOrderAssignment.Status.ACCEPTED,
        )
        allowed = self.client.post(
            reverse("work-order-wage", args=[work_order.pk]),
            {"employee": self.employee.pk, "amount": "900", "wage_type": "DAILY", "days_worked": "1"},
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.data)
        self.assertEqual(WageRecord.objects.get().amount, Decimal("900"))

    def test_only_main_contractor_can_record_a_payment(self):
        work_order = self.make_work_order()
        workflow.transition(self.main, work_order, "SENT")
        workflow.transition(self.receiving, work_order, "ACCEPTED")
        workflow.transition(self.receiving, work_order, "IN_PROGRESS")
        workflow.transition(self.receiving, work_order, "SUBMITTED_FOR_REVIEW")
        workflow.transition(self.main, work_order, "COMPLETED")
        invoice = SubcontractInvoice.objects.create(
            work_order=work_order, subtotal=Decimal("10000"), total=Decimal("10000")
        )

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-payment", args=[work_order.pk]),
            {"invoice": invoice.pk, "amount": "5000", "payment_mode": "CASH"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal("0.00"))

    def test_overpayment_is_rejected(self):
        work_order = self.make_work_order()
        invoice = SubcontractInvoice.objects.create(
            work_order=work_order, subtotal=Decimal("10000"), total=Decimal("10000")
        )
        with self.assertRaises(ValidationError):
            workflow.record_payment(self.main, invoice, Decimal("10001"), "CASH")

    def test_invoice_requires_completed_work(self):
        work_order = self.make_work_order()
        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-invoice", args=[work_order.pk]),
            {"subtotal": "10000", "tax_amount": "0", "total": "10000"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepted_quote_sets_the_agreed_amount(self):
        work_order = self.make_work_order()
        quote = SubcontractQuote.objects.create(work_order=work_order, subtotal=Decimal("30000"), total=Decimal("30000"))
        quote.status = SubcontractQuote.Status.SENT
        quote.save(update_fields=["status"])

        self.authenticate(self.main)
        response = self.client.post(
            reverse("work-order-quote-decision", args=[work_order.pk]),
            {"quote": quote.pk, "decision": "ACCEPTED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        work_order.refresh_from_db()
        self.assertEqual(work_order.agreed_amount, Decimal("30000"))

    def test_a_quote_line_can_carry_its_own_description(self):
        work_order = self.make_work_order()
        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-quote", args=[work_order.pk]),
            {
                "work_order": work_order.pk,
                "tax_amount": "0",
                "quote_lines": [
                    {
                        "description_snapshot": "Two coat putty on internal walls",
                        "unit_name_snapshot": "sq.ft",
                        "quantity": "1200",
                        "unit_rate": "32",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        line = response.data["quote_lines"][0]
        self.assertEqual(line["description_snapshot"], "Two coat putty on internal walls")
        self.assertEqual(line["amount"], "38400.00")
        self.assertEqual(response.data["total"], "38400.00")

    def test_a_quote_line_needs_a_description(self):
        work_order = self.make_work_order()
        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-quote", args=[work_order.pk]),
            {
                "work_order": work_order.pk,
                "quote_lines": [{"description_snapshot": "  ", "quantity": "10", "unit_rate": "5"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("description_snapshot", response.data["quote_lines"][0])

    def test_receiving_contractor_cannot_accept_their_own_quote(self):
        work_order = self.make_work_order()
        quote = SubcontractQuote.objects.create(work_order=work_order, total=Decimal("30000"))
        quote.status = SubcontractQuote.Status.SENT
        quote.save(update_fields=["status"])

        self.authenticate(self.receiving)
        response = self.client.post(
            reverse("work-order-quote-decision", args=[work_order.pk]),
            {"quote": quote.pk, "decision": "ACCEPTED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdditionalWorkTests(OutsourcingTestBase):
    def setUp(self):
        super().setUp()
        self.work_order = self.make_work_order()
        workflow.transition(self.main, self.work_order, "SENT")
        workflow.transition(self.receiving, self.work_order, "ACCEPTED")
        workflow.transition(self.receiving, self.work_order, "IN_PROGRESS")

    def test_receiving_contractor_raises_and_main_contractor_decides(self):
        self.authenticate(self.receiving)
        raised = self.client.post(
            reverse("work-order-additional-work", args=[self.work_order.pk]),
            {"description": "Two extra window frames", "estimated_amount": "3500"},
            format="json",
        )
        self.assertEqual(raised.status_code, status.HTTP_201_CREATED, raised.data)

        self.authenticate(self.main)
        decided = self.client.post(
            reverse("work-order-additional-work-decision", args=[self.work_order.pk]),
            {"request": raised.data["id"], "decision": "APPROVED", "approved_amount": "3000"},
            format="json",
        )
        self.assertEqual(decided.status_code, status.HTTP_200_OK, decided.data)
        self.assertEqual(decided.data["status"], "APPROVED")
        self.assertEqual(Decimal(decided.data["approved_amount"]), Decimal("3000"))

    def test_receiving_contractor_cannot_decide_their_own_request(self):
        self.authenticate(self.receiving)
        raised = self.client.post(
            reverse("work-order-additional-work", args=[self.work_order.pk]),
            {"description": "Extra ceiling polish", "estimated_amount": "3500"},
            format="json",
        )
        response = self.client.post(
            reverse("work-order-additional-work-decision", args=[self.work_order.pk]),
            {"request": raised.data["id"], "decision": "APPROVED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ProjectScopeTests(OutsourcingTestBase):
    def test_scope_amount_is_derived_from_quantity_and_rate(self):
        self.assertEqual(self.scope.amount, Decimal("45600.00"))

    def test_scope_records_an_immutable_name_snapshot(self):
        self.assertEqual(self.scope.category_name_snapshot, "Painting")
        self.painting.name = "Painting and Decor"
        self.painting.save()
        self.scope.refresh_from_db()
        self.assertEqual(self.scope.category_name_snapshot, "Painting")

    def test_scopes_are_listed_only_for_their_own_project(self):
        self.authenticate(self.main)
        mine = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(mine.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mine.data), 1)

        self.authenticate(self.receiving)
        theirs = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(theirs.data, [])

    def test_customer_cannot_read_project_scopes(self):
        self.authenticate(self.customer_user)
        response = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(response.data, [])

    def test_unit_must_belong_to_the_service(self):
        litres = Unit.objects.create(name="litre")
        self.authenticate(self.main)
        response = self.client.post(
            reverse("project-scope-list-create"),
            {
                "quotation": self.quotation.pk,
                "title": "Water tank cleaning",
                "category": self.painting.pk,
                "unit": litres.pk,
                "quantity": "2",
                "unit_rate": "500",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unit", response.data)


class ProviderProfileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.painter = make_contractor("9000000301")
        self.painting = ServiceCategory.objects.create(
            name="Painting", workspace_name="Bharath Painters", contractor_label="Painter"
        )
        self.electrical = ServiceCategory.objects.create(
            name="Electrical", workspace_name="Bharath Electricals", contractor_label="Electrician"
        )
        self.profile = ProviderProfile.objects.create(user=self.painter, core_service=self.painting)
        self.profile.additional_services.add(self.electrical)

    def test_branding_comes_from_the_core_service_only(self):
        branding = self.profile.resolved_branding()
        self.assertEqual(branding["workspace_name"], "Bharath Painters")
        self.assertEqual(branding["contractor_label"], "Painter")

    def test_additional_service_does_not_rename_the_workspace(self):
        self.profile.additional_services.set([self.electrical, self.painting])
        self.assertEqual(self.profile.resolved_branding()["workspace_name"], "Bharath Painters")
        self.assertIn(self.electrical.id, self.profile.offered_service_ids())

    def test_a_claim_must_sit_inside_an_offered_service(self):
        plumbing = ServiceCategory.objects.create(name="Plumbing")
        claim = ProviderServiceClaim(provider=self.profile, category=plumbing)
        with self.assertRaises(ValidationError):
            claim.clean()

    def test_a_claim_inside_an_offered_service_is_accepted(self):
        claim = ProviderServiceClaim(provider=self.profile, category=self.electrical)
        claim.full_clean(exclude=["provider"])

    def test_a_claim_cannot_mix_services(self):
        wiring = WorkDescription.objects.create(
            name="Switch and socket wiring",
            service_category=self.electrical,
        )
        claim = ProviderServiceClaim(
            provider=self.profile,
            category=self.painting,
            work_description=wiring,
        )
        with self.assertRaises(ValidationError):
            claim.full_clean(exclude=["provider"])

    def test_profile_endpoint_publishes_and_freezes_branding(self):
        self.client.force_authenticate(self.painter)
        response = self.client.post(reverse("provider-profile"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_published"])
        self.assertEqual(response.data["brand_snapshot"]["workspace_name"], "Bharath Painters")

    def test_profile_endpoint_rejects_the_core_service_as_an_addition(self):
        self.client.force_authenticate(self.painter)
        response = self.client.patch(
            reverse("provider-profile"),
            {"additional_services": [self.painting.pk]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_and_contractor_share_one_profile_endpoint(self):
        employee = make_contractor("9000000302", role="PAINTER")
        self.client.force_authenticate(employee)
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_employee"])

    def test_customer_cannot_open_a_provider_profile(self):
        customer = make_contractor("9000000303", role="CUSTOMER")
        self.client.force_authenticate(customer)
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ContractorConnectionTests(OutsourcingTestBase):
    def test_request_then_accept_a_connection(self):
        other = make_contractor("9000000401")
        self.authenticate(self.main)
        response = self.client.post(
            reverse("contractor-connection-list-create"),
            {"recipient": other.pk, "message": "Need help with texture work."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "PENDING")

        self.authenticate(other)
        accepted = self.client.post(
            reverse("contractor-connection-action", args=[response.data["id"], "accept"]),
            {},
            format="json",
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertEqual(accepted.data["status"], "CONNECTED")

    def test_only_the_recipient_can_accept(self):
        other = make_contractor("9000000402")
        connection = connect(self.main, other)
        self.authenticate(self.main)
        response = self.client.post(
            reverse("contractor-connection-action", args=[connection.pk, "accept"]),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_connect_with_yourself(self):
        self.authenticate(self.main)
        response = self.client.post(
            reverse("contractor-connection-list-create"),
            {"recipient": self.main.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blocking_stops_further_work_orders(self):
        connection = connect(self.main, make_contractor("9000000403"))
        self.authenticate(self.main)
        blocked = self.client.post(
            reverse("contractor-connection-action", args=[connection.pk, "block"]),
            {},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_200_OK, blocked.data)
        self.assertEqual(blocked.data["status"], "BLOCKED")

        response = self.client.post(
            reverse("contractor-connection-list-create"),
            {"recipient": connection.recipient_id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_use_the_contractor_network(self):
        self.authenticate(self.customer_user)
        response = self.client.get(reverse("contractor-connection-list-create"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
