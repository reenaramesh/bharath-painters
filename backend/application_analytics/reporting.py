from datetime import datetime, time, timedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import AnalyticsEvent, DailyModuleUsage
from .taxonomy import MODULES, ROLES
from .filters import parse_filters, event_query


def report(params, filters=None):
    filters = filters or parse_filters(params)
    today = timezone.localdate()
    try:
        start = datetime.strptime(params.get('start', str(today - timedelta(days=6))), '%Y-%m-%d').date()
        end = datetime.strptime(params.get('end', str(today)), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        raise ValidationError('Dates must use YYYY-MM-DD.')
    if start > end or (end - start).days > 89 or end > today:
        raise ValidationError('Select an ordered date range of at most 90 days, ending no later than today.')
    role, module, user = (params.get(key) for key in ['role', 'module', 'user'])
    if role and role not in ROLES or module and module not in MODULES:
        raise ValidationError('Unknown role or module.')
    profile = None
    if user:
        if not user.isdigit():
            raise ValidationError('Invalid user ID.')
        profile = get_user_model().objects.filter(pk=user).values('id', 'bharath_id', 'role').first()
        if not profile:
            raise ValidationError('User not found.')
    since = timezone.make_aware(datetime.combine(start, time.min))
    until = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min))
    events = AnalyticsEvent.objects.filter(occurred_at__gte=since, occurred_at__lt=until)
    usage = DailyModuleUsage.objects.filter(date__gte=start, date__lte=end)
    for key, value in [('role', role), ('module', module)]:
        if value:
            events, usage = events.filter(**{key: value}), usage.filter(**{key: value})
    if user:
        events, usage = events.filter(session__user_id=user), usage.filter(user_id=user)
    events = event_query(filters)
    totals = usage.aggregate(engaged_ms=Sum('engaged_ms'), module_views=Sum('visits'), screen_views=Sum('screen_views'))
    totals = {key: value or 0 for key, value in totals.items()}
    totals.update(active_users=events.values('session__user_id').distinct().count(), sessions=events.values('session_id').distinct().count())
    ranking = list(usage.values('module').annotate(visits=Sum('visits'), screen_views=Sum('screen_views'), engaged_ms=Sum('engaged_ms'), users=Count('user_id', distinct=True)))
    used = {row['module'] for row in ranking}
    ranking.extend({'module': name, 'visits': 0, 'screen_views': 0, 'engaged_ms': 0, 'users': 0} for name in MODULES if name not in used and (not module or module == name))
    ranking.sort(key=lambda row: (-row['visits'], -row['engaged_ms'], row['module']))
    roles = list(usage.values('role').annotate(users=Count('user_id', distinct=True), visits=Sum('visits'), engaged_ms=Sum('engaged_ms')))
    trend = list(usage.values('date').annotate(visits=Sum('visits'), engaged_ms=Sum('engaged_ms')) .order_by('date'))
    if any(filters.get(key) for key in ['session','device','q']):
        totals = events.aggregate(engaged_ms=Sum('duration_ms'),module_views=Count('id',filter=Q(kind='module_opened')),
                                  screen_views=Count('id',filter=Q(kind='screen_viewed')),
                                  active_users=Count('session__user_id',distinct=True),sessions=Count('session_id',distinct=True))
        totals = {key:value or 0 for key,value in totals.items()}
        ranking = list(events.values('module').annotate(visits=Count('id',filter=Q(kind='module_opened')),
            screen_views=Count('id',filter=Q(kind='screen_viewed')),engaged_ms=Sum('duration_ms'),users=Count('session__user_id',distinct=True)))
        used={row['module'] for row in ranking}
        ranking.extend({'module':name,'visits':0,'screen_views':0,'engaged_ms':0,'users':0} for name in MODULES if name not in used and (not module or module==name))
        ranking.sort(key=lambda row:(-row['visits'],-row['engaged_ms'],row['module']))
        roles=list(events.values('role').annotate(users=Count('session__user_id',distinct=True),visits=Count('id',filter=Q(kind='module_opened')),engaged_ms=Sum('duration_ms')))
        trend=list(events.annotate(date=TruncDate('occurred_at')).values('date').annotate(visits=Count('id',filter=Q(kind='module_opened')),engaged_ms=Sum('duration_ms')).order_by('date'))
    scroll = list(events.filter(kind='scroll').values('screen', 'milestone').annotate(events=Count('id'), users=Count('session__user_id', distinct=True)).order_by('screen', 'milestone')[:400])
    timeline = list(events.order_by('-occurred_at', '-id').values('id', 'kind', 'module', 'screen', 'role', 'duration_ms', 'milestone', 'occurred_at')[:100]) if user else []
    return {'overview': totals, 'modules': ranking, 'roles': roles, 'trend': trend, 'scroll': scroll, 'timeline': timeline, 'profile': profile, 'filters': {'start': start, 'end': end}, 'available_modules': MODULES}
