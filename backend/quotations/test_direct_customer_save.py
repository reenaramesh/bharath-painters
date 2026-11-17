"""Phone-based saving must grant private CRM access without customer approval."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipIf
from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection, Customer, CustomerConnectionAudit,
    PortalNotification, Property, Quotation, SavedCustomerContact,
)


class DirectCustomerSaveTests(APITestCase):
    def setUp(self):
        flags = {"role": "CONTRACTOR", "is_verified": True, "verification_status": "VERIFIED"}
        self.a = BharathUser.objects.create_user(mobile="9000450001", **flags)
        self.b = BharathUser.objects.create_user(mobile="9000450002", **flags)
        self.portal = BharathUser.objects.create_user(mobile="9000450099", role="CUSTOMER", password="Password123!")
        self.customer = Customer.objects.create(
            name="Portal name", mobile=self.portal.mobile, portal_user=self.portal,
            email="portal@example.com", address="Portal private address", notes="Portal notes",
        )

    def save_contact(self, contractor, **values):
        self.client.force_authenticate(contractor)
        return self.client.post(reverse("customer-list-create"), {
            "name": f"Contact {contractor.pk}", "mobile": "+91 90004 50099", **values,
        }, format="json")

    def test_two_contractors_reuse_identity_and_connect_without_acceptance(self):
        responses = [self.save_contact(person) for person in (self.a, self.b)]
        for response in responses:
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["connection_status"], "CONNECTED")
            self.assertFalse(response.data["is_saved_contact"])
        self.assertEqual(responses[0].data["bharath_id"], responses[1].data["bharath_id"])
        self.assertEqual(Customer.objects.count(), 1)

        self.assertEqual(SavedCustomerContact.objects.count(), 2)
        for relation in ContractorCustomerConnection.objects.all():
            self.assertEqual(relation.origin, "CONTACT_SAVE")
            self.assertIsNone(relation.accepted_at)
            self.assertIsNone(relation.approved_at)
        self.assertFalse(PortalNotification.objects.filter(event_type="CONNECTION_REQUEST").exists())
        self.assertEqual(CustomerConnectionAudit.objects.filter(action="CONTACT_SAVED").count(), 2)

    def test_saved_details_and_edits_never_overwrite_shared_profile(self):
        self.save_contact(self.a, name="A's name", notes="A notes", email="a@example.com")
        saved = self.save_contact(self.b, name="B's name", notes="B notes")
        self.assertEqual(saved.data["name"], "B's name")
        self.assertEqual(saved.data["email"], "")
        self.assertEqual(saved.data["address"], "")
        detail = reverse("customer-detail", args=[self.customer.pk])
        edited = self.client.patch(detail, {"name": "B changed", "notes": "", "email": "b@example.com"}, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["name"], "B changed")
        self.assertEqual(edited.data["notes"], "")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "Portal name")
        self.assertEqual(self.customer.email, "portal@example.com")
        self.assertEqual(self.customer.notes, "Portal notes")
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.get(detail).data["name"], "A's name")
        again = self.save_contact(self.a, name="A updated", mobile="9000450099")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data["name"], "A updated")
        self.assertEqual(SavedCustomerContact.objects.count(), 2)

    def test_can_create_own_property_and_share_quotes_but_not_read_other_work(self):
        quotes = []
        for person in (self.a, self.b):
            self.save_contact(person, name=f"Private name {person.pk}")
            response = self.client.post(reverse("property-list-create"), {
                "customer": self.customer.pk, "name": f"Site {person.pk}",
            }, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            property_obj = Property.objects.get(pk=response.data["id"])
            quote = Quotation.objects.create(
                contractor=person, customer=self.customer, property=property_obj,
                connection=property_obj.connection, quotation_number=f"DIRECT-{person.pk}", status="DRAFT",
            )
            self.assertEqual(quote.customer_snapshot["name"], f"Private name {person.pk}")
            self.assertEqual(quote.customer_snapshot["email"], "")
            self.client.force_authenticate(self.portal)
            draft_search = self.client.get(reverse("global-search"), {"q": quote.quotation_number})
            self.assertEqual(draft_search.data, [])
            self.client.force_authenticate(person)
            sent = self.client.post(reverse("quotation-submit", args=[quote.pk]))
            self.assertEqual(sent.status_code, 200, sent.data)
            self.assertEqual(sent.data["customer_email"], "")
            import pymupdf
            pdf = self.client.get(reverse("quotation-pdf", args=[quote.pk]))
            self.assertEqual(pdf.status_code, 200)
            with pymupdf.open(stream=pdf.content, filetype="pdf") as document:
                text = " ".join("".join(page.get_text() for page in document).split())
            self.assertIn(f"Private name {person.pk}", text)
            self.assertNotIn("Portal name", text)
            quotes.append(quote)
        self.assertEqual(self.client.get(reverse("quotation-detail", args=[quotes[0].pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("quotation-pdf", args=[quotes[0].pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("property-detail", args=[quotes[0].property_id])).status_code, 404)
        own = self.client.get(reverse("customer-detail", args=[self.customer.pk]))
        self.assertEqual([q["id"] for q in own.data["quotations"]], [quotes[1].pk])
        self.client.force_authenticate(self.portal)
        listing = self.client.get(reverse("customer-quotation-list"))
        self.assertEqual({q["id"] for q in listing.data}, {q.pk for q in quotes})

    def test_saving_does_not_override_restricted_connections(self):
        for state in ("BLOCKED", "DISCONNECTED", "REJECTED"):
            with self.subTest(state=state):
                relation, _ = ContractorCustomerConnection.objects.update_or_create(
                    customer=self.customer, contractor=self.a, defaults={"status": state},
                )
                saved = self.save_contact(self.a)
                self.assertIn(saved.status_code, (200, 201), saved.data)
                relation.refresh_from_db()
                self.assertEqual(relation.status, state)
                self.assertNotIn("share_link", saved.data)

    def test_disabled_account_cannot_be_recreated_or_connected(self):
        self.portal.is_active = False
        self.portal.save(update_fields=["is_active"])
        self.customer.bharath_id = "BP-C-045099"
        self.customer.save(update_fields=["bharath_id"])
        response = self.save_contact(self.b)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertFalse(ContractorCustomerConnection.objects.exists())

    def test_disabled_login_without_active_customer_is_not_replaced(self):
        blocked = BharathUser.objects.create_user(
            mobile="9000450088", role="CUSTOMER", is_active=False,
            verification_status="SUSPENDED", bharath_id="BP-C-045088",
        )
        self.client.force_authenticate(self.a)
        response = self.client.post(reverse("customer-list-create"), {
            "name": "Disabled", "mobile": "+919000450088",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        blocked.refresh_from_db()
        self.assertEqual(blocked.mobile, "+919000450088")
        self.assertFalse(Customer.objects.filter(normalized_mobile="+919000450088").exists())

    def test_unsaved_customer_cannot_be_read_by_other_contractor(self):
        self.save_contact(self.a)
        self.client.force_authenticate(self.b)
        self.assertEqual(self.client.get(reverse("customer-detail", args=[self.customer.pk])).status_code, 404)

    def test_search_inbox_opportunities_and_dashboard_use_own_contact_details(self):
        self.save_contact(self.a, name="A private label")
        self.save_contact(self.b, name="B private label")
        from .models import Lead, ChatConversation, ChatMessage
        Lead.objects.create(customer=self.customer, contractor=self.b, title="Painting")
        ChatMessage.objects.create(
            conversation=ChatConversation.objects.get(customer=self.customer, contractor=self.b),
            sender=self.portal, text="Please send a quotation",
        )
        results = self.client.get(reverse("global-search"), {"q": "B private"})
        self.assertTrue(any(row["title"] == "B private label" for row in results.data), results.data)
        self.assertEqual(self.client.get(reverse("global-search"), {"q": "Portal name"}).data, [])
        for endpoint in ("chat-conversations", "lead-list", "contractor-crm-dashboard"):
            response = self.client.get(reverse(endpoint))
            self.assertEqual(response.status_code, 200, response.data)
            body = response.content.decode()
            self.assertIn("B private label", body, endpoint)
            self.assertNotIn("Portal name", body, endpoint)
            self.assertNotIn("A private label", body, endpoint)

    def test_client_search_counts_and_labels_are_contractor_private(self):
        self.save_contact(self.a, name="A private label")
        relation = ContractorCustomerConnection.objects.get(customer=self.customer, contractor=self.a)
        Property.objects.create(customer=self.customer, contractor=self.a, connection=relation, name="A private site")
        from .models import Lead
        Lead.objects.create(customer=self.customer, contractor=self.a, title="A private opportunity")
        self.save_contact(self.b, name="B private label")
        response = self.client.get(reverse("client-search"), {"query": "B private"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1, response.data)
        self.assertEqual(response.data[0]["name"], "B private label")
        self.assertEqual(response.data[0]["properties"], 0)
        self.assertEqual(response.data[0]["open_opportunities"], 0)
        self.assertEqual(response.data[0]["email"], "")
        self.assertEqual(self.client.get(reverse("client-search"), {"query": "Portal name"}).data, [])

    def test_backfill_only_connects_saved_contacts_without_explicit_restrictions(self):
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        from types import SimpleNamespace
        from django.utils import timezone
        pending = ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.a)
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.a, details={"name": "A private"})
        restricted = ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.b, status="RECONNECT_PENDING", disconnected_at=timezone.now(),
        )
        SavedCustomerContact.objects.create(customer=self.customer, contractor=self.b, details={"name": "B private"})
        module = import_module("quotations.migrations.0128_connect_saved_customer_contacts")
        module.connect_saved_contacts(apps, SimpleNamespace(connection=connection))
        pending.refresh_from_db()
        restricted.refresh_from_db()
        self.assertEqual(pending.status, "CONNECTED")
        self.assertEqual(pending.origin, "CONTACT_SAVE")
        self.assertIsNone(pending.accepted_at)
        self.assertEqual(restricted.status, "RECONNECT_PENDING")
        self.assertEqual(Customer.objects.count(), 1)

    def test_backfill_preserves_original_owner_details_without_copying_to_other_contractors(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        self.customer.contractor = self.a
        self.customer.save(update_fields=["contractor"])
        ContractorCustomerConnection.objects.create(
            customer=self.customer, contractor=self.a, status="CONNECTED", approval_method="INITIAL_CREATOR",
        )
        original = SavedCustomerContact.objects.create(customer=self.customer, contractor=self.a,
                                                       details={"name": "A saved name", "mobile": self.customer.mobile})
        ContractorCustomerConnection.objects.create(customer=self.customer, contractor=self.b)
        other = SavedCustomerContact.objects.create(customer=self.customer, contractor=self.b, details={"name": "B saved name"})
        module = import_module("quotations.migrations.0128_connect_saved_customer_contacts")
        module.connect_saved_contacts(apps, SimpleNamespace(connection=connection))
        original.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(original.details["email"], "portal@example.com")
        self.assertEqual(original.details["name"], "A saved name")
        self.assertNotIn("email", other.details)


@skipIf(connection.vendor == "sqlite" and not connection.settings_dict["TEST"].get("NAME"),
        "Concurrent writes require a file-backed SQLite database or PostgreSQL.")
class DirectCustomerSaveConcurrencyTests(TransactionTestCase):
    def test_two_contractors_saving_simultaneously_create_one_customer_id(self):
        contractors = [BharathUser.objects.create_user(mobile=f"900046000{index}", role="CONTRACTOR")
                       for index in (1, 2)]
        barrier = Barrier(2)

        def save(person):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(person)
                barrier.wait(timeout=15)
                response = client.post(reverse("customer-list-create"), {
                    "name": f"Contact {person.pk}", "mobile": "9000460099", "only_if_new_contact": True,
                }, format="json")
                return response.status_code, response.data
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, contractors))
        self.assertEqual([code for code, _ in results], [201, 201], results)
        self.assertEqual(len({data["bharath_id"] for _, data in results}), 1)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(ContractorCustomerConnection.objects.filter(status="CONNECTED").count(), 2)
        self.assertEqual(SavedCustomerContact.objects.count(), 2)

    def test_same_contractor_simultaneous_new_saves_keep_winning_details(self):
        contractor = BharathUser.objects.create_user(mobile="9000460011", role="CONTRACTOR")
        barrier = Barrier(2)

        def save(name):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(contractor)
                barrier.wait(timeout=15)
                response = client.post(reverse("customer-list-create"), {
                    "name": name, "mobile": "9000460088", "only_if_new_contact": True,
                }, format="json")
                return response.status_code, response.data
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, ("First candidate", "Second candidate")))
        self.assertEqual(sorted(code for code, _ in results), [200, 201], results)
        winner = next(data for code, data in results if code == 201)
        repeated = next(data for code, data in results if code == 200)
        self.assertEqual(winner["name"], repeated["name"])
        self.assertTrue(repeated["already_saved"])
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(SavedCustomerContact.objects.count(), 1)
        self.assertEqual(CustomerConnectionAudit.objects.filter(action="CONTACT_SAVED").count(), 1)

