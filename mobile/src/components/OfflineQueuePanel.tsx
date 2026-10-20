import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Button, Text, useTheme } from 'react-native-paper';
import * as Network from 'expo-network';
import { api } from '../providers/AppProvider';
import { discardMobileConflict, flushMobileOperations, listMobileOperations } from '../core/offlineQueue';
import { mobileOperationReviewPath } from '../core/offlineQueuePolicy';
import { offlineMeasurementSyncEnabled } from '../core/phase4Capabilities';
import { tokens } from '../theme';
import { useApp } from '../providers/AppProvider';

export function OfflineQueuePanel({ actorId, refreshKey = 0 }: { actorId?: number; refreshKey?: number }) {
  const { user } = useApp();
  const theme = useTheme();
  const [operations, setOperations] = useState<Awaited<ReturnType<typeof listMobileOperations>>>([]);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentActorId = useRef(actorId);
  useLayoutEffect(() => { currentActorId.current = actorId; }, [actorId]);
  const refresh = useCallback(async () => {
    if (!actorId) return;
    try { const rows = await listMobileOperations(actorId); if (currentActorId.current === actorId) setOperations(rows); }
    catch { if (currentActorId.current === actorId) setOperations([]); }
  }, [actorId]);
  const sync = useCallback(async (force = false) => {
    if (!actorId || currentActorId.current !== actorId) return;
    setBusy(true);
    try {
      const send = api.createSessionSender();
      const state = await Network.getNetworkStateAsync();
      if (currentActorId.current !== actorId) return;
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
      if (state.isConnected && state.isInternetReachable !== false) {
        await flushMobileOperations(actorId, operation => {
          if (currentActorId.current !== actorId) throw Object.assign(new Error('Account changed. Sign in to sync this account’s saved changes.'), { status: 401 });
          return send(operation.endpoint, operation.payload);
        }, Date.now(), force, offlineMeasurementSyncEnabled ? ['measurement', 'attendance'] : ['attendance']);
      }
      await refresh();
    } finally { setBusy(false); }
  }, [actorId, refresh, refreshKey]);
  useEffect(() => {
    void sync();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    const network = Network.addNetworkStateListener(state => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected) void sync();
    });
    return () => { subscription.remove(); network.remove(); };
  }, [sync]);
  const pending = operations.filter(item => item.state === 'PENDING').length;
  const synced = operations.filter(item => item.state === 'SYNCED').length;
  const conflict = operations.filter(item => item.state === 'CONFLICT').length;
  const authRequired = operations.filter(item => item.state === 'AUTH_REQUIRED').length;
  const gatedMeasurements = operations.filter(item => item.kind === 'measurement' && item.state === 'PENDING').length;
  const retryable = operations.some(item => item.kind === 'attendance' && (item.state === 'PENDING' || item.state === 'AUTH_REQUIRED'))
    || (offlineMeasurementSyncEnabled && operations.some(item => item.kind === 'measurement' && (item.state === 'PENDING' || item.state === 'AUTH_REQUIRED')));
  if (!operations.length && online) return null;
  return <View accessibilityLiveRegion="polite" style={{ gap: tokens.space.xs, padding: tokens.space.md, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }}>
    <Text variant="titleSmall">{online ? 'Connected' : 'Offline changes'}</Text>
    <Text variant="bodySmall">Pending {pending} · Synced {synced} · Conflict {conflict} · Sign-in needed {authRequired}</Text>
    {authRequired > 0 && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>Sign in again, then retry to sync saved changes.</Text>}
    {!offlineMeasurementSyncEnabled && gatedMeasurements > 0 && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>Measurement sync is paused until server idempotency and edit revision support are activated. Your saved entries remain on this device.</Text>}
    {conflict > 0 && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>Some changes need review. Resolve the conflict before submitting again.</Text>}
    {operations.filter(item => item.state === 'CONFLICT').map(item => <View key={item.id} style={{ gap: 4, paddingVertical: 6 }}>
      <Text variant="labelLarge">{item.kind === 'measurement' ? 'Measurement conflict' : 'Attendance conflict'} · {new Date(item.createdAt).toLocaleString()}</Text>
      <Text variant="bodySmall">{item.lastError || 'The server rejected this queued change. Review the current record before deciding what to do.'}</Text>
      <Button mode="outlined" onPress={() => router.push((mobileOperationReviewPath(item.kind, item.endpoint, user?.role) || (item.kind === 'measurement' ? '/module/measurements' : user?.role === 'PAINTER' ? '/role?tab=EARNINGS' : '/module/employees')) as Href)}>Open {item.kind === 'measurement' ? 'property measurements' : user?.role === 'PAINTER' ? 'my earnings' : 'employee attendance'}</Button>
      <Button mode="text" textColor={theme.colors.error} onPress={() => Alert.alert(
        'Discard this queued change?',
        'This removes the saved offline change from this device. Review the current server record first; this action cannot be undone.',
        [{ text: 'Keep it', style: 'cancel' }, { text: 'Discard change', style: 'destructive', onPress: () => { void discardMobileConflict(actorId!, item.id).then(refresh); } }],
      )}>Review and discard</Button>
    </View>)}
    <Button mode="outlined" disabled={!online || busy || !retryable} loading={busy} onPress={() => void sync(true)} contentStyle={{ minHeight: 44 }}>Retry synchronization</Button>
  </View>;
}
