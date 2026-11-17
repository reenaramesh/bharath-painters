import logging
from collections import defaultdict
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from jobs.models import ContractorApplicatorTeam
from .models import AnalyticsEvent, AnalyticsSession, DailyModuleUsage
from .taxonomy import ACTION_MAP

logger = logging.getLogger(__name__)


def activity_role(user):
    if user.role == 'PAINTER' and ContractorApplicatorTeam.objects.filter(painter=user, employment_type='IN_HOUSE', is_active=True).exists():
        return 'EMPLOYEE'
    return user.role


@transaction.atomic
def ingest(user, batch):
    started = min(timezone.now(), min(item['occurred_at'] for item in batch['events']))
    session, new_session = AnalyticsSession.objects.get_or_create(id=batch['session_id'], defaults={'user': user, 'device': batch['device'], 'started_at': started, 'last_seen': started})
    session = AnalyticsSession.objects.select_for_update().get(pk=session.pk)
    if session.user_id != user.pk or session.device != batch['device']:
        raise ValidationError('Session does not belong to this account/device.')
    role = activity_role(user)
    if role not in ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'EMPLOYEE']:
        raise ValidationError('This role is excluded from activity collection.')
    accepted = 0
    deltas = defaultdict(lambda: {'visits': 0, 'screen_views': 0, 'engaged_ms': 0})
    for item in batch['events']:
        if item.get('action') and role not in ACTION_MAP[item['action']]['roles']:
            raise ValidationError('Action is not available for this role.')
        event, created = AnalyticsEvent.objects.get_or_create(id=item['id'], defaults={**item, 'session': session, 'role': role})
        if event.session_id != session.pk:
            raise ValidationError('Event identity already in use.')
        if not created:
            continue
        accepted += 1
        session.started_at = min(session.started_at, item['occurred_at'])
        session.last_seen = max(session.last_seen, item['occurred_at']) if not new_session or accepted > 1 else item['occurred_at']
        if item['kind'] == 'session_ended' and (not session.ended_at or item['occurred_at'] >= session.ended_at):
            session.ended_at, session.end_reason = item['occurred_at'], item['reason']
        duration = item.get('duration_ms', 0)
        session.engaged_ms += duration
        if session.engaged_ms > (timezone.now() - session.started_at).total_seconds() * 1000 + 15000:
            raise ValidationError('Engagement exceeds session elapsed time.')
        day = timezone.localdate(item['occurred_at'])
        delta = deltas[(day, item['module'])]
        delta['visits'] += int(item['kind'] == 'module_opened')
        delta['screen_views'] += int(item['kind'] == 'screen_viewed')
        delta['engaged_ms'] += duration
    for (day, module), delta in deltas.items():
        aggregate, _ = DailyModuleUsage.objects.get_or_create(user=user, date=day, role=role, module=module)
        DailyModuleUsage.objects.filter(pk=aggregate.pk).update(
            visits=F('visits') + delta['visits'],
            screen_views=F('screen_views') + delta['screen_views'],
            engaged_ms=F('engaged_ms') + delta['engaged_ms'],
        )
    if accepted:
        session.save(update_fields=['last_seen', 'started_at', 'engaged_ms', 'ended_at', 'end_reason'])
    logger.info('analytics_batch_accepted count=%d', accepted)
    return accepted
