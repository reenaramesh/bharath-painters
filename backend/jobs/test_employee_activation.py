from urllib.parse import urlsplit

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import BharathUser


class InHouseEmployeeActivationTests(TestCase):
    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000911",
            password="contractor-password",
            role=BharathUser.Roles.CONTRACTOR,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.contractor)

    def create_employee(self):
        return self.client.post(
            reverse("contractor-create-applicator"),
            {
                "name": "Ravi Painter",
                "mobile": "9000000912",
                "employment_type": "IN_HOUSE",
                "joined_on": "2026-10-17",
                "salary_basis": "MONTHLY",
                "salary_amount": "22000",
            },
            format="json",
        )

    def test_in_house_employee_is_created_without_password_and_gets_activation_link(self):
        response = self.create_employee()

        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn("credentials", response.data)
        self.assertIn("activation_url", response.data)
        self.assertTrue(response.data["activation_url"].startswith("http"))
        employee = BharathUser.objects.get(mobile="+919000000912")
        self.assertFalse(employee.has_usable_password())
        self.assertEqual(employee.contractor_teams.get().contractor, self.contractor)

    def test_in_house_employee_saves_contractor_scoped_workforce_details(self):
        response = self.client.post(
            reverse("contractor-create-applicator"),
            {
                "name": "Ravi Painter",
                "mobile": "9000000912",
                "employment_type": "IN_HOUSE",
                "joined_on": "2026-10-17",
                "salary_basis": "MONTHLY",
                "salary_amount": "22000",
                "trade": "ELECTRICIAN",
                "job_title": "FIELD_OFFICER",
                "emergency_contact_number": "9000000999",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        employee_data = response.data["member"]
        self.assertEqual(employee_data["trade"], "ELECTRICIAN")
        self.assertEqual(employee_data["job_title"], "FIELD_OFFICER")
        self.assertEqual(employee_data["emergency_contact_number"], "9000000999")
        self.assertTrue(employee_data["employee_code"].startswith("BPE-"))

        membership_id = employee_data["membership_id"]
        directory = self.client.get(reverse("in-house-applicator-list"))
        self.assertEqual(directory.status_code, 200)
        self.assertEqual(directory.data[0]["trade"], "ELECTRICIAN")
        detail = self.client.get(reverse("in-house-applicator-detail", args=(membership_id,)))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["job_title"], "FIELD_OFFICER")

        update = self.client.patch(
            reverse("in-house-applicator-detail", args=(membership_id,)),
            {"trade": "CARPENTER", "job_title": "SUPERVISOR", "emergency_contact_number": "9000000998"},
            format="json",
        )
        self.assertEqual(update.status_code, 200, update.data)
        updated = self.client.get(reverse("in-house-applicator-detail", args=(membership_id,)))
        self.assertEqual(updated.data["trade"], "CARPENTER")
        self.assertEqual(updated.data["job_title"], "SUPERVISOR")
        self.assertEqual(updated.data["emergency_contact_number"], "9000000998")

    def test_employee_sets_password_once_from_activation_link(self):
        created = self.create_employee()
        token = urlsplit(created.data["activation_url"]).path.rstrip("/").split("/")[-1]

        self.client.force_authenticate(user=None)
        preview = self.client.get(reverse("in-house-employee-activation", args=(token,)))
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["name"], "Ravi Painter")

        activated = self.client.post(
            reverse("in-house-employee-activation", args=(token,)),
            {"password": "Ravi-Strong-Pass-2026", "confirm_password": "Ravi-Strong-Pass-2026"},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)
        employee = BharathUser.objects.get(mobile="+919000000912")
        self.assertTrue(employee.check_password("Ravi-Strong-Pass-2026"))
        self.assertEqual(
            self.client.post(
                reverse("in-house-employee-activation", args=(token,)),
                {"password": "Another-Strong-Pass-2026", "confirm_password": "Another-Strong-Pass-2026"},
                format="json",
            ).status_code,
            410,
        )

    def test_activation_requires_matching_strong_password_and_unknown_contractors_cannot_create_employee(self):
        response = self.create_employee()
        token = urlsplit(response.data["activation_url"]).path.rstrip("/").split("/")[-1]
        self.client.force_authenticate(user=None)
        invalid = self.client.post(
            reverse("in-house-employee-activation", args=(token,)),
            {"password": "short", "confirm_password": "different"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        weak = self.client.post(
            reverse("in-house-employee-activation", args=(token,)),
            {"password": "short", "confirm_password": "short"},
            format="json",
        )
        self.assertEqual(weak.status_code, 400)
        employee = BharathUser.objects.get(mobile="+919000000912")
        self.assertFalse(employee.has_usable_password())

        self.client.force_authenticate(BharathUser.objects.create_user(mobile="9000000913", password="p", role=BharathUser.Roles.CUSTOMER))
        forbidden = self.client.post(reverse("contractor-create-applicator"), {"name": "Other", "mobile": "9000000914", "employment_type": "IN_HOUSE"}, format="json")
        self.assertEqual(forbidden.status_code, 403)

    def test_flexible_painter_referral_keeps_its_existing_credential_response(self):
        response = self.client.post(
            reverse("contractor-create-applicator"),
            {"name": "Flexible Painter", "mobile": "9000000915", "employment_type": "FLEXIBLE", "password": "Existing-Flow-2026"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["credentials"]["password"], "Existing-Flow-2026")
        painter = BharathUser.objects.get(mobile="+919000000915")
        self.assertTrue(painter.check_password("Existing-Flow-2026"))
