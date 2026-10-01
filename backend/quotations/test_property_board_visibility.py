from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import ContractorCustomerConnection, Customer, Property


class PropertyBoardVisibilityTests(APITestCase):
    def test_contractor_remove_preserves_customer_record_and_other_contractors(self):
        contractor = BharathUser.objects.create_user(
            mobile="9000711001", password="Pass123!", role="CONTRACTOR"
        )
        other_contractor = BharathUser.objects.create_user(
            mobile="9000711002", password="Pass123!", role="CONTRACTOR"
        )
        customer_user = BharathUser.objects.create_user(
            mobile="9000711003", password="Pass123!", role="CUSTOMER"
        )
        customer = Customer.objects.create(
            name="Shared customer", mobile=customer_user.mobile,
            contractor=contractor, portal_user=customer_user,
        )
        first_connection = ContractorCustomerConnection.objects.create(
            customer=customer, contractor=contractor,
            status=ContractorCustomerConnection.Status.CONNECTED,
        )
        second_connection = ContractorCustomerConnection.objects.create(
            customer=customer, contractor=other_contractor,
            status=ContractorCustomerConnection.Status.CONNECTED,
        )
        first_property = Property.objects.create(
            customer=customer, contractor=contractor, connection=first_connection,
            name="First contractor site", address="First address",
        )
        second_property = Property.objects.create(
            customer=customer, contractor=other_contractor, connection=second_connection,
            name="Second contractor site", address="Second address",
        )

        self.client.force_authenticate(contractor)
        response = self.client.delete(reverse("property-detail", args=[first_property.id]))
        self.assertEqual(response.status_code, 204)
        first_property.refresh_from_db()
        self.assertIsNotNone(first_property.contractor_hidden_at)
        self.assertEqual(self.client.get(reverse("property-list-create")).data, [])

        self.client.force_authenticate(other_contractor)
        other_list = self.client.get(reverse("property-list-create"))
        self.assertEqual([item["id"] for item in other_list.data], [second_property.id])
        created = self.client.post(
            reverse("property-list-create"),
            {"customer": customer.id, "name": "New second contractor site", "address": "New address"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)

        self.client.force_authenticate(customer_user)
        customer_list = self.client.get(reverse("customer-property-list"))
        self.assertEqual(customer_list.status_code, 200)
        self.assertEqual(
            {item["id"] for item in customer_list.data},
            {first_property.id, second_property.id, created.data["id"]},
        )
        self.assertEqual(
            self.client.get(reverse("customer-property-detail", args=[first_property.id])).status_code,
            200,
        )
        self.assertTrue(Property.objects.filter(pk=first_property.id).exists())
        customer.refresh_from_db()
        self.assertEqual(customer.name, "Shared customer")
