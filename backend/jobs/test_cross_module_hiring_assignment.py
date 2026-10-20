from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from quotations.models import Customer, Property, Quotation
from .models import (
    ApplicatorBooking,
    ContractorApplicatorTeam,
    Job,
    JobApplication,
    WorkSchedule,
    WorkSchedulePainter,
)


class HiringOutcomeScheduleAssignmentTests(APITestCase):
    def setUp(self):
        verified = {"is_verified": True, "verification_status": "VERIFIED"}
        self.contractor = BharathUser.objects.create_user(mobile="9000021001", role="CONTRACTOR", **verified)
        self.other_contractor = BharathUser.objects.create_user(mobile="9000021002", role="CONTRACTOR", **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000021003", role="PAINTER", **verified)
        self.today = timezone.localdate()
        self.schedule = self.make_schedule(self.contractor, "HIRE-OWN")
        self.other_schedule = self.make_schedule(self.other_contractor, "HIRE-OTHER")
        self.job = Job.objects.create(
            contractor=self.contractor, title="Painter job", service_type="Painting",
            location="Bengaluru", city="Bengaluru", pincode="560001", job_type="DAILY",
            daily_wage=1500, start_date=self.today, estimated_days=2,
            status=Job.Status.PARTIALLY_FILLED,
        )
        self.application = JobApplication.objects.create(
            job=self.job, painter=self.painter, status=JobApplication.Status.ACCEPTED,
        )
        self.client.force_authenticate(self.contractor)

    def make_schedule(self, contractor, number):
        customer = Customer.objects.create(
            contractor=contractor, name=number,
            mobile=f"9{contractor.mobile[-7:]}{Customer.objects.count() % 100:02d}",
        )
        site = Property.objects.create(customer=customer, contractor=contractor, name=number)
        quotation = Quotation.objects.create(
            contractor=contractor, customer=customer, property=site,
            quotation_number=number, status=Quotation.Status.SCHEDULED,
        )
        return WorkSchedule.objects.create(
            quotation=quotation, proposed_by=contractor, proposed_start_date=self.today,
            proposed_end_date=self.today + timedelta(days=1), status=WorkSchedule.Status.CONFIRMED,
            customer_accepted=True, contractor_accepted=True,
        )

    def assign(self, source_type="application", source_id=None, schedule=None, user=None):
        if user:
            self.client.force_authenticate(user)
        return self.client.post(
            reverse("hiring-outcome-schedule-assignment", args=[source_type, source_id or self.application.pk]),
            {"schedule_id": (schedule or self.schedule).pk}, format="json",
        )

    def test_accepted_job_application_links_once_without_creating_employment(self):
        first = self.assign()
        retry = self.assign()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first.data["assignment_id"], retry.data["assignment_id"])
        assignment = WorkSchedulePainter.objects.get(source_application=self.application)
        self.assertEqual(assignment.schedule_id, self.schedule.pk)
        self.assertEqual(assignment.painter_id, self.painter.pk)
        self.assertEqual(assignment.agreed_wage, self.job.daily_wage)
        self.assertFalse(ContractorApplicatorTeam.objects.filter(contractor=self.contractor, painter=self.painter).exists())

    def test_confirmed_booking_can_be_linked(self):
        booking = ApplicatorBooking.objects.create(
            contractor=self.contractor, applicator=self.painter, work_type="Painting",
            pincode="560001", start_date=self.today, end_date=self.today + timedelta(days=2),
            wage_type="WEEKLY", agreed_wage=7000, status=ApplicatorBooking.Status.CONFIRMED,
        )
        response = self.assign("booking", booking.pk)
        self.assertEqual(response.status_code, 201, response.data)
        assignment = WorkSchedulePainter.objects.get(source_booking=booking)
        self.assertEqual(assignment.wage_type, WorkSchedulePainter.WageType.WEEKLY)
        self.assertEqual(assignment.agreed_wage, booking.agreed_wage)

    def test_unaccepted_outcome_is_not_assignable(self):
        self.application.status = JobApplication.Status.APPLIED
        self.application.save(update_fields=("status",))
        response = self.assign()
        self.assertEqual(response.status_code, 400)
        self.assertFalse(WorkSchedulePainter.objects.exists())

    def test_another_contractor_cannot_assign_application_or_schedule(self):
        self.assertEqual(self.assign(user=self.other_contractor).status_code, 404)
        self.assertEqual(self.assign(schedule=self.other_schedule).status_code, 404)
        self.assertFalse(WorkSchedulePainter.objects.exists())

    def test_overlapping_assignment_and_second_schedule_link_are_rejected(self):
        self.assertEqual(self.assign().status_code, 201)
        next_schedule = self.make_schedule(self.contractor, "HIRE-NEXT")
        self.assertEqual(self.assign(schedule=next_schedule).status_code, 409)
        self.assertEqual(WorkSchedulePainter.objects.filter(source_application=self.application).count(), 1)

    def test_project_schedule_must_fit_inside_accepted_hiring_dates(self):
        schedule = self.make_schedule(self.contractor, "HIRE-TOO-WIDE")
        schedule.proposed_start_date = self.today - timedelta(days=1)
        schedule.save(update_fields=("proposed_start_date", "updated_at"))
        response = self.assign(schedule=schedule)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("accepted job or booking dates", response.data["schedule_id"].lower())
        self.assertFalse(WorkSchedulePainter.objects.exists())
