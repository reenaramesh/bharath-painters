"""Prepare agreed subcontract prices without copying selling terms into public data."""
from decimal import Decimal
import json
from django.db import transaction
from rest_framework import serializers
from quotations.pricing import calculate_pricing
from quotations.models import Quotation
from .models import SubcontractQuote, SubcontractQuoteLine, SubcontractWorkOrderScope

CENT = Decimal("0.01")
APPROVED = {"ACCEPTED","SCHEDULED","IN_PROGRESS","COMPLETED","CONVERTED"}


class PriceLineInput(serializers.Serializer):
    source_item = serializers.IntegerField(min_value=1)
    unit_rate = serializers.DecimalField(max_digits=12,decimal_places=2,min_value=0,required=False,allow_null=True)
    discount_type = serializers.ChoiceField(choices=["FIXED","PERCENTAGE"],default="FIXED")
    discount_value = serializers.DecimalField(max_digits=12,decimal_places=2,min_value=0,default=0)

    def validate(self, data):
        if data["discount_type"] == "PERCENTAGE" and data["discount_value"] > 100:
            raise serializers.ValidationError({"discount_value":"Percentage cannot exceed 100."})
        return data


class PricingInput(serializers.Serializer):
    lines = PriceLineInput(many=True,allow_empty=False)
    discount_mode = serializers.ChoiceField(choices=["LINE","OVERALL"],default="OVERALL")
    discount_type = serializers.ChoiceField(choices=["FIXED","PERCENTAGE"],default="FIXED")
    discount_value = serializers.DecimalField(max_digits=12,decimal_places=2,min_value=0,default=0)
    gst_mode = serializers.ChoiceField(choices=["NO_GST","GST_EXTRA","GST_INCLUDED"],default="NO_GST")
    gst_percentage = serializers.DecimalField(max_digits=5,decimal_places=2,min_value=0,default=0)
    labour_method = serializers.ChoiceField(choices=["DIRECT","SELLING_PERCENT"],default="DIRECT")
    adjustment_percent = serializers.DecimalField(max_digits=5,decimal_places=2,min_value=0,max_value=100,required=False,allow_null=True)

    def validate(self, data):
        if data["discount_type"] == "PERCENTAGE" and data["discount_value"] > 100:
            raise serializers.ValidationError({"discount_value":"Percentage cannot exceed 100."})
        return data


def prepare_pricing(quotation, mode, payload, items, *, existing=None):
    if mode not in {"WITH_MATERIAL","WITHOUT_MATERIAL"}:
        raise serializers.ValidationError({"material_mode":"Choose With Material or Without Material."})
    if not existing and (quotation.status not in APPROVED or quotation.deleted_at):
        raise serializers.ValidationError({"quotation":"Select an approved saved customer quotation revision."})
    serializer=PricingInput(data=payload)
    serializer.is_valid(raise_exception=True)
    config=serializer.validated_data
    ids=[line["source_item"] for line in config["lines"]]
    by_id={item.pk:item for item in items}
    if len(ids)!=len(set(ids)) or set(ids)!=set(by_id):
        raise serializers.ValidationError({"lines":"Select unique lines from the pinned quotation revision."})
    if mode == "WITHOUT_MATERIAL" and config["labour_method"] == "SELLING_PERCENT" and config.get("adjustment_percent") is None:
        raise serializers.ValidationError({"adjustment_percent":"Enter an explicit labour percentage."})
    prepared=[]
    original=[]
    for line in config["lines"]:
        item=by_id[line["source_item"]]
        if item.quantity <= 0:
            raise serializers.ValidationError({"quantity":f"Source line {item.pk} must have a positive saved quantity."})
        rate=line.get("unit_rate")
        if mode == "WITHOUT_MATERIAL" and config["labour_method"] == "SELLING_PERCENT":
            rate=(item.rate*config["adjustment_percent"]/100).quantize(CENT)
        elif mode == "WITHOUT_MATERIAL" and rate is None:
            raise serializers.ValidationError({"unit_rate":f"Enter a labour-only rate for line {item.pk}."})
        elif rate is None:
            rate=item.rate
        if rate < 0:
            raise serializers.ValidationError({"unit_rate":"Rates cannot be negative."})
        amount=(item.quantity*rate).quantize(CENT)
        prepared.append({"item":item,"quantity":item.quantity,"unit_rate":rate,"amount":amount,
                         "discount_type":line["discount_type"],"discount_value":line["discount_value"]})
        original.append({"source_item":item.pk,"original_rate":str(item.rate),"original_amount":str(item.amount),
                         "customer_discount_type":item.discount_type,"customer_discount_value":str(item.discount_value)})
    settings={key:config[key] for key in ["discount_mode","discount_type","discount_value","gst_mode","gst_percentage"]}
    totals=calculate_pricing(prepared,settings)
    if any(amount > Decimal("999999999999.99") for amount in totals.values()):
        raise serializers.ValidationError({"lines":"Work Order value exceeds the supported amount."})
    private={"source_reference":quotation.quotation_number,"source_revision":quotation.version_number,"lines":original,
             "customer_discount_mode":quotation.discount_mode,"customer_discount_type":quotation.discount_type,
             "customer_discount_value":str(quotation.discount_value),"labour_method":config["labour_method"],
             "adjustment_percent":str(config.get("adjustment_percent")) if config.get("adjustment_percent") is not None else None}
    if existing and existing.private_pricing.get("creation_key"):
        private["creation_key"]=existing.private_pricing["creation_key"]
    return {"mode":mode,"settings":settings,"lines":prepared,"private":private,"totals":totals}


