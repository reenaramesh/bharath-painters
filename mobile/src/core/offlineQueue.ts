import { canSyncQueueItem, resolveMeasurementChild, retryDelayMs, syncFailureState } from './offlineSync.ts';
import { isAllowedMobileOperation, type OfflineKind } from './offlineQueuePolicy.ts';

export type { OfflineKind } from './offlineQueuePolicy.ts';
export type OfflineState = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'AUTH_REQUIRED';
export type OfflineOperation = {
  id: string; clientMutationId: string; actorId: number; kind: OfflineKind; endpoint: string; payload: unknown;
  /** Saved document version is retained for old rows; it never authorizes a replay. */
  expectedVersion: string | null; expectedRevision: number | null;
  dependsOn: string | null; revisionDependsOn: string | null; localReference: string | null;
  result: unknown; state: OfflineState; attempts: number; retryAt: string | null;
  createdAt: string; updatedAt: string; lastError: string;
};
type StoredOperation = Omit<OfflineOperation, 'payload' | 'result'> & { payload: string; result: string | null };
type Value = string | number | null;
/** The subset shared by Expo SQLite and the real SQLite test adapter. */
export interface QueueDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Value[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: Value[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: Value[]): Promise<T | null>;
}
type EnqueueInput = Omit<OfflineOperation, 'id' | 'clientMutationId' | 'dependsOn' | 'revisionDependsOn' | 'localReference' | 'expectedRevision' | 'state' | 'attempts' | 'createdAt' | 'updatedAt' | 'retryAt' | 'lastError' | 'result'> & {
  clientMutationId?: string; dependsOn?: string | null; revisionDependsOn?: string | null;
  localReference?: string | null; expectedRevision?: number | null;
};
const columns = 'id, client_mutation_id AS clientMutationId, actor_id AS actorId, kind, endpoint, payload, expected_version AS expectedVersion, expected_revision AS expectedRevision, depends_on AS dependsOn, revision_depends_on AS revisionDependsOn, local_reference AS localReference, result_json AS result, state, attempts, retry_after AS retryAt, created_at AS createdAt, updated_at AS updatedAt, last_error AS lastError';
const revisionValid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const review = (message: string) => Object.assign(new Error(message), { status: 409 });
function createId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function decode(row: StoredOperation): OfflineOperation {
  return { ...row, payload: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null,
    expectedRevision: revisionValid(row.expectedRevision) ? row.expectedRevision : null,
    clientMutationId: row.clientMutationId || row.id, dependsOn: row.dependsOn || null,
    revisionDependsOn: row.revisionDependsOn || row.dependsOn || null,
    localReference: row.localReference || null, retryAt: row.retryAt || null, updatedAt: row.updatedAt || row.createdAt };
}
function target(endpoint: string) {
  const match = /^\/quotations\/properties\/(\d+)\/(rooms|measurements)\/(?:\?(?:measurement=(\d+)|new=1))?$/.exec(endpoint);
  return { property: match ? Number(match[1]) : null, record: match?.[3] ? Number(match[3]) : null,
    newRoom: !!match && match[2] === 'rooms' && endpoint.endsWith('?new=1') };
}
function acknowledgement(operation: OfflineOperation, result: unknown) {
  const saved = result as { id?: number; property?: number; measurement_record?: number; measurement_revision?: number; room?: number } | null;
  const location = target(operation.endpoint);
  if (!saved || !Number.isSafeInteger(saved.id) || Number(saved.id) <= 0 || !Number.isSafeInteger(saved.property) || Number(saved.property) <= 0 || !Number.isSafeInteger(saved.measurement_record) || Number(saved.measurement_record) <= 0
    || !revisionValid(saved.measurement_revision) || saved.measurement_revision < 1
    || (!location.newRoom && revisionValid(operation.expectedRevision) && saved.measurement_revision !== operation.expectedRevision + 1)
    || (location.property !== null && location.property !== saved.property)
    || (location.record !== null && location.record !== saved.measurement_record)) {
    throw review('The server acknowledgement could not be verified for this property and measurement. Review the saved change.');
  }
  return saved as Required<Pick<typeof saved, 'id' | 'property' | 'measurement_record' | 'measurement_revision'>> & { room?: number };
}

