import test from 'node:test';
import assert from 'node:assert/strict';
import { canSyncQueueItem, resolveMeasurementChild, retryDelayMs, syncFailureState } from '../src/core/offlineSync.ts';
import { isOfflineMeasurementSyncEnabled } from '../src/core/phase4Capabilities.ts';

test('measurement replay stays safely disabled until server idempotency schema is activated', () => {
  assert.equal(isOfflineMeasurementSyncEnabled(undefined), false);
  assert.equal(isOfflineMeasurementSyncEnabled('false'), false);
  assert.equal(isOfflineMeasurementSyncEnabled('true'), true);
});

test('offline queue backs off transient retries and caps delay', () => {
  assert.equal(retryDelayMs(0), 1_000);
  assert.equal(retryDelayMs(3), 8_000);
  assert.equal(retryDelayMs(20), 15 * 60_000);
});

test('queued children wait for a successful parent and their retry time', () => {
  const item = { state: 'PENDING' as const, attempts: 1, retryAt: '2026-10-17T10:00:00Z', dependsOn: 'room-op' };
  assert.equal(canSyncQueueItem(item, Date.parse('2026-10-17T09:59:00Z'), 'SYNCED'), false);
  assert.equal(canSyncQueueItem(item, Date.parse('2026-10-17T10:01:00Z'), 'CONFLICT'), false);
  assert.equal(canSyncQueueItem(item, Date.parse('2026-10-17T10:01:00Z'), 'SYNCED'), true);
  assert.equal(canSyncQueueItem({ ...item, dependsOn: null }, Date.parse('2026-10-17T10:01:00Z')), true);
});

test('401 requires authentication, other client errors need review, server errors retry', () => {
  assert.equal(syncFailureState(401), 'AUTH_REQUIRED');
  assert.equal(syncFailureState(409), 'CONFLICT');
  assert.equal(syncFailureState(422), 'CONFLICT');
  assert.equal(syncFailureState(503), 'PENDING');
});

test('measurement surface uses the confirmed room and record IDs returned by the server', () => {
  const child = { endpoint: '/quotations/properties/20/measurements/?new=1', payload: { local_room_id: 'local-room-1', length: '10.00' } };
  assert.deepEqual(resolveMeasurementChild(child, { id: 71, measurement_record: 90 }, 'local-room-1'), {
    endpoint: '/quotations/properties/20/measurements/?measurement=90', payload: { length: '10.00', room: 71 },
  });
  assert.throws(() => resolveMeasurementChild(child, { id: 71, measurement_record: 90 }, 'other-room'), /different room/);
  assert.throws(() => resolveMeasurementChild(child, { id: 71 }, 'local-room-1'), /IDs/);
});
