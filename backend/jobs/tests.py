from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from .models import ApplicatorBooking, ContractorApplicatorTeam, Job, JobApplication, JobTransferRequest, WorkSchedule, WorkSchedulePainter
from quotations.models import ChatConversation, Customer, Property, Quotation

from .views import distance_km, geo_values


class ApplicatorBookingLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        verified = {
            "is_verified": True,
            "verification_status": BharathUser.VerificationStatus.VERIFIED,
        }
        self.contractor = BharathUser.objects.create_user(
            mobile="9777000001",
            role=BharathUser.Roles.CONTRACTOR,
            **verified,
        )
        self.painter = BharathUser.objects.create_user(
            mobile="9777000002",
            role=BharathUser.Roles.PAINTER,
            **verified,
        )

    def test_passed_booking_dates_are_moved_to_closed(self):
        today = timezone.localdate()
        pending = ApplicatorBooking.objects.create(
            contractor=self.contractor,
            applicator=self.painter,
            work_type="Interior painting",
            pincode="560001",
            start_date=today - timedelta(days=2),
            end_date=today + timedelta(days=1),
        )
        confirmed = ApplicatorBooking.objects.create(
            contractor=self.contractor,
            applicator=self.painter,
            work_type="Exterior painting",
            pincode="560001",
            start_date=today - timedelta(days=3),
            end_date=today - timedelta(days=1),
            status=ApplicatorBooking.Status.CONFIRMED,
        )

        self.client.force_authenticate(self.contractor)
        response = self.client.get(reverse("applicator-booking-list"))

        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        confirmed.refresh_from_db()
        self.assertEqual(pending.status, ApplicatorBooking.Status.CLOSED)
        self.assertEqual(confirmed.status, ApplicatorBooking.Status.CLOSED)


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
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        ContractorApplicatorTeam.objects.create(
            contractor=self.contractor, painter=self.painter,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
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
        self.client.force_authenticate(self.painter)
        self.client.post(
            reverse("painter-assignment-progress", args=(self.schedule.painter_assignments.get().id,)),
            {"action": "ACCEPT"}, format="json",
        )
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

    def test_contractor_cannot_start_while_assignment_response_is_pending(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.post(reverse("work-schedule-progress", args=(self.schedule.id,)), {"action": "START"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, WorkSchedule.Status.CONFIRMED)

    def test_assigned_painter_cannot_bypass_another_pending_response(self):
        second = BharathUser.objects.create_user(
            mobile="9888111106", role=BharathUser.Roles.PAINTER,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
        )
        ContractorApplicatorTeam.objects.create(
            contractor=self.contractor, painter=second,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        )
        WorkSchedulePainter.objects.create(schedule=self.schedule, painter=second)
        self.client.force_authenticate(self.painter)
        assignment = self.schedule.painter_assignments.get(painter=self.painter)
        self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "ACCEPT"}, format="json")
        response = self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "START"}, format="json")
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "ACCEPTED")

    def test_painter_can_accept_or_decline_only_their_pending_assignment(self):
        assignment = self.schedule.painter_assignments.get()
        self.client.force_authenticate(self.painter)
        response = self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "ACCEPTED")
        self.assertIsNotNone(assignment.responded_at)

        second = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=BharathUser.objects.create_user(mobile="9888111104", role=BharathUser.Roles.PAINTER))
        self.client.force_authenticate(second.painter)
        response = self.client.post(reverse("painter-assignment-progress", args=(second.id,)), {"action": "REJECT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        second.refresh_from_db()
        self.assertEqual(second.status, "DECLINED")
        self.assertIsNotNone(second.responded_at)

    def test_assignment_cannot_be_started_until_accepted_and_advance_confirmed(self):
        assignment = self.schedule.painter_assignments.get()
        self.client.force_authenticate(self.painter)
        self.assertEqual(self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "START"}, format="json").status_code, 400)
        self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "ACCEPT"}, format="json")
        self.schedule.payment_status = WorkSchedule.PaymentStatus.NOT_REQUESTED
        self.schedule.save(update_fields=("payment_status",))
        response = self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "START"}, format="json")
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "ACCEPTED")
        self.schedule.payment_status = WorkSchedule.PaymentStatus.CONFIRMED
        self.schedule.save(update_fields=("payment_status",))
        self.assertEqual(self.client.post(reverse("painter-assignment-progress", args=(assignment.id,)), {"action": "START"}, format="json").status_code, 200)

    def test_work_schedule_completion_waits_for_all_active_painters(self):
        assignment = self.schedule.painter_assignments.get()
        assignment.status = "COMPLETED"
        assignment.save(update_fields=("status",))
        other = WorkSchedulePainter.objects.create(schedule=self.schedule, painter=BharathUser.objects.create_user(mobile="9888111105", role=BharathUser.Roles.PAINTER), status="IN_PROGRESS")
        self.schedule.status = WorkSchedule.Status.IN_PROGRESS
        self.schedule.save(update_fields=("status",))
        self.client.force_authenticate(self.contractor)
        response = self.client.post(reverse("work-schedule-progress", args=(self.schedule.id,)), {"action": "COMPLETE"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, WorkSchedule.Status.IN_PROGRESS)
        self.assertTrue(WorkSchedulePainter.objects.filter(pk=other.pk).exists())

    def test_removing_painter_preserves_assignment_row_as_released(self):
        assignment = self.schedule.painter_assignments.get()
        self.client.force_authenticate(self.contractor)
        response = self.client.put(reverse("work-schedule-painters", args=(self.schedule.id,)), {"painters": []}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "RELEASED")


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
        self.make_job("Open hiring post", 20)
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
        self.assertFalse(JobApplication.objects.filter(painter=unassigned_painter).exists())
        self.client.force_authenticate(self.contractor)
        reply=self.client.post(reverse("chat-messages",kwargs={"pk":conversation.id}),{"text":"Please share your availability."},format="json")
        self.assertEqual(reply.status_code,201,reply.data)

    def test_public_hiring_does_not_allow_contractor_to_start_arbitrary_painter_chat(self):
        self.make_job("Open hiring post",20)
        stranger=BharathUser.objects.create_user(mobile="9000000007",role="PAINTER",is_verified=True,verification_status="VERIFIED")
        self.client.force_authenticate(self.contractor)
        response=self.client.post(reverse("chat-conversations"),{"painter":stranger.id},format="json")
        self.assertEqual(response.status_code,400)
        self.assertFalse(ChatConversation.objects.filter(contractor=self.contractor,painter=stranger).exists())

    def test_unconnected_painter_cannot_message_without_an_available_job(self):
        painter = BharathUser.objects.create_user(mobile="9000000004", role="PAINTER", is_verified=True, verification_status="VERIFIED")
        self.client.force_authenticate(painter)
        response = self.client.get(reverse("chat-conversations"), {"contractor_id": self.contractor.id})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ChatConversation.objects.filter(contractor=self.contractor, painter=painter).exists())

    def test_public_job_contact_requires_verified_freelance_painter(self):
        from .models import ContractorApplicatorTeam
        self.make_job("Open hiring post", 20)
        painter = BharathUser.objects.create_user(mobile="9000000005", role="PAINTER")
        self.client.force_authenticate(painter)
        url=reverse("chat-conversations")
        self.assertEqual(self.client.get(url, {"contractor_id": self.contractor.id}).status_code,403)
        painter.is_verified=True;painter.verification_status="VERIFIED";painter.save()
        employer=BharathUser.objects.create_user(mobile="9000000006",role="CONTRACTOR")
        ContractorApplicatorTeam.objects.create(contractor=employer,painter=painter,employment_type="IN_HOUSE",is_active=True)
        self.assertEqual(self.client.get(url, {"contractor_id": self.contractor.id}).status_code,403)
        self.assertFalse(ChatConversation.objects.filter(contractor=self.contractor,painter=painter).exists())
