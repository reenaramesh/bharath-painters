from datetime import timedelta
import hashlib

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APITestCase
from jobs.models import WorkSchedule

from accounts.models import BharathUser
from .models import (
    ContractorCustomerConnection,
    Customer,
    Invoice,
    Property,
    PropertyAccessAudit,
    PropertyContact,
    PropertyInvitation,
    PropertyMeasurement,
    MeasurementSurface,
    Quotation,
)
from .property_access import (
    PropertyPermission,
    accessible_properties,
    has_property_access,
    require_property_access,
)


class PropertyContactModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.customer_user = BharathUser.objects.create_user(
            mobile="9000811001", password="Pass123!", role="CUSTOMER",
        )
        cls.customer = Customer.objects.create(
            name="Property owner", mobile="9000811001", portal_user=cls.customer_user,
        )
        cls.other_user = BharathUser.objects.create_user(
            mobile="9000811002", password="Pass123!", role="CUSTOMER",
        )
        cls.other_customer = Customer.objects.create(
            name="Additional contact", mobile="9000811002", portal_user=cls.other_user,
        )
        cls.property = Property.objects.create(
            customer=cls.customer, name="Legacy-owned property",
        )

    def test_property_contact_keeps_legacy_customer_and_has_unique_membership(self):
        contact = PropertyContact.objects.get(property=self.property, customer=self.customer)

        self.assertEqual(self.property.customer_id, self.customer.id)
        self.assertEqual(contact.property_id, self.property.id)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PropertyContact.objects.create(
                property=self.property, customer=self.customer,
                role=PropertyContact.Role.AUTHORIZED_CONTACT,
            )

    def test_property_has_at_most_one_primary_contact(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            PropertyContact.objects.create(
                property=self.property, customer=self.other_customer,
                role=PropertyContact.Role.PRIMARY, is_primary=True,
            )

    def test_primary_flag_requires_primary_role(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            PropertyContact.objects.create(
                property=self.property, customer=self.other_customer,
                role=PropertyContact.Role.OWNER, is_primary=True,
            )

    def test_customer_mobile_identity_remains_globally_unique_after_normalization(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Customer.objects.create(name="Duplicate owner", mobile="+91 90008 11001")


class PropertyAccessServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.primary_user = BharathUser.objects.create_user(
            mobile="9000811101", password="Pass123!", role="CUSTOMER",
        )
        cls.primary_customer = Customer.objects.create(
            name="Primary", mobile="9000811101", portal_user=cls.primary_user,
        )
        cls.secondary_user = BharathUser.objects.create_user(
            mobile="9000811102", password="Pass123!", role="CUSTOMER",
        )
        cls.secondary_customer = Customer.objects.create(
            name="Tenant", mobile="9000811102", portal_user=cls.secondary_user,
        )
        cls.contractor = BharathUser.objects.create_user(
            mobile="9000811103", password="Pass123!", role="CONTRACTOR",
        )
        cls.unrelated = BharathUser.objects.create_user(
            mobile="9000811104", password="Pass123!", role="CUSTOMER",
        )
        cls.property = Property.objects.create(customer=cls.primary_customer, name="Access test")
        cls.connection = ContractorCustomerConnection.objects.create(
            customer=cls.primary_customer,
            contractor=cls.contractor,
            status=ContractorCustomerConnection.Status.CONNECTED,
        )
        cls.property.contractor = cls.contractor
        cls.property.connection = cls.connection
        cls.property.save(update_fields=("contractor", "connection"))
        PropertyContact.objects.get(property=cls.property, customer=cls.primary_customer)
        PropertyContact.objects.create(
            property=cls.property,
            customer=cls.secondary_customer,
            role=PropertyContact.Role.TENANT,
        )

    def test_primary_can_manage_contacts_but_tenant_cannot_approve_or_manage(self):
        self.assertTrue(has_property_access(
            self.primary_user, self.property, PropertyPermission.MANAGE_CONTACTS,
        ))
        self.assertTrue(has_property_access(
            self.secondary_user, self.property, PropertyPermission.VIEW_PROGRESS,
        ))
        self.assertFalse(has_property_access(
            self.secondary_user, self.property, PropertyPermission.APPROVE_QUOTATIONS,
        ))
        self.assertFalse(has_property_access(
            self.secondary_user, self.property, PropertyPermission.MANAGE_CONTACTS,
        ))

    def test_accessible_properties_filters_by_permission(self):
        self.assertIn(self.property, accessible_properties(
            self.primary_user, PropertyPermission.MANAGE_CONTACTS,
        ))
        self.assertNotIn(self.property, accessible_properties(
            self.secondary_user, PropertyPermission.APPROVE_QUOTATIONS,
        ))

    def test_contractor_access_requires_connected_ownership(self):
        self.assertTrue(has_property_access(self.contractor, self.property))
        self.connection.status = ContractorCustomerConnection.Status.DISCONNECTED
        self.connection.save(update_fields=("status",))
        self.assertFalse(has_property_access(self.contractor, self.property))

    def test_unrelated_and_anonymous_users_are_denied(self):
        self.assertFalse(has_property_access(self.unrelated, self.property))
        self.assertFalse(has_property_access(None, self.property))
        with self.assertRaises(PermissionDenied):
            require_property_access(self.unrelated, self.property)


class PropertyInvitationApiTests(APITestCase):
    def setUp(self):
        self.primary_user = BharathUser.objects.create_user(
            mobile="9000811201", password="Pass123!", role="CUSTOMER",
        )
        self.primary_customer = Customer.objects.create(
            name="Owner", mobile="9000811201", portal_user=self.primary_user,
        )
        self.invitee_user = BharathUser.objects.create_user(
            mobile="9000811202", password="Pass123!", role="CUSTOMER",
        )
        self.invitee_customer = Customer.objects.create(
            name="Tenant", mobile="9000811202", portal_user=self.invitee_user,
        )
        self.unrelated_user = BharathUser.objects.create_user(
            mobile="9000811203", password="Pass123!", role="CUSTOMER",
        )
        self.unlinked_customer_user = BharathUser.objects.create_user(
            mobile="9000811206", password="Pass123!", role="CUSTOMER",
        )
        self.contractor = BharathUser.objects.create_user(
            mobile="9000811204", password="Pass123!", role="CONTRACTOR",
        )
        self.connection = ContractorCustomerConnection.objects.create(
            customer=self.primary_customer,
            contractor=self.contractor,
            status=ContractorCustomerConnection.Status.CONNECTED,
        )
        self.property = Property.objects.create(
            customer=self.primary_customer,
            contractor=self.contractor,
            connection=self.connection,
            name="Invite site",
            address="Private address",
            city="Bengaluru",
        )
        PropertyContact.objects.get(property=self.property, customer=self.primary_customer)
        self.list_url = reverse(
            "property-invitation-list-create", args=(self.property.id,),
        )

    def create_invitation(self, mobile=None):
        self.client.force_authenticate(self.primary_user)
        response = self.client.post(self.list_url, {
            "name": "New customer",
            "mobile": mobile or self.unlinked_customer_user.mobile,
            "email": "",
            "relationship": PropertyContact.Relationship.TENANT,
            "access_level": PropertyContact.AccessLevel.SITE_COORDINATION,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_invitation_acceptance_creates_contact_and_audit(self):
        created = self.create_invitation()
        token = created.data["invite_url"].rsplit("/", 1)[-1]

        self.client.force_authenticate(None)
        preview = self.client.get(reverse("property-invitation-token", args=(token,)))
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["property_name"], "Invite site")
        self.assertNotIn("address", preview.data)

        self.client.force_authenticate(self.unlinked_customer_user)
        accepted = self.client.post(reverse("property-invitation-accept", args=(token,)))
        self.assertEqual(accepted.status_code, 200, accepted.data)
        accepted_customer = Customer.objects.get(normalized_mobile="+919000811206")
        contact = PropertyContact.objects.get(property=self.property, customer=accepted_customer)
        self.assertEqual(contact.relationship, PropertyContact.Relationship.TENANT)
        self.assertEqual(contact.access_level, PropertyContact.AccessLevel.SITE_COORDINATION)
        invitation = PropertyInvitation.objects.get(pk=created.data["id"])
        self.assertEqual(invitation.status, PropertyInvitation.Status.ACCEPTED)
        self.assertEqual(invitation.token_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertEqual(
            set(PropertyAccessAudit.objects.filter(property=self.property).values_list("action", flat=True)),
            {"INVITATION_CREATED", "INVITATION_ACCEPTED"},
        )

    def test_share_search_normalizes_mobile_and_returns_minimum_customer_identity(self):
        self.primary_customer.notes = "Contractor-only private CRM note"
        self.primary_customer.save(update_fields=("notes",))
        self.client.force_authenticate(self.primary_user)

        response = self.client.post(
            reverse("property-share-search", args=(self.property.id,)),
            {"mobile": "+91 9000 811 202"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["found"])
        self.assertEqual(response.data["customer"]["id"], self.invitee_customer.id)
        self.assertEqual(response.data["customer"]["name"], self.invitee_customer.name)
        self.assertNotIn("notes", response.data["customer"])
        self.assertNotIn("Contractor-only private CRM note", str(response.data))

    def test_existing_customer_share_reuses_customer_and_preserves_primary(self):
        original_customer_count = Customer.objects.count()
        primary_contact = PropertyContact.objects.get(property=self.property, customer=self.primary_customer)
        self.client.force_authenticate(self.primary_user)

        response = self.client.post(
            reverse("property-share", args=(self.property.id,)),
            {"mobile": self.invitee_user.mobile, "relationship": "TENANT", "access_level": "VIEW_ONLY"},
            format="json",
        )
        repeated = self.client.post(
            reverse("property-share", args=(self.property.id,)),
            {"mobile": self.invitee_user.mobile, "relationship": "TENANT", "access_level": "SITE_COORDINATION"},
            format="json",
        )

        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(repeated.status_code, 202, repeated.data)
        self.assertEqual(Customer.objects.count(), original_customer_count)
        self.assertEqual(PropertyInvitation.objects.filter(property=self.property).count(), 0)
        self.assertEqual(PropertyContact.objects.filter(property=self.property, customer=self.invitee_customer).count(), 1)
        contact = PropertyContact.objects.get(property=self.property, customer=self.invitee_customer)
        self.assertEqual(contact.status, PropertyContact.Status.PENDING)
        self.assertEqual(contact.access_level, PropertyContact.AccessLevel.SITE_COORDINATION)
        self.assertEqual(contact.relationship, PropertyContact.Relationship.TENANT)
        primary_contact.refresh_from_db()
        self.assertTrue(primary_contact.is_primary)
        self.assertEqual(self.property.customer_id, self.primary_customer.id)

        self.client.force_authenticate(self.invitee_user)
        requests = self.client.get(reverse("customer-property-share-request-list"))
        self.assertEqual([item["id"] for item in requests.data], [contact.id])
        accepted = self.client.post(
            reverse("customer-property-share-request-respond", args=(contact.id,)),
            {"action": "ACCEPT"},
            format="json",
        )
        self.assertEqual(accepted.status_code, 200, accepted.data)
        contact.refresh_from_db()
        self.assertEqual(contact.status, PropertyContact.Status.ACTIVE)

    def test_existing_active_customer_edits_access_without_duplicate_contact(self):
        contact = PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.AUTHORIZED_CONTACT,
            status=PropertyContact.Status.ACTIVE,
            access_level=PropertyContact.AccessLevel.VIEW_ONLY,
        )
        self.client.force_authenticate(self.primary_user)

        response = self.client.post(
            reverse("property-share", args=(self.property.id,)),
            {"mobile": self.invitee_user.mobile, "relationship": "FACILITY_MANAGER", "access_level": "FINANCE"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(PropertyContact.objects.filter(property=self.property, customer=self.invitee_customer).count(), 1)
        contact.refresh_from_db()
        self.assertEqual(contact.access_level, PropertyContact.AccessLevel.FINANCE)
        self.assertEqual(contact.relationship, PropertyContact.Relationship.FACILITY_MANAGER)
        self.assertEqual(response.data["state"], "ACTIVE")

    def test_unknown_mobile_creates_only_one_resendable_invitation(self):
        mobile = "+91 9000 811 099"
        self.client.force_authenticate(self.primary_user)
        lookup = self.client.post(
            reverse("property-share-search", args=(self.property.id,)),
            {"mobile": mobile},
            format="json",
        )
        self.assertEqual(lookup.status_code, 200)
        self.assertFalse(lookup.data["found"])
        self.assertFalse(Customer.objects.filter(normalized_mobile="+919000811099").exists())

        first = self.client.post(
            reverse("property-share", args=(self.property.id,)),
            {"mobile": mobile, "name": "New person", "access_level": "SITE_COORDINATION"},
            format="json",
        )
        second = self.client.post(
            reverse("property-share", args=(self.property.id,)),
            {"mobile": mobile, "name": "New person", "access_level": "SITE_COORDINATION"},
            format="json",
        )

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(PropertyInvitation.objects.filter(property=self.property, status=PropertyInvitation.Status.PENDING).count(), 1)
        self.assertFalse(Customer.objects.filter(normalized_mobile="+919000811099").exists())
        self.assertNotEqual(first.data["invite_url"], second.data["invite_url"])

    def test_unauthorized_user_cannot_search_or_share_property(self):
        self.client.force_authenticate(self.unrelated_user)
        args = (self.property.id,)
        search = self.client.post(reverse("property-share-search", args=args), {"mobile": self.invitee_user.mobile}, format="json")
        share = self.client.post(reverse("property-share", args=args), {"mobile": self.invitee_user.mobile}, format="json")
        self.assertEqual(search.status_code, 403)
        self.assertEqual(share.status_code, 403)

    def test_other_account_cannot_accept_and_primary_can_revoke(self):
        created = self.create_invitation()
        token = created.data["invite_url"].rsplit("/", 1)[-1]

        self.client.force_authenticate(self.unrelated_user)
        rejected = self.client.post(reverse("property-invitation-accept", args=(token,)))
        self.assertEqual(rejected.status_code, 403)

        self.client.force_authenticate(self.primary_user)
        revoked = self.client.post(reverse("property-invitation-revoke", args=(created.data["id"],)))
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(
            PropertyInvitation.objects.get(pk=created.data["id"]).status,
            PropertyInvitation.Status.REVOKED,
        )
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(reverse("property-invitation-token", args=(token,))).status_code,
            404,
        )

    def test_expired_invitation_cannot_be_previewed_or_accepted(self):
        created = self.create_invitation()
        token = created.data["invite_url"].rsplit("/", 1)[-1]
        PropertyInvitation.objects.filter(pk=created.data["id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(reverse("property-invitation-token", args=(token,))).status_code,
            404,
        )
        self.client.force_authenticate(self.invitee_user)
        self.assertEqual(
            self.client.post(reverse("property-invitation-accept", args=(token,))).status_code,
            404,
        )

    def test_non_primary_contact_cannot_invite(self):
        tenant_user = BharathUser.objects.create_user(
            mobile="9000811205", password="Pass123!", role="CUSTOMER",
        )
        tenant_customer = Customer.objects.create(
            name="Other tenant", mobile="9000811205", portal_user=tenant_user,
        )
        PropertyContact.objects.create(
            property=self.property,
            customer=tenant_customer,
            role=PropertyContact.Role.TENANT,
        )
        self.client.force_authenticate(tenant_user)
        response = self.client.post(self.list_url, {"mobile": self.invitee_user.mobile}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_connected_contractor_can_issue_contact_invitation(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(self.list_url, {
            "name": "Tenant",
            "mobile": "9000811299",
            "relationship": PropertyContact.Relationship.TENANT,
            "access_level": PropertyContact.AccessLevel.SITE_COORDINATION,
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["invite_url"].startswith("/join/property/"))
        self.assertEqual(response.data["state"], "INVITATION_CREATED")
        self.assertFalse(Customer.objects.filter(normalized_mobile="+919000811299").exists())

    def test_invited_contact_sees_property_in_customer_portal(self):
        contact = PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.TENANT,
        )
        self.client.force_authenticate(self.invitee_user)

        listed = self.client.get(reverse("customer-property-list"))
        detail = self.client.get(reverse("customer-property-detail", args=(self.property.id,)))

        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.data], [self.property.id])
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(contact.customer.portal_user_id, self.invitee_user.id)

    def test_tenant_can_view_property_quotation_but_cannot_approve_it(self):
        PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.TENANT,
            access_level=PropertyContact.AccessLevel.QUOTATION_APPROVAL,
        )
        quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.primary_customer,
            property=self.property,
            connection=self.connection,
            status=Quotation.Status.SENT,
            subtotal=2500,
            grand_total=2500,
        )
        primary_contact = PropertyContact.objects.get(
            property=self.property,
            customer=self.primary_customer,
        )
        self.assertEqual(quotation.customer_contact_id, primary_contact.id)
        schedule = WorkSchedule.objects.create(
            quotation=quotation,
            customer_contact=quotation.customer_contact,
            proposed_start_date=timezone.localdate() + timedelta(days=2),
            proposed_end_date=timezone.localdate() + timedelta(days=3),
            proposed_by=self.contractor,
        )
        self.client.force_authenticate(self.invitee_user)

        listed = self.client.get(reverse("customer-quotation-list"))
        detail = self.client.get(reverse("customer-quotation-detail", args=(quotation.id,)))
        response = self.client.post(
            reverse("customer-quotation-action", args=(quotation.id,)),
            {"action": "APPROVE"},
            format="json",
        )

        self.assertEqual([item["id"] for item in listed.data], [quotation.id])
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(response.status_code, 404)

        schedules = self.client.get(reverse("work-schedule-list"))
        self.assertEqual(schedules.status_code, 200)
        self.assertEqual(schedules.data[0]["customer_contact_id"], primary_contact.id)
        self.assertNotIn("payment_status", schedules.data[0])
        self.assertEqual(schedule.customer_contact_id, primary_contact.id)

        schedule.status = WorkSchedule.Status.COMPLETED
        schedule.save(update_fields=("status", "updated_at"))
        invoice = Invoice.objects.create(
            contractor=self.contractor,
            quotation=quotation,
            customer=self.primary_customer,
            site_property=self.property,
            invoice_number="TEST-PROPERTY-INV-1",
            customer_name=self.primary_customer.name,
            grand_total=2500,
        )
        invoices = self.client.get(reverse("customer-invoice-list"))
        self.assertEqual(invoices.status_code, 200)
        self.assertEqual(invoices.data, [])
        self.client.force_authenticate(self.primary_user)
        owner_invoices = self.client.get(reverse("customer-invoice-list"))
        self.assertEqual([item["id"] for item in owner_invoices.data], [invoice.id])

    def test_measurement_visibility_follows_access_profile_and_requires_submission(self):
        contact = PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.TENANT,
            relationship=PropertyContact.Relationship.TENANT,
            access_level=PropertyContact.AccessLevel.SITE_COORDINATION,
            status=PropertyContact.Status.ACTIVE,
        )
        record = PropertyMeasurement.objects.create(
            property=self.property,
            contractor=self.contractor,
            submitted_at=timezone.now(),
            status=PropertyMeasurement.Status.COMPLETED,
        )
        MeasurementSurface.objects.create(
            property=self.property,
            measurement_record=record,
            work_area=MeasurementSurface.WorkArea.INTERIOR,
            surface_type=MeasurementSurface.SurfaceType.WALL,
            name="Living room wall",
            length=10,
            breadth=10,
        )
        # Saving measurement content unpublishes an edited record; submit only
        # after the final surface has been saved, as the contractor flow does.
        record.submitted_at = timezone.now()
        record.save(update_fields=("submitted_at", "updated_at"))
        self.client.force_authenticate(self.invitee_user)

        detail = self.client.get(reverse("customer-property-detail", args=(self.property.id,)))
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["property"]["can_view_measurements"])
        self.assertEqual(len(detail.data["measurement_records"]), 1)
        self.assertEqual(len(detail.data["surfaces"]), 1)

        contact.access_level = PropertyContact.AccessLevel.VIEW_ONLY
        contact.save(update_fields=("access_level", "updated_at"))
        restricted = self.client.get(reverse("customer-property-detail", args=(self.property.id,)))
        pdf = self.client.get(reverse("customer-property-measurement-pdf", args=(self.property.id,)))
        self.assertEqual(restricted.status_code, 200)
        self.assertFalse(restricted.data["property"]["can_view_measurements"])
        self.assertEqual(restricted.data["measurement_records"], [])
        self.assertEqual(restricted.data["surfaces"], [])
        self.assertEqual(pdf.status_code, 403)

    def test_primary_transfer_demotes_old_primary_and_audits(self):
        target = PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.TENANT,
        )
        self.client.force_authenticate(self.primary_user)
        response = self.client.post(
            reverse("property-contact-action", args=(self.property.id, "transfer-primary")),
            {"contact_id": target.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        target.refresh_from_db()
        original = PropertyContact.objects.get(property=self.property, customer=self.primary_customer)
        self.assertFalse(original.is_primary)
        self.assertEqual(original.role, PropertyContact.Role.OWNER)
        self.assertTrue(target.is_primary)
        self.assertEqual(target.role, PropertyContact.Role.PRIMARY)
        self.assertTrue(PropertyAccessAudit.objects.filter(
            property=self.property, action="PRIMARY_CONTACT_TRANSFERRED",
        ).exists())

    def test_primary_must_transfer_before_leaving_and_can_leave_afterward(self):
        PropertyContact.objects.create(
            property=self.property,
            customer=self.invitee_customer,
            role=PropertyContact.Role.TENANT,
        )
        leave_url = reverse("property-contact-action", args=(self.property.id, "leave"))
        self.client.force_authenticate(self.primary_user)
        blocked = self.client.post(leave_url)
        self.assertEqual(blocked.status_code, 409)

        target = PropertyContact.objects.get(property=self.property, customer=self.invitee_customer)
        transfer = self.client.post(
            reverse("property-contact-action", args=(self.property.id, "transfer-primary")),
            {"contact_id": target.id},
            format="json",
        )
        self.assertEqual(transfer.status_code, 200)
        left = self.client.post(leave_url)
        self.assertEqual(left.status_code, 200, left.data)
        self.assertFalse(PropertyContact.objects.filter(
            property=self.property, customer=self.primary_customer,
        ).exists())
