import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentSender } from './paymentRequest.js';

test('response-loss retry retains its payment key and records one payment', async () => {
  const payments = new Map();
  let loseResponse = true;
  const send = createPaymentSender(async (_url, payload) => {
    if (!payments.has(payload.idempotency_key)) payments.set(payload.idempotency_key, { id: payments.size + 1 });
    if (loseResponse) { loseResponse = false; throw new Error('Response lost'); }
    return payments.get(payload.idempotency_key);
  });
  await assert.rejects(send('/invoice/1', { amount: '10.00' }), /Response lost/);
  assert.deepEqual(await send('/invoice/1', { amount: '10.00' }), { id: 1 });
  assert.equal(payments.size, 1);
  await send('/invoice/1', { amount: '10.00' });
  assert.equal(payments.size, 2, 'a successful entry permits a separate next payment');
});

test('overlapping submission is single flight and different invoices have separate keys', async () => {
  let finish; const calls = [];
  const send = createPaymentSender((url, payload) => {
    calls.push({ url, payload });
    return new Promise(resolve => { finish = resolve; });
  });
  const first = send('/invoice/1', { amount: '10.00' });
  const duplicate = send('/invoice/1', { amount: '10.00' });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  finish({ id: 1 });
  await Promise.all([first, duplicate]);
  const next = send('/invoice/2', { amount: '10.00' });
  await Promise.resolve();
  assert.notEqual(calls[0].payload.idempotency_key, calls[1].payload.idempotency_key);
  finish({ id: 2 }); await next;
});

test('edited retries retain their key so the server can detect payload conflicts', async () => {
  const keys = [];
  const send = createPaymentSender(async (_url, payload) => {
    keys.push(payload.idempotency_key); throw new Error('Uncertain result');
  });
  await assert.rejects(send('/invoice/1', { amount: '10.00' }));
  await assert.rejects(send('/invoice/1', { amount: '20.00' }));
  assert.equal(keys[0], keys[1]);
});
