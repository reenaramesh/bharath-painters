"""Regression evidence for manual schedule assignment overlap checks."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
import time
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.models import BharathUser
from quotations.models import Customer, Property, Quotation
from .models import ContractorApplicatorTeam, Job, JobApplication, WorkSchedule, WorkSchedulePainter


class HiringFixture:
    def setUp(self):
        verified = {'is_verified': True, 'verification_status': 'VERIFIED'}
        self.contractors = [BharathUser.objects.create_user(mobile=f'911118000{i}', role='CONTRACTOR', **verified) for i in [1, 2]]
        self.painter = BharathUser.objects.create_user(mobile='9111180003', role='PAINTER', **verified)
        self.schedules = []
        for index, contractor in enumerate(self.contractors, 1):
            ContractorApplicatorTeam.objects.create(contractor=contractor, painter=self.painter, employment_type='FLEXIBLE')
            customer = Customer.objects.create(contractor=contractor, name='Audit hiring customer', mobile=f'911118001{index}')
            prop = Property.objects.create(contractor=contractor, customer=customer, name='Audit hiring site')
            quotation = Quotation.objects.create(contractor=contractor, customer=customer, property=prop,
                                                quotation_number=f'Q-HIRING-AUDIT-{index}', status='SCHEDULED')
            self.schedules.append(WorkSchedule.objects.create(
                quotation=quotation, proposed_by=contractor, proposed_start_date=timezone.localdate(),
                proposed_end_date=timezone.localdate() + timedelta(days=2), status='CONFIRMED',
                customer_accepted=True, contractor_accepted=True, payment_status='CONFIRMED'))


class ManualHiringOverlapAuditTests(HiringFixture, APITestCase):
    def test_manual_assignment_rejects_worker_on_overlapping_in_progress_schedule(self):
        active = self.schedules[0]
        active.status = 'IN_PROGRESS'
        active.save(update_fields=['status'])
        WorkSchedulePainter.objects.create(schedule=active, painter=self.painter, status='IN_PROGRESS')
        self.client.force_authenticate(self.contractors[1])
        response = self.client.put(reverse('work-schedule-painters', args=[self.schedules[1].pk]),
                                   {'painters': [self.painter.pk]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(WorkSchedulePainter.objects.filter(schedule=self.schedules[1]).exists())


class RescheduleConfirmationAuditTests(HiringFixture, APITestCase):
    def test_response_cannot_reset_started_completed_or_cancelled_schedule(self):
        item = self.schedules[0]
        self.client.force_authenticate(self.contractors[0])
        for state in ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']:
            with self.subTest(state=state):
                item.status = state
                item.save(update_fields=['status'])
                response = self.client.post(reverse('work-schedule-accept', args=[item.pk]), {}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                item.refresh_from_db()
                self.assertEqual(item.status, state)

    def proposal(self, other_status, offset):
        active, changed = self.schedules
        active.status = other_status
        active.save(update_fields=['status'])
        WorkSchedulePainter.objects.create(schedule=active, painter=self.painter, status='ACCEPTED')
        changed.proposed_start_date = timezone.localdate() + timedelta(days=10)
        changed.proposed_end_date = timezone.localdate() + timedelta(days=12)
        changed.save(update_fields=['proposed_start_date', 'proposed_end_date'])
        assignment = WorkSchedulePainter.objects.create(schedule=changed, painter=self.painter,
                                                        status='ACCEPTED', agreed_wage=1200)
        customer_user = BharathUser.objects.create_user(mobile='9111180004', role='CUSTOMER')
        customer = changed.quotation.customer
        customer.portal_user = customer_user
        customer.save(update_fields=['portal_user'])
        self.client.force_authenticate(self.contractors[1])
        response = self.client.post(reverse('work-schedule-list'),
                                    {'quotation': changed.quotation_id,
                                     'start_date': str(timezone.localdate() + timedelta(days=offset)),
                                     'end_date': str(timezone.localdate() + timedelta(days=offset + 2)),
                                     'reason': 'Audit revised dates'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        changed.refresh_from_db()
        self.assertEqual(changed.status, 'PENDING')
        self.assertEqual(changed.reschedule_history.count(), 1)
        self.client.force_authenticate(customer_user)
        return changed, assignment

    def assert_rejected_confirmation(self, other_status):
        changed, assignment = self.proposal(other_status, 1)
        response = self.client.post(reverse('work-schedule-accept', args=[changed.pk]), {}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        changed.refresh_from_db()
        self.assertEqual(changed.status, 'PENDING')
        self.assertFalse(changed.customer_accepted)
        self.assertTrue(changed.contractor_accepted)
        self.assertEqual(changed.reschedule_history.count(), 1)
        assignment.refresh_from_db()
        self.assertEqual((assignment.status, assignment.agreed_wage), ('ACCEPTED', 1200))

    def test_reschedule_final_confirmation_rejects_confirmed_overlap(self):
        self.assert_rejected_confirmation('CONFIRMED')

    def test_reschedule_final_confirmation_rejects_in_progress_overlap(self):
        self.assert_rejected_confirmation('IN_PROGRESS')

    def test_nonoverlapping_reschedule_confirms_and_preserves_roster_history(self):
        changed, assignment = self.proposal('IN_PROGRESS', 20)
        response = self.client.post(reverse('work-schedule-accept', args=[changed.pk]), {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        changed.refresh_from_db()
        self.assertEqual(changed.status, 'CONFIRMED')
        self.assertTrue(changed.customer_accepted)
        self.assertTrue(changed.contractor_accepted)
        self.assertEqual(changed.reschedule_history.count(), 1)
        self.assertEqual(changed.painter_assignments.get().pk, assignment.pk)


class ManualHiringConcurrencyAuditTests(HiringFixture, TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_competing_pending_schedule_confirmations_cannot_double_book_worker(self):
        for schedule in self.schedules:
            schedule.status = 'PENDING'
            schedule.contractor_accepted = False
            schedule.save(update_fields=['status', 'contractor_accepted'])
            WorkSchedulePainter.objects.create(schedule=schedule, painter=self.painter, status='ACCEPTED')
        gate = Barrier(2)

        def confirm(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.contractors[index])
                gate.wait(timeout=10)
                return client.post(reverse('work-schedule-accept', args=[self.schedules[index].pk]), {}, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(confirm, range(2)))
        self.assertEqual(sorted(responses), [200, 400])
        self.assertEqual(WorkSchedule.objects.filter(pk__in=[s.pk for s in self.schedules], status='CONFIRMED').count(), 1)
        self.assertEqual(WorkSchedule.objects.filter(pk__in=[s.pk for s in self.schedules], contractor_accepted=False).count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_manual_and_hiring_outcome_share_worker_serialization(self):
        job = Job.objects.create(contractor=self.contractors[0], title='Audit hire', service_type='Painting',
                                 location='Audit site', city='Audit city', job_type='DAILY', daily_wage=1000,
                                 start_date=timezone.localdate(), estimated_days=3, status='PARTIALLY_FILLED')
        application = JobApplication.objects.create(job=job, painter=self.painter, status='ACCEPTED')
        gate = Barrier(2)
        original_create = WorkSchedulePainter.objects.bulk_create
        original_save = WorkSchedulePainter.save

        def slower_create(*args, **kwargs):
            time.sleep(0.25)
            return original_create(*args, **kwargs)

        def slower_save(assignment, *args, **kwargs):
            time.sleep(0.25)
            return original_save(assignment, *args, **kwargs)

        def assign(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.contractors[index])
                gate.wait(timeout=10)
                if index == 0:
                    return client.post(reverse('hiring-outcome-schedule-assignment', args=['application', application.pk]),
                                       {'schedule_id': self.schedules[0].pk}, format='json').status_code
                return client.put(reverse('work-schedule-painters', args=[self.schedules[1].pk]),
                                  {'painters': [self.painter.pk]}, format='json').status_code
            finally:
                close_old_connections()

        with patch.object(WorkSchedulePainter.objects, 'bulk_create', slower_create), patch.object(WorkSchedulePainter, 'save', slower_save):
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(assign, range(2)))
        self.assertEqual(sum(code in {200, 201} for code in responses), 1, responses)
        self.assertEqual(sum(code in {400, 409} for code in responses), 1, responses)
        self.assertEqual(WorkSchedulePainter.objects.filter(painter=self.painter).count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_different_contractors_cannot_concurrently_double_book_flexible_worker(self):
        gate = Barrier(2)
        original_bulk_create = WorkSchedulePainter.objects.bulk_create

        def slower_bulk_create(*args, **kwargs):
            # Widen the real conflict-check/insert window without replacing any
            # validation or write. A shared worker lock must close that window.
            time.sleep(0.25)
            return original_bulk_create(*args, **kwargs)

        def assign(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.contractors[index])
                gate.wait(timeout=10)
                return client.put(reverse('work-schedule-painters', args=[self.schedules[index].pk]),
                                  {'painters': [self.painter.pk]}, format='json').status_code
            finally:
                close_old_connections()

        with patch.object(WorkSchedulePainter.objects, 'bulk_create', slower_bulk_create):
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(assign, range(2)))
        self.assertEqual(sorted(responses), [200, 400])
        self.assertEqual(WorkSchedulePainter.objects.filter(painter=self.painter).count(), 1)
