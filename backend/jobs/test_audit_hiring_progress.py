"""Accepted marketplace hires can carry out project work without becoming employees."""
from datetime import timedelta

from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Job, JobApplication, WorkSchedulePainter
from .test_cross_module_hiring_assignment import HiringOutcomeScheduleAssignmentTests


class HiringApplicationProgressAuditTests(APITestCase):
    setUp = HiringOutcomeScheduleAssignmentTests.setUp
    make_schedule = HiringOutcomeScheduleAssignmentTests.make_schedule
    assign = HiringOutcomeScheduleAssignmentTests.assign

    def progress(self, assignment, action):
        self.client.force_authenticate(self.painter)
        return self.client.post(reverse('painter-assignment-progress', args=[assignment.pk]),
                                {'action': action}, format='json')

    def linked_assignment(self):
        self.assertEqual(self.assign().status_code, 201)
        self.schedule.payment_status = 'CONFIRMED'
        self.schedule.save(update_fields=['payment_status'])
        return WorkSchedulePainter.objects.get(source_application=self.application)

    def test_marketplace_hire_can_accept_start_and_complete_project(self):
        assignment = self.linked_assignment()
        for action in ['ACCEPT', 'START', 'COMPLETE']:
            response = self.progress(assignment, action)
            self.assertEqual(response.status_code, 200, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, 'COMPLETED')

    def test_cancelled_or_transferred_source_cannot_accept_or_start(self):
        assignment = self.linked_assignment()
        self.application.status = JobApplication.Status.CANCELLED
        self.application.save(update_fields=['status'])
        self.assertEqual(self.progress(assignment, 'ACCEPT').status_code, 403)
        assignment.status = 'ACCEPTED'
        assignment.save(update_fields=['status'])
        self.assertEqual(self.progress(assignment, 'START').status_code, 403)

    def test_unrelated_painter_or_contractor_source_cannot_authorize_work(self):
        assignment = self.linked_assignment()
        self.job.contractor = self.other_contractor
        self.job.save(update_fields=['contractor'])
        self.assertEqual(self.progress(assignment, 'ACCEPT').status_code, 403)
        self.job.contractor = self.contractor
        self.job.save(update_fields=['contractor'])
        other_painter = type(self.painter).objects.create_user(mobile='9000021099', role='PAINTER')
        self.application.painter = other_painter
        self.application.save(update_fields=['painter'])
        self.assertEqual(self.progress(assignment, 'ACCEPT').status_code, 403)

    def test_source_dates_must_still_cover_project(self):
        assignment = self.linked_assignment()
        self.job.start_date += timedelta(days=1)
        self.job.save(update_fields=['start_date'])
        self.assertEqual(self.progress(assignment, 'ACCEPT').status_code, 403)

    def test_completed_source_job_cannot_authorize_new_work(self):
        assignment = self.linked_assignment()
        self.job.status = Job.Status.COMPLETED
        self.job.save(update_fields=['status'])
        self.assertEqual(self.progress(assignment, 'ACCEPT').status_code, 403)
