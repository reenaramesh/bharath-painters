from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import BharathUser
from .models import BillingPlan, PackageRequest, Subscription


class BillingLifecycleTests(APITestCase):
    def setUp(self):
        self.admin = BharathUser.objects.create_user(mobile="8111111111", password="Test@1234", role="ADMIN", is_staff=True)
        self.contractor = BharathUser.objects.create_user(mobile="8222222222", password="Test@1234", role="CONTRACTOR", is_verified=True, verification_status="VERIFIED")
        self.plan = BillingPlan.objects.create(name="Monthly Pro", audience="CONTRACTOR", billing_cycle="MONTHLY", price="999", quotation_limit=20, employee_limit=5)

    def test_paid_plan_payment_confirmation_and_receipt(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post("/api/billing/contractor-packages/", {"plan_id": self.plan.id, "start_date": timezone.localdate()}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = PackageRequest.objects.get(pk=response.data["request"]["id"])
        self.assertEqual(order.status, PackageRequest.Status.AWAITING_PAYMENT)
        response = self.client.post(f"/api/billing/package-requests/{order.id}/payment/", {"payment_mode": "UPI", "payment_reference": "UPI-TEST-1"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.admin)
        response = self.client.patch("/api/billing/package-requests/", {"request_id": order.id, "decision": "APPROVED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PackageRequest.PaymentStatus.CONFIRMED)
        self.assertTrue(order.receipt_number)
        self.assertTrue(Subscription.objects.filter(user=self.contractor, plan=self.plan, is_active=True).exists())

    def test_user_selects_subscription_months_and_dates_are_calculated(self):
        plan = BillingPlan.objects.create(name="Basic", audience="CONTRACTOR", billing_cycle="MONTHLY", price="100")
        self.client.force_authenticate(self.contractor)
        response = self.client.post("/api/billing/contractor-packages/", {"plan_id": plan.id, "duration_months": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request = PackageRequest.objects.get(pk=response.data["request"]["id"])
        self.assertEqual(request.duration_months, 3)
        self.assertEqual(request.amount, 300)
        self.assertEqual(request.requested_start_date, timezone.localdate())
        self.assertGreater(request.requested_end_date, request.requested_start_date)

    def test_discount_is_applied_to_each_subscription_month(self):
        plan = BillingPlan.objects.create(name="Discount Plan", audience="CONTRACTOR", billing_cycle="MONTHLY", price="1500", discount_percentage="20")
        self.client.force_authenticate(self.contractor)
        response = self.client.post("/api/billing/contractor-packages/", {"plan_id": plan.id, "duration_months": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request = PackageRequest.objects.get(pk=response.data["request"]["id"])
        self.assertEqual(request.amount, 3600)

    def test_admin_cannot_save_discount_above_one_hundred_percent(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/billing/plans/{self.plan.id}/", {"discount_percentage": 101}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_subscription_falls_back_to_free_plan(self):
        Subscription.objects.create(user=self.contractor, plan=self.plan, start_date=timezone.localdate()-timedelta(days=40), end_date=timezone.localdate()-timedelta(days=10), is_active=True)
        self.client.force_authenticate(self.contractor)
        response = self.client.get("/api/billing/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["plan"]["billing_cycle"], BillingPlan.Cycle.FREE)
        self.assertFalse(Subscription.objects.get(user=self.contractor, plan=self.plan).is_active)
