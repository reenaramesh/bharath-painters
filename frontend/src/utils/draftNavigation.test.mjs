import test from 'node:test';
import assert from 'node:assert/strict';
import { installDraftNavigationGuard } from './draftNavigation.js';
import { installConfirmationHost, settleConfirmation } from './confirmAction.js';

// Source tests only: running these is deferred to the combined validation round.
const flushDecisions = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness(t, index = 3) {
  const listeners = new Map();
  const historyCalls = [];
  const navigationCalls = [];
  const routerPops = [];
  const prompts = [];
  const disposers = [];
  let dirty = true;
  let scope = '/draft';
  let visible = null;
  const browser = {
    history: { state: { idx: index }, go: delta => historyCalls.push(delta) },
    confirm() { assert.fail('In-app navigation must use the async confirmation host'); },
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
  };
  const navigator = {
    push(...args) { navigationCalls.push(['push', ...args]); browser.history.state = { idx: browser.history.state.idx + 1 }; },
    replace(...args) { navigationCalls.push(['replace', ...args]); },
    go(...args) { navigationCalls.push(['go', ...args]); browser.history.go(args[0]); },
  };
  const originals = { ...navigator };
  const uninstallHost = installConfirmationHost(request => {
    visible = request;
    if (request) prompts.push(request);
  }, () => scope);
  const install = (shouldWarn = () => dirty, options) => {
    const dispose = installDraftNavigationGuard(browser, navigator, shouldWarn, options);
    disposers.push(dispose);
    return dispose;
  };
  const pop = next => {
    let stopped = false;
    const state = { idx: next };
    browser.history.state = state;
    const event = { state, stopImmediatePropagation() { stopped = true; } };
    for (const listener of listeners.get('popstate') || []) {
      listener(event);
      if (stopped) break;
    }
    if (!stopped) routerPops.push(next);
    return stopped;
  };
  t.after(() => { for (const dispose of disposers.reverse()) dispose(); uninstallHost(); });
  return {
    browser, navigator, originals, listeners, prompts, historyCalls, navigationCalls, routerPops,
    install, pop,
    setDirty(value) { dirty = value; },
    setScope(value) { scope = value; },
    get visible() { return visible; },
  };
}

test('dirty push and replace wait for Yes; No preserves navigation and clean saves do not prompt', async t => {
  const h = harness(t);
  h.install();
  const declined = h.navigator.push('/quotations');
  assert.deepEqual(h.navigationCalls, []);
  assert.equal(h.prompts.length, 1);
  settleConfirmation(h.visible.id, false);
  await declined;
  assert.deepEqual(h.navigationCalls, []);

  const approved = h.navigator.replace('/customers', { state: 'preserved' });
  const request = h.visible;
  assert.deepEqual(h.navigationCalls, []);
  settleConfirmation(request.id, true);
  await approved;
  settleConfirmation(request.id, true);
  assert.deepEqual(h.navigationCalls, [['replace', '/customers', { state: 'preserved' }]]);

  h.setDirty(false);
  h.navigator.push('/saved');
  assert.deepEqual(h.navigationCalls.at(-1), ['push', '/saved']);
  assert.equal(h.prompts.length, 2);
});

test('repeated navigation while a decision is open neither replaces nor queues its action', async t => {
  const h = harness(t);
  h.install();
  const pending = h.navigator.push('/first');
  h.navigator.replace('/second');
  h.navigator.go(-1);
  assert.equal(h.prompts.length, 1);
  assert.deepEqual(h.navigationCalls, []);
  settleConfirmation(h.visible.id, true);
  await pending;
  assert.deepEqual(h.navigationCalls, [['push', '/first']]);
});

for (const [direction, delta] of [['Back', -1], ['Forward', 1]]) {
  for (const answer of [false, true]) {
    test(`${direction} restores the original entry before asking; ${answer ? 'Yes replays once' : 'No never replays'}`, async t => {
      const h = harness(t, 3);
      h.install();
      assert.equal(h.pop(3 + delta), true);
      assert.deepEqual(h.historyCalls, [-delta]);
      assert.equal(h.prompts.length, 0);
      assert.deepEqual(h.routerPops, []);

      assert.equal(h.pop(3), true);
      assert.equal(h.browser.history.state.idx, 3);
      assert.equal(h.prompts.length, 1);
      assert.deepEqual(h.routerPops, []);
      const id = h.visible.id;
      settleConfirmation(id, answer);
      await flushDecisions();
      settleConfirmation(id, true);
      await flushDecisions();

      assert.deepEqual(h.historyCalls, answer ? [-delta, delta] : [-delta]);
      assert.deepEqual(h.navigationCalls, []);
      if (answer) {
        assert.equal(h.pop(3 + delta), false);
        assert.deepEqual(h.routerPops, [3 + delta]);
        assert.equal(h.prompts.length, 1);
      } else {
        assert.equal(h.browser.history.state.idx, 3);
        assert.deepEqual(h.routerPops, []);
      }
    });
  }
}

