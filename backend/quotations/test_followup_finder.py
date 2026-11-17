"""Follow-up Finder regression sources. Intentionally UNRUN in this batch."""
from datetime import datetime, timedelta, timezone as dt_timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from call_inbox.models import CallInboxEvent
from jobs.models import WorkSchedule
from .models import (
    ContractorCustomerConnection, Customer, CustomerFollowUp, CustomerWorkHistory,
    Lead, Property, Quotation, SavedCustomerContact,
)


class CustomerFollowUpFinderTests(APITestCase):
    def setUp(self):
        self.owner = BharathUser.objects.create_user(mobile="9000465001", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000465002", role="CONTRACTOR")
        self.customer = Customer.objects.create(contractor=self.owner, name="Shared original", mobile="9000465010")
        self.connection = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.owner, status="CONNECTED", requirement="Paint walls")
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.owner,
            details={"name": "My customer", "mobile": "9000465010"})
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.other,
            details={"name": "Other private name", "mobile": "9000465099"})
        self.url = reverse("customer-follow-up-candidates")
        self.client.force_authenticate(self.owner)

    def rows(self, **params):
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"]

    def task(self, **changes):
        values = dict(customer=self.customer, created_by=self.owner, follow_up_type="CALL")
        values.update(changes)
        return CustomerFollowUp.objects.create(**values)

    def test_candidate_without_reminder_uses_local_contact_and_owned_requirements(self):
        Lead.objects.create(contractor=self.owner, customer=self.customer, title="Ceiling")
        Lead.objects.create(contractor=self.other, customer=self.customer, title="Other private requirement")
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["customer_name"], "My customer")
        self.assertEqual(row["customer_mobile"], "9000465010")
        self.assertEqual(row["active_lead_count"], 1)
        self.assertIn("Ceiling", row["requirement"])
        self.assertNotIn("Other private", str(row))
        self.assertIsNone(row["next_follow_up"])
        self.assertEqual(row["pending_follow_up_count"], 0)

    def test_restricted_connections_and_cancelled_or_disabled_customers_are_excluded(self):
        for state in ("BLOCKED", "DISCONNECTED", "PENDING", "RECONNECT_PENDING", "REJECTED"):
            with self.subTest(state=state):
                self.connection.status = state
                self.connection.save(update_fields=("status",))
                self.assertEqual(self.rows(), [])
        self.connection.status = "CONNECTED"
        self.connection.save(update_fields=("status",))
        portal = BharathUser.objects.create_user(mobile="9000465020", role="CUSTOMER", is_active=False)
        Customer.objects.filter(pk=self.customer.pk).update(portal_user=portal)
        self.assertEqual(self.rows(), [])
        Customer.objects.filter(pk=self.customer.pk).update(portal_user=None, status="CANCELLED")
        self.assertEqual(self.rows(), [])

    def test_legacy_owned_is_allowed_but_other_contractors_customer_is_not(self):
        legacy = Customer.objects.create(contractor=self.owner, name="Legacy", mobile="9000465030")
        Customer.objects.create(contractor=self.other, name="Private", mobile="9000465031")
        self.assertIn(legacy.pk, {row["customer"] for row in self.rows()})
        self.assertEqual(len(self.rows()), 2)

    def test_future_reminder_and_private_note_are_not_contact_attempts(self):
        self.task(next_follow_up=timezone.now() + timedelta(days=3))
        self.task(follow_up_type="NOTE", outcome="INTERESTED", is_completed=True, completed_at=timezone.now())
        row = self.rows()[0]
        self.assertIsNone(row["last_contact_at"])
        self.assertEqual(row["pending_follow_up_count"], 1)

    def test_missed_rejected_and_unknown_calls_are_contact_attempts_from_occurrence(self):
        for index, call_status in enumerate(("MISSED", "REJECTED", "UNKNOWN")):
            at = datetime(2026, 10, 20 + index, 12, tzinfo=dt_timezone.utc)
            CallInboxEvent.objects.create(contractor=self.owner, phone_number=self.customer.mobile,
                normalized_mobile=self.customer.normalized_mobile, occurred_at=at,
                call_status=call_status, idempotency_key=f"attempt-{index}")
            row = self.rows()[0]
            self.assertEqual(row["last_contact_outcome_code"], call_status)
            self.assertEqual(row["last_contact_method"], "Call")
            self.assertTrue(row["last_contact_at"].startswith(at.date().isoformat()))
        CallInboxEvent.objects.create(contractor=self.other, phone_number=self.customer.mobile,
            normalized_mobile=self.customer.normalized_mobile, occurred_at=timezone.now(),
            call_status="ANSWERED", idempotency_key="private")
        self.assertEqual(self.rows()[0]["last_contact_outcome_code"], "UNKNOWN")
        self.assertEqual(self.rows(date_type="last_contact", date_to="2026-10-21"), [])
        self.assertEqual(len(self.rows(date_type="last_contact", date_from="2026-10-22", date_to="2026-10-22")), 1)

    def test_completed_task_uses_completion_time_and_general_logged_outcome_uses_log_time(self):
        logged = self.task(outcome="NO_RESPONSE")
        earlier = datetime(2026, 10, 20, 12, tzinfo=dt_timezone.utc)
        CustomerFollowUp.objects.filter(pk=logged.pk).update(follow_up_date=earlier)
        completed = datetime(2026, 10, 22, 12, tzinfo=dt_timezone.utc)
        self.task(next_follow_up=earlier, is_completed=True, completed_at=completed, outcome="INTERESTED")
        self.assertTrue(self.rows()[0]["last_contact_at"].startswith("2026-10-22"))
        self.assertEqual(self.rows()[0]["last_contact_outcome_code"], "INTERESTED")

    def test_completed_unpaid_service_uses_actual_completion_and_excludes_foreign_history(self):
        site = Property.objects.create(contractor=self.owner, customer=self.customer, connection=self.connection, name="Site")
        quote = Quotation.objects.create(contractor=self.owner, customer=self.customer, property=site,
            connection=self.connection, quotation_number="FINDER-1", status="COMPLETED")
        WorkSchedule.objects.create(quotation=quote, proposed_by=self.owner,
            proposed_start_date="2026-10-01", proposed_end_date="2026-10-02", status="COMPLETED",
            work_completed_at=datetime(2026, 10, 20, 20, tzinfo=dt_timezone.utc))
        foreign = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.other, status="CONNECTED")
        CustomerWorkHistory.objects.create(customer=self.customer, connection=foreign,
            service_name="Private other work", work_date="2026-10-24")
        row = self.rows(category="serviced")[0]
        self.assertTrue(row["has_service_history"])
        self.assertEqual(row["last_service_date"], "2026-10-21")
        self.assertNotIn("Private other work", str(row))

    def test_completed_schedule_without_completion_date_does_not_use_creation_date(self):
        site = Property.objects.create(contractor=self.owner, customer=self.customer, name="Legacy site")
        quote = Quotation.objects.create(contractor=self.owner, customer=self.customer, property=site,
            quotation_number="FINDER-UNDATED", status="COMPLETED")
        WorkSchedule.objects.create(quotation=quote, proposed_by=self.owner,
            proposed_start_date="2026-10-01", proposed_end_date="2026-10-02", status="COMPLETED")
        row = self.rows(category="serviced", date_type="last_service", missing_date="1")[0]
        self.assertTrue(row["has_service_history"])
        self.assertIsNone(row["last_service_date"])

    def test_undated_history_stays_undated_and_latest_service_controls_filter(self):
        CustomerWorkHistory.objects.create(customer=self.customer, connection=self.connection, service_name="Old unspecified work")
        row = self.rows(category="serviced", date_type="last_service", missing_date="1")[0]
        self.assertIsNone(row["last_service_date"])
        self.assertTrue(row["has_service_history"])
        CustomerWorkHistory.objects.create(customer=self.customer, connection=self.connection, service_name="Interior", work_date="2026-09-01")
        CustomerWorkHistory.objects.create(customer=self.customer, connection=self.connection, service_name="Exterior", work_date="2026-10-01")
        self.assertEqual(self.rows(date_type="last_service", date_to="2026-09-30"), [])
        self.assertEqual(self.rows(date_type="last_service", date_from="2026-10-01", date_to="2026-10-01")[0]["last_service_name"], "Exterior")

    def test_date_range_uses_india_calendar_and_missing_takes_precedence(self):
        self.task(next_follow_up=datetime(2026, 10, 20, 18, 30, tzinfo=dt_timezone.utc))
        self.assertEqual(len(self.rows(date_type="next_follow_up", date_from="2026-10-21", date_to="2026-10-21")), 1)
        self.assertEqual(self.rows(date_type="next_follow_up", date_to="2026-10-20"), [])
        self.assertEqual(len(self.rows(date_type="last_contact", missing_date="1", date_from="2026-01-01")), 1)
        for params in ({"date_from": "2026-02-30"}, {"date_to": "tomorrow"},
                       {"date_from": "2026-10-24", "date_to": "2026-10-01"}, {"date_type": "created_at"}):
            self.assertEqual(self.client.get(self.url, params).status_code, 400)

    def test_search_pagination_categories_and_multiple_tasks_do_not_duplicate_customers(self):
        later = timezone.now() + timedelta(days=4)
        self.task(next_follow_up=later)
        self.task(next_follow_up=later - timedelta(days=1))
        response = self.client.get(self.url, {"search": "My customer", "page_size": 1})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 1)
        self.assertEqual(response.data["results"][0]["pending_follow_up_count"], 2)
        self.assertEqual(self.rows(search="Other private name"), [])
        self.assertEqual(self.rows(category="serviced"), [])
        self.assertEqual(len(self.rows(category="requirements")), 1)
        self.assertEqual(self.client.get(self.url, {"page_size": 999}).data["page_size"], 100)

    def test_task_context_keeps_each_due_and_restricted_history_cannot_be_mutated(self):
        lead = Lead.objects.create(contractor=self.owner, customer=self.customer, title="Interior")
        first = self.task(opportunity=lead, next_follow_up=timezone.now() + timedelta(days=2))
        second = self.task(next_follow_up=timezone.now() + timedelta(days=3))
        rows = self.client.get(reverse("customer-task-list")).data
        by_id = {row["id"]: row for row in rows}
        self.assertNotEqual(by_id[first.pk]["next_follow_up"], by_id[second.pk]["next_follow_up"])
        self.assertEqual(by_id[first.pk]["opportunity"], lead.pk)
        self.assertEqual(by_id[first.pk]["opportunity_title"], "Interior")
        self.assertIn("last_contact_at", by_id[first.pk])
        self.connection.status = "BLOCKED"
        self.connection.save(update_fields=("status",))
        history = self.client.get(reverse("customer-task-list")).data
        self.assertEqual(len(history), 2)
        self.assertTrue(all(not row["can_follow_up"] for row in history))
        response = self.client.patch(reverse("customer-task-complete", args=[first.pk]), {"is_completed": True}, format="json")
        self.assertIn(response.status_code, (403, 404))
        first.refresh_from_db()
        self.assertFalse(first.is_completed)

    def test_intentionally_blank_local_name_and_mobile_never_fall_back(self):
        SavedCustomerContact.objects.filter(customer=self.customer, contractor=self.owner).update(details={})
        row = self.rows()[0]
        self.assertEqual(row["customer_name"], "")
        self.assertEqual(row["customer_mobile"], "")
        self.assertEqual(self.rows(search="Shared original"), [])

    def test_local_cancelled_customer_is_unavailable_in_candidates_and_task_mutation(self):
        task = self.task(next_follow_up=timezone.now() + timedelta(days=1))
        self.connection.customer_status = "CANCELLED"
        self.connection.save(update_fields=("customer_status",))
        self.assertEqual(self.rows(), [])
        history = self.client.get(reverse("customer-task-list")).data
        self.assertFalse(history[0]["can_follow_up"])
        response = self.client.patch(reverse("customer-task-complete", args=[task.pk]), {"is_completed": True}, format="json")
        self.assertEqual(response.status_code, 403)
        task.refresh_from_db()
        self.assertFalse(task.is_completed)

    def test_history_with_cross_customer_connection_or_legacy_property_is_excluded(self):
        customer = Customer.objects.create(contractor=self.owner, name="Another customer", mobile="9000465080")
        relationship = ContractorCustomerConnection.objects.create(customer=customer, contractor=self.owner, status="CONNECTED")
        site = Property.objects.create(customer=customer, contractor=self.owner, name="Other site")
        CustomerWorkHistory.objects.create(customer=self.customer, connection=relationship,
            service_name="Wrong connection", work_date="2026-10-01")
        CustomerWorkHistory.objects.create(customer=self.customer, property=site,
            service_name="Wrong legacy property", work_date="2026-10-02")
        self.assertFalse(next(row for row in self.rows() if row["customer"] == self.customer.pk)["has_service_history"])

    def test_stale_move_after_completion_conflicts_until_explicitly_reopened(self):
        task = self.task(next_follow_up=timezone.now() + timedelta(days=1))
        url = reverse("customer-task-complete", args=[task.pk])
        self.assertEqual(self.client.patch(url, {"is_completed": True}, format="json").status_code, 200)
        task.refresh_from_db()
        completed_at = task.completed_at
        moved = (timezone.now() + timedelta(days=3)).isoformat()
        self.assertEqual(self.client.patch(url, {"next_follow_up": moved}, format="json").status_code, 409)
        task.refresh_from_db()
        self.assertTrue(task.is_completed)
        self.assertEqual(task.completed_at, completed_at)
        self.assertEqual(self.client.patch(url, {"next_follow_up": moved, "is_completed": False}, format="json").status_code, 200)
        task.refresh_from_db()
        self.assertFalse(task.is_completed)
        self.assertIsNone(task.completed_at)

    def test_repeated_move_and_comment_payload_does_not_duplicate_history(self):
        lead = Lead.objects.create(contractor=self.owner, customer=self.customer, title="Interior")
        task = self.task(opportunity=lead, next_follow_up=timezone.now() + timedelta(days=1))
        url = reverse("customer-task-complete", args=[task.pk])
        payload = {"next_follow_up": (timezone.now() + timedelta(days=2)).isoformat(), "comment": "Call tomorrow"}
        self.assertEqual(self.client.patch(url, payload, format="json").status_code, 200)
        task.refresh_from_db()
        lead.refresh_from_db()
        before = (task.next_follow_up, task.comment, task.completed_at, task.completed_by_id, lead.updated_at,
                  list(lead.stage_history.values_list("pk", "created_at")))
        self.assertEqual(self.client.patch(url, payload, format="json").status_code, 200)
        task.refresh_from_db()
        lead.refresh_from_db()
        after = (task.next_follow_up, task.comment, task.completed_at, task.completed_by_id, lead.updated_at,
                 list(lead.stage_history.values_list("pk", "created_at")))
        self.assertEqual(before, after)
        self.assertEqual(self.client.patch(url, {"is_completed": True}, format="json").status_code, 200)
        task.refresh_from_db()
        completed = (task.completed_at, task.completed_by_id, list(lead.stage_history.values_list("pk", "created_at")))
        self.assertEqual(self.client.patch(url, {"is_completed": True}, format="json").status_code, 200)
        task.refresh_from_db()
        self.assertEqual(completed, (task.completed_at, task.completed_by_id,
            list(lead.stage_history.values_list("pk", "created_at"))))

    def test_employee_and_customer_roles_cannot_open_finder(self):
        for index, role in enumerate(("PAINTER", "CUSTOMER")):
            account = BharathUser.objects.create_user(mobile=f"900046506{index}", role=role)
            self.client.force_authenticate(account)
            self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_available_legacy_customer_can_create_new_requirement(self):
        customer = Customer.objects.create(contractor=self.owner, name="Legacy available", mobile="9000465090")
        response = self.client.post(reverse("lead-list"), {
            "customer": customer.pk, "title": "New interior requirement", "source": "EXISTING_CUSTOMER",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Lead.objects.filter(pk=response.data["id"], contractor=self.owner, customer=customer).exists())

    def test_disabled_or_wrong_role_legacy_customer_cannot_create_new_requirement(self):
        for index, account_values in enumerate(({"role": "CUSTOMER", "is_active": False}, {"role": "PAINTER"})):
            with self.subTest(account=account_values):
                portal = BharathUser.objects.create_user(mobile=f"900046510{index}", **account_values)
                customer = Customer.objects.create(contractor=self.owner, name="Legacy restricted",
                    mobile=f"900046511{index}", portal_user=portal)
                response = self.client.post(reverse("lead-list"), {
                    "customer": customer.pk, "title": "Stale selected customer", "source": "EXISTING_CUSTOMER",
                }, format="json")
                self.assertEqual(response.status_code, 403, response.data)
                self.assertFalse(Lead.objects.filter(contractor=self.owner, customer=customer).exists())

    def test_blocked_or_locally_cancelled_selected_customer_cannot_create_requirement(self):
        for state, local_status, expected in (("BLOCKED", "NEW", 400), ("CONNECTED", "CANCELLED", 403)):
            with self.subTest(state=state, local_status=local_status):
                self.connection.status = state
                self.connection.customer_status = local_status
                self.connection.save(update_fields=("status", "customer_status"))
                response = self.client.post(reverse("lead-list"), {
                    "customer": self.customer.pk, "title": "Stale selected customer", "source": "EXISTING_CUSTOMER",
                }, format="json")
                self.assertEqual(response.status_code, expected, response.data)
                self.assertFalse(Lead.objects.filter(contractor=self.owner, customer=self.customer).exists())

    def test_query_count_does_not_grow_per_customer(self):
        with CaptureQueriesContext(connection) as single:
            self.rows()
        for index in range(5):
            customer = Customer.objects.create(contractor=self.owner, name=f"Legacy {index}", mobile=f"900046507{index}")
            Lead.objects.create(contractor=self.owner, customer=customer, title="Interior")
            CustomerFollowUp.objects.create(customer=customer, created_by=self.owner,
                follow_up_type="CALL", next_follow_up=timezone.now() + timedelta(days=1))
        with CaptureQueriesContext(connection) as many:
            rows = self.rows()
        self.assertEqual(len(rows), 6)
        self.assertEqual(len(single), len(many))
