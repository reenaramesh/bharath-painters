from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.models import BharathUser
from quotations.models import (
    ContractorCustomerConnection, Customer, CustomerFollowUp, PortalNotification,
    SavedCustomerContact,
)
from .models import BlockedCaller, CallInboxEvent


class BookingFixtures:
    def setUp(self):
        self.owner = BharathUser.objects.create_user(
            mobile="9000000711", role="CONTRACTOR", is_verified=True,
            verification_status="VERIFIED",
        )
        self.other = BharathUser.objects.create_user(
            mobile="9000000712", role="CONTRACTOR", is_verified=True,
            verification_status="VERIFIED",
        )
        self.portal = BharathUser.objects.create_user(mobile="9000000713", role="CUSTOMER")
        self.customer = Customer.objects.create(
            contractor=self.owner, portal_user=self.portal,
            name="Confirmed caller", mobile="9000000713",
        )
        self.connection = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.owner, status="CONNECTED",
        )
        self.event = CallInboxEvent.objects.create(
            contractor=self.owner, phone_number="+91 90000 00713",
            normalized_mobile="+919000000713", occurred_at=timezone.now(),
            call_status="MISSED", idempotency_key="booking-call",
            matched_customer=self.customer, review_status="MATCHED",
        )
        self.url = f"/api/call-inbox/events/{self.event.pk}/book-site-visit/"
        self.payload = {
            "next_follow_up": (timezone.now() + timedelta(days=2)).isoformat(),
            "comment": "Measure the living room",
        }
        self.client = APIClient()
        self.client.force_authenticate(self.owner)


