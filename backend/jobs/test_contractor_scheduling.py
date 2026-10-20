from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from quotations.models import ActivityLog, Customer, Property, Quotation
from .models import ContractorApplicatorTeam, WorkSchedule, WorkSchedulePainter


class ContractorSchedulingTests(TestCase):
    def setUp(self):
        verified = {'is_verified': True, 'verification_status': 'VERIFIED'}
        self.owner = BharathUser.objects.create_user(mobile='9011958001', role='CONTRACTOR', **verified)
        self.other = BharathUser.objects.create_user(mobile='9011958002', role='CONTRACTOR', **verified)
        self.customer_user = BharathUser.objects.create_user(mobile='9011958003', role='CUSTOMER')
        self.painter = BharathUser.objects.create_user(mobile='9011958004', role='PAINTER', **verified)
        self.customer = Customer.objects.create(contractor=self.owner, portal_user=self.customer_user, name='Scheduling customer', mobile='9011958003')
        self.property = Property.objects.create(contractor=self.owner, customer=self.customer, name='Scheduling site')
        self.quote = Quotation.objects.create(contractor=self.owner, customer=self.customer, property=self.property, status='SENT', quotation_number='DIRECT-SCHEDULE-1')
        self.today = timezone.localdate()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse('work-schedule-list')

    def payload(self, **changes):
        data = {'quotation': self.quote.pk, 'start_date': str(self.today), 'end_date': str(self.today + timedelta(days=2)), 'scheduling_mode': 'CONTRACTOR'}
        data.update(changes)
        return data

    def create(self, **changes):
        response = self.client.post(self.url, self.payload(**changes), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return WorkSchedule.objects.get(pk=response.data['id']), response.data

    def test_owner_schedules_unaccepted_quote_without_forging_customer_acceptance(self):
        item, data = self.create()
        self.assertEqual(item.status, 'CONFIRMED')
        self.assertFalse(item.customer_accepted)
        self.assertTrue(item.contractor_accepted)
        self.assertEqual(data['scheduling_mode'], 'CONTRACTOR')
        self.assertEqual(data['contractor_scheduled_by'], self.owner.pk)
        self.assertIsNotNone(data['contractor_scheduled_at'])
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.status, 'SENT')
        self.assertEqual(item.payment_status, 'NOT_REQUESTED')
        event = ActivityLog.objects.get(module='Work schedules', object_id=str(item.pk))
        self.assertEqual(event.actor_id, self.owner.pk)
        self.assertEqual(event.metadata['scheduling_mode'], 'CONTRACTOR')

    def test_standard_proposal_still_requires_accepted_quote_and_customer_date_response(self):
        response = self.client.post(self.url, self.payload(scheduling_mode='PORTAL'), format='json')
        self.assertEqual(response.status_code, 400)
        self.quote.status = 'ACCEPTED'
        self.quote.save(update_fields=['status'])
        item, data = self.create(scheduling_mode='PORTAL')
        self.assertEqual(item.status, 'PENDING')
        self.assertFalse(item.customer_accepted)
        self.assertEqual(data['scheduling_mode'], 'PORTAL')

    def test_only_verified_owning_contractor_may_use_direct_mode(self):
        for user in (self.other, self.customer_user, self.painter):
            self.client.force_authenticate(user)
            response = self.client.post(self.url, self.payload(), format='json')
            self.assertIn(response.status_code, (403, 404))
        self.owner.is_verified = False
        self.owner.save(update_fields=['is_verified'])
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 403)
        self.assertFalse(WorkSchedule.objects.exists())

    def test_closed_and_superseded_quotes_and_invalid_dates_are_rejected(self):
        for state in ('REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED', 'REVISION_REQUESTED', 'IN_PROGRESS'):
            self.quote.status = state
            self.quote.save(update_fields=['status'])
            self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 400)
        self.quote.status = 'SENT'
        self.quote.save(update_fields=['status'])
        for changes in ({'start_date': str(self.today - timedelta(days=1))}, {'end_date': str(self.today - timedelta(days=1))}, {'scheduling_mode': 'UNKNOWN'}):
            self.assertEqual(self.client.post(self.url, self.payload(**changes), format='json').status_code, 400)
        Quotation.objects.create(contractor=self.owner, customer=self.customer, property=self.property, status='SENT', revision_of=self.quote, version_number=2, quotation_number='DIRECT-SCHEDULE-2')
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 400)
        self.assertFalse(WorkSchedule.objects.exists())

    def test_direct_retry_is_idempotent_and_customer_response_never_demotes_it(self):
        item, _ = self.create()
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(WorkSchedule.objects.count(), 1)
        self.assertEqual(ActivityLog.objects.filter(module='Work schedules', object_id=str(item.pk)).count(), 1)
        self.client.force_authenticate(self.customer_user)
        response = self.client.post(reverse('work-schedule-accept', args=[item.pk]), {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        item.refresh_from_db()
        self.assertEqual(item.status, 'CONFIRMED')
        self.assertTrue(item.customer_accepted)

    def test_start_preserves_advance_and_worker_readiness_checks(self):
        item, _ = self.create()
        url = reverse('work-schedule-progress', args=[item.pk])
        self.assertEqual(self.client.post(url, {'action': 'START'}, format='json').status_code, 400)
        item.payment_status = 'CONFIRMED'
        item.save(update_fields=['payment_status'])
        self.assertEqual(self.client.post(url, {'action': 'START'}, format='json').status_code, 400)
        ContractorApplicatorTeam.objects.create(contractor=self.owner, painter=self.painter, employment_type='FLEXIBLE')
        WorkSchedulePainter.objects.create(schedule=item, painter=self.painter, status='ACCEPTED')
        self.assertEqual(self.client.post(url, {'action': 'START'}, format='json').status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.status, 'IN_PROGRESS')
        self.assertFalse(item.customer_accepted)

    def test_confirming_existing_roster_preserves_conflict_checks(self):
        self.quote.status = 'ACCEPTED'
        self.quote.save(update_fields=['status'])
        item, _ = self.create(scheduling_mode='PORTAL')
        WorkSchedulePainter.objects.create(schedule=item, painter=self.painter, status='ACCEPTED')
        other_quote = Quotation.objects.create(contractor=self.other, customer=self.customer, property=self.property, status='SCHEDULED', quotation_number='OTHER-SCHEDULE')
        other = WorkSchedule.objects.create(quotation=other_quote, proposed_by=self.other, proposed_start_date=self.today, proposed_end_date=self.today + timedelta(days=2), status='CONFIRMED')
        WorkSchedulePainter.objects.create(schedule=other, painter=self.painter, status='ACCEPTED')
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        item.refresh_from_db()
        self.assertEqual(item.status, 'PENDING')

    def test_mode_change_preserves_actual_assent_until_dates_change(self):
        self.quote.status = 'ACCEPTED'
        self.quote.save(update_fields=['status'])
        item, _ = self.create(scheduling_mode='PORTAL')
        self.client.force_authenticate(self.customer_user)
        self.assertEqual(self.client.post(reverse('work-schedule-accept', args=[item.pk]), {}, format='json').status_code, 200)
        self.client.force_authenticate(self.owner)
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['customer_accepted'])
        response = self.client.post(self.url, self.payload(end_date=str(self.today + timedelta(days=3)), reason='Extended work'), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['customer_accepted'])
    def test_private_edited_draft_does_not_block_approved_portal_scheduling(self):
        self.quote.status='ACCEPTED';self.quote.save(update_fields=['status'])
        Quotation.objects.create(contractor=self.owner,customer=self.customer,property=self.property,status='DRAFT',revision_of=self.quote,version_number=2,quotation_number='PRIVATE-EDIT-V2')
        response=self.client.post(self.url,self.payload(scheduling_mode='PORTAL'),format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['status'],'PENDING')
