from django.urls import reverse
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from .models import Customer, SavedCustomerContact, ContractorCustomerConnection, CustomerConnectionAudit, ChatConversation, PortalNotification, Property


class SavedContactAndCustomerConnectTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9000111101", password="Pass123!", role="CONTRACTOR")
        self.other = BharathUser.objects.create_user(mobile="9000111102", password="Pass123!", role="CONTRACTOR")
        self.user = BharathUser.objects.create_user(mobile="9000111103", password="Pass123!", role="CUSTOMER")
        self.customer = Customer.objects.create(name="Private account name", mobile=self.user.mobile, email="private@example.com", address="Private address", notes="Private notes", portal_user=self.user)
        self.client.force_authenticate(self.contractor)
        self.customer_url = reverse("customer-detail", kwargs={"pk": self.customer.id})

    def save_contact(self):
        return self.client.post(reverse("customer-list-create"), {"name": "My saved name", "mobile": self.user.mobile, "notes": "My follow-up notes"}, format="json")

    def test_contact_saves_immediately_without_connection_or_profile_disclosure(self):
        response = self.save_contact()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["id"], self.customer.id)
        self.assertEqual(response.data["connection_status"], "PENDING")
        self.assertEqual(ContractorCustomerConnection.objects.count(), 1)
        self.assertTrue(PortalNotification.objects.exists())
        self.assertEqual(Customer.objects.count(), 1)
        detail = self.client.get(self.customer_url)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["name"], "My saved name")
        self.assertEqual(detail.data["email"], "")
        self.assertEqual(detail.data["address"], "")
        self.assertEqual(detail.data["notes"], "My follow-up notes")
        self.assertNotIn("portal_user", detail.data)
        self.assertTrue(detail.data["bharath_id"].startswith("BP-C-******"))
        self.assertEqual(detail.data["properties"], [])
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "Private account name")
        self.assertEqual(self.customer.notes, "Private notes")

    def test_saved_contact_is_listed_but_not_available_for_work_until_approved(self):
        self.save_contact()
        self.assertEqual(self.client.get(reverse("customer-list-create")).data, [])
        listing = self.client.get(reverse("customer-list-create"), {"include_saved": "1"})
        self.assertEqual([item["id"] for item in listing.data], [self.customer.id])
        response = self.client.post(reverse("property-list-create"), {"customer": self.customer.id, "name": "Premature project"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Property.objects.exists())

    def test_repeated_save_does_not_duplicate_or_request_connection(self):
        self.assertEqual(self.save_contact().status_code, 201)
        self.assertEqual(self.save_contact().status_code, 200)
        self.assertEqual(SavedCustomerContact.objects.count(), 1)
        self.assertEqual(ContractorCustomerConnection.objects.count(), 1)

    def test_private_contact_edits_never_change_global_profile(self):
        self.save_contact()
        response = self.client.patch(self.customer_url, {"name": "Updated local name", "email": "entered@example.com", "notes": "Updated private note"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(self.customer_url).data["email"], "entered@example.com")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.email, "private@example.com")
        self.assertEqual(self.customer.name, "Private account name")
        changed_mobile = self.client.patch(self.customer_url, {"mobile": "9000999901"}, format="json")
        self.assertEqual(changed_mobile.status_code, 400)

    def test_other_contractor_cannot_read_saved_details(self):
        self.save_contact()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.customer_url).status_code, 404)
        self.assertEqual(self.client.get(reverse("customer-list-create"), {"include_saved": "1"}).data, [])

    def test_saved_contact_survives_pending_and_rejected_request(self):
        self.save_contact()
        response = self.client.post(reverse("contractor-customer-connection-request"), {"mobile": self.user.mobile}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        connection = ContractorCustomerConnection.objects.get()
        self.assertEqual(self.client.get(self.customer_url).data["connection_status"], "PENDING")
        self.assertEqual(self.client.get(self.customer_url).data["name"], "My saved name")
        self.client.force_authenticate(self.user)
        self.client.post(reverse("customer-connection-request-reject", args=[connection.id]))
        self.client.force_authenticate(self.contractor)
        self.assertEqual(self.client.get(self.customer_url).data["connection_status"], "REJECTED")
        self.assertEqual(self.client.get(self.customer_url).data["name"], "My saved name")

    def test_approval_preserves_contractor_notes_and_enables_work(self):
        self.save_contact()
        request = ContractorCustomerConnection.objects.get()
        self.client.force_authenticate(self.user)
        approved = self.client.post(reverse("customer-connection-request-accept", args=[request.id]))
        self.assertEqual(approved.status_code, 200)
        self.client.force_authenticate(self.contractor)
        detail = self.client.get(self.customer_url)
        self.assertFalse(detail.data["is_saved_contact"])
        self.assertEqual(detail.data["notes"], "My follow-up notes")
        self.assertEqual(detail.data["name"], "Private account name")

    def test_customer_search_accepts_mobile_formats_and_invites_unknown_number(self):
        self.client.force_authenticate(self.user)
        for mobile in (self.contractor.mobile[-10:], self.contractor.mobile, self.contractor.mobile.lstrip("+")):
            response = self.client.get(reverse("customer-contractor-search"), {"mobile": mobile})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["contractor"]["id"], self.contractor.id)
            self.assertTrue(response.data["can_connect"])
        unknown = self.client.get(reverse("customer-contractor-search"), {"mobile": "9000999911"})
        self.assertEqual(unknown.data["state"], "NOT_FOUND")
        self.assertTrue(unknown.data["can_invite"])
        self.assertEqual(unknown.data["mobile"], "+919000999911")
        self.assertFalse(ContractorCustomerConnection.objects.exists())
        invalid = self.client.get(reverse("customer-contractor-search"), {"mobile": "123"})
        self.assertEqual(invalid.status_code, 400)

    def test_customer_initiated_connection_is_explicit_and_idempotent(self):
        self.save_contact()
        self.client.force_authenticate(self.user)
        for _ in range(2):
            response = self.client.post(reverse("customer-contractor-connect"), {"mobile": self.contractor.mobile}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["status"], "CONNECTED")
        connection = ContractorCustomerConnection.objects.get()
        self.assertEqual(connection.customer_id, self.customer.id)
        self.assertEqual(connection.approval_method, "CUSTOMER_PORTAL")
        self.assertEqual(connection.requested_by_id, self.user.id)
        self.assertEqual(connection.internal_notes, "My follow-up notes")
        self.assertEqual(CustomerConnectionAudit.objects.count(), 2)
        self.assertEqual(ChatConversation.objects.count(), 1)
        self.assertEqual(PortalNotification.objects.filter(recipient=self.contractor).count(), 1)

    def test_customer_connect_accepts_existing_pending_request(self):
        connection = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor, requested_by=self.contractor)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("customer-contractor-connect"), {"mobile": self.contractor.mobile}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(ContractorCustomerConnection.objects.get().id, connection.id)
        self.assertEqual(response.data["status"], "CONNECTED")

    def test_customer_connect_does_not_bypass_blocks_or_wrong_roles(self):
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.contractor, status="BLOCKED")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(reverse("customer-contractor-connect"), {"mobile": self.contractor.mobile}, format="json").status_code, 409)
        self.assertEqual(self.client.post(reverse("customer-contractor-connect"), {"mobile": self.user.mobile}, format="json").status_code, 404)
        result = self.client.get(reverse("customer-contractor-search"), {"mobile": self.user.mobile})
        self.assertFalse(result.data["can_invite"])
        self.client.force_authenticate(self.contractor)
        self.assertEqual(self.client.get(reverse("customer-contractor-search"), {"mobile": self.other.mobile}).status_code, 403)
        self.assertEqual(self.client.post(reverse("customer-contractor-connect"), {"mobile": self.other.mobile}, format="json").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("customer-contractor-search"), {"mobile": self.other.mobile}).status_code, 401)

    def test_save_and_edit_existing_pending_contact_preserves_request_state(self):
        requested = self.client.post(reverse("contractor-customer-connection-request"), {"mobile": self.user.mobile}, format="json")
        self.assertEqual(requested.status_code, 201)
        notification_count = PortalNotification.objects.count()
        saved = self.save_contact()
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data["connection_status"], "PENDING")
        self.assertEqual(PortalNotification.objects.count(), notification_count)
        edited = self.client.patch(self.customer_url, {"notes": ""}, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        connection = ContractorCustomerConnection.objects.get()
        self.assertEqual(connection.status, "PENDING")
        self.assertEqual(connection.internal_notes, "")
        self.assertEqual(self.client.get(self.customer_url).data["name"], "My saved name")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.notes, "Private notes")
