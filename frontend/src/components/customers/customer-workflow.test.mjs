// Regression source for the deferred combined verification round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerCanWork, customerWhatsApp, pendingCustomerFollowups, initialGeneralFollowup } from './customer-workflow.js';

test('customer work requires an available relationship, with legacy ownership supported', () => {
  assert.equal(customerCanWork({ connection_status: 'CONNECTED', account_status: 'NOT_ACTIVATED' }), true);
  assert.equal(customerCanWork({ id: 1 }), true);
  for (const connection_status of ['BLOCKED', 'DISCONNECTED', 'PENDING', 'REJECTED', 'RECONNECT_PENDING', 'NOT_CONNECTED']) {
    assert.equal(customerCanWork({ connection_status }), false);
  }
  for (const restriction of [{ is_saved_contact: true }, { is_pending_connection: true }, { account_status: 'DISABLED' }, { status: 'CANCELLED' }]) {
    assert.equal(customerCanWork({ connection_status: 'CONNECTED', ...restriction }), false);
  }
  assert.equal(customerCanWork(null), false);
});

test('profile next follow-up ignores notes, completed tasks and invalid dates', () => {
  const rows = [
    { id: 1, next_follow_up: '2026-10-25T10:00:00+05:30', is_completed: true },
    { id: 2, next_follow_up: null },
    { id: 3, next_follow_up: 'invalid' },
    { id: 4, next_follow_up: '2026-10-26T10:00:00+05:30' },
    { id: 5, next_follow_up: '2026-10-25T08:00:00Z' },
  ];
  assert.deepEqual(pendingCustomerFollowups(rows).map(row => row.id), [5, 4]);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3, 4, 5]);
});

test('Indian mobile formats prepare the same manual WhatsApp destination', () => {
  assert.equal(customerWhatsApp('9086543214'), customerWhatsApp('+91 90865 43214'));
  assert.equal(customerWhatsApp(''), '');
  assert.equal(customerWhatsApp('***3214'), '');
});

test('general follow-up defaults do not silently schedule a reminder or select an enquiry', () => {
  const first = initialGeneralFollowup();
  const second = initialGeneralFollowup();
  assert.notEqual(first, second);
  assert.equal(first.next_choice, '');
  assert.equal(first.next_follow_up, '');
  assert.equal(first.edited, false);
  assert.equal(first.submission, null);
  assert.equal(Object.hasOwn(first, 'opportunity'), false);
});
