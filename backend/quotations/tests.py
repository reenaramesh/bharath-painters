from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from datetime import date, timedelta
from decimal import Decimal

from accounts.models import BharathUser, ContractorProfile
from accounts.legal import POLICY_VERSION
from .models import Area, ChatConversation, ChatMessage, Customer, CustomerFollowUp, MeasurementOpening, MeasurementSurface, PaintBrand, PaintType, PortalNotification, Property, PropertyMeasurement, PropertyRoom, Quotation, QuotationItem, QuotationRoom, ServiceCategory, ServiceRequest, ServiceType, SupportTicket, Unit, WorkChange
from .serializers import QuotationItemSerializer, QuotationSerializer
from .work_changes import current_scope, work_change_summary


class WorkChangeWorkflowTests(APITestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(mobile="9888000001", password="test-password", role=BharathUser.Roles.CONTRACTOR)
        self.customer_user = BharathUser.objects.create_user(mobile="9888000002", password="test-password", role=BharathUser.Roles.CUSTOMER)
        self.customer = Customer.objects.create(contractor=self.contractor, portal_user=self.customer_user, name="Work Change Customer", mobile="9888000002")
        self.property = Property.objects.create(customer=self.customer, contractor=self.contractor, name="Work Change Site")
        self.quotation = Quotation.objects.create(contractor=self.contractor, customer=self.customer, property=self.property, status=Quotation.Status.IN_PROGRESS, subtotal=Decimal("4000"), grand_total=Decimal("4000"))
        self.room = QuotationRoom.objects.create(quotation=self.quotation, name="Bedroom")
        self.category = ServiceCategory.objects.create(name="Interior Painting", created_by=self.contractor)
        self.service = ServiceType.objects.create(name="Wall Painting", category_master=self.category, created_by=self.contractor)
        self.tractor = PaintType.objects.create(name="Tractor Emulsion", service_category=self.category, created_by=self.contractor)
        self.premium = PaintType.objects.create(name="Premium Emulsion", service_category=self.category, created_by=self.contractor)
        self.unit = Unit.objects.create(name="Sq ft", created_by=self.contractor)
        self.item = QuotationItem.objects.create(quotation=self.quotation, room=self.room, service_category=self.category, service_type=self.service, paint_type=self.tractor, description="Bedroom walls", quantity=Decimal("400"), unit=self.unit, rate=Decimal("10"), amount=Decimal("4000"))

    def test_material_change_splits_scope_without_duplicating_physical_area(self):
        self.client.force_authenticate(self.contractor)
        created = self.client.post(reverse("work-change-list-create"), {
            "quotation": self.quotation.id,
            "reason": "Upgrade unfinished walls",
            "requested_date": date.today().isoformat(),
            "lines": [{
                "change_type": "CHANGE_MATERIAL", "original_item": self.item.id,
                "area_name": "Bedroom", "completed_quantity": "100", "changed_quantity": "300",
                "new_product_type": self.premium.id, "unit": self.unit.id,
                "new_rate": "20", "description": "Premium on remaining walls",
            }],
        }, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        change_id = created.data["id"]
        sent = self.client.post(reverse("work-change-send", kwargs={"pk": change_id}), {}, format="json")
        self.assertEqual(sent.status_code, status.HTTP_200_OK, sent.data)

        self.client.force_authenticate(self.customer_user)
        approved = self.client.post(reverse("customer-work-change-action", kwargs={"pk": change_id, "action": "approve"}), {}, format="json")
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        self.assertEqual(approved.data["status"], WorkChange.Status.APPROVED)

        scope = current_scope(self.quotation)
        self.assertEqual(sum(Decimal(str(row["quantity"])) for row in scope), Decimal("400"))
        self.assertEqual({row["material"]: Decimal(str(row["quantity"])) for row in scope}, {"Tractor Emulsion": Decimal("100"), "Premium Emulsion": Decimal("300")})
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, Decimal("400"))
        summary = work_change_summary(self.quotation)
        self.assertEqual(summary["net_work_changes"], Decimal("3000"))
        self.assertEqual(summary["revised_contract_value"], Decimal("7000"))

        # Final billing is generated only after completion and must use the
        # approved effective scope, while preserving the accepted baseline.
        from jobs.models import WorkSchedule
        from .views import ensure_invoice_for_quotation
        WorkSchedule.objects.create(
            quotation=self.quotation,
            proposed_start_date=date.today(),
            proposed_end_date=date.today(),
            proposed_by=self.contractor,
            status=WorkSchedule.Status.COMPLETED,
        )
        invoice = ensure_invoice_for_quotation(self.quotation, self.contractor)
        billed = {row["product_type"]: Decimal(row["quantity"]) for row in invoice.items}
        self.assertEqual(billed, {"Tractor Emulsion": Decimal("100"), "Premium Emulsion": Decimal("300")})
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, Decimal("400"))

    def test_work_change_cannot_be_created_before_work_starts(self):
        self.quotation.status = Quotation.Status.ACCEPTED
        self.quotation.save(update_fields=("status", "updated_at"))
        self.client.force_authenticate(self.contractor)
        response = self.client.post(reverse("work-change-list-create"), {
            "quotation": self.quotation.id, "reason": "Too early", "requested_date": date.today().isoformat(),
            "lines": [{"change_type": "REMOVE_WORK", "original_item": self.item.id, "changed_quantity": "10", "new_rate": "0"}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminDefaultMasterDataTests(APITestCase):

    def setUp(self):
        self.admin = BharathUser.objects.create_user(
            mobile="9000000001", password="test-password", role=BharathUser.Roles.ADMIN,
        )
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000002", password="test-password", role=BharathUser.Roles.CONTRACTOR,
        )

    def test_admin_default_is_visible_but_not_editable_by_contractor(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(
            reverse("area-list-create"), {"name": "Default Living Room"}, format="json"
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        area = Area.objects.get(pk=created.data["id"])
        self.assertIsNone(area.created_by_id)

        updated = self.client.patch(
            reverse("area-detail", kwargs={"pk": area.id}),
            {"name": "Default Hall"}, format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)

        self.client.force_authenticate(self.contractor)
        listing = self.client.get(reverse("area-list-create"))
        listed = listing.data.get("results", listing.data) if isinstance(listing.data, dict) else listing.data
        self.assertTrue(any(item["name"] == "Default Hall" for item in listed))
        forbidden = self.client.patch(
            reverse("area-detail", kwargs={"pk": area.id}),
            {"name": "Contractor changed default"}, format="json",
        )
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.admin)
        removed = self.client.delete(reverse("area-detail", kwargs={"pk": area.id}))
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        area.refresh_from_db()
        self.assertFalse(area.is_active)


class CustomerApiTests(APITestCase):

    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000011",
            email="owner@example.com",
            password="test-password",
            role=BharathUser.Roles.CONTRACTOR,
        )
        self.other_contractor = BharathUser.objects.create_user(
            mobile="9000000012",
            email="other@example.com",
            password="test-password",
            role=BharathUser.Roles.CONTRACTOR,
        )
        self.client.force_authenticate(self.contractor)

    def test_create_and_list_only_owned_customers(self):
        Customer.objects.create(
            contractor=self.other_contractor,
            name="Other customer",
            mobile="9111111111",
        )
        response = self.client.post(
            reverse("customer-list-create"),
            {
                "name": "My customer",
                "mobile": "9222222222",
                "source": "REFERRAL",
                "gst_number": "29ABCDE1234F1Z5",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["contractor"], self.contractor.id)
        self.assertEqual(response.data["gst_number"], "29ABCDE1234F1Z5")

        listing = self.client.get(reverse("customer-list-create"))
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]["name"], "My customer")

    def test_messages_hide_unused_customers_and_open_selected_contact(self):
        created = self.client.post(
            reverse("customer-list-create"),
            {"name": "Saved contact", "mobile": "9333333333"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        customer_id = created.data["id"]

        recent = self.client.get(reverse("chat-conversations"))
        self.assertEqual(recent.status_code, status.HTTP_200_OK)
        self.assertEqual(recent.data, [])

        opened = self.client.post(
            reverse("chat-conversations"), {"customer": customer_id}, format="json"
        )
        self.assertEqual(opened.status_code, status.HTTP_200_OK, opened.data)
        self.assertEqual(opened.data["customer_id"], customer_id)

        sent = self.client.post(
            reverse("chat-messages", kwargs={"pk": opened.data["id"]}),
            {"text": "Hello from the saved contact picker."},
            format="json",
        )
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED, sent.data)
        recent = self.client.get(reverse("chat-conversations"))
        self.assertEqual(len(recent.data), 1)
        self.assertEqual(recent.data[0]["customer_id"], customer_id)

        message_id = sent.data["id"]
        updated = self.client.patch(
            reverse("chat-message-detail", kwargs={"pk": message_id}),
            {"text": "Updated customer message."},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data["text"], "Updated customer message.")

        self.client.force_authenticate(self.other_contractor)
        forbidden_delete = self.client.delete(reverse("chat-message-detail", kwargs={"pk": message_id}))
        self.assertEqual(forbidden_delete.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.contractor)
        removed = self.client.delete(reverse("chat-message-detail", kwargs={"pk": message_id}))
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ChatMessage.objects.filter(pk=message_id).exists())

    def test_unsafe_chat_is_blocked_and_admin_is_notified(self):
        admin = BharathUser.objects.create_user(
            mobile="9000000099", password="test-password", role=BharathUser.Roles.ADMIN,
        )
        created = self.client.post(
            reverse("customer-list-create"),
            {"name": "Safety contact", "mobile": "9333333399"},
            format="json",
        )
        opened = self.client.post(
            reverse("chat-conversations"), {"customer": created.data["id"]}, format="json"
        )
        before_count = ChatMessage.objects.count()
        blocked = self.client.post(
            reverse("chat-messages", kwargs={"pk": opened.data["id"]}),
            {"text": "This message discusses cocaine."},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ChatMessage.objects.count(), before_count)
        alert = PortalNotification.objects.get(recipient=admin, event_type="CHAT_SAFETY")
        self.assertNotIn("cocaine", alert.message.lower())

    def test_contractor_can_open_and_message_a_job_applicant(self):
        from jobs.models import Job, JobApplication

        painter = BharathUser.objects.create_user(
            mobile="9444444499", password="test-password",
            first_name="Test", last_name="Painter", role=BharathUser.Roles.PAINTER,
        )
        job = Job.objects.create(
            contractor=self.contractor, title="Interior painting",
            service_type="Interior Painting", location="Test site", city="Bengaluru",
            job_type=Job.JobType.DAILY, start_date=date.today(),
        )
        JobApplication.objects.create(job=job, painter=painter)

        opened = self.client.post(
            reverse("chat-conversations"), {"painter": painter.id}, format="json",
        )
        self.assertEqual(opened.status_code, status.HTTP_200_OK, opened.data)
        self.assertEqual(opened.data["painter_id"], painter.id)

        listing = self.client.get(
            reverse("chat-conversations"), {"conversation": opened.data["id"]},
        )
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data[0]["id"], opened.data["id"])

        sent = self.client.post(
            reverse("chat-messages", kwargs={"pk": opened.data["id"]}),
            {"text": "Please confirm your availability."}, format="json",
        )
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED, sent.data)

        self.client.force_authenticate(self.other_contractor)
        unauthorized = self.client.post(
            reverse("chat-conversations"), {"painter": painter.id}, format="json",
        )
        self.assertEqual(unauthorized.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_customer_record_links_to_existing_customer_portal_by_mobile(self):
        portal_user = BharathUser.objects.create_user(
            mobile="9888801234", password="customer-password",
            role=BharathUser.Roles.CUSTOMER,
        )
        response = self.client.post(
            reverse("customer-list-create"),
            {"name": "Existing portal customer", "mobile": "+91 9888801234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        customer = Customer.objects.get(pk=response.data["id"])
        self.assertEqual(customer.portal_user, portal_user)
        self.assertTrue(ChatConversation.objects.filter(customer=customer).exists())

    def test_customer_creation_returns_json_error_when_mobile_belongs_to_non_customer_account(self):
        response = self.client.post(
            reverse("customer-list-create"),
            {"name": "Invalid duplicate", "mobile": self.other_contractor.mobile},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already registered as a Contractor account", response.data["mobile"][0])
        self.assertFalse(Customer.objects.filter(name="Invalid duplicate").exists())

    def test_customer_mobile_check_identifies_non_customer_account_before_creation(self):
        response = self.client.post(
            reverse("customer-check-mobile"),
            {"mobile": self.other_contractor.mobile},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["state"], "ACCOUNT_CONFLICT")
        self.assertEqual(response.data["account_role"], "Contractor")
        self.assertFalse(response.data["customer_exists"])

    def test_customer_detail_can_be_updated(self):
        customer = Customer.objects.create(
            contractor=self.contractor,
            name="Initial name",
            mobile="9333333333",
        )
        response = self.client.patch(
            reverse("customer-detail", kwargs={"pk": customer.id}),
            {
                "name": "Updated name",
                "status": "CONTACTED",
                "email": "updated.customer@example.com",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        customer.refresh_from_db()
        self.assertEqual(customer.name, "Updated name")
        self.assertEqual(customer.status, Customer.Status.CONTACTED)
        self.assertEqual(customer.email, "updated.customer@example.com")
        self.assertEqual(response.data["email"], "updated.customer@example.com")

    def test_client_search_maps_customer_name_and_mobile(self):
        customer = Customer.objects.create(
            contractor=self.contractor,
            name="Searchable Client",
            mobile="9876501234",
            email="searchable@example.com",
        )
        Customer.objects.create(
            contractor=self.other_contractor,
            name="Searchable Client",
            mobile="9999999999",
        )

        by_name = self.client.get(reverse("client-search"), {"query": "Searchable"})
        self.assertEqual(by_name.status_code, status.HTTP_200_OK)
        self.assertEqual(len(by_name.data), 1)
        self.assertEqual(by_name.data[0]["id"], customer.id)
        self.assertEqual(by_name.data[0]["name"], "Searchable Client")
        self.assertEqual(by_name.data[0]["mobile"], "9876501234")

        by_mobile = self.client.get(reverse("client-search"), {"query": "987650"})
        self.assertEqual(by_mobile.status_code, status.HTTP_200_OK)
        self.assertEqual(by_mobile.data[0]["id"], customer.id)

    def test_follow_up_is_created_for_owned_customer(self):
        customer = Customer.objects.create(
            contractor=self.contractor,
            name="Follow-up customer",
            mobile="9444444444",
        )
        response = self.client.post(
            reverse("customer-follow-ups", kwargs={"customer_id": customer.id}),
            {"follow_up_type": "CALL", "comment": "Discussed site visit"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["created_by"], self.contractor.id)

    def test_scheduled_follow_up_appears_as_task_and_can_be_completed(self):
        customer = Customer.objects.create(
            contractor=self.contractor,
            name="Task customer",
            mobile="9666666666",
        )
        task = CustomerFollowUp.objects.create(
            customer=customer,
            created_by=self.contractor,
            follow_up_type="CALL",
            comment="Call about quotation",
            next_follow_up="2026-08-25T10:00:00Z",
        )
        listing = self.client.get(reverse("customer-task-list"))
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data[0]["customer_name"], "Task customer")

        completed = self.client.patch(
            reverse("customer-task-complete", kwargs={"pk": task.id}),
            {"is_completed": True},
            format="json",
        )
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertTrue(task.is_completed)
        self.assertIsNotNone(task.completed_at)
        self.assertEqual(len(self.client.get(reverse("customer-task-list")).data), 0)

    def test_task_can_be_rescheduled_with_an_updated_note(self):
        customer = Customer.objects.create(
            contractor=self.contractor, name="Callback customer", mobile="9777777777"
        )
        task = CustomerFollowUp.objects.create(
            customer=customer, created_by=self.contractor, follow_up_type="CALL",
            comment="Initial callback", next_follow_up="2026-08-25T10:00:00Z",
        )
        response = self.client.patch(
            reverse("customer-task-complete", kwargs={"pk": task.id}),
            {"next_follow_up": "2026-08-26T12:30:00+05:30", "comment": "Call tomorrow"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.comment, "Call tomorrow")
        self.assertFalse(task.is_completed)

    def test_other_contractors_customer_is_not_accessible(self):
        customer = Customer.objects.create(
            contractor=self.other_contractor,
            name="Private customer",
            mobile="9555555555",
        )
        response = self.client.get(
            reverse("customer-detail", kwargs={"pk": customer.id})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_bulk_imports_csv_and_skips_duplicate_mobile(self):
        Customer.objects.create(
            contractor=self.contractor,
            name="Existing customer",
            mobile="9333333333",
        )
        upload = SimpleUploadedFile(
            "customers.csv",
            b"Name,Mobile,Email,City\nNew customer,9444444444,new@example.com,Bengaluru\nDuplicate,+91 93333 33333,,\nInvalid,,invalid@example.com,\n",
            content_type="text/csv",
        )
        response = self.client.post(
            reverse("customer-bulk-import"),
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertTrue(
            Customer.objects.filter(
                contractor=self.contractor,
                mobile="9444444444",
                email="new@example.com",
            ).exists()
        )

    def test_bulk_imports_selected_device_contacts(self):
        response = self.client.post(
            reverse("customer-bulk-import"),
            {
                "contacts": [
                    {
                        "name": "Phone contact",
                        "mobile": "9555555555",
                        "email": "phone@example.com",
                        "source": "PHONE",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["created"], 1)
        customer = Customer.objects.get(mobile="9555555555")
        self.assertEqual(customer.source, Customer.Source.PHONE)

    def test_customer_self_registers_and_exchanges_messages(self):
        customer = Customer.objects.create(
            contractor=self.contractor,
            name="Chat customer",
            mobile="9888877777",
            email="chat.customer@example.com",
        )
        registration = self.client.post(
            reverse("register-customer"),
            {"name": "Chat customer", "mobile": "9888877777", "email": "chat.customer@example.com", "password": "customer-pass", "policy_version": POLICY_VERSION, "document_scrolled": True, "terms_accepted": True, "privacy_notice_acknowledged": True},
            format="json",
        )
        self.assertEqual(registration.status_code, status.HTTP_201_CREATED)
        customer.refresh_from_db()
        self.assertEqual(customer.portal_user.role, BharathUser.Roles.CUSTOMER)
        conversation = ChatConversation.objects.get(customer=customer)

        contractor_message = self.client.post(
            reverse("chat-messages", kwargs={"pk": conversation.id}),
            {"text": "Your site visit is confirmed."},
            format="json",
        )
        self.assertEqual(contractor_message.status_code, status.HTTP_201_CREATED)
        search_result = self.client.get(reverse("chat-conversations"), {"search": "988887"})
        self.assertEqual(len(search_result.data), 1)
        no_match = self.client.get(reverse("chat-conversations"), {"search": "not-a-customer"})
        self.assertEqual(len(no_match.data), 0)

        self.client.force_authenticate(customer.portal_user)
        listing = self.client.get(reverse("chat-conversations"))
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data[0]["customer_name"], "Chat customer")
        messages = self.client.get(reverse("chat-messages", kwargs={"pk": conversation.id}))
        self.assertEqual(messages.data[0]["text"], "Your site visit is confirmed.")
        reply = self.client.post(
            reverse("chat-messages", kwargs={"pk": conversation.id}),
            {"text": "Thank you, I will be available."},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED)

    def test_customer_raises_service_request_and_contractor_updates_status(self):
        customer = Customer.objects.create(
            contractor=self.contractor, name="Request customer", mobile="9898989898",
            address="Customer work address",
        )
        service = ServiceType.objects.create(name="Interior painting", created_by=self.contractor)
        registration = self.client.post(
            reverse("register-customer"),
            {"name": customer.name, "mobile": customer.mobile, "password": "customer-pass", "policy_version": POLICY_VERSION, "document_scrolled": True, "terms_accepted": True, "privacy_notice_acknowledged": True},
            format="json",
        )
        self.assertEqual(registration.status_code, status.HTTP_201_CREATED)
        customer.refresh_from_db()
        self.client.force_authenticate(customer.portal_user)
        options = self.client.get(reverse("service-request-options"))
        self.assertEqual(options.data[0]["services"][0]["name"], "Interior painting")
        created = self.client.post(
            reverse("service-request-list"),
            {
                "customer": customer.id,
                "service_type": service.id,
                "title": "Paint my home",
                "description": "Two bedrooms need painting",
                "preferred_date": "2026-09-01",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ServiceRequest.objects.get().address, "Customer work address")

        self.client.force_authenticate(self.contractor)
        updated = self.client.patch(
            reverse("service-request-detail", kwargs={"pk": created.data["id"]}),
            {"status": "REVIEWING"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["status"], "REVIEWING")

        self.client.force_authenticate(customer.portal_user)
        ticket = self.client.post(
            reverse("support-ticket-list"),
            {
                "customer": customer.id,
                "category": "QUALITY",
                "priority": "HIGH",
                "subject": "Paint finish concern",
                "description": "Please inspect the bedroom wall finish.",
            },
            format="json",
        )
        self.assertEqual(ticket.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ticket.data["ticket_number"].startswith("BP-TKT-"))
        dashboard = self.client.get(reverse("customer-portal-dashboard"))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["counts"]["service_requests"], 1)
        self.assertEqual(dashboard.data["counts"]["open_tickets"], 1)
        self.client.force_authenticate(self.contractor)
        response = self.client.patch(
            reverse("support-ticket-detail", kwargs={"pk": ticket.data["id"]}),
            {"status": "IN_PROGRESS", "contractor_response": "Inspection scheduled."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(SupportTicket.objects.get().contractor_response, "Inspection scheduled.")


class PropertyApiTests(APITestCase):

    def setUp(self):
        self.owner = BharathUser.objects.create_user(
            mobile="9000000021", email="property-owner@example.com",
            password="test-password", role=BharathUser.Roles.CONTRACTOR,
        )
        self.other = BharathUser.objects.create_user(
            mobile="9000000022", email="other-owner@example.com",
            password="test-password", role=BharathUser.Roles.CONTRACTOR,
        )
        self.customer = Customer.objects.create(
            contractor=self.owner, name="Property Customer", mobile="9666666666",
        )
        self.other_customer = Customer.objects.create(
            contractor=self.other, name="Other Customer", mobile="9777777777",
        )
        self.client.force_authenticate(self.owner)

    def test_property_create_update_and_delete(self):
        create = self.client.post(
            reverse("property-list-create"),
            {"customer": self.customer.id, "name": "Whitefield Home", "flat_number": "1204", "block_name": "Block B", "property_type": "2BHK", "city": "Bengaluru"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["flat_number"], "1204")
        self.assertEqual(create.data["block_name"], "Block B")
        property_id = create.data["id"]
        update = self.client.patch(
            reverse("property-detail", kwargs={"pk": property_id}),
            {"name": "Updated Home"}, format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["name"], "Updated Home")
        delete = self.client.delete(reverse("property-detail", kwargs={"pk": property_id}))
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_cannot_use_another_contractors_customer(self):
        response = self.client.post(
            reverse("property-list-create"),
            {"customer": self.other_customer.id, "name": "Forbidden"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_property_supports_independent_measurement_records(self):
        property_obj = Property.objects.create(customer=self.customer, name="Repeated Measurement Home")
        first = self.client.post(
            reverse("property-measurement-records", kwargs={"property_id": property_obj.id}),
            {"measured_on": "2026-09-10", "status": "DRAFT"},
            format="json",
        )
        second = self.client.post(
            reverse("property-measurement-records", kwargs={"property_id": property_obj.id}),
            {"measured_on": "2026-09-11", "status": "DRAFT"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)
        self.assertNotEqual(first.data["reference_no"], second.data["reference_no"])

        first_url = reverse("measurement-surface-list-create", kwargs={"property_id": property_obj.id}) + f"?measurement={first.data['id']}"
        second_url = reverse("measurement-surface-list-create", kwargs={"property_id": property_obj.id}) + f"?measurement={second.data['id']}"
        self.client.post(first_url, {"work_area": "EXTERIOR", "surface_type": "WALL", "name": "Old wall", "length": 10, "breadth": 10}, format="json")
        self.client.post(second_url, {"work_area": "EXTERIOR", "surface_type": "WALL", "name": "New wall", "length": 20, "breadth": 10}, format="json")
        first_rows = self.client.get(first_url)
        second_rows = self.client.get(second_url)
        self.assertEqual([row["name"] for row in first_rows.data], ["Old wall"])
        self.assertEqual([row["name"] for row in second_rows.data], ["New wall"])

        records = self.client.get(reverse("property-measurement-records", kwargs={"property_id": property_obj.id}))
        totals = {row["id"]: row["total_sqft"] for row in records.data}
        self.assertEqual(totals[first.data["id"]], "100.00")
        self.assertEqual(totals[second.data["id"]], "200.00")

    def test_new_measurement_creates_no_record_until_first_valid_save(self):
        property_obj = Property.objects.create(customer=self.customer, name="Lazy Measurement Home")
        rooms_url = reverse("property-room-list-create", kwargs={"property_id": property_obj.id})
        empty = self.client.get(f"{rooms_url}?new=1")
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(list(empty.data), [])
        self.assertEqual(property_obj.measurement_records.count(), 0)

        room_type = Area.objects.create(name="Master Bed Room", created_by=self.owner)
        room = self.client.post(
            f"{rooms_url}?new=1",
            {"room_type": room_type.id, "name": room_type.name},
            format="json",
        )
        self.assertEqual(room.status_code, status.HTTP_201_CREATED, room.data)
        self.assertEqual(property_obj.measurement_records.count(), 1)
        record_id = room.data["measurement_record"]
        saved = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": property_obj.id})
            + f"?measurement={record_id}",
            {
                "room_id": room.data["id"],
                "walls": [{"name": "Wall 1", "length": 10, "breadth": 10}],
                "ceilings": [], "openings": [], "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.data)
        self.assertEqual(property_obj.measurement_records.count(), 1)

    def test_customer_can_select_and_download_each_measurement_record(self):
        portal_user = BharathUser.objects.create_user(
            mobile="9000000023", email="property-customer@example.com",
            password="test-password", role=BharathUser.Roles.CUSTOMER,
        )
        self.customer.portal_user = portal_user
        self.customer.save(update_fields=("portal_user",))
        property_obj = Property.objects.create(customer=self.customer, name="Customer Measurement Home")
        old_record = PropertyMeasurement.objects.create(
            property=property_obj, contractor=self.owner, measured_on=date(2026, 9, 9), status="COMPLETED"
        )
        new_record = PropertyMeasurement.objects.create(
            property=property_obj, contractor=self.owner, measured_on=date(2026, 9, 11), status="COMPLETED"
        )
        MeasurementSurface.objects.create(
            property=property_obj, measurement_record=old_record, work_area="EXTERIOR",
            surface_type="WALL", name="Old wall", length=10, breadth=10,
        )
        MeasurementSurface.objects.create(
            property=property_obj, measurement_record=new_record, work_area="EXTERIOR",
            surface_type="WALL", name="New wall", length=20, breadth=10,
        )
        self.client.force_authenticate(portal_user)
        detail_url = reverse("customer-property-detail", kwargs={"pk": property_obj.id})
        detail = self.client.get(f"{detail_url}?measurement={old_record.id}")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(len(detail.data["measurement_records"]), 2)
        self.assertEqual(detail.data["property"]["measurement_id"], old_record.id)
        self.assertEqual([row["name"] for row in detail.data["surfaces"]], ["Old wall"])
        pdf = self.client.get(
            reverse("customer-property-measurement-pdf", kwargs={"pk": property_obj.id})
            + f"?measurement={old_record.id}"
        )
        self.assertEqual(pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf["Content-Type"], "application/pdf")

    def test_room_crud_calculates_area(self):
        property_obj = Property.objects.create(customer=self.customer, name="Measured Home")
        create = self.client.post(
            reverse("property-room-list-create", kwargs={"property_id": property_obj.id}),
            {"name": "Living Room", "length": 10, "width": 12, "height": 10, "door_count": 1, "door_width": 3, "door_height": 7},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["paintable_area"], "539.00")
        room_id = create.data["id"]
        update = self.client.patch(
            reverse("property-room-detail", kwargs={"pk": room_id}),
            {"name": "Main Living Room", "length": 11}, format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["name"], "Main Living Room")
        delete = self.client.delete(reverse("property-room-detail", kwargs={"pk": room_id}))
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_area_supports_generic_surfaces_and_surface_group_deductions(self):
        property_obj = Property.objects.create(customer=self.customer, name="Multi surface site")
        room_response = self.client.post(
            reverse("property-room-list-create", kwargs={"property_id": property_obj.id}) + "?new=1",
            {"name": "Terrace", "section": "Roof", "description": "North side"},
            format="json",
        )
        self.assertEqual(room_response.status_code, status.HTTP_201_CREATED, room_response.data)
        self.assertEqual(room_response.data["section"], "Roof")
        record_id = room_response.data["measurement_record"]
        surface_url = (
            reverse("measurement-surface-list-create", kwargs={"property_id": property_obj.id})
            + f"?measurement={record_id}"
        )
        first = self.client.post(surface_url, {
            "room": room_response.data["id"], "work_area": "INTERIOR",
            "surface_type": "FLOOR", "name": "Floor 1", "length": 30,
            "breadth": 20, "quantity": 1,
        }, format="json")
        second = self.client.post(surface_url, {
            "room": room_response.data["id"], "work_area": "INTERIOR",
            "surface_type": "FLOOR", "name": "Floor 2", "length": 10,
            "breadth": 10, "quantity": 1,
        }, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)
        opening = self.client.post(
            reverse("measurement-opening-list-create", kwargs={"surface_id": first.data["id"]}),
            {
                "opening_type": "STAIR_OPENING", "name": "Stair opening",
                "width": 5, "height": 4, "quantity": 1,
                "effect": "DEDUCT", "deduction_mode": "FULL",
                "deduct_from_surface_type": "FLOOR",
            },
            format="json",
        )
        self.assertEqual(opening.status_code, status.HTTP_201_CREATED, opening.data)
        self.assertEqual(opening.data["deduct_from_surface_type"], "FLOOR")
        surfaces = self.client.get(surface_url)
        gross = sum(float(row["gross_area"]) for row in surfaces.data)
        deduction = sum(float(row["deduction_area"]) for row in surfaces.data)
        self.assertEqual(gross, 700.0)
        self.assertEqual(deduction, 20.0)
        self.assertEqual(max(0, gross - deduction), 680.0)

        addition = self.client.post(
            reverse("measurement-opening-list-create", kwargs={"surface_id": first.data["id"]}),
            {
                "opening_type": "OTHER", "name": "Extra floor strip",
                "width": 5, "height": 2, "quantity": 1,
                "effect": "ADD", "deduction_mode": "IGNORE",
                "deduction_percentage": 0, "deduct_from_surface_type": "FLOOR",
            },
            format="json",
        )
        self.assertEqual(addition.status_code, status.HTTP_201_CREATED, addition.data)
        refreshed = self.client.get(surface_url)
        addition_area = sum(float(row["addition_area"]) for row in refreshed.data)
        self.assertEqual(addition_area, 10.0)
        self.assertEqual(max(0, gross - deduction + addition_area), 690.0)

    def test_contractor_can_save_reusable_measurement_surface_type(self):
        created = self.client.post(
            reverse("measurement-surface-type-list-create"),
            {"name": "Texture"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        duplicate = self.client.post(
            reverse("measurement-surface-type-list-create"),
            {"name": "texture"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_201_CREATED, duplicate.data)
        listing = self.client.get(reverse("measurement-surface-type-list-create"))
        matching = [item for item in listing.data if item["name"].lower() == "texture"]
        self.assertEqual(len(matching), 1)

    def test_cannot_access_another_contractors_room(self):
        other_property = Property.objects.create(customer=self.other_customer, name="Private")
        room = PropertyRoom.objects.create(property=other_property, name="Private Room")
        response = self.client.patch(
            reverse("property-room-detail", kwargs={"pk": room.id}),
            {"name": "Changed"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_exterior_room_save_replaces_only_selected_location(self):
        property_obj = Property.objects.create(customer=self.customer, name="Exterior", measurement_type="EXTERIOR")
        record = PropertyMeasurement.objects.create(property=property_obj, contractor=self.owner)
        room = PropertyRoom.objects.create(property=property_obj, measurement_record=record, name="Front elevation")
        other = MeasurementSurface.objects.create(property=property_obj, measurement_record=record, work_area="EXTERIOR", surface_type="WALL", name="Rear", length=10, breadth=10)
        url = reverse("room-measurement-save", kwargs={"property_id": property_obj.id}) + f"?measurement={record.id}"
        payload = {"room_id": room.id, "walls": [{"name": "Front", "length": 10, "breadth": 10, "quantity": 2}], "ceilings": [], "openings": [{"opening_type": "DOOR", "name": "Door 1", "height": 7, "width": 3, "quantity": 1}], "paintable_openings": [{"surface_type": "DOOR", "name": "Door 1", "length": 7, "breadth": 3, "paintable_sides": 2}]}
        for _ in range(2):
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        saved = MeasurementSurface.objects.filter(room=room)
        self.assertEqual(saved.count(), 2)
        self.assertTrue(all(surface.work_area == "EXTERIOR" for surface in saved))
        wall = saved.get(surface_type="WALL")
        self.assertEqual(wall.gross_area, 200)
        self.assertEqual(wall.deduction_area, 21)
        self.assertEqual(saved.get(surface_type="DOOR").gross_area, 42)
        self.assertTrue(MeasurementSurface.objects.filter(pk=other.pk).exists())

    def test_existing_exterior_calculation_can_use_shared_room_form(self):
        property_obj = Property.objects.create(customer=self.customer, name="Existing exterior", measurement_type="EXTERIOR")
        record = PropertyMeasurement.objects.create(property=property_obj, contractor=self.owner)
        gate = MeasurementSurface.objects.create(property=property_obj, measurement_record=record, work_area="EXTERIOR", surface_type="GATE", name="Gate", length=5, breadth=4)
        old = MeasurementSurface.objects.create(property=property_obj, measurement_record=record, work_area="EXTERIOR", surface_type="WALL", name="Old wall", length=5, breadth=4)
        other_record = PropertyMeasurement.objects.create(property=property_obj, contractor=self.owner)
        separate = MeasurementSurface.objects.create(property=property_obj, measurement_record=other_record, work_area="EXTERIOR", surface_type="WALL", name="Separate record", length=3, breadth=4)
        response = self.client.post(reverse("room-measurement-save", kwargs={"property_id": property_obj.id}) + f"?measurement={record.id}", {"room_id": "exterior", "walls": [{"name": "Updated wall", "length": 10, "breadth": 10}], "openings": [{"opening_type": "WINDOW", "height": 4, "width": 3, "quantity": 2}]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(MeasurementSurface.objects.filter(pk=old.pk).exists())
        self.assertTrue(MeasurementSurface.objects.filter(pk=gate.pk).exists())
        self.assertTrue(MeasurementSurface.objects.filter(pk=separate.pk).exists())
        wall = MeasurementSurface.objects.get(measurement_record=record, surface_type="WALL")
        self.assertEqual(wall.net_area, 76)
        self.assertIsNone(wall.room_id)

    def test_complete_room_measurement_is_saved_together(self):
        room = PropertyRoom.objects.create(property=Property.objects.create(customer=self.customer, name="Measured"), name="Bedroom")
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "ceiling": {"length": 11, "breadth": 12},
                "walls": [
                    {"name": "Wall 1", "length": 10, "breadth": 12},
                    {"name": "Wall 2", "length": 10, "breadth": 12},
                    {"name": "Wall 3", "length": 10, "breadth": 11},
                    {"name": "Wall 4", "length": 10, "breadth": 11},
                ],
                "openings": [
                    {"opening_type": "DOOR", "height": 7, "width": 3, "quantity": 2},
                    {"opening_type": "WINDOW", "height": 4, "width": 4, "quantity": 1},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved = MeasurementSurface.objects.filter(room=room)
        self.assertEqual(saved.count(), 5)
        self.assertEqual(saved.get(surface_type="CEILING").gross_area, 132)
        walls = saved.filter(surface_type="WALL")
        self.assertEqual(sum(item.gross_area for item in walls), 460)
        self.assertEqual(sum(item.deduction_area for item in walls), 58)
        room_listing = self.client.get(
            reverse("property-room-list-create", kwargs={"property_id": room.property_id})
        )
        measured_room = next(item for item in room_listing.data if item["id"] == room.id)
        self.assertEqual(measured_room["measurement_totals"]["wall_net"], "402.00")

    def test_room_window_can_be_saved_without_wall_or_ceiling(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Window only"),
            name="Utility",
        )
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "walls": [],
                "ceilings": [],
                "openings": [
                    {
                        "opening_type": "WINDOW",
                        "name": "Window 1",
                        "height": 4,
                        "width": 3,
                        "quantity": 2,
                        "effect": "DEDUCT",
                        "deduction_mode": "FULL",
                    },
                ],
                "paintable_openings": [
                    {
                        "surface_type": "WINDOW",
                        "name": "Window 1",
                        "length": 4,
                        "breadth": 3,
                        "quantity": 2,
                        "paintable_sides": 1,
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved = MeasurementSurface.objects.filter(room=room)
        self.assertEqual(saved.count(), 2)
        anchor = saved.get(name="__ROOM_ADJUSTMENTS__")
        self.assertEqual(anchor.surface_type, "WALL")
        self.assertEqual(anchor.gross_area, 0)
        self.assertEqual(anchor.deduction_area, 24)
        self.assertTrue(next(item for item in response.data if item["id"] == anchor.id)["is_adjustment_anchor"])
        self.assertEqual(saved.get(surface_type="WINDOW").gross_area, 24)

    def test_multiple_custom_areas_can_be_saved_without_wall_or_ceiling(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Custom areas"),
            name="Outdoor",
        )
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "walls": [],
                "ceilings": [],
                "custom_areas": [
                    {"area_group_name": "Floor", "name": "Floor 1", "length": 12, "breadth": 10, "quantity": 1},
                    {"area_group_name": "Floor", "name": "Floor 2", "length": 5, "breadth": 4, "quantity": 1},
                    {"area_group_name": "Terrace", "name": "Terrace 1", "length": 20, "breadth": 15, "quantity": 2},
                ],
                "openings": [],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        custom = MeasurementSurface.objects.filter(room=room, surface_type="OTHER").order_by("id")
        self.assertEqual(custom.count(), 3)
        self.assertEqual(custom[0].area_group_name, "Floor")
        self.assertEqual(custom[0].name, "Floor 1")
        self.assertEqual(custom[0].gross_area, 120)
        self.assertEqual(custom[1].area_group_name, "Floor")
        self.assertEqual(custom[2].area_group_name, "Terrace")
        self.assertEqual(custom[2].gross_area, 600)

    def test_wall_ceiling_and_custom_lines_can_be_deleted_individually(self):
        property_obj = Property.objects.create(customer=self.customer, name="Individual CRUD")
        room = PropertyRoom.objects.create(property=property_obj, name="Living Room")
        surfaces = [
            MeasurementSurface.objects.create(
                property=property_obj, room=room, work_area="INTERIOR",
                surface_type="WALL", name="Wall 1", length=10, breadth=10,
            ),
            MeasurementSurface.objects.create(
                property=property_obj, room=room, work_area="INTERIOR",
                surface_type="CEILING", name="Ceiling 1", length=10, breadth=10,
            ),
            MeasurementSurface.objects.create(
                property=property_obj, room=room, work_area="INTERIOR",
                surface_type="OTHER", area_group_name="Floor", name="Floor 1",
                length=10, breadth=10,
            ),
        ]
        for index, surface in enumerate(surfaces):
            response = self.client.delete(
                reverse("measurement-surface-detail", kwargs={"pk": surface.id})
            )
            self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
            self.assertFalse(MeasurementSurface.objects.filter(pk=surface.id).exists())
            self.assertEqual(
                MeasurementSurface.objects.filter(room=room).count(),
                len(surfaces) - index - 1,
            )

    def test_room_calculation_can_be_reassigned_and_deleted(self):
        property_obj = Property.objects.create(customer=self.customer, name="Room correction")
        record = PropertyMeasurement.objects.create(
            property=property_obj,
            contractor=self.owner,
        )
        old_type = Area.objects.create(name="Bedroom", created_by=self.owner)
        new_type = Area.objects.create(name="Living Room", created_by=self.owner)
        room = PropertyRoom.objects.create(
            property=property_obj,
            measurement_record=record,
            room_type=old_type,
            name="Bedroom",
        )
        MeasurementSurface.objects.create(
            property=property_obj,
            measurement_record=record,
            room=room,
            work_area="INTERIOR",
            surface_type="OTHER",
            name="Floor",
            length=10,
            breadth=12,
        )
        changed = self.client.patch(
            reverse("property-room-detail", kwargs={"pk": room.id}),
            {"name": "Living Room", "room_type": new_type.id},
            format="json",
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK, changed.data)
        room.refresh_from_db()
        self.assertEqual(room.name, "Living Room")
        self.assertEqual(room.room_type, new_type)

        deleted = self.client.delete(
            reverse("property-room-detail", kwargs={"pk": room.id})
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PropertyRoom.objects.filter(pk=room.id).exists())
        self.assertFalse(MeasurementSurface.objects.filter(room_id=room.id).exists())

    def test_locked_room_calculation_cannot_be_deleted(self):
        property_obj = Property.objects.create(customer=self.customer, name="Locked room")
        record = PropertyMeasurement.objects.create(
            property=property_obj,
            contractor=self.owner,
            status=PropertyMeasurement.Status.LOCKED,
        )
        room = PropertyRoom.objects.create(
            property=property_obj,
            measurement_record=record,
            name="Bedroom",
        )
        response = self.client.delete(
            reverse("property-room-detail", kwargs={"pk": room.id})
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PropertyRoom.objects.filter(pk=room.id).exists())

    def test_saved_room_measurement_can_be_edited_and_replaced(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Editable"),
            name="Bedroom",
        )
        url = reverse("room-measurement-save", kwargs={"property_id": room.property_id})
        first = self.client.post(
            url,
            {
                "room_id": room.id,
                "walls": [{"name": "Wall 1", "length": 10, "breadth": 10}],
                "ceilings": [{"name": "Ceiling 1", "length": 10, "breadth": 10}],
                "openings": [],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)

        edited = self.client.post(
            url,
            {
                "room_id": room.id,
                "walls": [
                    {"name": "Wall 1", "length": 12, "breadth": 10},
                    {"name": "Wall 2", "length": 8, "breadth": 10},
                ],
                "ceilings": [],
                "openings": [
                    {"opening_type": "WINDOW", "name": "Window 1", "height": 4, "width": 3, "quantity": 1},
                ],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.data)
        saved = MeasurementSurface.objects.filter(room=room)
        self.assertEqual(saved.count(), 2)
        self.assertFalse(saved.filter(surface_type="CEILING").exists())
        self.assertEqual(sum(item.gross_area for item in saved), 200)
        self.assertEqual(sum(item.deduction_area for item in saved), 12)

    def test_ceiling_deduction_reduces_ceiling_without_reducing_walls(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Ceiling deduction"),
            name="Bedroom",
        )
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "walls": [{"name": "Wall 1", "length": 10, "breadth": 10}],
                "ceilings": [{"name": "Ceiling 1", "length": 10, "breadth": 10}],
                "openings": [
                    {"opening_type": "CEILING", "name": "Ceiling cut-out", "height": 2, "width": 5, "quantity": 1},
                ],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        wall = MeasurementSurface.objects.get(room=room, surface_type="WALL")
        ceiling = MeasurementSurface.objects.get(room=room, surface_type="CEILING")
        self.assertEqual(wall.net_area, 100)
        self.assertEqual(ceiling.deduction_area, 10)
        self.assertEqual(ceiling.net_area, 90)

    def test_room_can_be_saved_with_ceiling_only(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Ceiling only"),
            name="Balcony soffit",
        )
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "walls": [],
                "ceilings": [{"name": "Ceiling 1", "length": 12, "breadth": 10}],
                "openings": [],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved = MeasurementSurface.objects.get(room=room)
        self.assertEqual(saved.surface_type, "CEILING")
        self.assertEqual(saved.net_area, 120)

    def test_unchecked_ceiling_adjustment_adds_to_ceiling(self):
        room = PropertyRoom.objects.create(
            property=Property.objects.create(customer=self.customer, name="Ceiling addition"),
            name="Living room",
        )
        response = self.client.post(
            reverse("room-measurement-save", kwargs={"property_id": room.property_id}),
            {
                "room_id": room.id,
                "walls": [],
                "ceilings": [{"name": "Ceiling 1", "length": 10, "breadth": 10}],
                "openings": [
                    {"opening_type": "CEILING", "name": "Ceiling addition", "height": 2, "width": 5, "quantity": 1, "effect": "ADD", "deduction_mode": "IGNORE", "deduction_percentage": 0},
                ],
                "paintable_openings": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ceiling = MeasurementSurface.objects.get(room=room, surface_type="CEILING")
        self.assertEqual(ceiling.addition_area, 10)
        self.assertEqual(ceiling.net_area, 110)

    def test_exterior_door_is_deducted_once_but_painted_on_two_sides(self):
        property_obj = Property.objects.create(customer=self.customer, name="Exterior", measurement_type="EXTERIOR")
        wall = MeasurementSurface.objects.create(property=property_obj, work_area="EXTERIOR", surface_type="WALL", name="Front wall", length=20, breadth=10)
        door = MeasurementSurface.objects.create(property=property_obj, work_area="EXTERIOR", surface_type="DOOR", name="Main door", length=4, breadth=7, quantity=1, paintable_sides=2, finish="Wood polish")
        MeasurementOpening.objects.create(surface=wall, linked_surface=door, opening_type="DOOR", width=4, height=7, quantity=1)
        self.assertEqual(door.gross_area, 56)
        self.assertEqual(wall.deduction_area, 28)
        self.assertEqual(wall.net_area, 172)


class QuotationApiTests(APITestCase):

    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000031", email="quote-owner@example.com",
            password="test-password", role=BharathUser.Roles.CONTRACTOR,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        ContractorProfile.objects.create(
            user=self.contractor,
            company_name="Quotation Contractor Co",
            owner_name="Quotation Owner",
            gst_number="29ABCDE1234F1Z5",
        )
        self.customer = Customer.objects.create(
            contractor=self.contractor, name="Quotation Customer", mobile="9888888888",
        )
        self.property = Property.objects.create(
            customer=self.customer, name="Quotation Home", property_type="2BHK",
        )
        self.room = PropertyRoom.objects.create(
            property=self.property, name="Living Room", length=10, width=12,
            height=10, door_count=1, door_width=3, door_height=7,
        )
        self.service = ServiceType.objects.create(
            name="Interior wall painting", calculation_type=ServiceType.CalculationType.WALL,
        )
        self.client.force_authenticate(self.contractor)

    def test_dashboard_quotation_count_matches_active_quotation_list(self):
        Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-DASH-0001",
            status=Quotation.Status.DRAFT,
            grand_total="1000.00",
        )
        Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-DASH-0002",
            status=Quotation.Status.CONVERTED,
            grand_total="5000.00",
        )

        dashboard = self.client.get(reverse("contractor-crm-dashboard"))
        quotation_list = self.client.get(reverse("quotation-list-create"))

        self.assertEqual(dashboard.status_code, status.HTTP_200_OK, dashboard.data)
        self.assertEqual(quotation_list.status_code, status.HTTP_200_OK, quotation_list.data)
        listed = quotation_list.data.get("results", quotation_list.data) if isinstance(quotation_list.data, dict) else quotation_list.data
        self.assertEqual(dashboard.data["counts"]["quotations"], len(listed))
        self.assertEqual(dashboard.data["counts"]["quotation_value"], Decimal("1000.00"))
        self.assertFalse(any(item["status"] == Quotation.Status.CONVERTED for item in dashboard.data["recent_quotations"]))

    def test_nested_quotation_creation_calculates_totals(self):
        response = self.client.post(
            reverse("quotation-create"),
            {
                "customer": self.customer.id,
                "property": self.property.id,
                "discount_type": "PERCENTAGE",
                "discount_value": 10,
                "gst_mode": "GST_EXTRA",
                "gst_percentage": 18,
                "rooms": [{
                    "property_room": self.room.id, "name": self.room.name,
                    "length": 10, "width": 12, "height": 10,
                    "door_count": 1, "door_width": 3, "door_height": 7,
                }],
                "items": [{
                    "room_index": 0, "service_type": self.service.id,
                    "description": "Interior wall painting", "calculation_method": "AREA",
                    "coats": 2, "rate": "10.00",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        quotation = Quotation.objects.get(pk=response.data["id"])
        self.assertEqual(str(quotation.subtotal), "4190.00")
        self.assertEqual(str(quotation.discount), "419.00")
        self.assertEqual(str(quotation.gst_amount), "678.78")
        self.assertEqual(str(quotation.grand_total), "4449.78")
        self.assertTrue(quotation.quotation_number.startswith("BRQ-"))
        self.assertEqual(
            response.data["contractor_details"]["company_name"],
            "Quotation Contractor Co",
        )
        self.assertEqual(
            response.data["contractor_details"]["gst_number"],
            "29ABCDE1234F1Z5",
        )

    def test_quotation_pdf_preview_does_not_persist_draft(self):
        before_count = Quotation.objects.count()
        response = self.client.post(
            reverse("quotation-preview-pdf"),
            {
                "customer": self.customer.id,
                "property": self.property.id,
                "discount_type": "FIXED",
                "discount_value": 0,
                "gst_mode": "NO_GST",
                "gst_percentage": 0,
                "rooms": [{
                    "property_room": self.room.id,
                    "name": self.room.name,
                    "length": 10,
                    "width": 12,
                    "height": 10,
                }],
                "items": [{
                    "room_index": 0,
                    "service_type": self.service.id,
                    "description": "Interior wall painting",
                    "calculation_method": "AREA",
                    "coats": 2,
                    "rate": "10.00",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertEqual(Quotation.objects.count(), before_count)

    def test_quotation_preserves_selected_measurement_record(self):
        record = PropertyMeasurement.objects.create(
            property=self.property, contractor=self.contractor,
            measured_on=date(2026, 9, 11), status=PropertyMeasurement.Status.COMPLETED,
        )
        response = self.client.post(
            reverse("quotation-create"),
            {
                "customer": self.customer.id,
                "property": self.property.id,
                "measurement_record": record.id,
                "items": [{
                    "service_type": self.service.id,
                    "description": "Saved measurement wall painting",
                    "calculation_method": "MANUAL",
                    "quantity": "100.00",
                    "rate": "10.00",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        quotation = Quotation.objects.get(pk=response.data["id"])
        self.assertEqual(quotation.measurement_record_id, record.id)
        record.refresh_from_db()
        self.assertEqual(record.status, PropertyMeasurement.Status.LOCKED)

    def test_quotation_rejects_measurement_from_another_property(self):
        other_property = Property.objects.create(customer=self.customer, name="Other Home")
        record = PropertyMeasurement.objects.create(
            property=other_property, contractor=self.contractor,
            measured_on=date(2026, 9, 11), status=PropertyMeasurement.Status.COMPLETED,
        )
        response = self.client.post(
            reverse("quotation-create"),
            {
                "customer": self.customer.id,
                "property": self.property.id,
                "measurement_record": record.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("measurement_record", response.data)

    def test_property_must_belong_to_selected_customer(self):
        second_customer = Customer.objects.create(
            contractor=self.contractor, name="Second Customer", mobile="9999999999",
        )
        response = self.client.post(
            reverse("quotation-create"),
            {"customer": second_customer.id, "property": self.property.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("property", response.data)

    def test_unverified_contractor_cannot_create_quotation(self):
        self.contractor.is_verified = False
        self.contractor.verification_status = BharathUser.VerificationStatus.PENDING
        self.contractor.save(update_fields=["is_verified", "verification_status"])
        response = self.client.post(
            reverse("quotation-create"),
            {"customer": self.customer.id, "property": self.property.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_painter_cannot_access_quotations(self):
        painter = BharathUser.objects.create_user(
            mobile="9000000032", email="painter@example.com",
            password="test-password", role=BharathUser.Roles.PAINTER,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        self.client.force_authenticate(painter)
        response = self.client.get(reverse("quotation-list-create"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_quotation_update_and_delete(self):
        quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-CRUD-0001",
        )
        update = self.client.patch(
            reverse("quotation-detail", kwargs={"pk": quotation.id}),
            {"notes": "Updated quotation notes"},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        quotation.refresh_from_db()
        self.assertEqual(quotation.status, Quotation.Status.DRAFT)
        self.assertEqual(quotation.notes, "Updated quotation notes")

        additional_room = PropertyRoom.objects.create(
            property=self.property, name="Bedroom", length=10, width=10, height=10,
        )
        second_room = PropertyRoom.objects.create(
            property=self.property, name="Kitchen", length=8, width=9, height=10,
        )
        add_room = self.client.post(
            reverse("quotation-room-sync", kwargs={"quotation_id": quotation.id}),
            {"property_room_ids": [additional_room.id, second_room.id]},
            format="json",
        )
        self.assertEqual(add_room.status_code, status.HTTP_200_OK, add_room.data)
        self.assertEqual(add_room.data["added"], 2)
        self.assertEqual(quotation.rooms.count(), 2)

        remove_room = self.client.post(
            reverse("quotation-room-sync", kwargs={"quotation_id": quotation.id}),
            {"property_room_ids": [second_room.id]},
            format="json",
        )
        self.assertEqual(remove_room.status_code, status.HTTP_200_OK, remove_room.data)
        self.assertEqual(remove_room.data["removed"], 1)
        self.assertEqual(quotation.rooms.count(), 1)
        self.assertEqual(quotation.rooms.first().property_room_id, second_room.id)

        add_master_rooms = self.client.post(
            reverse("quotation-room-sync", kwargs={"quotation_id": quotation.id}),
            {
                "property_room_ids": [second_room.id],
                "custom_room_names": ["Master Bedroom", "Balcony", "Master Bedroom"],
            },
            format="json",
        )
        self.assertEqual(add_master_rooms.status_code, status.HTTP_200_OK, add_master_rooms.data)
        self.assertEqual(add_master_rooms.data["added"], 2)
        self.assertTrue(quotation.rooms.filter(property_room__isnull=True, name="Master Bedroom").exists())
        self.assertTrue(quotation.rooms.filter(property_room__isnull=True, name="Balcony").exists())

        delete = self.client.delete(
            reverse("quotation-detail", kwargs={"pk": quotation.id})
        )
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Quotation.objects.filter(pk=quotation.id).exists())

    def test_edit_preserves_existing_and_new_services_for_same_room(self):
        quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-ROOM-LINES-0001",
        )
        quotation_room = QuotationRoom.objects.create(
            quotation=quotation,
            property_room=self.room,
            name=self.room.name,
        )
        first = QuotationItem.objects.create(
            quotation=quotation,
            room=quotation_room,
            service_type=self.service,
            description="Living Room - Net Wall Area",
            calculation_method=QuotationItem.CalculationMethod.MANUAL,
            quantity=Decimal("100.00"),
            rate=Decimal("10.00"),
            amount=Decimal("1000.00"),
        )
        second = QuotationItem.objects.create(
            quotation=quotation,
            room=quotation_room,
            service_type=self.service,
            description="Living Room - Texture Work",
            calculation_method=QuotationItem.CalculationMethod.MANUAL,
            quantity=Decimal("25.00"),
            rate=Decimal("30.00"),
            amount=Decimal("750.00"),
        )

        response = self.client.patch(
            reverse("quotation-detail", kwargs={"pk": quotation.id}),
            {
                "items": [
                    {
                        "id": first.id,
                        "room": quotation_room.id,
                        "service_type": self.service.id,
                        "description": "Living Room - Net Wall Area",
                        "calculation_method": "MANUAL",
                        "quantity": "110.00",
                        "rate": "12.00",
                    },
                    {
                        "id": second.id,
                        "room": quotation_room.id,
                        "service_type": self.service.id,
                        "description": "Living Room - Texture Work",
                        "calculation_method": "MANUAL",
                        "quantity": "25.00",
                        "rate": "35.00",
                    },
                    {
                        "room": quotation_room.id,
                        "service_type": self.service.id,
                        "description": "Living Room - New Ceiling Service",
                        "calculation_method": "MANUAL",
                        "quantity": "80.00",
                        "rate": "15.00",
                    },
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved = quotation.items.order_by("id")
        self.assertEqual(saved.count(), 3)
        self.assertEqual(
            set(saved.values_list("description", flat=True)),
            {
                "Living Room - Net Wall Area",
                "Living Room - Texture Work",
                "Living Room - New Ceiling Service",
            },
        )
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.quantity, Decimal("110.00"))
        self.assertEqual(first.rate, Decimal("12.00"))
        self.assertEqual(second.rate, Decimal("35.00"))
        self.assertEqual(saved.filter(room=quotation_room).count(), 3)

    def test_submitted_quotation_keeps_historical_master_and_profile_values(self):
        category = ServiceCategory.objects.create(name="Painting")
        product = PaintType.objects.create(
            name="Original Emulsion", key_features="Original warranty"
        )
        brand = PaintBrand.objects.create(name="Original Brand")
        unit = Unit.objects.create(name="Sq ft")
        quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-SNAPSHOT-0001",
            status=Quotation.Status.DRAFT,
        )
        quote_room = QuotationRoom.objects.create(
            quotation=quotation, property_room=self.room, name="Living Room"
        )
        item = QuotationItem.objects.create(
            quotation=quotation,
            room=quote_room,
            service_category=category,
            service_type=self.service,
            paint_type=product,
            paint_brand=brand,
            unit=unit,
            description="Original work description",
            quantity="100.00",
            rate="12.00",
            amount="1200.00",
        )
        quotation.status = Quotation.Status.SENT
        quotation.save(update_fields=("status", "updated_at"))

        category.name = "Changed Painting"
        category.save(update_fields=("name",))
        self.service.name = "Changed Service"
        self.service.save(update_fields=("name",))
        product.name = "Changed Emulsion"
        product.key_features = "Changed warranty"
        product.save(update_fields=("name", "key_features"))
        brand.name = "Changed Brand"
        brand.save(update_fields=("name",))
        unit.name = "Changed unit"
        unit.save(update_fields=("name",))
        self.customer.name = "Changed Customer"
        self.customer.save(update_fields=("name", "updated_at"))
        self.property.name = "Changed Property"
        self.property.save(update_fields=("name", "updated_at"))
        profile = self.contractor.contractor_profile
        profile.company_name = "Changed Contractor"
        profile.save(update_fields=("company_name", "updated_at"))

        item.refresh_from_db()
        item_data = QuotationItemSerializer(item).data
        self.assertEqual(item_data["service_category_name"], "Painting")
        self.assertEqual(item_data["service_name"], "Interior wall painting")
        self.assertEqual(item_data["paint_type_name"], "Original Emulsion")
        self.assertEqual(item_data["paint_type_features"], "Original warranty")
        self.assertEqual(item_data["brand_name"], "Original Brand")
        self.assertEqual(item_data["unit_name"], "Sq ft")

        quotation.refresh_from_db()
        quotation_data = QuotationSerializer(quotation).data
        self.assertEqual(quotation_data["customer_details"]["name"], "Quotation Customer")
        self.assertEqual(quotation_data["contractor_details"]["company_name"], "Quotation Contractor Co")
        self.assertEqual(quotation.property_snapshot["name"], "Quotation Home")

        blocked_update = self.client.patch(
            reverse("quotation-detail", kwargs={"pk": quotation.id}),
            {"notes": "Must not replace the historical version"},
            format="json",
        )
        blocked_delete = self.client.delete(
            reverse("quotation-detail", kwargs={"pk": quotation.id})
        )
        self.assertEqual(blocked_update.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked_delete.status_code, status.HTTP_400_BAD_REQUEST)

    def test_contractor_cannot_update_or_delete_another_quotation(self):
        other = BharathUser.objects.create_user(
            mobile="9000000033", email="other-quote-owner@example.com",
            password="test-password", role=BharathUser.Roles.CONTRACTOR,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        other_customer = Customer.objects.create(
            contractor=other, name="Other Quote Customer", mobile="9000000034",
        )
        other_property = Property.objects.create(
            customer=other_customer, name="Other Quote Property",
        )
        quotation = Quotation.objects.create(
            contractor=other, customer=other_customer, property=other_property,
            quotation_number="BRQ-OTHER-0001",
        )
        update = self.client.patch(
            reverse("quotation-detail", kwargs={"pk": quotation.id}),
            {"status": "CANCELLED"}, format="json",
        )
        delete = self.client.delete(
            reverse("quotation-detail", kwargs={"pk": quotation.id})
        )
        self.assertEqual(update.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_requested_revision_must_be_resent_after_edit(self):
        portal_user = BharathUser.objects.create_user(
            mobile="9888888888",
            password="customer-password",
            role=BharathUser.Roles.CUSTOMER,
        )
        self.customer.portal_user = portal_user
        self.customer.save(update_fields=["portal_user", "updated_at"])
        quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="BRQ-REVISION-0001",
            status=Quotation.Status.SENT,
        )
        quote_room = QuotationRoom.objects.create(
            quotation=quotation,
            property_room=self.room,
            name="Living Room",
        )
        QuotationItem.objects.create(
            quotation=quotation,
            room=quote_room,
            service_type=self.service,
            description="Interior wall painting",
            quantity="100.00",
            rate="12.00",
            amount="1200.00",
        )

        self.client.force_authenticate(portal_user)
        revision = self.client.post(
            reverse("customer-quotation-action", kwargs={"pk": quotation.id}),
            {"action": "REVISION", "note": "Change the paint and remove one line."},
            format="json",
        )
        self.assertEqual(revision.status_code, status.HTTP_200_OK, revision.data)
        revised = Quotation.objects.get(pk=revision.data["revision_id"])
        quotation.refresh_from_db()
        self.assertEqual(quotation.status, Quotation.Status.REVISION_REQUESTED)
        self.assertEqual(quotation.quotation_number, "BRQ-REVISION-0001-V1")
        self.assertEqual(revised.quotation_number, "BRQ-REVISION-0001-V2")
        self.assertEqual(revised.version_number, 2)
        self.assertEqual(revised.revision_of_id, quotation.id)
        self.assertEqual(revised.status, Quotation.Status.DRAFT)
        self.assertEqual(revised.rooms.count(), 1)
        self.assertEqual(revised.items.count(), 1)
        self.assertNotEqual(revised.rooms.first().id, quote_room.id)

        self.client.force_authenticate(self.contractor)
        edited = self.client.patch(
            reverse("quotation-detail", kwargs={"pk": revised.id}),
            {"notes": "Revised quotation notes"},
            format="json",
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.data)
        revised.refresh_from_db()
        self.assertEqual(revised.status, Quotation.Status.DRAFT)
        self.assertEqual(revised.customer_response_note, "Change the paint and remove one line.")
        self.assertIsNone(revised.sent_at)

        self.client.force_authenticate(portal_user)
        hidden = self.client.get(
            reverse("customer-quotation-detail", kwargs={"pk": revised.id})
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        preserved = self.client.get(
            reverse("customer-quotation-detail", kwargs={"pk": quotation.id})
        )
        self.assertEqual(preserved.status_code, status.HTTP_200_OK, preserved.data)

        self.client.force_authenticate(self.contractor)
        resent = self.client.post(
            reverse("quotation-submit", kwargs={"pk": revised.id}),
            {},
            format="json",
        )
        self.assertEqual(resent.status_code, status.HTTP_200_OK, resent.data)
        self.assertTrue(resent.data["is_revision"])
        revised.refresh_from_db()
        self.assertEqual(revised.status, Quotation.Status.SENT)

        self.client.force_authenticate(portal_user)
        visible = self.client.get(
            reverse("customer-quotation-detail", kwargs={"pk": revised.id})
        )
        self.assertEqual(visible.status_code, status.HTTP_200_OK, visible.data)
        self.assertEqual(visible.data["version_number"], 2)

        accepted = self.client.post(
            reverse("customer-quotation-action", kwargs={"pk": revised.id}),
            {"action": "APPROVE"},
            format="json",
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertEqual(accepted.data["next_step"], "SCHEDULE")
        self.assertEqual(accepted.data["schedule_url"], f"/work-schedules?quotation={revised.id}")
        revised.refresh_from_db()
        self.assertEqual(revised.status, Quotation.Status.ACCEPTED)

        self.client.force_authenticate(self.contractor)
        start = date.today() + timedelta(days=2)
        scheduled = self.client.post(
            reverse("work-schedule-list"),
            {"quotation": revised.id, "start_date": start, "end_date": start + timedelta(days=2)},
            format="json",
        )
        self.assertEqual(scheduled.status_code, status.HTTP_201_CREATED, scheduled.data)
        self.assertEqual(scheduled.data["quotation"], revised.id)
        self.assertEqual(scheduled.data["status"], "PENDING")

        from jobs.models import WorkSchedule
        schedule = WorkSchedule.objects.get(pk=scheduled.data["id"])
        schedule.proposed_start_date = date.today() - timedelta(days=2)
        schedule.proposed_end_date = date.today() - timedelta(days=1)
        schedule.save(update_fields=("proposed_start_date", "proposed_end_date", "updated_at"))
        schedule_list = self.client.get(reverse("work-schedule-list"))
        self.assertEqual(schedule_list.status_code, status.HTTP_200_OK, schedule_list.data)
        expired = next(item for item in schedule_list.data if item["id"] == schedule.id)
        self.assertTrue(expired["needs_reschedule"])

    def test_in_progress_revision_preserves_schedule_and_receipts(self):
        from jobs.models import WorkSchedule
        from .models import ProjectReceipt

        portal_user = BharathUser.objects.create_user(
            mobile="9888888877", password="customer-password",
            role=BharathUser.Roles.CUSTOMER,
        )
        self.customer.portal_user = portal_user
        self.customer.save(update_fields=("portal_user", "updated_at"))
        quotation = Quotation.objects.create(
            contractor=self.contractor, customer=self.customer,
            property=self.property, quotation_number="BRQ-ACTIVE-0001",
            status=Quotation.Status.IN_PROGRESS,
        )
        room = QuotationRoom.objects.create(quotation=quotation, name="Living Room")
        QuotationItem.objects.create(
            quotation=quotation, room=room, service_type=self.service,
            description="Original wall work", quantity="100.00",
            rate="10.00", amount="1000.00",
        )
        schedule = WorkSchedule.objects.create(
            quotation=quotation, proposed_start_date=date.today(),
            proposed_end_date=date.today() + timedelta(days=2),
            proposed_by=self.contractor, status=WorkSchedule.Status.IN_PROGRESS,
            customer_accepted=True, contractor_accepted=True,
        )
        receipt = ProjectReceipt.objects.create(
            contractor=self.contractor, quotation=quotation,
            receipt_number="BPR-ACTIVE-0001", amount="250.00",
            payment_mode=ProjectReceipt.PaymentMode.UPI,
        )

        self.client.force_authenticate(portal_user)
        requested = self.client.post(
            reverse("customer-quotation-action", kwargs={"pk": quotation.id}),
            {"action": "REVISION", "note": "Add ceiling and remove one wall."},
            format="json",
        )
        self.assertEqual(requested.status_code, status.HTTP_200_OK, requested.data)
        revised = Quotation.objects.get(pk=requested.data["revision_id"])

        self.client.force_authenticate(self.contractor)
        sent = self.client.post(reverse("quotation-submit", kwargs={"pk": revised.id}), {}, format="json")
        self.assertEqual(sent.status_code, status.HTTP_200_OK, sent.data)

        self.client.force_authenticate(portal_user)
        approved = self.client.post(
            reverse("customer-quotation-action", kwargs={"pk": revised.id}),
            {"action": "APPROVE"}, format="json",
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        self.assertEqual(approved.data["next_step"], "WORK_IN_PROGRESS")
        revised.refresh_from_db(); schedule.refresh_from_db(); receipt.refresh_from_db(); quotation.refresh_from_db()
        self.assertEqual(revised.status, Quotation.Status.IN_PROGRESS)
        self.assertEqual(schedule.quotation_id, revised.id)
        self.assertEqual(schedule.status, WorkSchedule.Status.IN_PROGRESS)
        self.assertEqual(receipt.quotation_id, revised.id)
        self.assertEqual(quotation.status, Quotation.Status.REVISION_REQUESTED)
