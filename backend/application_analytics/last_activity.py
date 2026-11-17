"""Bulk account activity summaries; callers must enforce directory access."""
from django.db.models import Max

from .models import AnalyticsSession


def last_activity_by_user(users):
    # Never match by contact mobile/name: a saved contact may have no account.
    users = {user.pk: user for user in users if user is not None}
    result = {
        pk: max((value for value in (user.last_login, user.last_activity_at) if value is not None), default=None)
        for pk, user in users.items()
    }
    if not users:
        return result
    from quotations.models import ActivityLog

    sources = (
        AnalyticsSession.objects.filter(user_id__in=users).order_by().values('user_id').annotate(latest=Max('last_seen')),
        ActivityLog.objects.filter(actor_id__in=users, action='LOGIN', status_code__gte=200, status_code__lt=300)
        .order_by().values('actor_id').annotate(latest=Max('created_at')),
    )
    for source, key in zip(sources, ('user_id', 'actor_id')):
        for row in source:
            pk, latest = row[key], row['latest']
            if latest is not None and (result[pk] is None or latest > result[pk]):
                result[pk] = latest
    return result
