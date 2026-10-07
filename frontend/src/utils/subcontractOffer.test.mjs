import assert from 'node:assert/strict';
import test from 'node:test';
import { offerServices, offerPayload, sendScopeOffer } from './subcontractOffer.js';

test('price-free services retain descriptions and quantities only', () => {
  const services = offerServices({ items: [{ id: 1, description: 'Bedroom walls', service_category_name: 'Painting', service_name: 'Emulsion', quantity: '250', unit_name: 'sq ft', rate: '85', amount: '21250' }] });
  assert.deepEqual(services, [{ id: 1, title: 'Bedroom walls', category: 'Painting', service: 'Emulsion', quantity: '250', unit: 'sq ft' }]);
});

test('payload includes only selected lines and never customer price', () => {
  const payload = offerPayload({ quotation: '3', receiving_contractor: '4', project_title: 'Walls', agreed_amount: '21250' }, [1]);
  assert.deepEqual(payload.quotation_item_ids, [1]);
  assert.equal(payload.agreed_amount, undefined);
  assert.throws(() => offerPayload({ quotation: '3', receiving_contractor: '4', project_title: 'Walls' }, []), /Select/);
});

test('retry sends the existing draft instead of creating a duplicate', async () => {
  const calls = [];
  const api = { get: async () => ({ data: { id: 9, status: 'DRAFT' } }), post: async (url) => { calls.push(url); return { data: { id: 9 } }; } };
  let draft;
  const failing = { post: async (url) => { calls.push(url); if (url.endsWith('/transition/')) throw Error('Offline'); return { data: { id: 9 } }; } };
  await assert.rejects(sendScopeOffer(failing, {}, null, id => { draft = id; }), /Offline/);
  assert.equal(draft, 9);
  await sendScopeOffer(api, {}, draft, () => {});
  assert.deepEqual(calls, ['/outsourcing/work-orders/', '/outsourcing/work-orders/9/transition/', '/outsourcing/work-orders/9/transition/']);
});

test('retry recovers when the first send succeeded but its response was lost', async () => {
  let posts = 0;
  const api = {
    get: async () => ({ data: { id: 9, status: 'SENT', sent_at: '2026-10-07T12:00:00Z' } }),
    post: async () => { posts++; throw Error('Already sent'); },
  };
  const result = await sendScopeOffer(api, {}, 9, () => {});
  assert.equal(result.data.status, 'SENT');
  assert.equal(posts, 0);
});
