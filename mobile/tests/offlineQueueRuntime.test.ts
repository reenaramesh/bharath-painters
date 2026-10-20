import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMobileQueue, type QueueDatabase } from '../src/core/offlineQueue.ts';

function sqlite(path = ':memory:') {
  const raw = new DatabaseSync(path);
  const adapter: QueueDatabase = {
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, ...args) { const result = raw.prepare(sql).run(...args); return { changes: Number(result.changes) }; },
    async getFirstAsync<T>(sql: string, ...args: (string | number | null)[]) { return (raw.prepare(sql).get(...args) as T) ?? null; },
    async getAllAsync<T>(sql: string, ...args: (string | number | null)[]) { return raw.prepare(sql).all(...args) as T[]; },
  };
  return { raw, queue: createMobileQueue(async () => adapter) };
}
const endpoint = '/quotations/properties/20/rooms/?measurement=90';
const room = { actorId: 1, kind: 'measurement' as const, endpoint, payload: { name: 'Bedroom' }, expectedVersion: '7', expectedRevision: 4 };
const ack = (revision: number) => ({ id: 71, property: 20, measurement_record: 90, measurement_revision: revision });
const failure = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

test('SQLite upgrade preserves old rows but saved version cannot authorize an existing-record replay', async () => {
  const { raw, queue } = sqlite();
  raw.exec(`CREATE TABLE offline_operations (id TEXT PRIMARY KEY, actor_id INTEGER, kind TEXT, endpoint TEXT, payload TEXT, expected_version TEXT, state TEXT, attempts INTEGER, created_at TEXT, last_error TEXT);
    INSERT INTO offline_operations VALUES ('legacy', 1, 'measurement', '${endpoint}', '{"name":"Old room"}', '7', 'PENDING', 0, '2026-10-17T00:00:00Z', '');`);
  assert.equal((await queue.listMobileOperations(1))[0]?.state, 'CONFLICT', 'legacy changes need review even while measurement sync stays disabled');
  let sends = 0;
  const rows = await queue.flushMobileOperations(1, async () => { sends++; return ack(8); });
  assert.equal(sends, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.expectedVersion, '7');
  assert.equal(rows[0]?.expectedRevision, null);
  assert.equal(rows[0]?.state, 'CONFLICT');
  assert.match(rows[0]?.lastError || '', /revision/i);
  raw.close();
});

test('existing replay sends captured edit revision and stable identity; independent stale work stays stale', async () => {
  const { raw, queue } = sqlite();
  await queue.enqueueMobileOperation({ ...room, clientMutationId: 'first' });
  await queue.enqueueMobileOperation({ ...room, payload: { name: 'Kitchen' }, clientMutationId: 'second' });
  const revisions: unknown[] = [];
  const rows = await queue.flushMobileOperations(1, async operation => {
    const payload = operation.payload as Record<string, unknown>;
    revisions.push(payload.expected_revision);
    assert.equal(payload.idempotency_key, operation.clientMutationId);
    if (revisions.length === 2) throw failure(409);
    return ack(5);
  });
  assert.deepEqual(revisions, [4, 4]);
  assert.deepEqual(rows.map(row => row.state), ['SYNCED', 'CONFLICT']);
  raw.close();
});

test('room plus sibling surface chain uses only persisted acknowledgements and survives restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bharath-mobile-'));
  const path = join(directory, 'queue.db');
  let { raw, queue } = sqlite(path);
  try {
    const parent = await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/rooms/?new=1', expectedRevision: null, localReference: 'local-room:one', clientMutationId: 'room' });
    const surface = { ...room, endpoint: '/quotations/properties/20/measurements/?new=1', payload: { local_room_id: 'local-room:one', name: 'Wall' }, expectedRevision: null, dependsOn: parent.id, localReference: 'local-room:one' };
    const first = await queue.enqueueMobileOperation({ ...surface, clientMutationId: 'surface1' });
    await queue.enqueueMobileOperation({ ...surface, clientMutationId: 'surface2', revisionDependsOn: first.id, payload: { ...surface.payload, name: 'Ceiling' } });
    let sends = 0;
    await queue.flushMobileOperations(1, async operation => {
      sends++;
      if (sends === 1) { assert.equal((operation.payload as Record<string, unknown>).expected_revision, undefined); return ack(1); }
      assert.equal((operation.payload as Record<string, unknown>).expected_revision, 1);
      throw failure(0);
    }, 1000);
    raw.close();
    ({ raw, queue } = sqlite(path));
    const seen: unknown[] = [];
    const rows = await queue.flushMobileOperations(1, async operation => {
      assert.equal(operation.endpoint, '/quotations/properties/20/measurements/?measurement=90');
      const payload = operation.payload as Record<string, unknown>;
      assert.equal(payload.room, 71);
      assert.equal(payload.local_room_id, undefined);
      seen.push(payload.expected_revision);
      return { ...ack(Number(payload.expected_revision) + 1), id: 100 + seen.length, room: 71 };
    }, 3000);
    assert.deepEqual(seen, [1, 2]);
    assert.deepEqual(rows.map(row => row.state), ['SYNCED', 'SYNCED', 'SYNCED']);
    assert.equal(rows[2]?.expectedRevision, 2);
  } finally { raw.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('response loss retries the same mutation and captured revision after durable restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bharath-mobile-loss-'));
  const path = join(directory, 'queue.db');
  let { raw, queue } = sqlite(path);
  try {
    const saved = await queue.enqueueMobileOperation({ ...room, clientMutationId: 'lost-response' });
    let accepted = false;
    const seen: unknown[] = [];
    const send = async (operation: { payload: unknown }) => {
      seen.push(operation.payload);
      if (!accepted) { accepted = true; throw failure(0); }
      return ack(5);
    };
    await queue.flushMobileOperations(1, send, 1000);
    raw.close();
    ({ raw, queue } = sqlite(path));
    await queue.flushMobileOperations(1, send, 3000);
    assert.deepEqual(seen[0], seen[1]);
    const rows = await queue.listMobileOperations(1);
    assert.equal(rows[0]?.id, saved.id);
    assert.equal(rows[0]?.state, 'SYNCED');
    assert.equal(rows[0]?.expectedRevision, 4);
  } finally { raw.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('concurrent flushes send once per actor and never read another actor queue', async () => {
  const { raw, queue } = sqlite();
  await queue.enqueueMobileOperation(room);
  await queue.enqueueMobileOperation({ ...room, actorId: 2 });
  let sends = 0, release!: () => void;
  const send = async () => { sends++; await new Promise<void>(resolve => { release = resolve; }); return ack(5); };
  const first = queue.flushMobileOperations(1, send);
  const second = queue.flushMobileOperations(1, send);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends, 1);
  release();
  await Promise.all([first, second]);
  assert.equal((await queue.listMobileOperations(2))[0]?.state, 'PENDING');
  raw.close();
});

