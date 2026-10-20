"""Independent, append-only base/OT attendance ledger components."""
from decimal import Decimal

from .models import ApplicatorLedgerEntry


def sync_component(membership, attendance, target, component):
    overtime = component == 'OVERTIME'
    kind = 'OVERTIME' if overtime else 'EARNING'
    source = 'source_overtime_attendance' if overtime else 'source_attendance'
    original = ApplicatorLedgerEntry.objects.select_for_update().filter(
        membership=membership, entry_type=kind, **{source: attendance}).first()
    if original is None:
        if overtime and target == 0:
            return None, None
        original = ApplicatorLedgerEntry.objects.create(
            membership=membership, date=attendance.date, entry_type=kind, amount=target,
            schedule=attendance.schedule, assignment=attendance.assignment,
            reference=f'attendance-ot:{attendance.pk}' if overtime else f'attendance:{attendance.pk}',
            note=(f'Approved overtime: {attendance.overtime_hours} hours at ₹{attendance.overtime_hourly_rate_snapshot}/hour'
                  if overtime else 'Contractor-approved attendance earning'),
            attendance_component=component, **{source: attendance})
        return original, None
    corrections = list(ApplicatorLedgerEntry.objects.filter(
        source_attendance_adjustment=attendance, attendance_component=component,
        entry_type__in=('DEBIT_ADJUSTMENT', 'CREDIT_ADJUSTMENT'),
    ).values_list('entry_type', 'amount'))
    current = original.amount + sum((amount if kind == 'DEBIT_ADJUSTMENT' else -amount
                                    for kind, amount in corrections), Decimal('0'))
    delta = target - current
    if not delta:
        return original, None
    adjustment = ApplicatorLedgerEntry.objects.create(
        membership=membership, date=attendance.date,
        entry_type='DEBIT_ADJUSTMENT' if delta > 0 else 'CREDIT_ADJUSTMENT',
        amount=abs(delta), schedule=attendance.schedule, assignment=attendance.assignment,
        source_attendance_adjustment=attendance, attendance_component=component,
        reference=(f'attendance-ot-correction:{attendance.pk}:{len(corrections) + 1}' if overtime
                   else f'attendance-correction:{attendance.pk}:{len(corrections) + 1}'),
        note=f'{"Overtime" if overtime else "Attendance"} correction: approved amount changed from ₹{current:.2f} to ₹{target:.2f}.',
    )
    return original, adjustment
