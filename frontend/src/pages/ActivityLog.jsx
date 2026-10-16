import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, Download, RefreshCw, Search, Users } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { Button, PageHeader, StatCard } from "../components/ui";
import "./admin-portal.css";
import "./crm-pages.css";

const actionStyle = {
  CREATE: "bg-emerald-50 text-emerald-700",
  UPDATE: "bg-blue-50 text-blue-700",
  DELETE: "bg-red-50 text-red-700",
  STATUS_CHANGE: "bg-amber-50 text-amber-700",
  LOGIN: "bg-violet-50 text-violet-700",
  LOGIN_FAILED: "bg-red-50 text-red-700",
  DOWNLOAD: "bg-cyan-50 text-cyan-700",
};

export default function ActivityLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ total: 0, today: 0, flagged: 0, active_users: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [module, setModule] = useState("");
  const [role, setRole] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, { data: totals }] = await Promise.all([
        api.get("/quotations/activity-logs/", { params: { search, action, module, role, date_from: dateFrom, date_to: dateTo, flagged: flagged || "" } }),
        api.get("/quotations/activity-logs/summary/"),
      ]);
      setLogs(data.results || data); setSummary(totals);
      setError("");
    } catch {
      setError("Activity history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [search, action, module, role, dateFrom, dateTo, flagged]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const modules = useMemo(() => [...new Set(logs.map((item) => item.module))].sort(), [logs]);

  async function exportCsv() {
    const { data } = await api.get("/quotations/activity-logs/export/", { params: { search, action, module, role, date_from: dateFrom, date_to: dateTo, flagged: flagged || "" }, responseType: "blob" });
    const url = URL.createObjectURL(data); const link = document.createElement("a");
    link.href = url; link.download = "activity-log.csv"; link.click(); URL.revokeObjectURL(url);
  }

  async function review(log) {
    const note = window.prompt("Add an admin review note", log.review_note || "");
    if (note === null) return;
    const { data } = await api.patch(`/quotations/activity-logs/${log.id}/review/`, { review_note: note, is_flagged: false });
    setLogs((current) => current.map((item) => item.id === data.id ? data : item));
    setSummary((current) => ({ ...current, flagged: Math.max(0, current.flagged - (log.is_flagged ? 1 : 0)) }));
  }

  return (
    <div className="space-y-5 crm-page crm-activity-page">
      <PageHeader eyebrow="Process monitoring" title="Activity Log" description="Review account activity, process updates and items that need attention." actions={<><Button onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" /> Export</Button><Button variant="secondary" onClick={load}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh</Button></>} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Activity · 60 days" value={summary.total} icon={Activity} />
        <SummaryCard label="Today" value={summary.today} icon={RefreshCw} />
        <SummaryCard label="Needs review" value={summary.flagged} icon={AlertTriangle} danger />
        <SummaryCard label="Users · 60 days" value={summary.active_users} icon={Users} />
      </section>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input type="search" aria-label="Search activity" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, activity or ID" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 bp-control-leading-icon bp-ui-control" />
        </label>
        <select aria-label="Filter activity by action" value={action} onChange={(event) => setAction(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bp-ui-control">
          <option value="">All actions</option><option value="CREATE">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Deleted</option>
          <option value="STATUS_CHANGE">Status changed</option><option value="LOGIN">Signed in</option><option value="LOGIN_FAILED">Sign-in failed</option><option value="DOWNLOAD">Downloaded</option>
        </select>
        {user?.role === "ADMIN" && <select aria-label="Filter activity by role" value={role} onChange={(event) => setRole(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bp-ui-control"><option value="">All roles</option><option value="ADMIN">Admin</option><option value="CONTRACTOR">Contractor</option><option value="CUSTOMER">Customer</option><option value="PAINTER">Applicator</option></select>}
        <input aria-label="From date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bp-ui-control" />
        <input aria-label="To date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bp-ui-control" />
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={flagged} onChange={(event) => setFlagged(event.target.checked)} /> Needs review</label>
        <select aria-label="Filter activity by process" value={module} onChange={(event) => setModule(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bp-ui-control">
          <option value="">All processes</option>{modules.map((name) => <option key={name}>{name}</option>)}
        </select>
      </section>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[36px_minmax(0,1fr)_100px_minmax(0,.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 xl:grid">
          <span>Sl.</span><span>User</span><span>Action</span><span>Process</span><span>Activity</span><span>Date &amp; time</span>
        </div>
        {loading && !logs.length ? <p className="p-8 text-center text-sm text-slate-500">Loading activity…</p> : logs.length === 0 ? (
          <div className="p-10 text-center"><Activity className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No activity found</p></div>
        ) : logs.map((log, index) => (
          <article key={log.id} className="min-w-0 break-words border-b border-slate-100 px-4 py-4 last:border-0">
          <div className="grid gap-2 xl:grid-cols-[36px_minmax(0,1fr)_100px_minmax(0,.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] xl:items-center xl:gap-3">
            <span className="text-xs font-semibold text-slate-500">{index + 1}<span className="xl:hidden">.</span></span>
            <div><p className="font-semibold text-slate-800">{log.actor_name || "Unknown user"}</p><p className="text-xs text-slate-400">{title(log.actor_role)}</p></div>
            <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${actionStyle[log.action] || "bg-slate-100 text-slate-600"}`}>{log.action_display}</span></div>
            <p className="text-sm font-medium text-slate-700">{log.module}</p>
            <button aria-expanded={expanded === log.id} onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="flex items-center gap-1 text-left text-sm text-slate-600 bp-ui-action">{log.description}{log.object_id ? ` #${log.object_id}` : ""}<ChevronDown className={`h-4 w-4 transition ${expanded === log.id ? "rotate-180" : ""}`} /></button>
            <div><time className="text-sm text-slate-500" dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>{log.is_flagged && <p className="mt-1 text-xs font-semibold text-red-600">Needs review</p>}</div>
          </div>
          {expanded === log.id && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><p className="font-semibold text-slate-700">Submitted changes</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(log.metadata?.changes || {}).map(([key, value]) => <p key={key}><span className="font-medium">{title(key.replaceAll("_", " "))}:</span> {String(value)}</p>)}</div>{!Object.keys(log.metadata?.changes || {}).length && <p className="mt-1 text-slate-400">No field details for this action.</p>}{log.review_note && <p className="mt-2"><b>Review note:</b> {log.review_note}</p>}{user?.role === "ADMIN" && <button onClick={() => review(log)} className="mt-3 rounded-md bg-white px-3 py-1.5 font-semibold text-indigo-600 shadow-sm bp-ui-action">Review activity</button>}</div>}
          </article>
        ))}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, danger = false }) {
  return <StatCard label={label} value={value} icon={Icon} tone={danger ? "danger" : "brand"} />;
}

function title(value = "") {
  return value.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
