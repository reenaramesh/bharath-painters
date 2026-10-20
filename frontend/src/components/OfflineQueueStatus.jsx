import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { discardOfflineConflict, flushOfflineOperations, listOfflineOperations, offlineOperationReviewPath } from "../utils/offlineOperationQueue";

export default function OfflineQueueStatus({ actorId }) {
  const [rows, setRows] = useState([]);
  const [online, setOnline] = useState(globalThis.navigator?.onLine !== false);
  const refresh = useCallback(async () => {
    try { setRows(await listOfflineOperations(actorId)); } catch { setRows([]); }
  }, [actorId]);
  const sync = useCallback(async () => {
    if (!actorId) return;
    setOnline(globalThis.navigator?.onLine !== false);
    try {
      await flushOfflineOperations(actorId, operation => {
        const path = operation.endpoint.replace(/^\/api(?=\/)/, "");
        if (operation.method === "PATCH") return api.patch(path, operation.payload);
        return api.post(path, operation.payload);
      });
    } finally { await refresh(); }
  }, [actorId, refresh]);
  useEffect(() => {
    void refresh();
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [refresh, sync]);
  const pending = rows.filter(row => row.state === "PENDING").length;
  const conflicts = rows.filter(row => row.state === "CONFLICT").length;
  const synced = rows.filter(row => row.state === "SYNCED").length;
  const authRequired = rows.filter(row => row.state === "AUTH_REQUIRED").length;
  const discard = async (operation) => {
    if (!globalThis.confirm("Discard this offline change? Review the server record before re-entering it.")) return;
    if (await discardOfflineConflict(actorId, operation.id)) await refresh();
  };
  if (!rows.length && online) return null;
  return <section aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{online ? "Connection available" : "Offline"}</strong><button type="button" disabled={!online || (pending === 0 && authRequired === 0)} onClick={() => void sync()} className="min-h-10 rounded-lg border px-3 font-semibold disabled:opacity-50">Retry sync</button></div><p className="mt-1 text-slate-600">Pending: {pending} · Synced: {synced} · Conflict: {conflicts} · Sign-in needed: {authRequired}</p>{authRequired > 0 && <p className="mt-2 text-amber-800">Sign in again, then retry to sync saved changes.</p>}{conflicts > 0 && <ul className="mt-2 list-inside list-disc text-amber-800">{rows.filter(row => row.state === "CONFLICT").map(row => <li key={row.id} className="mb-2">{row.lastError || "This change needs review before it can sync."}<span className="ml-2 inline-flex flex-wrap gap-3"><a className="underline" href={offlineOperationReviewPath(row) || "/properties"}>Review server record</a><button type="button" className="underline" onClick={() => void discard(row)}>Discard queued change</button></span></li>)}</ul>}</section>;
}
