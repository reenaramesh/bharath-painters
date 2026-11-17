from datetime import datetime, time, timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from application_analytics.models import AnalyticsEvent, AnalyticsSession, DailyModuleUsage, AnalyticsReportAccess


class Command(BaseCommand):
    help = 'Remove expired analytics events, aggregates and inactive sessions.'

    @transaction.atomic
    def handle(self, *args, **options):
        day = timezone.localdate() - timedelta(days=settings.APPLICATION_ANALYTICS_RETENTION_DAYS - 1)
        cutoff = timezone.make_aware(datetime.combine(day, time.min))
        events, _ = AnalyticsEvent.objects.filter(occurred_at__lt=cutoff).delete()
        aggregates, _ = DailyModuleUsage.objects.filter(date__lt=day).delete()
        sessions, _ = AnalyticsSession.objects.filter(last_seen__lt=cutoff).delete()
        audits, _ = AnalyticsReportAccess.objects.filter(timestamp__lt=cutoff).delete()
        self.stdout.write(f'Deleted {events} events, {aggregates} aggregates, {sessions} sessions, {audits} audits.')
