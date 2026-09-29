from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.legal import POLICY_VERSION
from accounts.models import BharathUser
from .models import ContractorCustomerConnection, Customer, CustomerShareLink


class CustomerShareLinkTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9000011011", password="Pass123!", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000011012", password="Pass123!", role="CUSTOMER")
        self.client.force_authenticate(self.contractor)

    def create_customer(self):
        response = self.client.post(reverse("customer-list-create"), {"name": "Maya", "mobile": "9000011099"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_activation_token_is_opaque_one_use_and_regeneratable(self):
        created = self.create_customer()
        customer = Customer.objects.get(pk=created.data["id"])
        path = created.data["share_link"].removeprefix("/customer-link/")
        self.assertNotIn(customer.mobile, path)
        self.assertNotIn(customer.bharath_id, path)
        self.assertEqual(len(CustomerShareLink.objects.get().token_hash), 64)
        regenerated = self.client.post(reverse("customer-share-link-create", args=[customer.id]))
        self.assertEqual(regenerated.status_code, 200)
        self.assertNotEqual(created.data["share_link"], regenerated.data["share_link"])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[path])).status_code, 404)
        new_token = regenerated.data["share_link"].split("/")[-1]
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[new_token])).status_code, 200)
        activated = self.client.post(reverse("customer-share-link", args=[new_token]), {
            "password": "BetterPass123!", "policy_version": POLICY_VERSION,
            "document_scrolled": True, "terms_accepted": True, "privacy_notice_acknowledged": True,
        }, format="json")
        self.assertEqual(activated.status_code, 200, activated.data)
        customer.portal_user.refresh_from_db()
        self.assertTrue(customer.portal_user.check_password("BetterPass123!"))
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[new_token])).status_code, 404)

    def test_connection_link_requires_matching_customer_and_expires(self):
        created = self.create_customer()
        customer = Customer.objects.get(pk=created.data["id"])
        customer.portal_user.set_password("BetterPass123!")
        customer.portal_user.save(update_fields=("password",))
        second_contractor = BharathUser.objects.create_user(mobile="9000011013", password="Pass123!", role="CONTRACTOR")
        self.client.force_authenticate(second_contractor)
        saved = self.client.post(reverse("customer-list-create"), {"name": "Maya contact", "mobile": customer.mobile}, format="json")
        self.assertEqual(saved.status_code, 201, saved.data)
        token = saved.data["share_link"].split("/")[-1]
        connection = ContractorCustomerConnection.objects.get(customer=customer, contractor=second_contractor)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[token])).status_code, 200)
        self.assertEqual(self.client.post(reverse("customer-share-link", args=[token]), {"action": "accept"}).status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(reverse("customer-share-link", args=[token]), {"action": "accept"}).status_code, 403)
        self.client.force_authenticate(customer.portal_user)
        accepted = self.client.post(reverse("customer-share-link", args=[token]), {"action": "accept"})
        self.assertEqual(accepted.status_code, 200, accepted.data)
        connection.refresh_from_db()
        self.assertEqual(connection.status, "CONNECTED")
        self.assertEqual(self.client.post(reverse("customer-share-link", args=[token]), {"action": "reject"}).status_code, 404)

        self.client.force_authenticate(second_contractor)
        # Another pending link can be expired without exposing its target in the token.
        another = Customer.objects.create(name="Another", mobile="9000011088")
        pending = ContractorCustomerConnection.objects.create(customer=another, contractor=second_contractor)
        from .views import issue_customer_share_link
        issued = issue_customer_share_link(pending, CustomerShareLink.Purpose.CONNECTION)
        expired_token = issued["share_link"].split("/")[-1]
        CustomerShareLink.objects.filter(connection=pending).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[expired_token])).status_code, 404)

    def test_connection_link_can_reject_or_block(self):
        created = self.create_customer()
        customer = Customer.objects.get(pk=created.data["id"])
        customer.portal_user.set_password("BetterPass123!")
        customer.portal_user.save(update_fields=("password",))
        second_contractor = BharathUser.objects.create_user(mobile="9000011014", password="Pass123!", role="CONTRACTOR")
        self.client.force_authenticate(second_contractor)
        saved = self.client.post(reverse("customer-list-create"), {"name": "Maya contact", "mobile": customer.mobile}, format="json")
        token = saved.data["share_link"].split("/")[-1]
        connection = ContractorCustomerConnection.objects.get(customer=customer, contractor=second_contractor)
        self.client.force_authenticate(customer.portal_user)
        rejected = self.client.post(reverse("customer-share-link", args=[token]), {"action": "reject"})
        self.assertEqual(rejected.status_code, 200)
        connection.refresh_from_db()
        self.assertEqual(connection.status, "REJECTED")
        self.assertEqual(self.client.get(reverse("customer-share-link", args=[token])).status_code, 404)
        connection.status = "RECONNECT_PENDING"
        connection.save(update_fields=("status",))
        self.client.force_authenticate(second_contractor)
        replacement = self.client.post(reverse("customer-share-link-create", args=[customer.id]))
        self.assertEqual(replacement.status_code, 200)
        token = replacement.data["share_link"].split("/")[-1]
        self.client.force_authenticate(customer.portal_user)
        blocked = self.client.post(reverse("customer-share-link", args=[token]), {"action": "block"})
        self.assertEqual(blocked.status_code, 200)
        connection.refresh_from_db()
        self.assertEqual(connection.status, "BLOCKED")
