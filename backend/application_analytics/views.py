import json
import logging
import csv
import io
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpResponse
from rest_framework.exceptions import ParseError
from rest_framework.parsers import BaseParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from .ingestion import ingest
from .reporting import report
from .serializers import BatchSerializer
from .filters import parse_filters, event_query
from .models import AnalyticsReportAccess
from .behavior import behavior, ORDER, SAFE_EVENT_FIELDS, users_query, user_rows
from django.db.models import Count, Sum

logger = logging.getLogger(__name__)


class AdminOnly(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'ADMIN'


class BatchParser(BaseParser):
    media_type = 'application/json'

    def parse(self, stream, media_type=None, parser_context=None):
        body = stream.read(65537)
        if len(body) > 65536:
            raise ParseError('Analytics payload exceeds 64 KiB.')
        try:
            return json.loads(body)
        except (ValueError, UnicodeDecodeError, RecursionError):
            raise ParseError('Invalid JSON.')


class IngestionThrottle(UserRateThrottle):
    rate = '12/minute'
    scope = 'analytics_ingest'


class ReportThrottle(UserRateThrottle):
    rate = '60/minute'
    scope = 'analytics_report'


class EventsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [BatchParser]
    throttle_classes = [IngestionThrottle]

    def post(self, request):
        serializer = BatchSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning('analytics_batch_rejected validation')
            return Response(serializer.errors, status=400)
        return Response({'accepted': ingest(request.user, serializer.validated_data)}, status=201)


class ReportView(APIView):
    permission_classes = [IsAuthenticated, AdminOnly]
    throttle_classes = [ReportThrottle]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'private, no-store'
        return response

    def get(self, request):
        filters = parse_filters(request.query_params)
        data = report(request.query_params, filters)
        audit(request.user,'report',filters)
        return Response(data)


class UsersView(ReportView):
    def get(self, request):
        filters = parse_filters(request.query_params)
        query = filters.get('q','')
        audit(request.user,'users',filters)
        if len(query) < 2:
            return Response([])
        rows = get_user_model().objects.filter(Q(bharath_id__icontains=query)).order_by('bharath_id').values('id', 'bharath_id', 'role')[:20]
        return Response(list(rows))


def audit(user, name, filters):
    AnalyticsReportAccess.objects.create(admin=user,report=name,filters=filters)


class BehaviorView(ReportView):
    def get(self, request):
        filters = parse_filters(request.query_params)
        data = behavior(filters)
        audit(request.user,'behavior',filters)
        return Response(data)


def csv_cell(value):
    value = '' if value is None else str(value)
    if value.lstrip().startswith(('=','+','-','@')) or value.startswith(('\t','\r','\n')):
        return "'"+value
    return value


class ExportView(ReportView):
    def get(self, request):
        filters = parse_filters(request.query_params,export=True)
        events = event_query(filters)
        kind = filters['kind']
        if kind == 'timeline':
            fields = list(SAFE_EVENT_FIELDS)
            rows = list(events.order_by(*ORDER).values(*fields)[:5001])
        elif kind == 'users':
            fields = ['id','bharath_id','role','roles','sessions','engaged_ms','last_seen']
            rows = user_rows(events,list(users_query(events)[:5001]))
        elif kind == 'features':
            fields = ['action','count','users']
            rows = list(events.filter(kind='feature_action').values('action').annotate(count=Count('id'),users=Count('session__user_id',distinct=True)).order_by('action')[:5001])
        else:
            fields = ['module','visits','screen_views','engaged_ms','users']
            rows = report(request.query_params,filters)['modules'][:5001]
        truncated = len(rows)>5000
        output=io.StringIO(newline='')
        writer=csv.writer(output)
        writer.writerow(fields)
        for row in rows[:5000]:
            writer.writerow([csv_cell(row.get(field)) for field in fields])
        response=HttpResponse(output.getvalue(),content_type='text/csv; charset=utf-8')
        response['Content-Disposition']=f'attachment; filename="analytics-{kind}.csv"'
        response['X-Analytics-Truncated']=str(truncated).lower()
        response['X-Analytics-Row-Limit']='5000'
        response['Cache-Control']='private, no-store'
        audit(request.user,'export',filters)
        return response
