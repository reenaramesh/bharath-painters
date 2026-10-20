"""Employee-specific hourly OT rates, with compatibility for stored day rates."""
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from collections.abc import Mapping

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ApplicatorOvertimeRateRevision, ContractorApplicatorTeam

DAY_HOURS = Decimal('8')
RATE_PRECISION = Decimal('0.000001')
MONEY_PRECISION = Decimal('0.01')


def legacy_hourly_rate(member, day, explicit='current'):
    from .attendance import salary_daily_rate_for_date
    hourly = member.hourly_rate if explicit == 'current' else explicit
    return hourly if hourly and hourly > 0 else salary_daily_rate_for_date(member, day) / DAY_HOURS


def overtime_rate_for_date(member, day):
    revisions = getattr(member, '_overtime_rate_revisions_cache', None)
    if revisions is None:
        revisions = list(member.overtime_rate_revisions.all())
        member._overtime_rate_revisions_cache = revisions
    applicable = [row for row in revisions if row.effective_from <= day]
    if applicable:
        wage = applicable[-1].day_wage
        legacy = applicable[-1].legacy_hourly_rate
    elif revisions:
        wage = revisions[0].previous_day_wage
        legacy = revisions[0].legacy_hourly_rate
    else:
        wage, legacy = member.overtime_day_wage, member.hourly_rate
    rate = wage / DAY_HOURS if wage is not None else legacy_hourly_rate(member, day, legacy)
    return rate.quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)


def overtime_settings_data(member):
    revisions = list(member.overtime_rate_revisions.all())
    today = timezone.localdate()
    return {
        'overtime_rate_per_hour': None if member.overtime_day_wage is None else format(member.overtime_day_wage / DAY_HOURS, '.6f'),
        'overtime_day_wage': None if member.overtime_day_wage is None else format(member.overtime_day_wage, '.2f'),
        'overtime_day_hours': '8.00',
        'overtime_hourly_rate': format(overtime_rate_for_date(member, today), '.6f'),
        'overtime_fallback_hourly_rate': format(legacy_hourly_rate(member, today).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP), '.6f'),
        'overtime_rate_source': 'DAY_WAGE' if member.overtime_day_wage is not None else 'LEGACY_HOURLY' if member.hourly_rate else 'SALARY_FALLBACK',
        'overtime_effective_from': revisions[-1].effective_from if revisions else None,
        'overtime_rate_history': [{'id': row.pk, 'day_wage': None if row.day_wage is None else format(row.day_wage, '.2f'),
            'hourly_rate': None if row.day_wage is None else format(row.day_wage / DAY_HOURS, '.6f'),
            'hours_per_day': '8.00', 'effective_from': row.effective_from,
            'recorded_at': row.recorded_at, 'changed_by': row.changed_by_id} for row in reversed(revisions)],
    }


def parse_day_wage(value):
    if value in (None, ''):
        return None
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or not 0 <= amount <= Decimal('99999999.99') or amount != amount.quantize(MONEY_PRECISION):
            raise InvalidOperation
        return amount.quantize(MONEY_PRECISION)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('Enter an OT day wage from 0 to 99999999.99, with at most two decimal places.')


class InHouseOvertimeSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def authorized(user):
        return user.role == 'CONTRACTOR' and user.is_verified and user.verification_status == 'VERIFIED'

    def get(self, request, pk):
        if not self.authorized(request.user):
            return Response({'detail': 'Verified issuing contractor access only.'}, status=403)
        member = ContractorApplicatorTeam.objects.filter(pk=pk, contractor=request.user,
            employment_type='IN_HOUSE').first()
        if not member:
            return Response({'detail': 'Employee not found.'}, status=404)
        response = Response(overtime_settings_data(member))
        response['Cache-Control'] = 'no-store'
        return response

    @transaction.atomic
    def patch(self, request, pk):
        if not self.authorized(request.user):
            return Response({'detail': 'Only the verified issuing contractor can set overtime wages.'}, status=403)
        if not isinstance(request.data, Mapping):
            return Response({'detail': 'Provide overtime settings as an object.'}, status=400)
        member = ContractorApplicatorTeam.objects.select_for_update().filter(pk=pk, contractor=request.user,
            employment_type='IN_HOUSE').first()
        if not member:
            return Response({'detail': 'Employee not found.'}, status=404)
        if not member.is_active:
            return Response({'detail': 'Restore the employee before changing overtime wages.'}, status=409)
        # Keep daily fields stable for older clients and existing rate history.
        # New web clients provide hourly pay directly; attendance remains in hours.
        hourly_input = 'overtime_rate_per_hour' in request.data
        if hourly_input and ('overtime_day_wage' in request.data or 'overtime_day_hours' in request.data):
            return Response({'detail': 'Provide only the hourly overtime rate.'}, status=400)
        try:
            if hourly_input:
                value = request.data['overtime_rate_per_hour']
                if value in (None, ''):
                    wage = None
                else:
                    rate = Decimal(str(value))
                    if not rate.is_finite() or rate < 0 or rate > Decimal('12499999.99875'):
                        raise ValueError
                    if rate != rate.quantize(RATE_PRECISION):
                        raise ValueError
                    wage = parse_day_wage(rate * DAY_HOURS)
            else:
                wage = parse_day_wage(request.data.get('overtime_day_wage', member.overtime_day_wage))
        except (ValueError, InvalidOperation, TypeError) as error:
            if hourly_input:
                return Response({'overtime_rate_per_hour': 'Enter a valid hourly OT rate from 0 to 12499999.99875, with up to two decimal places (or preserve an existing fractional rate).'}, status=400)
            return Response({'overtime_day_wage': str(error)}, status=400)
        try:
            hours = Decimal(str(request.data.get('overtime_day_hours', '8')))
            if hours != DAY_HOURS:
                raise ValueError
        except (InvalidOperation, ValueError, TypeError):
            return Response({'overtime_day_hours': 'One overtime day is fixed at 8 hours.'}, status=400)
        try:
            effective = date.fromisoformat(str(request.data.get('effective_from') or timezone.localdate()))
            if effective > timezone.localdate():
                raise ValueError
        except (ValueError, TypeError):
            return Response({'effective_from': 'Choose a valid effective date no later than today.'}, status=400)
        previous = member.overtime_rate_revisions.order_by('-effective_from', '-recorded_at', '-id').first()
        if previous and effective < previous.effective_from:
            return Response({'effective_from': 'Choose a date on or after the latest overtime rate change.'}, status=400)
        if wage != member.overtime_day_wage:
            ApplicatorOvertimeRateRevision.objects.create(membership=member,
                previous_day_wage=member.overtime_day_wage, day_wage=wage,
                legacy_hourly_rate=member.hourly_rate, effective_from=effective, changed_by=request.user)
            member.overtime_day_wage = wage
            member.save(update_fields=['overtime_day_wage'])
        response = Response(overtime_settings_data(member))
        response['Cache-Control'] = 'no-store'
        return response
