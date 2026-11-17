from collections import Counter, defaultdict
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Max, Q, Exists, OuterRef
from django.utils import timezone
from jobs.models import ContractorApplicatorTeam
from .filters import event_query, page
from .models import AnalyticsEvent, AnalyticsSession
from .taxonomy import ACTIONS

ORDER = ('occurred_at','sequence','received_at','id')
SAFE_EVENT_FIELDS = ('id','kind','module','screen','role','duration_ms','milestone','occurred_at',
                     'sequence','visit_id','action','workflow_id','previous_screen','reason','error_code','session_id')
EXIT_REASONS = ['module_exit','page_exit','logout','idle_timeout']
DEFINITIONS = {
    'engaged_ms':'Accepted foreground engagement duration; background and idle time are excluded.',
    'session_status':'ended is observed; inferred_timeout means no activity for 30 minutes. Inferred endings are never observed exits.',
    'session_engaged_ms':'Engagement in the selected date, role and module filters; lifecycle timestamps describe the full session.',
    'exit_rate':'Distinct observed exited visits with a matching viewed visit / distinct viewed visits. Legacy events without visit context are excluded; null without eligible visits.',
    'completion_rate':'Distinct session/workflow pairs completed with a start in this selection / distinct started pairs. Outcomes match the same session, workflow and action across the full retained session, including later dates or roles. Orphan completions are excluded; null without starts.',
    'inferred_abandoned':'Started workflows without a terminal event whose session ended or timed out; pending active sessions are excluded.',
    'journey':'Observed screen/action transitions within each session in the selection. At most 200 sessions and 20,000 events; truncation is explicit.',
    'module_detail':'Exact SQL aggregates over all matching events; no sampling. Rates are fractions from 0 to 1.',
    'average_engaged_ms':'Selected module foreground engagement / distinct visitors (average per visitor); null with no visitors.',
    'legacy_order':'Equal timestamps use sequence, then server receipt time. Legacy sequence 0 has no client ordering guarantee.',
}


def session_state(session):
    if session.ended_at:
        return 'ended', session.ended_at, session.end_reason
    if session.last_seen <= timezone.now()-timedelta(minutes=30):
        return 'inferred_timeout', session.last_seen+timedelta(minutes=30), 'inferred_timeout'
    return 'active', None, ''


def observed_roles(events, field, ids):
    result = defaultdict(list)
    for row in events.filter(**{field+'__in':ids}).values(field,'role').distinct():
        result[row[field]].append(row['role'])
    return {key:sorted(value) for key,value in result.items()}


def users_query(events):
    return events.values('session__user_id','session__user__bharath_id','session__user__role').annotate(
        sessions=Count('session_id',distinct=True),engaged_ms=Sum('duration_ms'),last_seen=Max('occurred_at')).order_by('-last_seen','session__user_id')


def user_rows(events, rows):
    roles = observed_roles(events,'session__user_id',[row['session__user_id'] for row in rows])
    return [{'id':row['session__user_id'],'bharath_id':row['session__user__bharath_id'],
             'role':row['session__user__role'],'roles':roles.get(row['session__user_id'],[]),
             'sessions':row['sessions'],'engaged_ms':row['engaged_ms'] or 0,'last_seen':row['last_seen']} for row in rows]


def session_rows(events, sessions):
    ids = [session.pk for session in sessions]
    roles = observed_roles(events,'session_id',ids)
    durations = {row['session_id']:row['total'] or 0 for row in events.filter(session_id__in=ids).values('session_id').annotate(total=Sum('duration_ms'))}
    result=[]
    for session in sessions:
        status,end,reason = session_state(session)
        result.append({'id':session.pk,'user_id':session.user_id,'bharath_id':session.user.bharath_id,'device':session.device,
                       'roles':roles.get(session.pk,[]),'started_at':session.started_at,'last_seen':session.last_seen,
                       'ended_at':end,'end_reason':reason,'status':status,'engaged_ms':durations.get(session.pk,0)})
    return result


