from datetime import timedelta
from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from .models import CustomerFollowUp, Invoice, Lead, Property, Quotation, ProjectReceipt, SiteVisit


class LeadWorkspaceTests(APITestCase):
    def setUp(self):
        flags = dict(role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.a = BharathUser.objects.create_user(mobile="9000470001", **flags)
        self.b = BharathUser.objects.create_user(mobile="9000470002", **flags)
        for person in (self.a, self.b):
            self.client.force_authenticate(person)
            saved = self.client.post(reverse("customer-list-create"), {"mobile": "9086543222", "name": f"Contact {person.pk}"}, format="json")
            self.customer_id = saved.data["id"]
        self.client.force_authenticate(self.a)
        self.property = Property.objects.create(contractor=self.a, customer_id=self.customer_id, name="A site")
        self.other_property = Property.objects.create(contractor=self.b, customer_id=self.customer_id, name="B private site")
        self.lead = Lead.objects.create(contractor=self.a, customer_id=self.customer_id, property=self.property, title="Interior painting", description="Walls and ceiling", source="REFERRAL")
        self.url = reverse("lead-detail", args=[self.lead.pk])
        self.followups = f"/api/quotations/leads/{self.lead.pk}/follow-ups/"

    def quote(self, **changes):
        values = dict(contractor=self.a, customer_id=self.customer_id, property=self.property, lead=self.lead,
                      quotation_number=f"LEAD-{Quotation.objects.count()+1}", status="DRAFT", grand_total=Decimal("100"))
        values.update(changes)
        return Quotation.objects.create(**values)

    def test_detail_get_and_summary_are_owned(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["description"], "Walls and ceiling")
        self.assertEqual(response.data["next_action"]["label"], "Contact customer")
        summary = self.client.get("/api/quotations/leads/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["counts"]["needs_action"], 1)
        self.client.force_authenticate(self.b)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.get(self.followups).status_code, 404)
        self.assertEqual(self.client.get("/api/quotations/leads/summary/").data["total"], 0)

    def test_create_retries_reuse_lead_and_schedule_shared_task(self):
        values = dict(customer=self.customer_id, title="Waterproof terrace", source="WEBSITE", source_detail="Contact form",
                      creation_key="lead-retry-001", next_follow_up=(timezone.now()+timedelta(days=1)).isoformat())
        first = self.client.post(reverse("lead-list"), values, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post(reverse("lead-list"), values, format="json")
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["source_detail"], "Contact form")
        self.assertEqual(CustomerFollowUp.objects.filter(opportunity_id=first.data["id"]).count(), 1)
        self.assertEqual(len(self.client.get(reverse("customer-task-list")).data), 1)

    def test_log_follow_up_and_task_completion_synchronise_next_date(self):
        due = (timezone.now()+timedelta(hours=2)).isoformat()
        response = self.client.post(self.followups, dict(follow_up_type="CALL", outcome="CALL_LATER", comment="Call this evening", next_follow_up=due), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.lead.refresh_from_db()
        self.assertIsNotNone(self.lead.next_follow_up)
        task = CustomerFollowUp.objects.get(opportunity=self.lead)
        updated = self.client.patch(reverse("customer-task-complete", args=[task.pk]), {"is_completed": True}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.next_follow_up)
        self.assertEqual(len(self.client.get(self.url).data["follow_ups"]), 1)

    def test_cross_contractor_links_and_followups_are_rejected(self):
        response = self.client.patch(self.url, {"property": self.other_property.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(self.url, {"assigned_user": self.b.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        other = Lead.objects.create(contractor=self.b, customer_id=self.customer_id, title="Other private lead")
        response = self.client.post(reverse("customer-follow-ups", args=[self.customer_id]), {
            "opportunity": other.pk, "follow_up_type": "CALL", "comment": "Spoof link",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)

    def test_quotation_drafts_and_revisions_never_hide_or_regress_work(self):
        quote = self.quote()
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.archived_at)
        self.assertEqual(self.client.get(self.url).data["quotation_status"], "DRAFT")
        quote.status = "ACCEPTED"
        quote.save(update_fields=["status"])
        self.quote(revision_of=quote, version_number=2)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.stage, "WON")
        self.assertIsNone(self.lead.archived_at)
        self.assertEqual(self.client.get(self.url).data["quotation_id"], quote.pk)

    def test_rejected_quote_requires_followup_not_automatic_lost(self):
        self.quote(status="REJECTED")
        self.lead.refresh_from_db()
        self.assertNotEqual(self.lead.stage, "LOST")
        self.assertFalse(self.client.get(self.url).data["is_closed"])

    def test_accepted_revision_retains_actual_in_progress_schedule(self):
        from jobs.models import WorkSchedule
        root = self.quote(status="IN_PROGRESS")
        WorkSchedule.objects.create(quotation=root, proposed_by=self.a, proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=1), status="IN_PROGRESS")
        self.quote(status="ACCEPTED", revision_of=root, version_number=2)
        self.assertEqual(self.client.get(self.url).data["workflow_stage"], "IN_PROGRESS")

    def test_customer_requested_revision_preserves_accepted_work_and_money(self):
        from .revision_utils import clone_quotation_revision
        from jobs.models import WorkSchedule
        for scheduled in (False, True):
            with self.subTest(scheduled=scheduled):
                lead = Lead.objects.create(contractor=self.a, customer_id=self.customer_id, title="Revision work")
                root = self.quote(lead=lead, status="IN_PROGRESS" if scheduled else "ACCEPTED")
                if scheduled:
                    WorkSchedule.objects.create(quotation=root, proposed_by=self.a, proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=1), status="IN_PROGRESS")
                draft = clone_quotation_revision(root, "Change colour", timezone.now())
                detail = self.client.get(reverse("lead-detail", args=[lead.pk])).data
                self.assertEqual(detail["workflow_stage"], "IN_PROGRESS" if scheduled else "WON")
                self.assertEqual(detail["quotation_id"], root.pk)
                self.assertEqual(detail["payment_status"], "NOT_INVOICED")
                self.assertEqual(Decimal(detail["balance_due"]), Decimal("100"))
                self.assertNotEqual(detail["quotation_id"], draft.pk)

    def test_multiple_work_families_target_the_invoice_that_needs_action(self):
        first = self.quote(status="COMPLETED")
        latest = self.quote(status="COMPLETED")
        paid = Invoice.objects.create(contractor=self.a, customer_id=self.customer_id, quotation=latest,
            invoice_number="FAMILY-PAID", customer_name="Customer", grand_total="100", amount_paid="100")
        detail = self.client.get(self.url).data
        self.assertEqual(detail["next_action"]["url"], f"/quotations/{first.pk}?action=invoice")
        unpaid = Invoice.objects.create(contractor=self.a, customer_id=self.customer_id, quotation=first,
            invoice_number="FAMILY-UNPAID", customer_name="Customer", grand_total="100", amount_paid="0")
        self.assertEqual(self.client.get(self.url).data["next_action"]["url"], f"/invoices?invoice={unpaid.pk}&collections=outstanding")
        unpaid.amount_paid = Decimal("100"); unpaid.save()
        paid.amount_paid = Decimal("0"); paid.save()
        self.assertEqual(self.client.get(self.url).data["next_action"]["url"], f"/invoices?invoice={paid.pk}&collections=outstanding")

    def test_work_action_targets_existing_active_schedule_across_families_and_versions(self):
        from jobs.models import WorkSchedule
        active = self.quote(status="IN_PROGRESS")
        WorkSchedule.objects.create(quotation=active, proposed_by=self.a, proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=1), status="IN_PROGRESS")
        self.quote(status="ACCEPTED", revision_of=active, version_number=2)
        self.quote(status="COMPLETED")
        detail = self.client.get(self.url).data
        self.assertEqual(detail["workflow_stage"], "IN_PROGRESS")
        self.assertEqual(detail["next_action"]["url"], f"/work-schedules?quotation={active.pk}")

    def test_approved_revision_preserves_completed_job_and_invoice_action(self):
        from .models import Customer
        from .revision_utils import clone_quotation_revision
        from jobs.models import WorkSchedule
        root = self.quote(status="COMPLETED")
        schedule = WorkSchedule.objects.create(quotation=root, proposed_by=self.a, proposed_start_date=timezone.localdate(), proposed_end_date=timezone.localdate()+timedelta(days=1), status="COMPLETED")
        draft = clone_quotation_revision(root, "", None, customer_requested=False)
        draft.status = "SENT"; draft.save(update_fields=["status"])
        self.client.force_authenticate(Customer.objects.get(pk=self.customer_id).portal_user)
        approved = self.client.post(f"/api/quotations/customer-portal/quotations/{draft.pk}/action/", {"action": "APPROVE"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        draft.refresh_from_db(); schedule.refresh_from_db()
        self.assertEqual(schedule.quotation_id, draft.pk)
        self.assertEqual(draft.status, "COMPLETED")
        self.client.force_authenticate(self.a)
        detail = self.client.get(self.url).data
        self.assertEqual(detail["workflow_stage"], "COMPLETED")
        self.assertEqual(detail["next_action"]["url"], f"/quotations/{draft.pk}?action=invoice")

    def test_completed_work_remains_open_until_invoiced_and_paid(self):
        quote = self.quote(status="COMPLETED")
        detail = self.client.get(self.url).data
        self.assertEqual(detail["payment_status"], "INVOICE_NOT_RAISED")
        self.assertFalse(detail["is_closed"])
        invoice = Invoice.objects.create(contractor=self.a, customer_id=self.customer_id, quotation=quote,
                                         invoice_number="LEAD-INV", customer_name="Customer", grand_total="100", amount_paid="30")
        detail = self.client.get(self.url).data
        self.assertEqual(detail["payment_status"], "PAYMENT_PENDING")
        self.assertEqual(Decimal(detail["balance_due"]), Decimal("70"))
        self.assertEqual(detail["next_action"]["label"], "Collect payment")
        invoice.amount_paid = Decimal("100")
        invoice.status = "PAID"
        invoice.save()
        detail = self.client.get(self.url).data
        self.assertTrue(detail["is_closed"])
        self.assertEqual(detail["payment_status"], "SETTLED")

    def test_queues_and_summary_do_not_depend_on_selected_queue(self):
        CustomerFollowUp.objects.create(customer_id=self.customer_id, opportunity=self.lead, created_by=self.a,
                                       follow_up_type="CALL", next_follow_up=timezone.now()-timedelta(days=1))
        due = self.client.get(reverse("lead-list"), {"queue": "overdue"})
        self.assertEqual([row["id"] for row in due.data], [self.lead.pk])
        summary = self.client.get("/api/quotations/leads/summary/", {"queue": "in_progress"})
        self.assertEqual(summary.data["counts"]["overdue"], 1)
        self.assertEqual(summary.data["counts"]["in_progress"], 0)

    def test_validation_errors_do_not_create_partial_records(self):
        for values in ({"estimated_value": "oops"}, {"expected_start_date": "2026-02-31"}, {"property": "bad"}, {"service_type": "bad"}, {"next_follow_up": "bad"}):
            response = self.client.post(reverse("lead-list"), {"customer": self.customer_id, "title": "Invalid input", **values}, format="json")
            self.assertEqual(response.status_code, 400, (values, response.data))
        self.assertEqual(Lead.objects.count(), 1)

    def test_followup_retry_and_reschedule_preserve_one_activity(self):
        due = timezone.now()+timedelta(days=1)
        values = {"follow_up_type": "CALL", "outcome": "WAITING_DECISION", "comment": "Customer comparing options", "next_action": "Call about approval", "next_follow_up": due.isoformat(), "creation_key": "followup-retry"}
        first = self.client.post(self.followups, values, format="json")
        second = self.client.post(self.followups, values, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(self.client.get(self.url).data["next_action"]["label"], "Call about approval")
        changed = self.client.patch(reverse("customer-task-complete", args=[first.data["id"]]), {"next_follow_up": (due+timedelta(days=1)).isoformat()}, format="json")
        self.assertEqual(changed.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.next_follow_up, due+timedelta(days=1))

    def test_invoices_do_not_double_count_advance_receipts_or_other_contractor_money(self):
        quote = self.quote(status="COMPLETED")
        ProjectReceipt.objects.create(contractor=self.a, quotation=quote, receipt_number="LEAD-R1", amount="30", payment_mode="CASH")
        Invoice.objects.create(contractor=self.a, customer_id=self.customer_id, quotation=quote, invoice_number="LEAD-FIN", customer_name="Customer", grand_total="100", amount_paid="30")
        detail = self.client.get(self.url).data
        self.assertEqual(Decimal(detail["balance_due"]), Decimal("70"))

    def test_visit_is_next_action_and_retains_local_contact_details(self):
        visit = SiteVisit.objects.create(opportunity=self.lead, contractor=self.a, customer_id=self.customer_id,
            property=self.property, scheduled_date=timezone.localdate()+timedelta(days=1), created_by=self.a)
        detail = self.client.get(self.url).data
        self.assertEqual(detail["next_action"]["visit_id"], visit.pk)
        self.assertEqual(detail["workflow_stage"], "SITE_VISIT")

    def test_manual_status_cannot_accept_a_quotation_or_finish_work(self):
        for stage in ("WON", "IN_PROGRESS", "COMPLETED"):
            response = self.client.patch(self.url, {"stage": stage}, format="json")
            self.assertEqual(response.status_code, 400, response.data)

    def test_restore_migration_preserves_ids_and_terminal_history(self):
        from importlib import import_module
        from django.apps import apps
        Lead.objects.filter(pk=self.lead.pk).update(stage="QUOTATION", archived_at=timezone.now(), next_follow_up=timezone.now()+timedelta(days=1))
        lost = Lead.objects.create(contractor=self.a, customer_id=self.customer_id, title="Lost enquiry", stage="LOST", archived_at=timezone.now())
        before = list(Lead.objects.values_list("id", "reference_no"))
        import_module("quotations.migrations.0130_restore_active_leads").restore_active_leads(apps, None)
        self.lead.refresh_from_db(); lost.refresh_from_db()
        self.assertIsNone(self.lead.archived_at)
        self.assertIsNotNone(lost.archived_at)
        self.assertEqual(before, list(Lead.objects.values_list("id", "reference_no")))
        self.assertEqual(CustomerFollowUp.objects.filter(opportunity=self.lead).count(), 1)

    def test_explicit_lost_reason_and_reopen_are_preserved(self):
        self.assertEqual(self.client.patch(self.url, {"stage": "LOST"}, format="json").status_code, 400)
        lost = self.client.patch(self.url, {"stage": "LOST", "lost_reason": "BUDGET"}, format="json")
        self.assertTrue(lost.data["is_closed"])
        reopened = self.client.patch(self.url, {"stage": "CONTACTED"}, format="json")
        self.assertFalse(reopened.data["is_closed"])
        self.assertEqual(reopened.data["lost_reason"], "")

    def test_customer_roles_cannot_access_workspace_or_private_notes(self):
        from .models import Customer
        self.client.force_authenticate(Customer.objects.get(pk=self.customer_id).portal_user)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get(reverse("lead-summary")).status_code, 403)
        self.assertEqual(self.client.get(self.followups).status_code, 403)

    def test_convert_endpoint_cannot_bypass_quotation_acceptance(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views import LeadConvertView
        self.quote(status="DRAFT")
        request = APIRequestFactory().post("/legacy-convert/", {}, format="json")
        force_authenticate(request, self.a)
        response = LeadConvertView.as_view()(request, pk=self.lead.pk)
        self.assertEqual(response.status_code, 400, response.data)


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipIf
from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient


@skipIf(connection.vendor == "sqlite" and not connection.settings_dict["TEST"].get("NAME"), "File-backed test database required")
class LeadCreationConcurrencyTests(TransactionTestCase):
    def test_duplicate_lead_submissions_create_one_lead_and_one_task(self):
        owner = BharathUser.objects.create_user(mobile="9000470011", role="CONTRACTOR")
        client = APIClient(); client.force_authenticate(owner)
        customer = client.post(reverse("customer-list-create"), {"name": "Concurrency customer", "mobile": "9000470099"}, format="json").data
        barrier = Barrier(2)

        def submit(_):
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(owner)
                barrier.wait(timeout=15)
                response = client.post(reverse("lead-list"), {"customer": customer["id"], "title": "Painting", "creation_key": "simultaneous-lead", "next_follow_up": (timezone.now()+timedelta(days=1)).isoformat()}, format="json")
                return response.status_code, response.data
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(submit, range(2)))
        self.assertEqual(sorted(code for code, _ in results), [200, 201], results)
        self.assertEqual(Lead.objects.count(), 1)
        self.assertEqual(CustomerFollowUp.objects.count(), 1)
