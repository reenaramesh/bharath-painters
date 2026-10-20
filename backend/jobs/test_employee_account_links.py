from urllib.parse import urlsplit
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import time

from django.core import signing
from django.test import TestCase
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.db import connections, close_old_connections, transaction
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import BharathUser, PainterProfile
from jobs.models import ContractorApplicatorTeam
from jobs.views import IN_HOUSE_EMPLOYEE_ACTIVATION_SALT


class EmployeeAccountLinkTests(TestCase):
    def setUp(self):
        self.flags = {"is_verified": True, "verification_status": "VERIFIED"}
        self.owner = self.user("9011800001", "CONTRACTOR", "Owner")
        self.other = self.user("9011800002", "CONTRACTOR", "Other")
        self.employee = self.user("9011800003", "PAINTER", "Pending", password=None)
        self.member = ContractorApplicatorTeam.objects.create(
            contractor=self.owner, painter=self.employee, employment_type="IN_HOUSE",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.issue_url = f"/api/jobs/in-house-applicators/{self.member.pk}/activation-link/"
        self.search_url = "/api/jobs/in-house-applicators/registered-search/"

    def user(self, mobile, role, name, password="Existing-Password-2026"):
        return BharathUser.objects.create_user(
            mobile=mobile, role=role, first_name=name, password=password, **self.flags,
        )

    def token_route(self, url):
        token = urlsplit(url).path.rstrip("/").split("/")[-1]
        return reverse("in-house-employee-activation", args=(token,))

    def test_list_and_detail_distinguish_registration_from_active_employment(self):
        for route in (reverse("in-house-applicator-list"), reverse("in-house-applicator-detail", args=(self.member.pk,))):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            row = response.data[0] if isinstance(response.data, list) else response.data
            self.assertEqual(row.get("registration_status"), "UNREGISTERED")
            self.assertIs(row.get("can_resend_activation"), True)
            self.assertIs(row["is_active"], True)

    def test_reissue_setup_then_register_preserves_identity_and_prevents_password_reset(self):
        counts = (BharathUser.objects.count(), ContractorApplicatorTeam.objects.count())
        first = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(first.status_code, 200, getattr(first, "data", None))
        self.assertEqual(first["Cache-Control"], "no-store")
        again = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(counts, (BharathUser.objects.count(), ContractorApplicatorTeam.objects.count()))
        activation = self.token_route(again.data["activation_url"])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(activation).status_code, 200)
        registered = self.client.post(activation, {"password": "Employee-Strong-2026", "confirm_password": "Employee-Strong-2026"}, format="json")
        self.assertEqual(registered.status_code, 200, registered.data)
        self.assertEqual(self.client.get(activation).status_code, 410)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 409)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.check_password("Employee-Strong-2026"))
        detail = self.client.get(reverse("in-house-applicator-detail", args=(self.member.pk,)))
        self.assertEqual(detail.data["registration_status"], "REGISTERED")
        self.assertIs(detail.data["can_resend_activation"], False)

    def test_expired_link_can_be_reissued_without_changing_the_employee(self):
        with patch("django.core.signing.time.time", return_value=time.time() - 8 * 86400):
            old_token = signing.dumps({"user_id": self.employee.pk, "membership_id": self.member.pk}, salt=IN_HOUSE_EMPLOYEE_ACTIVATION_SALT)
        self.assertEqual(self.client.get(reverse("in-house-employee-activation", args=(old_token,))).status_code, 410)
        issued = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(issued.status_code, 200, getattr(issued, "data", None))
        self.assertEqual(self.client.get(self.token_route(issued.data["activation_url"])).status_code, 200)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.has_usable_password())

    def test_only_verified_owner_can_issue_links_or_search(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 404)
        for actor in (self.employee, self.user("9011800010", "CUSTOMER", "Customer")):
            self.client.force_authenticate(actor)
            self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 403)
            self.assertEqual(self.client.get(self.search_url, {"search": "Painter"}).status_code, 403)
        self.owner.is_verified = False
        self.owner.save(update_fields=("is_verified",))
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 403)
        self.assertEqual(self.client.get(self.search_url, {"search": "Painter"}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 401)

    def test_removed_disabled_and_unverified_employees_cannot_receive_links(self):
        for target, field in ((self.member, "is_active"), (self.employee, "is_active"), (self.employee, "is_verified")):
            with self.subTest(field=field, model=type(target).__name__):
                setattr(target, field, False)
                target.save(update_fields=(field,))
                rejected = self.client.post(self.issue_url, {}, format="json")
                self.assertEqual(rejected.status_code, 409, getattr(rejected, "data", None))
                row = self.client.get(reverse("in-house-applicator-list")).data[0]
                self.assertIs(row["can_resend_activation"], False)
                setattr(target, field, True)
                target.save(update_fields=(field,))

    def test_flexible_membership_is_not_an_employee_activation_target(self):
        self.member.employment_type = "FLEXIBLE"
        self.member.save(update_fields=("employment_type",))
        self.assertEqual(self.client.post(self.issue_url, {}, format="json").status_code, 404)

    def test_registered_lookup_filters_readiness_and_only_exposes_own_membership(self):
        registered = self.user("9011800020", "PAINTER", "Existing Painter")
        registered.bharath_id = "BP-P-180020"
        registered.save(update_fields=("bharath_id",))
        PainterProfile.objects.create(user=registered, skills="Interior walls", experience_years=4)
        other_membership = ContractorApplicatorTeam.objects.create(contractor=self.other, painter=registered, employment_type="IN_HOUSE", salary_amount=99999)
        inactive = self.user("9011800021", "PAINTER", "Existing disabled")
        inactive.is_active = False
        inactive.save(update_fields=("is_active",))
        unverified = self.user("9011800022", "PAINTER", "Existing unverified")
        unverified.is_verified = False
        unverified.save(update_fields=("is_verified",))
        short = self.client.get(self.search_url, {"search": "Ex"})
        self.assertEqual(short.status_code, 200, getattr(short, "data", None))
        self.assertEqual(short.data, [])
        for query in ("Existing Painter", "9011800020", "BP-P-180020"):
            response = self.client.get(self.search_url, {"search": query})
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual([row["id"] for row in response.data], [registered.pk])
            self.assertIsNone(response.data[0]["employee_membership_id"])
            self.assertNotIn("salary_amount", response.data[0])
        pending = self.client.get(self.search_url, {"search": "Pending"})
        self.assertEqual(pending.data, [])
        before = BharathUser.objects.count()
        linked = self.client.post(reverse("contractor-create-applicator"), {
            "name": "Existing Painter", "mobile": registered.mobile, "employment_type": "IN_HOUSE",
            "job_title": "Supervisor", "trade": "Painter", "salary_basis": "MONTHLY", "salary_amount": "24000",
        }, format="json")
        self.assertEqual(linked.status_code, 201, linked.data)
        self.assertEqual(linked.data["member"]["registration_status"], "REGISTERED")
        self.assertEqual(BharathUser.objects.count(), before)
        search = self.client.get(self.search_url, {"search": "Existing Painter"})
        self.assertEqual(search.data[0]["employee_membership_id"], linked.data["member"]["membership_id"])
        self.assertNotEqual(search.data[0]["employee_membership_id"], other_membership.pk)
        registered.refresh_from_db()
        self.assertTrue(registered.check_password("Existing-Password-2026"))

    def test_registered_search_is_bounded(self):
        for number in range(25):
            self.user(f"9011801{number:03d}", "PAINTER", f"Lookup Painter {number:02d}")
        response = self.client.get(self.search_url, {"search": "Lookup"})
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(len(response.data), 20)


class EmployeeActivationConcurrencyTests(TransactionTestCase):
    setUp = EmployeeAccountLinkTests.setUp
    user = EmployeeAccountLinkTests.user

    @skipUnlessDBFeature("has_select_for_update")
    def test_resend_during_password_setup_uses_identity_then_membership_lock_order(self):
        user_locked, issuer_at_lock = Event(), Event()

        def setup_password():
            close_old_connections()
            try:
                with transaction.atomic():
                    employee = BharathUser.objects.select_for_update().get(pk=self.employee.pk)
                    user_locked.set()
                    if not issuer_at_lock.wait(15):
                        return "issuer never reached a lock"
                    ContractorApplicatorTeam.objects.select_for_update().get(pk=self.member.pk)
                    employee.set_password("Concurrent-Employee-2026")
                    employee.save(update_fields=("password",))
                return 200
            except Exception as error:
                return type(error).__name__
            finally:
                close_old_connections()

        def issue_link():
            close_old_connections()
            try:
                if not user_locked.wait(15):
                    return "password setup never locked identity"

                def observe_lock(execute, sql, params, many, context):
                    locking = "FOR UPDATE" in sql
                    if locking and '"accounts_bharathuser"' in sql:
                        issuer_at_lock.set()
                    result = execute(sql, params, many, context)
                    if locking and '"jobs_contractorapplicatorteam"' in sql:
                        issuer_at_lock.set()
                    return result

                client = APIClient()
                client.force_authenticate(self.owner)
                client.raise_request_exception = False
                with connections["default"].execute_wrapper(observe_lock):
                    return client.post(self.issue_url, {}, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            setup = pool.submit(setup_password)
            issue = pool.submit(issue_link)
            self.assertEqual((setup.result(timeout=25), issue.result(timeout=25)), (200, 409))
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.check_password("Concurrent-Employee-2026"))
