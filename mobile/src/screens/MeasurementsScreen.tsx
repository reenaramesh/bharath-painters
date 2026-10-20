import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Button, Card, Divider, Text, TextInput, useTheme } from 'react-native-paper';
import { ApiError } from '../core/api';
import { cacheMeasurementContext, enqueueMobileOperation, getCachedMeasurementContext, listCachedMeasurementContexts, listMobileOperations } from '../core/offlineQueue';
import { api, useApp } from '../providers/AppProvider';
import { DemoLabel, Heading, Screen, State, styles } from '../components/ui';
import { OfflineQueuePanel } from '../components/OfflineQueuePanel';
import { offlineMeasurementSyncEnabled } from '../core/phase4Capabilities';
import { tokens } from '../theme';

type PropertyRow = { id: number; name?: string; property_name?: string; property_type?: string; city?: string; customer_name?: string };
type MeasurementRow = { id: number; reference_no: string; status: string; measured_on: string; total_sqft: string; surface_count: number; version?: number; edit_revision?: number | null };
type RoomRow = { id: number | string; name: string; painting_area: string; measurement_record?: number | null; measurement_revision?: number | null; pendingOperationId?: string };
type SurfaceRow = { id: number | string; name: string; surface_type: string; work_area: string; net_area: string; length: string; breadth: string; measurement_revision?: number | null; pending?: boolean };
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const asRows = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results) ? (value as { results: T[] }).results : [];

