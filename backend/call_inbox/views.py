from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.mobile import normalize_mobile
from accounts.models import BharathUser
from quotations.models import (
    Customer, ContractorCustomerConnection, SavedCustomerContact,
    Lead, LeadStageHistory,
)
from .models import BlockedCaller, CallInboxEvent
from .serializers import CallEventCreateSerializer


def contractor_only(request):
    return request.user.role == BharathUser.Roles.CONTRACTOR


def visible_customers(contractor):
    return Customer.objects.filter(
        Q(contractor_connections__contractor=contractor, contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED)
        | Q(saved_contacts__contractor=contractor)
        | Q(contractor=contractor, contractor_connections__isnull=True)
    ).exclude(status=Customer.Status.CANCELLED).distinct()


def match_customer(contractor, normalized_mobile):
    return visible_customers(contractor).filter(normalized_mobile=normalized_mobile).order_by("-contractor", "id").first()


def lead_customers(contractor):
    connected = Customer.objects.filter(
        contractor_connections__contractor=contractor,
        contractor_connections__status=ContractorCustomerConnection.Status.CONNECTED,
    )
    legacy_owned = Customer.objects.filter(
        contractor=contractor, contractor_connections__isnull=True,
    )
    return (connected | legacy_owned).exclude(status=Customer.Status.CANCELLED).distinct()


def event_data(event):
    customer = event.matched_customer
    return {
        "id": event.pk,
        "phone_number": event.phone_number,
        "normalized_mobile": event.normalized_mobile,
        "caller_name": event.caller_name,
        "name_source": event.name_source,
        "occurred_at": event.occurred_at,
        "call_status": event.call_status,
        "capture_source": event.capture_source,
        "review_status": event.review_status,
        "matched_customer": customer.pk if customer else None,
        "customer_name": customer.name if customer else "",
        "display_name": customer.name if customer else (event.caller_name or event.phone_number),
        "created_lead": event.created_lead_id,
    }


class EventListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not contractor_only(request):
            return Response({"detail": "Contractor access only."}, status=403)
        queryset = CallInboxEvent.objects.filter(contractor=request.user).select_related("matched_customer")
        tab = request.query_params.get("tab", "all")
        filters = {
            "new": Q(matched_customer__isnull=True, review_status=CallInboxEvent.ReviewStatus.PENDING),
            "existing": Q(matched_customer__isnull=False),
            "pending": Q(review_status=CallInboxEvent.ReviewStatus.PENDING),
            "dismissed": Q(review_status=CallInboxEvent.ReviewStatus.DISMISSED),
            "blocked": Q(review_status=CallInboxEvent.ReviewStatus.BLOCKED),
        }
        if tab in filters:
            queryset = queryset.filter(filters[tab])
        search = request.query_params.get("search", "").strip()
        if search:
            normalized = normalize_mobile(search)
            query = Q(phone_number__icontains=search) | Q(caller_name__icontains=search) | Q(matched_customer__name__icontains=search)
            if normalized:
                query |= Q(normalized_mobile=normalized)
            queryset = queryset.filter(query)
        results = [event_data(event) for event in queryset[:500]]
        return Response({"count": len(results), "results": results})

    def post(self, request):
        if not contractor_only(request):
            return Response({"detail": "Contractor access only."}, status=403)
        serializer = CallEventCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data["idempotency_key"].strip()
        if not key:
            return Response({"idempotency_key": "This field is required."}, status=400)
        existing = CallInboxEvent.objects.filter(contractor=request.user, idempotency_key=key).select_related("matched_customer").first()
        if existing:
            return Response(event_data(existing), status=200)
        data = dict(serializer.validated_data)
        normalized = normalize_mobile(data["phone_number"])
        data["idempotency_key"] = key
        customer = match_customer(request.user, normalized)
        blocked = BlockedCaller.objects.filter(contractor=request.user, normalized_mobile=normalized).exists()
        data["contractor"] = request.user
        data["normalized_mobile"] = normalized
        data["matched_customer"] = customer
        data["review_status"] = (
            CallInboxEvent.ReviewStatus.BLOCKED if blocked else
            CallInboxEvent.ReviewStatus.MATCHED if customer else
            CallInboxEvent.ReviewStatus.PENDING
        )
        try:
            event = CallInboxEvent.objects.create(**data)
        except IntegrityError:
            event = get_object_or_404(CallInboxEvent.objects.select_related("matched_customer"), contractor=request.user, idempotency_key=key)
            return Response(event_data(event), status=200)
        return Response(event_data(event), status=201)


class EventDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not contractor_only(request):
            return Response({"detail": "Contractor access only."}, status=403)
        event = get_object_or_404(CallInboxEvent.objects.select_related("matched_customer", "created_lead"), pk=pk, contractor=request.user)
        history = list(CallInboxEvent.objects.filter(contractor=request.user, normalized_mobile=event.normalized_mobile).select_related("matched_customer").values("id", "occurred_at", "call_status", "review_status")[:50])
        data = event_data(event)
        data["history"] = history
        return Response(data)


class EventActionView(APIView):
    permission_classes = [IsAuthenticated]
    action = None

    def post(self, request, pk):
        if not contractor_only(request):
            return Response({"detail": "Contractor access only."}, status=403)
        with transaction.atomic():
            event = get_object_or_404(CallInboxEvent.objects.select_for_update().select_related("matched_customer"), pk=pk, contractor=request.user)
            if self.action == "dismiss":
                event.review_status = CallInboxEvent.ReviewStatus.DISMISSED
                event.save(update_fields=("review_status",))
            elif self.action == "block":
                BlockedCaller.objects.get_or_create(contractor=request.user, normalized_mobile=event.normalized_mobile)
                CallInboxEvent.objects.filter(contractor=request.user, normalized_mobile=event.normalized_mobile, review_status=CallInboxEvent.ReviewStatus.PENDING).update(review_status=CallInboxEvent.ReviewStatus.BLOCKED)
                event.refresh_from_db()
            elif self.action == "add_customer":
                customer = match_customer(request.user, event.normalized_mobile)
                if customer:
                    event.matched_customer = customer
                    event.review_status = CallInboxEvent.ReviewStatus.MATCHED
                    event.save(update_fields=("matched_customer", "review_status"))
                    return Response({"action": "OPEN", "customer_id": customer.pk, "customer_name": customer.name})
                return Response({"action": "CREATE", "initial_value": {"mobile": event.phone_number, "name": event.caller_name}})
            elif self.action == "link_customer":
                customer = visible_customers(request.user).filter(pk=request.data.get("customer_id")).first()
                if not customer:
                    return Response({"detail": "Customer is not available in this contractor's CRM."}, status=404)
                if customer.normalized_mobile != event.normalized_mobile:
                    return Response({"detail": "The selected customer phone number does not match this call."}, status=400)
                event.matched_customer = customer
                event.review_status = CallInboxEvent.ReviewStatus.CUSTOMER_LINKED
                event.save(update_fields=("matched_customer", "review_status"))
            elif self.action == "create_lead":
                if event.created_lead_id:
                    return Response({"lead_id": event.created_lead_id}, status=200)
                customer = lead_customers(request.user).filter(pk=event.matched_customer_id).first() if event.matched_customer_id else None
                if not customer:
                    customer = lead_customers(request.user).filter(normalized_mobile=event.normalized_mobile).first()
                if not customer:
                    return Response({"detail": "This lead needs a connected customer or a contractor-owned legacy customer."}, status=400)
                title = str(request.data.get("title") or "Incoming call enquiry").strip()[:180]
                lead = Lead.objects.create(contractor=request.user, customer=customer, title=title, description=str(request.data.get("description") or "").strip(), source=Lead.Source.PHONE)
                LeadStageHistory.objects.create(lead=lead, to_stage=Lead.Stage.NEW, note="Created from Call Inbox", changed_by=request.user)
                event.matched_customer = customer
                event.created_lead = lead
                event.review_status = CallInboxEvent.ReviewStatus.LEAD_CREATED
                event.save(update_fields=("matched_customer", "created_lead", "review_status"))
                return Response({"lead_id": lead.pk, "customer_id": customer.pk}, status=201)
            return Response(event_data(event))


class CustomerCallHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        if not contractor_only(request):
            return Response({"detail": "Contractor access only."}, status=403)
        customer = get_object_or_404(visible_customers(request.user), pk=customer_id)
        events = CallInboxEvent.objects.filter(contractor=request.user, matched_customer=customer).select_related("matched_customer")
        return Response({"count": events.count(), "results": [event_data(event) for event in events[:100]]})


def action_view(action):
    return type(f"{action.title()}EventView", (EventActionView,), {"action": action}).as_view()
