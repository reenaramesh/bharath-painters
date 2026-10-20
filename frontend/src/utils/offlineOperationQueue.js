/** @typedef {import('../types/contracts').WebOfflineOperationContract} OfflineOperation */
/** @typedef {import('../types/contracts').OfflineRecordKind} OfflineRecordKind */
/** @typedef {{ actorId: number | string, kind: OfflineRecordKind, endpoint: string, method?: 'POST' | 'PATCH', payload?: Record<string, unknown> | null, reviewPath?: string | null, expectedVersion?: number | null, dedupeKey?: string }} OfflineOperationInput */
/** @typedef {{ response?: { status?: number, data?: { detail?: unknown } }, status?: number, message?: string }} OfflineSendError */

const DATABASE = "bharath-offline-operations-v1";
const STORE = "operations";
const ALLOWED = new Set(["measurement", "attendance"]);
const createId = () => globalThis.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random().toString(16).slice(2);

/** @template T @param {IDBRequest<T>} request @returns {Promise<T>} */
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage could not be read."));
  });
}

/** @returns {Promise<IDBDatabase>} */
function openDatabase() {
  if (typeof indexedDB === "undefined") throw new Error("Persistent offline storage is unavailable in this browser.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("actorId", "actorId");
        store.createIndex("dedupeKey", "dedupeKey", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage could not be opened."));
  });
}

/** @template T @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => Promise<T>} action @returns {Promise<T>} */
async function transact(mode, action) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Offline storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Offline storage transaction was cancelled."));
    });
    const result = await action(store);
    await finished;
    return result;
  } finally { db.close(); }
}

/** @param {OfflineOperationInput} input */
function validOperation(input) {
  if (!input || !ALLOWED.has(input.kind) || !Number.isInteger(Number(input.actorId)) || !input.actorId) throw new Error("Only signed-in measurement and attendance changes can be queued.");
  if (typeof input.endpoint !== "string" || !input.endpoint.startsWith("/")) throw new Error("A same-origin API path is required.");
  if (input.kind === "attendance" && !/^\/(?:api\/)?jobs\/in-house-applicators\/\d+\/attendance\/$/.test(input.endpoint)) throw new Error("This attendance endpoint cannot be queued.");
  if (input.kind === "measurement" && !/^\/(?:api\/)?quotations\/(?:properties\/\d+\/(?:measurements\/(?:\?(?:measurement=\d+|new=1))?|rooms\/(?:\?(?:measurement=\d+|new=1))?)|measurements\/\d+\/)$/.test(input.endpoint)) throw new Error("This measurement endpoint cannot be queued.");
  if (input.kind === "measurement" && input.method !== "PATCH" && !String(input.payload?.idempotency_key || "").trim()) throw new Error("New offline measurement surfaces require an idempotency key.");
  if (input.reviewPath && !(input.kind === "measurement" ? /^\/properties\/\d+\/measurements(?:\?measurement=\d+)?$/.test(input.reviewPath) : /^\/in-house-applicators\/\d+$/.test(input.reviewPath))) throw new Error("This offline review route is not supported.");
}

/** @param {unknown} input */
export function isAllowedOfflineOperation(input) {
  try { validOperation(/** @type {OfflineOperationInput} */ (input)); return true; }
  catch { return false; }
}

/** @param {{ kind?: string, endpoint?: string, reviewPath?: string | null } | null | undefined} operation @returns {string | null} */
export function offlineOperationReviewPath(operation) {
  if (!operation || typeof operation.endpoint !== "string") return null;
  const endpoint = operation.endpoint.replace(/^\/api(?=\/)/, "");
  const property = /^\/quotations\/properties\/(\d+)\/(?:rooms|measurements)\/(?:\?(?:measurement=(\d+)|new=1))?$/.exec(endpoint);
  if (operation.reviewPath && (operation.kind === "measurement" ? /^\/properties\/\d+\/measurements(?:\?measurement=\d+)?$/.test(operation.reviewPath) : /^\/in-house-applicators\/\d+$/.test(operation.reviewPath))) return operation.reviewPath;
  if (operation.kind === "measurement" && property) return `/properties/${property[1]}/measurements${property[2] ? `?measurement=${property[2]}` : ""}`;
  const attendance = /^\/jobs\/in-house-applicators\/(\d+)\/attendance\/$/.exec(endpoint);
  if (operation.kind === "attendance" && attendance) return `/in-house-applicators/${attendance[1]}`;
  return null;
}