export function createMobileQueue(openDatabase: () => Promise<QueueDatabase>) {
  let database: Promise<QueueDatabase> | null = null;
  const flushes = new Map<number, Promise<OfflineOperation[]>>();
  let enqueueTail: Promise<unknown> = Promise.resolve();
  async function openQueue() {
    database ||= (async () => {
      const db = await openDatabase();
      await db.execAsync(`CREATE TABLE IF NOT EXISTS offline_operations (
        id TEXT PRIMARY KEY NOT NULL, actor_id INTEGER NOT NULL, kind TEXT NOT NULL,
        endpoint TEXT NOT NULL, payload TEXT NOT NULL, expected_version TEXT,
        state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
        client_mutation_id TEXT, depends_on TEXT, local_reference TEXT,
        result_json TEXT, retry_after TEXT, updated_at TEXT, expected_revision INTEGER, revision_depends_on TEXT
      ); CREATE INDEX IF NOT EXISTS offline_operations_actor_state ON offline_operations(actor_id, state);
      CREATE TABLE IF NOT EXISTS offline_measurement_contexts (
        actor_id INTEGER NOT NULL, property_id INTEGER NOT NULL, context_json TEXT NOT NULL,
        updated_at TEXT NOT NULL, PRIMARY KEY (actor_id, property_id)
      );`);
      const existing = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(offline_operations)')).map(column => column.name));
      for (const [name, type] of [['client_mutation_id', 'TEXT'], ['depends_on', 'TEXT'], ['local_reference', 'TEXT'],
        ['result_json', 'TEXT'], ['retry_after', 'TEXT'], ['updated_at', 'TEXT'], ['expected_revision', 'INTEGER'], ['revision_depends_on', 'TEXT']]) {
        if (!existing.has(name!)) await db.execAsync(`ALTER TABLE offline_operations ADD COLUMN ${name} ${type}`);
      }
      await db.runAsync('UPDATE offline_operations SET client_mutation_id = id WHERE client_mutation_id IS NULL');
      await db.runAsync('UPDATE offline_operations SET updated_at = created_at WHERE updated_at IS NULL');
      await db.runAsync("UPDATE offline_operations SET state = 'CONFLICT', last_error = 'This offline change has no trustworthy edit revision. Review the server record and re-enter the change.' WHERE kind = 'measurement' AND state IN ('PENDING', 'AUTH_REQUIRED') AND expected_revision IS NULL AND depends_on IS NULL AND revision_depends_on IS NULL AND endpoint NOT LIKE '%/rooms/?new=1'");
      await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS offline_operations_actor_mutation ON offline_operations(actor_id, client_mutation_id)');
      return db;
    })();
    return database;
  }
  function enqueueMobileOperation(input: EnqueueInput): Promise<OfflineOperation> {
    const pending = enqueueTail.catch(() => {}).then(() => enqueue(input));
    enqueueTail = pending;
    return pending;
  }
  async function enqueue(input: EnqueueInput) {
    if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0 || !isAllowedMobileOperation(input.kind, input.endpoint)) throw new Error('This operation cannot be saved offline.');
    if (input.dependsOn && (!input.localReference || input.kind !== 'measurement')) throw new Error('The parent link for this offline change is invalid.');
    const db = await openQueue();
    const mutationId = input.clientMutationId || createId();
    const same = await db.getFirstAsync<StoredOperation>(`SELECT ${columns} FROM offline_operations WHERE actor_id = ? AND client_mutation_id = ? LIMIT 1`, input.actorId, mutationId);
    if (same) return decode(same);
    const serialized = JSON.stringify(input.payload);
    const expectedRevision = revisionValid(input.expectedRevision) ? input.expectedRevision : null;
    const dependsOn = input.dependsOn || null;
    const revisionDependsOn = input.revisionDependsOn || dependsOn;
    const duplicate = await db.getFirstAsync<StoredOperation>(`SELECT ${columns} FROM offline_operations WHERE actor_id = ? AND kind = ? AND endpoint = ? AND payload = ? AND expected_revision IS ? AND depends_on IS ? AND revision_depends_on IS ? AND state = 'PENDING' LIMIT 1`, input.actorId, input.kind, input.endpoint, serialized, expectedRevision, dependsOn, revisionDependsOn);
    if (duplicate) return decode(duplicate);
    const now = new Date().toISOString();
    const operation: OfflineOperation = { ...input, expectedRevision, dependsOn, revisionDependsOn, clientMutationId: mutationId,
      localReference: input.localReference || null, id: createId(), result: null, state: 'PENDING', attempts: 0,
      retryAt: null, createdAt: now, updatedAt: now, lastError: '' };
    await db.runAsync(`INSERT INTO offline_operations (id, client_mutation_id, actor_id, kind, endpoint, payload, expected_version, expected_revision, depends_on, revision_depends_on, local_reference, state, attempts, created_at, updated_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '')`, operation.id, mutationId, operation.actorId, operation.kind, operation.endpoint, serialized, operation.expectedVersion, expectedRevision, dependsOn, revisionDependsOn, operation.localReference, operation.state, now, now);
    return operation;
  }
  async function listMobileOperations(actorId: number) {
    const db = await openQueue();
    return (await db.getAllAsync<StoredOperation>(`SELECT ${columns} FROM offline_operations WHERE actor_id = ? ORDER BY created_at, rowid`, actorId)).map(decode);
  }
  async function cacheMeasurementContext(actorId: number, propertyId: number, context: unknown) {
    if (!Number.isSafeInteger(actorId) || actorId <= 0 || !Number.isSafeInteger(propertyId) || propertyId <= 0) return;
    const db = await openQueue();
    await db.runAsync('INSERT OR REPLACE INTO offline_measurement_contexts (actor_id, property_id, context_json, updated_at) VALUES (?, ?, ?, ?)', actorId, propertyId, JSON.stringify(context), new Date().toISOString());
  }
  async function listCachedMeasurementContexts(actorId: number) {
    const db = await openQueue();
    const rows = await db.getAllAsync<{ propertyId: number; context: string }>('SELECT property_id AS propertyId, context_json AS context FROM offline_measurement_contexts WHERE actor_id = ? ORDER BY updated_at DESC', actorId);
    return rows.map(row => ({ propertyId: row.propertyId, context: JSON.parse(row.context) as unknown }));
  }
  async function getCachedMeasurementContext(actorId: number, propertyId: number) {
    const db = await openQueue();
    const row = await db.getFirstAsync<{ context: string }>('SELECT context_json AS context FROM offline_measurement_contexts WHERE actor_id = ? AND property_id = ?', actorId, propertyId);
    return row ? JSON.parse(row.context) as unknown : null;
  }
  async function discardMobileConflict(actorId: number, operationId: string) {
    const db = await openQueue();
    await db.runAsync("UPDATE offline_operations SET state = 'CONFLICT', last_error = 'The parent offline measurement was discarded. Review and re-enter this dependent change.', updated_at = ? WHERE actor_id = ? AND (depends_on = ? OR revision_depends_on = ?) AND state IN ('PENDING', 'AUTH_REQUIRED')", new Date().toISOString(), actorId, operationId, operationId);
    return (await db.runAsync("DELETE FROM offline_operations WHERE id = ? AND actor_id = ? AND state = 'CONFLICT'", operationId, actorId)).changes === 1;
  }
  async function flush(actorId: number, send: (operation: OfflineOperation) => Promise<unknown>, now: number, force: boolean, allowedKinds: OfflineKind[]) {
    const db = await openQueue();
    await db.runAsync("UPDATE offline_operations SET state = 'PENDING', last_error = '', updated_at = ? WHERE actor_id = ? AND state = 'AUTH_REQUIRED'", new Date(now).toISOString(), actorId);
    if (force) await db.runAsync("UPDATE offline_operations SET retry_after = NULL WHERE actor_id = ? AND state = 'PENDING'", actorId);
    const operations = await listMobileOperations(actorId);
    const byId = new Map(operations.map(row => [row.id, row]));
    for (const row of operations) {
      if (!allowedKinds.includes(row.kind) || row.state !== 'PENDING') continue;
      try {
        if (!isAllowedMobileOperation(row.kind, row.endpoint)) throw review('This saved endpoint cannot be replayed. Review the pending change.');
        const parent = row.dependsOn ? byId.get(row.dependsOn) : undefined;
        const predecessor = row.revisionDependsOn ? byId.get(row.revisionDependsOn) : undefined;
        if ((row.dependsOn && (!parent || parent.state === 'CONFLICT')) || (row.revisionDependsOn && (!predecessor || predecessor.state === 'CONFLICT'))) throw review('The parent offline change is missing or needs review. Review this dependent change.');
        if (!canSyncQueueItem(row, now, parent?.state) || (predecessor && predecessor.state !== 'SYNCED')) continue;
        let outgoing = { ...row };
        if (row.kind === 'measurement') {
          if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) throw review('The saved measurement data needs review.');
          if (parent) {
            const saved = acknowledgement(parent, parent.result);
            const location = target(row.endpoint);
            if (!parent.endpoint.includes('/rooms/') || parent.localReference !== row.localReference || location.property !== saved.property || (location.record && location.record !== saved.measurement_record)) throw review('The pending surface belongs to a different property, measurement, or room.');
            const payload = row.payload as Record<string, unknown>;
            if ('local_room_id' in payload) outgoing = resolveMeasurementChild(outgoing, saved, row.localReference!);
            else if (payload.room !== saved.id) throw review('The pending surface belongs to a different room.');
          }
          if (predecessor) {
            const saved = acknowledgement(predecessor, predecessor.result);
            const location = target(outgoing.endpoint);
            if (location.property !== saved.property || location.record !== saved.measurement_record) throw review('The revision dependency belongs to a different measurement.');
            // Once persisted, a retry never changes its precondition, even after a restart.
            if (outgoing.expectedRevision === null) outgoing.expectedRevision = saved.measurement_revision;
            else if (outgoing.expectedRevision !== saved.measurement_revision) throw review('The saved edit revision does not match its acknowledged dependency. Review the pending change.');
          }
          const isNew = target(outgoing.endpoint).newRoom;
          if (!isNew && target(outgoing.endpoint).record === null) throw review('This offline change does not identify its measurement record. Review the saved change.');
          if (!isNew && !revisionValid(outgoing.expectedRevision)) throw review('This offline change has no trustworthy edit revision. Review the server record and re-enter the change.');
          const payload = { ...(outgoing.payload as Record<string, unknown>), idempotency_key: outgoing.clientMutationId };
          delete (payload as Record<string, unknown>).expected_revision;
          outgoing.payload = isNew ? payload : { ...payload, expected_revision: outgoing.expectedRevision };
          // Persist resolution before the request, so response-loss retries use exactly this mutation.
          await db.runAsync('UPDATE offline_operations SET endpoint = ?, payload = ?, expected_revision = ? WHERE id = ? AND actor_id = ?', outgoing.endpoint, JSON.stringify(outgoing.payload), outgoing.expectedRevision, row.id, actorId);
          row.endpoint = outgoing.endpoint; row.payload = outgoing.payload; row.expectedRevision = outgoing.expectedRevision;
        }
        const result = await send(outgoing);
        if (row.kind === 'measurement') acknowledgement(outgoing, result);
        const updatedAt = new Date().toISOString();
        await db.runAsync("UPDATE offline_operations SET state = 'SYNCED', attempts = attempts + 1, last_error = '', retry_after = NULL, result_json = ?, updated_at = ? WHERE id = ? AND actor_id = ?", JSON.stringify(result ?? null), updatedAt, row.id, actorId);
        row.state = 'SYNCED'; row.result = result ?? null; row.updatedAt = updatedAt; row.attempts += 1; row.retryAt = null;
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
        const state = syncFailureState(status);
        const attempts = row.attempts + 1;
        const retryAt = state === 'PENDING' ? new Date(now + retryDelayMs(row.attempts)).toISOString() : null;
        const message = error instanceof Error ? error.message : 'Sync will retry when connected.';
        await db.runAsync('UPDATE offline_operations SET state = ?, attempts = ?, last_error = ?, retry_after = ?, updated_at = ? WHERE id = ? AND actor_id = ?', state, attempts, message, retryAt, new Date().toISOString(), row.id, actorId);
        row.state = state; row.attempts = attempts; row.lastError = message; row.retryAt = retryAt;
        if (state === 'AUTH_REQUIRED' || state === 'PENDING') break;
      }
    }
    return listMobileOperations(actorId);
  }
  function flushMobileOperations(actorId: number, send: (operation: OfflineOperation) => Promise<unknown>, now = Date.now(), force = false, allowedKinds: OfflineKind[] = ['measurement', 'attendance']) {
    const active = flushes.get(actorId);
    if (active) return active;
    const pending = flush(actorId, send, now, force, allowedKinds).finally(() => { if (flushes.get(actorId) === pending) flushes.delete(actorId); });
    flushes.set(actorId, pending);
    return pending;
  }
  return { enqueueMobileOperation, listMobileOperations, cacheMeasurementContext, listCachedMeasurementContexts, getCachedMeasurementContext, discardMobileConflict, flushMobileOperations };
}
const queue = createMobileQueue(async () => (await import('expo-sqlite')).openDatabaseAsync('bharath-offline-v1.db'));
export const { enqueueMobileOperation, listMobileOperations, cacheMeasurementContext, listCachedMeasurementContexts, getCachedMeasurementContext, discardMobileConflict, flushMobileOperations } = queue;
