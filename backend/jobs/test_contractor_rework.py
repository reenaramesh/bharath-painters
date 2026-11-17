"""Contractor owns closure and rework; financial issuance stays explicit."""
from rest_framework.test import APITestCase
from . import test_schedule_work_items as fixtures
from .models import WorkSchedulePainter


class ContractorReworkTests(APITestCase):
    setUp = fixtures.ScheduleWorkItemTests.setUp

    def progress(self, action, **values):
        return self.client.post(f'/api/jobs/work-schedules/{self.schedule.pk}/progress/',
                                {'action': action, **values}, format='json')

    def test_contractor_completes_without_painters(self):
        response = self.progress('COMPLETE')
        self.assertEqual(response.status_code, 200, response.data)
        self.schedule.refresh_from_db(); self.quote.refresh_from_db()
        self.assertEqual(self.schedule.status, 'COMPLETED')
        self.assertEqual(self.quote.status, 'COMPLETED')
        self.assertIsNotNone(self.schedule.work_completed_at)

    def test_completion_does_not_forge_painter_completion(self):
        assignment = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.worker, status='ASSIGNED')
        self.assertEqual(self.progress('COMPLETE').status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, 'ASSIGNED')

    def test_reopen_requires_note_and_completed_state(self):
        self.assertEqual(self.progress('REOPEN', note='Repair uneven finish').status_code, 400)
        self.assertEqual(self.progress('COMPLETE').status_code, 200)
        for note in ('', '   ', 123, ['issue'], 'x'*4001):
            self.assertEqual(self.progress('REOPEN', note=note).status_code, 400)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, 'COMPLETED')

    def test_rework_history_and_invoice_initiation(self):
        invoice_url = '/api/quotations/invoices/'
        self.assertEqual(self.client.post(invoice_url, {'quotation':self.quote.pk}, format='json').status_code, 400)
        self.assertEqual(self.progress('COMPLETE').status_code, 200)
        completed = self.progress('REOPEN', note='Uneven finish; sand and repaint affected wall')
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data['status'], 'IN_PROGRESS')
        self.assertIsNone(completed.data['work_completed_at'])
        self.assertEqual(completed.data['rework_history'][0]['note'], 'Uneven finish; sand and repaint affected wall')
        self.assertEqual(self.client.post(invoice_url, {'quotation':self.quote.pk}, format='json').status_code, 400)
        self.assertEqual(self.progress('REOPEN', note='Duplicate').status_code, 400)
        self.assertEqual(self.progress('COMPLETE').status_code, 200)
        self.assertEqual(self.progress('REOPEN', note='Final touch-up on edge').status_code, 200)
        self.assertEqual(self.schedule.rework_entries.count(), 2)
        self.assertEqual(self.progress('COMPLETE').status_code, 200)
        invoice = self.client.post(invoice_url, {'quotation':self.quote.pk}, format='json')
        self.assertEqual(invoice.status_code, 201, invoice.data)
        self.assertEqual(self.progress('REOPEN', note='Cannot alter issued financial record').status_code, 409)

    def test_nonowners_cannot_complete_or_reopen(self):
        for user in (self.other,self.portal,self.worker):
            self.client.force_authenticate(user)
            for action in ('COMPLETE','REOPEN'):
                self.assertEqual(self.progress(action,note='Issue').status_code, 404)
