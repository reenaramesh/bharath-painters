from datetime import timedelta
import threading
from unittest import skipUnless

from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection,
    Customer,
    CustomerConnectionAudit,
    PortalNotification,
    Property,
    PropertyMeasurement,
    Quotation,
    ServiceRequest,
    SupportTicket,
)


class GlobalCustomerConnectionTests(APITestCase):
    def setUp(self):
        self.contractor_a = BharathUser.objects.create_user(mobile="9000000101", password="Pass123!", role="CONTRACTOR", bharath_id="BP-CT-100001")
        self.contractor_b = BharathUser.objects.create_user(mobile="9000000102", password="Pass123!", role="CONTRACTOR", bharath_id="BP-CT-100002")
        self.customer_user = BharathUser.objects.create_user(mobile="9742839992", password="Pass123!", role="CUSTOMER")
        self.customer = Customer.objects.create(contractor=self.contractor_a, portal_user=self.customer_user, name="Ramesh Kumar", mobile="+91 97428 39992")
        self.connection_a = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.contractor_a,
            requested_by=self.contractor_a, status="CONNECTED",
            connected_at=timezone.now(), approved_at=timezone.now(),
            approval_method="INITIAL_CREATOR",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_mobile_variants_find_one_existing_customer(self):
        self.authenticate(self.contractor_b)
        for value in ("9742839992", "+919742839992", "919742839992"):
            response = self.client.post(reverse("customer-check-mobile"), {"mobile": value}, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data["customer_exists"])
            self.assertNotIn("name", response.data)
            self.assertEqual(response.data["mobile"], "******9992")

    def test_database_rejects_duplicate_normalized_mobile(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Customer.objects.create(contractor=self.contractor_b, name="Duplicate", mobile="919742839992")

    def test_existing_customer_creation_saves_private_contact(self):
        self.authenticate(self.contractor_b)
        response = self.client.post(reverse("customer-list-create"), {"name": "Another", "mobile": "9742839992"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Another")
        self.assertEqual(response.data["email"], "")
        self.assertTrue(response.data["is_saved_contact"])
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "Ramesh Kumar")

    def test_connection_request_is_persistent_and_not_duplicated(self):
        self.authenticate(self.contractor_b)
        url = reverse("contractor-customer-connection-request")
        first = self.client.post(url, {"mobile": "9742839992"}, format="json")
        second = self.client.post(url, {"mobile": "9742839992"}, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(ContractorCustomerConnection.objects.filter(customer=self.customer, contractor=self.contractor_b).count(), 1)
        self.assertTrue(PortalNotification.objects.filter(recipient=self.customer_user, event_type="CONNECTION_REQUEST").exists())

    def test_customer_accepts_own_request_and_contractor_is_notified(self):
        request = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        self.authenticate(self.customer_user)
        response = self.client.post(reverse("customer-connection-request-accept", args=[request.id]), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request.refresh_from_db()
        self.assertEqual(request.status, "CONNECTED")
        self.assertTrue(CustomerConnectionAudit.objects.filter(connection=request, action="CONNECTION_ACCEPTED").exists())
        self.assertTrue(PortalNotification.objects.filter(recipient=self.contractor_b, event_type="CONNECTION_ACCEPTED").exists())

    def test_customer_rejects_request_and_cooldown_prevents_resend(self):
        request = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        self.authenticate(self.customer_user)
        response = self.client.post(reverse("customer-connection-request-reject", args=[request.id]), {"reason": "I don't know this contractor"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.authenticate(self.contractor_b)
        retry = self.client.post(reverse("contractor-customer-connection-request"), {"mobile": "9742839992"}, format="json")
        self.assertEqual(retry.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_reading_notification_does_not_accept_request(self):
        request = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        notification = PortalNotification.objects.create(recipient=self.customer_user, actor=self.contractor_b, event_type="CONNECTION_REQUEST", title="Request", message="Request")
        self.authenticate(self.customer_user)
        self.client.patch(reverse("portal-notifications"), {"id": notification.id}, format="json")
        request.refresh_from_db()
        self.assertEqual(request.status, "PENDING")

    def test_multiple_pending_requests_are_counted(self):
        contractor_c = BharathUser.objects.create_user(mobile="9000000103", password="Pass123!", role="CONTRACTOR", bharath_id="BP-CT-100003")
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=contractor_c, requested_by=contractor_c)
        self.authenticate(self.customer_user)
        response = self.client.get(reverse("customer-connection-requests"))
        self.assertEqual(response.data["pending_count"], 2)

    def test_another_customer_cannot_accept_request(self):
        other_user = BharathUser.objects.create_user(mobile="9888888888", password="Pass123!", role="CUSTOMER")
        request = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        self.authenticate(other_user)
        response = self.client.post(reverse("customer-connection-request-accept", args=[request.id]), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_disconnected_contractor_cannot_create_property(self):
        connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, status="DISCONNECTED", requested_by=self.contractor_b)
        self.authenticate(self.contractor_b)
        response = self.client.post(reverse("property-list-create"), {"customer": self.customer.id, "name": "Private site", "property_type": "OTHER"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(connection.properties.count(), 0)

    def test_block_prevents_future_requests(self):
        connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, requested_by=self.contractor_b)
        self.authenticate(self.customer_user)
        self.client.post(reverse("customer-contractor-block", args=[connection.id]), {}, format="json")
        self.authenticate(self.contractor_b)
        response = self.client.post(reverse("contractor-customer-connection-request"), {"mobile": self.customer.mobile}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_each_contractor_only_lists_own_relationship_records(self):
        connection_b = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, status="CONNECTED", requested_by=self.contractor_b)
        property_a = Property.objects.create(customer=self.customer, contractor=self.contractor_a, connection=self.connection_a, name="A Site")
        property_b = Property.objects.create(customer=self.customer, contractor=self.contractor_b, connection=connection_b, name="B Site")
        self.authenticate(self.contractor_a)
        properties = self.client.get(reverse("property-list-create"))
        ids = {item["id"] for item in properties.data}
        self.assertIn(property_a.id, ids)
        self.assertNotIn(property_b.id, ids)

    def test_customer_sees_both_connected_contractors(self):
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor_b, status="CONNECTED", requested_by=self.contractor_b)
        self.authenticate(self.customer_user)
        response = self.client.get(reverse("customer-connection-requests"))
        connected = [item for item in response.data["results"] if item["status"] == "CONNECTED"]
        self.assertEqual(len(connected), 2)

    def test_service_requests_are_visible_only_to_selected_contractor(self):
        connection_b = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.contractor_b,
            status="CONNECTED", requested_by=self.contractor_b,
        )
        request = ServiceRequest.objects.create(
            customer=self.customer, connection=connection_b, title="Private plumbing request",
        )
        self.authenticate(self.contractor_a)
        contractor_a = self.client.get(reverse("service-request-list"))
        self.assertNotIn(request.id, {item["id"] for item in contractor_a.data})
        self.authenticate(self.contractor_b)
        contractor_b = self.client.get(reverse("service-request-list"))
        self.assertIn(request.id, {item["id"] for item in contractor_b.data})

    def test_support_tickets_are_visible_only_to_selected_contractor(self):
        connection_b = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.contractor_b,
            status="CONNECTED", requested_by=self.contractor_b,
        )
        ticket = SupportTicket.objects.create(
            customer=self.customer, connection=connection_b, requester=self.customer_user,
            subject="Private project question", description="Only contractor B should handle this.",
        )
        self.authenticate(self.contractor_a)
        contractor_a = self.client.get(reverse("support-ticket-list"))
        self.assertNotIn(ticket.id, {item["id"] for item in contractor_a.data})
        self.authenticate(self.contractor_b)
        contractor_b = self.client.get(reverse("support-ticket-list"))
        self.assertIn(ticket.id, {item["id"] for item in contractor_b.data})

    def test_admin_can_view_connection_audit_but_contractor_cannot(self):
        CustomerConnectionAudit.objects.create(
            connection=self.connection_a, customer=self.customer,
            contractor=self.contractor_a, performed_by=self.customer_user,
            performed_by_role="CUSTOMER", action="CONNECTION_ACCEPTED",
        )
        url = reverse("admin-customer-connection-audit", args=[self.connection_a.id])
        self.authenticate(self.contractor_a)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        administrator = BharathUser.objects.create_user(
            mobile="9000000199", password="Pass123!", role="ADMIN",
        )
        self.authenticate(administrator)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["events"][0]["action"], "CONNECTION_ACCEPTED")

    def test_customer_crm_notes_are_scoped_per_contractor_connection(self):
        connection_b = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.contractor_b,
            status="CONNECTED", requested_by=self.contractor_b,
            internal_notes="Contractor B private note",
        )
        self.connection_a.internal_notes = "Contractor A private note"
        self.connection_a.save(update_fields=("internal_notes",))
        url = reverse("customer-detail", args=[self.customer.id])

        self.authenticate(self.contractor_a)
        contractor_a = self.client.get(url)
        self.assertEqual(contractor_a.data["notes"], "Contractor A private note")
        self.client.patch(url, {"notes": "A updated note"}, format="json")

        self.authenticate(self.contractor_b)
        contractor_b = self.client.get(url)
        self.assertEqual(contractor_b.data["notes"], "Contractor B private note")
        connection_b.refresh_from_db()
        self.assertEqual(connection_b.internal_notes, "Contractor B private note")


@skipUnless(connection.vendor == "postgresql", "Parallel customer creation is validated against PostgreSQL.")
class GlobalCustomerConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def test_parallel_customer_creation_returns_one_customer_and_existing_contact(self):
        contractor = BharathUser.objects.create_user(
            mobile="9000000188", password="Pass123!", role="CONTRACTOR",
        )
        barrier = threading.Barrier(2)
        results = []

        def create_customer(name):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(contractor)
            barrier.wait()
            response = client.post(
                reverse("customer-list-create"),
                {"name": name, "mobile": "+91 98765 43219"},
                format="json",
            )
            results.append(response.status_code)
            close_old_connections()

        threads = [threading.Thread(target=create_customer, args=(f"Customer {index}",)) for index in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(sorted(results), [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(Customer.objects.filter(normalized_mobile="+919876543219").count(), 1)
