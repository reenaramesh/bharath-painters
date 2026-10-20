import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceCollectionMatches, mergeAttentionRows } from './workflowAttention.js';

test('overdue collection handoff uses remaining balances and due dates before today', () => {
  const today = '2026-10-19';
  const invoice = { status: 'PART_PAID', balance_due: '75.05', due_date: '2026-10-18' };
  assert.equal(invoiceCollectionMatches(invoice, 'overdue', today), true);
  assert.equal(invoiceCollectionMatches({ ...invoice, due_date: today }, 'overdue', today), false);
  assert.equal(invoiceCollectionMatches({ ...invoice, due_date: null }, 'overdue', today), false);
  assert.equal(invoiceCollectionMatches({ ...invoice, due_date: null }, 'outstanding', today), true);
  for (const balance of ['0.00', '-1', 'invalid']) {
    assert.equal(invoiceCollectionMatches({ ...invoice, balance_due: balance }, 'overdue', today), false);
  }
  assert.equal(invoiceCollectionMatches({ ...invoice, status: 'CANCELLED' }, 'outstanding', today), false);
  assert.equal(invoiceCollectionMatches(invoice, '', today), true);
});

test('overdue register honors server business date across browser timezones', () => {
  assert.equal(invoiceCollectionMatches({ status: 'ISSUED', balance_due: '10', due_date: '2026-10-19', is_overdue: true }, 'overdue', '2026-10-19'), true);
  assert.equal(invoiceCollectionMatches({ status: 'ISSUED', balance_due: '10', due_date: '2026-10-18', is_overdue: false }, 'overdue', '2026-10-19'), false);
});

test('loading another attention page keeps earlier rows and updates repeated identities', () => {
  const previous = [{ key: 'schedule-1', stage: 'REQUEST_ADVANCE' }, { key: 'schedule-2' }];
  const next = [{ key: 'schedule-1', stage: 'CONFIRM_ADVANCE' }, { key: 'quotation-3' }];
  assert.deepEqual(mergeAttentionRows(previous, next), [next[0], previous[1], next[1]]);
  assert.equal(previous[0].stage, 'REQUEST_ADVANCE');
  assert.deepEqual(mergeAttentionRows(undefined, [{ id: 4 }]), [{ id: 4 }]);
});