export function MeasurementsScreen() {
  const routeParams = useLocalSearchParams<{ propertyId?: string; measurementId?: string }>();
  const { user, demo } = useApp();
  const theme = useTheme();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [measurementId, setMeasurementId] = useState<number | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>([]);
  const [roomName, setRoomName] = useState('');
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [surfaceType, setSurfaceType] = useState<'WALL' | 'CEILING' | 'TEXTURE'>('WALL');
  const [workArea, setWorkArea] = useState<'INTERIOR' | 'EXTERIOR'>('INTERIOR');
  const [roomId, setRoomId] = useState<number | string | null>(null);
  const [pendingRoomOperation, setPendingRoomOperation] = useState<{ id: string; localId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [startingDraft, setStartingDraft] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const requestKey = useRef('');
  const roomRequestKey = useRef('');

  const loadProperties = useCallback(async () => {
    if (demo) return;
    setBusy(true); setError('');
    try { setProperties(asRows<PropertyRow>(await api.get('/quotations/properties/'))); }
    catch (cause) {
      const cached = user?.id ? await listCachedMeasurementContexts(user.id).catch(() => []) : [];
      const recovered = cached.map(({ propertyId: id, context }) => {
        const item = context as { property?: PropertyRow };
        return item.property || { id, name: `Property ${id} · saved offline` };
      });
      setProperties(recovered);
      setError(recovered.length ? 'Offline mode: showing only properties and measurements previously opened on this account.' : cause instanceof Error ? cause.message : 'Properties could not be loaded.');
    }
    finally { setBusy(false); }
  }, [demo, user?.id]);
  useEffect(() => { void loadProperties(); }, [loadProperties]);
  const loadProperty = useCallback(async (nextProperty: number, preferredRecord?: number) => {
    setPropertyId(nextProperty); setMeasurementId(null); setEditRevision(null); setRooms([]); setSurfaces([]); setError(''); setNotice('');
    try {
      const records = asRows<MeasurementRow>(await api.get(`/quotations/properties/${nextProperty}/measurement-records/`));
      setMeasurements(records);
      const currentRooms = preferredRecord ? [] : asRows<RoomRow>(await api.get(`/quotations/properties/${nextProperty}/rooms/`));
      const roomRecordId = currentRooms.find(row => Number.isSafeInteger(row.measurement_record))?.measurement_record || null;
      const hiddenDraftId = roomRecordId && !records.some(row => row.id === roomRecordId) ? roomRecordId : null;
      const recordId = preferredRecord || hiddenDraftId || records[0]?.id || roomRecordId;
      setMeasurementId(recordId);
      const loadedRevision = records.find(row => row.id === recordId)?.edit_revision;
      setEditRevision(validRevision(loadedRevision) ? loadedRevision : null);
      setStartingDraft(false);
      if (recordId) {
        const [roomRows, surfaceRows] = await Promise.all([
          api.get<unknown>(`/quotations/properties/${nextProperty}/rooms/?measurement=${recordId}`),
          api.get<unknown>(`/quotations/properties/${nextProperty}/measurements/?measurement=${recordId}`),
        ]);
        const savedRooms = asRows<RoomRow>(roomRows), savedSurfaces = asRows<SurfaceRow>(surfaceRows);
        const queued = user?.id ? await listMobileOperations(user.id) : [];
        const localRooms: RoomRow[] = queued.filter(item => item.kind === 'measurement' && item.state !== 'SYNCED' && item.endpoint.startsWith(`/quotations/properties/${nextProperty}/rooms/`) && item.localReference)
          .map(item => ({ id: item.localReference!, name: String((item.payload as { name?: unknown }).name || 'Pending room'), painting_area: String((item.payload as { painting_area?: unknown }).painting_area || 'INTERIOR'), pendingOperationId: item.id }));
        const localSurfaces: SurfaceRow[] = queued.filter(item => item.kind === 'measurement' && item.state !== 'SYNCED' && item.endpoint.startsWith(`/quotations/properties/${nextProperty}/measurements/`))
          .map(item => { const payload = item.payload as Record<string, unknown>; return { id: item.clientMutationId, name: String(payload.name || 'Pending surface'), surface_type: String(payload.surface_type || 'WALL'), work_area: String(payload.work_area || 'INTERIOR'), net_area: 'Pending', length: String(payload.length || ''), breadth: String(payload.breadth || ''), pending: true }; });
        setRooms([...savedRooms, ...localRooms]); setSurfaces([...savedSurfaces, ...localSurfaces]);
        setPendingRoomOperation(localRooms[0]?.pendingOperationId ? { id: localRooms[0].pendingOperationId, localId: String(localRooms[0].id) } : null);
        setRoomId(asRows<RoomRow>(roomRows)[0]?.id || null);
        if (user?.id) {
          const selectedProperty = properties.find(row => row.id === nextProperty);
          await cacheMeasurementContext(user.id, nextProperty, {
          property: selectedProperty ? { id: selectedProperty.id, name: selectedProperty.name, property_name: selectedProperty.property_name, property_type: selectedProperty.property_type, city: selectedProperty.city } : { id: nextProperty, name: `Property ${nextProperty}` },
          measurements: records, rooms: savedRooms, surfaces: savedSurfaces, measurementId: recordId,
          editRevision: validRevision(loadedRevision) ? loadedRevision : null,
          });
        }
      }
    } catch (cause) {
      const cached = user?.id ? await getCachedMeasurementContext(user.id, nextProperty).catch(() => null) : null;
      if (cached && typeof cached === 'object') {
        const context = cached as { property?: PropertyRow; measurements?: MeasurementRow[]; rooms?: RoomRow[]; surfaces?: SurfaceRow[]; measurementId?: number | null; editRevision?: number | null };
        const queued = user?.id ? await listMobileOperations(user.id).catch(() => []) : [];
        const localRooms: RoomRow[] = queued.filter(item => item.kind === 'measurement' && item.state !== 'SYNCED' && item.endpoint.startsWith(`/quotations/properties/${nextProperty}/rooms/`) && item.localReference)
          .map(item => ({ id: item.localReference!, name: String((item.payload as { name?: unknown }).name || 'Pending room'), painting_area: String((item.payload as { painting_area?: unknown }).painting_area || 'INTERIOR'), pendingOperationId: item.id }));
        const localSurfaces: SurfaceRow[] = queued.filter(item => item.kind === 'measurement' && item.state !== 'SYNCED' && item.endpoint.startsWith(`/quotations/properties/${nextProperty}/measurements/`))
          .map(item => { const payload = item.payload as Record<string, unknown>; return { id: item.clientMutationId, name: String(payload.name || 'Pending surface'), surface_type: String(payload.surface_type || 'WALL'), work_area: String(payload.work_area || 'INTERIOR'), net_area: 'Pending', length: String(payload.length || ''), breadth: String(payload.breadth || ''), pending: true }; });
        setPropertyId(nextProperty); setMeasurements(context.measurements || []); setMeasurementId(context.measurementId || null);
        const cachedRevision = context.editRevision ?? context.measurements?.find(row => row.id === context.measurementId)?.edit_revision;
        setEditRevision(validRevision(cachedRevision) ? cachedRevision : null);
        setRooms([...(context.rooms || []), ...localRooms]); setSurfaces([...(context.surfaces || []), ...localSurfaces]);
        setPendingRoomOperation(localRooms[0]?.pendingOperationId ? { id: localRooms[0].pendingOperationId, localId: String(localRooms[0].id) } : null);
        setRoomId(localRooms[0]?.id || context.rooms?.[0]?.id || null); setStartingDraft(!context.measurementId && !localRooms.length);
        setError('Offline mode: this account’s saved property context is available locally. The server will recheck all permissions when changes sync.');
      } else setError(cause instanceof Error ? cause.message : 'Measurements could not be loaded.');
    }
  }, [user?.id]);
  useEffect(() => {
    const requestedPropertyId = Number(routeParams.propertyId);
    if (!demo && Number.isSafeInteger(requestedPropertyId) && properties.some(row => row.id === requestedPropertyId)) {
      const requestedMeasurementId = Number(routeParams.measurementId);
      void loadProperty(requestedPropertyId, Number.isSafeInteger(requestedMeasurementId) && requestedMeasurementId > 0 ? requestedMeasurementId : undefined);
    }
  }, [demo, loadProperty, properties, routeParams.measurementId, routeParams.propertyId]);

  function startDraft() {
    setMeasurementId(null); setEditRevision(null); setRooms([]); setSurfaces([]); setRoomId(null); setStartingDraft(true); setError('');
    if (user?.id && propertyId) void cacheMeasurementContext(user.id, propertyId, { property: currentProperty ? { id: currentProperty.id, name: currentProperty.name, property_name: currentProperty.property_name, property_type: currentProperty.property_type, city: currentProperty.city } : { id: propertyId }, measurements, rooms: [], surfaces: [], measurementId: null });
    setNotice('Draft starts when you save its first room, matching the existing measurement workflow.');
  }

  function rememberAcknowledgement(revision: unknown, recordId: number | null, nextRooms: RoomRow[], nextSurfaces: SurfaceRow[]) {
    const confirmed = validRevision(revision) ? revision : null;
    setEditRevision(confirmed);
    const records = measurements.map(row => row.id === recordId ? { ...row, edit_revision: confirmed ?? undefined } : row);
    setMeasurements(records);
    if (user?.id && propertyId) void cacheMeasurementContext(user.id, propertyId, {
      property: currentProperty ? { id: currentProperty.id, name: currentProperty.name, property_name: currentProperty.property_name, property_type: currentProperty.property_type, city: currentProperty.city } : { id: propertyId },
      measurements: records, rooms: nextRooms.filter(row => !row.pendingOperationId), surfaces: nextSurfaces.filter(row => !row.pending), measurementId: recordId, editRevision: confirmed,
    });
  }

  async function addRoom() {
    if (!propertyId || (!measurementId && !startingDraft) || !roomName.trim()) { setError('Choose a property, start a draft, and enter a room name.'); return; }
    if (pendingRoomOperation) { setError('Sync the pending room before adding another room to this new draft.'); return; }
    setBusy(true); setError(''); setNotice('');
    if (!roomRequestKey.current) roomRequestKey.current = globalThis.crypto?.randomUUID?.() || `room-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      ...(offlineMeasurementSyncEnabled ? { idempotency_key: roomRequestKey.current } : {}),
      ...(offlineMeasurementSyncEnabled && measurementId && validRevision(editRevision) ? { expected_revision: editRevision } : {}),
      name: roomName.trim(), painting_area: 'INTERIOR', section: '', description: '',
    };
    try {
      const query = measurementId ? `?measurement=${measurementId}` : '?new=1';
      const created = await api.request<RoomRow>(`/quotations/properties/${propertyId}/rooms/${query}`, payload);
      if (created.measurement_record) { setMeasurementId(created.measurement_record); setStartingDraft(false); }
      rememberAcknowledgement(created.measurement_revision, created.measurement_record || measurementId, [...rooms, created], surfaces);
      setRooms(rows => [...rows, created]); setRoomId(created.id); setRoomName('');
      roomRequestKey.current = '';
      setNotice(`${created.name} added.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0 && user?.id && propertyId && offlineMeasurementSyncEnabled) {
        try {
          const endpoint = `/quotations/properties/${propertyId}/rooms/${measurementId ? `?measurement=${measurementId}` : '?new=1'}`;
          const localId = `local-room:${roomRequestKey.current}`;
          const queued = await enqueueMobileOperation({ actorId: user.id, kind: 'measurement', endpoint, payload, expectedVersion: measurementId ? String(measurements.find(row => row.id === measurementId)?.version ?? '') || null : null, expectedRevision: editRevision, clientMutationId: roomRequestKey.current, localReference: localId });
          setPendingRoomOperation({ id: queued.id, localId });
          roomRequestKey.current = '';
          setRooms(rows => [...rows, { id: localId, name: payload.name, painting_area: 'INTERIOR', pendingOperationId: queued.id }]); setRoomId(localId);
          setStartingDraft(false); setRoomName(''); setQueueRevision(value => value + 1);
          setNotice('Room saved on this device as Pending Sync. You can add its surfaces now; they will sync only after the server confirms this room.');
        } catch (queueError) { setError(queueError instanceof Error ? queueError.message : 'Room could not be saved offline. Your entry is still here.'); }
      } else setError(cause instanceof ApiError && cause.status === 0 && !offlineMeasurementSyncEnabled ? 'Room is not saved yet. Reconnect and retry; offline measurement sync stays disabled until the server idempotency migrations are activated.' : cause instanceof Error ? cause.message : 'Room could not be added.');
    }
    finally { setBusy(false); }
  }

  async function addSurface() {
    const a = Number(length), b = Number(height);
    if (!propertyId || !roomId || (!measurementId && !pendingRoomOperation) || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      setError('Choose a room and enter positive length and height values.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (String(roomId).startsWith('local-room:')) throw new ApiError(0, 'Offline room surfaces are saved below until the parent room syncs.');
      if (!requestKey.current) requestKey.current = globalThis.crypto?.randomUUID?.() || `surface-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        ...(offlineMeasurementSyncEnabled ? { idempotency_key: requestKey.current } : {}),
        ...(offlineMeasurementSyncEnabled && validRevision(editRevision) ? { expected_revision: editRevision } : {}),
        work_area: workArea, surface_type: surfaceType === 'TEXTURE' ? 'OTHER' : surfaceType,
        ...(surfaceType === 'TEXTURE' ? { area_group_name: 'Texture Walls' } : {}),
        name: `${surfaceType === 'TEXTURE' ? 'Texture Wall' : surfaceType === 'WALL' ? 'Wall' : 'Ceiling'} ${surfaces.filter(row => row.surface_type === (surfaceType === 'TEXTURE' ? 'OTHER' : surfaceType)).length + 1}`,
        length: a.toFixed(2), breadth: b.toFixed(2), manual_area: '0.00', quantity: 1,
        paintable_sides: 1, room: roomId,
      };
      const saved = await api.request<SurfaceRow>(`/quotations/properties/${propertyId}/measurements/?measurement=${measurementId}`, payload);
      rememberAcknowledgement(saved.measurement_revision, measurementId, rooms, [...surfaces, saved]);
      setSurfaces(rows => [...rows, saved]); setLength(''); setHeight('');
      setMeasurements(rows => rows.map(row => row.id === measurementId ? { ...row, surface_count: row.surface_count + 1 } : row));
      requestKey.current = '';
      setNotice(`${saved.name} saved · ${saved.net_area} sq ft.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0 && user?.id && propertyId && roomId && offlineMeasurementSyncEnabled) {
        try {
          const key = requestKey.current || `surface-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          requestKey.current = key;
          const localRoom = rooms.find(room => room.id === roomId);
          const parentOperation = localRoom?.pendingOperationId || (pendingRoomOperation?.localId === roomId ? pendingRoomOperation.id : null);
          const endpoint = `/quotations/properties/${propertyId}/measurements/${measurementId ? `?measurement=${measurementId}` : '?new=1'}`;
          const payload = {
            idempotency_key: key, work_area: workArea, surface_type: surfaceType === 'TEXTURE' ? 'OTHER' : surfaceType,
            ...(surfaceType === 'TEXTURE' ? { area_group_name: 'Texture Walls' } : {}),
            name: `${surfaceType === 'TEXTURE' ? 'Texture Wall' : surfaceType === 'WALL' ? 'Wall' : 'Ceiling'} ${surfaces.filter(row => row.surface_type === (surfaceType === 'TEXTURE' ? 'OTHER' : surfaceType)).length + 1}`,
            length: a.toFixed(2), breadth: b.toFixed(2), manual_area: '0.00', quantity: 1,
            paintable_sides: 1, room: typeof roomId === 'number' ? roomId : undefined,
            ...(parentOperation ? { local_room_id: String(roomId) } : {}),
          };
          const siblings = parentOperation ? (await listMobileOperations(user.id)).filter(row => row.dependsOn === parentOperation) : [];
          await enqueueMobileOperation({ actorId: user.id, kind: 'measurement', endpoint, payload, expectedVersion: measurementId ? String(measurements.find(row => row.id === measurementId)?.version ?? '') || null : null, expectedRevision: parentOperation ? null : editRevision, clientMutationId: key, dependsOn: parentOperation, revisionDependsOn: siblings.at(-1)?.id || parentOperation, localReference: parentOperation ? String(roomId) : null });
          setSurfaces(rows => [...rows, { id: key, name: String(payload.name), surface_type: String(payload.surface_type), work_area: workArea, net_area: 'Pending', length: String(payload.length), breadth: String(payload.breadth), pending: true }]);
          setLength(''); setHeight(''); requestKey.current = ''; setQueueRevision(value => value + 1);
          setNotice('Measurement saved on this device as Pending Sync. It will retry when connected; if the server rejects it, review the conflict before discarding or re-entering it.');
          return;
        } catch (queueError) { setError(queueError instanceof Error ? queueError.message : 'Offline measurement could not be saved on this device.'); }
      } else setError(cause instanceof ApiError && cause.status === 0 && !offlineMeasurementSyncEnabled ? 'Surface is not saved yet. Your entered dimensions remain in the form; reconnect and retry. Offline measurement sync is paused until the server schema is activated.' : cause instanceof Error ? cause.message : 'Surface could not be saved. Your entries are still here; retry when connected.');
    }
    finally { setBusy(false); }
  }

  const currentProperty = useMemo(() => properties.find(row => row.id === propertyId), [properties, propertyId]);
  if (demo) return <Screen><DemoLabel/><Heading title="Measurements" subtitle="Sign in to save measurements to a contractor property."/><State title="Live data is protected" description="The demo workspace does not send measurement changes to the server."/></Screen>;

  return <Screen scroll={false}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <DemoLabel/><Heading title="Measurements" subtitle="Create a saved area calculation and record room surfaces using the existing property workflow."/>
    {user?.id && <OfflineQueuePanel actorId={user.id} refreshKey={queueRevision}/>}
    {!!error && <State title="Measurement needs attention" description={error} action="Retry" onAction={() => propertyId ? void loadProperty(propertyId, measurementId || undefined) : void loadProperties()}/>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.primary }}>{notice}</Text>}
    <Text variant="titleSmall">Choose a property</Text>
    {!properties.length && !error && <State title="No connected properties" description="Connect a customer property before starting an area calculation." action="Refresh" onAction={() => void loadProperties()}/>}
    {properties.map(row => <Card key={row.id} mode={propertyId === row.id ? 'contained' : 'outlined'} onPress={() => void loadProperty(row.id)} accessibilityLabel={`Select ${row.name || row.property_name || row.property_type || 'property'}`}>
      <Card.Content style={{ paddingVertical: 10 }}><Text variant="titleSmall">{row.name || row.property_name || row.property_type || `Property ${row.id}`}</Text><Text variant="bodySmall">{[row.customer_name, row.city].filter(Boolean).join(' · ')}</Text></Card.Content>
    </Card>)}
    {!!currentProperty && <>
      <Divider/>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Text variant="titleSmall" style={{ flex: 1 }}>{currentProperty.name || currentProperty.property_name || currentProperty.property_type}</Text><Button mode="contained-tonal" disabled={busy || !!pendingRoomOperation} onPress={startDraft}>New draft</Button></View>
      {!!pendingRoomOperation && <Card mode="outlined"><Card.Content style={{ gap: 6 }}><Text variant="titleSmall">Pending room and surfaces</Text><Text variant="bodySmall">Child surfaces wait for the server-confirmed room and measurement IDs.</Text><Button mode="outlined" onPress={() => void loadProperty(propertyId!)}>Refresh after sync</Button></Card.Content></Card>}
      {measurements.map(row => <Button key={row.id} mode={measurementId === row.id ? 'contained-tonal' : 'outlined'} contentStyle={{ minHeight: 44 }} onPress={() => void loadProperty(propertyId!, row.id)}>{row.reference_no} · {row.status} · {row.surface_count} surfaces</Button>)}
      {(!!measurementId || startingDraft || !!pendingRoomOperation) && <>
        <Text variant="titleSmall">Rooms</Text>
        {rooms.map(row => <Button key={row.id} mode={roomId === row.id ? 'contained-tonal' : 'outlined'} contentStyle={{ minHeight: 44 }} onPress={() => setRoomId(row.id)}>{row.name}</Button>)}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><TextInput label="New room name" value={roomName} onChangeText={setRoomName} style={{ flex: 1 }} accessibilityLabel="New room name"/><Button mode="outlined" disabled={busy || !roomName.trim()} onPress={() => void addRoom()} contentStyle={{ minHeight: 48 }}>Add room</Button></View>
        {!!rooms.length && <>
          <Text variant="titleSmall">Add surface</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button mode={workArea === 'INTERIOR' ? 'contained-tonal' : 'outlined'} onPress={() => setWorkArea('INTERIOR')} contentStyle={{ minHeight: 44 }}>Interior</Button><Button mode={workArea === 'EXTERIOR' ? 'contained-tonal' : 'outlined'} onPress={() => setWorkArea('EXTERIOR')} contentStyle={{ minHeight: 44 }}>Exterior</Button></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button mode={surfaceType === 'WALL' ? 'contained-tonal' : 'outlined'} onPress={() => setSurfaceType('WALL')} contentStyle={{ minHeight: 44 }}>Wall</Button><Button mode={surfaceType === 'CEILING' ? 'contained-tonal' : 'outlined'} onPress={() => setSurfaceType('CEILING')} contentStyle={{ minHeight: 44 }}>Ceiling</Button><Button mode={surfaceType === 'TEXTURE' ? 'contained-tonal' : 'outlined'} onPress={() => setSurfaceType('TEXTURE')} contentStyle={{ minHeight: 44 }}>Texture wall</Button></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><TextInput label="Length (ft)" keyboardType="decimal-pad" value={length} onChangeText={setLength} style={{ flex: 1 }} accessibilityLabel="Surface length in feet"/><TextInput label="Height / width (ft)" keyboardType="decimal-pad" value={height} onChangeText={setHeight} style={{ flex: 1 }} accessibilityLabel="Surface height or width in feet"/></View>
          <Button mode="contained" icon="content-save-outline" loading={busy} disabled={busy} onPress={() => void addSurface()} contentStyle={{ minHeight: 48 }}>Save surface</Button>
          {surfaces.map(row => <Text key={row.id} variant="bodySmall">{row.name} · {row.length} × {row.breadth} ft · {row.net_area} sq ft</Text>)}
        </>}
      </>}
    </>}
  </ScrollView></Screen>;
}
