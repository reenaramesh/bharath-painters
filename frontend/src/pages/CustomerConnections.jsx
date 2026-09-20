import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Building2, Check, Unplug, X } from "lucide-react";
import api from "../api/client";

const tabs = [
  ["PENDING", "Pending"],
  ["CONNECTED", "My contractors"],
  ["HISTORY", "History"],
];

export default function CustomerConnections() {
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState("PENDING");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/quotations/customer/connection-requests/");
      setItems(data.results || []);
      setPendingCount(data.pending_count || 0);
      setError("");
    } catch { setError("Connection requests could not be loaded."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const visible = useMemo(() => items.filter((item) => tab === "HISTORY" ? ["REJECTED", "DISCONNECTED", "BLOCKED"].includes(item.status) : item.status === tab), [items, tab]);

  async function act(item, action, payload = {}) {
    if (!window.confirm(confirmText(item, action))) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/quotations/customer/${action === "disconnect" || action === "block" ? "contractors" : "connection-requests"}/${item.id}/${action}/`, payload);
      setSelected(null);
      await load();
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The connection could not be updated.");
    } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <header><p className="text-sm font-bold text-indigo-600">Customer privacy</p><h1 className="mt-1 text-3xl font-extrabold text-slate-950">Connection requests</h1><p className="mt-2 max-w-2xl text-slate-500">Choose which contractors may create and share records for your account. Each contractor sees only their own work.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{label}{value === "PENDING" && pendingCount > 0 ? ` (${pendingCount})` : ""}</button>)}</nav>
    <section className="grid gap-4 lg:grid-cols-2">
      {visible.map((item) => <ConnectionCard key={item.id} item={item} busy={busy} onView={() => setSelected(item)} onAct={act} />)}
      {!visible.length && <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">No {tab.toLowerCase()} connections.</div>}
    </section>
    {selected && <ContractorDialog item={selected} onClose={() => setSelected(null)} onAct={act} busy={busy} />}
  </div>;
}

function ConnectionCard({ item, onView, onAct, busy }) {
  const contractor = item.contractor || {};
  return <article className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="truncate font-extrabold text-slate-950">{contractor.business_name}</h2><p className="mt-0.5 text-sm text-slate-500">{contractor.contractor_id || "Bharath Painters Contractor"}</p></div><Status value={item.status} /></div>
    <p className="mt-4 text-sm text-slate-500">Requested {new Date(item.requested_at).toLocaleDateString("en-IN")}</p>
    {item.counts && <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><Metric label="Quotations" value={item.counts.quotations} /><Metric label="Calculations" value={item.counts.area_calculations} /><Metric label="Projects" value={item.counts.active_projects} /></div>}
    <div className="mt-5 flex flex-wrap gap-2"><button onClick={onView} className="rounded-xl border px-4 py-2 text-sm font-bold">View details</button>{item.status === "PENDING" && <><button disabled={busy} onClick={() => onAct(item, "accept")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Accept</button><button disabled={busy} onClick={() => onAct(item, "reject")} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-700">Reject</button></>}</div>
  </article>;
}

function ContractorDialog({ item, onClose, onAct, busy }) {
  const contractor = item.contractor || {};
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/50 sm:place-items-center sm:p-4"><section className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Contractor profile</p><h2 className="mt-2 text-xl font-extrabold">{contractor.business_name}</h2></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><Info label="Contractor ID" value={contractor.contractor_id} /><Info label="Verification" value={contractor.verification_status} /><Info label="Owner" value={contractor.name} /><Info label="Experience" value={`${contractor.years_in_business || 0} years`} /><div className="col-span-2"><Info label="Service areas" value={contractor.service_areas || "Not specified"} /></div></dl><div className="mt-5 flex flex-wrap gap-2">{item.status === "PENDING" && <><button disabled={busy} onClick={() => onAct(item, "accept")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"><Check className="h-4 w-4" />Accept connection</button><button disabled={busy} onClick={() => onAct(item, "reject")} className="rounded-xl border border-red-200 px-4 py-3 font-bold text-red-700">Reject</button></>}{item.status === "CONNECTED" && <><button disabled={busy} onClick={() => onAct(item, "disconnect")} className="flex items-center gap-2 rounded-xl border px-4 py-3 font-bold"><Unplug className="h-4 w-4" />Disconnect</button><button disabled={busy} onClick={() => onAct(item, "block")} className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 font-bold text-red-700"><Ban className="h-4 w-4" />Block</button></>}</div></section></div>;
}

function Status({ value }) { const style = value === "CONNECTED" ? "bg-emerald-50 text-emerald-700" : value === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${style}`}>{value.replaceAll("_", " ")}</span>; }
function Metric({ label, value }) { return <div className="rounded-xl bg-slate-50 p-2"><b className="block text-base text-slate-900">{value || 0}</b><span className="text-slate-500">{label}</span></div>; }
function Info({ label, value }) { return <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value || "—"}</dd></div>; }
function confirmText(item, action) { const name = item.contractor?.business_name || "this contractor"; return action === "accept" ? `Connect with ${name}? They can create records only for their work with you.` : action === "reject" ? `Reject the request from ${name}?` : action === "disconnect" ? `Disconnect ${name}? Existing records will remain available.` : `Block ${name}? They cannot send another request.`; }
