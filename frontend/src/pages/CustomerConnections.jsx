import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, ExternalLink, Share2, Star, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";
import ContractorConnectSearch from "../components/ContractorConnectSearch";

const tabs = [
  ["PENDING", "Pending"],
  ["CONNECTED", "My contractors"],
  ["HISTORY", "History"],
];

export default function CustomerConnections() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState(searchParams.get("tab")?.toLowerCase() === "pending" ? "PENDING" : "CONNECTED");
  useEffect(() => { setTab(searchParams.get("tab")?.toLowerCase() === "pending" ? "PENDING" : "CONNECTED"); }, [searchParams]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
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
      await api.post(`/quotations/customer/connection-requests/${item.id}/${action}/`, payload);
      setSelected(null);
      await load();
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The connection could not be updated.");
    } finally { setBusy(false); }
  }

  async function shareProfile(item) {
    const url = contractorProfileUrl(item.contractor?.contractor_id);
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: `${item.contractor.business_name} | Bharath Painters`, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Contractor profile link copied."); }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setShareMessage("Profile could not be shared on this device.");
    }
  }

  return <div className="space-y-6">
    <header><p className="text-sm font-bold text-indigo-600">Customer privacy</p><h1 className="mt-1 text-3xl font-extrabold text-slate-950">My Contractors</h1><p className="mt-2 max-w-2xl text-slate-500">Choose which contractors may create and share records for your account. Each contractor sees only their own work.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <ContractorConnectSearch onConnected={async () => { await load(); setTab("CONNECTED"); }} />
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{label}{value === "PENDING" && pendingCount > 0 ? ` (${pendingCount})` : ""}</button>)}</nav>
    <section className="grid gap-4 lg:grid-cols-2">
      {visible.map((item) => <ConnectionCard key={item.id} item={item} busy={busy} onView={() => setSelected(item)} onAct={act} />)}
      {!visible.length && <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">No {tab.toLowerCase()} connections.</div>}
    </section>
    {selected && <ContractorDialog item={selected} onClose={() => { setSelected(null); setShareMessage(""); }} onAct={act} onShare={shareProfile} shareMessage={shareMessage} busy={busy} />}
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

function ContractorDialog({ item, onClose, onAct, onShare, shareMessage, busy }) {
  const contractor = item.contractor || {};
  const profileUrl = contractorProfileUrl(contractor.contractor_id);
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/50 p-0 sm:place-items-center sm:p-4"><section role="dialog" aria-modal="true" aria-label={`${contractor.business_name} profile`} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"><div className="rounded-t-3xl bg-gradient-to-r from-[#14374a] to-[#508398] p-5 text-white sm:p-6"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-white/75">Contractor profile</p><h2 className="mt-2 text-2xl font-extrabold">{contractor.business_name}</h2><p className="mt-1 text-sm text-white/80">{contractor.name}</p></div><button onClick={onClose} aria-label="Close profile" className="h-10 rounded-xl bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button></div><div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white/15 px-3 py-1.5">{contractor.contractor_id}</span>{contractor.is_verified && <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-bold text-emerald-800">Verified contractor</span>}</div></div><div className="p-5 sm:p-6"><div className="grid grid-cols-3 gap-2 text-center"><Metric label="Years" value={contractor.years_in_business} /><Metric label="Workers" value={contractor.workers} /><Metric label="Projects" value={contractor.completed_projects} /></div>{contractor.public_rating && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{contractor.public_rating} / 5 from {contractor.review_count} customer reviews</p>}<dl className="mt-5 grid gap-4 rounded-2xl border border-slate-200 p-4 text-sm sm:grid-cols-2"><Info label="Service areas" value={contractor.service_areas || "Not specified"} /><Info label="Work skills" value={contractor.work_skills || "Not specified"} /></dl><div className="mt-5 grid grid-cols-2 gap-2"><a href={profileUrl || "#"} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-3 text-xs font-bold text-white sm:text-sm"><ExternalLink className="h-4 w-4" />Open full profile</a><button type="button" onClick={() => onShare(item)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b9d1dc] px-3 text-xs font-bold text-[#1d5e7b] sm:text-sm"><Share2 className="h-4 w-4" />Share profile</button></div>{shareMessage && <p role="status" className="mt-2 text-xs text-[#1d5e7b]">{shareMessage}</p>}{item.status === "PENDING" && <div className="mt-5 flex flex-wrap gap-2 border-t pt-5"><button disabled={busy} onClick={() => onAct(item, "accept")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"><Check className="h-4 w-4" />Accept connection</button><button disabled={busy} onClick={() => onAct(item, "reject")} className="rounded-xl border border-red-200 px-4 py-3 font-bold text-red-700">Reject</button></div>}</div></section></div>;
}

function Status({ value }) { const style = value === "CONNECTED" ? "bg-emerald-50 text-emerald-700" : value === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${style}`}>{value.replaceAll("_", " ")}</span>; }
function Metric({ label, value }) { return <div className="rounded-xl bg-slate-50 p-2"><b className="block text-base text-slate-900">{value || 0}</b><span className="text-slate-500">{label}</span></div>; }
function Info({ label, value }) { return <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value || "—"}</dd></div>; }
function confirmText(item, action) { const name = item.contractor?.business_name || "this contractor"; return action === "accept" ? `Connect with ${name}? They can create records only for their work with you.` : `Reject the request from ${name}?`; }
function contractorProfileUrl(bharathId) { return bharathId ? new URL(`${API_BASE_URL.replace(/\/$/, "")}/accounts/verify-page/${encodeURIComponent(bharathId)}/`, window.location.origin).href : ""; }
