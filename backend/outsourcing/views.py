from decimal import Decimal
from uuid import UUID
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam
from quotations.models import ContractorConnection, PortalNotification, ProjectScope, QuotationItem
from django.http import Http404, HttpResponse
from django.utils.dateparse import parse_datetime
from .pricing import prepare_pricing, save_pricing

from . import workflow
from .models import (
    AdditionalWorkRequest,
    SubcontractInvoice,
    SubcontractQuote,
    SubcontractWorkOrder,
    WageRecord,
    WorkOrderAssignment,
)
from .serializers import (
    AdditionalWorkRequestSerializer,
    SubcontractInvoicePaymentSerializer,
    SubcontractInvoiceSerializer,
    SubcontractQuoteSerializer,
    SubcontractWorkOrderSerializer,
    WageRecordSerializer,
    WorkOrderAssignmentSerializer,
    WorkOrderEventSerializer,
)
from .workflow import authority_for


def visible_work_orders(user):
    if getattr(user, "role", None) == BharathUser.Roles.ADMIN or user.is_superuser:
        return SubcontractWorkOrder.objects.all()
    return SubcontractWorkOrder.objects.filter(
        Q(main_contractor=user) | Q(receiving_contractor=user)
    ).exclude(Q(receiving_contractor=user,material_mode__in=["WITH_MATERIAL","WITHOUT_MATERIAL"],status="DRAFT"))


def get_work_order_for(user, pk):
    work_order = get_object_or_404(SubcontractWorkOrder.objects.select_related("quotation"), pk=pk)
    if authority_for(user, work_order) is None:
        raise ValidationError("You are not part of this work order.")
    if work_order.material_mode and work_order.status == "DRAFT" and user.id == work_order.receiving_contractor_id:
        raise Http404("Work order not found.")
    return work_order


def require_role(user, *roles):
    if getattr(user, "role", None) not in roles:
        raise ValidationError("You do not have access to this action.")


class WorkOrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubcontractWorkOrderSerializer

    def get_queryset(self):
        return visible_work_orders(self.request.user).select_related(
            "quotation", "main_contractor", "receiving_contractor"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["viewer"] = self.request.user
        return context

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        require_role(request.user, BharathUser.Roles.CONTRACTOR, BharathUser.Roles.ADMIN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quotation = serializer.validated_data["quotation"]
        if request.user.role != BharathUser.Roles.ADMIN and quotation.contractor_id != request.user.id:
            raise ValidationError({"quotation": "That quotation is not yours."})

        items = None
        if "quotation_item_ids" in request.data:
            item_ids = request.data["quotation_item_ids"]
            if not isinstance(item_ids, list) or not item_ids or any(type(pk) is not int or pk <= 0 for pk in item_ids):
                raise ValidationError({"quotation_item_ids": "Select at least one quotation service."})
            if request.data.get("material_mode") and len(item_ids) != len(set(item_ids)):
                raise ValidationError({"quotation_item_ids":"Select each saved quotation line once."})
            if request.data.get("project_scope_ids"):
                raise ValidationError({"quotation_item_ids": "Choose quotation services or project scopes, not both."})
            items = list(QuotationItem.objects.filter(quotation=quotation, id__in=item_ids).select_related("service_category", "unit", "service_type").order_by("id"))
            if len(items) != len(set(item_ids)):
                raise ValidationError({"quotation_item_ids": "Some services are not part of this quotation."})
            # This is a scope request. The subcontractor prices it separately.
            serializer.validated_data["agreed_amount"] = Decimal("0")

        receiving = serializer.validated_data.get("receiving_contractor")
        if receiving and receiving.id == quotation.contractor_id:
            raise ValidationError({"receiving_contractor": "You cannot send work to yourself."})

        connection = serializer.validated_data.get("connection")
        if connection and (connection.status != ContractorConnection.Status.CONNECTED or
                           {connection.requester_id, connection.recipient_id} != {quotation.contractor_id, receiving.id if receiving else None}):
            raise ValidationError({"connection": "Choose a connected relationship with the receiving contractor."})
        if receiving and not connection:
            connection = ContractorConnection.objects.filter(
                Q(requester=quotation.contractor, recipient=receiving)
                | Q(requester=receiving, recipient=quotation.contractor),
                status=ContractorConnection.Status.CONNECTED,
            ).first()
            if connection is None:
                raise ValidationError(
                    {"receiving_contractor": "You can only send work to a connected contractor."}
                )

        reserved = {"quotation", "receiving_contractor", "connection", "main_contractor"}
        priced = bool(request.data.get("material_mode"))
        if priced and not receiving:
            raise ValidationError({"receiving_contractor":"Select a connected Work Order recipient."})
        prepared = prepare_pricing(quotation,request.data.get("material_mode"),request.data.get("pricing_input"),items or []) if priced else None
        creation_key=request.data.get("creation_key") if prepared else None
        if creation_key:
            try:creation_key=str(UUID(str(creation_key)))
            except (ValueError,TypeError,AttributeError):raise ValidationError({"creation_key":"Provide a valid creation token."})
            type(quotation).objects.select_for_update().get(pk=quotation.pk)
            prior=SubcontractWorkOrder.objects.filter(quotation=quotation,main_contractor=quotation.contractor,private_pricing__creation_key=creation_key).first()
            if prior:
                if prior.receiving_contractor_id != receiving.id:
                    raise ValidationError({"creation_key":"That token belongs to another recipient."})
                return Response(self.get_serializer(prior).data,status=status.HTTP_200_OK)
            prepared["private"]["creation_key"]=creation_key
        work_order = SubcontractWorkOrder.objects.create(
            quotation=quotation,
            main_contractor=quotation.contractor,
            receiving_contractor=receiving,
            connection=connection,
            created_by=request.user,
            **{
                key: value
                for key, value in serializer.validated_data.items()
                if key not in reserved
            },
        )

        scope_ids = request.data.get("project_scope_ids") or []
        if scope_ids:
            scopes = list(
                ProjectScope.objects.filter(quotation=quotation, id__in=scope_ids).select_related("category")
            )
            if len(scopes) != len(set(scope_ids)):
                raise ValidationError({"project_scope_ids": "Some scopes are not part of this quotation."})
            workflow.share_scopes(work_order, scopes)
        if prepared:
            save_pricing(work_order,prepared,request.user)
        elif items is not None:
            workflow.share_quotation_items(work_order, items)

        return Response(
            self.get_serializer(work_order).data,
            status=status.HTTP_201_CREATED,
        )


class WorkOrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubcontractWorkOrderSerializer

    def get_queryset(self):
        return visible_work_orders(self.request.user)

    def get_object(self):
        return get_work_order_for(self.request.user, self.kwargs["pk"])

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["viewer"] = self.request.user
        return context

    def update(self, request, *args, **kwargs):
        work_order = self.get_object()
        if authority_for(request.user, work_order) != workflow.MAIN:
            raise ValidationError("Only the main contractor can edit a work order.")
        if work_order.material_mode:
            raise ValidationError("Use Edit Draft pricing to update this priced work order atomically.")
        if work_order.status not in {
            SubcontractWorkOrder.Status.DRAFT,
            SubcontractWorkOrder.Status.SENT,
        }:
            raise ValidationError("This work order can no longer be edited.")
        return super().update(request, *args, **kwargs)


class WorkOrderShareScopesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.material_mode:
            raise ValidationError("Use Edit Draft pricing to select saved quotation lines.")
        if authority_for(request.user, work_order) != workflow.MAIN:
            raise ValidationError("Only the main contractor can share project scopes.")
        scope_ids = request.data.get("project_scope_ids") or []
        quotation = work_order.quotation
        scopes = list(
            ProjectScope.objects.filter(quotation=quotation, id__in=scope_ids).select_related("category")
        )
        if len(scopes) != len(set(scope_ids)):
            raise ValidationError({"project_scope_ids": "Some scopes do not belong to this quotation."})
        workflow.share_scopes(work_order, scopes)
        work_order.refresh_from_db()
        return Response(SubcontractWorkOrderSerializer(work_order, context={"viewer": request.user}).data)


class WorkOrderTransitionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        target = (request.data.get("status") or "").strip()
        valid = {value for value, _ in SubcontractWorkOrder.Status.choices}
        if target not in valid:
            raise ValidationError({"status": "Unknown status."})
        try:
            workflow.transition(request.user, work_order, target, note=request.data.get("note", ""))
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        work_order.refresh_from_db()
        return Response(SubcontractWorkOrderSerializer(work_order, context={"viewer": request.user}).data)


class WorkOrderDraftPricingView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self,request,pk):
        work_order=get_work_order_for(request.user,pk)
        work_order=SubcontractWorkOrder.objects.select_for_update().get(pk=work_order.pk)
        if work_order.main_contractor_id != request.user.pk or work_order.status != "DRAFT" or not work_order.material_mode:
            raise ValidationError("Only the main contractor can edit pricing on this Draft.")
        for field in ["quotation","receiving_contractor","connection"]:
            if field in request.data and str(request.data[field]) != str(getattr(work_order,field+"_id")):
                raise ValidationError({field:"The source revision and parties are pinned to this Draft."})
        raw=request.data.get("expected_updated_at")
        try:
            expected=parse_datetime(raw) if isinstance(raw,str) else None
        except ValueError:
            expected=None
        if expected is None or expected.tzinfo is None:
            raise ValidationError({"expected_updated_at":"Provide the saved Draft timestamp including its timezone."})
        if expected != work_order.updated_at:
            return Response({"detail":"This Work Order changed in another session. Reopen it before saving."},status=409)
        ids=request.data.get("quotation_item_ids")
        if not isinstance(ids,list) or not ids or any(type(value) is not int or value <= 0 for value in ids):
            raise ValidationError({"quotation_item_ids":"Select saved quotation line items."})
        items=list(QuotationItem.objects.filter(quotation=work_order.quotation,pk__in=ids).select_related("unit","service_category","service_type","paint_type","paint_brand"))
        if len(items)!=len(ids) or len(ids)!=len(set(ids)):
            raise ValidationError({"quotation_item_ids":"Select unique lines from the pinned quotation."})
        metadata=SubcontractWorkOrderSerializer(work_order,data=request.data,partial=True,context={"viewer":request.user})
        metadata.is_valid(raise_exception=True)
        prepared=prepare_pricing(work_order.quotation,request.data.get("material_mode",work_order.material_mode),request.data.get("pricing_input"),items,existing=work_order)
        allowed={key:value for key,value in metadata.validated_data.items() if key in {"project_title","site_address","agreed_scope_summary","instructions","terms","required_start_date","required_end_date"}}
        for key,value in allowed.items():setattr(work_order,key,value)
        save_pricing(work_order,prepared,request.user)
        if allowed:work_order.save(update_fields=[*allowed,"updated_at"])
        return Response(SubcontractWorkOrderSerializer(work_order,context={"viewer":request.user}).data)


class WorkOrderPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self,request,pk):
        from .pdf import build_work_order_pdf
        work_order=get_work_order_for(request.user,pk)
        response=HttpResponse(build_work_order_pdf(work_order),content_type="application/pdf")
        response["Content-Disposition"]=f'inline; filename="work-order-{work_order.pk}.pdf"'
        response["Cache-Control"]="no-store"
        return response


class WorkOrderCorrectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        try:
            workflow.request_correction(request.user, work_order, request.data.get("note", ""))
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        work_order.refresh_from_db()
        return Response(SubcontractWorkOrderSerializer(work_order, context={"viewer": request.user}).data)


class WorkOrderAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can assign their own employees.")
        if work_order.status not in {
            SubcontractWorkOrder.Status.ACCEPTED,
            SubcontractWorkOrder.Status.SCHEDULED,
            SubcontractWorkOrder.Status.IN_PROGRESS,
        }:
            raise ValidationError({"assignment": "Employees can be added once the work order is accepted."})

        employee = request.data.get("employee")
        user_row = get_object_or_404(BharathUser, pk=employee) if employee else None
        if (user_row is None or user_row.role != BharathUser.Roles.PAINTER
                or not user_row.is_active or not user_row.is_verified
                or user_row.verification_status != BharathUser.VerificationStatus.VERIFIED
                or not ContractorApplicatorTeam.objects.filter(
                    contractor=request.user, painter=user_row, is_active=True,
                    employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                         ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
                ).exists()):
            raise ValidationError({"employee": "Choose one of your employees."})

        assignment, created = WorkOrderAssignment.objects.get_or_create(
            work_order=work_order,
            employee=user_row,
            defaults={"assigned_by": request.user, "note": request.data.get("note", "")},
        )
        if not created and assignment.status == WorkOrderAssignment.Status.RELEASED:
            assignment.status = WorkOrderAssignment.Status.PROPOSED
            assignment.assigned_at = timezone.now()
            assignment.released_at = None
            assignment.save(update_fields=["status", "assigned_at", "released_at"])
        elif not created:
            raise ValidationError({"employee": "This employee already has an active assignment."})
        PortalNotification.objects.create(
            recipient=user_row, actor=request.user, event_type="ASSIGNMENT",
            title="New contractor work assignment",
            message=f"{work_order.reference}: {work_order.project_title}",
            link="/painter-assignments",
        )
        return Response(
            WorkOrderAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can change their team.")
        assignment = get_object_or_404(WorkOrderAssignment, pk=request.data.get("assignment"), work_order=work_order)
        if assignment.status in {WorkOrderAssignment.Status.IN_PROGRESS, WorkOrderAssignment.Status.COMPLETED}:
            raise ValidationError({"assignment": "Work that has started cannot be released from the employee history."})
        assignment.status = WorkOrderAssignment.Status.RELEASED
        assignment.released_at = timezone.now()
        assignment.save(update_fields=["status", "released_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkOrderMyAssignmentsView(APIView):
    """Return only the operational details an assigned employee needs."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_403_FORBIDDEN)
        assignments = WorkOrderAssignment.objects.filter(
            employee=request.user,
            status__in=(WorkOrderAssignment.Status.PROPOSED, WorkOrderAssignment.Status.ACCEPTED,
                        WorkOrderAssignment.Status.IN_PROGRESS),
            work_order__status__in=(SubcontractWorkOrder.Status.ACCEPTED, SubcontractWorkOrder.Status.SCHEDULED,
                                    SubcontractWorkOrder.Status.IN_PROGRESS),
        ).select_related("work_order", "work_order__receiving_contractor").prefetch_related("work_order__scopes")
        return Response([{
            "id": row.id,
            "reference": row.work_order.reference,
            "project_title": row.work_order.project_title,
            "site_address": row.work_order.site_address,
            "instructions": row.work_order.instructions,
            "contractor_name": row.work_order.receiving_contractor.get_full_name() or row.work_order.receiving_contractor.mobile,
            "start_date": row.work_order.required_start_date,
            "end_date": row.work_order.required_end_date,
            "status": row.status,
            "assigned_at": row.assigned_at,
            "responded_at": row.responded_at,
            "work_started_at": row.work_started_at,
            "work_completed_at": row.work_completed_at,
            "scope": [{
                "id": scope.id,
                "title": scope.title_snapshot,
                "description": scope.work_description_snapshot,
                "quantity": scope.quantity,
                "unit": scope.unit_name_snapshot,
            } for scope in row.work_order.scopes.all()],
        } for row in assignments.order_by("work_order__required_start_date", "assigned_at")])


class WorkOrderAssignmentResponseView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != BharathUser.Roles.PAINTER:
            return Response({"detail": "Paint Applicator access only."}, status=status.HTTP_404_NOT_FOUND)
        assignment = WorkOrderAssignment.objects.select_for_update().select_related(
            "work_order", "work_order__receiving_contractor"
        ).filter(pk=pk, employee=request.user).first()
        if not assignment:
            return Response({"detail": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        order = assignment.work_order
        action = str(request.data.get("action") or "").strip().upper()
        now = timezone.now()
        if action in {"ACCEPT", "REJECT"}:
            if order.status not in {SubcontractWorkOrder.Status.ACCEPTED, SubcontractWorkOrder.Status.SCHEDULED,
                                    SubcontractWorkOrder.Status.IN_PROGRESS}:
                return Response({"detail": "This work order is not open for employee responses."}, status=status.HTTP_400_BAD_REQUEST)
            if assignment.status != WorkOrderAssignment.Status.PROPOSED or assignment.responded_at:
                return Response({"detail": "This assignment has already received a response."}, status=status.HTTP_400_BAD_REQUEST)
            if action == "ACCEPT":
                eligible = (
                    request.user.is_active and request.user.is_verified
                    and request.user.verification_status == BharathUser.VerificationStatus.VERIFIED
                    and ContractorApplicatorTeam.objects.filter(
                        contractor=order.receiving_contractor, painter=request.user, is_active=True,
                        employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                             ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
                    ).exists()
                )
                if not eligible:
                    return Response({"detail": "An active verified employee membership is required."}, status=status.HTTP_400_BAD_REQUEST)
                assignment.status = WorkOrderAssignment.Status.ACCEPTED
            else:
                assignment.status = WorkOrderAssignment.Status.DECLINED
                assignment.note = str(request.data.get("note") or "").strip()[:180]
            assignment.responded_at = now
            assignment.save(update_fields=("status", "responded_at", "note"))
            PortalNotification.objects.create(
                recipient=order.receiving_contractor, actor=request.user,
                event_type="ASSIGNMENT_RESPONSE", title="Employee work response",
                message=f"{request.user.get_full_name() or request.user.mobile} {'accepted' if action == 'ACCEPT' else 'declined'} {order.reference}.",
                link="/subcontract-work-orders",
            )
        elif action == "START":
            if assignment.status != WorkOrderAssignment.Status.ACCEPTED:
                return Response({"detail": "Accept this assignment before starting work."}, status=status.HTTP_400_BAD_REQUEST)
            eligible = (
                request.user.is_active and request.user.is_verified
                and request.user.verification_status == BharathUser.VerificationStatus.VERIFIED
                and ContractorApplicatorTeam.objects.filter(
                    contractor=order.receiving_contractor, painter=request.user, is_active=True,
                    employment_type__in=(ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
                                         ContractorApplicatorTeam.EmploymentType.FLEXIBLE),
                ).exists()
            )
            if not eligible:
                return Response({"detail": "An active verified employee membership is required to start work."}, status=status.HTTP_400_BAD_REQUEST)
            if order.status not in {SubcontractWorkOrder.Status.ACCEPTED, SubcontractWorkOrder.Status.SCHEDULED,
                                    SubcontractWorkOrder.Status.IN_PROGRESS}:
                return Response({"detail": "This work order cannot be started in its current state."}, status=status.HTTP_400_BAD_REQUEST)
            if WorkOrderAssignment.objects.filter(work_order=order).exclude(
                status__in=(WorkOrderAssignment.Status.ACCEPTED, WorkOrderAssignment.Status.IN_PROGRESS,
                            WorkOrderAssignment.Status.COMPLETED, WorkOrderAssignment.Status.DECLINED,
                            WorkOrderAssignment.Status.RELEASED),
            ).exists():
                return Response({"detail": "Every active employee must accept their assignment before work starts."}, status=status.HTTP_400_BAD_REQUEST)
            if order.required_start_date and timezone.localdate() < order.required_start_date:
                return Response({"detail": f"Work can be started on or after {order.required_start_date}."}, status=status.HTTP_400_BAD_REQUEST)
            assignment.status = WorkOrderAssignment.Status.IN_PROGRESS
            assignment.work_started_at = now
            assignment.save(update_fields=("status", "work_started_at"))
            if order.status != SubcontractWorkOrder.Status.IN_PROGRESS:
                order.status = SubcontractWorkOrder.Status.IN_PROGRESS
                order.started_at = order.started_at or now
                order.save(update_fields=("status", "started_at", "updated_at"))
        elif action == "COMPLETE":
            if assignment.status != WorkOrderAssignment.Status.IN_PROGRESS:
                return Response({"detail": "Start your work before marking it complete."}, status=status.HTTP_400_BAD_REQUEST)
            assignment.status = WorkOrderAssignment.Status.COMPLETED
            assignment.work_completed_at = now
            assignment.save(update_fields=("status", "work_completed_at"))
        else:
            return Response({"action": "Select ACCEPT, REJECT, START, or COMPLETE."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "id": assignment.id, "reference": order.reference, "project_title": order.project_title,
            "status": assignment.status, "responded_at": assignment.responded_at,
            "work_started_at": assignment.work_started_at, "work_completed_at": assignment.work_completed_at,
        })


class WorkOrderWageView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WageRecordSerializer

    def get_work_order(self):
        return get_work_order_for(self.request.user, self.kwargs["pk"])

    def get_queryset(self):
        work_order = self.get_work_order()
        if work_order.receiving_contractor_id != self.request.user.id:
            return WageRecord.objects.none()
        return WageRecord.objects.filter(work_order=work_order).select_related("employee")

    def create(self, request, *args, **kwargs):
        work_order = self.get_work_order()
        employee = get_object_or_404(BharathUser, pk=request.data.get("employee")) if request.data.get("employee") else None
        if employee is None:
            raise ValidationError({"employee": "Choose an employee."})
        assigned = WorkOrderAssignment.objects.filter(
            work_order=work_order,
            employee=employee,
            status__in=[WorkOrderAssignment.Status.ACCEPTED, WorkOrderAssignment.Status.IN_PROGRESS,
                        WorkOrderAssignment.Status.COMPLETED],
        ).exists()
        if not assigned:
            raise ValidationError({"employee": "That employee is not on this work order."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = workflow.record_wage(
                request.user,
                work_order,
                employee,
                serializer.validated_data["amount"],
                serializer.validated_data["wage_type"],
                days_worked=serializer.validated_data.get("days_worked") or 0,
                accrued_on=serializer.validated_data.get("accrued_on"),
                note=serializer.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        return Response(self.get_serializer(record).data, status=status.HTTP_201_CREATED)


class WorkOrderQuoteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        quotes = work_order.quotes.select_related("created_by").prefetch_related("quote_lines")
        return Response(SubcontractQuoteSerializer(quotes, many=True, context={"viewer": request.user}).data)

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can price this work.")
        if work_order.material_mode:
            raise ValidationError("Accept or decline the agreed Work Order pricing instead.")
        payload = dict(request.data)
        payload["work_order"] = work_order.pk
        serializer = SubcontractQuoteSerializer(data=payload, context={"viewer": request.user})
        serializer.is_valid(raise_exception=True)
        quote = serializer.save(created_by=request.user, status=SubcontractQuote.Status.DRAFT)
        return Response(
            SubcontractQuoteSerializer(quote, context={"viewer": request.user}).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.material_mode:
            raise ValidationError("Use the Work Order acceptance or decline actions for agreed pricing.")
        quote = get_object_or_404(SubcontractQuote, pk=request.data.get("quote"), work_order=work_order)
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can send this quote.")
        if quote.status != SubcontractQuote.Status.DRAFT:
            raise ValidationError({"quote": "Only a draft quote can be sent."})
        quote.status = SubcontractQuote.Status.SENT
        quote.sent_at = timezone.now()
        if not quote.expires_at:
            quote.expires_at = timezone.localdate() + timedelta(days=quote.valid_days or 15)
        quote.save(update_fields=["status", "sent_at", "expires_at", "updated_at"])
        return Response(SubcontractQuoteSerializer(quote, context={"viewer": request.user}).data)


class WorkOrderQuoteDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.material_mode:
            raise ValidationError("Use the Work Order acceptance or decline actions for agreed pricing.")
        quote = get_object_or_404(SubcontractQuote, pk=request.data.get("quote"), work_order=work_order)
        decision = (request.data.get("decision") or "").strip().upper()
        try:
            workflow.decide_quote(request.user, quote, decision, note=request.data.get("note", ""))
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        return Response(SubcontractQuoteSerializer(quote, context={"viewer": request.user}).data)


class WorkOrderInvoiceView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubcontractInvoiceSerializer

    def get_work_order(self):
        return get_work_order_for(self.request.user, self.kwargs["pk"])

    def get_queryset(self):
        return SubcontractInvoice.objects.filter(work_order=self.get_work_order()).prefetch_related("payments")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["viewer"] = self.request.user
        return context

    def create(self, request, *args, **kwargs):
        work_order = self.get_work_order()
        if work_order.main_contractor_id != request.user.id:
            raise ValidationError("Only the main contractor can bill a receiving contractor.")
        if work_order.status != SubcontractWorkOrder.Status.COMPLETED:
            raise ValidationError({"invoice": "Bill only after the work is approved as complete."})
        if SubcontractInvoice.objects.filter(work_order=work_order).exists():
            raise ValidationError({"invoice": "This work order already has an invoice."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save(work_order=work_order, created_by=request.user)
        invoice.issued_at = timezone.now()
        invoice.status = SubcontractInvoice.Status.ISSUED
        invoice.save(update_fields=["issued_at", "status", "updated_at"])
        return Response(self.get_serializer(invoice).data, status=status.HTTP_201_CREATED)


class WorkOrderPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        invoice = get_object_or_404(SubcontractInvoice, pk=request.data.get("invoice"), work_order=work_order)
        serializer = SubcontractInvoicePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data["amount"]
        try:
            workflow.record_payment(
                request.user,
                invoice,
                amount,
                serializer.validated_data["payment_mode"],
                reference=serializer.validated_data.get("payment_reference", ""),
                notes=serializer.validated_data.get("notes", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        invoice.refresh_from_db()
        return Response(SubcontractInvoiceSerializer(invoice, context={"viewer": request.user}).data)


class AdditionalWorkRequestView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AdditionalWorkRequestSerializer

    def get_work_order(self):
        return get_work_order_for(self.request.user, self.kwargs["pk"])

    def get_queryset(self):
        return AdditionalWorkRequest.objects.filter(work_order=self.get_work_order())

    def create(self, request, *args, **kwargs):
        work_order = self.get_work_order()
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can raise additional work.")
        if work_order.status not in {
            SubcontractWorkOrder.Status.SCHEDULED,
            SubcontractWorkOrder.Status.IN_PROGRESS,
            SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW,
            SubcontractWorkOrder.Status.CORRECTION_REQUESTED,
        }:
            raise ValidationError({"request": "Additional work can only be raised while the job is running."})
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_row = serializer.save(work_order=work_order, requested_by=request.user)
        return Response(self.get_serializer(request_row).data, status=status.HTTP_201_CREATED)


class AdditionalWorkDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        row = get_object_or_404(AdditionalWorkRequest, pk=request.data.get("request"), work_order=work_order)
        decision = (request.data.get("decision") or "").strip().upper()
        approved = request.data.get("approved_amount")
        try:
            workflow.decide_additional_work(
                request.user,
                row,
                decision,
                approved_amount=Decimal(approved) if approved not in (None, "") else None,
                note=request.data.get("note", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or list(exc.messages))
        return Response(AdditionalWorkRequestSerializer(row).data)


class WorkOrderEventListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkOrderEventSerializer

    def get_queryset(self):
        work_order = get_work_order_for(self.request.user, self.kwargs["pk"])
        return work_order.events.select_related("actor")


class WorkOrderOpenPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = get_work_order_for(request.user, pk)
        if order.main_contractor_id != request.user.pk and request.user.role != BharathUser.Roles.ADMIN:
            raise ValidationError("Only the issuing contractor can prepare the Open Platform preview.")
        from .sharing import open_projection
        return Response(open_projection(order))


class WorkOrderMarginPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from quotations.models import Quotation
        require_role(request.user, BharathUser.Roles.CONTRACTOR, BharathUser.Roles.ADMIN)
        from rest_framework import serializers as input_serializers
        identifier = input_serializers.IntegerField(min_value=1)
        existing = None
        if request.data.get("work_order") is not None:
            existing = get_work_order_for(request.user, identifier.run_validation(request.data["work_order"]))
            if existing.main_contractor_id != request.user.pk or existing.status != "DRAFT":
                raise ValidationError("Only the issuing contractor can preview Draft changes.")
            quotation = existing.quotation
        else:
            quotation = get_object_or_404(Quotation, pk=identifier.run_validation(request.data.get("quotation")), contractor=request.user, deleted_at__isnull=True)
        items = list(quotation.items.select_related("unit", "service_category", "paint_type", "paint_brand", "service_type", "color").all())
        if existing and existing.private_pricing.get("source_snapshot"):
            ids = {line["id"] for line in existing.private_pricing["source_snapshot"]["items"]}
            items = [item for item in items if item.pk in ids]
        from .margins import prepare_margins, source_snapshot
        allocation_source = None
        if not existing and "quotation_item_ids" in request.data:
            ids = request.data["quotation_item_ids"]
            if not isinstance(ids,list) or not ids or any(type(value) is not int or value <= 0 for value in ids) or len(ids)!=len(set(ids)):
                raise ValidationError({"quotation_item_ids":"Select unique quotation items."})
            if set(ids)-{item.pk for item in items}:
                raise ValidationError({"quotation_item_ids":"Some items are not part of this quotation."})
            allocation_source = source_snapshot(quotation, items)
            items = [item for item in items if item.pk in ids]
        prepared = prepare_margins(quotation, request.data.get("material_mode", "WITH_MATERIAL"), request.data.get("pricing_input"), items, existing, allocation_source)
        return Response({"source_snapshot": prepared["private"]["source_snapshot"], "lines": [{"source_item": line["item"].pk, "vendor_rate": line["exact_rate"], "amount": str(line["amount"])} for line in prepared["lines"]],
            "totals": {key: str(value) for key, value in prepared["totals"].items()}})