test('429 retries with persisted backoff, auth stops sends, force cannot replay conflicts', async () => {
  const { raw, queue } = sqlite();
  await queue.enqueueMobileOperation(room);
  let sends = 0;
  const rateLimited = await queue.flushMobileOperations(1, async () => { sends++; throw failure(429); }, 1000);
  assert.equal(rateLimited[0]?.state, 'PENDING');
  assert.equal(rateLimited[0]?.retryAt, new Date(2000).toISOString());
  await queue.flushMobileOperations(1, async () => { sends++; return ack(5); }, 1500);
  assert.equal(sends, 1);
  const auth = await queue.flushMobileOperations(1, async () => { throw failure(401); }, 3000);
  assert.equal(auth[0]?.state, 'AUTH_REQUIRED');
  const conflict = await queue.flushMobileOperations(1, async () => { throw failure(409); }, 4000);
  assert.equal(conflict[0]?.state, 'CONFLICT');
  await queue.flushMobileOperations(1, async () => { sends++; return ack(5); }, 5000, true);
  assert.equal(sends, 1);
  raw.close();
});

test('missing or mismatched parent ownership is a review conflict without a send', async () => {
  for (const mismatch of ['property', 'record', 'missing']) {
    const { raw, queue } = sqlite();
    const parent = await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/rooms/?new=1', expectedRevision: null, localReference: 'local-room:one' });
    await queue.flushMobileOperations(1, async () => ack(1));
    if (mismatch === 'missing') raw.prepare('DELETE FROM offline_operations WHERE id = ?').run(parent.id);
    await queue.enqueueMobileOperation({ ...room, endpoint: `/quotations/properties/${mismatch === 'property' ? 21 : 20}/measurements/?measurement=${mismatch === 'record' ? 99 : 90}`, payload: { local_room_id: 'local-room:one' }, expectedRevision: null, dependsOn: parent.id, localReference: 'local-room:one' });
    let sends = 0;
    const rows = await queue.flushMobileOperations(1, async () => { sends++; return ack(2); });
    assert.equal(sends, 0);
    assert.equal(rows.at(-1)?.state, 'CONFLICT');
    raw.close();
  }
});

test('a revision dependency cannot substitute an unrelated independently captured base revision', async () => {
  const { raw, queue } = sqlite();
  const parent = await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/rooms/?new=1', expectedRevision: null, localReference: 'local-room:one' });
  await queue.flushMobileOperations(1, async () => ack(1));
  await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/measurements/?measurement=90', payload: { room: 71 }, expectedRevision: 77, revisionDependsOn: parent.id });
  const seen: unknown[] = [];
  const rows = await queue.flushMobileOperations(1, async operation => { seen.push(operation.payload); return ack(78); });
  assert.equal(seen.length, 0);
  assert.equal(rows.at(-1)?.state, 'CONFLICT');
  raw.close();
});

test('unverifiable acknowledgement stops a dependent chain for review', async () => {
  for (const result of [{ ...ack(5), measurement_revision: 0 }, { ...ack(5), property: 21 }, { ...ack(5), measurement_revision: undefined }, { ...ack(5), measurement_revision: 9 }, { ...ack(5), id: 0 }]) {
    const { raw, queue } = sqlite();
    const parent = await queue.enqueueMobileOperation({ ...room, localReference: 'local-room:one' });
    await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/measurements/?measurement=90', payload: { local_room_id: 'local-room:one' }, expectedRevision: null, dependsOn: parent.id, localReference: 'local-room:one' });
    let sends = 0;
    const rows = await queue.flushMobileOperations(1, async () => { sends++; return result; });
    assert.equal(sends, 1);
    assert.deepEqual(rows.map(row => row.state), ['CONFLICT', 'CONFLICT']);
    raw.close();
  }
});

test('replay cannot select an implicit current measurement even with a numeric revision', async () => {
  const { raw, queue } = sqlite();
  await queue.enqueueMobileOperation({ ...room, endpoint: '/quotations/properties/20/rooms/' });
  let sends = 0;
  const rows = await queue.flushMobileOperations(1, async () => { sends++; return ack(5); });
  assert.equal(sends, 0);
  assert.equal(rows[0]?.state, 'CONFLICT');
  raw.close();
});