def public_specification(item):
    # Never copy arbitrary specification JSON or customer commercial terms.
    details=item.specification_details or {}
    surfaces=[]
    for room in details.get("contributions",[]):
        for surface in room.get("sources",[]):
            if Decimal(str(surface.get("quantity") or 0)) > 0:
                surfaces.append(f"{room.get('room_name','')} - {surface.get('name','')}: {surface.get('quantity')}")
    return {"description":item.description,"service":item.service_name_snapshot or (item.service_type.name if item.service_type else ""),
            "product":item.product_type_name_snapshot or (item.paint_type.name if item.paint_type else ""),
            "brand":item.brand_name_snapshot or (item.paint_brand.name if item.paint_brand else ""),
            "features":item.product_type_features_snapshot,"calculation_method":item.calculation_method,
            "scope_name":details.get("name",""),"surfaces":surfaces,
            "colour":f"{item.color.name} {item.color.code}".strip() if item.color else "",
            "surface":(item.specification_details or {}).get("surface"),
            "measurement_version":(item.specification_details or {}).get("measurement_version"),
            "coats":item.coats,"primer_coats":(item.specification_details or {}).get("primer_coats",0),
            "rooms":list(item.included_areas or [])}


@transaction.atomic
def save_pricing(work_order, prepared, actor):
    scopes={scope.source_quotation_item_id:scope for scope in work_order.scopes.all() if scope.source_quotation_item_id}
    previous=work_order.quotes.filter(is_current=True,created_by=work_order.main_contractor).first()
    if previous and previous.status == "DRAFT":
        quote=previous
    else:
        if previous:
            previous.is_current=False;previous.save(update_fields=["is_current"])
        quote=SubcontractQuote.objects.create(work_order=work_order,created_by=work_order.main_contractor,supersedes=previous)
    existing_lines={line.source_scope_id:line for line in quote.quote_lines.all()}
    retained_scopes=set();retained_lines=set()
    for index,line in enumerate(prepared["lines"]):
        item=line["item"]
        scope=scopes.get(item.pk) or SubcontractWorkOrderScope(work_order=work_order,source_quotation_item=item)
        scope.title_snapshot=item.description[:200]
        scope.work_description_snapshot=(item.service_name_snapshot or "")[:200]
        scope.category=item.service_category
        scope.category_name_snapshot=item.service_category_name_snapshot or (item.service_category.name if item.service_category else "")
        scope.unit_name_snapshot=item.unit_name_snapshot or item.custom_unit or (item.unit.name if item.unit else "")
        scope.quantity=item.quantity;scope.unit_rate=line["unit_rate"];scope.sort_order=(index+1)*10
        scope.specification_snapshot=public_specification(item)
        scope.save();retained_scopes.add(scope.pk)
        priced=existing_lines.get(scope.pk) or SubcontractQuoteLine(quote=quote,source_scope=scope)
        priced.description_snapshot=item.description[:200]
        priced.unit_name_snapshot=scope.unit_name_snapshot
        priced.category=scope.category
        priced.quantity=line["quantity"];priced.unit_rate=line["unit_rate"]
        priced.discount_type=line["discount_type"];priced.discount_value=line["discount_value"]
        priced.specification=json.dumps(scope.specification_snapshot)
        priced.sort_order=scope.sort_order
        priced.save();retained_lines.add(priced.pk)
    quote.quote_lines.exclude(pk__in=retained_lines).delete()
    work_order.scopes.exclude(pk__in=retained_scopes).delete()
    quote.pricing={key:str(value) for key,value in prepared["settings"].items()}
    quote.recalculate()
    work_order.material_mode=prepared["mode"]
    work_order.private_pricing=prepared["private"]
    work_order.agreed_amount=quote.total
    work_order.save(update_fields=["material_mode","private_pricing","agreed_amount","updated_at"])
    return quote
