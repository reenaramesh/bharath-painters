"""Booking mutations authorize before expiration and respect running assignments."""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import ApplicatorBooking, WorkSchedulePainter
from .test_audit_hiring import HiringFixture


class BookingActionAuditTests(HiringFixture, APITestCase):
    def booking(self, **changes):
        values = dict(contractor=self.contractors[1], applicator=self.painter,
                      start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=2),
                      work_type='Paint', pincode='560001')
        values.update(changes)
        return ApplicatorBooking.objects.create(**values)

    def action(self, booking, action):
        return self.client.patch(reverse('applicator-booking-action', args=[booking.pk]),
                                 {'action': action}, format='json')

    def test_unrelated_contractor_cannot_expire_another_booking(self):
        booking = self.booking(start_date=timezone.localdate() - timedelta(days=1))
        before = booking.updated_at
        self.client.force_authenticate(self.contractors[0])
        self.assertEqual(self.action(booking, 'CANCEL').status_code, 403)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'PENDING')
        self.assertEqual(booking.updated_at, before)

    def test_accept_rejects_overlapping_running_schedule(self):
        booking = self.booking()
        schedule = self.schedules[0]
        schedule.status = 'IN_PROGRESS'
        schedule.save(update_fields=['status'])
        WorkSchedulePainter.objects.create(schedule=schedule, painter=self.painter, status='IN_PROGRESS')
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.action(booking, 'ACCEPT').status_code, 400)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'PENDING')

    def test_nonoverlapping_booking_accepts_and_owner_can_close_expired_booking(self):
        booking = self.booking(start_date=timezone.localdate() + timedelta(days=4),
                               end_date=timezone.localdate() + timedelta(days=5))
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.action(booking, 'ACCEPT').status_code, 200)
        expired = self.booking(start_date=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.action(expired, 'ACCEPT').status_code, 400)
        expired.refresh_from_db()
        self.assertEqual(expired.status, 'CLOSED')
