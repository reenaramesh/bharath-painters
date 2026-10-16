import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw, Search, UsersRound } from "lucide-react";
import api from "../api/client";
import { PageHeader } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import "./admin-portal.css";

export default function AdminCustomerConnections() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/admin/customer-connections/", { params: { search, status } });
      setItems(data.results || []);
      setError("");
    } catch (requestError) {
      const responseStatus = requestError.response?.status;
      const detail = requestError.response?.data?.detail;
      if (responseStatus === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (responseStatus === 403) {
        setError("This account does not have administrator permission.");
      } else {
        setError(detail || "Customer connections could not be loaded. Check that the backend is running.");
      }
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(
    () => items.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {}),
    [items],
  );

  const openTimeline = async (item) => {
    setTimeline({ connection: item, events: [] });
    setTimelineLoading(true);
    try {
      const { data } = await api.get(`/quotations/admin/customer-connections/${item.id}/audit/`);
      setTimeline(data);
    } catch {
      setTimeline({ connection: item, events: [], error: "Audit history could not be loaded." });
    } finally {
      setTimelineLoading(false);
    }
  };

  return <div className="admin-ui-page space-y-6">
    <PageHeader eyebrow="Administration" title="Customer connection management" description="Review customer connections, their status and audit history." />

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {["CONNECTED", "PENDING", "REJECTED", "DISCONNECTED", "BLOCKED"].map((value) =>
        <button key={value} aria-pressed={status === value} onClick={() => setStatus(status === value ? "" : value)} className={(`rounded-2xl border p-4 text-left ${status === value ? "border-indigo-500 bg-indigo-50" : "bg-white"}`) + " bp-ui-action"}>
          <b className="block text-2xl">{counts[value] || 0}</b>
          <span className="text-xs font-bold text-slate-500">{value}</span>
        </button>,
      )}
    </div>

    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="border-b p-4">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input type="search" aria-label="Search customer connections" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Customer ID, Contractor ID or mobile" className="w-full bg-transparent text-sm outline-none bp-ui-control" />
        </label>
      </div>
      {error && <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 p-4 text-sm text-red-700">
        <span>{error}</span>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold bp-ui-action">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>}
      <div className="overflow-x-auto" data-mobile-table-title="Customer connection">
        <table className="w-full min-w-[980px] text-sm bp-ui-table">
          <thead className="bg-slate-950 text-left text-white"><tr>
            <th className="p-3">Customer</th><th className="p-3">Contractor</th><th className="p-3">Status</th>
            <th className="p-3">Requested</th><th className="p-3">Approved</th><th className="p-3">Disconnected / blocked</th><th className="p-3">Audit</th>
          </tr></thead>
          <tbody className="divide-y">{items.map((item) => <tr key={item.id} className="even:bg-slate-50">
            <td className="p-3"><b>{item.customer?.name}</b><small className="block text-slate-500">{item.customer?.bharath_id} · {item.customer?.mobile}</small></td>
            <td className="p-3"><b>{item.contractor?.business_name}</b><small className="block text-slate-500">{item.contractor?.contractor_id}</small></td>
            <td className="p-3 font-bold">{item.status}</td><td className="p-3">{date(item.requested_at)}</td>
            <td className="p-3">{date(item.approved_at)}</td><td className="p-3">{date(item.blocked_at || item.disconnected_at || item.rejected_at)}</td>
            <td className="p-3" data-mobile-action="true"><button onClick={() => openTimeline(item)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-bold hover:bg-slate-50 bp-ui-action"><History className="h-4 w-4" /> History</button></td>
          </tr>)}</tbody>
        </table>
        {!loading && !error && !items.length && <div className="p-12 text-center text-slate-400"><UsersRound className="mx-auto h-8 w-8" /><p className="mt-2">No matching connections.</p></div>}
        {loading && !items.length && <div className="p-12 text-center text-sm text-slate-500">Loading customer connections...</div>}
      </div>
    </section>

    {timeline && <Dialog title="Connection history" description={`${timeline.connection?.customer?.bharath_id || "Customer"} / ${timeline.connection?.contractor?.contractor_id || "Contractor"}`} icon={History} size="lg" onClose={() => setTimeline(null)} closeLabel="Close audit history" closeOnBackdrop>
        {timelineLoading && <p className="py-10 text-center text-sm text-slate-500">Loading audit history…</p>}
        {timeline.error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{timeline.error}</p>}
        {!timelineLoading && !timeline.error && <div className="mt-6 space-y-3">
          {timeline.events?.map((event) => <article key={event.id} className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><b>{event.action_label}</b><time className="text-xs font-semibold text-slate-500">{dateTime(event.timestamp)}</time></div>
            <p className="mt-2 text-sm text-slate-600">By {event.performed_by} · {event.performed_by_role}</p>
            <p className="mt-1 text-xs text-slate-400">IP: {event.ip_address || "Not recorded"}</p>
          </article>)}
          {!timeline.events?.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No audit events recorded.</p>}
        </div>}
    </Dialog>}
  </div>;
}

function date(value) { return value ? new Date(value).toLocaleDateString("en-IN") : "—"; }
function dateTime(value) { return value ? new Date(value).toLocaleString("en-IN") : "—"; }
