from django.db import transaction, models
from django.db.models import Prefetch
from django.db.models.functions import TruncMonth
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils.dateparse import parse_date, parse_datetime
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from datetime import timedelta, date
from calendar import monthrange
import secrets
import csv
from math import asin, cos, radians, sin, sqrt
from collections.abc import Mapping

from accounts.models import BharathUser, PainterProfile
from accounts.serializers import ProfileImagePositionField
from accounts.mobile import normalize_mobile, matching_mobile_users
from accounts.utils import activate_business_identity

from .models import Job, JobApplication, JobTransferRequest, WorkSchedule, WorkSchedulePainter, WorkScheduleRescheduleHistory, WorkPhoto, WorkReview, PainterSeekingPost, ContractorApplicatorTeam, ContractorEmployeeFieldDefinition, EmployeeProfileChange, ApplicatorSalaryRevision, ApplicatorBooking, ApplicatorAvailabilityBlock, ApplicatorAttendance, ApplicatorAttendanceDecision, ApplicatorLedgerEntry
from quotations.models import Customer, Invoice, PortalNotification, ProjectReceipt, Quotation
from quotations.pdf_utils import build_advance_receipt_pdf
from quotations.document_languages import document_language
from quotations.property_access import PropertyPermission, accessible_properties, effective_property_permissions, has_property_access
from .attendance import attendance_earning_amount, overtime_earning_amount, salary_daily_rate, salary_daily_rate_for_date, sync_attendance_earning
from .overtime import overtime_rate_for_date
from .scheduling import authorization_available, authorization_data, save_authorization
from .employee_accounts import (
    IN_HOUSE_EMPLOYEE_ACTIVATION_SALT, IN_HOUSE_EMPLOYEE_ACTIVATION_MAX_AGE,
    employee_account_data, employee_activation_url,
)
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
    if schedule.quotation.contractor_id == user.id:
        return True
    property_obj = schedule.quotation.property
    if user.role == BharathUser.Roles.CUSTOMER and property_obj:
        return has_property_access(user, property_obj, PropertyPermission.VIEW_SCHEDULES)
    return user.role == BharathUser.Roles.CUSTOMER and schedule.quotation.customer.portal_user_id == user.id


def notify(recipient, actor, event_type, title, message, link):
    if recipient and recipient.id != actor.id:
        PortalNotification.objects.create(recipient=recipient, actor=actor, event_type=event_type, title=title, message=message, link=link)


def attendance_record_data(row):
    return {
        "id": row.id, "date": row.date, "status": row.status,
        "approval_status": row.approval_status, "marked_at": row.marked_at,
        "note": row.note, "schedule": row.schedule_id,
        "overtime_hours": row.overtime_hours,
        "decisions": [{
            "id": decision.id,
            "decision": decision.decision,
            "reviewer": decision.reviewer.get_full_name() or decision.reviewer.mobile,
            "previous_status": decision.previous_status,
            "status": decision.status,
            "previous_approval_status": decision.previous_approval_status,
            "approval_status": decision.approval_status,
            "previous_schedule": decision.previous_schedule_id,
            "schedule": decision.schedule_id,
            "note": decision.note,
            "created_at": decision.created_at,
        } for decision in row.decisions.select_related("reviewer").all()],
    }


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


def schedule_data(item, viewer=None, authorization_ready=None):
    quotation = item.quotation
    receipt_advance_total = quotation.project_receipts.aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
    project_receipt = quotation.project_receipts.order_by("-received_date", "-id").first()
    today = timezone.localdate()
    needs_reschedule = (
        item.status == WorkSchedule.Status.PENDING and item.proposed_start_date < today
    ) or (
        item.status == WorkSchedule.Status.CONFIRMED and item.proposed_end_date < today
    )
    data = {
        **authorization_data(item, authorization_ready),
        "id": item.id, "quotation": quotation.id, "quotation_number": quotation.quotation_number,
        "customer_contact_id": item.customer_contact_id,
        "customer_contact_name": item.customer_contact.customer.name if item.customer_contact_id else "",
        "customer_contact_role": item.customer_contact.role if item.customer_contact_id else "",
        "customer": quotation.customer.name, "customer_bharath_id": quotation.customer.bharath_id, "property": quotation.property.name or quotation.property.property_type,
        "contractor": quotation.contractor.get_full_name() or quotation.contractor.mobile,
        "start_date": item.proposed_start_date, "end_date": item.proposed_end_date,
        "previous_start_date": item.previous_start_date, "previous_end_date": item.previous_end_date,
        "reschedule_reason": item.reschedule_reason,
        "reschedule_history": [{
            "previous_start_date": row.previous_start_date,
            "previous_end_date": row.previous_end_date,
            "start_date": row.proposed_start_date,
            "end_date": row.proposed_end_date,
            "reason": row.reason,
            "changed_at": row.changed_at,
        } for row in item.reschedule_history.order_by("changed_at", "id")],
        "advance_amount": (item.advance_amount or Decimal("0")) + receipt_advance_total,
        "receipt_advance_total": receipt_advance_total, "payment_status": item.payment_status,
        "payment_mode": item.payment_mode, "payment_reference": item.payment_reference,
        "payment_note": item.payment_note, "payment_submitted_at": item.payment_submitted_at,
        "payment_confirmed_at": item.payment_confirmed_at, "cancellation_reason": item.cancellation_reason,
        "advance_receipt_number": item.advance_receipt_number or (project_receipt.receipt_number if project_receipt else ""),
        "project_receipt_id": project_receipt.id if project_receipt and not item.advance_receipt_number else None,
        "work_started_at": item.work_started_at, "work_completed_at": item.work_completed_at,
        "proposed_by": item.proposed_by.role, "customer_accepted": item.customer_accepted,
        "contractor_accepted": item.contractor_accepted, "status": item.status,
        "needs_reschedule": needs_reschedule,
        "painters": [{"id": assignment.painter_id, "assignment_id": assignment.id, "name": assignment.painter.get_full_name() or assignment.painter.mobile, "mobile": assignment.painter.mobile, "status": assignment.status, "wage_type": assignment.wage_type, "agreed_wage": assignment.agreed_wage, "painter_note": assignment.painter_note} for assignment in item.painter_assignments.all()],
        "updated_at": item.updated_at,
    }
    if viewer and viewer.role == BharathUser.Roles.CUSTOMER and quotation.property_id:
        data["property_access"] = effective_property_permissions(viewer, quotation.property)
    if (
        viewer
        and viewer.role == BharathUser.Roles.CUSTOMER
        and quotation.property_id
        and not has_property_access(viewer, quotation.property, PropertyPermission.VIEW_PAYMENTS)
    ):
        for field in (
            "advance_amount", "receipt_advance_total", "payment_status", "payment_mode",
            "payment_reference", "payment_note", "payment_submitted_at", "payment_confirmed_at",
            "advance_receipt_number", "project_receipt_id",
        ):
            data.pop(field, None)
    return data


def work_photo_access(user, schedule):
    if user.role == BharathUser.Roles.ADMIN or user.is_superuser:
        return True
    if schedule.quotation.contractor_id == user.id:
        return True
    property_obj = schedule.quotation.property
    if user.role == BharathUser.Roles.CUSTOMER and property_obj:
        return has_property_access(user, property_obj, PropertyPermission.VIEW_PROGRESS)
    if user.role == BharathUser.Roles.CUSTOMER and schedule.quotation.customer.portal_user_id == user.id:
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
            allowed_property_ids = accessible_properties(user, PropertyPermission.VIEW_PROGRESS).values("pk")
            queryset = queryset.filter(quotation__property_id__in=allowed_property_ids)
            property_id = self.request.query_params.get("property_id")
            return queryset.filter(quotation__property_id=property_id) if property_id else queryset
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
        property_id = request.query_params.get("property_id")
        if property_id:
            photos = photos.filter(schedule__quotation__property_id=property_id)
        property_id = request.query_params.get("property_id")
        if property_id:
            photos = photos.filter(schedule__quotation__property_id=property_id)
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
        authorization_ready = authorization_available()
        if authorization_ready:
            queryset = queryset.prefetch_related("date_authorization")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            queryset = queryset.filter(quotation__contractor=request.user)
        elif request.user.role == BharathUser.Roles.CUSTOMER:
            allowed_property_ids = accessible_properties(request.user, PropertyPermission.VIEW_SCHEDULES).values("pk")
            queryset = queryset.filter(quotation__property_id__in=allowed_property_ids)
            property_id = request.query_params.get("property_id")
            if property_id:
                queryset = queryset.filter(quotation__property_id=property_id)
        else:
            queryset = queryset.none()
        items = list(queryset.order_by("-updated_at"))
        data = [schedule_data(item, request.user, authorization_ready) for item in items]
        if request.user.role == BharathUser.Roles.CUSTOMER:
            WorkSchedule.objects.filter(pk__in=[item.pk for item in items], status__in=(WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED)).update(customer_seen_update_at=timezone.now())
        return Response(data)

    @transaction.atomic
    def post(self, request):
        if not isinstance(request.data, Mapping):
            return Response({"detail": "Provide schedule details as an object."}, status=400)
        mode = request.data.get("scheduling_mode", "PORTAL")
        if not isinstance(mode, str) or mode not in ("PORTAL", "CONTRACTOR"):
            return Response({"scheduling_mode": "Select portal approval or contractor authorization."}, status=400)
        direct = mode == "CONTRACTOR"
        quotation_id = str(request.data.get("quotation") or "")
        if not quotation_id.isdigit() or int(quotation_id) < 1:
            return Response({"quotation": "Select a valid quotation."}, status=400)
        released = (WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED)
        painter_ids = set()
        if direct:
            if not verified_contractor(request.user):
                return Response({"detail": "Only the verified owning contractor can authorize work dates."}, status=403)
            if not Quotation.objects.filter(pk=quotation_id, contractor=request.user).exists():
                return Response({"quotation": "Quotation not found."}, status=404)
            if not authorization_available():
                return Response({"detail": "Contractor scheduling is temporarily unavailable. Existing portal scheduling remains available."}, status=503)
            painter_ids = set(WorkSchedulePainter.objects.filter(schedule__quotation_id=quotation_id).exclude(status__in=released).values_list("painter_id", flat=True))
            # Confirmation writers consistently lock workers, quotation, schedule.
            list(BharathUser.objects.select_for_update(of=("self",)).filter(pk__in=painter_ids).order_by("pk"))
        quotation = Quotation.objects.select_for_update(of=("self",)).select_related("customer", "contractor", "property").filter(pk=quotation_id).first()
        customer_can_schedule = bool(
            quotation
            and request.user.role == BharathUser.Roles.CUSTOMER
            and (
                has_property_access(request.user, quotation.property, PropertyPermission.APPROVE_QUOTATIONS)
                if quotation.property_id
                else quotation.customer.portal_user_id == request.user.id
            )
        )
        if not quotation or not (quotation.contractor_id == request.user.id or customer_can_schedule):
            return Response({"quotation": "Quotation not found."}, status=status.HTTP_404_NOT_FOUND)
        allowed_states = (Quotation.Status.ACCEPTED, Quotation.Status.SCHEDULED, Quotation.Status.CONVERTED)
        if direct:
            allowed_states += (Quotation.Status.DRAFT, Quotation.Status.SENT, Quotation.Status.VIEWED)
        if quotation.status not in allowed_states:
            return Response({"quotation": "The customer must accept the quotation before scheduling."}, status=status.HTTP_400_BAD_REQUEST)
        revision_root = quotation.revision_of or quotation
        newer_versions = Quotation.objects.filter(
            models.Q(pk=revision_root.pk) | models.Q(revision_of=revision_root),
            version_number__gt=quotation.version_number, deleted_at__isnull=True,
        )
        if not direct:
            newer_versions = newer_versions.exclude(status=Quotation.Status.DRAFT)
        if newer_versions.exists():
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
        existing = WorkSchedule.objects.select_for_update().filter(quotation=quotation).first()
        if direct:
            current_ids = set(existing.painter_assignments.exclude(status__in=released).values_list("painter_id", flat=True)) if existing else set()
            if current_ids != painter_ids:
                return Response({"detail": "The assignment roster changed. Reload and retry."}, status=409)
            if WorkSchedulePainter.objects.filter(painter_id__in=painter_ids,
                schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
                schedule__proposed_start_date__lte=end, schedule__proposed_end_date__gte=start,
            ).exclude(schedule=existing).exclude(status__in=released).exists():
                return Response({"painters": "A Paint Applicator already has an overlapping project assignment."}, status=400)
        if existing and existing.status in {WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED, WorkSchedule.Status.CANCELLED}:
            return Response({"detail": "A started, completed or cancelled schedule cannot be rescheduled."}, status=status.HTTP_400_BAD_REQUEST)
        if is_customer and quotation.accepted_via_receipt_at and not existing:
            return Response({"quotation": "The contractor will propose work dates for you to confirm."}, status=status.HTTP_400_BAD_REQUEST)
        if existing and is_customer:
            return Response({"detail": "Only the contractor can reschedule existing work dates."}, status=status.HTTP_403_FORBIDDEN)
        reason = str(request.data.get("reason") or "").strip()
        same_dates = bool(existing and existing.proposed_start_date == start and existing.proposed_end_date == end)
        if direct and same_dates and existing.status == WorkSchedule.Status.CONFIRMED and authorization_data(existing)['scheduling_mode'] == 'CONTRACTOR':
            return Response(schedule_data(existing), status=200)
        if existing and not reason and not (direct and same_dates):
            return Response({"reason": "Give a reason for rescheduling the confirmed or proposed dates."}, status=status.HTTP_400_BAD_REQUEST)
        schedule_defaults = {
            "proposed_start_date": start, "proposed_end_date": end, "proposed_by": request.user,
            "customer_contact": quotation.customer_contact,
            "previous_start_date": existing.proposed_start_date if existing else None,
            "previous_end_date": existing.proposed_end_date if existing else None,
            "reschedule_reason": reason,
            "cancellation_reason": "",
            "customer_accepted": bool(is_customer or (direct and same_dates and existing.customer_accepted)), "contractor_accepted": not is_customer,
            "status": WorkSchedule.Status.CONFIRMED if direct else WorkSchedule.Status.PENDING,
        }
        if not existing:
            receipt_total = quotation.project_receipts.aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
            schedule_defaults.update({
                "advance_amount": Decimal("0") if receipt_total else None,
                "payment_status": WorkSchedule.PaymentStatus.CONFIRMED if receipt_total else WorkSchedule.PaymentStatus.NOT_REQUESTED,
                "payment_mode": "", "payment_reference": "",
                "payment_note": "Advance recorded in quotation receipt" if receipt_total else "",
                "payment_submitted_at": None, "payment_confirmed_at": timezone.now() if receipt_total else None,
            })
        date_range_changed = bool(existing and (
            existing.proposed_start_date != start or existing.proposed_end_date != end
        ))
        item, _ = WorkSchedule.objects.update_or_create(quotation=quotation, defaults=schedule_defaults)
        save_authorization(item, mode, request.user, not existing or date_range_changed, request)
        if direct and quotation.status in (Quotation.Status.ACCEPTED, Quotation.Status.CONVERTED):
            quotation.status = Quotation.Status.SCHEDULED
            quotation.save(update_fields=("status", "updated_at"))
        if existing and date_range_changed:
            WorkScheduleRescheduleHistory.objects.create(
                schedule=item,
                previous_start_date=existing.proposed_start_date,
                previous_end_date=existing.proposed_end_date,
                proposed_start_date=start,
                proposed_end_date=end,
                reason=reason,
                changed_by=request.user,
            )
        # A date change does not itself change the roster. Keep the same assignment
        # identities, wage terms, responses and review history; the contractor can
        # explicitly update the roster through WorkSchedulePainterView if needed.
        recipient = quotation.contractor if is_customer else quotation.customer.portal_user
        notify(recipient, request.user, "SCHEDULE", "Contractor-authorized work dates" if direct else "Work dates proposed", f"{quotation.quotation_number}: {start} to {end}", "/work-schedules")
        return Response(schedule_data(item), status=status.HTTP_201_CREATED)


class WorkScheduleAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk).first()
        if not item or not schedule_access(request.user, item):
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        released = (WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED)
        painter_ids = set(item.painter_assignments.exclude(status__in=released).values_list("painter_id", flat=True))
        # Match assignment writers: workers first. Quotation must precede the
        # schedule because proposing dates already takes those locks in order.
        list(BharathUser.objects.select_for_update(of=("self",)).filter(pk__in=painter_ids).order_by("pk"))
        if not Quotation.objects.select_for_update(of=("self",)).filter(pk=item.quotation_id).first():
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        item = WorkSchedule.objects.select_for_update(of=("self",)).select_related(
            "quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by",
        ).prefetch_related("painter_assignments__painter").filter(pk=pk).first()
        if not item or not schedule_access(request.user, item):
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        current_painter_ids = set(item.painter_assignments.exclude(status__in=released).values_list("painter_id", flat=True))
        if current_painter_ids != painter_ids:
            return Response({"detail": "The assignment roster changed. Reload the schedule and retry."}, status=status.HTTP_400_BAD_REQUEST)
        if (
            request.user.role == BharathUser.Roles.CUSTOMER
            and item.quotation.property_id
            and not has_property_access(request.user, item.quotation.property, PropertyPermission.APPROVE_QUOTATIONS)
        ):
            return Response({"detail": "Only a contact with quotation approval rights can respond to this schedule."}, status=status.HTTP_403_FORBIDDEN)
        if item.proposed_start_date < timezone.localdate():
            return Response({"start_date": "These proposed dates have expired. The contractor must reschedule using today or a future date."}, status=status.HTTP_400_BAD_REQUEST)
        if item.status not in (WorkSchedule.Status.PENDING, WorkSchedule.Status.CONFIRMED):
            return Response({"detail": "A started, completed or cancelled schedule cannot be confirmed again."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role == BharathUser.Roles.CUSTOMER: item.customer_accepted = True
        elif request.user.role == BharathUser.Roles.CONTRACTOR: item.contractor_accepted = True
        else: return Response({"detail": "Customer or contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        direct = authorization_data(item)['scheduling_mode'] == 'CONTRACTOR'
        item.status = WorkSchedule.Status.CONFIRMED if item.contractor_accepted and (direct or item.customer_accepted) else WorkSchedule.Status.PENDING
        if item.status == WorkSchedule.Status.CONFIRMED and WorkSchedulePainter.objects.filter(
            painter_id__in=current_painter_ids,
            schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
            schedule__proposed_start_date__lte=item.proposed_end_date,
            schedule__proposed_end_date__gte=item.proposed_start_date,
        ).exclude(schedule=item).exclude(status__in=released).exists():
            return Response({"painters": "A Paint Applicator already has an overlapping project assignment."}, status=status.HTTP_400_BAD_REQUEST)
        item.save(update_fields=("customer_accepted", "contractor_accepted", "status", "updated_at"))
        if item.status == WorkSchedule.Status.CONFIRMED and item.quotation.status in (Quotation.Status.ACCEPTED, Quotation.Status.CONVERTED):
            item.quotation.status = Quotation.Status.SCHEDULED
            item.quotation.save(update_fields=("status", "updated_at"))
        recipient = item.quotation.contractor if request.user.role == BharathUser.Roles.CUSTOMER else item.quotation.customer.portal_user
        notify(recipient, request.user, "SCHEDULE", "Work schedule response", f"{item.quotation.quotation_number}: {item.get_status_display()}", "/work-schedules")
        return Response(schedule_data(item))


class WorkSchedulePainterView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request, pk):
        if not WorkSchedule.objects.filter(pk=pk, quotation__contractor=request.user, status=WorkSchedule.Status.CONFIRMED).exists():
            return Response({"detail": "A mutually confirmed schedule is required."}, status=status.HTTP_400_BAD_REQUEST)
        raw_painters = request.data.get("painters") or []
        try:
            painter_ids = list(dict.fromkeys(int(entry.get("id") if isinstance(entry, dict) else entry) for entry in raw_painters))
        except (TypeError, ValueError):
            return Response({"painters": "Select valid Paint Applicators."}, status=status.HTTP_400_BAD_REQUEST)
        # Both assignment creators acquire the worker before the schedule. A
        # schedule-only lock cannot serialize bookings by different employers.
        painters = list(BharathUser.objects.select_for_update(of=("self",)).filter(
            id__in=painter_ids, role=BharathUser.Roles.PAINTER, is_active=True,
            is_verified=True, verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).order_by("pk"))
        item = WorkSchedule.objects.select_for_update(of=("self",)).select_related(
            "quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by",
        ).prefetch_related("painter_assignments__painter").filter(
            pk=pk, quotation__contractor=request.user, status=WorkSchedule.Status.CONFIRMED,
        ).first()
        if not item:
            return Response({"detail": "A mutually confirmed schedule is required."}, status=status.HTTP_400_BAD_REQUEST)
        existing_assignments = {
            row.painter_id: row for row in WorkSchedulePainter.objects.select_for_update().filter(schedule=item)
        }
        existing_assignment_ids = set(existing_assignments)
        team_ids = set(ContractorApplicatorTeam.objects.filter(
            contractor=request.user, painter_id__in=painter_ids, is_active=True,
            employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                 ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
        ).values_list("painter_id", flat=True))
        team_ids.update(ApplicatorBooking.objects.filter(contractor=request.user, applicator_id__in=painter_ids, status=ApplicatorBooking.Status.CONFIRMED, start_date__lte=item.proposed_end_date, end_date__gte=item.proposed_start_date).values_list("applicator_id", flat=True))
        team_ids.update(existing_assignment_ids.intersection(painter_ids))
        if team_ids != set(painter_ids):
            return Response({"painters": "Select a verified team member or confirmed booked Paint Applicator for these dates."}, status=status.HTTP_400_BAD_REQUEST)
        if len(painters) != len(painter_ids):
            return Response({"painters": "Select verified Paint Applicators only."}, status=status.HTTP_400_BAD_REQUEST)
        busy = WorkSchedulePainter.objects.filter(
            painter__in=painters, schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
            schedule__proposed_start_date__lte=item.proposed_end_date,
            schedule__proposed_end_date__gte=item.proposed_start_date,
        ).exclude(schedule=item).exclude(status__in=(WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED))
        if busy.exists():
            return Response({"painters": f"{busy.first().painter.get_full_name() or busy.first().painter.mobile} is already assigned during these dates."}, status=status.HTTP_400_BAD_REQUEST)
        terms = {int(entry["id"]): entry for entry in raw_painters if isinstance(entry, dict) and entry.get("id")}
        assignments = []
        notifications = []
        desired_ids = set(painter_ids)
        for painter_id, existing_assignment in existing_assignments.items():
            if painter_id in desired_ids or existing_assignment.status in {
                WorkSchedulePainter.Status.RELEASED,
                WorkSchedulePainter.Status.COMPLETED,
            }:
                continue
            if existing_assignment.status == WorkSchedulePainter.Status.IN_PROGRESS:
                return Response({"painters": "An active Paint Applicator cannot be removed after work starts."}, status=status.HTTP_400_BAD_REQUEST)
            existing_assignment.status = WorkSchedulePainter.Status.RELEASED
            existing_assignment.save(update_fields=("status",))
        for painter in painters:
            term = terms.get(painter.id, {})
            existing_assignment = existing_assignments.get(painter.id)
            wage_type = (
                term.get("wage_type") if term.get("wage_type") in {"DAILY", "WEEKLY"}
                else existing_assignment.wage_type if existing_assignment else "DAILY"
            )
            agreed_wage = (
                term.get("agreed_wage") if "agreed_wage" in term
                else existing_assignment.agreed_wage if existing_assignment else None
            )
            if existing_assignment:
                if existing_assignment.status == WorkSchedulePainter.Status.COMPLETED:
                    continue
                reactivated = existing_assignment.status in {WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED}
                existing_assignment.status = WorkSchedulePainter.Status.ASSIGNED if reactivated else existing_assignment.status
                existing_assignment.wage_type = wage_type
                existing_assignment.agreed_wage = agreed_wage or None
                if reactivated:
                    existing_assignment.responded_at = None
                    existing_assignment.work_started_at = None
                    existing_assignment.work_completed_at = None
                    existing_assignment.on_the_way_at = None
                    existing_assignment.assigned_at = timezone.now()
                    existing_assignment.save(update_fields=(
                        "status", "wage_type", "agreed_wage", "responded_at",
                        "work_started_at", "work_completed_at", "on_the_way_at", "assigned_at",
                    ))
                    notifications.append(painter)
                elif existing_assignment.status == WorkSchedulePainter.Status.ASSIGNED:
                    existing_assignment.save(update_fields=("wage_type", "agreed_wage"))
                continue
            assignments.append(WorkSchedulePainter(schedule=item, painter=painter, wage_type=wage_type, agreed_wage=agreed_wage or None))
            notifications.append(painter)
        WorkSchedulePainter.objects.bulk_create(assignments)
        for painter in notifications:
            notify(painter, request.user, "ASSIGNMENT", "New work assignment", f"{item.quotation.quotation_number}: {item.proposed_start_date} to {item.proposed_end_date}", "/painter-assignments")
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").get(pk=item.pk)
        return Response(schedule_data(item))


class HiringOutcomeScheduleAssignmentView(APIView):
    """Explicitly link a marketplace hire/booking to one confirmed project schedule."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, source_type, source_id):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)

        source_type = str(source_type or "").lower()
        if source_type == "application":
            source = JobApplication.objects.select_for_update().select_related("job", "painter").filter(
                pk=source_id, job__contractor=request.user,
            ).first()
            if not source:
                return Response({"detail": "Accepted application not found."}, status=status.HTTP_404_NOT_FOUND)
            if source.status != JobApplication.Status.ACCEPTED:
                return Response({"detail": "Only an accepted application can be assigned to a project."}, status=status.HTTP_400_BAD_REQUEST)
            painter = source.painter
            wage_type = source.job.job_type
            wage = source.job.daily_wage if wage_type == Job.JobType.DAILY else source.job.weekly_wage
            source_filter = {"source_application": source}
            source_fields = {"source_application": source}
        elif source_type == "booking":
            source = ApplicatorBooking.objects.select_for_update().select_related("applicator").filter(
                pk=source_id, contractor=request.user,
            ).first()
            if not source:
                return Response({"detail": "Confirmed booking not found."}, status=status.HTTP_404_NOT_FOUND)
            if source.status != ApplicatorBooking.Status.CONFIRMED:
                return Response({"detail": "Only a confirmed booking can be assigned to a project."}, status=status.HTTP_400_BAD_REQUEST)
            painter = source.applicator
            wage_type = source.wage_type
            wage = source.agreed_wage
            source_filter = {"source_booking": source}
            source_fields = {"source_booking": source}
        else:
            return Response({"source_type": "Choose application or booking."}, status=status.HTTP_400_BAD_REQUEST)

        if not painter.is_active or painter.role != BharathUser.Roles.PAINTER or not verified_painter(painter):
            return Response({"detail": "The Paint Applicator is no longer eligible for assignment."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            schedule_id = int(request.data.get("schedule_id"))
        except (TypeError, ValueError):
            return Response({"schedule_id": "Select a confirmed project schedule."}, status=status.HTTP_400_BAD_REQUEST)
        schedule = WorkSchedule.objects.select_for_update(of=("self",)).select_related("quotation").filter(
            pk=schedule_id,
            quotation__contractor=request.user,
            status=WorkSchedule.Status.CONFIRMED,
            customer_accepted=True,
            contractor_accepted=True,
        ).first()
        if not schedule:
            return Response({"schedule_id": "Select a confirmed schedule owned by your contractor account."}, status=status.HTTP_404_NOT_FOUND)
        source_start = source.job.start_date if source_type == "application" else source.start_date
        source_end = job_end_date(source.job) if source_type == "application" else source.end_date
        if schedule.proposed_start_date < source_start or schedule.proposed_end_date > source_end:
            return Response({"schedule_id": "The complete project schedule must fit inside the accepted job or booking dates."}, status=status.HTTP_400_BAD_REQUEST)

        linked = WorkSchedulePainter.objects.select_for_update().filter(**source_filter).first()
        if linked:
            if linked.schedule_id == schedule.pk:
                return Response({"assignment_id": linked.pk, "schedule_id": schedule.pk, "painter_id": painter.pk, "status": linked.status, "already_assigned": True}, status=status.HTTP_200_OK)
            return Response({"detail": "This hiring outcome is already linked to another schedule."}, status=status.HTTP_409_CONFLICT)

        busy = WorkSchedulePainter.objects.select_for_update().filter(
            painter=painter,
            schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
            schedule__proposed_start_date__lte=schedule.proposed_end_date,
            schedule__proposed_end_date__gte=schedule.proposed_start_date,
        ).exclude(schedule=schedule).exclude(
            status__in=(WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED),
        ).exists()
        if busy:
            return Response({"detail": "The Paint Applicator already has an overlapping project assignment."}, status=status.HTTP_409_CONFLICT)

        assignment = WorkSchedulePainter.objects.select_for_update().filter(
            schedule=schedule, painter=painter,
        ).first()
        created = assignment is None
        if assignment and assignment.status in (WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED):
            return Response({"detail": "This historical assignment was released. Create a new eligible assignment through the schedule workflow."}, status=status.HTTP_409_CONFLICT)
        if assignment and (assignment.source_application_id or assignment.source_booking_id):
            return Response({"detail": "This schedule assignment is already linked to another hiring outcome."}, status=status.HTTP_409_CONFLICT)
        if assignment is None:
            assignment = WorkSchedulePainter(schedule=schedule, painter=painter)
        assignment.wage_type = wage_type if wage_type in WorkSchedulePainter.WageType.values else WorkSchedulePainter.WageType.DAILY
        if not assignment.agreed_wage:
            assignment.agreed_wage = wage
        for field, value in source_fields.items():
            setattr(assignment, field, value)
        assignment.save()

        notify(
            painter, request.user, "ASSIGNMENT", "New work assignment",
            f"{schedule.quotation.quotation_number}: {schedule.proposed_start_date} to {schedule.proposed_end_date}",
            "/painter-assignments",
        )
        return Response({
            "assignment_id": assignment.pk,
            "schedule_id": schedule.pk,
            "painter_id": painter.pk,
            "status": assignment.status,
            "already_assigned": not created,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WorkSchedulePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").filter(pk=pk).first()
        if not item or not schedule_access(request.user, item):
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        # Project receipts serialize on the quotation too. Lock it first so the
        # advance and general receipt paths cannot both spend the same balance.
        Quotation.objects.select_for_update(of=("self",)).get(pk=item.quotation_id)
        item = WorkSchedule.objects.select_for_update(of=("self",)).select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").get(pk=pk)
        if item.status != WorkSchedule.Status.CONFIRMED:
            return Response({"detail": "Both parties must confirm the work dates first."}, status=status.HTTP_400_BAD_REQUEST)
        action = str(request.data.get("action") or "").upper()
        remaining = item.quotation.grand_total - (item.quotation.project_receipts.aggregate(total=models.Sum("amount"))["total"] or Decimal("0"))

        def advance_amount():
            try:
                amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01")).run_validation(request.data.get("amount"))
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"amount": error.detail})
            if amount > remaining:
                raise serializers.ValidationError({"amount": "The advance cannot exceed the remaining quotation balance."})
            return amount

        if action == "REQUEST":
            if request.user.id != item.quotation.contractor_id:
                return Response({"detail": "Only the contractor can request an advance."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status not in (WorkSchedule.PaymentStatus.NOT_REQUESTED, WorkSchedule.PaymentStatus.AWAITING_PAYMENT):
                return Response({"detail": "This payment has already been submitted or confirmed."}, status=status.HTTP_400_BAD_REQUEST)
            amount = advance_amount()
            item.advance_amount = amount
            item.payment_status = WorkSchedule.PaymentStatus.AWAITING_PAYMENT
            item.payment_mode = item.payment_reference = item.payment_note = ""
            item.payment_submitted_at = item.payment_confirmed_at = None
        elif action == "SUBMIT":
            can_submit_payment = (
                request.user.role == BharathUser.Roles.CUSTOMER
                and (
                    has_property_access(request.user, item.quotation.property, PropertyPermission.MAKE_PAYMENT)
                    if item.quotation.property_id
                    else request.user.id == item.quotation.customer.portal_user_id
                )
            )
            if not can_submit_payment:
                return Response({"detail": "Only the customer can submit payment details."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status != WorkSchedule.PaymentStatus.AWAITING_PAYMENT:
                return Response({"detail": "No advance payment is awaiting submission."}, status=status.HTTP_400_BAD_REQUEST)
            if item.advance_amount > remaining:
                return Response({"amount": "The requested advance exceeds the remaining quotation balance. Ask the contractor to update it."}, status=status.HTTP_400_BAD_REQUEST)
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
            if item.advance_amount > remaining:
                return Response({"amount": "The submitted advance exceeds the remaining quotation balance."}, status=status.HTTP_400_BAD_REQUEST)
            item.payment_status = WorkSchedule.PaymentStatus.CONFIRMED
            item.payment_confirmed_at = timezone.now()
        elif action == "RECORD":
            # Contractor received the advance directly (cash at site, instant UPI, etc.)
            # without raising a payment request first - record and confirm it in one step.
            if request.user.id != item.quotation.contractor_id:
                return Response({"detail": "Only the contractor can record a payment received."}, status=status.HTTP_403_FORBIDDEN)
            if item.payment_status not in (WorkSchedule.PaymentStatus.NOT_REQUESTED, WorkSchedule.PaymentStatus.AWAITING_PAYMENT):
                return Response({"detail": "This payment has already been submitted or confirmed."}, status=status.HTTP_400_BAD_REQUEST)
            amount = advance_amount()
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
        if (
            request.user.role == BharathUser.Roles.CUSTOMER
            and item.quotation.property_id
            and not has_property_access(request.user, item.quotation.property, PropertyPermission.VIEW_PAYMENTS)
        ):
            return Response({"detail": "Advance payment receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(build_advance_receipt_pdf(item, language=document_language(request)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{item.advance_receipt_number}.pdf"'
        return response


class WorkScheduleCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = WorkSchedule.objects.select_related("quotation", "quotation__customer", "quotation__property", "quotation__contractor", "proposed_by").prefetch_related("painter_assignments__painter").filter(pk=pk, quotation__contractor=request.user).first()
        if not item:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        if item.status in {WorkSchedule.Status.IN_PROGRESS, WorkSchedule.Status.COMPLETED}:
            return Response({"detail": "Work that has started cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        if item.payment_status == WorkSchedule.PaymentStatus.CONFIRMED:
            return Response({"detail": "A paid schedule cannot be cancelled through the unpaid-payment action."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": "Give a reason for cancelling the unpaid schedule."}, status=status.HTTP_400_BAD_REQUEST)
        item.status = WorkSchedule.Status.CANCELLED; item.cancellation_reason = reason
        item.painter_assignments.exclude(status__in=(WorkSchedulePainter.Status.COMPLETED, WorkSchedulePainter.Status.RELEASED)).update(
            status=WorkSchedulePainter.Status.RELEASED,
        )
        item.save(update_fields=("status", "cancellation_reason", "updated_at"))
        if item.quotation.status == Quotation.Status.SCHEDULED:
            item.quotation.status = Quotation.Status.ACCEPTED
            item.quotation.save(update_fields=("status", "updated_at"))
        return Response(schedule_data(item, request.user))


class WorkScheduleProgressView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
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
            active_assignments = item.painter_assignments.exclude(status__in=(
                WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED,
            ))
            if not active_assignments.exists():
                return Response({"detail": "Assign at least one Paint Applicator before starting work."}, status=status.HTTP_400_BAD_REQUEST)
            if active_assignments.exclude(status=WorkSchedulePainter.Status.ACCEPTED).exists():
                return Response({"detail": "Every active Paint Applicator must accept before work starts. Remove declined assignments or wait for pending responses."}, status=status.HTTP_400_BAD_REQUEST)
            item.status = WorkSchedule.Status.IN_PROGRESS; item.work_started_at = timezone.now(); item.customer_seen_update_at = None
            item.quotation.status = Quotation.Status.IN_PROGRESS
            item.quotation.save(update_fields=("status", "updated_at"))
            item.save(update_fields=("status", "work_started_at", "customer_seen_update_at", "updated_at"))
        elif action == "COMPLETE":
            if item.status != WorkSchedule.Status.IN_PROGRESS:
                return Response({"detail": "Start the work before marking it completed."}, status=status.HTTP_400_BAD_REQUEST)
            active_assignments = item.painter_assignments.exclude(status=WorkSchedulePainter.Status.RELEASED)
            if not active_assignments.exists():
                return Response({"detail": "Assign Paint Applicators before completing this schedule."}, status=status.HTTP_400_BAD_REQUEST)
            if active_assignments.exclude(status=WorkSchedulePainter.Status.COMPLETED).exists():
                return Response({"detail": "Every active Paint Applicator must complete work before the schedule can be completed."}, status=status.HTTP_400_BAD_REQUEST)
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
    field_definitions = getattr(request, "_inhouse_employee_field_definitions", None)
    if field_definitions is None:
        field_definitions = list(ContractorEmployeeFieldDefinition.objects.filter(contractor=item.contractor).order_by("sort_order", "id"))
        request._inhouse_employee_field_definitions = field_definitions
    return {
        "membership_id": item.id,
        "id": painter.id,
        "name": painter.get_full_name() or painter.mobile,
        "mobile": painter.mobile,
        "email": painter.email,
        "bharath_id": painter.bharath_id,
        "profile_photo": request.build_absolute_uri(painter.profile_photo.url) if painter.profile_photo else None,
        "profile_photo_position": ProfileImagePositionField().to_representation(painter.profile_photo_position),
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
        "trade": item.trade,
        "job_title": item.job_title,
        "emergency_contact_number": item.emergency_contact_number,
        "is_active": item.is_active,
        **employee_account_data(item, request.user),
        "date_of_birth": item.date_of_birth,
        "blood_group": item.blood_group,
        "salary_basis": item.salary_basis,
        "salary_amount": item.salary_amount,
        "hourly_rate": item.hourly_rate,
        "overtime_day_wage": item.overtime_day_wage,
        "esi_applicable": item.esi_applicable,
        "pf_applicable": item.pf_applicable,
        "custom_fields": item.custom_fields or {},
        "custom_field_definitions": [
            {"id": field.pk, "label": field.label, "field_type": field.field_type,
             "options": field.options, "required": field.required, "sort_order": field.sort_order,
             "is_active": field.is_active} for field in field_definitions
        ],
    }


def validate_employee_custom_values(contractor, values, existing=None):
    """Validate membership-keyed employee fields against one contractor's definitions."""
    if not isinstance(values, dict):
        return None, {"custom_fields": "Provide custom fields as an object."}
    saved = dict(existing or {})
    definitions = list(ContractorEmployeeFieldDefinition.objects.filter(contractor=contractor))
    by_id = {str(field.pk): field for field in definitions}
    errors = {}
    for key, value in values.items():
        field = by_id.get(str(key))
        if not field:
            errors[str(key)] = "This employee field is unavailable."
            continue
        if not field.is_active:
            if str(key) in saved and value == saved.get(str(key)):
                continue
            errors[str(key)] = "Archived employee field values cannot be changed."
            continue
        if value in (None, ""):
            saved.pop(str(field.pk), None)
            if field.required:
                errors[str(field.pk)] = f"{field.label} is required."
            continue
        valid = True
        normalized = value
        if field.field_type == ContractorEmployeeFieldDefinition.FieldType.TEXT:
            valid = isinstance(value, str) and len(value.strip()) <= 500
            normalized = value.strip() if isinstance(value, str) else value
        elif field.field_type == ContractorEmployeeFieldDefinition.FieldType.NUMBER:
            try:
                number = Decimal(str(value))
                valid = number.is_finite()
                normalized = str(number) if valid else value
            except (InvalidOperation, ValueError, TypeError):
                valid = False
        elif field.field_type == ContractorEmployeeFieldDefinition.FieldType.DATE:
            try:
                normalized = parse_date(str(value))
            except ValueError:
                normalized = None
            valid = normalized is not None
            normalized = normalized.isoformat() if normalized else value
        elif field.field_type == ContractorEmployeeFieldDefinition.FieldType.BOOLEAN:
            valid = isinstance(value, bool)
        elif field.field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE:
            valid = isinstance(value, str) and value in (field.options or [])
        if not valid:
            errors[str(field.pk)] = f"Enter a valid value for {field.label}."
            continue
        saved[str(field.pk)] = normalized
    for field in definitions:
        if field.is_active and field.required and saved.get(str(field.pk)) in (None, ""):
            errors.setdefault(str(field.pk), f"{field.label} is required.")
    return (None, errors) if errors else (saved, {})


def _history_value(value):
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _record_profile_changes(membership, actor, changes):
    if changes:
        EmployeeProfileChange.objects.create(membership=membership, actor=actor, changes=changes)


def salary_revision_data(revision):
    actor = revision.changed_by
    return {
        "id": revision.pk, "previous_salary_basis": revision.previous_salary_basis,
        "previous_salary_amount": _history_value(revision.previous_salary_amount),
        "salary_basis": revision.salary_basis, "salary_amount": _history_value(revision.salary_amount),
        "effective_from": revision.effective_from,
        "changed_by": actor.get_full_name() or actor.mobile, "recorded_at": revision.recorded_at,
    }


class InHouseEmployeeHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = ContractorApplicatorTeam.objects.filter(
            pk=pk, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        ).filter(models.Q(contractor=request.user) | models.Q(painter=request.user)).first()
        if not item:
            return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        profile = [{
            "id": row.pk, "changes": row.changes,
            "changed_by": row.actor.get_full_name() or row.actor.mobile,
            "recorded_at": row.created_at,
        } for row in item.profile_changes.select_related("actor").all()]
        salary = [salary_revision_data(row) for row in item.salary_revisions.select_related("changed_by").all()]
        return Response({"membership_id": item.pk, "profile_changes": profile, "salary_changes": salary})


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
        name = str(request.data.get("name") or "").strip()
        mobile = str(request.data.get("mobile") or "").strip()
        if not name or not mobile:
            return Response({"detail": "Name and mobile number are required."}, status=status.HTTP_400_BAD_REQUEST)
        mobile = normalize_mobile(mobile)
        if not mobile:
            return Response({"mobile": "Enter a valid mobile number with country code for international numbers."}, status=status.HTTP_400_BAD_REQUEST)
        employment_type = request.data.get("employment_type")
        is_in_house = employment_type == ContractorApplicatorTeam.EmploymentType.IN_HOUSE
        custom_fields = {}
        if is_in_house:
            custom_fields, field_errors = validate_employee_custom_values(request.user, request.data.get("custom_fields") or {})
            if field_errors:
                return Response({"custom_fields": field_errors}, status=status.HTTP_400_BAD_REQUEST)
        matching_users = matching_mobile_users(mobile)
        verified_painters = [
            user for user in matching_users
            if user.role == BharathUser.Roles.PAINTER
            and user.is_active
            and user.is_verified
            and user.verification_status == BharathUser.VerificationStatus.VERIFIED
        ]
        if matching_users and is_in_house:
            if len(verified_painters) != 1:
                return Response({"mobile": "This mobile is associated with an account that cannot be linked. The employee must use an active, verified Paint Applicator account."}, status=status.HTTP_400_BAD_REQUEST)
            painter = verified_painters[0]
            membership = ContractorApplicatorTeam.objects.filter(contractor=request.user, painter=painter).first()
            if membership:
                if membership.employment_type != ContractorApplicatorTeam.EmploymentType.IN_HOUSE:
                    return Response({"detail": "This Paint Applicator already has a different team relationship. Update the existing relationship explicitly before adding permanent employment."}, status=status.HTTP_409_CONFLICT)
                return Response({
                    "message": "This verified account is already linked as an in-house employee.",
                    "linked_existing_account": True,
                    "member": team_member_data(membership, request),
                }, status=status.HTTP_200_OK)
            enforce_employee_limit(request.user)
            membership = ContractorApplicatorTeam.objects.create(
                contractor=request.user, painter=painter,
                employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                joined_on=parse_date(str(request.data.get("joined_on") or "")) or timezone.localdate(),
                employee_code=next_employee_code(request.user),
                trade=str(request.data.get("trade") or "").strip()[:80],
                job_title=str(request.data.get("job_title") or "").strip()[:80],
                emergency_contact_number=str(request.data.get("emergency_contact_number") or "").strip()[:32],
                date_of_birth=parse_date(str(request.data.get("date_of_birth") or "")) or None,
                blood_group=str(request.data.get("blood_group") or "").strip().upper(),
                salary_basis=request.data.get("salary_basis") if request.data.get("salary_basis") in {choice[0] for choice in ContractorApplicatorTeam.SalaryBasis.choices} else ContractorApplicatorTeam.SalaryBasis.DAILY,
                salary_amount=request.data.get("salary_amount") or None,
                custom_fields=custom_fields,
                esi_applicable=bool(request.data.get("esi_applicable")),
                pf_applicable=bool(request.data.get("pf_applicable")),
            )
            response_data = {
                "message": "Verified Painter account linked to this contractor's in-house workforce.",
                "linked_existing_account": True,
                "member": team_member_data(membership, request),
            }
            if not painter.has_usable_password():
                response_data["activation_url"] = employee_activation_url(membership)
            return Response(response_data, status=status.HTTP_201_CREATED)
        if matching_users:
            return Response({"mobile": "An account with this mobile number already exists. Use an in-house employee record to link a verified Paint Applicator account."}, status=status.HTTP_400_BAD_REQUEST)
        password = None
        if not is_in_house:
            password = str(request.data.get("password") or "").strip() or f"BP@{secrets.token_urlsafe(6)}"
            if len(password) < 8:
                return Response({"password": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
        enforce_employee_limit(request.user)
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
        membership = ContractorApplicatorTeam.objects.create(
            contractor=request.user, painter=painter,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE if employment_type == "IN_HOUSE" else ContractorApplicatorTeam.EmploymentType.FLEXIBLE,
            joined_on=parse_date(str(request.data.get("joined_on") or "")) or timezone.localdate(),
            employee_code=next_employee_code(request.user),
            trade=str(request.data.get("trade") or "").strip()[:80],
            job_title=str(request.data.get("job_title") or "").strip()[:80],
            emergency_contact_number=str(request.data.get("emergency_contact_number") or "").strip()[:32],
            date_of_birth=parse_date(str(request.data.get("date_of_birth") or "")) or None,
            blood_group=str(request.data.get("blood_group") or "").strip().upper(),
            salary_basis=request.data.get("salary_basis") if request.data.get("salary_basis") in {choice[0] for choice in ContractorApplicatorTeam.SalaryBasis.choices} else ContractorApplicatorTeam.SalaryBasis.DAILY,
            salary_amount=request.data.get("salary_amount") or None,
            custom_fields=custom_fields,
            esi_applicable=bool(request.data.get("esi_applicable")),
            pf_applicable=bool(request.data.get("pf_applicable")),
        )
        response_data = {
            "message": "In-house employee created. Share the activation link so they can set their own password." if is_in_house else "Paint Applicator account created, verified, and added to your team.",
            "member": team_member_data(membership, request),
        }
        if is_in_house:
            response_data["activation_url"] = employee_activation_url(membership)
        else:
            response_data["credentials"] = {"name": painter.get_full_name(), "mobile": mobile, "password": password, "bharath_id": bharath_id}
        return Response(response_data, status=status.HTTP_201_CREATED)


class InHouseEmployeeActivationView(APIView):
    permission_classes = []
    authentication_classes = []

    def _employee(self, token, lock=False):
        if len(token) > 256:
            return None
        try:
            payload = signing.loads(
                token,
                salt=IN_HOUSE_EMPLOYEE_ACTIVATION_SALT,
                max_age=IN_HOUSE_EMPLOYEE_ACTIVATION_MAX_AGE,
            )
        except (signing.BadSignature, signing.SignatureExpired):
            return None
        queryset = BharathUser.objects.filter(
            pk=payload.get("user_id"), role=BharathUser.Roles.PAINTER,
            is_active=True, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
            contractor_teams__pk=payload.get("membership_id"),
            contractor_teams__employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            contractor_teams__is_active=True,
        )
        if lock:
            queryset = queryset.select_for_update(of=("self",))
        employee = queryset.first()
        if employee and lock:
            membership = ContractorApplicatorTeam.objects.select_for_update().filter(
                pk=payload.get("membership_id"), painter=employee, is_active=True,
                employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            ).first()
            if not membership:
                return None
        if not employee or employee.has_usable_password():
            return None
        return employee

    def get(self, request, token):
        employee = self._employee(token)
        if not employee:
            return Response({"detail": "This activation link is invalid, expired, or already used."}, status=status.HTTP_410_GONE)
        response = Response({"name": employee.get_full_name(), "mobile": employee.mobile})
        response["Cache-Control"] = "no-store"
        return response

    @transaction.atomic
    def post(self, request, token):
        employee = self._employee(token, lock=True)
        if not employee:
            return Response({"detail": "This activation link is invalid, expired, or already used."}, status=status.HTTP_410_GONE)
        password = str(request.data.get("password") or "")
        confirm_password = str(request.data.get("confirm_password") or "")
        if password != confirm_password:
            return Response({"confirm_password": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user=employee)
        except DjangoValidationError as error:
            return Response({"password": error.messages}, status=status.HTTP_400_BAD_REQUEST)
        employee.set_password(password)
        employee.save(update_fields=("password", "updated_at"))
        return Response({"detail": "Password set successfully. You can now sign in."})


class ContractorApplicatorTeamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.filter(pk=pk, contractor=request.user).first()
        if not item:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if item.is_active:
            item.is_active = False
            item.save(update_fields=("is_active",))
        return Response(status=status.HTTP_204_NO_CONTENT)


def inhouse_summary(item, request):
    data = team_member_data(item, request)
    entries = list(item.ledger_entries.all())
    earnings = sum((entry.amount for entry in entries if entry.entry_type in {ApplicatorLedgerEntry.EntryType.EARNING, ApplicatorLedgerEntry.EntryType.OVERTIME, ApplicatorLedgerEntry.EntryType.BONUS, ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT}), Decimal("0"))
    paid = sum((entry.amount for entry in entries if entry.entry_type in {ApplicatorLedgerEntry.EntryType.PAYMENT, ApplicatorLedgerEntry.EntryType.ADVANCE, ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT}), Decimal("0"))
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    units = Decimal("0")
    for attendance in item.attendance_records.filter(date__range=(week_start, week_end), approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED):
        if attendance.status == ApplicatorAttendance.Status.PRESENT:
            units += Decimal("1")
        elif attendance.status == ApplicatorAttendance.Status.HALF_DAY:
            units += Decimal("0.5")
    salary = item.salary_amount or Decimal("0")
    daily_rate = salary_daily_rate(item)
    weekly_rows = item.attendance_records.filter(date__range=(week_start, week_end), approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED)
    weekly_earning = sum((attendance_earning_amount(item, row) for row in weekly_rows), Decimal("0.00"))
    data.update({"total_earnings": earnings, "total_paid": paid, "balance": earnings - paid, "weekly_attendance_units": units, "weekly_earning": weekly_earning, "week_start": week_start, "week_end": week_end})
    return data


class ContractorEmployeeFieldDefinitionView(APIView):
    permission_classes = [IsAuthenticated]

    def _authorize(self, request):
        return verified_contractor(request.user)

    def _data(self, field):
        return {"id": field.pk, "label": field.label, "field_type": field.field_type,
                "options": field.options or [], "required": field.required,
                "sort_order": field.sort_order, "is_active": field.is_active}

    def get(self, request):
        if not self._authorize(request):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        fields = ContractorEmployeeFieldDefinition.objects.filter(contractor=request.user).order_by("sort_order", "id")
        return Response([self._data(field) for field in fields])

    def post(self, request):
        if not self._authorize(request):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        label = str(request.data.get("label") or "").strip()
        field_type = str(request.data.get("field_type") or "").upper()
        valid_types = {choice for choice, _ in ContractorEmployeeFieldDefinition.FieldType.choices}
        options = request.data.get("options") or []
        if not label or len(label) > 80:
            return Response({"label": "Enter a field name up to 80 characters."}, status=status.HTTP_400_BAD_REQUEST)
        if field_type not in valid_types:
            return Response({"field_type": "Choose text, number, date, yes/no or single choice."}, status=status.HTTP_400_BAD_REQUEST)
        if field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE and (not isinstance(options, list) or not options or any(not isinstance(value, str) or not value.strip() or len(value) > 80 for value in options)):
            return Response({"options": "Add one or more valid single-choice options."}, status=status.HTTP_400_BAD_REQUEST)
        if field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE:
            options = list(dict.fromkeys(option.strip() for option in options))
        if field_type != ContractorEmployeeFieldDefinition.FieldType.CHOICE:
            options = []
        if "required" in request.data and not isinstance(request.data.get("required"), bool):
            return Response({"required": "Choose true or false."}, status=status.HTTP_400_BAD_REQUEST)
        if ContractorEmployeeFieldDefinition.objects.filter(contractor=request.user, label__iexact=label).exists():
            return Response({"label": "A field with this name already exists."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sort_order = max(0, int(request.data.get("sort_order") or 0))
        except (ValueError, TypeError):
            return Response({"sort_order": "Enter a valid field order."}, status=status.HTTP_400_BAD_REQUEST)
        field = ContractorEmployeeFieldDefinition.objects.create(
            contractor=request.user, label=label, field_type=field_type, options=options,
            required=bool(request.data.get("required", False)), sort_order=sort_order,
        )
        return Response(self._data(field), status=status.HTTP_201_CREATED)

    def patch(self, request, pk):
        if not self._authorize(request):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        field = ContractorEmployeeFieldDefinition.objects.filter(pk=pk, contractor=request.user).first()
        if not field:
            return Response({"detail": "Employee field not found."}, status=status.HTTP_404_NOT_FOUND)
        if "is_active" in request.data:
            if not isinstance(request.data.get("is_active"), bool): return Response({"is_active": "Choose true or false."}, status=status.HTTP_400_BAD_REQUEST)
            field.is_active = request.data.get("is_active")
        if "required" in request.data:
            if not isinstance(request.data.get("required"), bool): return Response({"required": "Choose true or false."}, status=status.HTTP_400_BAD_REQUEST)
            field.required = request.data.get("required")
        if "sort_order" in request.data:
            try: field.sort_order = max(0, int(request.data["sort_order"]))
            except (ValueError, TypeError): return Response({"sort_order": "Enter a valid field order."}, status=status.HTTP_400_BAD_REQUEST)
        if "label" in request.data:
            label = str(request.data.get("label") or "").strip()
            if not label or len(label) > 80 or ContractorEmployeeFieldDefinition.objects.filter(contractor=request.user, label__iexact=label).exclude(pk=pk).exists():
                return Response({"label": "Enter a unique field name up to 80 characters."}, status=status.HTTP_400_BAD_REQUEST)
            field.label = label
        if "options" in request.data:
            options = request.data.get("options") or []
            if field.field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE and (not isinstance(options, list) or not options or any(not isinstance(value, str) or not value.strip() for value in options)):
                return Response({"options": "Add one or more valid single-choice options."}, status=status.HTTP_400_BAD_REQUEST)
            if field.field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE:
                options = list(dict.fromkeys(value.strip() for value in options))
                key = str(field.pk)
                for saved_values in ContractorApplicatorTeam.objects.filter(contractor=request.user).values_list("custom_fields", flat=True):
                    current_value = (saved_values or {}).get(key)
                    if current_value not in (None, "") and current_value not in options:
                        return Response({"options": "An option already used by an employee cannot be removed."}, status=status.HTTP_400_BAD_REQUEST)
            field.options = options if field.field_type == ContractorEmployeeFieldDefinition.FieldType.CHOICE else []
        field.save()
        return Response(self._data(field))


class InHouseApplicatorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        payroll_requested = str(request.query_params.get("payroll", "")).lower() in {"1", "true"}
        attendance_rows = ApplicatorAttendance.objects.all()
        selected_date = parse_date(request.query_params.get("date", "")) if not payroll_requested else None
        selected_month = request.query_params.get("month", "")
        try:
            year, month_number = map(int, selected_month.split("-"))
            if not 1 <= year <= 9999 or not 1 <= month_number <= 12:
                raise ValueError
        except (TypeError, ValueError):
            today = timezone.localdate()
            year, month_number = today.year, today.month
        if selected_date:
            attendance_rows = attendance_rows.filter(date=selected_date)
        else:
            attendance_rows = attendance_rows.filter(date__year=year, date__month=month_number)
        prefetches = [
            "ledger_entries",
            Prefetch("attendance_records", queryset=attendance_rows, to_attr="filtered_attendance_records"),
        ]
        if payroll_requested:
            prefetches.append("salary_revisions")
            prefetches.append("overtime_rate_revisions")
        members = ContractorApplicatorTeam.objects.filter(
            contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        ).select_related("painter", "painter__painter_profile").prefetch_related(*prefetches)
        results = []
        for item in members:
            data = inhouse_summary(item, request)
            attendance = item.filtered_attendance_records
            data["attendance_metrics"] = {
                "present_days": sum(1 for row in attendance if row.status == ApplicatorAttendance.Status.PRESENT),
                "overtime_hours": sum((row.overtime_hours for row in attendance), Decimal("0")),
                "absents": sum(1 for row in attendance if row.status == ApplicatorAttendance.Status.ABSENT),
                "total_present_days": sum((Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0") for row in attendance), Decimal("0")),
            }
            if payroll_requested:
                approved = [row for row in attendance if row.approval_status == ApplicatorAttendance.ApprovalStatus.APPROVED]
                payable = [row for row in approved if row.status in {ApplicatorAttendance.Status.PRESENT, ApplicatorAttendance.Status.HALF_DAY}]
                rates = {salary_daily_rate_for_date(item, row.date).quantize(Decimal("0.01")) for row in payable}
                if not rates:
                    month_end = date(year, month_number, monthrange(year, month_number)[1])
                    rates = {salary_daily_rate_for_date(item, min(month_end, timezone.localdate())).quantize(Decimal("0.01"))}
                overtime_total = sum((overtime_earning_amount(item, row) for row in payable), Decimal("0.00"))
                hourly = overtime_rate_for_date(item, timezone.localdate())
                data["payroll_summary"] = {
                    "earned_days": sum((Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") for row in payable), Decimal("0")),
                    "day_wage": next(iter(rates)) if len(rates) == 1 else None,
                    "day_wage_varies": len(rates) > 1,
                    "total": sum((attendance_earning_amount(item, row) for row in payable), Decimal("0.00")),
                    "overtime_pay": overtime_total,
                    "overtime_hours": sum((row.overtime_hours for row in payable if row.status == 'PRESENT'), Decimal('0')),
                    "gross_total": sum((attendance_earning_amount(item, row) for row in payable), Decimal('0.00')) + overtime_total,
                    "overtime_hourly_rate": str(overtime_rate_for_date(item, timezone.localdate())),
                    "hourly_rate": str(hourly),
                    "bonus_total": sum((entry.amount for entry in item.ledger_entries.all() if entry.entry_type == ApplicatorLedgerEntry.EntryType.BONUS and entry.date.year == year and entry.date.month == month_number), Decimal("0.00")),
                    "leave_days": sum(1 for row in approved if row.status == ApplicatorAttendance.Status.LEAVE),
                }
            results.append(data)
        return Response(results)

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
        data["salary_history"] = [salary_revision_data(row) for row in item.salary_revisions.select_related("changed_by").all()]
        attendance = item.attendance_records.all()
        month = request.query_params.get("month")
        date_from = parse_date(request.query_params.get("date_from", "")); date_to = parse_date(request.query_params.get("date_to", ""))
        if month:
            try: year, month_number = map(int, month.split("-")); attendance = attendance.filter(date__year=year, date__month=month_number)
            except (TypeError, ValueError): pass
        elif date_from and date_to:
            attendance = attendance.filter(date__range=(date_from, date_to))
        rows = list(attendance[:370])
        data["attendance"] = [attendance_record_data(row) for row in rows]
        data["attendance_summary"] = {"present": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.PRESENT), "half_day": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.HALF_DAY), "absent": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.ABSENT), "leave": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.LEAVE), "overtime_hours": sum((row.overtime_hours for row in rows), Decimal("0"))}
        ledger = item.ledger_entries.all()
        if month:
            try:
                ledger = ledger.filter(date__year=year, date__month=month_number)
            except (NameError, TypeError, ValueError):
                pass
        elif date_from and date_to:
            ledger = ledger.filter(date__range=(date_from, date_to))
        data["ledger"] = [{"id": row.id, "date": row.date, "entry_type": row.entry_type, "amount": row.amount, "payment_mode": row.payment_mode, "reference": row.reference, "note": row.note, "schedule": row.schedule_id, "source_attendance": row.source_attendance_id or row.source_overtime_attendance_id or row.source_attendance_adjustment_id, "attendance_component": row.attendance_component} for row in ledger[:370]]
        wage_year = request.query_params.get("wage_year")
        if wage_year is not None:
            if len(wage_year) != 4 or not wage_year.isdigit() or int(wage_year) < 1900:
                return Response({"wage_year": "Select a valid year."}, status=status.HTTP_400_BAD_REQUEST)
            selected_year = int(wage_year)
            year_attendance = item.attendance_records.filter(date__year=selected_year, approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED)
            year_ledger = item.ledger_entries.filter(date__year=selected_year)
            months = [{
                "month": f"{selected_year}-{number:02d}", "days_worked": Decimal("0"),
                "overtime_hours": Decimal("0"), "overtime_pay": Decimal("0"),
                "earning": Decimal("0"), "advance_deduction": Decimal("0"),
                "adjustments": Decimal("0"), "total_earning": Decimal("0"),
                "adjustment_entries": [],
            } for number in range(1, 13)]
            for row in year_attendance:
                summary = months[row.date.month - 1]
                summary["days_worked"] += Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0")
                summary["overtime_hours"] += row.overtime_hours
            for row in year_ledger:
                summary = months[row.date.month - 1]
                if row.entry_type in {ApplicatorLedgerEntry.EntryType.EARNING, ApplicatorLedgerEntry.EntryType.BONUS}:
                    summary["earning"] += row.amount
                elif row.entry_type == ApplicatorLedgerEntry.EntryType.ADVANCE:
                    summary["advance_deduction"] += row.amount
                elif row.entry_type in {ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT, ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT}:
                    component = 'OVERTIME' if row.attendance_component == 'OVERTIME' or row.reference.startswith('attendance-ot-correction:') else 'BASE'
                    target = 'overtime_pay' if component == 'OVERTIME' else 'adjustments'
                    summary[target] += row.amount if row.entry_type == ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT else -row.amount
                    summary["adjustment_entries"].append({
                        "id": row.id, "date": row.date, "entry_type": row.entry_type,
                        "amount": row.amount, "reference": row.reference, "note": row.note,
                        "source_attendance": row.source_attendance_id or row.source_overtime_attendance_id or row.source_attendance_adjustment_id,
                        "attendance_component": component,
                    })
                elif row.entry_type == ApplicatorLedgerEntry.EntryType.OVERTIME:
                    summary["overtime_pay"] += row.amount
            for summary in months:
                summary["total_earning"] = summary["earning"] + summary["overtime_pay"] + summary["adjustments"] - summary["advance_deduction"]
            total_fields = ("days_worked", "overtime_hours", "overtime_pay", "earning", "advance_deduction", "adjustments", "total_earning")
            data["wage_year_summary"] = {
                "year": selected_year, "months": months,
                "totals": {field: sum((summary[field] for summary in months), Decimal("0")) for field in total_fields},
            }
        assignment_rows = WorkSchedulePainter.objects.filter(painter=item.painter).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property")
        if request.user.role == BharathUser.Roles.CONTRACTOR:
            assignment_rows = assignment_rows.filter(schedule__quotation__contractor=request.user)
        data["assignments"] = [painter_assignment_data(row) for row in assignment_rows[:30]]
        return Response(data)

    @transaction.atomic
    def patch(self, request, pk):
        if not verified_contractor(request.user):
            return Response({"detail": "Only the contractor can update an employee profile."}, status=status.HTTP_403_FORBIDDEN)
        item = ContractorApplicatorTeam.objects.select_for_update().filter(pk=pk, contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE).first()
        if not item:
            return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        effective_from = parse_date(str(request.data.get("effective_from") or "")) if request.data.get("effective_from") else timezone.localdate()
        if not effective_from or effective_from > timezone.localdate():
            return Response({"effective_from": "Enter a valid salary date no later than today."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            before = {field: getattr(item, field) for field in ("blood_group", "salary_basis", "salary_amount", "trade", "job_title", "emergency_contact_number", "date_of_birth", "joined_on", "is_active", "esi_applicable", "pf_applicable")}
            before["name"] = item.painter.get_full_name()
            before_custom = dict(item.custom_fields or {})
            before["custom_fields"] = before_custom
            before["experience_years"] = item.painter.painter_profile.experience_years if hasattr(item.painter, "painter_profile") else 0
            before["skills"] = item.painter.painter_profile.skills if hasattr(item.painter, "painter_profile") else ""
        except Exception:
            return Response({"detail": "Employee profile could not be loaded."}, status=status.HTTP_409_CONFLICT)
        if "custom_fields" in request.data:
            custom_values, custom_errors = validate_employee_custom_values(request.user, request.data.get("custom_fields"), before_custom)
            if custom_errors:
                return Response({"custom_fields": custom_errors}, status=status.HTTP_400_BAD_REQUEST)
            item.custom_fields = custom_values
        for field in ("blood_group", "salary_basis"):
            if field in request.data:
                value = str(request.data.get(field) or "").strip().upper()
                if field == "salary_basis" and value not in {choice[0] for choice in ContractorApplicatorTeam.SalaryBasis.choices}:
                    return Response({field: "Choose a valid salary basis."}, status=status.HTTP_400_BAD_REQUEST)
                if field == "blood_group" and value and value not in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}:
                    return Response({field: "Choose a valid blood group."}, status=status.HTTP_400_BAD_REQUEST)
                setattr(item, field, value)
        for field, max_length in (("trade", 80), ("job_title", 80), ("emergency_contact_number", 32)):
            if field in request.data:
                value = str(request.data.get(field) or "").strip()
                if len(value) > max_length:
                    return Response({field: f"Use no more than {max_length} characters."}, status=status.HTTP_400_BAD_REQUEST)
                setattr(item, field, value)
        for field in ("date_of_birth", "joined_on"):
            if field in request.data:
                setattr(item, field, parse_date(str(request.data.get(field) or "")) or None)
        if "salary_amount" in request.data:
            try:
                item.salary_amount = Decimal(str(request.data.get("salary_amount") or "0"))
                if not item.salary_amount.is_finite() or item.salary_amount < 0: raise InvalidOperation
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
        after = {field: getattr(item, field) for field in before if field not in ("name", "experience_years", "skills", "custom_fields")}
        after["name"] = item.painter.get_full_name()
        after["experience_years"] = profile.experience_years
        after["skills"] = profile.skills
        after["custom_fields"] = item.custom_fields or {}
        changes = []
        labels = {"name": "Employee name", "blood_group": "Blood group", "salary_basis": "Salary basis", "salary_amount": "Salary / wage", "trade": "Service category", "job_title": "Job title", "emergency_contact_number": "Emergency contact", "date_of_birth": "Date of birth", "joined_on": "Joining date", "is_active": "Status", "esi_applicable": "ESI", "pf_applicable": "PF", "experience_years": "Experience", "skills": "Skills"}
        for field, old_value in before.items():
            new_value = after.get(field)
            if old_value != new_value:
                changes.append({"field": field, "label": labels.get(field, field), "old_value": _history_value(old_value), "new_value": _history_value(new_value)})
        old_basis, old_amount = before["salary_basis"], before["salary_amount"]
        salary_changed = old_basis != item.salary_basis or old_amount != item.salary_amount
        with transaction.atomic():
            item.save()
            if salary_changed:
                ApplicatorSalaryRevision.objects.create(
                    membership=item, previous_salary_basis=old_basis, previous_salary_amount=old_amount,
                    salary_basis=item.salary_basis, salary_amount=item.salary_amount,
                    effective_from=effective_from, changed_by=request.user,
                )
            custom_changes = []
            if before_custom != (item.custom_fields or {}):
                definitions = {str(row.pk): row for row in ContractorEmployeeFieldDefinition.objects.filter(contractor=request.user)}
                for key in set(before_custom) | set(item.custom_fields or {}):
                    old_value, new_value = before_custom.get(key), (item.custom_fields or {}).get(key)
                    if old_value != new_value:
                        field = definitions.get(key)
                        custom_changes.append({"field": f"custom:{key}", "label": field.label if field else f"Custom field {key}", "old_value": old_value, "new_value": new_value})
            _record_profile_changes(item, request.user, changes + custom_changes)
        return Response({"detail": "Employee updated."})


class InHouseAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        base = ContractorApplicatorTeam.objects.filter(pk=pk, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True)
        membership = base.filter(contractor=request.user).first() if request.user.role == BharathUser.Roles.CONTRACTOR else base.filter(painter=request.user).first()
        if not membership:
            return Response({"detail": "Active in-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
        multiple = "dates" in request.data
        if multiple and not verified_contractor(request.user):
            return Response({"detail": "Only the verified issuing contractor can record multiple attendance days."}, status=status.HTTP_403_FORBIDDEN)
        values = request.data.get("dates") if multiple else [request.data.get("date")]
        if not isinstance(values, list) or not values or len(values) > 366:
            return Response({"dates": "Select between 1 and 366 attendance days."}, status=status.HTTP_400_BAD_REQUEST)
        days = []
        for value in values:
            try:
                day = parse_date(str(value or ""))
            except ValueError:
                day = None
            if not day:
                return Response({"dates" if multiple else "date": "Select valid attendance dates."}, status=status.HTTP_400_BAD_REQUEST)
            if day > timezone.localdate():
                return Response({"dates" if multiple else "date": "Attendance cannot be recorded for a future date."}, status=status.HTTP_400_BAD_REQUEST)
            if day not in days:
                days.append(day)
        attendance_status = str(request.data.get("status") or "").upper()
        if attendance_status not in {choice[0] for choice in ApplicatorAttendance.Status.choices}:
            return Response({"status": "Select a valid attendance status."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            overtime_hours = Decimal(str(request.data.get("overtime_hours") or "0"))
        except InvalidOperation:
            return Response({"overtime_hours": "Enter valid overtime hours."}, status=status.HTTP_400_BAD_REQUEST)
        if not overtime_hours.is_finite() or overtime_hours < 0 or overtime_hours > 24:
            return Response({"overtime_hours": "Overtime must be between 0 and 24 hours."}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get("note") or "").strip()
        if len(note) > 180:
            return Response({"note": "Attendance notes must be at most 180 characters."}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve assignment and schedule
        assignment = None
        schedule = None
        assignment_id = request.data.get("assignment")
        schedule_id = request.data.get("schedule")

        if assignment_id:
            assignment = WorkSchedulePainter.objects.filter(
                pk=assignment_id, painter=membership.painter, schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS)
            ).select_related("schedule").first()
            if not assignment:
                return Response({"assignment": "Select a valid assignment for this employee."}, status=status.HTTP_400_BAD_REQUEST)
            schedule = assignment.schedule
        elif schedule_id:
            schedule = WorkSchedule.objects.filter(pk=schedule_id).first()
            if not schedule:
                return Response({"schedule": "Select a valid work schedule."}, status=status.HTTP_400_BAD_REQUEST)
            if request.user == membership.painter:
                if not schedule.painter_assignments.filter(painter=request.user).exists():
                    return Response({"schedule": "Select the assigned site where you are present."}, status=status.HTTP_400_BAD_REQUEST)
            else:
                if schedule.quotation.contractor_id != request.user.id:
                    return Response({"schedule": "Select a work site assigned to this employee under your contractor account."}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure the schedule belongs to the same contractor as the membership
        if schedule and schedule.quotation.contractor_id != membership.contractor_id:
            return Response({"schedule": "Schedule does not belong to this employee's contractor."}, status=status.HTTP_400_BAD_REQUEST)

        if request.user == membership.painter:
            if attendance_status != ApplicatorAttendance.Status.PRESENT or days != [timezone.localdate()]:
                return Response({"detail": "You can mark only today's attendance as Present."}, status=status.HTTP_403_FORBIDDEN)
            if not assignment:
                if not schedule:
                    return Response({"schedule": "Select the assigned site where you are present."}, status=status.HTTP_400_BAD_REQUEST)
                assignment = schedule.painter_assignments.filter(painter=request.user).first()
            if not assignment:
                return Response({"assignment": "No active assignment found for this schedule."}, status=status.HTTP_400_BAD_REQUEST)
            overtime_hours = Decimal("0")
        else:
            if assignment and assignment.schedule_id != (schedule.id if schedule else None):
                return Response({"assignment": "Assignment does not belong to the selected schedule."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate the complete selection before replacing any saved day. Lock the
        # membership so bulk/single updates and deactivation cannot race silently.
        with transaction.atomic():
            membership = ContractorApplicatorTeam.objects.select_for_update().filter(pk=membership.pk, is_active=True).first()
            if not membership:
                return Response({"detail": "Active in-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
            results = []
            expected_versions = request.data.get("expected_versions") if multiple else ({str(days[0]): request.data.get("expected_marked_at")} if request.data.get("expected_marked_at") else {})
            existing_by_day = {}
            for day in days:
                expected_version = expected_versions.get(str(day)) if isinstance(expected_versions, dict) else None
                current_row = ApplicatorAttendance.objects.filter(membership=membership, date=day).first()
                existing_by_day[day] = current_row
                if expected_version:
                    try:
                        expected_at = parse_datetime(str(expected_version))
                    except (ValueError, TypeError):
                        expected_at = None
                    if not current_row or not expected_at or current_row.marked_at != expected_at:
                        return Response({"detail": "Attendance changed on the server. Reload it and resolve the conflict before retrying."}, status=status.HTTP_409_CONFLICT)
                if request.user == membership.painter and current_row and current_row.approval_status != ApplicatorAttendance.ApprovalStatus.PENDING:
                    return Response({"detail": "Attendance has already been reviewed. Ask your contractor to make a correction."}, status=status.HTTP_409_CONFLICT)
            for day in days:
                approval = ApplicatorAttendance.ApprovalStatus.PENDING if request.user == membership.painter else ApplicatorAttendance.ApprovalStatus.APPROVED
                row, created = ApplicatorAttendance.objects.update_or_create(membership=membership, date=day, defaults={
                    "status": attendance_status, "assignment": assignment, "schedule": schedule, "note": note,
                    "overtime_hours": overtime_hours, "approval_status": approval,
                    "reviewed_by": request.user if approval == ApplicatorAttendance.ApprovalStatus.APPROVED else None,
                    "reviewed_at": timezone.now() if approval == ApplicatorAttendance.ApprovalStatus.APPROVED else None,
                })
                if approval == ApplicatorAttendance.ApprovalStatus.APPROVED or hasattr(row, "earning_posting"):
                    sync_attendance_earning(membership, row)
                previous = existing_by_day[day]
                changed = previous is None or any((
                    previous.status != row.status,
                    previous.approval_status != row.approval_status,
                    previous.schedule_id != row.schedule_id,
                    previous.assignment_id != row.assignment_id,
                    previous.note != row.note,
                    previous.overtime_hours != row.overtime_hours,
                ))
                if approval == ApplicatorAttendance.ApprovalStatus.APPROVED and changed:
                    ApplicatorAttendanceDecision.objects.create(
                        attendance=row, reviewer=request.user,
                        decision="CONTRACTOR_ENTRY" if created else "CORRECT",
                        previous_status=previous.status if previous else "",
                        status=row.status,
                        previous_approval_status=previous.approval_status if previous else "",
                        approval_status=row.approval_status,
                        previous_schedule_id=previous.schedule_id if previous else None,
                        schedule_id=row.schedule_id,
                        previous_assignment_id=previous.assignment_id if previous else None,
                        assignment_id=row.assignment_id,
                        note=note,
                    )
                results.append({"id": row.id, "date": row.date, "status": row.status, "approval_status": row.approval_status, "marked_at": row.marked_at, "note": row.note, "overtime_hours": row.overtime_hours, "assignment": row.assignment_id, "schedule": row.schedule_id})
        return Response({"results": results} if multiple else results[0], status=status.HTTP_201_CREATED)


class InHouseAttendanceReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, attendance_id):
        if not verified_contractor(request.user):
            return Response({"detail": "Only the verified issuing contractor can review attendance."}, status=status.HTTP_403_FORBIDDEN)
        decision = str(request.data.get("decision") or "").upper()
        if decision not in {ApplicatorAttendance.ApprovalStatus.APPROVED, ApplicatorAttendance.ApprovalStatus.REJECTED}:
            return Response({"decision": "Choose APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            membership = ContractorApplicatorTeam.objects.select_for_update().filter(
                pk=pk, contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            ).first()
            if not membership:
                return Response({"detail": "In-house applicator not found."}, status=status.HTTP_404_NOT_FOUND)
            attendance = ApplicatorAttendance.objects.select_for_update().filter(pk=attendance_id, membership=membership).first()
            if not attendance:
                return Response({"detail": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)
            previous = {
                "status": attendance.status,
                "approval_status": attendance.approval_status,
                "schedule_id": attendance.schedule_id,
                "assignment_id": attendance.assignment_id,
            }
            changed = attendance.approval_status != decision
            attendance.approval_status = decision
            attendance.reviewed_by = request.user
            attendance.reviewed_at = timezone.now()
            attendance.save(update_fields=("approval_status", "reviewed_by", "reviewed_at"))
            posting, adjustment, ot_entry, ot_adjustment = sync_attendance_earning(membership, attendance)
            if changed:
                ApplicatorAttendanceDecision.objects.create(
                    attendance=attendance, reviewer=request.user,
                    decision="APPROVE" if decision == ApplicatorAttendance.ApprovalStatus.APPROVED else "REJECT",
                    previous_status=previous["status"], status=attendance.status,
                    previous_approval_status=previous["approval_status"], approval_status=attendance.approval_status,
                    previous_schedule_id=previous["schedule_id"], schedule_id=attendance.schedule_id,
                    previous_assignment_id=previous["assignment_id"], assignment_id=attendance.assignment_id,
                    note=str(request.data.get("note") or "").strip()[:180],
                )
            earning_amount = attendance_earning_amount(membership, attendance) if attendance.approval_status == ApplicatorAttendance.ApprovalStatus.APPROVED else Decimal("0.00")
            ot_amount = overtime_earning_amount(membership, attendance) if attendance.approval_status == ApplicatorAttendance.ApprovalStatus.APPROVED else Decimal("0.00")
        return Response({"id": attendance.id, "approval_status": attendance.approval_status, "earning_entry_id": posting.id, "earning_adjustment_entry_id": adjustment.id if adjustment else None, "earning_amount": earning_amount, "overtime_entry_id": ot_entry.id if ot_entry else None, "overtime_adjustment_entry_id": ot_adjustment.id if ot_adjustment else None, "overtime_amount": ot_amount})


class MyInHouseEmploymentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        memberships = ContractorApplicatorTeam.objects.filter(
            painter=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True,
        ).select_related("contractor", "painter", "painter__painter_profile").prefetch_related("ledger_entries", "attendance_records")
        membership_id = request.query_params.get("membership_id")
        if membership_id:
            if not str(membership_id).isdigit():
                return Response({"detail": "Active in-house employment not found."}, status=status.HTTP_404_NOT_FOUND)
            item = memberships.filter(pk=membership_id).first()
            if not item:
                return Response({"detail": "Active in-house employment not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            item = memberships.first()
        if not item:
            return Response({"detail": "You are not registered as an active in-house employee."}, status=status.HTTP_404_NOT_FOUND)
        data = inhouse_summary(item, request)
        data["salary_history"] = [salary_revision_data(row) for row in item.salary_revisions.select_related("changed_by").all()]
        data["profile_history"] = [{
            "id": row.pk, "changes": row.changes,
            "changed_by": row.actor.get_full_name() or row.actor.mobile, "recorded_at": row.created_at,
        } for row in item.profile_changes.select_related("actor").all()]
        data["contractor_name"] = item.contractor.get_full_name() or item.contractor.mobile
        data["employments"] = [{
            "membership_id": membership.pk,
            "employee_code": membership.employee_code,
            "contractor_id": membership.contractor_id,
            "contractor_name": membership.contractor.get_full_name() or membership.contractor.mobile,
        } for membership in memberships]
        attendance = item.attendance_records.all()
        month = request.query_params.get("month")
        if month:
            try: year, month_number = map(int, month.split("-")); attendance = attendance.filter(date__year=year, date__month=month_number)
            except (TypeError, ValueError): pass
        rows = list(attendance[:370])
        data["attendance"] = [attendance_record_data(row) for row in rows]
        data["attendance_summary"] = {"present": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.PRESENT), "half_day": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.HALF_DAY), "absent": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.ABSENT), "leave": sum(1 for row in rows if row.status == ApplicatorAttendance.Status.LEAVE), "overtime_hours": sum((row.overtime_hours for row in rows), Decimal("0"))}
        data["assignments"] = [painter_assignment_data(row) for row in WorkSchedulePainter.objects.filter(
            painter=request.user, schedule__quotation__contractor_id=item.contractor_id,
        ).exclude(status__in=(WorkSchedulePainter.Status.COMPLETED, WorkSchedulePainter.Status.RELEASED, WorkSchedulePainter.Status.DECLINED)).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property")]
        return Response(data)


class MyInHouseEarningsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        memberships = ContractorApplicatorTeam.objects.filter(
            painter=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True,
        ).select_related("contractor", "painter")
        membership_id = request.query_params.get("membership_id")
        if membership_id:
            if not str(membership_id).isdigit():
                return Response({"detail": "Active in-house employment not found."}, status=status.HTTP_404_NOT_FOUND)
            item = memberships.filter(pk=membership_id).first()
            if not item:
                return Response({"detail": "Active in-house employment not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            item = memberships.first()
        if not item:
            if membership_id:
                return Response({"detail": "Active in-house employment not found."}, status=status.HTTP_404_NOT_FOUND)
            return self.marketplace_earnings(request)
        month = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month_number = map(int, month.split("-"))
        except (TypeError, ValueError):
            return Response({"month": "Select a valid month."}, status=status.HTTP_400_BAD_REQUEST)
        rows = list(item.attendance_records.filter(date__year=year, date__month=month_number, approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED).order_by("date"))
        salary = item.salary_amount or Decimal("0")
        daily_rate = salary_daily_rate(item)
        payable_units = sum((Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0") for row in rows), Decimal("0"))
        overtime = sum((row.overtime_hours for row in rows), Decimal("0"))
        bonuses = list(item.ledger_entries.filter(entry_type=ApplicatorLedgerEntry.EntryType.BONUS, date__year=year, date__month=month_number).order_by("-date", "-created_at"))
        bonus_total = sum((entry.amount for entry in bonuses), Decimal("0"))
        attendance_earning = sum((attendance_earning_amount(item, row) for row in rows), Decimal("0.00"))
        ledger_rows = list(item.ledger_entries.filter(date__year=year, date__month=month_number).order_by("-date", "-created_at"))
        earning_types = {
            ApplicatorLedgerEntry.EntryType.EARNING,
            ApplicatorLedgerEntry.EntryType.BONUS,
            ApplicatorLedgerEntry.EntryType.OVERTIME,
            ApplicatorLedgerEntry.EntryType.DEBIT_ADJUSTMENT,
        }
        payment_types = {
            ApplicatorLedgerEntry.EntryType.PAYMENT,
            ApplicatorLedgerEntry.EntryType.ADVANCE,
            ApplicatorLedgerEntry.EntryType.CREDIT_ADJUSTMENT,
        }
        recorded_earnings = sum((entry.amount for entry in ledger_rows if entry.entry_type in earning_types), Decimal("0"))
        recorded_payments = sum((entry.amount for entry in ledger_rows if entry.entry_type in payment_types), Decimal("0"))
        overtime_pay = sum((overtime_earning_amount(item, row) for row in rows), Decimal("0"))
        hourly = overtime_rate_for_date(item, timezone.localdate())
        return Response({
            "earning_type": "IN_HOUSE",
            "membership_id": item.id, "employee_name": request.user.get_full_name() or request.user.mobile,
            "employee_code": item.employee_code, "contractor_name": item.contractor.get_full_name() or item.contractor.mobile,
            "employments": [{
                "membership_id": membership.pk,
                "employee_code": membership.employee_code,
                "contractor_id": membership.contractor_id,
                "contractor_name": membership.contractor.get_full_name() or membership.contractor.mobile,
            } for membership in memberships],
            "month": month, "salary_basis": item.salary_basis, "salary_amount": salary,
            "daily_rate": daily_rate.quantize(Decimal("0.01")), "payable_days": payable_units,
            "attendance_earning": attendance_earning, "bonus_total": bonus_total,
            "overtime_pay": overtime_pay, "hourly_rate": str(hourly),
            "earned_amount": attendance_earning + overtime_pay + bonus_total, "overtime_hours": overtime,
            "recorded_earnings": recorded_earnings,
            "payments_total": sum((entry.amount for entry in ledger_rows if entry.entry_type == ApplicatorLedgerEntry.EntryType.PAYMENT), Decimal("0")),
            "advances_total": sum((entry.amount for entry in ledger_rows if entry.entry_type == ApplicatorLedgerEntry.EntryType.ADVANCE), Decimal("0")),
            "total_paid": recorded_payments,
            "outstanding_balance": recorded_earnings - recorded_payments,
            "ledger": [{
                "id": entry.id, "date": entry.date, "entry_type": entry.entry_type,
                "amount": entry.amount, "payment_mode": entry.payment_mode,
                "reference": entry.reference, "note": entry.note,
                "schedule": entry.schedule_id,
                "source_attendance": entry.source_attendance_id or entry.source_overtime_attendance_id or entry.source_attendance_adjustment_id, "attendance_component": entry.attendance_component,
            } for entry in ledger_rows],
            "bonuses": [{"id": entry.id, "date": entry.date, "amount": entry.amount, "note": entry.note} for entry in bonuses],
            "attendance": [{"date": row.date, "status": row.status, "approval_status": row.approval_status, "units": Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0"), "earning": attendance_earning_amount(item, row), "overtime_hours": row.overtime_hours, "overtime_pay": overtime_earning_amount(item, row)} for row in rows],
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
        if entry_type == ApplicatorLedgerEntry.EntryType.EARNING:
            return Response({"entry_type": "Earnings are posted from contractor-approved attendance. Use a bonus or adjustment for manual corrections."}, status=status.HTTP_400_BAD_REQUEST)
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
            "profile_photo_position": ProfileImagePositionField().to_representation(request.user.profile_photo_position),
            "mobile": request.user.mobile,
            "email": request.user.email,
            "bharath_id": request.user.bharath_id,
            "verification_status": request.user.verification_status,
            "experience_years": profile.experience_years,
            "skills": profile.skills,
            "preferred_locations": profile.preferred_locations,
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
        for field in ("skills", "preferred_locations", "emergency_contact_name", "emergency_contact_number", "blood_group", "permanent_address", "current_location", "willing_to_travel"):
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
        if "profile_photo_position" in request.data:
            serializer = ProfileImagePositionField()
            request.user.profile_photo_position = serializer.to_internal_value(request.data["profile_photo_position"])
        request.user.save(update_fields=("first_name", "last_name", "profile_photo", "profile_photo_position", "updated_at"))
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
    from quotations.work_changes import current_scope

    original_items = {line.id: line for line in quotation.items.select_related(
        "room", "service_type", "paint_type", "paint_brand", "color", "unit"
    )}
    work_scope = []
    for line in current_scope(quotation):
        original = original_items.get(line["source_item"])
        work_scope.append({
            "id": line["key"],
            "room": line["room"],
            "description": line["description"],
            "service": line["service"],
            "paint_type": line["material"],
            "paint_brand": line["brand"],
            "color": original.color.name if original and original.color else "",
            "coats": original.coats if original else None,
            "quantity": line["quantity"],
            "unit": line["unit"] or "sq ft",
        })
    return {"id": item.id, "status": item.status, "wage_type": item.wage_type, "agreed_wage": item.agreed_wage,
            "painter_note": item.painter_note, "assigned_at": item.assigned_at, "responded_at": item.responded_at,
            "schedule": schedule.id, "schedule_status": schedule.status, "quotation_number": quotation.quotation_number,
            "contractor_id": quotation.contractor_id,
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
        queryset = WorkSchedulePainter.objects.filter(painter=request.user).exclude(status__in=(WorkSchedulePainter.Status.COMPLETED, WorkSchedulePainter.Status.RELEASED)).select_related("schedule", "schedule__quotation", "schedule__quotation__contractor", "schedule__quotation__customer", "schedule__quotation__property").prefetch_related("schedule__quotation__items__room", "schedule__quotation__items__service_type", "schedule__quotation__items__paint_type", "schedule__quotation__items__paint_brand", "schedule__quotation__items__color", "schedule__quotation__items__unit")
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


def has_active_hiring_application(assignment):
    """A project hire remains eligible only while the underlying accepted job covers it."""
    if not assignment.source_application_id:
        return False
    source = JobApplication.objects.select_related("job").filter(
        pk=assignment.source_application_id, painter_id=assignment.painter_id,
        job__contractor_id=assignment.schedule.quotation.contractor_id,
        status=JobApplication.Status.ACCEPTED,
    ).first()
    return bool(source and source.job.status not in (Job.Status.CANCELLED, Job.Status.COMPLETED)
                and source.job.start_date <= assignment.schedule.proposed_start_date
                and job_end_date(source.job) >= assignment.schedule.proposed_end_date)


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
        if action in {"ACCEPT", "REJECT"}:
            if schedule.status != WorkSchedule.Status.CONFIRMED:
                return Response({"detail": "Only a confirmed work schedule can be accepted or declined."}, status=status.HTTP_400_BAD_REQUEST)
            if item.status != WorkSchedulePainter.Status.ASSIGNED or item.responded_at:
                return Response({"detail": "This assignment has already received a response or is no longer pending."}, status=status.HTTP_400_BAD_REQUEST)
            if action == "ACCEPT":
                active_team_member = ContractorApplicatorTeam.objects.filter(
                    contractor=schedule.quotation.contractor, painter=request.user, is_active=True,
                    employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                         ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
                ).exists()
                active_booking = ApplicatorBooking.objects.filter(
                    contractor=schedule.quotation.contractor, applicator=request.user,
                    status=ApplicatorBooking.Status.CONFIRMED,
                    start_date__lte=schedule.proposed_end_date,
                    end_date__gte=schedule.proposed_start_date,
                ).exists()
                if (not request.user.is_active or not request.user.is_verified
                        or request.user.verification_status != BharathUser.VerificationStatus.VERIFIED
                        or not (active_team_member or active_booking or has_active_hiring_application(item))):
                    return Response({"detail": "An active verified employee, accepted job application or confirmed booking is required to accept this assignment."}, status=status.HTTP_403_FORBIDDEN)
                item.status = WorkSchedulePainter.Status.ACCEPTED
            else:
                item.status = WorkSchedulePainter.Status.DECLINED
                item.painter_note = str(request.data.get("note") or "").strip()[:500]
            item.responded_at = now
            item.save(update_fields=("status", "responded_at", "painter_note"))
            notify(
                schedule.quotation.contractor, request.user, "ASSIGNMENT_RESPONSE",
                "Paint Applicator response",
                f"{request.user.get_full_name() or request.user.mobile} {'accepted' if action == 'ACCEPT' else 'declined'} {schedule.quotation.quotation_number}.",
                "/work-schedules",
            )
            return Response(painter_assignment_data(item))
        if action == "ON_THE_WAY":
            if item.status != WorkSchedulePainter.Status.ACCEPTED:
                return Response({"detail": "Accept this assignment before notifying that you are on the way."}, status=status.HTTP_400_BAD_REQUEST)
            item.on_the_way_at = now
            item.save(update_fields=("on_the_way_at",))
            customer = schedule.quotation.customer.portal_user
            notify(customer, request.user, "ON_THE_WAY", "Applicator is on the way", f"{request.user.get_full_name() or request.user.mobile} is travelling to {schedule.quotation.property.name or schedule.quotation.property.property_type}.", "/work-schedules")
            notify(schedule.quotation.contractor, request.user, "ON_THE_WAY", "Applicator is on the way", f"{request.user.get_full_name() or request.user.mobile} is travelling to the site.", "/work-schedules")
        elif action == "START":
            if item.status != WorkSchedulePainter.Status.ACCEPTED:
                return Response({"detail": "Accept this assignment before starting work."}, status=status.HTTP_400_BAD_REQUEST)
            if not request.user.is_active or not request.user.is_verified or request.user.verification_status != BharathUser.VerificationStatus.VERIFIED:
                return Response({"detail": "An active verified Paint Applicator account is required to start work."}, status=status.HTTP_403_FORBIDDEN)
            active_team_member = ContractorApplicatorTeam.objects.filter(
                contractor=schedule.quotation.contractor, painter=request.user, is_active=True,
                employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                     ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
            ).exists()
            active_booking = ApplicatorBooking.objects.filter(
                contractor=schedule.quotation.contractor, applicator=request.user,
                status=ApplicatorBooking.Status.CONFIRMED,
                start_date__lte=schedule.proposed_end_date,
                end_date__gte=schedule.proposed_start_date,
            ).exists()
            if not (active_team_member or active_booking or has_active_hiring_application(item)):
                return Response({"detail": "An active employee, accepted job application or confirmed booking is required to start work."}, status=status.HTTP_403_FORBIDDEN)
            if schedule.payment_status != WorkSchedule.PaymentStatus.CONFIRMED:
                return Response({"detail": "The contractor must confirm the schedule advance before work starts."}, status=status.HTTP_400_BAD_REQUEST)
            if schedule.status not in {WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS}:
                return Response({"detail": "Only a confirmed active schedule can be started."}, status=status.HTTP_400_BAD_REQUEST)
            if schedule.painter_assignments.exclude(status__in=(
                WorkSchedulePainter.Status.ACCEPTED, WorkSchedulePainter.Status.IN_PROGRESS,
                WorkSchedulePainter.Status.COMPLETED, WorkSchedulePainter.Status.RELEASED,
                WorkSchedulePainter.Status.DECLINED,
            )).exists():
                return Response({"detail": "Every active Paint Applicator must accept before work starts."}, status=status.HTTP_400_BAD_REQUEST)
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
            if not schedule.painter_assignments.exclude(status__in=(WorkSchedulePainter.Status.COMPLETED, WorkSchedulePainter.Status.RELEASED)).exists():
                schedule.status = WorkSchedule.Status.COMPLETED
                schedule.work_completed_at = now
                schedule.customer_seen_update_at = None
                schedule.save(update_fields=("status", "work_completed_at", "customer_seen_update_at", "updated_at"))
                schedule.quotation.status = Quotation.Status.COMPLETED
                schedule.quotation.save(update_fields=("status", "updated_at"))
        else:
            return Response({"action": "Select ACCEPT, REJECT, START, COMPLETE, or ON_THE_WAY."}, status=status.HTTP_400_BAD_REQUEST)
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
    contractor_profile = getattr(item.contractor, "contractor_profile", None)
    return {
        "id": item.id,
        "contractor": item.contractor_id,
        "contractor_name": contractor_profile.company_name if contractor_profile and contractor_profile.company_name else item.contractor.get_full_name() or item.contractor.mobile,
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
        if request.user.role not in (BharathUser.Roles.CONTRACTOR, BharathUser.Roles.PAINTER):
            return Response({"detail": "Contractor or Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees do not use marketplace booking requests."}, status=status.HTTP_403_FORBIDDEN)
        today = timezone.localdate()
        ApplicatorBooking.objects.filter(
            status=ApplicatorBooking.Status.PENDING,
            start_date__lt=today,
        ).update(status=ApplicatorBooking.Status.CLOSED, updated_at=timezone.now())
        ApplicatorBooking.objects.filter(
            status=ApplicatorBooking.Status.CONFIRMED,
            end_date__lt=today,
        ).update(status=ApplicatorBooking.Status.CLOSED, updated_at=timezone.now())
        queryset = ApplicatorBooking.objects.select_related("contractor", "contractor__contractor_profile", "applicator", "seeking_post")
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
        ).filter(
            models.Q(mobile__icontains=term)
            | models.Q(bharath_id__icontains=term)
            | models.Q(first_name__icontains=term)
            | models.Q(last_name__icontains=term)
            | models.Q(painter_profile__skills__icontains=term)
            | models.Q(painter_profile__preferred_locations__icontains=term)
        ).select_related("painter_profile").distinct()[:20]
        return Response([{
            "id": user.id, "name": user.get_full_name() or user.mobile, "mobile": user.mobile,
            "bharath_id": user.bharath_id,
            "skills": user.painter_profile.skills if hasattr(user, "painter_profile") else "",
            "preferred_locations": user.painter_profile.preferred_locations if hasattr(user, "painter_profile") else "",
        } for user in users])


class ApplicatorBookingActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if is_inhouse_applicator(request.user):
            return Response({"detail": "In-house employees do not use marketplace bookings."}, status=status.HTTP_403_FORBIDDEN)
        item = ApplicatorBooking.objects.select_related("contractor", "applicator", "seeking_post").filter(pk=pk).first()
        if not item:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id not in {item.contractor_id, item.applicator_id}:
            return Response({"detail": "Action not allowed."}, status=status.HTTP_403_FORBIDDEN)
        today = timezone.localdate()
        expired = (
            item.status == ApplicatorBooking.Status.PENDING
            and item.start_date < today
        ) or (
            item.status == ApplicatorBooking.Status.CONFIRMED
            and item.end_date < today
        )
        if expired:
            item.status = ApplicatorBooking.Status.CLOSED
            item.save(update_fields=("status", "updated_at"))
            return Response(
                {"detail": "These booking dates have passed. The booking is closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
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
                    painter=item.applicator, schedule__status__in=(WorkSchedule.Status.CONFIRMED, WorkSchedule.Status.IN_PROGRESS),
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
                    "transfer_request": pending_transfer_data(application, request.user),
                    "available_transfer_jobs": available_transfer_jobs(application),
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


class MonthlyWageRegisterView(APIView):
    """Monthly wage register for all in-house employees under a contractor."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not verified_contractor(request.user):
            return Response({"detail": "Verified contractor access only."}, status=status.HTTP_403_FORBIDDEN)

        month = request.query_params.get("month")
        if not month:
            today = timezone.localdate()
            month = today.strftime("%Y-%m")
        try:
            year, month_number = map(int, month.split("-"))
            if not 1 <= year <= 9999 or not 1 <= month_number <= 12:
                raise ValueError
        except (TypeError, ValueError):
            return Response({"month": "Select a valid month (YYYY-MM)."}, status=status.HTTP_400_BAD_REQUEST)

        members = ContractorApplicatorTeam.objects.filter(
            contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE, is_active=True,
        ).select_related("painter", "painter__painter_profile").prefetch_related(
            "attendance_records", "ledger_entries", "salary_revisions"
        )

        month_start = date(year, month_number, 1)
        month_end = date(year, month_number, monthrange(year, month_number)[1])

        employees = []
        totals = {
            "total_earned_days": Decimal("0"),
            "total_base_wage": Decimal("0"),
            "total_overtime_hours": Decimal("0"),
            "total_overtime_pay": Decimal("0"),
            "total_bonus": Decimal("0"),
            "total_gross": Decimal("0"),
            "total_advances": Decimal("0"),
            "total_payments": Decimal("0"),
            "total_net_payable": Decimal("0"),
        }

        for item in members:
            # Attendance for this month
            attendance = item.attendance_records.filter(
                date__year=year, date__month=month_number,
                approval_status=ApplicatorAttendance.ApprovalStatus.APPROVED
            ).order_by("date")

            earned_days = Decimal("0")
            base_wage = Decimal("0")
            overtime_hours = Decimal("0")
            overtime_pay = Decimal("0")
            daily_rates = set()

            for row in attendance:
                units = Decimal("1") if row.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if row.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0")
                if units > 0:
                    earned_days += units
                daily_rate = salary_daily_rate_for_date(item, row.date)
                daily_rates.add(daily_rate.quantize(Decimal("0.01")))
                base_wage += attendance_earning_amount(item, row)
                if row.status == ApplicatorAttendance.Status.PRESENT:
                    overtime_hours += row.overtime_hours
                    overtime_pay += overtime_earning_amount(item, row)

            # Bonuses
            bonus_total = sum((
                entry.amount for entry in item.ledger_entries.filter(
                    entry_type=ApplicatorLedgerEntry.EntryType.BONUS,
                    date__year=year, date__month=month_number
                )
            ), Decimal("0"))

            # Advances and payments
            advances = sum((
                entry.amount for entry in item.ledger_entries.filter(
                    entry_type=ApplicatorLedgerEntry.EntryType.ADVANCE,
                    date__year=year, date__month=month_number
                )
            ), Decimal("0"))

            payments = sum((
                entry.amount for entry in item.ledger_entries.filter(
                    entry_type=ApplicatorLedgerEntry.EntryType.PAYMENT,
                    date__year=year, date__month=month_number
                )
            ), Decimal("0"))

            gross_earnings = base_wage + overtime_pay + bonus_total
            net_payable = gross_earnings - advances - payments

            # Hourly rate
            hourly = overtime_rate_for_date(item, timezone.localdate())

            employees.append({
                "membership_id": item.id,
                "employee_name": item.painter.get_full_name() or item.painter.mobile,
                "employee_code": item.employee_code,
                "salary_basis": item.salary_basis,
                "salary_amount": str(item.salary_amount or "0"),
                "hourly_rate": str(hourly),
                "earned_days": str(earned_days),
                "base_wage": str(base_wage),
                "overtime_hours": str(overtime_hours),
                "overtime_pay": str(overtime_pay),
                "bonus_total": str(bonus_total),
                "gross_earnings": str(gross_earnings),
                "advances_total": str(advances),
                "payments_total": str(payments),
                "net_payable": str(net_payable),
            })

            totals["total_earned_days"] += earned_days
            totals["total_base_wage"] += base_wage
            totals["total_overtime_hours"] += overtime_hours
            totals["total_overtime_pay"] += overtime_pay
            totals["total_bonus"] += bonus_total
            totals["total_gross"] += gross_earnings
            totals["total_advances"] += advances
            totals["total_payments"] += payments
            totals["total_net_payable"] += net_payable

        return Response({
            "month": month,
            "employees": employees,
            "totals": {k: str(v) for k, v in totals.items()},
        })
