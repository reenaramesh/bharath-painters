from datetime import datetime, time, timedelta
import uuid
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import AnalyticsEvent
from .taxonomy import MODULES, ROLES


def parse_filters(params, *, export=False):
    allowed = {'start','end','role','module','user','session','device','page','users_page','sessions_page','q'}
    if export:
        allowed.add('kind')
    repeated = hasattr(params,'getlist') and any(len(params.getlist(k)) != 1 for k in params)
    if set(params) - allowed or repeated:
        raise ValidationError('Unknown or repeated filters.')
    today = timezone.localdate()
    try:
        start = datetime.strptime(params.get('start',str(today-timedelta(days=6))), '%Y-%m-%d').date()
        end = datetime.strptime(params.get('end',str(today)), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValidationError('Dates must use YYYY-MM-DD.')
    if start > end or (end-start).days > 89 or end > today:
        raise ValidationError('Select an ordered date range of at most 90 days, ending no later than today.')
    result = {'start':str(start), 'end':str(end)}
    for key, choices in [('role',ROLES), ('module',MODULES), ('device',['mobile','tablet','desktop'])]:
        value = params.get(key)
        if value:
            if value not in choices:
                raise ValidationError(f'Invalid {key}.')
            result[key] = value
    if params.get('user'):
        value = str(params['user'])
        if not value.isascii() or not value.isdigit() or len(value)>18 or not get_user_model().objects.filter(pk=int(value)).exists():
            raise ValidationError('Invalid user ID.')
        result['user'] = int(value)
    if params.get('session'):
        try:
            result['session'] = str(uuid.UUID(str(params['session'])))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Invalid session ID.')
    for key in ['page','users_page','sessions_page']:
        value = str(params.get(key, '1'))
        if not value.isascii() or not value.isdigit() or len(value)>6 or not 1 <= int(value) <= 100000:
            raise ValidationError('Invalid page.')
        result[key] = int(value)
    query = params.get('q','').strip()
    if len(query)>64 or any(ord(c)<32 for c in query):
        raise ValidationError('Invalid Bharath ID search.')
    if query:
        result['q'] = query
    if export:
        if params.get('kind') not in ['timeline','modules','features','users']:
            raise ValidationError('Invalid export kind.')
        if params['kind']=='timeline' and not (result.get('user') or result.get('session')):
            raise ValidationError('Timeline requires a user or session.')
        result['kind'] = params['kind']
    return result


def event_query(filters):
    start = datetime.strptime(filters['start'],'%Y-%m-%d').date()
    end = datetime.strptime(filters['end'],'%Y-%m-%d').date()
    since = timezone.make_aware(datetime.combine(start,time.min))
    until = timezone.make_aware(datetime.combine(end+timedelta(days=1),time.min))
    events = AnalyticsEvent.objects.filter(occurred_at__gte=since, occurred_at__lt=until)
    fields = {'role':'role','module':'module','user':'session__user_id','session':'session_id','device':'session__device','q':'session__user__bharath_id__icontains'}
    for key, field in fields.items():
        if filters.get(key):
            events = events.filter(**{field:filters[key]})
    return events


def page(query, number, size):
    rows = list(query[(number-1)*size:number*size+1])
    return rows[:size], len(rows)>size
