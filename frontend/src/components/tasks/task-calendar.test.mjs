// Execution deferred to the combined verification round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarQuery, indiaDay, initialTaskFilters, matchesTaskDate, rowDueGroup } from './task-calendar.js';

const filters = changes => ({ ...initialTaskFilters('scheduled'), anchor: '2026-10-24', ...changes });

test('India date boundaries do not follow the device timezone', () => {
  assert.equal(indiaDay('2026-10-23T18:29:59Z'), '2026-10-23');
  assert.equal(indiaDay('2026-10-23T18:30:00Z'), '2026-10-24');
  assert.equal(indiaDay('2026-10-24'), '2026-10-24');
  assert.equal(indiaDay(null), '');
});

test('weeks run Monday through Sunday, and month/year ranges are inclusive', () => {
  assert.deepEqual(calendarQuery(filters({ period: 'week' })), { date_type: 'next_follow_up', date_from: '2026-10-19', date_to: '2026-10-25' });
  assert.deepEqual(calendarQuery(filters({ period: 'month', anchor: '2024-02-18' })), { date_type: 'next_follow_up', date_from: '2024-02-01', date_to: '2024-02-29' });
  assert.deepEqual(calendarQuery(filters({ period: 'year' })), { date_type: 'next_follow_up', date_from: '2026-01-01', date_to: '2026-12-31' });
});

test('invalid and reversed custom dates never produce a usable query', () => {
  assert.throws(() => calendarQuery(filters({ period: 'custom', date_from: '2026-10-25', date_to: '2026-10-24' })));
  assert.throws(() => calendarQuery(filters({ period: 'day', anchor: '2026-02-30' })));
  assert.throws(() => calendarQuery(filters({ period: 'week', anchor: '9999-12-31' })));
});

test('date type filters select the recorded field and keep missing dates explicit', () => {
  const row = { next_follow_up: '2026-10-24T12:00:00+05:30', last_contact_at: '2026-10-20T11:00:00Z', last_service_date: null };
  assert.equal(matchesTaskDate(row, filters({ period: 'day' })), true);
  assert.equal(matchesTaskDate(row, filters({ period: 'day', date_type: 'last_contact' })), false);
  assert.equal(matchesTaskDate(row, filters({ period: 'missing', date_type: 'last_service' })), true);
  assert.equal(matchesTaskDate(row, filters({ period: 'day', date_type: 'last_service' })), false);
  assert.equal(matchesTaskDate(row, filters({ period: 'all', date_type: 'last_service' })), true);
});

test('today, overdue and upcoming use India calendar days', () => {
  const now = new Date('2026-10-23T19:00:00Z');
  assert.equal(rowDueGroup({ next_follow_up: '2026-10-23T18:29:00Z' }, now), 'overdue');
  assert.equal(rowDueGroup({ next_follow_up: '2026-10-24T10:00:00+05:30' }, now), 'today');
  assert.equal(rowDueGroup({ next_follow_up: '2026-10-25T10:00:00+05:30' }, now), 'upcoming');
  assert.equal(rowDueGroup({ next_follow_up: null }, now), 'none');
});

test('finder starts with all contact dates, while scheduled grouping remains Today', () => {
  assert.equal(initialTaskFilters('customers').date_type, 'last_contact');
  assert.equal(initialTaskFilters('customers').period, 'all');
  assert.equal(initialTaskFilters('scheduled').date_type, 'next_follow_up');
});
