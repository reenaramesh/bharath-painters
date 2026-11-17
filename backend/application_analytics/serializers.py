from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers
from .taxonomy import ROUTES, ACTION_MAP

WORKFLOWS = {'workflow_started', 'workflow_completed', 'workflow_abandoned'}
ACTION_KINDS = WORKFLOWS | {'feature_action', 'error'}
REASONS = ['login', 'resumed', 'navigation', 'module_exit', 'page_exit', 'logout', 'idle_timeout']


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - set(self.fields):
            raise serializers.ValidationError({'non_field_errors': ['Unknown fields are not accepted.']})
        return super().to_internal_value(data)


class EventSerializer(StrictSerializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=['session_started', 'module_opened', 'screen_viewed', 'engagement', 'scroll',
                                             'login', 'navigation', 'screen_left', 'feature_action', 'workflow_started',
                                             'workflow_completed', 'workflow_abandoned', 'error', 'session_ended'])
    module = serializers.CharField(max_length=64)
    screen = serializers.CharField(max_length=120)
    duration_ms = serializers.IntegerField(min_value=1, max_value=15000, required=False)
    milestone = serializers.ChoiceField(choices=[25, 50, 75, 100], required=False)
    occurred_at = serializers.DateTimeField(required=False)
    sequence = serializers.IntegerField(min_value=1, max_value=2147483647, required=False)
    visit_id = serializers.UUIDField(required=False, allow_null=True)
    action = serializers.ChoiceField(choices=list(ACTION_MAP), required=False)
    workflow_id = serializers.UUIDField(required=False)
    previous_screen = serializers.CharField(max_length=120, required=False)
    reason = serializers.ChoiceField(choices=REASONS, required=False)
    error_code = serializers.ChoiceField(choices=['validation', 'permission', 'not_found', 'conflict', 'rate_limited', 'network', 'server', 'unexpected'], required=False)

    def validate(self, data):
        if ROUTES.get(data['screen']) != data['module']:
            raise serializers.ValidationError('Unknown module/screen pair.')
        if ('duration_ms' in data) != (data['kind'] == 'engagement'):
            raise serializers.ValidationError('Duration is required only for engagement.')
        if ('milestone' in data) != (data['kind'] == 'scroll'):
            raise serializers.ValidationError('Milestone is required only for scroll.')
        kind = data['kind']
        for field, required in [('action', kind in ACTION_KINDS), ('workflow_id', kind in WORKFLOWS),
                                ('previous_screen', kind == 'navigation'), ('error_code', kind == 'error')]:
            if (field in data) != required:
                raise serializers.ValidationError(f'{field} is required only for the applicable event kind.')
        if kind == 'navigation' and data['previous_screen'] not in ROUTES:
            raise serializers.ValidationError('Unknown previous screen.')
        if kind in ACTION_KINDS and data['module'] not in ACTION_MAP[data['action']]['modules']:
            raise serializers.ValidationError('Action is not available in this module.')
        reason_sets = {'login': {'login','resumed'}, 'session_started': {'login','resumed'}, 'module_opened': {'login','resumed','navigation'},
                       'workflow_abandoned': {'navigation','module_exit','page_exit','logout','idle_timeout'},
                       'screen_left': {'navigation','module_exit','page_exit','logout','idle_timeout'},
                       'session_ended': {'logout','idle_timeout'}}
        if ('reason' in data and data['reason'] not in reason_sets.get(kind, set())) or (kind in {'screen_left','session_ended'} and 'reason' not in data):
            raise serializers.ValidationError('Invalid reason for event kind.')
        now = timezone.now()
        when = data.setdefault('occurred_at', now)
        if not now - timedelta(hours=24) <= when <= now + timedelta(minutes=1):
            raise serializers.ValidationError('Event time outside permitted window.')
        return data


class BatchSerializer(StrictSerializer):
    session_id = serializers.UUIDField()
    device = serializers.ChoiceField(choices=['mobile', 'tablet', 'desktop'])
    events = EventSerializer(many=True, min_length=1, max_length=50)