def module_detail(events, module):
    views=events.filter(kind='screen_viewed')
    # Selection defines the starting cohort. Outcomes are session facts and may
    # occur outside its date/role filters; the action prevents UUID reuse from
    # completing an unrelated operation. Keep the denominator session/workflow.
    terminals = AnalyticsEvent.objects.filter(session_id=OuterRef('session_id'),
        workflow_id=OuterRef('workflow_id'),action=OuterRef('action'))
    started = events.filter(kind='workflow_started',workflow_id__isnull=False).annotate(
        has_completion=Exists(terminals.filter(kind='workflow_completed')),
        has_abandonment=Exists(terminals.filter(kind='workflow_abandoned')),
    ).values('session_id','workflow_id').annotate(
        completions=Count('id',filter=Q(has_completion=True)),
        abandoned=Count('id',filter=Q(has_abandonment=True)),
        ended=Max('session__ended_at'),last=Max('session__last_seen'))
    workflow = {'started':started.count(),'completed':started.filter(completions__gt=0).count(),
        'abandoned':started.filter(completions=0,abandoned__gt=0).count(),
        'inferred':started.filter(completions=0,abandoned=0).filter(Q(ended__isnull=False)|Q(last__lte=timezone.now()-timedelta(minutes=30))).count()}
    # A rate requires matching visit context, scoped to the same session and screen.
    contextual_views=views.filter(visit_id__isnull=False)
    eligible=contextual_views.values('session_id','visit_id','screen').distinct().count()
    matching_view=contextual_views.filter(session_id=OuterRef('session_id'),visit_id=OuterRef('visit_id'),screen=OuterRef('screen'))
    exits=events.filter(kind='screen_left',reason__in=EXIT_REASONS)
    matched_exits=exits.filter(visit_id__isnull=False).annotate(has_view=Exists(matching_view)).filter(has_view=True).values('session_id','visit_id','screen').distinct().count()
    total=events.aggregate(engaged=Sum('duration_ms'))['engaged'] or 0
    visitors=events.values('session__user_id').distinct().count()
    screens=screen_usage(events)
    features=list(events.filter(kind='feature_action').values('action').annotate(count=Count('id'),users=Count('session__user_id',distinct=True)).order_by('-count','action'))
    scroll=list(events.filter(kind='scroll').values('milestone').annotate(count=Count('id')).order_by('milestone'))
    devices=list(events.values('session__device').annotate(users=Count('session__user_id',distinct=True),sessions=Count('session_id',distinct=True),engaged_ms=Sum('duration_ms')).order_by('session__device'))
    for row in devices:
        row['device']=row.pop('session__device')
    return {'module':module,'visitors':visitors,'opens':events.filter(kind='module_opened').count(),
            'screen_views':views.count(),'total_engaged_ms':total,'average_engaged_ms':total/visitors if visitors else None,
            'exits':exits.count(),'exit_rate':matched_exits/eligible if eligible else None,
            'workflow_started':workflow['started'],'workflow_completed':workflow['completed'],
            'workflow_abandoned':workflow['abandoned'],'inferred_abandoned':workflow['inferred'],
            'completion_rate':workflow['completed']/workflow['started'] if workflow['started'] else None,
            'errors':events.filter(kind='error').count(),'screens':screens,'features':features,'scroll':scroll,'devices':devices}


def screen_usage(events):
    return list(events.values('screen').annotate(views=Count('id',filter=Q(kind='screen_viewed')),
                users=Count('session__user_id',distinct=True),engaged_ms=Sum('duration_ms')).order_by('-views','-engaged_ms','screen'))


def journey(events):
    selected=list(events.values('session_id').annotate(last=Max('occurred_at')).order_by('-last','session_id')[:201])
    ids=[row['session_id'] for row in selected[:200]]
    rows=list(events.filter(session_id__in=ids).order_by('session_id',*ORDER).values(*SAFE_EVENT_FIELDS)[:20001])
    truncated=len(selected)>200 or len(rows)>20000
    rows=rows[:20000]
    links,exits,completed=Counter(),Counter(),Counter()
    previous={}
    for row in rows:
        session=row['session_id']
        node=None
        if row['kind'] in {'screen_viewed','navigation'}:
            node='screen:'+row['screen']
        elif row['kind']=='feature_action':
            node='action:'+row['action']
        if node:
            if session in previous and previous[session]!=node:
                links[(previous[session],node)]+=1
            previous[session]=node
        if row['kind']=='screen_left' and row['reason'] in EXIT_REASONS:
            exits[row['screen']]+=1
        if row['kind']=='workflow_completed':
            completed[row['action']]+=1
    return {'links':[{'source':source,'target':target,'count':count} for (source,target),count in sorted(links.items())],
            'exits':[{'screen':screen,'count':count} for screen,count in sorted(exits.items())],
            'completed':[{'action':action,'count':count} for action,count in sorted(completed.items())],
            'sessions_considered':len({row['session_id'] for row in rows}),'events_considered':len(rows),'truncated':truncated}


def behavior(filters):
    events=event_query(filters)
    users,users_more=page(users_query(events),filters['users_page'],20)
    sessions,sessions_more=page(AnalyticsSession.objects.filter(pk__in=events.values('session_id')).select_related('user').order_by('-last_seen','id'),filters['sessions_page'],20)
    timeline,timeline_more=(page(events.order_by(*ORDER).values(*SAFE_EVENT_FIELDS),filters['page'],100)
                            if filters.get('user') or filters.get('session') else ([],False))
    profile=None
    if filters.get('user'):
        profile=get_user_model().objects.filter(pk=filters['user']).values('id','bharath_id','role').first()
        profile['roles']=sorted(events.values_list('role',flat=True).distinct())
        profile['memberships']=list(ContractorApplicatorTeam.objects.filter(painter_id=filters['user'],employment_type='IN_HOUSE',is_active=True).values('contractor_id','contractor__bharath_id','employment_type','is_active'))
    return {'users':user_rows(events,users),'users_page':filters['users_page'],'users_has_more':users_more,
            'sessions':session_rows(events,sessions),'sessions_page':filters['sessions_page'],'sessions_has_more':sessions_more,
            'timeline':timeline,'timeline_page':filters['page'],'timeline_has_more':timeline_more,
            'screen_usage':screen_usage(events),
            'journey':journey(events),'module_detail':module_detail(events,filters['module']) if filters.get('module') else None,
            'available_actions':ACTIONS,'definitions':DEFINITIONS,'profile':profile}
