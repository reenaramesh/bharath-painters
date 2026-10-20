from io import BytesIO

from django.urls import reverse
from openpyxl import load_workbook
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import Customer


class AdminPeopleExportTests(APITestCase):
    def setUp(self):
        self.admin = BharathUser.objects.create_user(mobile="9088822001", role="ADMIN")
        self.owner = BharathUser.objects.create_user(mobile="9088822002", role="CONTRACTOR", first_name="Owner")
        self.ownerless = Customer.objects.create(name="Independent customer", mobile="9088822003")
        self.owned = Customer.objects.create(name="Owned customer", mobile="9088822004", contractor=self.owner)

    def test_admin_export_preserves_customers_without_contractor(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse("admin-people-export"))
        self.assertEqual(response.status_code, 200)
        workbook = load_workbook(BytesIO(response.content), read_only=True)
        try:
            rows = {row[1]: row for row in list(workbook["Customers"].values)[1:]}
            self.assertEqual(set(rows), {self.ownerless.name, self.owned.name})
            self.assertEqual(rows[self.ownerless.name][9:11], (None, None))
            self.assertEqual(rows[self.owned.name][9], "Owner")
        finally:
            workbook.close()
        self.ownerless.refresh_from_db()
        self.assertIsNone(self.ownerless.contractor_id)

    def test_nonadmin_roles_cannot_export_people(self):
        for role in ["CONTRACTOR", "CUSTOMER", "PAINTER", "SUPPORT"]:
            with self.subTest(role=role):
                user = BharathUser(role=role, pk=self.owner.pk)
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(reverse("admin-people-export")).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("admin-people-export")).status_code, 401)