/** @param {OfflineOperationInput} input @returns {Promise<OfflineOperation>} */
export async function enqueueOfflineOperation(input) {
  validOperation(input);
  const key = `${input.actorId}:${input.kind}:${input.dedupeKey || createId()}`;
  const operation = {
    id: createId(), dedupeKey: key, actorId: Number(input.actorId), kind: input.kind,
    endpoint: input.endpoint, method: input.method || "POST", payload: input.payload, reviewPath: input.reviewPath || null,
    expectedVersion: input.expectedVersion || null, state: "PENDING", attempts: 0,
    createdAt: new Date().toISOString(), lastError: "",
  };
  return transact("readwrite", async store => {
    const existing = await requestResult(store.index("dedupeKey").get(key));
    if (existing) {
      const updated = { ...existing, payload: input.payload, reviewPath: input.reviewPath || existing.reviewPath || null, expectedVersion: existing.expectedVersion || input.expectedVersion || null, attempts: 0, lastError: "" };
      await requestResult(store.put(updated));
      return updated;
    }
    await requestResult(store.add(operation));
    return operation;
  });
}

/** @param {number | string} actorId @returns {Promise<OfflineOperation[]>} */
export async function listOfflineOperations(actorId) {
  if (!actorId) return [];
  return transact("readonly", async store => requestResult(store.index("actorId").getAll(Number(actorId))));
}

/** @param {OfflineOperation} operation @returns {Promise<OfflineOperation>} */
async function updateOperation(operation) {
  return transact("readwrite", async store => {
    await requestResult(store.put(operation));
    return operation;
  });
}

/** @param {number | string} actorId @param {(operation: OfflineOperation) => Promise<unknown>} send @returns {Promise<OfflineOperation[]>} */
export async function flushOfflineOperations(actorId, send) {
  if (!actorId || typeof send !== "function" || globalThis.navigator?.onLine === false) return listOfflineOperations(actorId);
  const allRows = await listOfflineOperations(actorId);
  for (const row of allRows.filter(item => item.state === "AUTH_REQUIRED")) await updateOperation({ ...row, state: "PENDING", lastError: "" });
  const rows = allRows.filter(row => row.state === "PENDING" || row.state === "AUTH_REQUIRED").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const operation of rows) {
    try {
      await send(operation);
      await updateOperation({ ...operation, state: "SYNCED", attempts: operation.attempts + 1, syncedAt: new Date().toISOString(), lastError: "" });
    } catch (error) {
      const sendError = /** @type {OfflineSendError | null | undefined} */ (error);
      const code = Number(sendError?.response?.status || sendError?.status || 0);
      if (code === 401) {
        await updateOperation({ ...operation, state: "AUTH_REQUIRED", attempts: operation.attempts + 1, lastError: "Sign in again to sync this saved change." });
        break;
      }
      const state = code >= 400 && code < 500 ? "CONFLICT" : "PENDING";
      await updateOperation({ ...operation, state, attempts: operation.attempts + 1, lastError: String(sendError?.response?.data?.detail || sendError?.message || "Sync will retry when connected.") });
      if (state === "PENDING") break;
    }
  }
  return listOfflineOperations(actorId);
}

/** @param {number | string} actorId */
export async function clearSyncedOfflineOperations(actorId) {
  if (!actorId) return;
  const rows = (await listOfflineOperations(actorId)).filter(row => row.state === "SYNCED");
  await transact("readwrite", async store => { await Promise.all(rows.map(row => requestResult(store.delete(row.id)))); });
}

/** @param {number | string} actorId @param {string} operationId @returns {Promise<boolean>} */
export async function discardOfflineConflict(actorId, operationId) {
  if (!actorId || !operationId) return false;
  return transact("readwrite", async store => {
    const operation = await requestResult(store.get(operationId));
    if (!operation || operation.actorId !== Number(actorId) || operation.state !== "CONFLICT") return false;
    await requestResult(store.delete(operationId));
    return true;
  });
}
