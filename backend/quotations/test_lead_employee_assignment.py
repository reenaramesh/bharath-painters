"""Queued for the combined verification round; not executed during this batch."""
from datetime import timedelta
from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam
from .models import CustomerFollowUp, ContractorCustomerConnection, Lead, LeadStageHistory, PortalNotification, Property, Quotation


class LeadEmployeeAssignmentTests(APITestCase):
    def setUp(self):
        flags = dict(is_verified=True, verification_status="VERIFIED")
        self.a = BharathUser.objects.create_user(mobile="9000491001", role="CONTRACTOR", **flags)
        self.b = BharathUser.objects.create_user(mobile="9000491002", role="CONTRACTOR", **flags)
        self.employee = BharathUser.objects.create_user(mobile="9000491003", role="PAINTER", first_name="Employee one", **flags)
        self.second = BharathUser.objects.create_user(mobile="9000491004", role="PAINTER", **flags)
        self.outsider = BharathUser.objects.create_user(mobile="9000491005", role="PAINTER", **flags)
        self.member = ContractorApplicatorTeam.objects.create(contractor=self.a, painter=self.employee, employment_type="IN_HOUSE")
        ContractorApplicatorTeam.objects.create(contractor=self.a, painter=self.second, employment_type="IN_HOUSE")
        ContractorApplicatorTeam.objects.create(contractor=self.b, painter=self.outsider, employment_type="IN_HOUSE")
        for contractor, name in ((self.a, "A contact name"), (self.b, "B contact name")):
            self.client.force_authenticate(contractor)
            response = self.client.post(reverse("customer-list-create"), {"mobile": "9086543233", "name": name}, format="json")
            self.customer_id = response.data["id"]
        self.property = Property.objects.create(contractor=self.a, customer_id=self.customer_id, name="Private site details")
        self.lead = Lead.objects.create(contractor=self.a, customer_id=self.customer_id, assigned_user=self.employee,
            title="Interior painting", description="Walls and ceiling", notes="Private contractor note", estimated_value=Decimal("90000"), property=self.property)
        self.other = Lead.objects.create(contractor=self.b, customer_id=self.customer_id, assigned_user=self.outsider, title="B enquiry")
        self.detail = reverse("lead-detail", args=[self.lead.pk])
        self.followups = reverse("lead-follow-ups", args=[self.lead.pk])
        self.client.force_authenticate(self.a)

    def follow_up(self, **changes):
        payload = {"follow_up_type": "CALL", "outcome": "CALL_LATER", "comment": "Customer asked for a call", "creation_key": "employee-call-1",
                   "next_follow_up": (timezone.now() + timedelta(days=1)).isoformat()}
        payload.update(changes)
        return self.client.post(self.followups, payload, format="json")

    def quote(self, **changes):
        values = dict(contractor=self.a, customer_id=self.customer_id, property=self.property, lead=self.lead,
            quotation_number=f"ASSIGN-{Quotation.objects.count() + 1}", status="DRAFT", grand_total=Decimal("100"))
        values.update(changes)
        return Quotation.objects.create(**values)

    def test_create_and_reassign_are_owned_audited_and_notified_once(self):
        payload = {"customer": self.customer_id, "title": "Terrace enquiry", "assigned_user": self.employee.pk, "creation_key": "assigned-lead-1"}
        first = self.client.post(reverse("lead-list"), payload, format="json")
        again = self.client.post(reverse("lead-list"), payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["id"], again.data["id"])
        lead = Lead.objects.get(pk=first.data["id"])
        self.assertEqual(lead.assigned_user_id, self.employee.pk)
        self.assertEqual(PortalNotification.objects.filter(recipient=self.employee, event_type="LEAD_ASSIGNED").count(), 1)
        self.assertEqual(lead.stage_history.filter(note__startswith="Assigned to").count(), 1)
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": self.second.pk}, format="json").status_code, 200)
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get(self.detail).status_code, 404)
        self.assertEqual(self.follow_up().status_code, 404)

    def test_only_active_own_inhouse_employees_are_assignable(self):
        rows = self.client.get(reverse("lead-assignees"))
        self.assertEqual({row["id"] for row in rows.data}, {self.employee.pk, self.second.pk})
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": self.outsider.pk}, format="json").status_code, 400)
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": self.employee.pk}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": self.a.pk}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": None}, format="json").status_code, 200)

    def test_employee_projection_and_search_use_issuing_contractors_contact(self):
        self.quote()
        CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id, created_by=self.a, follow_up_type="NOTE", comment="Private call strategy")
        self.client.force_authenticate(self.employee)
        detail = self.client.get(self.detail)
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data["customer_name"], "A contact name")
        self.assertFalse(detail.data["can_manage_lead"])
        self.assertEqual(detail.data["notes"], "")
        self.assertIsNone(detail.data["balance_due"])
        self.assertIsNone(detail.data["estimated_value"])
        self.assertIsNone(detail.data["property"])
        self.assertIsNone(detail.data["linked_quotations"][0]["amount"])
        self.assertNotIn("Private call strategy", str(detail.data))
        self.assertNotIn("Private contractor note", str(detail.data))
        rows = self.client.get(reverse("lead-list"), {"search": "A contact name"})
        self.assertEqual([row["id"] for row in rows.data], [self.lead.pk])
        self.assertEqual(self.client.get(reverse("lead-list"), {"search": "B contact name"}).data, [])
        self.assertEqual(self.client.get(reverse("lead-list"), {"assigned_user": self.outsider.pk}).data, [])
        self.assertEqual(self.client.get(reverse("lead-detail", args=[self.other.pk])).status_code, 404)

    def test_employee_cannot_create_edit_or_reassign_leads_or_spoof_actor(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.post(reverse("lead-list"), {"customer": self.customer_id, "title": "Forbidden"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(self.detail, {"assigned_user": self.employee.pk}, format="json").status_code, 403)
        self.assertEqual(self.client.get(reverse("lead-assignees")).status_code, 403)
        self.assertEqual(self.follow_up(performed_by=self.a.pk).status_code, 400)
        self.assertEqual(self.follow_up(outcome="WON").status_code, 400)

    def test_employee_followups_keep_owner_and_retry_without_duplicate(self):
        self.client.force_authenticate(self.employee)
        first = self.follow_up()
        again = self.follow_up()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["id"], again.data["id"])
        task = CustomerFollowUp.objects.get(pk=first.data["id"])
        self.assertEqual(task.created_by_id, self.a.pk)
        self.assertEqual(task.performed_by_id, self.employee.pk)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.next_follow_up, task.next_follow_up)
        self.client.force_authenticate(self.a)
        self.assertIn(task.pk, [row["id"] for row in self.client.get(reverse("customer-task-list")).data])
        self.client.patch(reverse("customer-task-complete", args=[task.pk]), {"comment": "Contractor edited"}, format="json")
        self.assertEqual(LeadStageHistory.objects.filter(lead=self.lead).latest("created_at").changed_by_id, self.a.pk)

    def test_employee_can_complete_visible_task_but_not_private_note(self):
        visible = CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id, created_by=self.a, follow_up_type="CALL", next_follow_up=timezone.now())
        private = CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id, created_by=self.a, follow_up_type="NOTE", comment="Private action", next_follow_up=timezone.now())
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.follow_up(completed_task=private.pk).status_code, 403)
        result = self.follow_up(completed_task=visible.pk)
        self.assertEqual(result.status_code, 201, result.data)
        visible.refresh_from_db()
        self.assertTrue(visible.is_completed)
        self.assertEqual(visible.completed_by_id, self.employee.pk)

    def test_removal_block_and_disabled_customer_revoke_employee_access(self):
        self.client.force_authenticate(self.employee)
        connection = ContractorCustomerConnection.objects.get(contractor=self.a, customer_id=self.customer_id)
        connection.status = "BLOCKED"
        connection.save(update_fields=["status"])
        self.assertEqual(self.client.get(self.detail).status_code, 404)
        self.assertEqual(self.follow_up().status_code, 404)
        connection.status = "CONNECTED"
        connection.save(update_fields=["status"])
        portal_user = self.lead.customer.portal_user
        self.assertIsNotNone(portal_user)
        portal_user.is_active = False
        portal_user.save(update_fields=["is_active"])
        self.assertEqual(self.client.get(self.detail).status_code, 404)
        self.assertEqual(self.follow_up().status_code, 404)
        portal_user.is_active = True
        portal_user.save(update_fields=["is_active"])
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        self.assertEqual(self.client.get(self.detail).status_code, 403)

    def test_summary_categories_follow_real_send_event_and_do_not_duplicate_revisions(self):
        self.client.force_authenticate(self.employee)
        response = self.follow_up(outcome="QUOTATION_REQUIRED", next_follow_up=None)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(PortalNotification.objects.filter(recipient=self.a, event_type="LEAD_QUOTATION_REQUIRED").exists())
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.get(reverse("lead-summary")).data["counts"]["need_quotation"], 1)
        quote = self.quote()
        quote.status, quote.sent_at = "SENT", timezone.now() + timedelta(seconds=1)
        quote.save(update_fields=["status", "sent_at"])
        summary = self.client.get(reverse("lead-summary")).data["counts"]
        self.assertEqual(summary["need_quotation"], 0)
        self.assertEqual(summary["post_quotation"], 1)
        self.quote(revision_of=quote, version_number=2)
        summary = self.client.get(reverse("lead-summary")).data["counts"]
        self.assertEqual(summary["need_quotation"], 1)
        self.assertEqual(summary["post_quotation"], 0)
        self.assertEqual(summary["need_call"], 0)
        quote.status = "ACCEPTED"
        quote.save(update_fields=["status"])
        self.assertEqual(self.client.get(reverse("lead-summary")).data["counts"]["need_quotation"], 0)

    def test_quick_update_accepts_optional_notes_and_completes_only_selected_task(self):
        current = CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id,
            created_by=self.a, follow_up_type="CALL", next_follow_up=timezone.now())
        later = CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id,
            created_by=self.a, follow_up_type="WHATSAPP", next_follow_up=timezone.now() + timedelta(days=2))
        result = self.follow_up(creation_key="quick-optional-notes", comment="", outcome="INTERESTED",
            completed_task=current.pk, next_follow_up=None)
        self.assertEqual(result.status_code, 201, result.data)
        current.refresh_from_db()
        later.refresh_from_db()
        self.lead.refresh_from_db()
        self.assertTrue(current.is_completed)
        self.assertFalse(later.is_completed)
        self.assertEqual(self.lead.next_follow_up, later.next_follow_up)
        self.assertEqual(result.data["comment"], "")
        self.assertIsNone(result.data["next_follow_up"])
        self.assertEqual(self.lead.follow_ups.count(), 3)

    def test_completed_followup_replays_accepted_key_but_rejects_another_completion(self):
        task = CustomerFollowUp.objects.create(opportunity=self.lead, customer_id=self.customer_id,
            created_by=self.a, follow_up_type="CALL", next_follow_up=timezone.now())
        payload = {"creation_key": "quick-completed-retry", "completed_task": task.pk, "next_follow_up": None}
        first = self.follow_up(**payload)
        again = self.follow_up(**payload)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(first.data["id"], again.data["id"])
        before = self.lead.follow_ups.count()
        self.client.force_authenticate(self.employee)
        conflict = self.follow_up(creation_key="another-completion", completed_task=task.pk)
        self.assertEqual(conflict.status_code, 409, conflict.data)
        task.refresh_from_db()
        self.assertEqual(task.completed_by_id, self.a.pk)
        self.assertEqual(self.lead.follow_ups.count(), before)
