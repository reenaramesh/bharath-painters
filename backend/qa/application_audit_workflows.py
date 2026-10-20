"""Real API journeys; run only via qa/application_audit_run.py's disposable PG.

No import-time environment changes and no inherited fixture TestCases.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser, ContractorProfile
from jobs.models import (
    ApplicatorAttendance, ApplicatorAttendanceDecision, ApplicatorLedgerEntry,
    ContractorApplicatorTeam, WorkSchedule, WorkSchedulePainter,
)
from quotations.models import (
    ContractorConnection, Customer, Invoice, InvoicePayment, Lead,
    Property, PropertyMeasurement, MeasurementSurface, Quotation,
    ProjectScope, ServiceCategory, Unit,
)
from outsourcing.models import SubcontractWorkOrder, SubcontractInvoice, WorkOrderAssignment


class WorkflowFixtures:
    """Reusable API driver, deliberately not a TestCase."""

    def api(self, user, route, data=None, *, args=(), kwargs=None, method="post", status=200, query=""):
        self.client.force_authenticate(user)
        url = reverse(route, args=args or None, kwargs=kwargs) + query
        response = getattr(self.client, method)(url, data or {}, format="json")
        self.assertEqual(response.status_code, status, (route, response.status_code, getattr(response, "data", "")))
        return response.data

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        flags = {"is_verified": True, "verification_status": "VERIFIED"}
        self.contractor = BharathUser.objects.create_user(mobile="9011700001", password="test-pass", role="CONTRACTOR", **flags)
        self.painter = BharathUser.objects.create_user(mobile="9011700002", password="test-pass", role="PAINTER", **flags)
        self.receiving = BharathUser.objects.create_user(mobile="9011700003", password="test-pass", role="CONTRACTOR", **flags)
        self.outsider = BharathUser.objects.create_user(mobile="9011700004", password="test-pass", role="CONTRACTOR", **flags)
        ContractorProfile.objects.create(user=self.contractor, company_name="Audit Painting", owner_name="Audit Owner")
        ContractorProfile.objects.create(user=self.receiving, company_name="Audit Subcontractor", owner_name="Audit Receiver")
        self.member = ContractorApplicatorTeam.objects.create(
            contractor=self.contractor, painter=self.painter, employment_type="IN_HOUSE",
            salary_basis="DAILY", salary_amount=Decimal("500"),
        )
        self.category = ServiceCategory.objects.create(name="Audit Painting", created_by=self.contractor)
        self.unit = Unit.objects.create(name="Audit Sq ft", created_by=self.contractor)
        self.category.units.add(self.unit)

    def create_accepted_project(self):
        created = self.api(self.contractor, "customer-list-create", {"name": "Journey Customer", "mobile": "9011700010"}, status=201)
        self.customer = Customer.objects.get(pk=created["id"])
        self.customer_user = self.customer.portal_user
        self.customer_user.set_password("test-pass")
        self.customer_user.save(update_fields=["password"])
        lead = self.api(self.contractor, "lead-list", {"customer": self.customer.pk, "title": "Whole home painting"}, status=201)
        self.lead = Lead.objects.get(pk=lead["id"])
        site = self.api(self.contractor, "property-list-create", {"customer": self.customer.pk, "name": "Journey Home", "property_type": "2BHK", "city": "Bengaluru"}, status=201)
        self.property = Property.objects.get(pk=site["id"])
        record = self.api(self.contractor, "property-measurement-records", {"measured_on": str(self.today), "status": "DRAFT"}, kwargs={"property_id": self.property.pk}, status=201)
        self.measurement = PropertyMeasurement.objects.get(pk=record["id"])
        surface = self.api(self.contractor, "measurement-surface-list-create", {"work_area": "EXTERIOR", "surface_type": "WALL", "name": "Measured wall", "length": 10, "breadth": 10}, kwargs={"property_id": self.property.pk}, query=f"?measurement={self.measurement.pk}", status=201)
        self.assertEqual(Decimal(str(surface["net_area"])), Decimal("100"))
        self.api(self.contractor, "property-measurement-submit", {}, args=(self.measurement.pk,))
        created = self.api(self.contractor, "quotation-create", {
            "customer": self.customer.pk, "property": self.property.pk,
            "measurement_record": self.measurement.pk, "lead": self.lead.pk,
            "quotation_type": "MEASUREMENT", "rooms": [], "gst_mode": "NO_GST", "gst_percentage": 0,
            "items": [{"service_category": self.category.pk, "unit": self.unit.pk,
                       "description": "Measured exterior wall", "calculation_method": "MANUAL", "quantity": "100", "rate": "10"}],
        }, status=201)
        self.quotation = Quotation.objects.get(pk=created["id"])
        self.assertEqual(self.quotation.grand_total, Decimal("1000"))
        self.assertEqual(self.quotation.lead_id, self.lead.pk)
        self.api(self.contractor, "quotation-submit", {}, args=(self.quotation.pk,))
        approved = self.api(self.customer_user, "customer-quotation-action", {"action": "APPROVE"}, args=(self.quotation.pk,))
        self.assertEqual(approved["next_step"], "SCHEDULE")
        self.quotation.refresh_from_db()
        self.assertEqual(self.quotation.status, "ACCEPTED")

    def create_confirmed_schedule(self):
        schedule = self.api(self.contractor, "work-schedule-list", {"quotation": self.quotation.pk, "start_date": str(self.today), "end_date": str(self.today + timedelta(days=1))}, status=201)
        self.schedule = WorkSchedule.objects.get(pk=schedule["id"])
        accepted = self.api(self.customer_user, "work-schedule-accept", {}, args=(self.schedule.pk,))
        self.assertEqual(accepted["status"], "CONFIRMED")
        self.api(self.contractor, "work-schedule-painters", {"painters": [{"id": self.painter.pk, "wage_type": "DAILY", "agreed_wage": "500"}]}, args=(self.schedule.pk,), method="put")
        self.assignment = WorkSchedulePainter.objects.get(schedule=self.schedule, painter=self.painter)


class WholeApplicationWorkflowTests(WorkflowFixtures, TestCase):
    def completed_invoice_for_legacy_allocation(self, source):
        self.create_accepted_project()
        self.create_confirmed_schedule()
        if source == "advance":
            self.api(self.contractor, "work-schedule-payment", {"action": "RECORD", "amount": "100", "mode": "CASH"}, args=(self.schedule.pk,))
        else:
            self.client.force_authenticate(self.contractor)
            response = self.client.post("/api/billing/contractor-revenue/receipts/", {"quotation": self.quotation.pk, "amount": "100", "payment_mode": "CASH", "received_date": str(self.today), "idempotency_key": "audit-legacy-source-receipt"}, format="json")
            self.assertEqual(response.status_code, 201, response.data)
        for action in ["ACCEPT", "START", "COMPLETE"]:
            self.api(self.painter, "painter-assignment-progress", {"action": action}, args=(self.assignment.pk,))
        response = self.api(self.contractor, "invoice-list-create", {"quotation": self.quotation.pk}, status=201)
        self.invoice = Invoice.objects.get(pk=response["id"])
        self.allocation = InvoicePayment.objects.get(invoice=self.invoice)
        # Model an actual historic allocation made before the source-link
        # migration: retain its original amount/mode/note, remove only FK.
        InvoicePayment.objects.filter(pk=self.allocation.pk).update(source_schedule=None, source_receipt=None)

    def assert_legacy_allocation_protected(self):
        self.api(self.contractor, "invoice-payment-detail", args=(self.invoice.pk, self.allocation.pk), method="delete", status=400)
        self.allocation.refresh_from_db()
        self.assertIsNone(self.allocation.source_schedule_id)
        self.assertIsNone(self.allocation.source_receipt_id)
        response = self.api(self.contractor, "invoice-list-create", {"quotation": self.quotation.pk})
        self.assertEqual(Decimal(str(response["amount_paid"])), Decimal("100"))
        self.assertEqual(InvoicePayment.objects.filter(invoice=self.invoice).count(), 1)

    def test_legacy_advance_allocation_delete_is_protected_without_inventing_source_link(self):
        self.completed_invoice_for_legacy_allocation("advance")
        self.assert_legacy_allocation_protected()

    def test_legacy_project_receipt_allocation_delete_is_protected_without_inventing_source_link(self):
        self.completed_invoice_for_legacy_allocation("receipt")
        self.assert_legacy_allocation_protected()

    def test_customer_project_attendance_invoice_payment_and_source_retries(self):
        self.create_accepted_project()
        self.create_confirmed_schedule()
        self.api(self.contractor, "invoice-list-create", {"quotation": self.quotation.pk}, status=400)
        self.api(self.painter, "painter-assignment-progress", {"action": "START"}, args=(self.assignment.pk,), status=400)
        self.api(self.painter, "painter-assignment-progress", {"action": "ACCEPT"}, args=(self.assignment.pk,))
        self.api(self.contractor, "work-schedule-payment", {"action": "REQUEST", "amount": "200"}, args=(self.schedule.pk,))
        self.api(self.customer_user, "work-schedule-payment", {"action": "SUBMIT", "mode": "UPI", "reference": "audit-advance"}, args=(self.schedule.pk,))
        self.api(self.contractor, "work-schedule-payment", {"action": "CONFIRM"}, args=(self.schedule.pk,))
        receipt_payload = {"quotation": self.quotation.pk, "amount": "100", "payment_mode": "CASH", "received_date": str(self.today), "idempotency_key": "audit-project-receipt"}
        self.client.force_authenticate(self.contractor)
        receipt = self.client.post("/api/billing/contractor-revenue/receipts/", receipt_payload, format="json")
        self.assertEqual(receipt.status_code, 201, receipt.data)
        replayed_receipt = self.client.post("/api/billing/contractor-revenue/receipts/", receipt_payload, format="json")
        self.assertEqual(replayed_receipt.status_code, 200, replayed_receipt.data)
        self.assertEqual(replayed_receipt.data["id"], receipt.data["id"])
        self.api(self.contractor, "work-schedule-progress", {"action": "START"}, args=(self.schedule.pk,))
        self.api(self.painter, "painter-assignment-progress", {"action": "START"}, args=(self.assignment.pk,))
        marked = self.api(self.painter, "in-house-attendance", {"date": str(self.today), "status": "PRESENT", "schedule": self.schedule.pk}, args=(self.member.pk,), status=201)
        attendance = ApplicatorAttendance.objects.get(pk=marked["id"])
        self.assertEqual(attendance.approval_status, "PENDING")
        self.assertFalse(ApplicatorLedgerEntry.objects.filter(source_attendance=attendance).exists())
        for _ in range(2):
            self.api(self.contractor, "in-house-attendance-review", {"decision": "APPROVED"}, args=(self.member.pk, attendance.pk))
        self.assertEqual(ApplicatorLedgerEntry.objects.get(source_attendance=attendance).amount, Decimal("500"))
        self.assertEqual(ApplicatorAttendanceDecision.objects.filter(attendance=attendance).count(), 1)
        self.api(self.painter, "painter-assignment-progress", {"action": "COMPLETE"}, args=(self.assignment.pk,))
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, "COMPLETED")
        created = self.api(self.contractor, "invoice-list-create", {"quotation": self.quotation.pk}, status=201)
        invoice = Invoice.objects.get(pk=created["id"])
        self.assertEqual(Decimal(str(created["amount_paid"])), Decimal("300"))
        self.assertEqual(InvoicePayment.objects.get(invoice=invoice, source_schedule__isnull=False).source_schedule_id, self.schedule.pk)
        self.assertEqual(InvoicePayment.objects.get(invoice=invoice, source_receipt__isnull=False).source_receipt_id, receipt.data["id"])
        replay = self.api(self.contractor, "invoice-list-create", {"quotation": self.quotation.pk})
        self.assertEqual(replay["id"], invoice.pk)
        self.assertEqual(InvoicePayment.objects.filter(invoice=invoice).count(), 2)
        allocation = InvoicePayment.objects.get(invoice=invoice, source_schedule__isnull=False)
        self.api(self.contractor, "invoice-payment-detail", {}, args=(invoice.pk, allocation.pk), method="delete", status=400)
        payload = {"received_date": str(self.today), "amount": "700", "payment_mode": "CASH", "idempotency_key": "audit-final-payment"}
        self.api(self.contractor, "invoice-payment-list-create", payload, args=(invoice.pk,), status=201)
        self.api(self.contractor, "invoice-payment-list-create", payload, args=(invoice.pk,))
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal("1000"))
        self.assertEqual(invoice.balance_due, Decimal("0"))
        self.assertEqual(InvoicePayment.objects.filter(invoice=invoice).count(), 3)
        self.api(self.contractor, "invoice-payment-list-create", {**payload, "amount": "699"}, args=(invoice.pk,), status=409)
        visible = self.api(self.customer_user, "customer-invoice-list", method="get")
        self.assertEqual([row["id"] for row in visible], [invoice.pk])
        self.api(self.outsider, "invoice-detail", args=(invoice.pk,), method="get", status=404)

    def test_subcontract_assignment_review_updates_parent_scope_and_separate_billing(self):
        self.create_accepted_project()
        ContractorConnection.objects.create(requester=self.contractor, recipient=self.receiving, status="CONNECTED", accepted_at=timezone.now())
        ContractorApplicatorTeam.objects.create(contractor=self.receiving, painter=self.painter, employment_type="IN_HOUSE")
        scope = ProjectScope.objects.create(quotation=self.quotation, source_quotation_item=self.quotation.items.get(), title="Measured exterior wall", category=self.category, unit=self.unit, quantity=Decimal("100"), unit_rate=Decimal("10"))
        created = self.api(self.contractor, "work-order-list-create", {"quotation": self.quotation.pk, "receiving_contractor": self.receiving.pk, "project_title": "Delegated measured walls", "project_scope_ids": [scope.pk]}, status=201)
        work = SubcontractWorkOrder.objects.get(pk=created["id"])
        self.api(self.contractor, "work-order-transition", {"status": "SENT"}, args=(work.pk,))
        self.api(self.receiving, "work-order-transition", {"status": "ACCEPTED"}, args=(work.pk,))
        self.api(self.receiving, "work-order-assignment", {"employee": self.painter.pk}, args=(work.pk,), status=201)
        assignment = WorkOrderAssignment.objects.get(work_order=work)
        for action in ["ACCEPT", "START", "COMPLETE"]:
            self.api(self.painter, "work-order-assignment-response", {"action": action}, args=(assignment.pk,))
        shared = work.scopes.get()
        self.api(self.receiving, "work-order-transition", {"status": "SUBMITTED_FOR_REVIEW", "note": "Half of wall completed", "scope_progress": [{"scope_id": shared.pk, "quantity": "50"}]}, args=(work.pk,))
        scope.refresh_from_db()
        self.assertEqual(scope.completed_quantity, Decimal("0"))
        self.api(self.receiving, "work-order-transition", {"status": "COMPLETED"}, args=(work.pk,), status=400)
        self.api(self.contractor, "work-order-transition", {"status": "COMPLETED"}, args=(work.pk,))
        scope.refresh_from_db()
        self.assertEqual(scope.completed_quantity, Decimal("50"))
        self.assertEqual(scope.status, "IN_PROGRESS")
        self.assertEqual(work.completions.get(is_current=True).scope_progress.get().accepted_quantity, Decimal("50"))
        billed = self.api(self.contractor, "work-order-invoice", {"subtotal": "500", "tax_amount": "0", "total": "500", "issue_date": str(self.today)}, args=(work.pk,), status=201)
        invoice = SubcontractInvoice.objects.get(pk=billed["id"])
        payload = {"invoice": invoice.pk, "amount": "500", "payment_mode": "UPI", "idempotency_key": "audit-subcontract-final"}
        self.api(self.contractor, "work-order-payment", payload, args=(work.pk,))
        self.api(self.contractor, "work-order-payment", payload, args=(work.pk,))
        invoice.refresh_from_db()
        self.assertEqual(invoice.balance, Decimal("0"))
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.payments.count(), 1)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(ApplicatorLedgerEntry.objects.count(), 0)
