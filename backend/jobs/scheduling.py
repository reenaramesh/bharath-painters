"""Additive contractor authorization with safe reads during schema rollout."""
from django.db import connection
from django.utils import timezone

from quotations.models import ActivityLog
from .models import WorkScheduleAuthorization


def authorization_available():
    # Do not cache globally: local migration/application workers may coexist.
    return WorkScheduleAuthorization._meta.db_table in connection.introspection.table_names()


def schedule_authorization(item, available=None):
    if available is None:
        available = authorization_available()
    if not available:
        return None
    try:
        return item.date_authorization
    except WorkScheduleAuthorization.DoesNotExist:
        return None


def authorization_data(item, available=None):
    record = schedule_authorization(item, available)
    return {
        'scheduling_mode': record.mode if record else 'PORTAL',
        'contractor_scheduled_by': record.authorized_by_id if record and record.mode == 'CONTRACTOR' else None,
        'contractor_scheduled_at': record.authorized_at if record and record.mode == 'CONTRACTOR' else None,
    }


def save_authorization(item, mode, actor, changed, request):
    if not authorization_available():
        return
    existing = schedule_authorization(item, True)
    previous_mode = existing.mode if existing else 'PORTAL'
    if mode == 'PORTAL' and not existing:
        return
    record, _ = WorkScheduleAuthorization.objects.update_or_create(schedule=item, defaults={
        'mode': mode, 'authorized_by': actor if mode == 'CONTRACTOR' else None,
        'authorized_at': timezone.now() if mode == 'CONTRACTOR' else None,
    })
    item.date_authorization = record
    if changed or previous_mode != mode:
        ActivityLog.objects.create(actor=actor, actor_name=actor.get_full_name() or actor.mobile,
            actor_role=actor.role, action='STATUS_CHANGE', module='Work schedules',
            description='Work dates authorized by contractor without customer portal approval' if mode == 'CONTRACTOR' else 'Work dates submitted for customer portal approval',
            method=request.method, path=request.path[:255], object_id=str(item.pk), status_code=201,
            metadata={'scheduling_mode': mode, 'quotation_id': item.quotation_id,
                'start_date': str(item.proposed_start_date), 'end_date': str(item.proposed_end_date)})
