from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import (
    Customer,
    Property,
    ProjectScope,
    Quotation,
    ServiceCategory,
    Unit,
    WorkDescription,
)


class ProjectScopeApiTests(APITestCase):
    """The scope list is what the outsourcing flow shares, so it has to stay
    addressable, correctly priced and locked to one project."""

    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000301", password="Pass123!", role="CONTRACTOR", first_name="Scope"
        )
        self.other_contractor = BharathUser.objects.create_user(
            mobile="9000000302", password="Pass123!", role="CONTRACTOR", first_name="Other"
        )
        self.customer_user = BharathUser.objects.create_user(
            mobile="9000000303", password="Pass123!", role="CUSTOMER", first_name="Buyer"
        )
        self.customer = Customer.objects.create(
            contractor=self.contractor, portal_user=self.customer_user, name="Buyer", mobile="9740000301"
        )
        self.property = Property.objects.create(
            customer=self.customer, contractor=self.contractor, name="Sunrise Flats"
        )
        self.quotation = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="Q-SCOPE-0001",
        )
        self.painting = ServiceCategory.objects.create(name="Painting")
        self.electrical = ServiceCategory.objects.create(name="Electrical")
        self.sqft = Unit.objects.create(name="sq ft")
        self.painting.units.add(self.sqft)
        self.painting_work = WorkDescription.objects.create(
            name="Putty + primer + paint", service_category=self.painting
        )
        self.electrical_work = WorkDescription.objects.create(
            name="Switch wiring", service_category=self.electrical
        )
        self.client.force_authenticate(self.contractor)

    def create_scope(self, **overrides):
        payload = {
            "quotation": self.quotation.id,
            "title": "Interior wall painting",
            "category": self.painting.id,
            "quantity": "1200",
            "unit_rate": "38.50",
        }
        payload.update(overrides)
        return self.client.post(reverse("project-scope-list-create"), payload, format="json")

    def test_create_assigns_reference_and_calculates_amount(self):
        response = self.create_scope()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["reference"], "SC-0001")
        self.assertEqual(response.data["amount"], "46200.00")
        self.assertEqual(response.data["sort_order"], 10)

    def test_second_scope_continues_the_reference_sequence(self):
        self.create_scope()
        response = self.create_scope(title="Electrical points")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["reference"], "SC-0002")
        self.assertEqual(response.data["sort_order"], 20)

    def test_create_requires_a_title(self):
        response = self.create_scope(title="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("title", response.data)

    def test_create_requires_a_service(self):
        response = self.create_scope(category=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)

    def test_create_rejects_another_contractors_quotation(self):
        self.client.force_authenticate(self.other_contractor)
        response = self.create_scope()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("quotation", response.data)

    def test_sub_service_must_belong_to_the_service(self):
        response = self.create_scope(work_description=self.electrical_work.id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("work_description", response.data)

    def test_matching_sub_service_is_accepted_and_snapshotted(self):
        response = self.create_scope(work_description=self.painting_work.id)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["work_description_name"], "Putty + primer + paint")
        scope = ProjectScope.objects.get(pk=response.data["id"])
        self.assertEqual(scope.work_description_snapshot, "Putty + primer + paint")

    def test_unit_must_be_offered_by_the_service(self):
        response = self.create_scope(unit=Unit.objects.create(name="litre").id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unit", response.data)

    def test_update_recalculates_the_amount(self):
        created = self.create_scope().data
        response = self.client.patch(
            reverse("project-scope-detail", args=[created["id"]]),
            {"quantity": "1000"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["amount"], "38500.00")

    def test_scope_cannot_be_moved_to_another_quotation(self):
        created = self.create_scope().data
        second = Quotation.objects.create(
            contractor=self.contractor,
            customer=self.customer,
            property=self.property,
            quotation_number="Q-SCOPE-0002",
        )
        response = self.client.patch(
            reverse("project-scope-detail", args=[created["id"]]),
            {"quotation": second.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("quotation", response.data)
        self.assertEqual(ProjectScope.objects.get(pk=created["id"]).quotation_id, self.quotation.id)

    def test_delete_removes_the_scope(self):
        created = self.create_scope().data
        response = self.client.delete(reverse("project-scope-detail", args=[created["id"]]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectScope.objects.filter(pk=created["id"]).exists())

    def test_list_is_scoped_to_the_quotation(self):
        self.create_scope()
        self.create_scope(title="Terrace work")
        response = self.client.get(
            reverse("project-scope-list-create"), {"quotation": self.quotation.id}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_hides_another_contractors_scopes(self):
        self.create_scope()
        self.client.force_authenticate(self.other_contractor)
        response = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_customer_cannot_read_scopes(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_shared_work_orders_are_reported_to_the_project_owner(self):
        from accounts.models import ProviderProfile
        from outsourcing.models import SubcontractWorkOrder, SubcontractWorkOrderScope

        receiver = BharathUser.objects.create_user(
            mobile="9000000304", password="Pass123!", role="CONTRACTOR", first_name="Partner"
        )
        ProviderProfile.objects.get_or_create(user=self.contractor)
        ProviderProfile.objects.get_or_create(user=receiver)
        scope = ProjectScope.objects.create(
            quotation=self.quotation,
            title="Interior wall painting",
            category=self.painting,
            unit=self.sqft,
            quantity=Decimal("1200"),
            unit_rate=Decimal("38.50"),
        )
        work_order = SubcontractWorkOrder.objects.create(
            quotation=self.quotation,
            main_contractor=self.contractor,
            receiving_contractor=receiver,
            project_title="Interior wall painting",
        )
        SubcontractWorkOrderScope.objects.create(work_order=work_order, project_scope=scope)

        response = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["shared_work_orders"] for row in response.data],
            [[work_order.id]],
        )
        self.assertEqual(Decimal(str(response.data[0]["amount"])), Decimal("46200.00"))

    def test_unrelated_contractor_never_learns_the_scope_exists(self):
        from outsourcing.models import SubcontractWorkOrder, SubcontractWorkOrderScope

        receiver = BharathUser.objects.create_user(
            mobile="9000000305", password="Pass123!", role="CONTRACTOR", first_name="Partner"
        )
        scope = ProjectScope.objects.create(
            quotation=self.quotation,
            title="Interior wall painting",
            category=self.painting,
            unit=self.sqft,
            quantity=Decimal("1200"),
            unit_rate=Decimal("38.50"),
        )
        work_order = SubcontractWorkOrder.objects.create(
            quotation=self.quotation,
            main_contractor=self.contractor,
            receiving_contractor=receiver,
            project_title="Interior wall painting",
        )
        SubcontractWorkOrderScope.objects.create(work_order=work_order, project_scope=scope)

        self.client.force_authenticate(receiver)
        response = self.client.get(reverse("project-scope-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])