import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import axios from 'axios';

// Load the real client with Vite's environment substituted, without a server or credentials.
const url = new URL('./client.js', import.meta.url);
const source = (await fs.readFile(url, 'utf8')).replaceAll('import.meta.env', '({ PROD: false })');
const code = source.replace(/from\s+(["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier))}`);
const { default: api } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
globalThis.localStorage = { getItem: () => null, removeItem() {} };
globalThis.window = { location: { origin: 'http://localhost:5173' } };

function failure(config, status = 502, errorCode = 'ERR_BAD_RESPONSE') {
  return new axios.AxiosError('Test failure', errorCode, config, null, status ? { status, data: {}, headers: {}, config } : undefined);
}
function success(config) { return { status: 200, data: [{ id: 11 }], headers: {}, config }; }

test('a temporary gateway failure recovers a filtered read without losing request parameters', async () => {
  const calls = [];
  const adapter = async config => { calls.push(config); if (calls.length === 1) throw failure(config); return success(config); };
  const response = await api.get('/quotations/', { params: { stage: 'SENT', page: 2 }, adapter });
  assert.deepEqual(response.data, [{ id: 11 }]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, { stage: 'SENT', page: 2 });
});

test('a persistent gateway failure stops after two retries', async () => {
  let calls = 0;
  await assert.rejects(api.get('/quotations/', { adapter: async config => { calls++; throw failure(config, 503); } }), error => error.response.status === 503);
  assert.equal(calls, 3);
});

test('connection refusal can recover an idempotent GET', async () => {
  let calls = 0;
  const result = await api.get('/accounts/me/', { adapter: async config => { calls++; if (calls === 1) throw failure(config, null, 'ERR_NETWORK'); return success(config); } });
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
});

test('mutations and non-transient permission/not-found/server errors are never replayed', async () => {
  for (const [method, status] of [['post', 502], ['patch', 503], ['put', 504], ['delete', 502], ['get', 401], ['get', 403], ['get', 404], ['get', 500]]) {
    let calls = 0;
    await assert.rejects(api.request({ method, url: '/test-only/', adapter: async config => { calls++; throw failure(config, status); } }));
    assert.equal(calls, 1, `${method} ${status} should not retry`);
  }
});

test('canceling a pending retry prevents another request', async () => {
  let calls = 0;
  const controller = new AbortController();
  const request = api.get('/quotations/', { signal: controller.signal, adapter: async config => { calls++; setTimeout(() => controller.abort(), 0); throw failure(config); } });
  await assert.rejects(request, error => axios.isCancel(error));
  assert.equal(calls, 1);
});
