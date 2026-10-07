import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";

export default function CompletedWork() {
  const { user } = useAuth();
  const customerView = user?.role === "CUSTOMER";
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/jobs/work-schedules/");
      setItems(data.filter((item) => item.status === "COMPLETED"));
      setError("");
    } catch {
      setError("Completed work could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => items.filter((item) =>
      [item.quotation_number, item.customer, item.property, item.contractor]
        .some((value) => String(value || "").toLowerCase().includes(search.toLowerCase())),
    ),
    [items, search],
  );

  return (
    <div className={`${customerView ? "customer-completed-work-page" : ""} space-y-6`}>
      {customerView ? (
        <PageHeader eyebrow="Your projects" title="Completed projects" description="See the work your contractor has marked complete." />
      ) : (
        <header><p className="text-sm font-semibold text-amber-600">Project planning</p><h1 className="mt-1 text-3xl font-bold">Completed work</h1></header>
      )}
      {customerView && <section className="customer-completed-pulse" aria-label="Completed project summary">
        <div><span>Completed projects</span><strong>{items.length}</strong><small>Marked complete by your contractor</small></div>
        <div><span>Latest completion</span><strong>{formatWorkDate(items[0]?.work_completed_at || items[0]?.end_date)}</strong><small>Most recent finished work</small></div>
        <div><span>Work teams</span><strong>{new Set(items.flatMap((item) => (item.painters || []).map((painter) => painter.id))).size}</strong><small>Team members recorded</small></div>
      </section>}
      {error && !loading && (customerView ? <ErrorState message={error} onRetry={load} /> : <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>)}
      {customerView ? (
        <SectionCard title="Finished projects" description={`${visible.length} ${visible.length === 1 ? "project" : "projects"}`} className="customer-completed-work-list" bodyClassName="p-0">
          <div className="border-b p-4"><label className="customer-completed-search"><Search aria-hidden="true" /><span className="sr-only">Search project, contractor or property</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search project, contractor or property" /></label></div>
          {loading ? <LoadingState label="Loading completed projects…" /> : error ? null : visible.length ? <div className="customer-completed-cards">
            {visible.map((item) => <article key={item.id} className="customer-completed-card">
              <div className="customer-completed-card-heading"><div className="min-w-0"><p>{item.quotation_number}</p><h2>{item.property || "Completed project"}</h2></div><StatusBadge status="COMPLETED" label="Complete" tone="success" /></div>
              <p className="customer-completed-contractor">With {item.contractor || "your contractor"}</p>
              <div className="customer-completed-dates"><span><small>Work dates</small><strong>{formatWorkDate(item.start_date)} – {formatWorkDate(item.end_date)}</strong></span><span><small>Completed</small><strong>{formatWorkDate(item.work_completed_at || item.end_date)}</strong></span></div>
              {item.painters?.length > 0 && <p className="customer-completed-team">Work team · {item.painters.map((painter) => painter.name).join(", ")}</p>}
            </article>)}
          </div> : <EmptyState title="No completed projects yet" description="Projects marked complete by your contractor will appear here." className="customer-portal-state" />}
        </SectionCard>
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3"><Search className="h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation, customer, contractor or property" className="w-full bg-transparent text-sm outline-none"/></label></div>
          {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Quotation</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Property</th><th className="px-5 py-3">Work dates</th><th className="px-5 py-3">Completed on</th><th className="px-5 py-3">Paint Applicators</th></tr></thead><tbody className="divide-y">{visible.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-bold">{item.quotation_number}</td><td className="px-5 py-4 font-semibold">{item.customer}</td><td className="px-5 py-4 text-slate-600">{item.property}</td><td className="px-5 py-4" data-sort-value={item.start_date}>{item.start_date} to {item.end_date}</td><td className="px-5 py-4" data-sort-value={item.work_completed_at || ""}>{item.work_completed_at ? new Date(item.work_completed_at).toLocaleString("en-IN") : "-"}</td><td className="px-5 py-4">{item.painters.length ? item.painters.map((painter) => painter.name).join(", ") : "-"}</td></tr>)}</tbody></table></div> : <div className="p-14 text-center text-slate-400"><p className="mt-3">No completed work found.</p></div>}
        </section>
      )}
    </div>
  );
}

function formatWorkDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
