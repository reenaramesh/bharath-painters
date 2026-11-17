// Unrun regression sources for the combined verification round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialQuickUpdate, pendingFollowups, quickUpdateDirty, shortcutDate } from './lead-quick-update.js';

test('tomorrow uses the India calendar and 10 am, including month/year boundaries', () => {
  assert.equal(shortcutDate('tomorrow', new Date('2026-10-24T21:15:00Z')), '2026-10-26T10:00');
  assert.equal(shortcutDate('tomorrow', new Date('2026-12-31T18:15:00Z')), '2027-01-01T10:00');
});

test('two-hour reminder crosses India midnight without depending on the device timezone', () => {
  assert.equal(shortcutDate('two_hours', new Date('2026-10-24T17:00:00Z')), '2026-10-25T00:30');
  assert.equal(shortcutDate('none'), '');
  assert.equal(shortcutDate('custom'), '');
});

test('current accessible task takes precedence; completed tasks and visit records are not selected', () => {
  const item = { next_action: { task_id: 3 }, follow_ups: [
    { id: 1, is_completed: true, next_follow_up: '2026-10-24T09:00:00Z' },
    { id: 2, is_completed: false, next_follow_up: '2026-10-24T10:00:00Z' },
    { id: 3, is_completed: false, next_follow_up: '2026-10-24T11:00:00Z' },
  ], site_visits: [{ id: 90, status: 'SCHEDULED' }] };
  assert.deepEqual(pendingFollowups(item).map(task => task.id), [2, 3]);
  assert.equal(initialQuickUpdate(item).completed_task, 3);
  assert.equal(initialQuickUpdate({ ...item, next_action: { visit_id: 90 } }).completed_task, 2);
  assert.equal(initialQuickUpdate({ ...item, follow_ups: [], next_action: { visit_id: 90 } }).completed_task, '');
});

test('new drafts require an explicit outcome and next choice and remain clean until edited', () => {
  const draft = initialQuickUpdate({});
  assert.equal(draft.outcome, '');
  assert.equal(draft.next_choice, '');
  assert.equal(draft.comment, '');
  assert.equal(draft.follow_up_type, 'CALL');
  assert.equal(draft.next_action, 'Follow up with customer');
  assert.equal(quickUpdateDirty(draft), false);
  assert.equal(quickUpdateDirty({ ...draft, edited: true }), true);
});
