import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelConfirmation, confirmAction, installConfirmationHost, settleConfirmation } from './confirmAction.js';

// Source tests only: running these is deferred to the combined validation round.
function host(t) {
  let scope = '/current';
  const shown = [];
  const dispose = installConfirmationHost(request => shown.push(request), () => scope);
  t.after(dispose);
  return { shown, dispose, setScope(value) { scope = value; }, get request() { return shown.at(-1); } };
}

test('No resolves false and clears the visible request without approving any action', async t => {
  const h = host(t);
  const pending = confirmAction({ question: 'Remove this customer?', detail: 'Customer A' });
  const request = h.request;
  assert.equal(request.question, 'Remove this customer?');
  assert.equal(request.detail, 'Customer A');
  settleConfirmation(request.id, false);
  assert.equal(await pending, false);
  assert.equal(h.request, null);
});

test('Yes resolves true once in the same scope and stale request IDs cannot settle a later request', async t => {
  const h = host(t);
  const first = confirmAction({ question: 'Delete this row?' });
  const firstId = h.request.id;
  settleConfirmation(firstId, true);
  assert.equal(await first, true);
  const second = confirmAction({ question: 'Delete another row?' });
  const secondId = h.request.id;
  assert.notEqual(secondId, firstId);
  settleConfirmation(firstId, true);
  assert.equal(h.request.id, secondId);
  settleConfirmation(secondId, false);
  assert.equal(await second, false);
});

test('single-flight requests decline duplicates immediately without replacing or queuing the first', async t => {
  const h = host(t);
  const first = confirmAction({ question: 'Remove the first item?' });
  const request = h.request;
  assert.equal(await confirmAction({ question: 'Remove the second item?' }), false);
  assert.deepEqual(h.shown, [request]);
  settleConfirmation(request.id, true);
  assert.equal(await first, true);
  assert.deepEqual(h.shown, [request, null]);
});

test('Yes from a stale route scope resolves false', async t => {
  const h = host(t);
  const pending = confirmAction({ question: 'Remove this item?' });
  const id = h.request.id;
  h.setScope('/another-route');
  settleConfirmation(id, true);
  assert.equal(await pending, false);
  assert.equal(h.request, null);
});

test('owner-specific cancellation preserves another owner and cancels its matching request', async t => {
  const h = host(t);
  const owner = Symbol('owner');
  const pending = confirmAction({ question: 'Discard this draft?', owner });
  const request = h.request;
  cancelConfirmation(Symbol('different-owner'));
  assert.equal(h.request, request);
  cancelConfirmation(owner);
  assert.equal(await pending, false);
  assert.equal(h.request, null);
  settleConfirmation(request.id, true);
  assert.equal(h.request, null);
});

test('global cancellation resolves a pending request false', async t => {
  const h = host(t);
  const pending = confirmAction({ question: 'Remove this item?', owner: Symbol('owner') });
  cancelConfirmation();
  assert.equal(await pending, false);
  assert.equal(h.request, null);
});

test('host unmount declines the pending request without notifying the unmounted host', async t => {
  const h = host(t);
  const pending = confirmAction({ question: 'Delete this file?' });
  const request = h.request;
  h.dispose();
  assert.equal(await pending, false);
  assert.deepEqual(h.shown, [request]);
  settleConfirmation(request.id, true);
  assert.equal(await confirmAction({ question: 'No mounted host?' }), false);
  assert.deepEqual(h.shown, [request]);
});

test('host replacement cancels the old request and old cleanup cannot remove the new host', async t => {
  const old = host(t);
  const abandoned = confirmAction({ question: 'Old host request?' });
  const oldId = old.request.id;
  const current = host(t);
  assert.equal(await abandoned, false);
  assert.equal(old.request, null);
  old.dispose();
  const pending = confirmAction({ question: 'New host request?' });
  const id = current.request.id;
  settleConfirmation(oldId, true);
  assert.equal(current.request.id, id);
  settleConfirmation(id, true);
  assert.equal(await pending, true);
});

test('missing questions are declined without showing a popup', async t => {
  const h = host(t);
  assert.equal(await confirmAction(), false);
  assert.equal(await confirmAction({ detail: 'No question' }), false);
  assert.deepEqual(h.shown, []);
});
