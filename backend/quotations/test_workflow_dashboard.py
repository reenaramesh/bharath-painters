from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser, ContractorProfile
from jobs.models import WorkSchedule
from call_inbox.models import BlockedCaller, CallInboxEvent
from outsourcing.models import SubcontractWorkOrder, AdditionalWorkRequest
from .models import Customer, Property, Quotation, Invoice, ContractorCustomerConnection, CustomerFollowUp


class WorkflowDashboardTests(APITestCase):
    def setUp(self):
        flags = {"is_verified": True, "verification_status": "VERIFIED"}
        self.owner = BharathUser.objects.create_user(mobile="9011900101", role="CONTRACTOR", **flags)
        self.other = BharathUser.objects.create_user(mobile="9011900102", role="CONTRACTOR", **flags)
        ContractorProfile.objects.create(user=self.owner, company_name="Workflow Painting")
        self.customer = Customer.objects.create(contractor=self.owner, name="Workflow customer", mobile="9011900103")
        ContractorCustomerConnection.objects.create(contractor=self.owner, customer=self.customer, status="CONNECTED")
        self.site = Property.objects.create(contractor=self.owner, customer=self.customer, name="Workflow site")
        self.today = timezone.localdate()
        self.client.force_authenticate(self.owner)
        self.url = reverse("contractor-crm-dashboard")

    def quotation(self, **changes):
        fields = {"contractor": self.owner, "customer": self.customer, "property": self.site,
                  "quotation_number": f"WF-Q-{Quotation.objects.count() + 1}"}
        fields.update(changes)
        if "contractor_id" in changes:
            fields.pop("contractor")
        return Quotation.objects.create(**fields)

    def schedule(self, quotation=None, **changes):
        return WorkSchedule.objects.create(quotation=quotation or self.quotation(status="SCHEDULED"), proposed_by=self.owner,
            proposed_start_date=self.today, proposed_end_date=self.today + timedelta(days=3), **changes)

    def invoice(self, **changes):
        number = f"WF-{Invoice.objects.count() + 1}"
        fields = {"contractor": self.owner, "invoice_number": number, "customer_name": "Workflow customer"}
        fields.update(changes)
        if "contractor_id" in changes:
            fields.pop("contractor")
        return Invoice.objects.create(**fields)

    def attention(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("workflow_attention", response.data)
        return response.data["workflow_attention"]

    def test_finance_uses_remaining_positive_balances_and_real_due_dates(self):
        self.invoice(grand_total="100.10", amount_paid="25.05", due_date=self.today - timedelta(days=1))
        self.invoice(grand_total="50.15", amount_paid="10.10", due_date=self.today)
        self.invoice(grand_total="20", amount_paid="0", due_date=None)
        self.invoice(grand_total="10", amount_paid="12", due_date=self.today - timedelta(days=3))
        self.invoice(grand_total="999", amount_paid="0", status="CANCELLED", due_date=self.today - timedelta(days=1))
        self.invoice(grand_total="200", amount_paid="0", contractor_id=self.other.pk)
        unfinished = self.quotation(status="SCHEDULED")
        self.schedule(unfinished, status="CONFIRMED")
        self.invoice(quotation=unfinished, grand_total="900", due_date=self.today - timedelta(days=2))
        data = self.attention()["finance"]
        self.assertEqual(Decimal(data["outstanding_total"]), Decimal("135.10"))
        self.assertEqual(Decimal(data["overdue_total"]), Decimal("75.05"))
        self.assertEqual(data["overdue_count"], 1)
        response = self.client.get("/api/quotations/invoices/")
        self.assertEqual(response.status_code, 200, response.data)
        overdue = [row for row in response.data if row["is_overdue"]]
        self.assertEqual(len(overdue), 1)
        self.assertEqual(Decimal(str(overdue[0]["balance_due"])), Decimal(data["overdue_total"]))

    def test_completed_unbilled_prompt_disappears_after_invoice_without_creating_anything(self):
        quote = self.quotation(status="COMPLETED")
        self.schedule(quote, status="COMPLETED")
        self.schedule(self.quotation(contractor_id=self.other.pk, status="COMPLETED"), status="COMPLETED")
        before = (Invoice.objects.count(), Quotation.objects.values_list("status", flat=True).count())
        data = self.attention()["completed_projects"]
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["quotation"], quote.pk)
        self.assertEqual(data["items"][0]["url"], f"/quotations/{quote.pk}?action=invoice")
        self.assertEqual((Invoice.objects.count(), Quotation.objects.count()), before)
        self.invoice(quotation=quote)
        self.assertEqual(self.attention()["completed_projects"]["count"], 0)

    def test_requested_advances_and_unconfirmed_payments_are_separate(self):
        for payment, amount, state in [("AWAITING_PAYMENT", "50.25", "CONFIRMED"),
                ("PENDING_CONFIRMATION", "30.10", "CONFIRMED"), ("CONFIRMED", "900", "CONFIRMED"),
                ("NOT_REQUESTED", "999", "CONFIRMED"), ("AWAITING_PAYMENT", "999", "CANCELLED"),
                ("AWAITING_PAYMENT", "999", "COMPLETED")]:
            self.schedule(payment_status=payment, advance_amount=amount, status=state)
        foreign = self.quotation(contractor_id=self.other.pk)
        self.schedule(foreign, payment_status="AWAITING_PAYMENT", advance_amount="999", status="CONFIRMED")
        data = self.attention()["finance"]
        self.assertEqual(Decimal(data["pending_advance_total"]), Decimal("50.25"))
        self.assertEqual(Decimal(data["pending_confirmation_total"]), Decimal("30.10"))

    def test_kickoff_is_revision_aware_and_does_not_repropose_existing_schedules(self):
        root = self.quotation(status="ACCEPTED")
        self.quotation(status="DRAFT", revision_of=root, version_number=2)
        ready = self.quotation(status="ACCEPTED")
        scheduled = self.quotation(status="ACCEPTED")
        self.schedule(scheduled, status="CONFIRMED", payment_status="PENDING_CONFIRMATION", advance_amount="100")
        paid = self.quotation(status="ACCEPTED")
        self.schedule(paid, status="CONFIRMED", payment_status="CONFIRMED", advance_amount="100")
        family_root = self.quotation(status="ACCEPTED")
        self.schedule(family_root, status="CANCELLED")
        self.quotation(status="ACCEPTED", revision_of=family_root, version_number=2)
        items = self.attention()["kickoff"]["items"]
        self.assertEqual({row["quotation"] for row in items}, {ready.pk, scheduled.pk})
        self.assertEqual({row["stage"] for row in items}, {"PROPOSE_DATES", "CONFIRM_ADVANCE"})

    def test_preview_is_bounded_but_next_page_keeps_all_completed_projects_reachable(self):
        for _ in range(8):
            self.schedule(self.quotation(status="COMPLETED"), status="COMPLETED")
        data = self.attention()["completed_projects"]
        self.assertEqual((data["count"], len(data["items"]), data["has_more"]), (8, 6, True))
        response = self.client.get("/api/quotations/contractor-crm/workflow-attention/?page=2")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(len(response.data["completed_projects"]["items"]), 2)
        self.assertFalse(response.data["completed_projects"]["has_more"])

    def test_other_roles_cannot_read_workflow_attention(self):
        painter = BharathUser.objects.create_user(mobile="9011900104", role="PAINTER")
        self.client.force_authenticate(painter)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get("/api/quotations/contractor-crm/workflow-attention/").status_code, 403)

    def test_subcontract_alerts_are_owned_and_dashboard_get_does_not_review_work(self):
        order = SubcontractWorkOrder.objects.create(quotation=self.quotation(), main_contractor=self.owner,
            receiving_contractor=self.other, status="SUBMITTED_FOR_REVIEW", project_title="Review walls")
        AdditionalWorkRequest.objects.create(work_order=order, requested_by=self.other, description="Extra wall")
        SubcontractWorkOrder.objects.create(quotation=self.quotation(contractor_id=self.other.pk),
            main_contractor=self.other, receiving_contractor=self.owner, status="SUBMITTED_FOR_REVIEW", project_title="Received work")
        with CaptureQueriesContext(connection) as queries:
            data = self.attention()["subcontracts"]
        self.assertEqual((data["review_count"], data["additional_work_count"]), (1, 1))
        self.assertEqual(data["reviews"][0]["url"], f"/subcontract-work-orders/{order.pk}")
        self.assertTrue(all(row["sql"].lstrip().upper().startswith("SELECT") for row in queries))
        order.refresh_from_db()
        self.assertEqual(order.status, "SUBMITTED_FOR_REVIEW")

    def test_call_queue_excludes_handled_blocked_booked_and_other_owner_events(self):
        def event(number, **changes):
            fields = {"contractor": self.owner, "phone_number": number, "normalized_mobile": number,
                "caller_name": "Caller-provided name", "occurred_at": timezone.now(), "idempotency_key": number,
                "call_status": "MISSED", "review_status": "PENDING"}
            fields.update(changes)
            return CallInboxEvent.objects.create(**fields)
        pending = event("+919011900111")
        missed = event("+919011900112", matched_customer=self.customer, review_status="MATCHED")
        linked = event("+919011900113", review_status="CUSTOMER_LINKED")
        event("+919011900114", review_status="DISMISSED")
        event("+919011900115", review_status="MATCHED", call_status="ANSWERED")
        event("+919011900116", contractor=self.other)
        event("+919011900117")
        BlockedCaller.objects.create(contractor=self.owner, normalized_mobile="+919011900117")
        booked = CustomerFollowUp.objects.create(customer=self.customer, created_by=self.owner,
            follow_up_type="SITE_VISIT", next_follow_up=timezone.now() + timedelta(days=1))
        event("+919011900118", booked_follow_up=booked)
        data = self.attention()["calls"]
        self.assertEqual(data["count"], 3)
        self.assertEqual({row["id"] for row in data["items"]}, {pending.pk, missed.pk, linked.pk})
        self.assertTrue(all(row["display_name"] == "Caller-provided name" for row in data["items"]))

    def test_workflow_pagination_rejects_invalid_pages(self):
        endpoint = "/api/quotations/contractor-crm/workflow-attention/"
        for page in ("0", "-1", "10001", "bad"):
            self.assertEqual(self.client.get(endpoint, {"page": page}).status_code, 400)
