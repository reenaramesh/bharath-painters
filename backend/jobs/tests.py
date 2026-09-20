from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from .models import Job, JobApplication, JobTransferRequest, WorkSchedule, WorkSchedulePainter
from quotations.models import ChatConversation, Customer, Property, Quotation

from .views import distance_km, geo_values


class WorkScheduleProgressTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.contractor = BharathUser.objects.create_user(
            mobile="9888111101", role=BharathUser.Roles.CONTRACTOR,
        )
        self.customer_user = BharathUser.objects.create_user(
            mobile="9888111102", role=BharathUser.Roles.CUSTOMER,
        )
        self.painter = BharathUser.objects.create_user(
            mobile="9888111103", role=BharathUser.Roles.PAINTER,
        )
        customer = Customer.objects.create(
            contractor=self.contractor, portal_user=self.customer_user,
            name="Schedule Customer", mobile=self.customer_user.mobile,
        )
        property_obj = Property.objects.create(
            contractor=self.contractor, customer=customer, name="Schedule Site",
        )
        self.quotation = Quotation.objects.create(
            contractor=self.contractor, customer=customer, property=property_obj,
            status=Quotation.Status.SCHEDULED,
        )
        self.schedule = WorkSchedule.objects.create(
            quotation=self.quotation,
            proposed_start_date=timezone.localdate(),
            proposed_end_date=timezone.localdate() + timedelta(days=2),
            proposed_by=self.contractor,
            customer_accepted=True,
            contractor_accepted=True,
            status=WorkSchedule.Status.CONFIRMED,
            payment_status=WorkSchedule.PaymentStatus.CONFIRMED,
        )
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=self.painter)

    def test_start_work_on_india_local_schedule_date(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            reverse("work-schedule-progress", args=(self.schedule.id,)),
            {"action": "START"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.schedule.refresh_from_db()
        self.quotation.refresh_from_db()
        self.assertEqual(self.schedule.status, WorkSchedule.Status.IN_PROGRESS)
        self.assertEqual(self.quotation.status, Quotation.Status.IN_PROGRESS)
        self.assertIsNotNone(self.schedule.work_started_at)


class JobLocationTests(TestCase):
    def test_nearby_distance_is_calculated_in_kilometres(self):
        distance = distance_km(12.9716, 77.5946, 13.0358, 77.5970)
        self.assertGreater(distance, 7)
        self.assertLess(distance, 8)

    def test_geo_values_accepts_mobile_coordinates_and_radius(self):
        latitude, longitude, radius = geo_values({
            "latitude": "12.971600", "longitude": "77.594600", "radius_km": "10",
        })
        self.assertEqual((latitude, longitude, radius), (12.9716, 77.5946, 10))

    def test_geo_values_preserves_text_only_legacy_location(self):
        self.assertEqual(geo_values({}), (None, None, 10))

    def test_geo_values_rejects_invalid_radius(self):
        with self.assertRaisesMessage(ValueError, "between 1 and 100"):
            geo_values({"latitude": 12.9, "longitude": 77.5, "radius_km": 101})


class JobAssignmentChangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        verified = {"is_verified": True, "verification_status": BharathUser.VerificationStatus.VERIFIED}
        self.contractor = BharathUser.objects.create_user(mobile="9000000001", role=BharathUser.Roles.CONTRACTOR, **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000000002", role=BharathUser.Roles.PAINTER, **verified)
        self.job = self.make_job("Original job", 10)
        self.application = JobApplication.objects.create(job=self.job, painter=self.painter, status=JobApplication.Status.ACCEPTED)
        self.job.status = Job.Status.FILLED
        self.job.save(update_fields=("status",))

    def make_job(self, title, offset):
        return Job.objects.create(
            contractor=self.contractor, title=title, service_type="Painting", location="Indiranagar",
            city="Bengaluru", job_type=Job.JobType.DAILY, number_of_painters=1,
            start_date=timezone.localdate() + timedelta(days=offset), estimated_days=2,
        )

    def test_painter_requests_and_contractor_approves_cancellation(self):
        self.client.force_authenticate(self.painter)
        response = self.client.post(
            reverse("job-application-cancellation", args=(self.application.id,)),
            {"action": "REQUEST", "reason": "Personal emergency"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        self.job.refresh_from_db()
        self.assertEqual(self.application.status, JobApplication.Status.CANCELLATION_REQUESTED)
        self.assertEqual(self.job.status, Job.Status.FILLED)

        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            reverse("job-application-cancellation", args=(self.application.id,)),
            {"action": "APPROVE", "reason": "Request approved"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        self.job.refresh_from_db()
        self.assertEqual(self.application.status, JobApplication.Status.CANCELLED)
        self.assertEqual(self.job.status, Job.Status.OPEN)

    def test_contractor_transfer_requires_painter_approval(self):
        target = self.make_job("Replacement job", 20)
        self.client.force_authenticate(self.contractor)
        response = self.client.post(
            reverse("job-application-reassign", args=(self.application.id,)),
            {"target_job_id": target.id, "reason": "Customer cancelled original work"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, JobApplication.Status.ACCEPTED)
        transfer = JobTransferRequest.objects.get(pk=response.data["transfer_request_id"])
        self.client.force_authenticate(self.painter)
        response = self.client.post(reverse("job-transfer-response", args=(transfer.id,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        replacement = JobApplication.objects.get(job=target, painter=self.painter)
        self.assertEqual(self.application.status, JobApplication.Status.CANCELLED)
        self.assertEqual(replacement.status, JobApplication.Status.ACCEPTED)
        self.assertEqual(replacement.reassigned_from_id, self.application.id)
        target.refresh_from_db()
        self.assertEqual(target.status, Job.Status.FILLED)

    def test_painter_can_request_transfer_and_contractor_can_reject_it(self):
        target = self.make_job("Other contractor job", 20)
        self.client.force_authenticate(self.painter)
        response = self.client.post(
            reverse("job-application-reassign", args=(self.application.id,)),
            {"target_job_id": target.id, "reason": "This location is easier for me"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        transfer = JobTransferRequest.objects.get(pk=response.data["transfer_request_id"])
        self.client.force_authenticate(self.contractor)
        response = self.client.post(reverse("job-transfer-response", args=(transfer.id,)), {"action": "REJECT"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        transfer.refresh_from_db()
        self.assertEqual(self.application.status, JobApplication.Status.ACCEPTED)
        self.assertEqual(transfer.status, JobTransferRequest.Status.REJECTED)

    def test_optional_ratings_can_be_added_by_both_parties(self):
        self.application.status = JobApplication.Status.CANCELLED
        self.application.save(update_fields=("status",))
        self.client.force_authenticate(self.contractor)
        self.assertEqual(self.client.post(reverse("job-application-rating", args=(self.application.id,)), {"rating": 4}, format="json").status_code, 200)
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.client.post(reverse("job-application-rating", args=(self.application.id,)), {"rating": 5}, format="json").status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual((self.application.contractor_rating, self.application.painter_rating), (4, 5))

    def test_painter_can_message_contractor_before_applying(self):
        unassigned_painter = BharathUser.objects.create_user(
            mobile="9000000003", role=BharathUser.Roles.PAINTER, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        self.client.force_authenticate(unassigned_painter)
        response = self.client.get(reverse("chat-conversations"), {"contractor_id": self.contractor.id})
        self.assertEqual(response.status_code, 200)
        conversation = ChatConversation.objects.get(contractor=self.contractor, painter=unassigned_painter)
        self.assertEqual(response.data[0]["id"], conversation.id)
        self.assertEqual(response.data[0]["contractor_mobile"], self.contractor.mobile)
