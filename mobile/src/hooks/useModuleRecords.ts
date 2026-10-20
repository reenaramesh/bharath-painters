import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, useApp } from '../providers/AppProvider';
import { canOpenModule, type ModuleId } from '../core/navigation';
import { mapRecord, modulePath, parseModulePage, type NativeRecord } from '../core/moduleRecords';
import { demoRecords } from '../data/demo';

export function useModuleRecords(id: ModuleId) {
  const { user, demo, menuReady, disabledMenus } = useApp();
  const allowed = !!user && menuReady && canOpenModule(user, id, disabledMenus);
  const [rows, setRows] = useState<NativeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [next, setNext] = useState(false);
  const page = useRef(1);
  const version = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async (more = false) => {
    if (!allowed || id === 'settings' || (id === 'wage-register' && !demo) || pending.current) return;
    if (demo) {
      setRows(demoRecords[id].map(item => ({ ...item, location: item.subtitle, reference: '', phone: undefined, details: [{ label: 'Details', value: item.note || item.subtitle }] })));
      setError('');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = version.current;
    try {
      let parsed = parseModulePage(await api.get(modulePath(id), {
        page: more ? page.current + 1 : 1,
        ...(id === 'customers' ? { include_saved: 1 } : {}),
      }), id);
      let partialError = '';
      if (id === 'schedules') {
        try {
          const visitData = await api.get<unknown>('/quotations/site-visits/');
          const visitRows = parseModulePage(visitData, id).rows.map(row => ({ ...row, id: `visit-${row.id}` }));
          parsed = { rows: [...visitRows, ...parsed.rows], next: false };
        } catch { partialError = 'Site visits could not be refreshed. Scheduled work is still shown.'; }
      }
      if (generation !== version.current) return;
      page.current = more ? page.current + 1 : 1;
      setNext(parsed.next);
      const visible = id === 'projects'
        ? parsed.rows.filter(row => ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(row.status))
        : parsed.rows;
      setRows(old => more ? [...new Map([...old, ...visible].map(row => [row.id, row])).values()] : visible);
      if (partialError) setError(partialError);
    } catch (cause) {
      if (generation === version.current) setError(cause instanceof Error ? cause.message : 'Could not load records.');
    } finally {
      if (generation === version.current) { pending.current = false; setBusy(false); }
    }
  }, [id, allowed, demo, user?.id]);

  useFocusEffect(useCallback(() => {
    version.current++;
    pending.current = false;
    setRows([]);
    setNext(false);
    page.current = 1;
    void load();
    return () => { version.current++; pending.current = false; };
  }, [load]));

  return { rows, busy, error, next, load, allowed };
}
