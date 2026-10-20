/** Measurement replay requires activated room/surface idempotency and measurement edit-revision support. */
export function isOfflineMeasurementSyncEnabled(value: unknown) { return value === 'true'; }
export const offlineMeasurementSyncEnabled = isOfflineMeasurementSyncEnabled(process.env.EXPO_PUBLIC_OFFLINE_MEASUREMENTS_ENABLED);
