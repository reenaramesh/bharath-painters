"""Phone-first lookup must identify only the requesting contractor's contacts."""
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection, Customer, CustomerConnectionAudit,
    CustomerShareLink, SavedCustomerContact,
)


class CustomerContactLookupTests(APITestCase):
    def setUp(self):
        flags = dict(role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.a = BharathUser.objects.create_user(mobile="9000460001", **flags)
        self.b = BharathUser.objects.create_user(mobile="9000460002", **flags)
        self.customer = Customer.objects.create(name="Private portal name", mobile="9086543214")
        self.client.force_authenticate(self.a)

    def lookup(self, mobile="+91 9086543214"):
        return self.client.post("/api/quotations/customers/lookup-contact/", {"mobile": mobile}, format="json")

    def save(self, **values):
        return self.client.post(reverse("customer-list-create"), {
            "name": "My saved name", "mobile": self.customer.mobile, **values,
        }, format="json")

    def test_lookup_normalizes_and_returns_only_my_saved_details(self):
        self.save()
        for number in ("9086543214", "+919086543214", "+91 90865 43214"):
            response = self.lookup(number)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["state"], "FOUND")
            self.assertEqual(response.data["normalized_mobile"], "+919086543214")
            self.assertEqual(response.data["customer"]["name"], "My saved name")
            self.assertTrue(response.data["can_use"])
            self.assertNotIn("Private portal name", response.content.decode())
            self.assertNotIn("notes", response.data["customer"])

    def test_another_contractors_contact_looks_like_a_new_local_contact(self):
        self.save()
        self.client.force_authenticate(self.b)
        response = self.lookup()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["state"], "NEW")
        self.assertNotIn("customer", response.data)
        saved = self.save(name="B's name", only_if_new_contact=True)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data["id"], self.customer.pk)
        self.assertEqual(Customer.objects.count(), 1)

    def test_new_lookup_is_read_only(self):
        before = (Customer.objects.count(), BharathUser.objects.count())
        response = self.lookup("9086543299")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["state"], "NEW")
        self.assertEqual(before, (Customer.objects.count(), BharathUser.objects.count()))
        self.assertFalse(SavedCustomerContact.objects.exists())
        self.assertFalse(ContractorCustomerConnection.objects.exists())

    def test_existing_save_guard_never_overwrites_or_issues_links(self):
        self.save(notes="Keep private notes")
        before = (CustomerShareLink.objects.count(), CustomerConnectionAudit.objects.count())
        response = self.save(name="Accidental overwrite", notes="Lost", only_if_new_contact=True)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["already_saved"])
        self.assertEqual(response.data["name"], "My saved name")
        contact = SavedCustomerContact.objects.get(customer=self.customer, contractor=self.a)
        self.assertEqual(contact.details["notes"], "Keep private notes")
        self.assertEqual(before, (CustomerShareLink.objects.count(), CustomerConnectionAudit.objects.count()))
        self.assertNotIn("share_link", response.data)

    def test_restricted_saved_contacts_are_found_but_cannot_be_used(self):
        self.save()
        for state in ("BLOCKED", "DISCONNECTED", "REJECTED", "PENDING", "RECONNECT_PENDING"):
            ContractorCustomerConnection.objects.filter(customer=self.customer).update(status=state)
            response = self.lookup()
            self.assertEqual(response.data["state"], "FOUND")
            self.assertEqual(response.data["customer"]["connection_status"], state)
            self.assertFalse(response.data["can_use"])
            guarded = self.save(only_if_new_contact=True)
            self.assertEqual(guarded.status_code, 200, guarded.data)
            self.assertEqual(ContractorCustomerConnection.objects.get(customer=self.customer).status, state)

    def test_unsaved_restricted_relationship_is_unavailable(self):
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.a, status="BLOCKED")
        response = self.lookup()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["state"], "UNAVAILABLE")
        self.assertNotIn("customer", response.data)

    def test_legacy_owner_and_connected_contacts_are_found(self):
        self.customer.contractor = self.a
        self.customer.save()
        self.assertEqual(self.lookup().data["state"], "FOUND")
        self.assertFalse(self.lookup().data["can_use"])
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.a, status="CONNECTED")
        self.assertTrue(self.lookup().data["can_use"])

    def test_disabled_accounts_and_role_conflicts_are_unavailable(self):
        self.save()
        self.customer.refresh_from_db()
        portal = self.customer.portal_user
        portal.is_active = False
        portal.save()
        for number in (self.customer.mobile, self.b.mobile):
            response = self.lookup(number)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["state"], "UNAVAILABLE")
            self.assertNotIn("customer", response.data)

    def test_invalid_and_unauthorized_lookups(self):
        self.assertEqual(self.lookup("bad number").status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self.lookup().status_code, (401, 403))
        portal = BharathUser.objects.create_user(mobile="9000460099", role="CUSTOMER")
        self.client.force_authenticate(portal)
        self.assertEqual(self.lookup().status_code, 403)

    def test_lookup_cannot_be_redirected_to_another_contractors_scope(self):
        self.save(name="A confidential name")
        self.client.force_authenticate(self.b)
        response = self.client.post(reverse("customer-contact-lookup"), {
            "mobile": self.customer.mobile, "contractor": self.a.pk,
        }, format="json")
        self.assertEqual(response.data["state"], "NEW")
        self.assertNotIn("A confidential name", response.content.decode())

    def test_optional_guard_does_not_change_legacy_save_or_mobile_check(self):
        self.save()
        checked = self.client.post(reverse("customer-check-mobile"), {"mobile": self.customer.mobile}, format="json")
        self.assertEqual(checked.data["state"], "CONNECTED")
        self.assertNotIn("customer", checked.data)
        edited = self.save(name="Intentional edit")
        self.assertEqual(edited.data["name"], "Intentional edit")
        invalid = self.save(only_if_new_contact="false")
        self.assertEqual(invalid.status_code, 400)
