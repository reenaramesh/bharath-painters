import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('service worker intercepts multipart POST before the dev and GET guards', async () => {
  const handlers = {};
  const scope = { self: { location: new URL('http://localhost:4173'), addEventListener: (name, fn) => { handlers[name] = fn; } }, URL, URLSearchParams, Response, Request };
  vm.runInNewContext(fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), scope);
  const form = new FormData();
  form.set('title', 'Ravi'); form.set('text', '+919876543212');
  let pending;
  handlers.fetch({ request: new Request('http://localhost:4173/share-target', { method: 'POST', body: form }), respondWith: value => { pending = value; } });
  assert.ok(pending, 'share POST must be intercepted');
  const response = await pending;
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.pathname, '/share-contact');
  assert.equal(new URLSearchParams(location.hash.slice(1)).get('title'), 'Ravi');
});
