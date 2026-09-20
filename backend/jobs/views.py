from django.db import transaction, models
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils.dateparse import parse_date
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from datetime import timedelta, date
import secrets
import csv
from math import asin, cos, radians, sin, sqrt

from accounts.models import BharathUser, PainterProfile
from accounts.utils import activate_business_identity

from .models import Job, JobApplication, JobTransferRequest, WorkSchedule, WorkSchedulePainter, WorkPhoto, WorkReview, PainterSeekingPost, ContractorApplicatorTeam, ApplicatorBooking, ApplicatorAvailabilityBlock, ApplicatorAttendance, ApplicatorLedgerEntry
from quotations.models import Customer, Invoice, PortalNotification, ProjectReceipt, Quotation
from quotations.pdf_utils import build_advance_receipt_pdf
from billing.services import enforce_employee_limit, enforce_job_post_limit, enforce_job_seeking_post_limit, enforce_location_limit


def next_employee_code(contractor):
    year = timezone.localdate().year
    prefix = f"BPE-{year}-"
    serials = []
    for code in ContractorApplicatorTeam.objects.filter(
        contractor=contractor, employee_code__startswith=prefix,
    ).values_list("employee_code", flat=True):
        try:
            serials.append(int(code.removeprefix(prefix)))
        except (TypeError, ValueError):
            continue
    return f"{prefix}{max(serials, default=0) + 1:04d}"


def schedule_access(user, schedule):
    return schedule.quotation.contractor_id == user.id or schedule.quotation.customer.portal_user_id == user.id


def notify(recipient, actor, event_type, title, message, link):
    if recipient and recipient.id != actor.id:
        PortalNotification.objects.create(recipient=recipient, actor=actor, event_type=event_type, title=title, message=message, link=link)


def job_end_date(job):
    return job.start_date + timedelta(days=max(job.estimated_days, 1) - 1)


def geo_values(source):
    """Validate an optional coordinate pair and radius from request data/query params."""
    raw_latitude = source.get("latitude")
    raw_longitude = source.get("longitude")
    raw_radius = source.get("radius_km", 10)
    if raw_latitude in (None, "") and raw_longitude in (None, ""):
        try:
            radius = int(raw_radius or 10)
        except (TypeError, ValueError):
            raise ValueError("Select a valid search radius.")
        return None, None, max(1, min(radius, 100))
    try:
        latitude = float(raw_latitude)
        longitude = float(raw_longitude)
        radius = int(raw_radius or 10)
    except (TypeError, ValueError):
        raise ValueError("Location coordinates or radius are invalid.")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Location coordinates are outside the valid range.")
    if not 1 <= radius <= 100:
        raise ValueError("Radius must be between 1 and 100 km.")
    return latitude, longitude, radius


def distance_km(latitude_a, longitude_a, latitude_b, longitude_b):
    """Haversine distance between two WGS84 coordinate pairs."""
    latitude_a, longitude_a, latitude_b, longitude_b = map(
        radians, (float(latitude_a), float(longitude_a), float(latitude_b), float(longitude_b))
    )
    delta_latitude = latitude_b - latitude_a
    delta_longitude = longitude_b - longitude_a
    value = sin(delta_latitude / 2) ** 2 + cos(latitude_a) * cos(latitude_b) * sin(delta_longitude / 2) ** 2
    return 6371 * 2 * asin(sqrt(value))


def applicator_has_date_conflict(applicator, start, end, exclude_application=None, exclude_booking=None):
    """Return True when any confirmed marketplace or project work occupies the dates."""
    booking_query = ApplicatorBooking.objects.filter(
        applicator=applicator,
        status=ApplicatorBooking.Status.CONFIRMED,
        start_date__lte=end,
        end_date__gte=start,
    )
    if exclude_booking:
        booking_query = booking_query.exclude(pk=exclude_booking)
    if booking_query.exists():
        return True
    if WorkSchedulePainter.objects.filter(
        painter=applicator,
        schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
        schedule__proposed_start_date__lte=end,
        schedule__proposed_end_date__gte=start,
    ).exists():
        return True
    if ApplicatorAvailabilityBlock.objects.filter(
        applicator=applicator, start_date__lte=end, end_date__gte=start,
    ).exists():
        return True
    accepted_jobs = JobApplication.objects.filter(
        painter=applicator,
        status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED),
        job__status__in=(Job.Status.OPEN, Job.Status.PARTIALLY_FILLED, Job.Status.FILLED, Job.Status.IN_PROGRESS),
    ).select_related("job")
    if exclude_application:
        accepted_jobs = accepted_jobs.exclude(pk=exclude_application)
    return any(row.job.start_date <= end and job_end_date(row.job) >= start for row in accepted_jobs)


def refresh_marketplace_job_status(job):
    """Reopen a job as soon as a cancelled assignment frees a position."""
    if job.status in (Job.Status.IN_PROGRESS, Job.Status.COMPLETED, Job.Status.CANCELLED):
        return
    occupied = job.applications.filter(
        status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED),
    ).count()
    job.status = Job.Status.FILLED if occupied >= job.number_of_painters else (
        Job.Status.PARTIALLY_FILLED if occupied else Job.Status.OPEN
    )
    job.save(update_fields=("status", "updated_at"))


def optional_rating(value):
    if value in (None, ""):
        return None
    try:
        rating = int(value)
    except (TypeError, ValueError):
        raise ValueError("Rating must be a number from 1 to 5.")
    if rating < 1 or rating > 5:
        raise ValueError("Rating must be a number from 1 to 5.")
    return rating


def pending_transfer_data(application, viewer):
    transfer = application.transfer_requests.filter(status=JobTransferRequest.Status.PENDING).select_related(
        "target_job", "requested_by",
    ).first()
    if not transfer:
        return None
    return {
        "id": transfer.id,
        "target_job_id": transfer.target_job_id,
        "target_job": transfer.target_job.title,
        "target_start_date": transfer.target_job.start_date,
        "target_end_date": job_end_date(transfer.target_job),
        "reason": transfer.reason,
        "requested_by_role": transfer.requested_by.role,
        "can_respond": transfer.requested_by_id != viewer.id,
    }


def available_transfer_jobs(application):
    return [{
        "id": job.id, "title": job.title, "start_date": job.start_date,
        "end_date": job_end_date(job), "location": f"{job.location}, {job.city}",
    } for job in Job.objects.filter(
        contractor_id=application.job.contractor_id,
        status__in=(Job.Status.OPEN, Job.Status.PARTIALLY_FILLED),
    ).exclude(pk=application.job_id).order_by("start_date")]


def complete_job_transfer(source, target, actor):
    reason = f"Transferred to {target.title}"
    source.status = JobApplication.Status.CANCELLED
    source.cancellation_reason = reason
    source.cancelled_at = timezone.now()
    source.cancelled_by = actor
    source.save(update_fields=("status", "cancellation_reason", "cancelled_at", "cancelled_by", "updated_at"))
    replacement = JobApplication.objects.filter(job=target, painter=source.painter).first()
    if replacement:
        replacement.status = JobApplication.Status.ACCEPTED
        replacement.message = f"Transferred by mutual approval from {source.job.title}."
        replacement.reassigned_from = source
        replacement.cancellation_reason = ""
        replacement.cancellation_requested_at = None
        replacement.cancelled_at = None
        replacement.cancelled_by = None
        replacement.save(update_fields=(
            "status", "message", "reassigned_from", "cancellation_reason",
            "cancellation_requested_at", "cancelled_at", "cancelled_by", "updated_at",
        ))
    else:
        replacement = JobApplication.objects.create(
            job=target, painter=source.painter, status=JobApplication.Status.ACCEPTED,
            message=f"Transferred by mutual approval from {source.job.title}.", reassigned_from=source,
        )
    JobApplication.objects.filter(painter=source.painter, status=JobApplication.Status.APPLIED).exclude(pk=replacement.pk).update(status=JobApplication.Status.WITHDRAWN)
    refresh_marketplace_job_status(source.job)
    refresh_marketplace_job_status(target)
    return replacement


def schedule_data(item):
    quotation = item.quotation
    today = timezone.localdate()
    needs_reschedule = (
        item.status == WorkSchedule.Status.PENDING and item.proposed_start_date < today
    ) or (
        item.status == WorkSchedule.Status.CONFIRMED and item.proposed_end_date < today
    )
    return {
        "id": item.id, "quotation": quotation.id, "quotation_number": quotation.quotation_number,
        "customer": quotation.customer.name, "customer_bharath_id": quotation.customer.bharath_id, "property": quotation.property.name or quotation.property.property_type,
        "contractor": quotation.contractor.get_full_name() or quotation.contractor.mobile,
        "start_date": item.proposed_start_date, "end_date": item.proposed_end_date,
        "previous_start_date": item.previous_start_date, "previous_end_date": item.previous_end_date,
        "reschedule_reason": item.reschedule_reason,
        "advance_amount": item.advance_amount, "payment_status": item.payment_status,
        "payment_mode": item.payment_mode, "payment_reference": item.payment_reference,
        "payment_note": item.payment_note, "payment_submitted_at": item.payment_submitted_at,
        "payment_confirmed_at": item.payment_confirmed_at, "cancellation_reason": item.cancellation_reason,
        "advance_receipt_number": item.advance_receipt_number or "",
        "work_started_at": item.work_started_at, "work_completed_at": item.work_completed_at,
        "proposed_by": item.proposed_by.role, "customer_accepted": item.customer_accepted,
        "contractor_accepted": item.contractor_accepted, "status": item.status,
        "needs_reschedule": needs_reschedule,
        "painters": [{"id": assignment.painter_id, "assignment_id": assignment.id, "name": assignment.painter.get_full_name() or assignment.painter.mobile, "mobile": assignment.painter.mobile, "status": assignment.status, "wage_type": assignment.wage_type, "agreed_wage": assignment.agreed_wage, "painter_note": assignment.painter_note} for assignment in item.painter_assignments.all()],
        "updated_at": item.updated_at,
    }


def work_photo_access(user, schedule):
    if user.role == BharathUser.Roles.ADMIN or user.is_superuser:
        return True
    if schedule.quotation.contractor_id == user.id or schedule.quotation.customer.portal_user_id == user.id:
        return True
    return user.role == BharathUser.Roles.PAINTER and schedule.painter_assignments.filter(painter=user).exists()


def work_photo_data(request, item):
    return {
        "id": item.id, "schedule": item.schedule_id,
        "quotation_number": item.schedule.quotation.quotation_number,
        "customer": item.schedule.quotation.customer.name,
        "property": item.schedule.quotation.property.name or item.schedule.quotation.property.property_type,
        "stage": item.stage, "area": item.area, "caption": item.caption,
        "uploaded_by": item.uploaded_by.get_full_name() or item.uploaded_by.mobile,
        "uploaded_by_role": item.uploaded_by.role, "captured_at": item.captured_at,
        "image": request.build_absolute_uri(item.image.url),
        "can_delete": request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser or item.uploaded_by_id == request.user.id or item.schedule.quotation.contractor_id == request.user.id,
    }


class WorkPhotoListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def schedules(self, user):
        queryset = WorkSchedule.objects.exclude(status=WorkSchedule.Status.CANCELLED).select_related(
            "quotation", "quotation__customer", "quotation__property", "quotation__contractor",
        )
        if user.role == BharathUser.Roles.ADMIN or user.is_superuser:
            return queryset
        if user.role == BharathUser.Roles.CONTRACTOR:
            return queryset.filter(quotation__contractor=user)
        if user.role == BharathUser.Roles.CUSTOMER:
            return queryset.filter(quotation__customer__portal_user=user)
        if user.role == BharathUser.Roles.PAINTER:
            return queryset.filter(painter_assignments__painter=user).distinct()
        return queryset.none()

    def get(self, request):
        schedules = self.schedules(request.user)
        schedule_id = request.query_params.get("schedule")
        photos = WorkPhoto.objects.filter(schedule__in=schedules).select_related(
            "uploaded_by", "schedule__quotation__customer", "schedule__quotation__property",
        )
        if schedule_id:
            photos = photos.filter(schedule_id=schedule_id)
        return Response({
            "schedules": [{
                "id": item.id, "quotation_number": item.quotation.quotation_number,
                "customer": item.quotation.customer.name,
                "property": item.quotation.property.name or item.quotation.property.property_type,
                "status": item.status, "start_date": item.proposed_start_date, "end_date": item.proposed_end_date,
            } for item in schedules.order_by("-proposed_start_date")],
            "results": [work_photo_data(request, item) for item in photos],
        })

    def post(self, request):
        if request.user.role not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER}:
            return Response({"detail": "Contractor or assigned Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        schedule = WorkSchedule.objects.select_related(
            "quotation", "quotation__customer", "quotation__property", "quotation__contractor",
        ).filter(pk=request.data.get("schedule")).first()
        if not schedule or not work_photo_access(request.user, schedule):
            return Response({"schedule": "Select an accessible work schedule."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == BharathUser.Roles.PAINTER and not schedule.painter_assignments.filter(painter=request.user).exists():
            return Response({"detail": "This work is not assigned to you."}, status=status.HTTP_403_FORBIDDEN)
        image = request.FILES.get("image")
        if not image:
            return Response({"image": "Select a work photo."}, status=status.HTTP_400_BAD_REQUEST)
        if not str(getattr(image, "content_type", "")).startswith("image/"):
            return Response({"image": "Upload a valid image file."}, status=status.HTTP_400_BAD_REQUEST)
        if image.size > 10 * 1024 * 1024:
            return Response({"image": "Photo must be 10 MB or smaller."}, status=status.HTTP_400_BAD_REQUEST)
        stage = str(request.data.get("stage") or WorkPhoto.Stage.PROGRESS).upper()
        if stage not in WorkPhoto.Stage.values:
            return Response({"stage": "Select Before, Progress, or After."}, status=status.HTTP_400_BAD_REQUEST)
        item = WorkPhoto.objects.create(
            schedule=schedule, uploaded_by=request.user, image=image, stage=stage,
            area=str(request.data.get("area") or "").strip(),
            caption=str(request.data.get("caption") or "").strip(),
        )
        for recipient in {schedule.quotation.contractor, schedule.quotation.customer.portal_user}:
            if recipient:
                notify(recipient, request.user, "WORK_PHOTO", "New work photo", f"{schedule.quotation.quotation_number}: {item.get_stage_display()}", "/work-photos")
        return Response(work_photo_data(request, item), status=status.HTTP_201_CREATED)


class WorkPhotoDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        item = WorkPhoto.objects.select_related("schedule__quotation").filter(pk=pk).first()
        if not item or not work_photo_access(request.user, item.schedule):
            return Response({"detail": "Work photo not found."}, status=status.HTTP_404_NOT_FOUND)
        allowed = request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser or item.uploaded_by_id == request.user.id or item.schedule.quotation.contractor_id == request.user.id
        if not allowed:
            return Response({"detail": "You cannot delete this photo."}, status=status.HTTP_403_FORBIDDEN)
        image = item.image
        item.delete()
        if image:
            image.delete(save=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OperationsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in {BharathUser.Roles.ADMIN, BharathUser.Roles.CONTRACTOR} and not request.user.is_superuser:
            return Response({"detail": "Administrator or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        is_admin = request.user.role == BharathUser.Roles.ADMIN or request.user.is_superuser
        quotations = Quotation.objects.all() if is_admin else Quotation.objects.filter(contractor=request.user)
        invoices = Invoice.objects.exclude(status=Invoice.Status.CANCELLED) if is_admin else Invoice.objects.filter(contractor=request.user).exclude(status=Invoice.Status.CANCELLED)
        schedules = WorkSchedule.objects.filter(quotation__in=quotations)
        customers = Customer.objects.all() if is_admin else Customer.objects.filter(contractor=request.user)
        if request.query_params.get("export") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="operations-report-{timezone.localdate()}.csv"'
            writer = csv.writer(response)
            writer.writerow(["Invoice", "Date", "Customer", "Project", "Status", "Total", "Paid", "Balance"])
            for item in invoices.select_related("quotation__customer").order_by("-invoice_date"):
                writer.writerow([item.invoice_number, item.invoice_date, item.customer_name, item.property_name, item.status, item.grand_total, item.amount_paid, item.balance_due])
            return response
        today = timezone.localdate()
        active = schedules.filter(status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS))
        status_rows = quotations.values("status").annotate(count=models.Count("id")).order_by("status")
        monthly = invoices.filter(invoice_date__gte=today - timedelta(days=365)).annotate(
            month=TruncMonth("invoice_date"),
        ).values("month").annotate(
            billed=models.Sum("grand_total"), paid=models.Sum("amount_paid"),
        ).order_by("month")
        return Response({
            "scope": "ADMIN" if is_admin else "CONTRACTOR",
            "summary": {
                "customers": customers.count(), "quotations": quotations.count(),
                "active_projects": active.count(), "completed_projects": schedules.filter(status=WorkSchedule.Status.COMPLETED).count(),
                "invoiced": invoices.aggregate(value=models.Sum("grand_total"))["value"] or Decimal("0"),
                "received": invoices.aggregate(value=models.Sum("amount_paid"))["value"] or Decimal("0"),
                "outstanding": sum((item.balance_due for item in invoices), Decimal("0")),
                "photos": WorkPhoto.objects.filter(schedule__in=schedules).count(),
            },
            "quotation_statuses": list(status_rows),
            "monthly": [{"month": row["month"], "billed": row["billed"] or 0, "paid": row["paid"] or 0} for row in monthly],
            "upcoming": [schedule_data(item) for item in active.filter(proposed_end_date__gte=today).order_by("proposed_start_date")[:10]],
        })


class WorkScheduleListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(quotation__contractor=request.user)
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            queryset = queryset.filter(quotation__customer__portal_user=request.user)
        else:
            queryset = queryset.none()
        items = list(queryset.order_by("-updated_at"))
        data = [schedule_data(item) for item in items]
        if request.user.role == BharathUser.Roles.CUSTOMER:
            WorkSchedule.objects.filter(pk__in=[item.pk for item in items], status__in=(WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED)).update(customer_seen_update_at=timezone.now())
        return Response(data)

    def post(self, request):
        quotation = Quotation.objects.select_related("customer", "contractor", "property").filter(pk=request.data.get("quotation")).first()
        if not quotation or not (quotation.contractor_id == request.user.id or quotation.customer.portal_user_id == request.user.id):
            return Response({"quotation": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        if quotation.status not in (Quotation.Status.ACCEPTED, Quotation.Status.SCHEDULED, Quotation.Status.CONVERTED):
            return Response({"quotation": "The customer must accept the quotation before scheduling."}, status=status.HTTP_400_BAD_REQUEST)
        revision_root = quotation.revision_of or quotation
        newer_version_exists = Quotation.objects.filter(
            models.Q(pk=revision_root.pk) | models.Q(revision_of=revision_root),
            version_number__gt=quotation.version_number,
        ).exists()
        if newer_version_exists:
            return Response({"quotation": "This is an older quotation version. Schedule the latest accepted revision."}, status=status.HTTP_400_BAD_REQUEST)
        family_schedule = WorkSchedule.objects.filter(
            models.Q(quotation=revision_root) | models.Q(quotation__revision_of=revision_root),
        ).exclude(quotation=quotation).first()
        if family_schedule:
            return Response({"quotation": "This quotation project is already scheduled against another version."}, status=status.HTTP_400_BAD_REQUEST)
        start = parse_date(str(request.data.get("start_date") or "")); end = parse_date(str(request.data.get("end_date") or ""))
        if not start or not end or end < start:
            return Response({"dates": "Enter a valid start and end date."}, status=status.HTTP_400_BAD_REQUEST)
        if start < timezone.localdate():
            return Response({"start_date": "Work cannot be scheduled for a past date."}, status=status.HTTP_400_BAD_REQUEST)
        is_customer = request.user.role == BharathUser.Roles.CUSTOMER
        existing = WorkSchedule.objects.filter(quotation=quotation).first()
        if existing and is_customer:
            return Response({"detail": "Only the contractor can reschedule existing work dates."}, status=status.HTTP_403_FORBIDDEN)
        reason = str(request.data.get("reason") or "").strip()
        if existing and not reason:
            return Response({"reason": "Give a reason for rescheduling the confirmed or proposed dates."}, status=status.HTTP_400_BAD_REQUEST)
        schedule_defaults = {
            "proposed_start_date": start, "proposed_end_date": end, "proposed_by": request.user,
            "previous_start_date": existing.proposed_start_date if existing else None,
            "previous_end_date": existing.proposed_end_date if existing else None,
            "reschedule_reason": reason,
            "cancellation_reason": "",
            "customer_accepted": is_customer, "contractor_accepted": not is_customer, "status": WorkSchedule.Status.PENDING,
        }
        if not existing:
            schedule_defaults.update({
                "advance_amount": None, "payment_status": WorkSchedule.PaymentStatus.NOT_REQUESTED,
                "payment_mode": "", "payment_reference": "", "payment_note": "",
                "payment_submitted_at": None, "payment_confirmed_at": None,
            })
        item, _ = WorkSchedule.objects.update_or_create(quotation=quotation, defaults=schedule_defaults)
        # A changed date range requires fresh mutual approval and fresh painter availability checks.
        item.painter_assignments.all().delete()
        recipient = quotation.contractor if is_customer else quotation.customer.portal_user
        notify(recipient, request.user, "SCHEDULE", "Work dates proposed", f"{quotation.quotation_number}: {start} to {end}", "/work-schedules")
        return Response(schedule_data(item), status=status.HTTP_201_CREATED)


class WorkScheduleAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk).first()
        if not item or not schedule_access(request.user, item):
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        if item.proposed_start_date < timezone.localdate():
            return Response({"start_date": "These proposed dates have expired. The contractor must reschedule using today or a future date."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role == BharathUser.Roles.CUSTOMER: item.customer_accepted = True
        elif request.user.role == BharathUser.Roles.CONTRACTOR: item.contractor_accepted = True
        else: return Response({"detail": "Customer or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        item.status = WorkSchedule.Status.CONFIRMED if item.customer_accepted and item.contractor_accepted else WorkSchedule.Status.PENDING
        item.save(update_fields=("customer_accepted", "contractor_accepted", "status", "updated_at"))
        if item.status == WorkSchedule.Status.CONFIRMED and item.quotation.status != Quotation.Status.SCHEDULED:
            item.quotation.status = Quotation.Status.SCHEDULED
            item.quotation.save(update_fields=("status", "updated_at"))
        recipient = item.quotation.contractor if request.user.role == BharathUser.Roles.CUSTOMER else item.quotation.customer.portal_user
        notify(recipient, request.user, "SCHEDULE", "Work schedule response", f"{item.quotation.quotation_number}: {item.get_status_display()}", "/work-schedules")
        return Response(schedule_data(item))


class WorkSchedulePainterView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk, quotation__contractor=request.user, status=WorkSchedule.Status.CONFIRMED).first()
        if not item:
            return Response({"detail": "A mutually confirmed schedule is required."}, status=status.HTTP_400_BAD_REQUEST)
        raw_painters = request.data.get("painters") or []
        painter_ids = list(dict.fromkeys([entry.get("id") if isinstance(entry, dict) else entry for entry in raw_painters]))
        team_ids = set(ContractorApplicatorTeam.objects.filter(contractor=request.user, painter_id__in=painter_ids).values_list("painter_id", flat=True))
        team_ids.update(ApplicatorBooking.objects.filter(contractor=request.user, applicator_id__in=painter_ids, status=ApplicatorBooking.Status.CONFIRMED, start_date__lte=item.proposed_end_date, end_date__gte=item.proposed_start_date).values_list("applicator_id", flat=True))
        if team_ids != set(painter_ids):
            return Response({"painters": "Select a verified team member or confirmed booked Paint Applicator for these dates."}, status=status.HTTP_400_BAD_REQUEST)
        painters = BharathUser.objects.filter(id__in=painter_ids, role=BharathUser.Roles.PAINTER, is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED)
        if painters.count() != len(painter_ids):
            return Response({"painters": "Select verified Paint Applicators only."}, status=status.HTTP_400_BAD_REQUEST)
        busy = WorkSchedulePainter.objects.filter(painter__in=painters, schedule__status=WorkSchedule.Status.CONFIRMED, schedule__proposed_start_date__lte=item.proposed_end_date, schedule__proposed_end_date__gte=item.proposed_start_date).exclude(schedule=item)
        if busy.exists():
            return Response({"painters": f"{busy.first().painter.get_full_name() or busy.first().painter.mobile} is already assigned during these dates."}, status=status.HTTP_400_BAD_REQUEST)
        terms = {int(entry["id"]): entry for entry in raw_painters if isinstance(entry, dict) and entry.get("id")}
        WorkSchedulePainter.objects.filter(schedule=item).delete()
        assignments = []
        for painter in painters:
            term = terms.get(painter.id, {})
            wage_type = term.get("wage_type") if term.get("wage_type") in {"DAILY", "WEEKLY"} else "DAILY"
            assignments.append(WorkSchedulePainter(schedule=item, painter=painter, wage_type=wage_type, agreed_wage=term.get("agreed_wage") or None))
        WorkSchedulePainter.objects.bulk_create(assignments)
        for painter in painters:
            notify(painter, request.user, "ASSIGNMENT", "New work assignment", f"{item.quotation.quotation_number}: {item.proposed_start_date} to {item.proposed_end_date}", "/painter-assignments")
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").get(pk=item.pk)
        return Response(schedule_data(item))


class WorkSchedulePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        item = WorkSchedule.objects.select_for_update().select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk).first()
        if not item or not schedule_access(request.user, item):
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        if item.status != WorkSchedule.Status.CONFIRMED:
            return Response({"detail": "Both parties must confirm the work dates first."}, status=status.HTTP_400_BAD_REQUEST)
        action = str(request.data.get("action") or "").upper()
        if action == "REQUEST":
            if request.user.id != item.quotation.contractor_id:
                return Response({"detail": "Only the contractor can request an advance."}, status=status.HTTP_403_FORBIDDEN)
            try: amount = Decimal(str(request.data.get("amount") or "0"))
            except InvalidOperation: amount = Decimal("0")
            if amount <= 0 or amount > item.quotation.grand_total:
                return Response({"amount": "Enter an advance amount greater than zero and not above the quotation total."}, status=status.HTTP_400_BAD_REQUEST)
            item.advance_amount = amount
            item.payment_status = WorkSchedule.PaymentStatus.AWAITING_PAYMENT
            item.payment_mode = item.payment_reference = item.payment_note = ""
            item.payment_submitted_at = item.payment_confirmed_at = None
        elif action == "SUBMIT":
            if request.user.id != item.quotation.customer.portal_user_id:
                return Response({"detail": "Only the customer can submit payment details."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status != WorkSchedule.PaymentStatus.AWAITING_PAYMENT:
                return Response({"detail": "No advance payment is awaiting submission."}, status=status.HTTP_400_BAD_REQUEST)
            mode = str(request.data.get("mode") or "").upper()
            if mode not in ("CASH", "UPI", "ONLINE"):
                return Response({"mode": "Select Cash, UPI, or Online."}, status=status.HTTP_400_BAD_REQUEST)
            reference = str(request.data.get("reference") or "").strip()
            if mode != "CASH" and not reference:
                return Response({"reference": "Enter the UPI or online transaction reference."}, status=status.HTTP_400_BAD_REQUEST)
            item.payment_mode = mode; item.payment_reference = reference
            item.payment_note = str(request.data.get("note") or "").strip()
            item.payment_submitted_at = timezone.now()
            item.payment_status = WorkSchedule.PaymentStatus.PENDING_CONFIRMATION
        elif action == "CONFIRM":
            if request.user.id != item.quotation.contractor_id:
                return Response({"detail": "Only the contractor can confirm receipt."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status != WorkSchedule.PaymentStatus.PENDING_CONFIRMATION:
                return Response({"detail": "The customer has not submitted payment details."}, status=status.HTTP_400_BAD_REQUEST)
            item.payment_status = WorkSchedule.PaymentStatus.CONFIRMED
            item.payment_confirmed_at = timezone.now()
        elif action == "RECORD":
            # Contractor received the advance directly (cash at site, instant UPI, etc.)
            # without raising a payment request first - record and confirm it in one step.
            if request.user.id != item.quotation.contractor_id:
                return Response({"detail": "Only the contractor can record a payment received."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status not in (WorkSchedule.PaymentStatus.NOT_REQUESTED, WorkSchedule.PaymentStatus.AWAITING_PAYMENT):
                return Response({"detail": "This payment has already been submitted or confirmed."}, status=status.HTTP_400_BAD_REQUEST)
            try: amount = Decimal(str(request.data.get("amount") or "0"))
            except InvalidOperation: amount = Decimal("0")
            if amount <= 0 or amount > item.quotation.grand_total:
                return Response({"amount": "Enter an amount greater than zero and not above the quotation total."}, status=status.HTTP_400_BAD_REQUEST)
            mode = str(request.data.get("mode") or "").upper()
            if mode not in ("CASH", "UPI", "ONLINE"):
                return Response({"mode": "Select Cash, UPI, or Online."}, status=status.HTTP_400_BAD_REQUEST)
            reference = str(request.data.get("reference") or "").strip()
            if mode != "CASH" and not reference:
                return Response({"reference": "Enter the UPI or online transaction reference."}, status=status.HTTP_400_BAD_REQUEST)
            item.advance_amount = amount
            item.payment_mode = mode; item.payment_reference = reference
            item.payment_note = str(request.data.get("note") or "").strip()
            item.payment_submitted_at = timezone.now()
            item.payment_confirmed_at = timezone.now()
            item.payment_status = WorkSchedule.PaymentStatus.CONFIRMED
        else:
            return Response({"action": "Select REQUEST, SUBMIT, or CONFIRM."}, status=status.HTTP_400_BAD_REQUEST)
        item.save()
        if action in ("CONFIRM", "RECORD"):
            item.advance_receipt_number = item.advance_receipt_number or f"ADV-{timezone.localdate():%Y%m%d}-{item.id:04d}"
            item.save(update_fields=("advance_receipt_number", "updated_at"))
        recipient = item.quotation.customer.portal_user if request.user.id == item.quotation.contractor_id else item.quotation.contractor
        notify(recipient, request.user, "PAYMENT", "Payment status updated", f"{item.quotation.quotation_number}: {item.get_payment_status_display()}", "/work-schedules")
        return Response(schedule_data(item))


class WorkScheduleAdvanceReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = WorkSchedule.objects.select_related(
            "quotation", "quotation__customer", "quotation__property",
            "quotation__contractor", "quotation__contractor__contractor_profile",
        ).filter(pk=pk, payment_status=WorkSchedule.PaymentStatus.CONFIRMED).first()
        if not item or not schedule_access(request.user, item) or not item.advance_receipt_number:
            return Response({"detail": "Advance payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_advance_receipt_pdf(item), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.advance_receipt_number}.pdf"'
        return response


class WorkScheduleCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk, quotation__contractor=request.user).first()
        if not item:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        if item.payment_status == WorkSchedule.PaymentStatus.CONFIRMED:
            return Response({"detail": "A paid schedule cannot be cancelled through the unpaid-payment action."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": "Give a reason for cancelling the unpaid schedule."}, status=status.HTTP_400_BAD_REQUEST)
        item.status = WorkSchedule.Status.CANCELLED; item.cancellation_reason = reason
        item.painter_assignments.all().delete(); item.save(update_fields=("status", "cancellation_reason", "updated_at"))
        if item.quotation.status == Quotation.Status.SCHEDULED:
            item.quotation.status = Quotation.Status.ACCEPTED
            item.quotation.save(update_fields=("status", "updated_at"))
        return Response(schedule_data(item))


class WorkScheduleProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk, quotation__contractor=request.user).first()
        if not item:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        action = str(request.data.get("action") or "").upper()
        if action == "START":
            if item.quotation.status == Quotation.Status.REVISION_REQUESTED:
                return Response(
                    {"detail": "Send and approve the revised quotation before starting work."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if item.status != WorkSchedule.Status.CONFIRMED:
                return Response({"detail": "Only a confirmed schedule can be started."}, status=status.HTTP_400_BAD_REQUEST)
            if item.payment_status != WorkSchedule.PaymentStatus.CONFIRMED:
                return Response({"detail": "Confirm the advance payment before starting work."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.localdate() < item.proposed_start_date:
                return Response({"detail": f"Work can be started on or after {item.proposed_start_date}."}, status=status.HTTP_400_BAD_REQUEST)
            if not item.painter_assignments.exists():
                return Response({"detail": "Assign at least one Paint Applicator before starting work."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = WorkSchedule.Status.IN_PROGRESS; item.work_started_at = timezone.now(); item.customer_seen_update_at = None
            item.quotation.status = Quotation.Status.IN_PROGRESS
            item.quotation.save(update_fields=("status", "updated_at"))
            item.save(update_fields=("status", "work_started_at", "customer_seen_update_at", "updated_at"))
        elif action == "COMPLETE":
            if item.status != WorkSchedule.Status.IN_PROGRESS:
                return Response({"detail": "Start the work before marking it completed."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = WorkSchedule.Status.COMPLETED; item.work_completed_at = timezone.now(); item.customer_seen_update_at = None
            item.quotation.status = Quotation.Status.COMPLETED
            item.quotation.save(update_fields=("status", "updated_at"))
            item.save(update_fields=("status", "work_completed_at", "customer_seen_update_at", "updated_at"))
        else:
            return Response({"action": "Select START or COMPLETE."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(schedule_data(item))

def verified_contractor(user):
    return (
        user.role == BharathUser.Roles.CONTRACTOR
        and user.is_verified
        and user.verification_status
        == BharathUser.VerificationStatus.VERIFIED
    )


def verified_painter(user):
    return (
        user.role == BharathUser.Roles.PAINTER
        and user.is_verified
        and user.verification_status
        == BharathUser.VerificationStatus.VERIFIED
    )


def is_inhouse_applicator(user):
    return user.role == BharathUser.Roles.PAINTER and ContractorApplicatorTeam.objects.filter(
        painter=user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True,
    ).exists()


def team_member_data(item, request):
    painter = item.painter
    profile = painter.painter_profile if hasattr(painter, "painter_profile") else None
    return {
        "membership_id": item.id,
        "id": painter.id,
        "name": painter.get_full_name() or painter.mobile,
        "mobile": painter.mobile,
        "email": painter.email,
        "bharath_id": painter.bharath_id,
        "profile_photo": request.build_absolute_uri(painter.profile_photo.url) if painter.profile_photo else None,
        "experience_years": profile.experience_years if profile else 0,
        "skills": profile.skills if profile else "",
        "daily_wage": profile.daily_wage if profile else None,
        "weekly_wage": profile.weekly_wage if profile else None,
        "preferred_locations": profile.preferred_locations if profile else "",
        "willing_to_travel": profile.willing_to_travel if profile else False,
        "availability": profile.availability if profile else "OFFLINE",
        "is_verified": painter.is_verified and painter.verification_status == BharathUser.VerificationStatus.VERIFIED,
        "added_at": item.added_at,
        "employment_type": item.employment_type,
        "joined_on": item.joined_on,
        "employee_code": item.employee_code,
        "is_active": item.is_active,
        "date_of_birth": item.date_of_birth,
        "blood_group": item.blood_group,
        "salary_basis": item.salary_basis,
        "salary_amount": item.salary_amount,
        "esi_applicable": item.esi_applicable,
        "pf_applicable": item.pf_applicable,
    }


class ContractorApplicatorTeamView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        start = parse_date(str(request.query_params.get("start_date") or ""))
        end = parse_date(str(request.query_params.get("end_date") or ""))
        schedule_id = request.query_params.get("schedule_id")
        busy_ids = set()
        if start and end:
            busy_ids = set(WorkSchedulePainter.objects.filter(
                schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
                schedule__proposed_start_date__lte=end,
                schedule__proposed_end_date__gte=start,
            ).exclude(schedule_id=schedule_id).values_list("painter_id", flat=True))
        members = ContractorApplicatorTeam.objects.filter(contractor=request.user).exclude(painter_id__in=busy_ids).select_related("painter", "painter__painter_profile")
        results = [team_member_data(item, request) for item in members]
        member_ids = {item["id"] for item in results}
        bookings = ApplicatorBooking.objects.filter(
            contractor=request.user,
            status=ApplicatorBooking.Status.CONFIRMED,
            applicator__is_active=True,
            applicator__is_verified=True,
            applicator__verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).select_related("applicator", "applicator__painter_profile")
        if start and end:
            bookings = bookings.filter(start_date__lte=end, end_date__gte=start)
        for booking in bookings:
            if booking.applicator_id not in member_ids:
                painter = booking.applicator
                profile = painter.painter_profile if hasattr(painter, "painter_profile") else None
                results.append({"membership_id": None, "id": painter.id, "name": painter.get_full_name() or painter.mobile, "mobile": painter.mobile, "email": painter.email, "bharath_id": painter.bharath_id, "experience_years": profile.experience_years if profile else 0, "skills": profile.skills if profile else "", "daily_wage": profile.daily_wage if profile else None, "weekly_wage": profile.weekly_wage if profile else None, "is_verified": True, "is_active": painter.is_active, "employment_type": "BOOKED", "booking_start_date": booking.start_date, "booking_end_date": booking.end_date})
                member_ids.add(booking.applicator_id)
        return Response(results)

    def post(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        painter = BharathUser.objects.filter(
            pk=request.data.get("painter_id"),
            role=BharathUser.Roles.PAINTER,
            is_active=True,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).first()
        if not painter:
            return Response({"painter_id": "Select a verified Paint Applicator."}, status=status.HTTP_400_BAD_REQUEST)
        if not ContractorApplicatorTeam.objects.filter(contractor=request.user, painter=painter).exists():
            enforce_employee_limit(request.user)
        item, created = ContractorApplicatorTeam.objects.get_or_create(contractor=request.user, painter=painter)
        return Response(team_member_data(item, request), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ContractorApplicatorCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        enforce_employee_limit(request.user)
        name = str(request.data.get("name") or "").strip()
        mobile = str(request.data.get("mobile") or "").strip()
        if not name or not mobile:
            return Response({"detail": "Name and mobile number are required."}, status=status.HTTP_400_BAD_REQUEST)
        if BharathUser.objects.filter(mobile=mobile).exists():
            return Response({"mobile": "An account with this mobile number already exists."}, status=status.HTTP_400_BAD_REQUEST)
        password = str(request.data.get("password") or "").strip() or f"BP@{secrets.token_urlsafe(6)}"
        if len(password) < 8:
            return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
        parts = name.split(maxsplit=1)
        existing_numbers = []
        for value in BharathUser.objects.filter(role=BharathUser.Roles.PAINTER, bharath_id__startswith="BP-P-").values_list("bharath_id", flat=True):
            try:
                existing_numbers.append(int(value.replace("BP-P-", "")))
            except (TypeError, ValueError):
                continue
        bharath_id = f"BP-P-{(max(existing_numbers, default=0) + 1):06d}"
        now = timezone.now()
        painter = BharathUser.objects.create_user(
            mobile=mobile,
            email=str(request.data.get("email") or "").strip() or None,
            password=password,
            first_name=parts[0],
            last_name=parts[1] if len(parts) > 1 else "",
            role=BharathUser.Roles.PAINTER,
            is_active=True,
            is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
            verified_at=now,
            badge_issued_at=now,
            bharath_id=bharath_id,
            verification_notes=f"Created and verified by contractor {request.user.bharath_id or request.user.mobile}.",
        )
        PainterProfile.objects.create(
            user=painter,
            experience_years=max(0, int(request.data.get("experience_years") or 0)),
            skills=str(request.data.get("skills") or "").strip(),
            daily_wage=request.data.get("daily_wage") or None,
            weekly_wage=request.data.get("weekly_wage") or None,
            preferred_locations=str(request.data.get("preferred_locations") or "").strip(),
            willing_to_travel=bool(request.data.get("willing_to_travel")),
            availability=PainterProfile.Availability.AVAILABLE,
            emergency_contact_name=str(request.data.get("emergency_contact_name") or "").strip(),
            emergency_contact_number=str(request.data.get("emergency_contact_number") or "").strip(),
            upi_id=str(request.data.get("upi_id") or "").strip(),
        )
        activate_business_identity(painter, request.build_absolute_uri("/").rstrip("/"))
        employment_type = request.data.get("employment_type")
        membership = ContractorApplicatorTeam.objects.create(
            contractor=request.user, painter=painter,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE if employment_type == "IN_HOUSE" else ContractorApplicatorTeam.EmploymentType.FLEXIBLE,
            joined_on=parse_date(str(request.data.get("joined_on") or "")) or timezone.localdate(),
            employee_code=next_employee_code(request.user),
            date_of_birth=parse_date(str(request.data.get("date_of_birth") or "")) or None,
            blood_group=str(request.data.get("blood_group") or "").strip().upper(),
            salary_basis=request.data.get("salary_basis") if request.data.get("salary_basis") in {choice[0] for choice in ContractorApplicatorTeam.SalaryBasis.choices} else ContractorApplicatorTeam.SalaryBasis.DAILY,
            salary_amount=request.data.get("salary_amount") or None,
            esi_applicable=bool(request.data.get("esi_applicable")),
            pf_applicable=bool(request.data.get("pf_applicable")),
        )
        return Response({
            "message": "Paint Applicator account created, verified, and added to your team.",
            "credentials": {"name": painter.get_full_name(), "mobile": mobile, "password": password, "bharath_id": bharath_id},
            "member": team_member_data(membership, request),
        }, status=status.HTTP_201_CREATED)


class ContractorApplicatorTeamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = ContractorApplicatorTeam.objects.filter(pk=pk, contractor=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


def inhouse_summary(item, request):
    data = team_member_data(item, request)
    entries = list(item.ledger_entries.all())
    earnings = sum((entry.amount for entry in entries if entry.entry_type in {ApplicatorLedgerEntry.EntryType.EARNING, ApplicatorLedgerEntry.EntryType.BONUS, ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT}), Decimal("0"))
    paid = sum((entry.amount for entry in entries if entry.entry_type in {ApplicatorLedgerEntry.EntryType.PAYMENT, ApplicatorLedgerEntry.EntryType.ADVANCE, ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT}), Decimal("0"))
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    units = Decimal("0")
    for attendance in item.attendance_records.filter(date__range=(week_start, week_end)):
        if attendance.status == ApplicatorAttendance.Status.PRESENT:
            units += Decimal("1")
        elif attendance.status == ApplicatorAttendance.Status.HALF_DAY:
            units += Decimal("0.5")
    salary = item.salary_amount or Decimal("0")
    daily_rate = salary if item.salary_basis == ContractorApplicatorTeam.SalaryBasis.DAILY else salary / (Decimal("6") if item.salary_basis == ContractorApplicatorTeam.SalaryBasis.WEEKLY else Decimal("26"))
    data.update({"total_earnings": earnings, "total_paid": paid, "balance": earnings - paid, "weekly_attendance_units": units, "weekly_earning": (daily_rate * units).quantize(Decimal("0.01")), "week_start": week_start, "week_end": week_end})
    return data


class InHouseApplicatorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        members = ContractorApplicatorTeam.objects.filter(
            contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        ).select_related("painter", "painter__painter_profile").prefetch_related("ledger_entries")
        return Response([inhouse_summary(item, request) for item in members])

    def post(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.filter(pk=request.data.get("membership_id"), contractor=request.user).first()
        if not item:
            return Response({"membership_id": "Select an applicator from your team."}, status=status.HTTP_400_BAD_REQUEST)
        item.employment_type = ContractorApplicatorTeam.EmploymentType.IN_HOUSE
        item.joined_on = parse_date(str(request.data.get("joined_on") or "")) or item.joined_on or timezone.localdate()
        if not item.employee_code:
            item.employee_code = next_employee_code(request.user)
        item.is_active = True
        item.save(update_fields=("employment_type", "joined_on", "employee_code", "is_active"))
        return Response(inhouse_summary(item, request))


class InHouseApplicatorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        queryset = ContractorApplicatorTeam.objects.filter(pk=pk, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE).select_related("painter", "painter__painter_profile").prefetch_related("ledger_entries", "attendance_records", "attendance_records__schedule", "ledger_entries__schedule")
        item = queryset.filter(contractor=request.user).first() if request.user.role == BharathUser.Roles.CONTRACTOR else queryset.filter(painter=request.user).first()
        if not item:
            return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        data = inhouse_summary(item, request)
        attendance = item.attendance_records.all()
        month = request.query_params.get("month")
        date_from = parse_date(request.query_params.get("date_from", "")); date_to = parse_date(request.query_params.get("date_to", ""))
        if month:
            try: year, month_number = map(int, month.split("-")); attendance = attendance.filter(date__year=year, date__month=month_number)
            except (TypeError, ValueError): pass
        elif date_from and date_to:
            attendance = attendance.filter(date__range=(date_from, date_to))
        rows = list(attendance[:370])
        data["attendance"] = [{"id": row.id, "date": row.date, "status": row.status, "note": row.note, "schedule": row.schedule_id, "overtime_hours": row.overtime_hours} for row in rows]
        data["attendance_summary"] = {"present": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.PRESENT), "half_day": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.HALF_DAY), "absent": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.ABSENT), "leave": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.LEAVE), "overtime_hours": sum((row.overtime_hours for row in rows), Decimal("0"))}
        ledger = item.ledger_entries.all()
        if month:
            try:
                ledger = ledger.filter(date__year=year, date__month=month_number)
            except (NameError, TypeError, ValueError):
                pass
        elif date_from and date_to:
            ledger = ledger.filter(date__range=(date_from, date_to))
        data["ledger"] = [{"id": row.id, "date": row.date, "entry_type": row.entry_type, "amount": row.amount, "payment_mode": row.payment_mode, "reference": row.reference, "note": row.note, "schedule": row.schedule_id} for row in ledger[:370]]
        data["assignments"] = [painter_assignment_data(row) for row in WorkSchedulePainter.objects.filter(painter=item.painter).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property")[:30]]
        return Response(data)

    def patch(self, request, pk):
        if not verified_contractor(request.user):
            return Response({"detail": "Only the contractor can update an employee profile."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.filter(pk=pk, contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE).first()
        if not item:
            return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        for field in ("blood_group", "salary_basis"):
            if field in request.data:
                setattr(item, field, str(request.data.get(field) or "").strip().upper())
        for field in ("date_of_birth", "joined_on"):
            if field in request.data:
                setattr(item, field, parse_date(str(request.data.get(field) or "")) or None)
        if "salary_amount" in request.data:
            try: item.salary_amount = Decimal(str(request.data.get("salary_amount") or "0"))
            except InvalidOperation: return Response({"salary_amount": "Enter a valid salary or wage."}, status=status.HTTP_400_BAD_REQUEST)
        for field in ("is_active", "esi_applicable", "pf_applicable"):
            if field in request.data: setattr(item, field, bool(request.data.get(field)))
        if "name" in request.data:
            parts = str(request.data.get("name") or "").strip().split(maxsplit=1)
            item.painter.first_name = parts[0] if parts else ""
            item.painter.last_name = parts[1] if len(parts) > 1 else ""
            item.painter.save(update_fields=("first_name", "last_name", "updated_at"))
        profile, _ = PainterProfile.objects.get_or_create(user=item.painter)
        if "experience_years" in request.data: profile.experience_years = max(0, int(request.data.get("experience_years") or 0))
        if "skills" in request.data: profile.skills = str(request.data.get("skills") or "").strip()
        profile.save()
        item.save()
        return Response({"detail": "Employee updated."})


class InHouseAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        base = ContractorApplicatorTeam.objects.filter(pk=pk, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True)
        membership = base.filter(contractor=request.user).first() if request.user.role == BharathUser.Roles.CONTRACTOR else base.filter(painter=request.user).first()
        if not membership:
            return Response({"detail": "Active in-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        day = parse_date(str(request.data.get("date") or ""))
        attendance_status = str(request.data.get("status") or "").upper()
        if not day or attendance_status not in {choice[0] for choice in ApplicatorAttendance.Status.choices}:
            return Response({"detail": "Select a valid date and attendance status."}, status=status.HTTP_400_BAD_REQUEST)
        if day > timezone.localdate():
            return Response({"date": "Attendance cannot be recorded for a future date."}, status=status.HTTP_400_BAD_REQUEST)
        if day > timezone.localdate():
            return Response({"date": "Attendance cannot be recorded for a future date."}, status=status.HTTP_400_BAD_REQUEST)
        try: overtime_hours = Decimal(str(request.data.get("overtime_hours") or "0"))
        except InvalidOperation: return Response({"overtime_hours": "Enter valid overtime hours."}, status=status.HTTP_400_BAD_REQUEST)
        if overtime_hours < 0 or overtime_hours > 24:
            return Response({"overtime_hours": "Overtime must be between 0 and 24 hours."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user == membership.painter:
            if attendance_status != ApplicatorAttendance.Status.PRESENT or day != timezone.localdate():
                return Response({"detail": "You can mark only today's attendance as Present."}, status=status.HTTP_403_FORBIDDEN)
            schedule = WorkSchedule.objects.filter(pk=request.data.get("schedule"), painter_assignments__painter=request.user).first()
            if not schedule:
                return Response({"schedule": "Select the assigned site where you are present."}, status=status.HTTP_400_BAD_REQUEST)
            overtime_hours = Decimal("0")
        else:
            schedule = WorkSchedule.objects.filter(pk=request.data.get("schedule"), quotation__contractor=request.user).first() if request.data.get("schedule") else None
        row, _ = ApplicatorAttendance.objects.update_or_create(membership=membership, date=day, defaults={"status": attendance_status, "schedule": schedule, "note": str(request.data.get("note") or "").strip(), "overtime_hours": overtime_hours})
        return Response({"id": row.id, "date": row.date, "status": row.status, "note": row.note, "overtime_hours": row.overtime_hours}, status=status.HTTP_201_CREATED)


class MyInHouseEmploymentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.filter(painter=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True).select_related("contractor", "painter", "painter__painter_profile").prefetch_related("ledger_entries", "attendance_records").first()
        if not item:
            return Response({"detail": "You are not registered as an active in-house employee."}, status=status.HTTP_404_NOT_FOUND)
        data = inhouse_summary(item, request)
        data["contractor_name"] = item.contractor.get_full_name() or item.contractor.mobile
        attendance = item.attendance_records.all()
        month = request.query_params.get("month")
        if month:
            try: year, month_number = map(int, month.split("-")); attendance = attendance.filter(date__year=year, date__month=month_number)
            except (TypeError, ValueError): pass
        rows = list(attendance[:370])
        data["attendance"] = [{"date": row.date, "status": row.status, "note": row.note, "schedule": row.schedule_id, "overtime_hours": row.overtime_hours} for row in rows]
        data["attendance_summary"] = {"present": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.PRESENT), "half_day": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.HALF_DAY), "absent": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.ABSENT), "leave": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.LEAVE), "overtime_hours": sum((row.overtime_hours for row in rows), Decimal("0"))}
        data["assignments"] = [painter_assignment_data(row) for row in WorkSchedulePainter.objects.filter(painter=request.user).exclude(status=WorkSchedulePainter.Status.COMPLETED).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property")]
        return Response(data)


class MyInHouseEarningsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.filter(
            painter=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True,
        ).select_related("contractor", "painter").first()
        if not item:
            return self.marketplace_earnings(request)
        month = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month_number = map(int, month.split("-"))
        except (TypeError, ValueError):
            return Response({"month": "Select a valid month."}, status=status.HTTP_400_BAD_REQUEST)
        rows = list(item.attendance_records.filter(date__year=year, date__month=month_number).order_by("date"))
        salary = item.salary_amount or Decimal("0")
        daily_rate = salary if item.salary_basis == ContractorApplicatorTeam.SalaryBasis.DAILY else salary / (Decimal("6") if item.salary_basis == ContractorApplicatorTeam.SalaryBasis.WEEKLY else Decimal("26"))
        payable_units = sum((Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0") for row in rows), Decimal("0"))
        overtime = sum((row.overtime_hours for row in rows), Decimal("0"))
        bonuses = list(item.ledger_entries.filter(entry_type=ApplicatorLedgerEntry.EntryType.BONUS, date__year=year, date__month=month_number).order_by("-date", "-created_at"))
        bonus_total = sum((entry.amount for entry in bonuses), Decimal("0"))
        attendance_earning = (daily_rate * payable_units).quantize(Decimal("0.01"))
        return Response({
            "earning_type": "IN_HOUSE",
            "membership_id": item.id, "employee_name": request.user.get_full_name() or request.user.mobile,
            "employee_code": item.employee_code, "contractor_name": item.contractor.get_full_name() or item.contractor.mobile,
            "month": month, "salary_basis": item.salary_basis, "salary_amount": salary,
            "daily_rate": daily_rate.quantize(Decimal("0.01")), "payable_days": payable_units,
            "attendance_earning": attendance_earning, "bonus_total": bonus_total,
            "earned_amount": attendance_earning + bonus_total, "overtime_hours": overtime,
            "bonuses": [{"id": entry.id, "date": entry.date, "amount": entry.amount, "note": entry.note} for entry in bonuses],
            "attendance": [{"date": row.date, "status": row.status, "units": Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0"), "earning": (daily_rate * (Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0"))).quantize(Decimal("0.01")), "overtime_hours": row.overtime_hours} for row in rows],
        })

    def marketplace_earnings(self, request):
        month = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month_number = map(int, month.split("-"))
            month_start = date(year, month_number, 1)
            month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        except (TypeError, ValueError):
            return Response({"month": "Select a valid month."}, status=status.HTTP_400_BAD_REQUEST)
        assignments = WorkSchedulePainter.objects.filter(
            painter=request.user, schedule__proposed_start_date__lte=month_end, schedule__proposed_end_date__gte=month_start,
        ).exclude(schedule__status=WorkSchedule.Status.CANCELLED).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__property")
        records = []
        total = Decimal("0")
        for assignment in assignments:
            start = max(assignment.schedule.proposed_start_date, month_start); end = min(assignment.schedule.proposed_end_date, month_end)
            days = Decimal((end - start).days + 1); wage = assignment.agreed_wage or Decimal("0")
            earning = wage * (days if assignment.wage_type == WorkSchedulePainter.WageType.DAILY else (days / Decimal("7")))
            earning = earning.quantize(Decimal("0.01")); total += earning
            records.append({"id": assignment.id, "date": start, "end_date": end, "units": days, "earning": earning, "overtime_hours": Decimal("0"), "quotation_number": assignment.schedule.quotation.quotation_number, "property": assignment.schedule.quotation.property.name or assignment.schedule.quotation.property.property_type, "contractor": assignment.schedule.quotation.contractor.get_full_name() or assignment.schedule.quotation.contractor.mobile, "status": assignment.status})
        memberships = ContractorApplicatorTeam.objects.filter(painter=request.user)
        bonuses = ApplicatorLedgerEntry.objects.filter(membership__in=memberships, entry_type=ApplicatorLedgerEntry.EntryType.BONUS, date__year=year, date__month=month_number).order_by("-date")
        bonus_total = sum((entry.amount for entry in bonuses), Decimal("0"))
        return Response({"earning_type": "MARKETPLACE", "employee_name": request.user.get_full_name() or request.user.mobile, "employee_code": request.user.bharath_id, "month": month, "salary_basis": "ASSIGNMENT", "salary_amount": Decimal("0"), "daily_rate": Decimal("0"), "payable_days": sum((row["units"] for row in records), Decimal("0")), "attendance_earning": total, "bonus_total": bonus_total, "earned_amount": total + bonus_total, "overtime_hours": Decimal("0"), "bonuses": [{"id": entry.id, "date": entry.date, "amount": entry.amount, "note": entry.note} for entry in bonuses], "attendance": records})


def review_assignment_data(assignment, user):
    schedule = assignment.schedule
    contractor = schedule.quotation.contractor
    other = assignment.painter if user == contractor else contractor
    completed_at = assignment.work_completed_at or schedule.work_completed_at
    existing = assignment.reviews.filter(reviewer=user).first()
    return {"assignment_id": assignment.id, "quotation_number": schedule.quotation.quotation_number, "property": schedule.quotation.property.name or schedule.quotation.property.property_type, "start_date": schedule.proposed_start_date, "end_date": schedule.proposed_end_date, "completed_at": completed_at, "reviewee_name": other.get_full_name() or other.mobile, "reviewee_bharath_id": other.bharath_id, "existing_review": {"rating": existing.rating, "comment": existing.comment, "created_at": existing.created_at} if existing else None}


class WorkReviewListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def eligible(self, user):
        queryset = WorkSchedulePainter.objects.filter(status=WorkSchedulePainter.Status.COMPLETED).select_related("painter", "schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__property").prefetch_related("reviews")
        if user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(schedule__quotation__contractor=user)
        elif user.role == BharathUser.Roles.PAINTER:
            queryset = queryset.filter(painter=user)
        else:
            return WorkSchedulePainter.objects.none()
        cutoff = timezone.now() - timedelta(days=45)
        result = []
        for assignment in queryset:
            schedule = assignment.schedule
            duration = (schedule.proposed_end_date - schedule.proposed_start_date).days + 1
            completed_at = assignment.work_completed_at or schedule.work_completed_at
            if duration >= 3 and completed_at and completed_at >= cutoff:
                result.append(assignment)
        return result

    def get(self, request):
        if request.user.role not in {BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER}:
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        received = WorkReview.objects.filter(reviewee=request.user)
        average = received.aggregate(value=models.Avg("rating"))["value"]
        return Response({"average_rating": round(average, 2) if average else None, "received_count": received.count(), "assignments": [review_assignment_data(item, request.user) for item in self.eligible(request.user)]})

    def post(self, request):
        assignment = WorkSchedulePainter.objects.select_related("painter", "schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__property").filter(pk=request.data.get("assignment_id")).first()
        if not assignment:
            return Response({"assignment_id": "Work assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        if assignment not in self.eligible(request.user):
            return Response({"detail": "Reviews require at least 3 completed work days and must be written within 45 days of completion."}, status=status.HTTP_400_BAD_REQUEST)
        if WorkReview.objects.filter(assignment=assignment, reviewer=request.user).exists():
            return Response({"detail": "You have already reviewed this work."}, status=status.HTTP_400_BAD_REQUEST)
        try: rating = int(request.data.get("rating"))
        except (TypeError, ValueError): rating = 0
        if rating not in range(1, 6):
            return Response({"rating": "Select a rating from 1 to 5 stars."}, status=status.HTTP_400_BAD_REQUEST)
        contractor = assignment.schedule.quotation.contractor
        reviewee = assignment.painter if request.user == contractor else contractor
        item = WorkReview.objects.create(assignment=assignment, reviewer=request.user, reviewee=reviewee, rating=rating, comment=str(request.data.get("comment") or "").strip())
        return Response({"id": item.id, "rating": item.rating, "comment": item.comment}, status=status.HTTP_201_CREATED)


class InHouseLedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        membership = ContractorApplicatorTeam.objects.filter(pk=pk, contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE).first()
        if not membership:
            return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        entry_type = str(request.data.get("entry_type") or "").upper()
        try:
            amount = Decimal(str(request.data.get("amount") or "0"))
        except InvalidOperation:
            amount = Decimal("0")
        day = parse_date(str(request.data.get("date") or ""))
        if entry_type not in {choice[0] for choice in ApplicatorLedgerEntry.EntryType.choices} or amount <= 0 or not day:
            return Response({"detail": "Select a valid transaction type, date, and amount."}, status=status.HTTP_400_BAD_REQUEST)
        schedule = WorkSchedule.objects.filter(pk=request.data.get("schedule"), quotation__contractor=request.user).first() if request.data.get("schedule") else None
        row = ApplicatorLedgerEntry.objects.create(membership=membership, date=day, entry_type=entry_type, amount=amount, payment_mode=str(request.data.get("payment_mode") or "").upper(), reference=str(request.data.get("reference") or "").strip(), note=str(request.data.get("note") or "").strip(), schedule=schedule)
        return Response({"id": row.id}, status=status.HTTP_201_CREATED)


class ApplicatorProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        profile, _ = PainterProfile.objects.get_or_create(user=request.user)
        photo = request.build_absolute_uri(request.user.profile_photo.url) if request.user.profile_photo else None
        return Response({
            "name": request.user.get_full_name() or request.user.mobile,
            "profile_photo": photo,
            "mobile": request.user.mobile,
            "email": request.user.email,
            "bharath_id": request.user.bharath_id,
            "verification_status": request.user.verification_status,
            "experience_years": profile.experience_years,
            "skills": profile.skills,
            "emergency_contact_name": profile.emergency_contact_name,
            "emergency_contact_number": profile.emergency_contact_number,
            "blood_group": profile.blood_group,
            "permanent_address": profile.permanent_address,
            "current_location": profile.current_location,
            "willing_to_travel": profile.willing_to_travel,
            "availability": profile.availability,
        })

    def patch(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        profile, _ = PainterProfile.objects.get_or_create(user=request.user)
        for field in ("skills", "emergency_contact_name", "emergency_contact_number", "blood_group", "permanent_address", "current_location", "willing_to_travel"):
            if field in request.data:
                setattr(profile, field, request.data[field])
        if "experience_years" in request.data:
            profile.experience_years = max(0, int(request.data.get("experience_years") or 0))
        if "name" in request.data:
            parts = str(request.data.get("name") or "").strip().split(maxsplit=1)
            request.user.first_name = parts[0] if parts else ""
            request.user.last_name = parts[1] if len(parts) > 1 else ""
        if request.FILES.get("profile_photo"):
            request.user.profile_photo = request.FILES["profile_photo"]
        request.user.save(update_fields=("first_name", "last_name", "profile_photo", "updated_at"))
        profile.save()
        return self.get(request)


class ApplicatorAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees use site attendance instead of marketplace availability."}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        profile, _ = PainterProfile.objects.get_or_create(user=request.user)
        assignments = WorkSchedulePainter.objects.filter(painter=request.user).exclude(
            schedule__status=WorkSchedule.Status.CANCELLED
        ).select_related("schedule", "schedule__quotation", "schedule__quotation__property")
        bookings = ApplicatorBooking.objects.filter(
            applicator=request.user, status=ApplicatorBooking.Status.CONFIRMED
        ).select_related("contractor")
        blocks = ApplicatorAvailabilityBlock.objects.filter(applicator=request.user)
        return Response({
            "current_location": profile.current_location,
            "schedule": [{
                "id": item.id,
                "source": "ASSIGNMENT",
                "start_date": item.schedule.proposed_start_date,
                "end_date": item.schedule.proposed_end_date,
                "status": item.status,
                "quotation_number": item.schedule.quotation.quotation_number,
                "property": item.schedule.quotation.property.name or item.schedule.quotation.property.property_type,
                "city": item.schedule.quotation.property.city,
            } for item in assignments] + [{
                "id": f"booking-{item.id}",
                "source": "BOOKING",
                "start_date": item.start_date,
                "end_date": item.end_date,
                "status": item.status,
                "quotation_number": "External booking",
                "property": item.work_type,
                "city": item.pincode,
            } for item in bookings] + [{
                "id": f"block-{item.id}",
                "block_id": item.id,
                "source": "BLOCK",
                "start_date": item.start_date,
                "end_date": item.end_date,
                "status": "BLOCKED",
                "quotation_number": "Personal block",
                "property": item.reason or "Unavailable",
                "city": profile.current_location,
            } for item in blocks],
        })


class ApplicatorAvailabilityBlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        start = parse_date(str(request.data.get("start_date") or ""))
        end = parse_date(str(request.data.get("end_date") or ""))
        today = timezone.localdate()
        last_allowed = today + timedelta(days=45)
        if not start or not end or end < start:
            return Response({"dates": "Select valid start and end dates."}, status=status.HTTP_400_BAD_REQUEST)
        if start < timezone.localdate():
            return Response({"dates": "Booking dates cannot be in the past."}, status=status.HTTP_400_BAD_REQUEST)
        if start < today or end > last_allowed:
            return Response({"dates": f"You can block dates only from today through {last_allowed}."}, status=status.HTTP_400_BAD_REQUEST)
        if ApplicatorAvailabilityBlock.objects.filter(
            applicator=request.user, start_date__lte=end, end_date__gte=start,
        ).exists():
            return Response({"dates": "These dates are already blocked."}, status=status.HTTP_400_BAD_REQUEST)
        occupied = ApplicatorBooking.objects.filter(
            applicator=request.user, status=ApplicatorBooking.Status.CONFIRMED,
            start_date__lte=end, end_date__gte=start,
        ).exists() or WorkSchedulePainter.objects.filter(
            painter=request.user, schedule__status=WorkSchedule.Status.CONFIRMED,
            schedule__proposed_start_date__lte=end, schedule__proposed_end_date__gte=start,
        ).exists()
        if occupied:
            return Response({"dates": "Assigned or booked work already exists on these dates."}, status=status.HTTP_400_BAD_REQUEST)
        item = ApplicatorAvailabilityBlock.objects.create(
            applicator=request.user,
            start_date=start,
            end_date=end,
            reason=str(request.data.get("reason") or "").strip(),
        )
        return Response({"id": item.id, "start_date": item.start_date, "end_date": item.end_date, "reason": item.reason}, status=status.HTTP_201_CREATED)


class ApplicatorAvailabilityBlockDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        item = ApplicatorAvailabilityBlock.objects.filter(pk=pk, applicator=request.user).first()
        if not item:
            return Response({"detail": "Blocked period not found."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def seeking_post_data(item):
    profile = item.painter.painter_profile if hasattr(item.painter, "painter_profile") else None
    confirmed = item.bookings.filter(status=ApplicatorBooking.Status.CONFIRMED).order_by("start_date")
    booked_periods = [{"start_date": booking.start_date, "end_date": booking.end_date} for booking in confirmed]
    availability_status = "PARTIALLY_BOOKED" if booked_periods else "AVAILABLE"
    if item.available_until and booked_periods:
        total_days = (item.available_until - item.available_from).days + 1
        covered = set()
        from datetime import timedelta
        for period in booked_periods:
            current = max(period["start_date"], item.available_from)
            last = min(period["end_date"], item.available_until)
            while current <= last:
                covered.add(current); current += timedelta(days=1)
        if len(covered) >= total_days:
            availability_status = "FULLY_BOOKED"
    return {"id": item.id, "painter": item.painter_id, "painter_name": item.painter.get_full_name() or item.painter.mobile,
            "mobile": item.painter.mobile, "bharath_id": item.painter.bharath_id, "experience_years": profile.experience_years if profile else 0,
            "title": item.title, "description": item.description, "skills": item.skills, "preferred_location": item.preferred_location,
            "city": item.city, "pincode": item.pincode, "state": item.state,
            "latitude": item.latitude, "longitude": item.longitude, "radius_km": item.radius_km,
            "location_source": item.location_source,
            "available_from": item.available_from, "available_until": item.available_until, "wage_type": item.wage_type,
            "expected_wage": item.expected_wage, "willing_to_travel": item.willing_to_travel, "status": item.status,
            "availability_status": availability_status, "booked_periods": booked_periods,
            "created_at": item.created_at, "updated_at": item.updated_at}


def painter_assignment_data(item):
    schedule = item.schedule
    quotation = schedule.quotation
    work_scope = [{
        "id": line.id,
        "room": line.room.name if line.room else "General",
        "description": line.description,
        "service": line.service_type.name if line.service_type else "",
        "paint_type": line.paint_type.name if line.paint_type else "",
        "paint_brand": line.paint_brand.name if line.paint_brand else "",
        "color": line.color.name if line.color else "",
        "coats": line.coats,
        "quantity": line.quantity,
        "unit": line.unit.name if line.unit else "sq ft",
    } for line in quotation.items.all()]
    return {"id": item.id, "status": item.status, "wage_type": item.wage_type, "agreed_wage": item.agreed_wage,
            "painter_note": item.painter_note, "assigned_at": item.assigned_at, "responded_at": item.responded_at,
            "schedule": schedule.id, "schedule_status": schedule.status, "quotation_number": quotation.quotation_number,
            "contractor_name": quotation.contractor.get_full_name() or quotation.contractor.mobile,
            "contractor_mobile": quotation.contractor.mobile, "customer_name": quotation.customer.name,
            "customer_bharath_id": quotation.customer.bharath_id,
            "property_name": quotation.property.name or quotation.property.property_type,
            "flat_number": quotation.property.flat_number,
            "block_name": quotation.property.block_name,
            "address": quotation.property.address, "city": quotation.property.city,
            "pincode": quotation.property.pincode,
            "start_date": schedule.proposed_start_date, "end_date": schedule.proposed_end_date,
            "quotation_notes": quotation.notes, "work_scope": work_scope,
            "assignment_started_at": item.work_started_at, "assignment_completed_at": item.work_completed_at,
            "on_the_way_at": item.on_the_way_at,
            "work_started_at": schedule.work_started_at, "work_completed_at": schedule.work_completed_at}


class PainterAssignmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        queryset = WorkSchedulePainter.objects.filter(painter=request.user).exclude(status=WorkSchedulePainter.Status.COMPLETED).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property").prefetch_related("schedule__quotation__items__room", "schedule__quotation__items__service_type", "schedule__quotation__items__paint_type", "schedule__quotation__items__paint_brand", "schedule__quotation__items__color", "schedule__quotation__items__unit")
        return Response([painter_assignment_data(item) for item in queryset.order_by("-assigned_at")])


class PainterDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        assignments = WorkSchedulePainter.objects.filter(painter=request.user)
        recent_completed = assignments.filter(status=WorkSchedulePainter.Status.COMPLETED).select_related(
            "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__property"
        ).order_by("-work_completed_at")[:5]
        return Response({
            "name": request.user.get_full_name() or request.user.mobile,
            "counts": {
                "assigned": assignments.filter(status=WorkSchedulePainter.Status.ASSIGNED).count(),
                "in_progress": assignments.filter(status=WorkSchedulePainter.Status.IN_PROGRESS).count(),
                "completed": assignments.filter(status=WorkSchedulePainter.Status.COMPLETED).count(),
                "total": assignments.count(),
                "active_contractors": WorkSchedule.objects.filter(
                    proposed_start_date__lte=timezone.localdate(),
                    proposed_end_date__gte=timezone.localdate(),
                    status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
                ).values("quotation__contractor_id").distinct().count(),
            },
            "recent_completed": [{
                "id": item.id,
                "quotation_number": item.schedule.quotation.quotation_number,
                "property": item.schedule.quotation.property.name or item.schedule.quotation.property.property_type,
                "contractor": item.schedule.quotation.contractor.get_full_name() or item.schedule.quotation.contractor.mobile,
                "completed_at": item.work_completed_at,
            } for item in recent_completed],
        })


class PainterAssignmentProgressView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        item = WorkSchedulePainter.objects.select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property").prefetch_related("schedule__quotation__items__room", "schedule__quotation__items__service_type", "schedule__quotation__items__paint_type", "schedule__quotation__items__paint_brand", "schedule__quotation__items__color", "schedule__quotation__items__unit").filter(pk=pk, painter=request.user).first()
        if not item:
            return Response({"detail": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        schedule = item.schedule
        if schedule.status == WorkSchedule.Status.CANCELLED:
            return Response({"detail": "This work schedule has been cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        action = str(request.data.get("action") or "").upper()
        now = timezone.now()
        if action == "ON_THE_WAY":
            if item.status != WorkSchedulePainter.Status.ASSIGNED:
                return Response({"detail": "This notification is available before work starts."}, status=status.HTTP_400_BAD_REQUEST)
            item.on_the_way_at = now
            item.save(update_fields=("on_the_way_at",))
            customer = schedule.quotation.customer.portal_user
            notify(customer, request.user, "ON_THE_WAY", "Applicator is on the way", f"{request.user.get_full_name() or request.user.mobile} is travelling to {schedule.quotation.property.name or schedule.quotation.property.property_type}.", "/work-schedules")
            notify(schedule.quotation.contractor, request.user, "ON_THE_WAY", "Applicator is on the way", f"{request.user.get_full_name() or request.user.mobile} is travelling to the site.", "/work-schedules")
        elif action == "START":
            if item.status != WorkSchedulePainter.Status.ASSIGNED:
                return Response({"detail": "Only an assigned job can be started."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.localdate() < schedule.proposed_start_date:
                return Response({"detail": f"Work can be started on or after {schedule.proposed_start_date}."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = WorkSchedulePainter.Status.IN_PROGRESS
            item.work_started_at = now
            item.save(update_fields=("status", "work_started_at"))
            if schedule.status == WorkSchedule.Status.CONFIRMED:
                schedule.status = WorkSchedule.Status.IN_PROGRESS
                schedule.work_started_at = schedule.work_started_at or now
                schedule.customer_seen_update_at = None
                schedule.save(update_fields=("status", "work_started_at", "customer_seen_update_at", "updated_at"))
                schedule.quotation.status = Quotation.Status.IN_PROGRESS
                schedule.quotation.save(update_fields=("status", "updated_at"))
        elif action == "COMPLETE":
            if item.status != WorkSchedulePainter.Status.IN_PROGRESS:
                return Response({"detail": "Start your work before marking it completed."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = WorkSchedulePainter.Status.COMPLETED
            item.work_completed_at = now
            item.save(update_fields=("status", "work_completed_at"))
            if not schedule.painter_assignments.exclude(status=WorkSchedulePainter.Status.COMPLETED).exists():
                schedule.status = WorkSchedule.Status.COMPLETED
                schedule.work_completed_at = now
                schedule.customer_seen_update_at = None
                schedule.save(update_fields=("status", "work_completed_at", "customer_seen_update_at", "updated_at"))
                schedule.quotation.status = Quotation.Status.COMPLETED
                schedule.quotation.save(update_fields=("status", "updated_at"))
        else:
            return Response({"action": "Select START or COMPLETE."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(painter_assignment_data(item))


class PainterSeekingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees cannot use job-seeking posts."}, status=status.HTTP_403_FORBIDDEN)
        queryset = PainterSeekingPost.objects.select_related("painter", "painter__painter_profile").prefetch_related("bookings")
        today = timezone.localdate()
        if request.user.role == BharathUser.Roles.PAINTER:
            queryset = queryset.filter(painter=request.user).filter(
                models.Q(available_until__isnull=True) | models.Q(available_until__gte=today)
            )
        elif request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(status=PainterSeekingPost.Status.ACTIVE).filter(
                models.Q(available_until__isnull=True) | models.Q(available_until__gte=today)
            )
        elif request.user.role == BharathUser.Roles.ADMIN:
            pass
        else:
            return Response({"detail": "Paint Applicator, contractor, or admin access only."}, status=status.HTTP_403_FORBIDDEN)
        search = str(request.query_params.get("search") or "").strip()
        if search:
            from django.db import models as django_models
            queryset = queryset.filter(django_models.Q(title__icontains=search) | django_models.Q(skills__icontains=search) | django_models.Q(preferred_location__icontains=search) | django_models.Q(city__icontains=search) | django_models.Q(pincode__icontains=search) | django_models.Q(painter__first_name__icontains=search))
        location = str(request.query_params.get("location") or "").strip()
        if location:
            from django.db import models as django_models
            queryset = queryset.filter(django_models.Q(preferred_location__icontains=location) | django_models.Q(city__icontains=location) | django_models.Q(pincode__icontains=location))
        date_from = parse_date(str(request.query_params.get("date_from") or ""))
        date_to = parse_date(str(request.query_params.get("date_to") or ""))
        if request.query_params.get("date_from") and not date_from:
            return Response({"date_from": "Select a valid start date."}, status=status.HTTP_400_BAD_REQUEST)
        if request.query_params.get("date_to") and not date_to:
            return Response({"date_to": "Select a valid end date."}, status=status.HTTP_400_BAD_REQUEST)
        if date_from and date_to and date_to < date_from:
            return Response({"dates": "End date must be on or after start date."}, status=status.HTTP_400_BAD_REQUEST)
        requested_start = date_from or timezone.localdate()
        requested_end = date_to or date_from
        try:
            search_latitude, search_longitude, search_radius = geo_values(request.query_params)
        except ValueError as error:
            return Response({"location": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        if requested_end:
            queryset = queryset.filter(available_from__lte=requested_end).filter(
                models.Q(available_until__isnull=True) | models.Q(available_until__gte=requested_start)
            )
        results = []
        for item in queryset:
            result = seeking_post_data(item)
            if search_latitude is not None:
                if item.latitude is None or item.longitude is None:
                    continue
                distance = distance_km(search_latitude, search_longitude, item.latitude, item.longitude)
                if distance > search_radius or distance > max(1, item.radius_km or 10):
                    continue
                result["distance_km"] = round(distance, 1)
            if request.user.role == BharathUser.Roles.CONTRACTOR:
                if requested_end and applicator_has_date_conflict(item.painter, requested_start, requested_end):
                    continue
                if not requested_end:
                    open_start = max(timezone.localdate(), item.available_from)
                    open_end = item.available_until or (open_start + timedelta(days=45))
                    if applicator_has_date_conflict(item.painter, open_start, open_end):
                        continue
            results.append(result)
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            for result in results:
                if result["availability_status"] != "AVAILABLE":
                    result["status"] = result["availability_status"].replace("_", " ")
        return Response(results)

    def post(self, request):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees cannot post job-seeking availability."}, status=status.HTTP_403_FORBIDDEN)
        if not verified_painter(request.user):
            return Response({"detail": "Only verified Paint Applicators can post job-seeking availability."}, status=status.HTTP_403_FORBIDDEN)
        enforce_job_seeking_post_limit(request.user)
        start = parse_date(str(request.data.get("available_from") or "")); end = parse_date(str(request.data.get("available_until") or "")) if request.data.get("available_until") else None
        if not start or (end and end < start): return Response({"dates": "Enter valid availability dates."}, status=status.HTTP_400_BAD_REQUEST)
        title = str(request.data.get("title") or "").strip(); pincode = str(request.data.get("pincode") or "").strip()
        pin_codes = [value.strip() for value in pincode.split(",") if value.strip()]
        if not title: return Response({"title": "Select at least one work type."}, status=status.HTTP_400_BAD_REQUEST)
        has_coordinates = request.data.get("latitude") not in (None, "") and request.data.get("longitude") not in (None, "")
        if (not pin_codes and not has_coordinates) or any(len(value) != 6 or not value.isdigit() for value in pin_codes): return Response({"pincode": "Select an Indian PIN location or use your mobile location."}, status=status.HTTP_400_BAD_REQUEST)
        enforce_location_limit(request.user, pin_codes)
        try:
            latitude, longitude, radius_km = geo_values(request.data)
        except ValueError as error:
            return Response({"location": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        pincode = ", ".join(dict.fromkeys(pin_codes))
        location = str(request.data.get("preferred_location") or pincode).strip()
        city = str(request.data.get("city") or "India").strip()
        item = PainterSeekingPost.objects.create(
            painter=request.user, title=title, description=str(request.data.get("description") or "").strip(),
            skills=str(request.data.get("skills") or "").strip(), preferred_location=location, city=city,
            pincode=pincode, state=str(request.data.get("state") or "").strip(), latitude=latitude,
            longitude=longitude, radius_km=radius_km,
            location_source=str(request.data.get("location_source") or "MANUAL")[:12],
            available_from=start, available_until=end,
            wage_type=request.data.get("wage_type") if request.data.get("wage_type") in {x[0] for x in PainterSeekingPost.WageType.choices} else PainterSeekingPost.WageType.DAILY,
            expected_wage=request.data.get("expected_wage") or None,
            willing_to_travel=bool(request.data.get("willing_to_travel")),
        )
        return Response(seeking_post_data(item), status=status.HTTP_201_CREATED)


class PainterSeekingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees cannot manage job-seeking posts."}, status=status.HTTP_403_FORBIDDEN)
        item = PainterSeekingPost.objects.select_related("painter", "painter__painter_profile").filter(pk=pk, painter=request.user).first()
        if not item: return Response({"detail": "Post not found."}, status=status.HTTP_404_NOT_FOUND)
        for field in ("title", "description", "skills", "preferred_location", "city", "pincode", "state", "latitude", "longitude", "radius_km", "location_source", "wage_type", "expected_wage", "willing_to_travel", "status"):
            if field in request.data: setattr(item, field, request.data[field] if request.data[field] != "" else None if field == "expected_wage" else "")
        if "pincode" in request.data:
            pin_codes = [value.strip() for value in str(request.data.get("pincode") or "").split(",") if value.strip()]
            if not pin_codes or any(len(value) != 6 or not value.isdigit() for value in pin_codes): return Response({"pincode": "Add one or more valid 6-digit Indian PIN codes."}, status=status.HTTP_400_BAD_REQUEST)
            item.pincode = ", ".join(dict.fromkeys(pin_codes))
            if "preferred_location" not in request.data:
                item.preferred_location = item.pincode
        try:
            geo_values({"latitude": item.latitude, "longitude": item.longitude, "radius_km": item.radius_km})
        except ValueError as error:
            return Response({"location": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        if "available_from" in request.data: item.available_from = parse_date(str(request.data["available_from"]))
        if "available_until" in request.data: item.available_until = parse_date(str(request.data["available_until"])) if request.data["available_until"] else None
        item.save(); return Response(seeking_post_data(item))

    def delete(self, request, pk):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees cannot manage job-seeking posts."}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = PainterSeekingPost.objects.filter(pk=pk, painter=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


def applicator_booking_data(item):
    return {
        "id": item.id,
        "contractor": item.contractor_id,
        "contractor_name": item.contractor.get_full_name() or item.contractor.mobile,
        "contractor_mobile": item.contractor.mobile,
        "applicator": item.applicator_id,
        "applicator_name": item.applicator.get_full_name() or item.applicator.mobile,
        "applicator_mobile": item.applicator.mobile,
        "applicator_bharath_id": item.applicator.bharath_id,
        "seeking_post": item.seeking_post_id,
        "work_type": item.work_type,
        "pincode": item.pincode,
        "start_date": item.start_date,
        "end_date": item.end_date,
        "wage_type": item.wage_type,
        "agreed_wage": item.agreed_wage,
        "notes": item.notes,
        "status": item.status,
        "created_at": item.created_at,
        "responded_at": item.responded_at,
    }


class ApplicatorBookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees do not use marketplace booking requests."}, status=status.HTTP_403_FORBIDDEN)
        queryset = ApplicatorBooking.objects.select_related("contractor", "applicator", "seeking_post")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(contractor=request.user)
            notification_count = queryset.filter(contractor_seen_response=False, status__in=(ApplicatorBooking.Status.CONFIRMED, ApplicatorBooking.Status.REJECTED)).count()
        elif request.user.role == BharathUser.Roles.PAINTER:
            queryset = queryset.filter(applicator=request.user)
            notification_count = queryset.filter(status=ApplicatorBooking.Status.PENDING).count()
        else:
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        response = Response({
            "pending_count": queryset.filter(status=ApplicatorBooking.Status.PENDING).count(),
            "notification_count": notification_count,
            "results": [applicator_booking_data(item) for item in queryset],
        })
        if request.user.role == BharathUser.Roles.CONTRACTOR and request.query_params.get("mark_seen") == "1":
            queryset.filter(contractor_seen_response=False, status__in=(ApplicatorBooking.Status.CONFIRMED, ApplicatorBooking.Status.REJECTED)).update(contractor_seen_response=True)
        return response

    def post(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        post = PainterSeekingPost.objects.select_related("painter").filter(
            models.Q(available_until__isnull=True) | models.Q(available_until__gte=timezone.localdate()),
            pk=request.data.get("seeking_post"), status=PainterSeekingPost.Status.ACTIVE,
        ).first()
        applicator = post.painter if post else BharathUser.objects.filter(
            pk=request.data.get("applicator"), role=BharathUser.Roles.PAINTER, is_active=True,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).first()
        if not applicator or not verified_painter(applicator):
            return Response({"applicator": "Select a verified Paint Applicator."}, status=status.HTTP_400_BAD_REQUEST)
        start = parse_date(str(request.data.get("start_date") or "")); end = parse_date(str(request.data.get("end_date") or ""))
        if not start or not end or end < start:
            return Response({"dates": "Select valid start and end dates."}, status=status.HTTP_400_BAD_REQUEST)
        if post and (start < post.available_from or (post.available_until and end > post.available_until)):
            return Response({"dates": "Select dates inside the applicator's posted availability."}, status=status.HTTP_400_BAD_REQUEST)
        booking_clash = ApplicatorBooking.objects.filter(
            applicator=applicator, status=ApplicatorBooking.Status.CONFIRMED,
            start_date__lte=end, end_date__gte=start,
        ).exists()
        assignment_clash = WorkSchedulePainter.objects.filter(
            painter=applicator, schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
            schedule__proposed_start_date__lte=end, schedule__proposed_end_date__gte=start,
        ).exists()
        manual_block_clash = ApplicatorAvailabilityBlock.objects.filter(
            applicator=applicator, start_date__lte=end, end_date__gte=start,
        ).exists()
        if booking_clash or assignment_clash or manual_block_clash:
            return Response({"dates": "This applicator is already booked for one or more selected dates."}, status=status.HTTP_400_BAD_REQUEST)
        pincode = str(request.data.get("pincode") or "").strip()
        allowed_pins = [value.strip() for value in post.pincode.split(",") if value.strip()] if post else []
        if post and pincode not in allowed_pins:
            return Response({"pincode": "Select one of the applicator's available PIN codes."}, status=status.HTTP_400_BAD_REQUEST)
        work_type = str(request.data.get("work_type") or ("Paint application work" if not post else "")).strip()
        if post and not work_type:
            return Response({"work_type": "Select required work."}, status=status.HTTP_400_BAD_REQUEST)
        item = ApplicatorBooking.objects.create(
            contractor=request.user, applicator=applicator, seeking_post=post,
            work_type=work_type, pincode=pincode, start_date=start, end_date=end,
            wage_type=request.data.get("wage_type") if request.data.get("wage_type") in {value[0] for value in PainterSeekingPost.WageType.choices} else PainterSeekingPost.WageType.DAILY,
            agreed_wage=request.data.get("agreed_wage") or None,
            notes=str(request.data.get("notes") or "").strip(),
        )
        notify(item.applicator, request.user, "BOOKING", "New booking request", f"{work_type}: {start} to {end}", "/applicator-bookings")
        return Response(applicator_booking_data(item), status=status.HTTP_201_CREATED)


class ApplicatorBookingSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        term = str(request.query_params.get("search") or "").strip()
        if len(term) < 3:
            return Response([])
        users = BharathUser.objects.filter(
            role=BharathUser.Roles.PAINTER, is_active=True, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).filter(models.Q(mobile__icontains=term) | models.Q(bharath_id__icontains=term)).select_related("painter_profile")[:20]
        return Response([{
            "id": user.id, "name": user.get_full_name() or user.mobile, "mobile": user.mobile,
            "bharath_id": user.bharath_id, "skills": user.painter_profile.skills if hasattr(user, "painter_profile") else "",
        } for user in users])


class ApplicatorBookingActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees do not use marketplace bookings."}, status=status.HTTP_403_FORBIDDEN)
        item = ApplicatorBooking.objects.select_related("contractor", "applicator", "seeking_post").filter(pk=pk).first()
        if not item:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        action = str(request.data.get("action") or "").upper()
        if request.user == item.applicator and action in {"ACCEPT", "REJECT"}:
            if item.status != ApplicatorBooking.Status.PENDING:
                return Response({"detail": "This request has already been answered."}, status=status.HTTP_400_BAD_REQUEST)
            if action == "ACCEPT":
                booking_clash = ApplicatorBooking.objects.filter(
                    applicator=item.applicator, status=ApplicatorBooking.Status.CONFIRMED,
                    start_date__lte=item.end_date, end_date__gte=item.start_date,
                ).exclude(pk=item.pk).exists()
                assignment_clash = WorkSchedulePainter.objects.filter(
                    painter=item.applicator, schedule__status=WorkSchedule.Status.CONFIRMED,
                    schedule__proposed_start_date__lte=item.end_date, schedule__proposed_end_date__gte=item.start_date,
                ).exists()
                manual_block_clash = ApplicatorAvailabilityBlock.objects.filter(
                    applicator=item.applicator, start_date__lte=item.end_date, end_date__gte=item.start_date,
                ).exists()
                if booking_clash or assignment_clash or manual_block_clash:
                    return Response({"detail": "These dates are already occupied."}, status=status.HTTP_400_BAD_REQUEST)
                item.status = ApplicatorBooking.Status.CONFIRMED
                JobApplication.objects.filter(
                    painter=item.applicator,
                    status=JobApplication.Status.APPLIED,
                ).update(status=JobApplication.Status.WITHDRAWN)
            else:
                item.status = ApplicatorBooking.Status.REJECTED
            item.responded_at = timezone.now()
            item.contractor_seen_response = False
            item.save(update_fields=("status", "responded_at", "contractor_seen_response", "updated_at"))
            notify(item.contractor, request.user, "BOOKING", "Booking response", f"{item.applicator.get_full_name() or item.applicator.mobile}: {item.get_status_display()}", "/applicator-bookings")
        elif request.user == item.contractor and action == "CANCEL":
            if item.status not in {ApplicatorBooking.Status.PENDING, ApplicatorBooking.Status.CONFIRMED}:
                return Response({"detail": "This booking cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = ApplicatorBooking.Status.CANCELLED
            item.save(update_fields=("status", "updated_at"))
        else:
            return Response({"detail": "Action not allowed."}, status=status.HTTP_403_FORBIDDEN)
        return Response(applicator_booking_data(item))


class JobActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        date_from = parse_date(str(request.query_params.get("date_from") or ""))
        date_to = parse_date(str(request.query_params.get("date_to") or ""))
        if date_from and date_to and date_to < date_from:
            return Response({"dates": "End date must be on or after start date."}, status=status.HTTP_400_BAD_REQUEST)

        def visible(start, end=None):
            end = end or start
            return (not date_from or end >= date_from) and (not date_to or start <= date_to)

        rows = []
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            jobs = Job.objects.filter(contractor=request.user).prefetch_related("applications").order_by("-created_at")
            for job in jobs:
                end = job_end_date(job)
                if not visible(job.start_date, end):
                    continue
                accepted_applications = job.applications.filter(
                    status__in=(
                        JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED,
                        JobApplication.Status.CANCELLED, JobApplication.Status.COMPLETED,
                    ),
                ).select_related("painter")
                accepted = accepted_applications.filter(
                    status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED, JobApplication.Status.COMPLETED),
                ).count()
                rows.append({
                    "id": f"job-{job.id}", "section": "POSTS", "activity_type": "Job post",
                    "title": job.title, "person": f"{accepted} accepted / {job.number_of_painters} required",
                    "location": f"{job.location}, {job.city}", "start_date": job.start_date, "end_date": end,
                    "status": job.status, "detail": f"Reached {job.applications.count()} applicants and filled {accepted} position(s).",
                    "created_at": job.created_at,
                })
                for application in accepted_applications:
                    rows.append({
                        "id": f"accepted-{application.id}",
                        "application_id": application.id,
                        "section": "HISTORY" if application.status == JobApplication.Status.CANCELLED else "ACCEPTED",
                        "activity_type": "Accepted applicator",
                        "title": job.title, "person": application.painter.get_full_name() or application.painter.mobile,
                        "location": f"{job.location}, {job.city}", "start_date": job.start_date, "end_date": end,
                        "status": application.status, "cancellation_reason": application.cancellation_reason,
                        "my_rating": application.contractor_rating,
                        "detail": "Dates remain occupied until you approve or decline this cancellation request." if application.status == JobApplication.Status.CANCELLATION_REQUESTED else "Filled a posted requirement with a verified Paint Applicator.",
                        "created_at": application.updated_at,
                    })
            bookings = ApplicatorBooking.objects.filter(contractor=request.user).select_related("applicator")
            for booking in bookings:
                if visible(booking.start_date, booking.end_date):
                    rows.append({
                        "id": f"booking-{booking.id}", "section": "ACCEPTED", "activity_type": "Applicator booking",
                        "title": booking.work_type, "person": booking.applicator.get_full_name() or booking.applicator.mobile,
                        "location": booking.pincode, "start_date": booking.start_date, "end_date": booking.end_date,
                        "status": booking.status, "detail": "Directly connected with an available Paint Applicator.",
                        "created_at": booking.created_at,
                    })
        else:
            posts = PainterSeekingPost.objects.filter(painter=request.user).prefetch_related("bookings")
            for post in posts:
                end = post.available_until or post.available_from
                if visible(post.available_from, end):
                    rows.append({
                        "id": f"seeking-{post.id}", "section": "POSTS", "activity_type": "Availability post",
                        "title": post.title, "person": f"{post.bookings.count()} booking request(s)",
                        "location": post.pincode or post.preferred_location, "start_date": post.available_from, "end_date": end,
                        "status": post.status, "detail": "Made your skills and available locations visible to contractors.",
                        "created_at": post.created_at,
                    })
            applications = JobApplication.objects.filter(painter=request.user).select_related("job", "job__contractor")
            for application in applications:
                end = job_end_date(application.job)
                if visible(application.job.start_date, end):
                    rows.append({
                        "id": f"application-{application.id}", "application_id": application.id,
                        "section": "ACCEPTED" if application.status in (JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED, JobApplication.Status.COMPLETED) else "HISTORY",
                        "activity_type": "Job application", "title": application.job.title,
                        "person": application.job.contractor.get_full_name() or application.job.contractor.mobile,
                        "location": f"{application.job.location}, {application.job.city}",
                        "start_date": application.job.start_date, "end_date": end, "status": application.status,
                        "cancellation_reason": application.cancellation_reason, "my_rating": application.painter_rating,
                        "detail": "Your cancellation request is waiting for the contractor." if application.status == JobApplication.Status.CANCELLATION_REQUESTED else "Connected you with a contractor requirement matching your availability.",
                        "created_at": application.applied_at,
                    })
            bookings = ApplicatorBooking.objects.filter(applicator=request.user).select_related("contractor")
            for booking in bookings:
                if visible(booking.start_date, booking.end_date):
                    rows.append({
                        "id": f"booking-{booking.id}", "section": "ACCEPTED" if booking.status in (ApplicatorBooking.Status.CONFIRMED, ApplicatorBooking.Status.COMPLETED) else "HISTORY",
                        "activity_type": "Direct booking", "title": booking.work_type,
                        "person": booking.contractor.get_full_name() or booking.contractor.mobile,
                        "location": booking.pincode, "start_date": booking.start_date, "end_date": booking.end_date,
                        "status": booking.status, "detail": "A contractor found and contacted you directly.",
                        "created_at": booking.created_at,
                    })
            assignments = WorkSchedulePainter.objects.filter(painter=request.user).select_related(
                "schedule__quotation__contractor", "schedule__quotation__property",
            )
            for assignment in assignments:
                schedule = assignment.schedule
                if visible(schedule.proposed_start_date, schedule.proposed_end_date):
                    rows.append({
                        "id": f"assignment-{assignment.id}", "section": "HISTORY", "activity_type": "Project work",
                        "title": schedule.quotation.quotation_number,
                        "person": schedule.quotation.contractor.get_full_name() or schedule.quotation.contractor.mobile,
                        "location": schedule.quotation.property.address, "start_date": schedule.proposed_start_date,
                        "end_date": schedule.proposed_end_date, "status": assignment.status,
                        "detail": "Recorded project assignment and completed-work experience.", "created_at": assignment.assigned_at,
                    })
        rows.sort(key=lambda row: (row["start_date"], row["created_at"]), reverse=True)
        return Response({"count": len(rows), "results": rows})


class JobCreateView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        user = request.user

        if not verified_contractor(user):
            return Response(
                {
                    "error": (
                        "Only verified contractors "
                        "can post jobs."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        enforce_job_post_limit(user)

        required_fields = [
            "title",
            "service_type",
            "location",
            "city",
            "job_type",
            "number_of_painters",
            "start_date",
        ]

        missing_fields = [
            field
            for field in required_fields
            if field not in request.data
        ]

        if missing_fields:
            return Response(
                {
                    "error": "Required fields are missing.",
                    "missing_fields": missing_fields,
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        required_skills = str(request.data.get("required_skills") or "").strip()
        if not required_skills:
            return Response({"required_skills": "Select at least one required skill."}, status=status.HTTP_400_BAD_REQUEST)
        pincode = str(request.data.get("pincode") or "").strip()
        if pincode and (len(pincode) != 6 or not pincode.isdigit()):
            return Response({"pincode": "Select a valid 6-digit Indian PIN code."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            latitude, longitude, radius_km = geo_values(request.data)
        except ValueError as error:
            return Response({"location": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        job = Job.objects.create(
            contractor=user,
            title=request.data["title"],
            description=request.data.get(
                "description",
                ""
            ),
            service_type=request.data[
                "service_type"
            ],
            location=request.data["location"],
            city=request.data["city"],
            pincode=pincode,
            state=str(request.data.get("state") or "").strip(),
            latitude=latitude,
            longitude=longitude,
            radius_km=radius_km,
            location_source=str(request.data.get("location_source") or "MANUAL")[:12],
            job_type=request.data["job_type"],
            number_of_painters=request.data[
                "number_of_painters"
            ],
            required_experience=request.data.get(
                "required_experience",
                0
            ),
            required_skills=required_skills,
            daily_wage=request.data.get(
                "daily_wage"
            ),
            weekly_wage=request.data.get(
                "weekly_wage"
            ),
            start_date=request.data["start_date"],
            estimated_days=request.data.get(
                "estimated_days",
                1
            ),
        )

        return Response(
            {
                "message": "Job posted successfully.",
                "job": {
                    "id": job.id,
                    "title": job.title,
                    "city": job.city,
                    "location": job.location,
                    "pincode": job.pincode,
                    "radius_km": job.radius_km,
                    "job_type": job.job_type,
                    "number_of_painters":
                        job.number_of_painters,
                    "status": job.status,
                }
            },
            status=status.HTTP_201_CREATED
        )


class JobListView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):

        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees can view only work assigned by their contractor."}, status=status.HTTP_403_FORBIDDEN)

        is_contractor = verified_contractor(request.user)
        is_painter = verified_painter(request.user)
        is_admin = request.user.role == BharathUser.Roles.ADMIN
        if not is_contractor and not is_painter and not is_admin:
            return Response(
                {"error": "Only verified contractors, Paint Applicators, and admins can access jobs."},
                status=status.HTTP_403_FORBIDDEN
            )

        if is_admin:
            jobs = Job.objects.all()
        elif is_contractor:
            jobs = Job.objects.filter(contractor=request.user)
        else:
            jobs = Job.objects.filter(status__in=[
                Job.Status.OPEN,
                Job.Status.PARTIALLY_FILLED,
            ])

        search = str(request.query_params.get("search") or "").strip()
        location = str(request.query_params.get("location") or "").strip()
        if search:
            from django.db import models as django_models
            jobs = jobs.filter(
                django_models.Q(title__icontains=search)
                | django_models.Q(service_type__icontains=search)
                | django_models.Q(required_skills__icontains=search)
                | django_models.Q(location__icontains=search)
                | django_models.Q(city__icontains=search)
            )
        if location:
            from django.db import models as django_models
            jobs = jobs.filter(
                django_models.Q(location__icontains=location)
                | django_models.Q(city__icontains=location)
            )
        date_from = parse_date(str(request.query_params.get("date_from") or ""))
        date_to = parse_date(str(request.query_params.get("date_to") or ""))
        if request.query_params.get("date_from") and not date_from:
            return Response({"date_from": "Select a valid start date."}, status=status.HTTP_400_BAD_REQUEST)
        if request.query_params.get("date_to") and not date_to:
            return Response({"date_to": "Select a valid end date."}, status=status.HTTP_400_BAD_REQUEST)
        if date_from and date_to and date_to < date_from:
            return Response({"dates": "End date must be on or after start date."}, status=status.HTTP_400_BAD_REQUEST)
        if is_painter:
            jobs = jobs.exclude(
                applications__painter=request.user,
                applications__status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.WITHDRAWN, JobApplication.Status.REJECTED),
            )
        jobs = jobs.select_related("contractor").prefetch_related("applications").order_by("-created_at")

        if not is_admin:
            today = timezone.localdate()
            jobs = [job for job in jobs if job.start_date + timedelta(days=max(job.estimated_days, 1) - 1) >= today]
        if date_from or date_to:
            range_start = date_from or timezone.localdate()
            range_end = date_to or date_from
            jobs = [job for job in jobs if (not range_end or job.start_date <= range_end) and job_end_date(job) >= range_start]
        if is_painter:
            jobs = [job for job in jobs if not applicator_has_date_conflict(request.user, job.start_date, job_end_date(job))]
        try:
            search_latitude, search_longitude, search_radius = geo_values(request.query_params)
        except ValueError as error:
            return Response({"location": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        job_distances = {}
        if search_latitude is not None:
            nearby_jobs = []
            for job in jobs:
                if job.latitude is None or job.longitude is None:
                    continue
                distance = distance_km(search_latitude, search_longitude, job.latitude, job.longitude)
                if distance <= search_radius and distance <= max(1, job.radius_km or 10):
                    nearby_jobs.append(job)
                    job_distances[job.id] = round(distance, 1)
            jobs = nearby_jobs

        data = []

        for job in jobs:

            data.append(
                {
                    "id": job.id,
                    "title": job.title,
                    "description": job.description,
                    "service_type":
                        job.service_type,
                    "location": job.location,
                    "city": job.city,
                    "pincode": job.pincode,
                    "state": job.state,
                    "latitude": job.latitude,
                    "longitude": job.longitude,
                    "radius_km": job.radius_km,
                    "location_source": job.location_source,
                    "distance_km": job_distances.get(job.id),
                    "job_type": job.job_type,
                    "number_of_painters":
                        job.number_of_painters,
                    "required_experience":
                        job.required_experience,
                    "required_skills":
                        job.required_skills,
                    "daily_wage":
                        job.daily_wage,
                    "weekly_wage":
                        job.weekly_wage,
                    "start_date":
                        job.start_date,
                    "estimated_days":
                        job.estimated_days,
                    "status":
                        job.status,
                    "contractor_name": job.contractor.get_full_name() or job.contractor.mobile,
                    "contractor_id": job.contractor_id,
                    "contractor_mobile": job.contractor.mobile,
                    "contractor_bharath_id": job.contractor.bharath_id,
                    "applications_count": job.applications.count(),
                    "end_date": job_end_date(job),
                    "has_applied": job.applications.filter(painter=request.user, status=JobApplication.Status.APPLIED).exists() if is_painter else False,
                }
            )

        return Response(
            {
                "count": len(data),
                "jobs": data,
            },
            status=status.HTTP_200_OK
        )


class JobApplyView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):

        user = request.user

        if is_inhouse_applicator(user):
            return Response({"detail": "In-house employees cannot apply to marketplace jobs."}, status=status.HTTP_403_FORBIDDEN)

        if not verified_painter(user):
            return Response(
                {
                    "error": (
                        "Only verified Paint Applicators "
                        "can apply for jobs."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            job = Job.objects.get(
                id=job_id
            )
        except Job.DoesNotExist:
            return Response(
                {
                    "error": "Job not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if job.status not in [
            Job.Status.OPEN,
            Job.Status.PARTIALLY_FILLED,
        ]:
            return Response(
                {
                    "error": (
                        "This job is no longer "
                        "accepting applications."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        job_end_date = job.start_date + timedelta(days=max(job.estimated_days, 1) - 1)
        if job_end_date < timezone.localdate():
            return Response(
                {"error": "This job has expired and is no longer accepting applications."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Painter cannot take another active job
        active_application = (
            JobApplication.objects.filter(
                painter=user,
                status=JobApplication.Status.ACCEPTED,
                job__status__in=[
                    Job.Status.OPEN,
                    Job.Status.PARTIALLY_FILLED,
                    Job.Status.FILLED,
                    Job.Status.IN_PROGRESS,
                ],
            )
            .first()
        )

        if active_application:
            return Response(
                {
                    "error": (
                        "You already have an active "
                        "accepted job."
                    ),
                    "job_id":
                        active_application.job.id,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if JobApplication.objects.filter(
            job=job,
            painter=user
        ).exists():

            return Response(
                {
                    "error": (
                        "You have already applied "
                        "for this job."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        application = JobApplication.objects.create(
            job=job,
            painter=user,
            message=request.data.get(
                "message",
                ""
            ),
        )

        return Response(
            {
                "message": (
                    "Job application submitted."
                ),
                "application_id":
                    application.id,
                "job_id":
                    job.id,
                "status":
                    application.status,
            },
            status=status.HTTP_201_CREATED
        )


class ContractorApplicationListView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):

        user = request.user

        if not verified_contractor(user):
            return Response(
                {
                    "error": (
                        "Only verified contractors "
                        "can view applications."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            job = Job.objects.get(
                id=job_id,
                contractor=user
            )
        except Job.DoesNotExist:
            return Response(
                {
                    "error": (
                        "Job not found or you are "
                        "not the job owner."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        applications = (
            JobApplication.objects
            .filter(job=job)
            .exclude(status=JobApplication.Status.WITHDRAWN)
            .select_related("painter")
            .order_by("-applied_at")
        )

        data = []

        for application in applications:

            painter = application.painter

            experience = None
            daily_wage = None
            availability = None

            try:
                profile = painter.painter_profile
                experience = profile.experience_years
                daily_wage = profile.daily_wage
                availability = profile.availability
            except Exception:
                pass

            data.append(
                {
                    "application_id":
                        application.id,

                    "painter_id":
                        painter.id,

                    "painter_name":
                        painter.get_full_name(),

                    "bharath_id":
                        painter.bharath_id,

                    "mobile":
                        painter.mobile,

                    "experience_years":
                        experience,

                    "daily_wage":
                        daily_wage,

                    "availability":
                        availability,

                    "message":
                        application.message,

                    "status":
                        application.status,

                    "cancellation_reason": application.cancellation_reason,
                    "contractor_rating": application.contractor_rating,
                    "painter_rating": application.painter_rating,
                    "applied_at":
                        application.applied_at,
                }
            )

        return Response(
            {
                "job_id": job.id,
                "job_title": job.title,
                "required_painters":
                    job.number_of_painters,
                "applications_count":
                    len(data),
                "applications":
                    data,
            },
            status=status.HTTP_200_OK
        )


class AcceptJobApplicationView(APIView):

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, application_id):

        user = request.user

        if not verified_contractor(user):
            return Response(
                {
                    "error": (
                        "Only verified contractors "
                        "can accept applications."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            application = (
                JobApplication.objects
                .select_related("job", "painter")
                .select_for_update()
                .get(id=application_id)
            )
        except JobApplication.DoesNotExist:
            return Response(
                {
                    "error": "Application not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        job = application.job
        painter = application.painter

        # Security: contractor can only accept
        # applications for their own job.
        if job.contractor_id != user.id:
            return Response(
                {
                    "error": (
                        "You are not authorized to "
                        "manage this application."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if application.status != JobApplication.Status.APPLIED:
            return Response(
                {
                    "error": (
                        "This application is no longer "
                        "available for acceptance."
                    ),
                    "current_status":
                        application.status,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Make sure painter is still verified
        if not verified_painter(painter):
            return Response(
                {
                    "error": (
                        "This painter is no longer "
                        "verified."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        job_end = job_end_date(job)
        if applicator_has_date_conflict(
            painter, job.start_date, job_end, exclude_application=application.id,
        ):
            return Response(
                {
                    "error": (
                        "This Paint Applicator is already occupied for one or more job dates."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Count currently accepted painters
        accepted_count = (
            JobApplication.objects
            .filter(
                job=job,
                status=JobApplication.Status.ACCEPTED,
            )
            .count()
        )

        # Don't exceed required number
        if accepted_count >= job.number_of_painters:
            job.status = Job.Status.FILLED
            job.save(
                update_fields=["status"]
            )

            return Response(
                {
                    "error": (
                        "This job already has "
                        "the required number of painters."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Accept painter
        application.status = (
            JobApplication.Status.ACCEPTED
        )
        application.save(
            update_fields=["status", "updated_at"]
        )

        # Once an applicator accepts work, remove their other marketplace
        # applications so contractors never see the same person as available twice.
        JobApplication.objects.filter(
            painter=painter,
            status=JobApplication.Status.APPLIED,
        ).exclude(pk=application.pk).update(status=JobApplication.Status.WITHDRAWN)

        accepted_count += 1

        # Update job status
        if accepted_count >= job.number_of_painters:
            job.status = Job.Status.FILLED
        else:
            job.status = Job.Status.PARTIALLY_FILLED

        job.save(
            update_fields=["status", "updated_at"]
        )

        return Response(
            {
                "message": (
                    "Painter accepted successfully."
                ),
                "application": {
                    "id": application.id,
                    "status": application.status,
                    "painter": painter.get_full_name(),
                    "bharath_id": painter.bharath_id,
                },
                "job": {
                    "id": job.id,
                    "status": job.status,
                    "required_painters":
                        job.number_of_painters,
                    "accepted_painters":
                        accepted_count,
                },
            },
            status=status.HTTP_200_OK
        )


class RejectJobApplicationView(APIView):

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, application_id):

        user = request.user

        if not verified_contractor(user):
            return Response(
                {
                    "error": (
                        "Only verified contractors "
                        "can reject applications."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            application = (
                JobApplication.objects
                .select_related("job", "painter")
                .select_for_update()
                .get(id=application_id)
            )
        except JobApplication.DoesNotExist:
            return Response(
                {"error": "Application not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        job = application.job

        # Only the contractor who posted the job
        # can reject the application.
        if job.contractor_id != user.id:
            return Response(
                {
                    "error": (
                        "You are not authorized to "
                        "manage this application."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if application.status != JobApplication.Status.APPLIED:
            return Response(
                {
                    "error": (
                        "Only pending applications "
                        "can be rejected."
                    ),
                    "current_status": application.status,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        application.status = (
            JobApplication.Status.REJECTED
        )

        application.save(
            update_fields=["status", "updated_at"]
        )

        return Response(
            {
                "message": "Painter application rejected.",
                "application": {
                    "id": application.id,
                    "painter":
                        application.painter.get_full_name(),
                    "bharath_id":
                        application.painter.bharath_id,
                    "status":
                        application.status,
                },
            },
            status=status.HTTP_200_OK
        )


class JobApplicationCancellationView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, application_id):
        application = JobApplication.objects.select_for_update().select_related(
            "job", "job__contractor", "painter",
        ).filter(pk=application_id).first()
        if not application:
            return Response({"detail": "Job assignment not found."}, status=status.HTTP_404_NOT_FOUND)

        is_contractor = request.user.id == application.job.contractor_id
        is_painter = request.user.id == application.painter_id
        if not is_contractor and not is_painter:
            return Response({"detail": "You cannot manage this assignment."}, status=status.HTTP_403_FORBIDDEN)

        action = str(request.data.get("action") or ("REQUEST" if is_painter else "CANCEL")).upper()
        reason = str(request.data.get("reason") or "").strip()
        if action in {"REQUEST", "CANCEL", "APPROVE"} and not reason and not application.cancellation_reason:
            return Response({"reason": "Please provide a reason."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = optional_rating(request.data.get("rating"))
        except ValueError as error:
            return Response({"rating": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        review = str(request.data.get("review") or "").strip()

        if is_painter:
            if action != "REQUEST":
                return Response(
                    {"detail": "Paint Applicators cannot cancel directly. Send a request to the contractor."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if application.status != JobApplication.Status.ACCEPTED:
                return Response({"detail": "Only an accepted job can be sent for cancellation."}, status=status.HTTP_400_BAD_REQUEST)
            application.status = JobApplication.Status.CANCELLATION_REQUESTED
            application.cancellation_reason = reason
            application.cancellation_requested_at = timezone.now()
            application.save(update_fields=("status", "cancellation_reason", "cancellation_requested_at", "updated_at"))
            notify(
                application.job.contractor, request.user, "JOB", "Applicator requested cancellation",
                f"{application.painter.get_full_name() or application.painter.mobile} requested cancellation from {application.job.title}: {reason}",
                "/job-activity",
            )
            return Response({"message": "Cancellation request sent to the contractor.", "status": application.status})

        if action == "REJECT":
            if application.status != JobApplication.Status.CANCELLATION_REQUESTED:
                return Response({"detail": "There is no pending cancellation request."}, status=status.HTTP_400_BAD_REQUEST)
            application.status = JobApplication.Status.ACCEPTED
            application.save(update_fields=("status", "updated_at"))
            notify(application.painter, request.user, "JOB", "Cancellation request declined", f"Your assignment for {application.job.title} remains active.", "/job-activity")
            return Response({"message": "The assignment remains active.", "status": application.status})

        if action not in {"CANCEL", "APPROVE"} or application.status not in {
            JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED,
        }:
            return Response({"detail": "This assignment cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        application.status = JobApplication.Status.CANCELLED
        application.cancellation_reason = reason or application.cancellation_reason
        application.cancelled_at = timezone.now()
        application.cancelled_by = request.user
        if rating is not None:
            application.contractor_rating = rating
            application.contractor_review = review
        application.save(update_fields=(
            "status", "cancellation_reason", "cancelled_at", "cancelled_by",
            "contractor_rating", "contractor_review", "updated_at",
        ))
        application.transfer_requests.filter(status=JobTransferRequest.Status.PENDING).update(
            status=JobTransferRequest.Status.CANCELLED, responded_at=timezone.now(),
        )
        refresh_marketplace_job_status(application.job)
        notify(
            application.painter, request.user, "JOB", "Job assignment cancelled",
            f"Your assignment for {application.job.title} was cancelled: {application.cancellation_reason}",
            "/job-activity",
        )
        return Response({"message": "Assignment cancelled and dates released.", "status": application.status})


class JobApplicationReassignView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, application_id):
        source = JobApplication.objects.select_for_update().select_related("job", "painter").filter(pk=application_id).first()
        if not source:
            return Response({"detail": "Job assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id not in {source.job.contractor_id, source.painter_id}:
            return Response({"detail": "Only the assigned contractor or applicator can request a transfer."}, status=status.HTTP_403_FORBIDDEN)
        if source.status != JobApplication.Status.ACCEPTED:
            return Response({"detail": "Only an active accepted assignment can be transferred."}, status=status.HTTP_400_BAD_REQUEST)
        if source.transfer_requests.filter(status=JobTransferRequest.Status.PENDING).exists():
            return Response({"detail": "A transfer request is already waiting for approval."}, status=status.HTTP_400_BAD_REQUEST)

        target = Job.objects.select_for_update().filter(pk=request.data.get("target_job_id"), contractor_id=source.job.contractor_id).first()
        if not target or target.pk == source.job_id:
            return Response({"target_job_id": "Select another job from the same contractor."}, status=status.HTTP_400_BAD_REQUEST)
        if target.status not in {Job.Status.OPEN, Job.Status.PARTIALLY_FILLED}:
            return Response({"target_job_id": "The selected job is not accepting applicators."}, status=status.HTTP_400_BAD_REQUEST)
        occupied = target.applications.filter(
            status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED),
        ).count()
        if occupied >= target.number_of_painters:
            return Response({"target_job_id": "The selected job already has enough applicators."}, status=status.HTTP_400_BAD_REQUEST)
        if applicator_has_date_conflict(
            source.painter, target.start_date, job_end_date(target), exclude_application=source.pk,
        ):
            return Response({"target_job_id": "The applicator is occupied on the selected job dates."}, status=status.HTTP_400_BAD_REQUEST)

        existing = JobApplication.objects.filter(job=target, painter=source.painter).first()
        if existing and existing.status in {JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED, JobApplication.Status.COMPLETED}:
            return Response({"detail": "This applicator is already assigned to that job."}, status=status.HTTP_400_BAD_REQUEST)
        transfer = JobTransferRequest.objects.create(
            source_application=source, target_job=target, requested_by=request.user,
            reason=str(request.data.get("reason") or "Transfer requested").strip(),
        )
        recipient = source.painter if request.user.id == source.job.contractor_id else source.job.contractor
        notify(
            recipient, request.user, "JOB", "Job transfer approval required",
            f"Transfer requested from {source.job.title} to {target.title}. Please accept or reject it.",
            "/job-activity",
        )
        return Response({
            "message": "Transfer request sent. The current assignment remains unchanged until approval.",
            "transfer_request_id": transfer.id, "status": transfer.status,
        }, status=status.HTTP_201_CREATED)


class JobTransferResponseView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, transfer_id):
        transfer = JobTransferRequest.objects.select_for_update().select_related(
            "source_application__job__contractor", "source_application__painter", "target_job", "requested_by",
        ).filter(pk=transfer_id).first()
        if not transfer:
            return Response({"detail": "Transfer request not found."}, status=status.HTTP_404_NOT_FOUND)
        source = transfer.source_application
        counterpart_id = source.painter_id if transfer.requested_by_id == source.job.contractor_id else source.job.contractor_id
        if request.user.id != counterpart_id:
            return Response({"detail": "Only the other party can answer this transfer request."}, status=status.HTTP_403_FORBIDDEN)
        if transfer.status != JobTransferRequest.Status.PENDING:
            return Response({"detail": "This transfer request has already been answered."}, status=status.HTTP_400_BAD_REQUEST)
        action = str(request.data.get("action") or "").upper()
        if action == "REJECT":
            transfer.status = JobTransferRequest.Status.REJECTED
            transfer.responded_at = timezone.now()
            transfer.save(update_fields=("status", "responded_at"))
            notify(transfer.requested_by, request.user, "JOB", "Job transfer declined", f"Transfer to {transfer.target_job.title} was declined.", "/job-activity")
            return Response({"message": "Transfer request declined.", "status": transfer.status})
        if action != "ACCEPT":
            return Response({"action": "Choose ACCEPT or REJECT."}, status=status.HTTP_400_BAD_REQUEST)
        if source.status != JobApplication.Status.ACCEPTED:
            return Response({"detail": "The original assignment is no longer active."}, status=status.HTTP_400_BAD_REQUEST)
        target = transfer.target_job
        if target.status not in {Job.Status.OPEN, Job.Status.PARTIALLY_FILLED}:
            return Response({"detail": "The destination job is no longer available."}, status=status.HTTP_400_BAD_REQUEST)
        occupied = target.applications.filter(status__in=(JobApplication.Status.ACCEPTED, JobApplication.Status.CANCELLATION_REQUESTED)).count()
        if occupied >= target.number_of_painters:
            return Response({"detail": "The destination job is now full."}, status=status.HTTP_400_BAD_REQUEST)
        if applicator_has_date_conflict(source.painter, target.start_date, job_end_date(target), exclude_application=source.pk):
            return Response({"detail": "The applicator is occupied on the destination job dates."}, status=status.HTTP_400_BAD_REQUEST)
        replacement = complete_job_transfer(source, target, request.user)
        transfer.status = JobTransferRequest.Status.ACCEPTED
        transfer.responded_at = timezone.now()
        transfer.save(update_fields=("status", "responded_at"))
        source.transfer_requests.filter(status=JobTransferRequest.Status.PENDING).exclude(pk=transfer.pk).update(status=JobTransferRequest.Status.CANCELLED, responded_at=timezone.now())
        notify(transfer.requested_by, request.user, "JOB", "Job transfer accepted", f"Transfer to {target.title} is confirmed.", "/job-activity")
        return Response({"message": "Transfer accepted and assignment updated.", "application_id": replacement.id, "job_id": target.id})


class JobApplicationRatingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        application = JobApplication.objects.select_related("job", "painter").filter(pk=application_id).first()
        if not application:
            return Response({"detail": "Job assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        if application.status != JobApplication.Status.CANCELLED:
            return Response({"detail": "Cancellation feedback is available after the assignment is cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rating = optional_rating(request.data.get("rating"))
        except ValueError as error:
            return Response({"rating": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        if rating is None:
            return Response({"rating": "Select a rating from 1 to 5, or skip feedback."}, status=status.HTTP_400_BAD_REQUEST)
        review = str(request.data.get("review") or "").strip()
        if request.user.id == application.job.contractor_id:
            application.contractor_rating = rating
            application.contractor_review = review
            fields = ("contractor_rating", "contractor_review", "updated_at")
        elif request.user.id == application.painter_id:
            application.painter_rating = rating
            application.painter_review = review
            fields = ("painter_rating", "painter_review", "updated_at")
        else:
            return Response({"detail": "You cannot rate this assignment."}, status=status.HTTP_403_FORBIDDEN)
        application.save(update_fields=fields)
        return Response({"message": "Optional feedback saved.", "rating": rating})
