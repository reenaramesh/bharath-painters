from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from .models import ApplicatorBooking


class BookingReadPermissionsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.contractor = BharathUser.objects.create_user(
            mobile="9777700901", role=BharathUser.Roles.CONTRACTOR,
        )
        cls.painter = BharathUser.objects.create_user(
            mobile="9777700902", role=BharathUser.Roles.PAINTER,
        )
        cls.readers = {
            role: BharathUser.objects.create_user(mobile=f"977770090{index}", role=role)
            for index, role in enumerate(
                (BharathUser.Roles.CUSTOMER, BharathUser.Roles.ADMIN, BharathUser.Roles.SUPPORT),
                start=3,
            )
        }
        today = timezone.localdate()
        cls.expired_pending = ApplicatorBooking.objects.create(
            contractor=cls.contractor, applicator=cls.painter,
            work_type="Painting", pincode="560001",
            start_date=today - timedelta(days=2), end_date=today + timedelta(days=1),
        )
        cls.expired_confirmed = ApplicatorBooking.objects.create(
            contractor=cls.contractor, applicator=cls.painter,
            work_type="Painting", pincode="560001",
            start_date=today - timedelta(days=3), end_date=today - timedelta(days=1),
            status=ApplicatorBooking.Status.CONFIRMED,
        )

    def assert_forbidden_read_preserves_bookings(self, role):
        before = list(ApplicatorBooking.objects.order_by("pk").values(
            "pk", "status", "updated_at", "contractor_seen_response",
        ))
        client = APIClient()
        client.force_authenticate(self.readers[role])

        response = client.get(reverse("applicator-booking-list"), {"mark_seen": "1"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(list(ApplicatorBooking.objects.order_by("pk").values(
            "pk", "status", "updated_at", "contractor_seen_response",
        )), before)

    def test_customer_cannot_close_expired_bookings_by_reading(self):
        self.assert_forbidden_read_preserves_bookings(BharathUser.Roles.CUSTOMER)

    def test_admin_cannot_close_expired_bookings_by_reading(self):
        self.assert_forbidden_read_preserves_bookings(BharathUser.Roles.ADMIN)

    def test_support_cannot_close_expired_bookings_by_reading(self):
        self.assert_forbidden_read_preserves_bookings(BharathUser.Roles.SUPPORT)

    def test_marketplace_painter_still_closes_expired_bookings(self):
        client = APIClient()
        client.force_authenticate(self.painter)

        response = client.get(reverse("applicator-booking-list"))

        self.assertEqual(response.status_code, 200)
        self.expired_pending.refresh_from_db()
        self.expired_confirmed.refresh_from_db()
        self.assertEqual(self.expired_pending.status, ApplicatorBooking.Status.CLOSED)
        self.assertEqual(self.expired_confirmed.status, ApplicatorBooking.Status.CLOSED)
