import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class AnalyticsSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    started_at = models.DateTimeField(default=timezone.now)
    last_seen = models.DateTimeField(default=timezone.now)
    device = models.CharField(max_length=10)
    engaged_ms = models.PositiveBigIntegerField(default=0)
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=20, blank=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'last_seen'], name='analytics_user_last_seen')]


class AnalyticsEvent(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    session = models.ForeignKey(AnalyticsSession, on_delete=models.CASCADE)
    role = models.CharField(max_length=12)
    module = models.CharField(max_length=64)
    screen = models.CharField(max_length=120)
    kind = models.CharField(max_length=20)
    duration_ms = models.PositiveIntegerField(default=0)
    milestone = models.PositiveSmallIntegerField(default=0)
    occurred_at = models.DateTimeField(db_index=True)
    sequence = models.PositiveIntegerField(default=0)
    visit_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64, blank=True)
    workflow_id = models.UUIDField(null=True, blank=True)
    previous_screen = models.CharField(max_length=120, blank=True)
    reason = models.CharField(max_length=20, blank=True)
    error_code = models.CharField(max_length=20, blank=True)
    received_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=['role', 'occurred_at']), models.Index(fields=['module', 'occurred_at']),
                   models.Index(fields=['session', 'occurred_at', 'sequence'], name='analytics_session_order'),
                   models.Index(fields=['screen', 'occurred_at'], name='analytics_screen_date'),
                   models.Index(fields=['action', 'occurred_at'], name='analytics_action_date'),
                   models.Index(fields=['session','workflow_id','action'], name='analytics_workflow_outcome')]


class AnalyticsReportAccess(models.Model):
    admin = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    report = models.CharField(max_length=12, choices=[(name, name) for name in ['report', 'users', 'behavior', 'export']])
    filters = models.JSONField(default=dict)


class DailyModuleUsage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    date = models.DateField(db_index=True)
    role = models.CharField(max_length=12)
    module = models.CharField(max_length=64)
    visits = models.PositiveIntegerField(default=0)
    screen_views = models.PositiveIntegerField(default=0)
    engaged_ms = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'date', 'role', 'module'], name='analytics_daily_user_module')]
        indexes = [models.Index(fields=['role', 'date', 'module'])]
