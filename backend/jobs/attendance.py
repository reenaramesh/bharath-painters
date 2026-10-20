"""Canonical attendance accrual; historical ambiguity must never duplicate wages."""
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import APIException

from .models import ApplicatorAttendance, ApplicatorLedgerEntry, ContractorApplicatorTeam


class LegacyAttendanceOverlap(APIException):
    status_code = 409
    default_code = "legacy_attendance_earning_overlap"
    default_detail = "An unlinked historical earning exists for this employee and date. Accounting review is required before attendance earnings can be posted. No records were changed."


def salary_daily_rate(membership):
    """Preserve the existing daily / weekly-six / monthly-26 wage policy."""
    salary = membership.salary_amount or Decimal("0")
    if membership.salary_basis == ContractorApplicatorTeam.SalaryBasis.DAILY:
        return salary
    return salary / (Decimal("6") if membership.salary_basis == ContractorApplicatorTeam.SalaryBasis.WEEKLY else Decimal("26"))


def salary_terms_for_date(membership, day, revisions=None):
    """Resolve the rate in force on a date; the earliest revision's previous rate is the legacy baseline."""
    if revisions is None:
        revisions = getattr(membership, "_salary_revisions_cache", None)
        if revisions is None:
            revisions = list(membership.salary_revisions.all())
            membership._salary_revisions_cache = revisions
    revisions = list(revisions)
    if not revisions:
        return membership.salary_basis, membership.salary_amount
    applicable = [revision for revision in revisions if revision.effective_from <= day]
    if applicable:
        current = applicable[-1]
        return current.salary_basis, current.salary_amount
    first = revisions[0]
    return first.previous_salary_basis, first.previous_salary_amount


def salary_daily_rate_for_date(membership, day, revisions=None):
    basis, amount = salary_terms_for_date(membership, day, revisions)
    salary = amount or Decimal("0")
    if basis == ContractorApplicatorTeam.SalaryBasis.DAILY:
        return salary
    return salary / (Decimal("6") if basis == ContractorApplicatorTeam.SalaryBasis.WEEKLY else Decimal("26"))


def attendance_earning_amount(membership, attendance):
    """Keep the existing daily/weekly/monthly salary calculation in one place."""
    daily_rate = salary_daily_rate_for_date(membership, attendance.date)
    units = Decimal("1") if attendance.status == ApplicatorAttendance.Status.PRESENT else Decimal("0.5") if attendance.status == ApplicatorAttendance.Status.HALF_DAY else Decimal("0")
    return (daily_rate * units).quantize(Decimal("0.01"))


def overtime_earning_amount(membership, attendance):
    from .overtime import MONEY_PRECISION, overtime_rate_for_date
    from decimal import ROUND_HALF_UP
    if attendance.status != ApplicatorAttendance.Status.PRESENT:
        return Decimal("0.00")
    rate = attendance.overtime_hourly_rate_snapshot
    if rate is None:
        rate = overtime_rate_for_date(membership, attendance.date)
    return (attendance.overtime_hours * rate).quantize(MONEY_PRECISION, rounding=ROUND_HALF_UP)


@transaction.atomic
def sync_attendance_earning(membership, attendance):
    """Lock one employee, preserve original postings and append component corrections."""
    from .attendance_postings import sync_component
    from .overtime import overtime_rate_for_date
    membership = ContractorApplicatorTeam.objects.select_for_update().get(pk=membership.pk)
    attendance = ApplicatorAttendance.objects.select_for_update().get(pk=attendance.pk, membership=membership)
    if ApplicatorLedgerEntry.objects.filter(
        membership=membership, date=attendance.date, entry_type=ApplicatorLedgerEntry.EntryType.EARNING,
        source_attendance__isnull=True,
    ).exists():
        raise LegacyAttendanceOverlap()
    approved = attendance.approval_status == ApplicatorAttendance.ApprovalStatus.APPROVED
    if approved and attendance.overtime_hourly_rate_snapshot is None:
        attendance.overtime_hourly_rate_snapshot = overtime_rate_for_date(membership, attendance.date)
        attendance.save(update_fields=['overtime_hourly_rate_snapshot'])
    base_target = attendance_earning_amount(membership, attendance) if approved else Decimal('0.00')
    ot_target = overtime_earning_amount(membership, attendance) if approved else Decimal('0.00')
    base, base_adjustment = sync_component(membership, attendance, base_target, 'BASE')
    overtime, overtime_adjustment = sync_component(membership, attendance, ot_target, 'OVERTIME')
    return base, base_adjustment, overtime, overtime_adjustment
