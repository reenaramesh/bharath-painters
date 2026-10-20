"""Focused Recovery Center search coverage for global customer identities."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import ContractorCustomerConnection, Customer


class Phase1SupportSearchTests(APITestCase):
    def setUp(self):
        self.staff = BharathUser.objects.create_user(
            mobile="9000060101", password="Pass123!", role="SUPPORT",
        )
        self.admin = BharathUser.objects.create_user(
            mobile="9000060102", password="Pass123!", role="ADMIN",
        )
        self.contractor = BharathUser.objects.create_user(
            mobile="9000060103", password="Pass123!", role="CONTRACTOR",
            first_name="Legacy", last_name="Contractor",
        )
        self.url = reverse("support-workspace-search")

    def search(self, user, query):
        self.client.force_authenticate(user)
        return self.client.get(self.url, {"q": query})

    def assert_customer_result(self, response, customer, contractor_name=""):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data["customers"] if item["id"] == customer.pk)
        self.assertEqual(row["contractor"], contractor_name)
        self.assertEqual(row["name"], customer.name)
        self.assertEqual(row["mobile"], customer.mobile)
        self.assertEqual(row["status"], customer.status)
        self.assertEqual(set(response.data), {
            "accounts", "customers", "quotations", "invoices", "properties", "measurements",
        })

    def test_staff_and_admin_can_search_independent_customer(self):
        customer = Customer.objects.create(name="Independent Search", mobile="9000060111")
        for user in (self.staff, self.admin):
            with self.subTest(role=user.role):
                self.assert_customer_result(self.search(user, "Independent Search"), customer)

    def test_customer_remains_searchable_after_legacy_contractor_deleted(self):
        customer = Customer.objects.create(
            name="Former Contractor Search", mobile="9000060112", contractor=self.contractor,
        )
        self.contractor.delete()
        customer.refresh_from_db()
        self.assertIsNone(customer.contractor_id)
        self.assert_customer_result(self.search(self.staff, "Former Contractor Search"), customer)

    def test_disconnected_customer_without_legacy_owner_remains_searchable(self):
        customer = Customer.objects.create(name="Disconnected Search", mobile="9000060113")
        ContractorCustomerConnection.objects.create(
            customer=customer, contractor=self.contractor,
            status=ContractorCustomerConnection.Status.DISCONNECTED,
        )
        self.assert_customer_result(self.search(self.staff, "Disconnected Search"), customer)

    def test_existing_legacy_contractor_label_is_preserved(self):
        customer = Customer.objects.create(
            name="Legacy Search", mobile="9000060114", contractor=self.contractor,
        )
        self.assert_customer_result(
            self.search(self.staff, "Legacy Search"), customer, "Legacy Contractor",
        )

    def test_business_roles_cannot_search_global_customer_records(self):
        Customer.objects.create(name="Restricted Search", mobile="9000060115")
        for index, role in enumerate(("CONTRACTOR", "CUSTOMER", "PAINTER"), start=20):
            user = BharathUser.objects.create_user(
                mobile=f"90000601{index}", password="Pass123!", role=role,
            )
            with self.subTest(role=role):
                response = self.search(user, "Restricted Search")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                self.assertNotIn("customers", response.data)

    def test_anonymous_cannot_search_global_customer_records(self):
        response = self.client.get(self.url, {"q": "Independent Search"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_ticket_identity_distinguishes_authenticated_creation_from_mobile_claim(self):
        painter = BharathUser.objects.create_user(
            mobile="9000060190", password="Pass123!", role="PAINTER",
        )
        self.client.force_authenticate(painter)
        authenticated = self.client.post(reverse("support-ticket-list"), {
            "subject": "Signed in", "description": "Authenticated request",
        }, format="json")
        self.assertEqual(authenticated.status_code, 201, authenticated.data)
        self.assertEqual(authenticated.data["requester_identity_source"], "AUTHENTICATED_ACCOUNT")

        claimed = self.client.post(reverse("support-ticket-public"), {
            "mobile": painter.mobile, "subject": "Claimed", "description": "Public form",
        }, format="json")
        self.assertEqual(claimed.status_code, 201, claimed.data)
        self.client.force_authenticate(self.staff)
        rows = self.client.get(reverse("support-ticket-list")).data
        by_subject = {row["subject"]: row for row in rows}
        self.assertEqual(by_subject["Signed in"]["requester_identity_source"], "AUTHENTICATED_ACCOUNT")
        self.assertEqual(by_subject["Claimed"]["requester_identity_source"], "UNVERIFIED_CLAIM")
        from .models import SupportTicket
        public_ticket = SupportTicket.objects.get(subject="Claimed")
        self.assertIsNone(public_ticket.requester_id)
        self.assertIn(painter.mobile, public_ticket.description)

    def test_public_ticket_for_inactive_account_is_unverified_and_cannot_authorize_deletion(self):
        from .models import SupportTicket
        painter = BharathUser.objects.create_user(mobile="9000060191", password="Pass123!", role="PAINTER", is_active=False)
        response = self.client.post(reverse("support-ticket-public"), {
            "mobile": painter.mobile, "subject": "Reactivate", "description": "Please help me recover access",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        ticket = SupportTicket.objects.get(subject="Reactivate")
        self.assertIsNone(ticket.requester_id)
        self.client.force_authenticate(self.staff)
        rejected = self.client.post(reverse("support-workspace-actions"), {
            "action": "DELETE_ACCOUNT", "target_id": painter.pk,
            "ticket_id": ticket.pk, "reason": "Claimed mobile deletion request",
        }, format="json")
        self.assertEqual(rejected.status_code, 400, rejected.data)
        # Legacy public tickets may already contain a claimed requester ID.
        ticket.requester = painter
        ticket.save(update_fields=("requester",))
        rejected = self.client.post(reverse("support-workspace-actions"), {
            "action": "DELETE_ACCOUNT", "target_id": painter.pk,
            "ticket_id": ticket.pk, "reason": "Claimed mobile deletion request",
        }, format="json")
        self.assertEqual(rejected.status_code, 400, rejected.data)
        painter.refresh_from_db()
        self.assertTrue(painter.has_usable_password())

    def test_authenticated_account_holder_ticket_still_authorizes_staff_suspension(self):
        painter = BharathUser.objects.create_user(mobile="9000060192", password="Pass123!", role="PAINTER")
        self.client.force_authenticate(painter)
        created = self.client.post(reverse("support-ticket-list"), {
            "subject": "Suspend my account", "description": "Please suspend my account until I return",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.client.force_authenticate(self.staff)
        response = self.client.post(reverse("support-workspace-actions"), {
            "action": "SUSPEND_ACCOUNT", "target_id": painter.pk,
            "ticket_id": created.data["id"], "reason": "Account holder requested suspension",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        painter.refresh_from_db()
        self.assertFalse(painter.is_active)
