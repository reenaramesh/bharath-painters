export type SyncQueueState = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'AUTH_REQUIRED';

export type SyncQueueItem = {
  state: SyncQueueState;
  attempts: number;
  retryAt: string | null;
  dependsOn: string | null;
};

export function retryDelayMs(attempts: number) {
  const exponent = Math.max(0, Math.min(10, Math.floor(attempts)));
  return Math.min(15 * 60_000, 1_000 * 2 ** exponent);
}

export function canSyncQueueItem(item: SyncQueueItem, now: number, dependency?: SyncQueueState) {
  if (item.state !== 'PENDING') return false;
  if (item.retryAt && Date.parse(item.retryAt) > now) return false;
  if (item.dependsOn && dependency !== 'SYNCED') return false;
  return true;
}

export function syncFailureState(status: number): SyncQueueState {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 408 || status === 429) return 'PENDING';
  if (status >= 400 && status < 500) return 'CONFLICT';
  return 'PENDING';
}

export function resolveMeasurementChild<T extends { endpoint: string; payload: unknown }>(
  child: T,
  parentResult: unknown,
  localRoomId: string,
): T {
  if (!parentResult || typeof parentResult !== 'object') throw new Error('The saved room could not be linked. Review the pending change.');
  const parent = parentResult as { id?: unknown; measurement_record?: unknown };
  if (!Number.isSafeInteger(parent.id) || !Number.isSafeInteger(parent.measurement_record)) throw new Error('The server did not return the saved room and measurement record IDs.');
  if (!child.payload || typeof child.payload !== 'object' || Array.isArray(child.payload)) throw new Error('The pending surface data is invalid.');
  const payload = child.payload as Record<string, unknown>;
  if (payload.local_room_id !== localRoomId) throw new Error('The pending surface belongs to a different room.');
  const { local_room_id: _localRoomId, ...serverPayload } = payload;
  return {
    ...child,
    endpoint: child.endpoint.replace(/\?new=1$/, `?measurement=${parent.measurement_record}`),
    payload: { ...serverPayload, room: parent.id },
  };
}
