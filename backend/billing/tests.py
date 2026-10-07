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

    def test_subscription_request_notifies_active_admins_with_direct_link(self):
        from quotations.models import PortalNotification
        second_admin = BharathUser.objects.create_user(mobile="8111111112", password="test", role="ADMIN")
        inactive_admin = BharathUser.objects.create_user(mobile="8111111113", password="test", role="ADMIN", is_active=False)
        self.client.force_authenticate(self.contractor)
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.client.post("/api/billing/contractor-packages/", {"plan_id": self.plan.id}, format="json")
        self.assertEqual(len(callbacks), 2)
        self.assertEqual(response.status_code, 201)
        request_id = response.data["request"]["id"]
        notices = PortalNotification.objects.filter(event_type="SUBSCRIPTION_REQUEST")
        self.assertEqual(set(notices.values_list("recipient_id", flat=True)), {self.admin.id, second_admin.id})
        self.assertFalse(notices.filter(recipient=inactive_admin).exists())
        self.assertEqual(notices.first().link, f"/billing?request={request_id}")
        self.assertEqual(notices.first().actor_id, self.contractor.id)
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/quotations/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.data["unread_count"], 0)
        self.assertTrue(any(item["link"] == f"/billing?request={request_id}" for item in response.data["results"]))

    def test_payment_submission_notifies_admin_but_duplicate_request_does_not(self):
        from quotations.models import PortalNotification
        self.client.force_authenticate(self.contractor)
        response = self.client.post("/api/billing/contractor-packages/", {"plan_id": self.plan.id}, format="json")
        request_id = response.data["request"]["id"]
        repeat = self.client.post("/api/billing/contractor-packages/", {"plan_id": self.plan.id}, format="json")
        self.assertEqual(repeat.status_code, 400)
        self.assertEqual(PortalNotification.objects.filter(event_type="SUBSCRIPTION_REQUEST").count(), 1)
        response = self.client.post(f"/api/billing/package-requests/{request_id}/payment/", {"payment_mode": "UPI", "payment_reference": "TEST-UPI"}, format="json")
        self.assertEqual(response.status_code, 200)
        notice = PortalNotification.objects.get(event_type="SUBSCRIPTION_PAYMENT")
        self.assertEqual(notice.recipient_id, self.admin.id)
        self.assertEqual(notice.link, f"/billing?request={request_id}")
