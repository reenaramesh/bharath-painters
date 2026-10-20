"""Save contractor edits as private quotation versions without rewriting history."""
import copy
import hashlib
import json
from collections.abc import Mapping
from uuid import UUID

from django.db import models, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .draft_serializers import DraftQuotationSerializer
from .models import ActivityLog, Quotation, QuotationItem, QuotationRoom
from .revision_utils import _base_number, _copy_concrete_fields
from .serializers import QuotationSerializer
from .views import IsVerifiedContractor


def clone_for_edit(source, root, next_version):
    excluded={'quotation_number','status','sent_at','customer_response_note','customer_responded_at','revision_of','version_number','accepted_via_receipt_at','deleted_at'}
    revised=Quotation.objects.create(**_copy_concrete_fields(source,excluded),quotation_number=f'{_base_number(root)}-V{next_version}',revision_of=root,version_number=next_version,status=Quotation.Status.DRAFT,sent_at=None,customer_response_note='',customer_responded_at=None,accepted_via_receipt_at=None)
    room_map={}
    for room in source.rooms.order_by('id'):
        cloned=QuotationRoom.objects.create(**_copy_concrete_fields(room,{'quotation'}),quotation=revised)
        room_map[room.pk]=cloned.pk
    item_map={}
    for item in source.items.order_by('id'):
        cloned=QuotationItem.objects.create(**_copy_concrete_fields(item,{'quotation','room'}),quotation=revised,room_id=room_map.get(item.room_id))
        item_map[item.pk]=cloned.pk
    return revised,room_map,item_map


def remap_edit(payload, room_map, item_map):
    data=copy.deepcopy(dict(payload))
    for field, mapping in (('rooms',room_map),('items',item_map)):
        rows=data.get(field)
        if not isinstance(rows,list) or any(not isinstance(row,dict) for row in rows):
            raise ValidationError({field:'Include the complete list of saved rooms and lines.'})
        for row in rows:
            if row.get('id') is not None:
                value=row['id']
                if isinstance(value,bool) or not isinstance(value,(int,str)) or not str(value).isascii() or len(str(value)) > 20 or not str(value).isdigit() or int(value) not in mapping:
                    raise ValidationError({field:'Saved IDs must belong to the quotation being edited.'})
                row['id']=mapping[int(value)]
            if field=='items' and row.get('room') is not None:
                value=row['room']
                if isinstance(value,bool) or not isinstance(value,(int,str)) or not str(value).isascii() or len(str(value)) > 20 or not str(value).isdigit() or int(value) not in room_map:
                    raise ValidationError({'items':'Saved rooms must belong to the quotation being edited.'})
                row['room']=room_map[int(value)]
    data.pop('edit_request_id',None)
    return data

class QuotationVersionSaveView(APIView):
    permission_classes=[IsAuthenticated,IsVerifiedContractor]

    @transaction.atomic
    def post(self,request,pk):
        if not isinstance(request.data,Mapping):
            raise ValidationError({'detail':'Enter quotation edit data.'})
        token=request.data.get('edit_request_id')
        try:
            if not isinstance(token,str):
                raise ValueError()
            token=str(UUID(token))
        except (ValueError,AttributeError):
            raise ValidationError({'edit_request_id':'A valid edit request ID is required.'})
        source=get_object_or_404(Quotation.objects.select_for_update(),pk=pk,contractor=request.user,deleted_at__isnull=True)
        root=get_object_or_404(Quotation.objects.select_for_update(),pk=source.revision_of_id or source.pk,contractor=request.user)
        fingerprint=hashlib.sha256(json.dumps(dict(request.data),sort_keys=True,default=str,separators=(',',':')).encode()).hexdigest()
        previous=ActivityLog.objects.filter(actor=request.user,module='Quotation versions',object_id=str(source.pk),metadata__edit_request_id=token).first()
        if previous:
            if previous.metadata.get('fingerprint')!=fingerprint:
                return Response({'detail':'This edit request was already used for different changes. Reload before saving again.'},status=409)
            revised=get_object_or_404(Quotation,pk=previous.metadata['new_version_id'],contractor=request.user)
            return Response(QuotationSerializer(revised,context={'request':request}).data)
        field=DraftQuotationSerializer().fields['expected_updated_at']
        expected=field.run_validation(request.data.get('expected_updated_at'))
        if expected!=source.updated_at:
            return Response({'detail':'This quotation changed in another session. Reload its latest data before saving your edits.'},status=409)
        family=Quotation.objects.filter(models.Q(pk=root.pk)|models.Q(revision_of=root))
        next_version=(family.aggregate(value=models.Max('version_number'))['value'] or 1)+1
        revised,rooms,items=clone_for_edit(source,root,next_version)
        serializer=DraftQuotationSerializer(revised,data=remap_edit(request.data,rooms,items),partial=True,context={'request':request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ActivityLog.objects.create(actor=request.user,actor_name=request.user.get_full_name() or request.user.mobile,actor_role=request.user.role,action='CREATE',module='Quotation versions',description=f'Created quotation version {next_version} from version {source.version_number}; previous quotation preserved',method=request.method,path=request.path[:255],object_id=str(source.pk),status_code=201,metadata={'edit_request_id':token,'fingerprint':fingerprint,'new_version_id':revised.pk,'source_version_id':source.pk,'root_id':root.pk})
        return Response(QuotationSerializer(revised,context={'request':request}).data,status=201)
