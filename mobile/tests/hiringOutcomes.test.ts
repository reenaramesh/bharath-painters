import test from 'node:test';
import assert from 'node:assert/strict';
import { assignableHiringOutcomes, schedulesWithinHiringDates } from '../src/core/hiringOutcomes.ts';

test('offers only accepted applications and confirmed bookings with a source id', () => {
  const rows = assignableHiringOutcomes([
    { id: 'accepted-12', application_id: 12, activity_type: 'Accepted applicator', title: 'Interior painting', person: 'Painter A', status: 'ACCEPTED', start_date: '2026-10-20', end_date: '2026-10-22' },
    { id: 'booking-34', activity_type: 'Applicator booking', title: 'Exterior painting', person: 'Painter B', status: 'CONFIRMED', start_date: '2026-10-23', end_date: '2026-10-25' },
    { id: 'accepted-56', application_id: 56, activity_type: 'Accepted applicator', title: 'Old job', person: 'Painter C', status: 'CANCELLED', start_date: '2026-10-20', end_date: '2026-10-22' },
    { id: 'booking-78', activity_type: 'Applicator booking', title: 'Waiting', person: 'Painter D', status: 'PENDING', start_date: '2026-10-20', end_date: '2026-10-22' },
  ]);

  assert.deepEqual(rows.map(row => [row.sourceType, row.sourceId]), [['application', 12], ['booking', 34]]);
});

test('only offers project schedules fully contained in the accepted hiring dates', () => {
  const outcome = { start_date: '2026-10-20', end_date: '2026-10-22' };
  const schedules = [
    { id: 1, start_date: '2026-10-20', end_date: '2026-10-22' },
    { id: 2, start_date: '2026-10-21', end_date: '2026-10-22' },
    { id: 3, start_date: '2026-10-19', end_date: '2026-10-21' },
    { id: 4, start_date: '2026-10-20', end_date: '2026-10-23' },
  ];
  assert.deepEqual(schedulesWithinHiringDates(outcome, schedules).map(row => row.id), [1, 2]);
});
