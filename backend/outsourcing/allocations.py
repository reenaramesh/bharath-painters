"""Permission-scoped discovery and atomic independent vendor Draft allocations."""
import hashlib
import json
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import BharathUser
from quotations.models import Customer, Property, Quotation, ContractorConnection
from .models import SubcontractWorkOrder, SubcontractWorkOrderScope
from .pricing import APPROVED, save_pricing
from .margins import prepare_margins, source_snapshot
from .serializers import SubcontractWorkOrderSerializer


def connected_customers(user):
    return Customer.objects.filter(contractor_connections__contractor=user,contractor_connections__status="CONNECTED").exclude(status="CANCELLED").distinct()


def accessible_properties(user):
    from quotations.views import contractor_property_scope
    return Property.objects.filter(contractor_property_scope(user),contractor_hidden_at__isnull=True).distinct()


def allocated_ids(quotation):
    return set(SubcontractWorkOrderScope.objects.filter(work_order__quotation=quotation,source_quotation_item__isnull=False)
        .exclude(work_order__status__in=["DECLINED","WITHDRAWN","CANCELLED"])
        .values_list("source_quotation_item_id",flat=True))


def contractor_only(user):
    if user.role not in (BharathUser.Roles.CONTRACTOR,BharathUser.Roles.ADMIN):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Contractor access only.")


class OfferCatalogView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request):
        contractor_only(request.user)
        customers=connected_customers(request.user)
        search=request.query_params.get("search", "").strip()
        if search:customers=customers.filter(Q(name__icontains=search)|Q(mobile__icontains=search))
        properties=accessible_properties(request.user).filter(customer__in=customers)
        quotations=Quotation.objects.filter(contractor=request.user,customer__in=customers,property__in=properties,status__in=APPROVED,deleted_at__isnull=True).order_by("-quotation_date","-id")
        return Response({"customers":list(customers.order_by("name","id").values("id","name","mobile")),
            "properties":list(properties.order_by("name","id").values("id","customer","name","city")),
            "quotations":[{"id":row.pk,"customer":row.customer_id,"property":row.property_id,"quotation_number":row.quotation_number,"status":row.status,"status_display":row.get_status_display(),"date":row.quotation_date,"amount":str(row.grand_total),"revision":row.version_number,"allocated_item_ids":sorted(allocated_ids(row))} for row in quotations]})


class AssignmentInput(serializers.Serializer):
    receiving_contractor=serializers.IntegerField(min_value=1)
    quotation_item_ids=serializers.ListField(child=serializers.IntegerField(min_value=1),allow_empty=False)
    project_title=serializers.CharField(max_length=200)
    agreed_scope_summary=serializers.CharField(required=False,allow_blank=True)
    instructions=serializers.CharField(required=False,allow_blank=True)
    terms=serializers.CharField(required=False,allow_blank=True)
    required_start_date=serializers.DateField(required=False,allow_null=True)
    required_end_date=serializers.DateField(required=False,allow_null=True)
    pricing_input=serializers.DictField()


class BatchInput(serializers.Serializer):
    customer=serializers.IntegerField(min_value=1)
    property=serializers.IntegerField(min_value=1)
    quotation=serializers.IntegerField(min_value=1)
    creation_key=serializers.UUIDField()
    assignments=AssignmentInput(many=True,allow_empty=False)


class AllocationDraftView(APIView):
    permission_classes=[IsAuthenticated]

    @transaction.atomic
    def post(self,request):
        contractor_only(request.user)
        incoming=BatchInput(data=request.data);incoming.is_valid(raise_exception=True);data=incoming.validated_data
        customer=get_object_or_404(connected_customers(request.user),pk=data["customer"])
        prop=get_object_or_404(accessible_properties(request.user),pk=data["property"],customer=customer)
        quotation=get_object_or_404(Quotation.objects.select_for_update(),pk=data["quotation"],contractor=request.user,customer=customer,property=prop,status__in=APPROVED,deleted_at__isnull=True)
        token=str(data["creation_key"])
        fingerprint=hashlib.sha256(json.dumps(request.data,sort_keys=True,default=str).encode()).hexdigest()
        prior=list(SubcontractWorkOrder.objects.filter(quotation=quotation,main_contractor=request.user,private_pricing__allocation_batch=token).order_by("id"))
        if prior:
            if any(row.private_pricing.get("allocation_request")!=fingerprint for row in prior):raise serializers.ValidationError({"creation_key":"This batch token belongs to different allocations."})
            return Response({"work_orders":SubcontractWorkOrderSerializer(prior,many=True,context={"viewer":request.user}).data},status=200)
        all_items=list(quotation.items.select_related("unit","service_category","service_type","paint_type","paint_brand","color").order_by("id"))
        source=source_snapshot(quotation,all_items);by_id={item.pk:item for item in all_items}
        used=set();vendors=set();reserved=allocated_ids(quotation);prepared=[]
        for assignment in data["assignments"]:
            ids=assignment["quotation_item_ids"];vendor_id=assignment["receiving_contractor"]
            if vendor_id in vendors:raise serializers.ValidationError({"assignments":"Use one allocation per vendor."})
            vendors.add(vendor_id)
            if len(ids)!=len(set(ids)) or used.intersection(ids) or reserved.intersection(ids):raise serializers.ValidationError({"assignments":"Work is already allocated. Select each available item once."})
            if set(ids)-set(by_id):raise serializers.ValidationError({"assignments":"Some work does not belong to this quotation."})
            used.update(ids)
            if not BharathUser.objects.filter(pk=vendor_id,role=BharathUser.Roles.CONTRACTOR).exists():
                raise serializers.ValidationError({"receiving_contractor":"Select a connected contractor vendor."})
            connection=ContractorConnection.objects.filter(Q(requester=request.user,recipient_id=vendor_id)|Q(recipient=request.user,requester_id=vendor_id),status="CONNECTED").first()
            if not connection or vendor_id==request.user.pk:raise serializers.ValidationError({"receiving_contractor":"Select a connected vendor."})
            metadata=SubcontractWorkOrderSerializer(data={"quotation":quotation.pk,**{key:value for key,value in assignment.items() if key not in ("pricing_input","quotation_item_ids")}},context={"viewer":request.user})
            metadata.is_valid(raise_exception=True)
            if "margin_mode" not in assignment["pricing_input"]:raise serializers.ValidationError({"pricing_input":"Use margin pricing for allocations."})
            pricing=prepare_margins(quotation,"WITH_MATERIAL",assignment["pricing_input"],[item for item in all_items if item.pk in ids],allocation_source=source)
            pricing["private"].update(allocation_batch=token,allocation_request=fingerprint)
            prepared.append((metadata.validated_data,connection,pricing))
        orders=[]
        for metadata,connection,pricing in prepared:
            order=SubcontractWorkOrder.objects.create(**metadata,main_contractor=request.user,connection=connection,created_by=request.user)
            save_pricing(order,pricing,request.user);orders.append(order)
        return Response({"work_orders":SubcontractWorkOrderSerializer(orders,many=True,context={"viewer":request.user}).data},status=201)
