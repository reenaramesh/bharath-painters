from decimal import Decimal
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser
from quotations.models import ContractorConnection, ProjectScope

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
    )


def get_work_order_for(user, pk):
    work_order = get_object_or_404(SubcontractWorkOrder.objects.select_related("quotation"), pk=pk)
    if authority_for(user, work_order) is None:
        raise ValidationError("You are not part of this work order.")
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

    def create(self, request, *args, **kwargs):
        require_role(request.user, BharathUser.Roles.CONTRACTOR, BharathUser.Roles.ADMIN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quotation = serializer.validated_data["quotation"]
        if request.user.role != BharathUser.Roles.ADMIN and quotation.contractor_id != request.user.id:
            raise ValidationError({"quotation": "That quotation is not yours."})

        receiving = serializer.validated_data.get("receiving_contractor")
        if receiving and receiving.id == quotation.contractor_id:
            raise ValidationError({"receiving_contractor": "You cannot send work to yourself."})

        connection = serializer.validated_data.get("connection")
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
        if user_row is None or user_row.role != BharathUser.Roles.PAINTER:
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
        return Response(
            WorkOrderAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
        if work_order.receiving_contractor_id != request.user.id:
            raise ValidationError("Only the receiving contractor can change their team.")
        assignment = get_object_or_404(WorkOrderAssignment, pk=request.data.get("assignment"), work_order=work_order)
        assignment.status = WorkOrderAssignment.Status.RELEASED
        assignment.released_at = timezone.now()
        assignment.save(update_fields=["status", "released_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            status__in=[WorkOrderAssignment.Status.PROPOSED, WorkOrderAssignment.Status.ACCEPTED],
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
        payload = dict(request.data)
        payload["work_order"] = work_order.pk
        serializer = SubcontractQuoteSerializer(data=payload, context={"viewer": request.user})
        serializer.is_valid(raise_exception=True)
        quote = serializer.save(created_by=request.user)
        return Response(
            SubcontractQuoteSerializer(quote, context={"viewer": request.user}).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, pk):
        work_order = get_work_order_for(request.user, pk)
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
