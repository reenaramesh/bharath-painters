import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpenModule, filterRecords, formatINR, roleDestination } from '../src/core/navigation.ts';
import { ApiClient } from '../src/core/api.ts';

test('employee and support never inherit contractor navigation', () => {
  assert.equal(roleDestination('PAINTER'), '/role');
  assert.equal(roleDestination('SUPPORT'), '/role');
  assert.equal(canOpenModule({ role: 'CUSTOMER', is_verified: true, verification_status: 'VERIFIED' }, 'quotations', []), false);
});
test('quotations require both verification flags and enabled menus', () => {
  const user = { role: 'CONTRACTOR' as const, is_verified: true, verification_status: 'VERIFIED' };
  assert.equal(canOpenModule(user, 'quotations', []), true);
  assert.equal(canOpenModule({ ...user, verification_status: 'SUSPENDED' }, 'quotations', []), false);
  assert.equal(canOpenModule(user, 'quotations', ['quotations']), false);
  assert.equal(canOpenModule(user, 'measurements', ['properties']), false);
});
test('search combines words across title and description without mutating records', () => {
  const rows = [{ id: '1', title: 'Ananya Rao', subtitle: 'Bengaluru home', status: 'Active' }];
  assert.deepEqual(filterRecords(rows, '  RAO bengaluru '), rows);
  assert.deepEqual(filterRecords(rows, 'Delhi'), []);
  assert.equal(formatINR('120000'), '₹1,20,000');
});
test('parallel unauthorized reads refresh only once and retry with new bearer', async () => {
  let refreshes = 0;
  const client = new ApiClient('https://example.com/api', async (url, init) => {
    if (String(url).endsWith('token/refresh/')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ access: 'new' }); }
    return new Headers(init?.headers).get('Authorization') === 'Bearer new' ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
  });
  client.setTokens({ access: 'old', refresh: 'refresh' });
  assert.deepEqual(await Promise.all([client.get('/accounts/me/'), client.get('/accounts/me/')]), [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
});
test('logout during refresh prevents session resurrection', async () => {
  let finish: (() => void) | undefined;
  const client = new ApiClient('https://example.com/api', async (url) => {
    if (String(url).endsWith('token/refresh/')) { await new Promise<void>(resolve => { finish = resolve; }); return Response.json({ access: 'new' }); }
    return Response.json({}, { status: 401 });
  });
  client.setTokens({ access: 'old', refresh: 'refresh' });
  const request = client.get('/accounts/me/');
  await new Promise(resolve => setTimeout(resolve, 0));
  client.setTokens(null); finish?.();
  await assert.rejects(request);
  assert.equal(client.tokens, null);
});
test('API rejects external and traversal paths before sending credentials', async () => {
  let calls = 0;
  const client = new ApiClient('https://example.com/api', async () => { calls++; return Response.json({}); });
  await assert.rejects(client.get('https://evil.example/me'));
  await assert.rejects(client.get('/../accounts/me/'));
  assert.equal(calls, 0);
});
test('expiry is announced before storage cleanup so a new sign-in is not cleared', async () => {
  let finish: (() => void) | undefined;
  let expired = 0;
  const client = new ApiClient('https://example.com/api', async () => Response.json({}, { status: 401 }));
  client.setTokens({ access: 'old', refresh: 'old-refresh' });
  client.onExpired = () => { expired++; };
  client.onTokens = async () => { await new Promise<void>(resolve => { finish = resolve; }); };
  const pending = client.get('/accounts/me/');
  await new Promise(resolve => setTimeout(resolve, 0));
  const expiredBeforeSignIn = expired;
  client.setTokens({ access: 'new-login', refresh: 'new-refresh' });
  finish?.();
  await assert.rejects(pending);
  assert.equal(expiredBeforeSignIn, 1);
  assert.equal(expired, 1);
  assert.equal(client.tokens?.access, 'new-login');
});
test('default transport invokes fetch without an ApiClient receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.ok(this === undefined || this === globalThis, 'fetch must use its native global receiver');
    return Response.json({ ok: true });
  };
  try { assert.deepEqual(await new ApiClient('https://example.com/api').get('/accounts/me/'), { ok: true }); }
  finally { globalThis.fetch = original; }
});