test('Yes during a repeated history restoration waits for the original entry before replay', async t => {
  const h = harness(t);
  h.install();
  h.pop(2);
  h.pop(3);
  const id = h.visible.id;
  h.pop(2);
  assert.deepEqual(h.historyCalls, [1, 1]);
  settleConfirmation(id, true);
  await flushDecisions();
  assert.deepEqual(h.historyCalls, [1, 1]);
  h.pop(3);
  assert.deepEqual(h.historyCalls, [1, 1, -1]);
  assert.equal(h.prompts.length, 1);
  assert.equal(h.pop(2), false);
});

test('nested dirty guards approve one replay and restore original methods after out-of-order cleanup', async t => {
  const h = harness(t);
  const outer = h.install();
  const inner = h.install();
  const pending = h.navigator.push('/approved');
  settleConfirmation(h.visible.id, true);
  await pending;
  assert.equal(h.prompts.length, 1);
  assert.deepEqual(h.navigationCalls, [['push', '/approved']]);

  outer();
  assert.equal(h.listeners.get('popstate').size, 1);
  const remaining = h.navigator.replace('/remaining');
  settleConfirmation(h.visible.id, false);
  await remaining;
  assert.equal(h.prompts.length, 2);
  assert.equal(h.navigationCalls.length, 1);
  inner();
  assert.deepEqual(h.navigator, h.originals);
  assert.equal(h.listeners.size, 0);
});

test('disposing a pending guard cancels its request and prevents stale Yes from replaying', async t => {
  const h = harness(t);
  const dispose = h.install();
  const pending = h.navigator.push('/abandoned');
  const id = h.visible.id;
  dispose();
  await pending;
  settleConfirmation(id, true);
  await flushDecisions();
  assert.equal(h.visible, null);
  assert.deepEqual(h.navigationCalls, []);
  assert.deepEqual(h.navigator, h.originals);
  assert.equal(h.listeners.size, 0);
});

test('cleanup during history restoration waits for restoration without opening a popup', async t => {
  const h = harness(t);
  const dispose = h.install();
  h.pop(2);
  dispose();
  assert.ok(h.listeners.has('popstate'));
  assert.equal(h.pop(3), true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.prompts.length, 0);
  assert.deepEqual(h.historyCalls, [1]);
});

test('a changed route scope declines stale approval without replaying navigation', async t => {
  const h = harness(t);
  h.install();
  const pending = h.navigator.push('/stale');
  h.setScope('/different-route');
  settleConfirmation(h.visible.id, true);
  await pending;
  assert.deepEqual(h.navigationCalls, []);
});

test('beforeunload retains the native warning and go(0) does not open an in-app popup', t => {
  const h = harness(t);
  h.install();
  let prevented = 0;
  const event = { preventDefault() { prevented += 1; } };
  for (const listener of h.listeners.get('beforeunload')) listener(event);
  assert.equal(prevented, 1);
  assert.equal(event.returnValue, '');
  assert.equal(h.prompts.length, 0);
  h.navigator.go(0);
  assert.deepEqual(h.navigationCalls, [['go', 0]]);
  assert.equal(h.prompts.length, 0);

  h.setDirty(false);
  const clean = { preventDefault() { assert.fail('Clean drafts must not warn'); } };
  for (const listener of h.listeners.get('beforeunload')) listener(clean);
  assert.equal(Object.hasOwn(clean, 'returnValue'), false);
});

test('lead board filters preserve drafts without bypassing protection for leaving the page', async t => {
  const h = harness(t);
  h.browser.location = new URL('https://bharath.test/opportunities?queue=active');
  h.install(() => true, { preservePathname: '/opportunities' });
  h.navigator.push({ pathname: '/opportunities', search: '?queue=today' });
  h.navigator.replace('?assigned_user=5');
  assert.equal(h.prompts.length, 0);
  assert.equal(h.navigationCalls.length, 2);
  const leaving = h.navigator.push('/customers');
  assert.equal(h.prompts.length, 1);
  settleConfirmation(h.visible.id, false);
  await leaving;
  assert.equal(h.navigationCalls.length, 2);
  let warned = false;
  for (const listener of h.listeners.get('beforeunload')) listener({ preventDefault() { warned = true; } });
  assert.equal(warned, true);
});

test('browser history between lead filters preserves drafts; leaving restores and asks', async t => {
  const h = harness(t);
  h.browser.location = new URL('https://bharath.test/opportunities?queue=today');
  h.install(() => true, { preservePathname: '/opportunities' });
  assert.equal(h.pop(2), false);
  assert.equal(h.prompts.length, 0);
  h.browser.location = new URL('https://bharath.test/customers');
  assert.equal(h.pop(1), true);
  assert.deepEqual(h.historyCalls, [1]);
  h.browser.location = new URL('https://bharath.test/opportunities?queue=today');
  assert.equal(h.pop(2), true);
  assert.equal(h.prompts.length, 1);
  settleConfirmation(h.visible.id, false);
  await flushDecisions();
  assert.deepEqual(h.routerPops, [2]);
});
