"""Customer profile regression cases; execution deferred to the combined round."""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection, Customer, CustomerFollowUp, Lead,
    PortalNotification, SavedCustomerContact,
)


class CustomerProfileFollowupTests(APITestCase):
    def setUp(self):
        flags = dict(role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.a = BharathUser.objects.create_user(mobile="9000480001", **flags)
        self.b = BharathUser.objects.create_user(mobile="9000480002", **flags)
        self.unrelated = BharathUser.objects.create_user(mobile="9000480003", **flags)
        self.portal = BharathUser.objects.create_user(mobile="9000480004", role="CUSTOMER", is_active=True)
        self.customer = Customer.objects.create(
            contractor=self.a, portal_user=self.portal, mobile=self.portal.mobile,
            name="Portal profile", gst_number="PORTAL-PRIVATE",
        )
        for owner in (self.a, self.b):
            ContractorCustomerConnection.objects.create(
                customer=self.customer, contractor=owner, status="CONNECTED",
            )
            SavedCustomerContact.objects.create(
                customer=self.customer, contractor=owner,
                details={"name": f"Contact {owner.pk}", "mobile": self.portal.mobile, "gst_number": f"LOCAL-{owner.pk}"},
            )
        self.url = reverse("customer-follow-ups", args=[self.customer.pk])
        self.client.force_authenticate(self.a)

    def payload(self, **changes):
        values = dict(follow_up_type="CALL", comment="", creation_key="general-save-retry",
                      next_follow_up=(timezone.now() + timedelta(hours=2)).isoformat())
        values.update(changes)
        return values

    def test_retry_returns_the_same_customer_level_reminder(self):
        payload = self.payload()
        first = self.client.post(self.url, payload, format="json")
        second = self.client.post(self.url, payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(CustomerFollowUp.objects.count(), 1)
        task = CustomerFollowUp.objects.get()
        self.assertIsNone(task.opportunity_id)
        self.assertEqual(task.performed_by_id, self.a.pk)
        self.assertEqual(task.comment, "")
        self.assertEqual(len(self.client.get(reverse("customer-task-list")).data), 1)

    def test_retry_after_completion_does_not_reopen_task(self):
        payload = self.payload()
        first = self.client.post(self.url, payload, format="json")
        task_id = first.data["id"]
        completed = self.client.patch(reverse("customer-task-complete", args=[task_id]), {"is_completed": True}, format="json")
        self.assertEqual(completed.status_code, 200, completed.data)
        repeated = self.client.post(self.url, payload, format="json")
        self.assertEqual(repeated.status_code, 200, repeated.data)
        self.assertTrue(repeated.data["is_completed"])
        self.assertEqual(CustomerFollowUp.objects.count(), 1)

    def test_changed_payload_cannot_reuse_a_save_identifier(self):
        payload = self.payload()
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 201)
        changed = self.client.post(self.url, {**payload, "comment": "Different discussion"}, format="json")
        self.assertEqual(changed.status_code, 409, changed.data)
        self.assertEqual(CustomerFollowUp.objects.get().comment, "")

    def test_site_visit_notification_is_not_repeated_by_retry(self):
        payload = self.payload(follow_up_type="SITE_VISIT")
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 201)
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 200)
        self.assertEqual(PortalNotification.objects.filter(recipient=self.portal, event_type="SITE_VISIT").count(), 1)

    def test_general_note_does_not_change_a_customer_or_enquiry_status(self):
        lead = Lead.objects.create(contractor=self.a, customer=self.customer, title="Painting", stage="QUOTATION")
        original_status = self.customer.status
        result = self.client.post(self.url, self.payload(next_follow_up=None, follow_up_type="NOTE", comment="General discussion"), format="json")
        self.assertEqual(result.status_code, 201, result.data)
        self.customer.refresh_from_db()
        lead.refresh_from_db()
        self.assertEqual(self.customer.status, original_status)
        self.assertEqual(lead.stage, "QUOTATION")
        self.assertIsNone(lead.next_follow_up)
        self.assertEqual(self.client.get(reverse("customer-task-list")).data, [])

    def test_identical_keys_are_private_to_each_contractor(self):
        payload = self.payload()
        first = self.client.post(self.url, payload, format="json")
        self.client.force_authenticate(self.b)
        second = self.client.post(self.url, payload, format="json")
        self.assertEqual(second.status_code, 201, second.data)
        self.assertNotEqual(first.data["id"], second.data["id"])
        listing = self.client.get(self.url, {"completed": "all"})
        self.assertEqual([row["id"] for row in listing.data], [second.data["id"]])
        self.assertEqual(self.client.patch(reverse("customer-task-complete", args=[first.data["id"]]), {"is_completed": True}, format="json").status_code, 404)

    def test_restricted_and_unrelated_contractors_cannot_save(self):
        payload = self.payload()
        self.client.force_authenticate(self.unrelated)
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 404)
        self.client.force_authenticate(self.a)
        for status in ("BLOCKED", "DISCONNECTED", "PENDING"):
            ContractorCustomerConnection.objects.filter(customer=self.customer, contractor=self.a).update(status=status)
            self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 404)
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_disabled_customer_and_wrong_account_roles_cannot_save(self):
        self.portal.is_active = False
        self.portal.save(update_fields=["is_active"])
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 403)
        self.client.force_authenticate(self.portal)
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 401)

    def test_task_completion_rechecks_blocks_and_disabled_accounts(self):
        reminder = self.client.post(self.url, self.payload(), format="json")
        url = reverse("customer-task-complete", args=[reminder.data["id"]])
        connection = ContractorCustomerConnection.objects.get(customer=self.customer, contractor=self.a)
        for status in ("BLOCKED", "DISCONNECTED"):
            connection.status = status
            connection.save(update_fields=["status"])
            self.assertEqual(self.client.patch(url, {"is_completed": True}, format="json").status_code, 404)
        connection.status = "CONNECTED"
        connection.save(update_fields=["status"])
        self.portal.is_active = False
        self.portal.save(update_fields=["is_active"])
        self.assertEqual(self.client.patch(url, {"is_completed": True}, format="json").status_code, 403)
        self.assertFalse(CustomerFollowUp.objects.get(pk=reminder.data["id"]).is_completed)

    def test_repeated_task_completion_retains_its_original_completion_time(self):
        reminder = self.client.post(self.url, self.payload(), format="json")
        url = reverse("customer-task-complete", args=[reminder.data["id"]])
        first = self.client.patch(url, {"is_completed": True}, format="json")
        again = self.client.patch(url, {"is_completed": True}, format="json")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(first.data["completed_at"], again.data["completed_at"])

    def test_detail_gst_uses_the_requesting_contractors_saved_value(self):
        url = reverse("customer-detail", args=[self.customer.pk])
        self.assertEqual(self.client.get(url).data["gst_number"], f"LOCAL-{self.a.pk}")
        updated = self.client.patch(url, {"gst_number": "UPDATED-LOCAL"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.client.force_authenticate(self.b)
        self.assertEqual(self.client.get(url).data["gst_number"], f"LOCAL-{self.b.pk}")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.gst_number, "PORTAL-PRIVATE")
