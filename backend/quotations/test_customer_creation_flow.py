from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import ContractorCustomerConnection, Customer, Property, SavedCustomerContact


class CustomerCreationFlowTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9000010011", password="Pass123!", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000010012", password="Pass123!", role="CONTRACTOR")

    def test_new_customer_gets_id_login_without_password_or_duplicate(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(reverse("customer-list-create"), {"name": "New customer", "mobile": "9000010099"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get(pk=response.data["id"])
        self.assertTrue(customer.bharath_id.startswith("BP-C-"))
        self.assertFalse(customer.portal_user.has_usable_password())
        self.assertNotIn("temporary_password", response.data)
        self.assertEqual(response.data["activation_link"], "/customer-register")
        self.assertTrue(SavedCustomerContact.objects.filter(customer=customer, contractor=self.contractor).exists())
        self.assertEqual(ContractorCustomerConnection.objects.get(customer=customer).status, "CONNECTED")
        again = self.client.post(reverse("customer-list-create"), {"name": "New customer", "mobile": "+919000010099"}, format="json")
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(again.status_code, 200)

    def test_existing_customer_requires_approval_and_keeps_private_work_hidden(self):
        self.client.force_authenticate(self.contractor)
        created = self.client.post(reverse("customer-list-create"), {"name": "Owner", "mobile": "9000010088"}, format="json")
        customer = Customer.objects.get(pk=created.data["id"])
        self.client.force_authenticate(self.other)
        saved = self.client.post(reverse("customer-list-create"), {"name": "My contact", "mobile": customer.mobile}, format="json")
        self.assertEqual(saved.status_code, 201, saved.data)
        connection = ContractorCustomerConnection.objects.get(customer=customer, contractor=self.other)
        self.assertEqual(connection.status, "PENDING")
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(self.client.post(reverse("property-list-create"), {"customer": customer.id, "name": "Private"}, format="json").status_code, 400)
        self.assertFalse(Property.objects.filter(contractor=self.other).exists())
        self.client.force_authenticate(customer.portal_user)
        accepted = self.client.post(reverse("customer-connection-request-accept", args=[connection.id]))
        self.assertEqual(accepted.status_code, 200)
        connection.refresh_from_db()
        self.assertIsNotNone(connection.accepted_at)

    def test_decline_resend_block_and_unique_connection(self):
        self.client.force_authenticate(self.contractor)
        created = self.client.post(reverse("customer-list-create"), {"name": "Owner", "mobile": "9000010077"}, format="json")
        customer = Customer.objects.get(pk=created.data["id"])
        self.client.force_authenticate(self.other)
        self.client.post(reverse("customer-list-create"), {"name": "Saved", "mobile": customer.mobile}, format="json")
        connection = ContractorCustomerConnection.objects.get(customer=customer, contractor=self.other)
        self.client.force_authenticate(customer.portal_user)
        self.assertEqual(self.client.post(reverse("customer-connection-request-reject", args=[connection.id])).status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(reverse("contractor-customer-connection-request"), {"mobile": customer.mobile}).status_code, 429)
        connection.last_request_at = timezone.now() - timedelta(days=8)
        connection.save(update_fields=("last_request_at",))
        resent = self.client.post(reverse("contractor-customer-connection-request"), {"mobile": customer.mobile})
        self.assertEqual(resent.status_code, 201, resent.data)
        connection.refresh_from_db()
        self.assertEqual(connection.status, "RECONNECT_PENDING")
        self.assertEqual(connection.request_count, 2)
        self.assertEqual(ContractorCustomerConnection.objects.filter(customer=customer, contractor=self.other).count(), 1)
        self.client.force_authenticate(customer.portal_user)
        self.assertEqual(self.client.post(reverse("customer-contractor-block", args=[connection.id])).status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(reverse("contractor-customer-connection-request"), {"mobile": customer.mobile}).status_code, 403)
