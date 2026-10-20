import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPropertyDetail } from './propertyDetailLoad.js';

function client(overrides = {}) {
  const values = {
    '/quotations/properties/59/': { id: 59, name: 'Saved property' },
    '/quotations/properties/59/rooms/': [{ id: 1 }],
    '/quotations/properties/59/measurements/': [{ id: 2 }],
    '/quotations/properties/59/measurement-records/': [{ id: 3 }],
    '/quotations/customers/': [{ id: 4 }],
    ...overrides,
  };
  return { get: async path => {
    if (values[path] instanceof Error) throw values[path];
    return { data: values[path] };
  } };
}

test('property remains available when pending measurement schema makes all measurement reads fail', async () => {
  const failure = new Error('measurement edit_revision column is absent');
  const loaded = await loadPropertyDetail(client({
    '/quotations/properties/59/rooms/': failure,
    '/quotations/properties/59/measurements/': failure,
    '/quotations/properties/59/measurement-records/': failure,
  }), 59);
  assert.equal(loaded.property.id, 59);
  assert.equal(loaded.customers[0].id, 4);
  assert.equal(loaded.measurementError, 'Saved Area Calculations could not be loaded.');
});

test('successful paginated and plain responses retain all saved records', async () => {
  const loaded = await loadPropertyDetail(client({
    '/quotations/properties/59/rooms/': { results: [{ id: 11 }] },
  }), 59);
  assert.deepEqual(loaded.rooms, [{ id: 11 }]);
  assert.deepEqual(loaded.measurementRecords, [{ id: 3 }]);
  assert.equal(loaded.measurementError, '');
  assert.equal(loaded.customerError, '');
});

test('one failed measurement dependency is unavailable rather than empty history', async () => {
  const loaded = await loadPropertyDetail(client({
    '/quotations/properties/59/measurement-records/': new Error('Server unavailable'),
  }), 59);
  assert.ok(loaded.measurementError);
  assert.deepEqual(loaded.rooms, [{ id: 1 }]);
});

test('a forbidden or missing property still fails the whole page', async () => {
  const denied = Object.assign(new Error('Forbidden'), { status: 403 });
  await assert.rejects(loadPropertyDetail(client({ '/quotations/properties/59/': denied }), 59), error => error === denied);
});

test('customer directory failure does not hide the property or measurement history', async () => {
  const loaded = await loadPropertyDetail(client({ '/quotations/customers/': new Error('Unavailable') }), 59);
  assert.equal(loaded.property.id, 59);
  assert.equal(loaded.measurementError, '');
  assert.ok(loaded.customerError);
});

test('malformed lists are unavailable and a successful retry clears failure state', async () => {
  const broken = await loadPropertyDetail(client({ '/quotations/properties/59/rooms/': {} }), 59);
  assert.ok(broken.measurementError);
  const recovered = await loadPropertyDetail(client(), 59);
  assert.equal(recovered.measurementError, '');
  assert.equal(recovered.measurementRecords.length, 1);
});
