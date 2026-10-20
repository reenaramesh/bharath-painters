import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOfflineOperation, offlineOperationReviewPath } from './offlineOperationQueue.js';

test('allows an idempotent new measurement surface operation to queue offline', () => {
  assert.equal(isAllowedOfflineOperation({
    actorId: 4,
    kind: 'measurement',
    endpoint: '/quotations/properties/20/measurements/?new=1',
    method: 'POST',
    payload: { idempotency_key: 'request-1', room: 3, length: 10 },
  }), true);
  assert.equal(isAllowedOfflineOperation({
    actorId: 4,
    kind: 'measurement',
    endpoint: '/quotations/properties/20/measurements/?new=1',
    method: 'POST',
    payload: { room: 3, length: 10 },
  }), false);
});
test('allows an idempotent new measurement room operation to queue offline', () => {
  assert.equal(isAllowedOfflineOperation({
    actorId: 4,
    kind: 'measurement',
    endpoint: '/quotations/properties/20/rooms/?new=1',
    method: 'POST',
    payload: { idempotency_key: 'room-request-1', name: 'Kitchen' },
  }), true);
});
test('routes a failed room operation to its property measurement workspace', () => {
  assert.equal(offlineOperationReviewPath({
    kind: 'measurement', endpoint: '/quotations/properties/20/rooms/?new=1',
  }), '/properties/20/measurements');
});
test('routes surface update conflicts to their originating saved measurement', () => {
  assert.equal(offlineOperationReviewPath({
    kind: 'measurement', endpoint: '/quotations/measurements/88/', reviewPath: '/properties/20/measurements?measurement=7',
  }), '/properties/20/measurements?measurement=7');
});
