from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import Customer


class CallInboxApiTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9876543210", password="test", role="CONTRACTOR"
        )
        self.other = BharathUser.objects.create_user(
            mobile="9876543211", password="test", role="CONTRACTOR"
        )
        self.customer = Customer.objects.create(
            contractor=self.contractor, name="Verified Name", mobile="9876543212"
        )
        self.client.force_authenticate(self.contractor)

    def create_event(self, **overrides):
        payload = {
            "phone_number": "+91 98765 43212",
            "caller_name": "Unverified name",
            "name_source": "PHONE_CONTACTS",
            "occurred_at": (timezone.now() - timedelta(minutes=2)).isoformat(),
            "call_status": "MISSED",
            "idempotency_key": "device-1:call-001",
            "capture_source": "MANUAL",
        }
        payload.update(overrides)
        return self.client.post("/api/call-inbox/events/", payload, format="json")

    def test_unknown_call_is_saved_and_same_idempotency_key_deduplicates(self):
        first = self.create_event(phone_number="9876543213", idempotency_key="same")
        second = self.create_event(phone_number="+91 98765 43213", idempotency_key="same")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(second.data["review_status"], "PENDING")

    def test_existing_customer_is_matched_without_overwriting_verified_name(self):
        response = self.create_event()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["matched_customer"], self.customer.pk)
        self.assertEqual(response.data["display_name"], "Verified Name")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "Verified Name")

    def test_inbox_is_contractor_scoped(self):
        event = self.create_event(phone_number="9876543213")
        self.client.force_authenticate(self.other)
        response = self.client.get(f"/api/call-inbox/events/{event.data['id']}/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get("/api/call-inbox/events/").data["count"], 0)

    def test_add_customer_is_prefill_only_and_link_uses_existing_customer_api_result(self):
        event = self.create_event(phone_number="9876543214")
        prefill = self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/add-customer/", {}, format="json"
        )
        self.assertEqual(prefill.status_code, 200)
        self.assertEqual(prefill.data["action"], "CREATE")
        self.assertEqual(prefill.data["initial_value"]["mobile"], "9876543214")
        self.assertFalse(Customer.objects.filter(mobile="9876543214").exists())

        customer = Customer.objects.create(
            contractor=self.contractor, name="Confirmed", mobile="9876543214"
        )
        linked = self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/link-customer/",
            {"customer_id": customer.pk}, format="json",
        )
        self.assertEqual(linked.status_code, 200)
        self.assertEqual(linked.data["matched_customer"], customer.pk)

    def test_dismiss_and_block_prevent_future_suggestions(self):
        event = self.create_event(phone_number="9876543215", idempotency_key="first")
        self.assertEqual(self.client.post(f"/api/call-inbox/events/{event.data['id']}/block/").status_code, 200)
        next_call = self.create_event(phone_number="+91 98765 43215", idempotency_key="second")
        self.assertEqual(next_call.data["review_status"], "BLOCKED")
        self.assertEqual(self.client.get("/api/call-inbox/events/?tab=pending").data["count"], 0)

        pending = self.create_event(phone_number="9876543216", idempotency_key="third")
        dismissed = self.client.post(f"/api/call-inbox/events/{pending.data['id']}/dismiss/")
        self.assertEqual(dismissed.data["review_status"], "DISMISSED")

    def test_non_contractor_cannot_access_call_inbox(self):
        customer_user = BharathUser.objects.create_user(
            mobile="9876543217", password="test", role="CUSTOMER"
        )
        self.client.force_authenticate(customer_user)
        self.assertEqual(self.client.get("/api/call-inbox/events/").status_code, 403)

    def test_unknown_name_source_is_not_claimed_as_authorized_provider(self):
        response = self.create_event(
            phone_number="9876543220", idempotency_key="provider-name",
            caller_name="Unverified", name_source="AUTHORIZED_PROVIDER",
        )
        self.assertEqual(response.status_code, 400)

    def test_link_rejects_customer_with_different_phone_and_lead_links_to_confirmed_customer(self):
        event = self.create_event(phone_number="9876543218", idempotency_key="lead-call")
        wrong_customer = Customer.objects.create(
            contractor=self.contractor, name="Other", mobile="9876543219"
        )
        wrong = self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/link-customer/",
            {"customer_id": wrong_customer.pk}, format="json",
        )
        self.assertEqual(wrong.status_code, 400)

        customer = Customer.objects.create(
            contractor=self.contractor, name="Confirmed caller", mobile="9876543218"
        )
        self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/link-customer/",
            {"customer_id": customer.pk}, format="json",
        )
        lead = self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/create-lead/",
            {"title": "Quote for interior painting"}, format="json",
        )
        retry = self.client.post(
            f"/api/call-inbox/events/{event.data['id']}/create-lead/",
            {"title": "Retry"}, format="json",
        )
        self.assertEqual(lead.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(lead.data["lead_id"], retry.data["lead_id"])
