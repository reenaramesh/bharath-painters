// Device-local recovery only. This never creates or updates a server quotation.
export function recoveryKey(userId, pathname, search = '') {
  if (!userId) return null;
  const path = pathname === '/quotations/new-measured' ? '/quotations/new' : pathname;
  const query = new URLSearchParams(search);
  query.sort();
  const source = path.endsWith('/edit') ? '' : query.toString();
  return `bp-quotation-recovery:v1:${userId}:${path}:${source ? `?${source}` : ''}`;
}
function createPointer(key) {
  const match = key?.match(/^(bp-quotation-recovery:v1:[^:]+:)(\/quotations\/new(?:-manual)?):/);
  return match ? `${match[1]}latest-create:${match[2]}` : null;
}
export function clearRecovery(storage, key) {
  try {
    if (!key) return;
    storage.removeItem(key);
    const pointer = createPointer(key);
    if (pointer && storage.getItem(pointer) === key) storage.removeItem(pointer);
  } catch { /* Storage can be disabled. */ }
}
export function readRecovery(storage, key, serverVersion) {
  if (!key) return null;
  try {
    const entry = JSON.parse(storage.getItem(key) || 'null');
    if (!entry) return null;
    const state = entry.state;
    if (entry.version !== 1 || entry.serverVersion !== (serverVersion || null) || !state?.form || !Array.isArray(state.items) || !Array.isArray(state.selectedRoomIds) || !Array.isArray(state.selectedFieldIds) || !Array.isArray(state.specialWalls) || !Array.isArray(state.groupAssignments?.groups) || !Array.isArray(state.groupAssignments?.specials) || ['savedRooms','measurements','measurementRecords'].some(field => state[field] !== undefined && !Array.isArray(state[field])) || !Number.isInteger(state.step) || state.step < 0 || state.step > 2) {
      clearRecovery(storage, key);
      return null;
    }
    return state;
  } catch { clearRecovery(storage, key); return null; }
}
export function writeRecovery(storage, key, state, serverVersion) {
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, serverVersion: serverVersion || null, state }));
    const pointer = createPointer(key);
    if (pointer) storage.setItem(pointer, key);
    return true;
  } catch { return false; }
}

export function openRecovery(storage, tabStorage, userId, pathname, search = '', serverVersion) {
  let key = recoveryKey(userId, pathname, search);
  try {
    const pointer = createPointer(key);
    if (pointer && !search) {
      const latest = storage.getItem(pointer);
      if (latest && createPointer(latest) === pointer) key = latest;
    }
  } catch { /* Editing remains usable with unavailable storage. */ }
  let state = readRecovery(storage, key, serverVersion);
  // Upgrade an existing same-tab recovery copy without discarding unsaved inputs.
  const oldKey = userId ? `bp-quotation-recovery:v1:${userId}:${pathname}:${search || ''}` : null;
  for (const candidate of new Set([key, oldKey])) {
    const tabState = readRecovery(tabStorage, candidate, serverVersion);
    if (!state && tabState && writeRecovery(storage, key, tabState, serverVersion)) state = tabState;
    if (state) clearRecovery(tabStorage, candidate);
  }
  return { key, state };
}