class CallBookingTests(BookingFixtures, APITestCase):
    def test_pending_and_disconnected_calls_expose_only_own_saved_contact_name(self):
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.owner, details={'name': 'My private address-book name'})
        self.event.caller_name = 'Name captured by me'
        self.event.save(update_fields=['caller_name'])
        for state in ('PENDING', 'DISCONNECTED', 'BLOCKED'):
            self.connection.status = state
            self.connection.save(update_fields=['status'])
            detail = self.client.get(f'/api/call-inbox/events/{self.event.pk}/')
            self.assertEqual(detail.data['customer_name'], 'My private address-book name')
            self.assertEqual(detail.data['display_name'], 'My private address-book name')
            listing = self.client.get('/api/call-inbox/events/')
            self.assertEqual(listing.data['results'][0]['customer_name'], 'My private address-book name')
            opened = self.client.post(f'/api/call-inbox/events/{self.event.pk}/add-customer/', {}, format='json')
            self.assertEqual(opened.data['customer_name'], 'My private address-book name')

    def test_revoked_call_without_saved_contact_falls_back_to_own_caller_name(self):
        self.connection.status = 'DISCONNECTED'
        self.connection.save(update_fields=['status'])
        self.event.caller_name = 'Name captured by me'
        self.event.save(update_fields=['caller_name'])
        detail = self.client.get(f'/api/call-inbox/events/{self.event.pk}/')
        self.assertEqual(detail.data['customer_name'], '')
        self.assertEqual(detail.data['display_name'], 'Name captured by me')

    def test_connected_call_still_displays_canonical_name(self):
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.owner, details={'name': 'My private address-book name'})
        detail = self.client.get(f'/api/call-inbox/events/{self.event.pk}/')
        self.assertEqual(detail.data['customer_name'], self.customer.name)
        opened = self.client.post(f'/api/call-inbox/events/{self.event.pk}/add-customer/', {}, format='json')
        self.assertEqual(opened.data['customer_name'], self.customer.name)

    def test_revoked_canonical_name_cannot_be_inferred_from_inbox_search(self):
        self.connection.status = 'DISCONNECTED'
        self.connection.save(update_fields=['status'])
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.owner, details={'name': 'Private label'})
        hidden = self.client.get('/api/call-inbox/events/', {'search': self.customer.name})
        self.assertEqual(hidden.data['count'], 0)
        own = self.client.get('/api/call-inbox/events/', {'search': 'Private label'})
        self.assertEqual(own.data['count'], 1)

    def test_notification_failure_rolls_back_booking(self):
        with patch('quotations.views.create_notification', side_effect=RuntimeError('notification failed')):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, self.payload, format='json')
        self.event.refresh_from_db()
        self.assertFalse(CustomerFollowUp.objects.exists())
        self.assertIsNone(self.event.booked_follow_up_id)

    def test_dismissed_event_is_not_bookable(self):
        self.event.review_status = 'DISMISSED'
        self.event.save(update_fields=['review_status'])
        self.assertEqual(self.client.post(self.url, self.payload, format='json').status_code, 409)
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_retry_returns_existing_booking_even_after_scheduled_time_passes(self):
        first = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        CustomerFollowUp.objects.filter(pk=first.data['booked_follow_up']).update(next_follow_up=timezone.now() - timedelta(days=1))
        retry = self.client.post(self.url, {}, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['booked_follow_up'], first.data['booked_follow_up'])

    def test_booking_creates_one_existing_site_visit_followup_and_retry_returns_it(self):
        first = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        retry = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first.data["booked_follow_up"], retry.data["booked_follow_up"])
        task = CustomerFollowUp.objects.get()
        self.assertEqual(task.created_by, self.owner)
        self.assertEqual(task.customer, self.customer)
        self.assertEqual(task.follow_up_type, "SITE_VISIT")
        self.assertIsNone(task.opportunity_id)
        self.assertEqual(task.comment, self.payload["comment"])
        self.assertEqual(PortalNotification.objects.filter(recipient=self.portal, event_type="SITE_VISIT").count(), 1)
        self.event.refresh_from_db()
        self.assertEqual(self.event.booked_follow_up_id, task.pk)
        detail = self.client.get(f"/api/call-inbox/events/{self.event.pk}/")
        self.assertEqual(detail.data["booked_follow_up"], task.pk)
        self.assertEqual(detail.data["booked_visit"]["next_follow_up"], first.data["booked_visit"]["next_follow_up"])

    def test_other_owner_and_unverified_or_wrong_role_cannot_book(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 404)
        self.owner.is_verified = False
        self.owner.save(update_fields=["is_verified"])
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 403)
        self.client.force_authenticate(self.portal)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 403)
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_saved_contact_and_nonconnected_states_do_not_grant_booking_consent(self):
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.owner)
        for state in ("PENDING", "RECONNECT_PENDING", "REJECTED", "DISCONNECTED", "BLOCKED"):
            with self.subTest(state=state):
                self.connection.status = state
                self.connection.save(update_fields=["status"])
                response = self.client.post(self.url, self.payload, format="json")
                self.assertEqual(response.status_code, 409, response.data)
                self.assertEqual(response.data["code"], "CUSTOMER_APPROVAL_REQUIRED")
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_rechecks_mobile_cancelled_identity_and_blocked_caller(self):
        self.customer.mobile = "9000000714"
        self.customer.save()
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 409)
        self.customer.mobile = self.event.phone_number
        self.customer.status = "CANCELLED"
        self.customer.save()
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 409)
        self.customer.status = "NEW"
        self.customer.save()
        BlockedCaller.objects.create(contractor=self.owner, normalized_mobile=self.event.normalized_mobile)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 409)
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_invalid_or_missing_date_creates_no_followup_or_notification(self):
        for value in (None, "not-a-date", (timezone.now() - timedelta(days=1)).isoformat()):
            response = self.client.post(self.url, {"next_follow_up": value}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(CustomerFollowUp.objects.exists())
        self.assertFalse(PortalNotification.objects.exists())

    def test_unlinked_event_requires_existing_customer_link(self):
        self.event.matched_customer = None
        self.event.save(update_fields=["matched_customer"])
        response = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(CustomerFollowUp.objects.exists())

    def test_legacy_owned_customer_is_allowed_only_without_connection_history(self):
        self.connection.delete()
        first = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.other, status="CONNECTED")
        retry = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(retry.status_code, 409, retry.data)
        self.assertEqual(CustomerFollowUp.objects.count(), 1)


class CallBookingConcurrencyTests(BookingFixtures, TransactionTestCase):
    def test_parallel_retries_create_one_followup(self):
        owner_pk = self.owner.pk

        def book():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(BharathUser.objects.get(pk=owner_pk))
                response = client.post(self.url, self.payload, format="json")
                return response.status_code, response.data.get("booked_follow_up")
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: book(), range(2)))
        self.assertEqual(sorted(code for code, _ in results), [200, 201], results)
        self.assertEqual(len({task for _, task in results}), 1)
        self.assertEqual(CustomerFollowUp.objects.count(), 1)
        self.assertEqual(PortalNotification.objects.filter(event_type="SITE_VISIT").count(), 1)
