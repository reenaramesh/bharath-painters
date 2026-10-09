import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Phone, Plus, Search } from "lucide-react";
import api from "../api/client";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatCard as SharedStatCard, StatusBadge } from "../components/ui";
import "./crm-pages.css";
import {
  OPPORTUNITY_STAGES,
  SOURCE_OPTIONS,
  PRIORITY_OPTIONS,
  stageLabel,
  money,
} from "../utils/opportunityOptions";

export default function Opportunities() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("open");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (view !== "all") params.set("view", view);
      if (stage) params.set("stage", stage);
      if (source) params.set("source", source);
      if (priority) params.set("priority", priority);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const { data } = await api.get(`/quotations/leads/?${params.toString()}`);
      setItems(data);
      setError("");
    } catch {
      setError("Opportunities could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [search, view, stage, source, priority, dateFrom, dateTo]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const counts = useMemo(
    () => ({
      open: items.filter((item) =>
        !["WON", "LOST", "CANCELLED", "COMPLETED"].includes(item.stage),
      ).length,
      new: items.filter((item) => item.stage === "NEW").length,
      followUp: items.filter(
        (item) => item.next_follow_up && new Date(item.next_follow_up) <= new Date(),
      ).length,
      quotation: items.filter((item) => item.stage === "QUOTATION").length,
      won: items.filter((item) => item.stage === "WON").length,
      lost: items.filter((item) => item.stage === "LOST").length,
    }),
    [items],
  );

  return (
    <div className="space-y-6 crm-page crm-opportunities-page">
      <PageHeader eyebrow="Sales pipeline" title="Sales Opportunities" description="Track each service enquiry through its own sales journey." actions={<Button
          onClick={() => navigate("/opportunities/new")}
          aria-label="Create a sales opportunity"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Opportunity
        </Button>} />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SharedStatCard label="Open" value={counts.open} className="crm-opportunity-stat" />
        <SharedStatCard label="New" value={counts.new} tone="info" className="crm-opportunity-stat" />
        <SharedStatCard label="Follow-up due" value={counts.followUp} tone="warning" className="crm-opportunity-stat" />
        <SharedStatCard label="Quotation sent" value={counts.quotation} tone="brand" className="crm-opportunity-stat" />
        <SharedStatCard label="Won" value={counts.won} tone="success" className="crm-opportunity-stat" />
        <SharedStatCard label="Lost" value={counts.lost} tone="danger" className="crm-opportunity-stat" />
      </div>

      <SectionCard title="Find opportunities" description="Search and refine the pipeline" className="crm-filters-card" bodyClassName="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ID, client, mobile, property or service"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["open", "Open"],
              ["won", "Won"],
              ["lost", "Lost"],
              ["all", "All"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  view === value
                    ? "bg-slate-950 text-white"
                    : "border bg-white text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-900"
          >
            <option value="">All stages</option>
            {OPPORTUNITY_STAGES.map((value) => (
              <option key={value} value={value}>
                {stageLabel(value)}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-900"
          >
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-900"
          >
            <option value="">Any priority</option>
            {PRIORITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            From
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-xl border bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            To
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-xl border bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-900"
            />
          </label>
        </div>
      </SectionCard>

      {loading ? <LoadingState label="Loading opportunities..." /> : items.length ? (
        <SectionCard title="Opportunity records" description={`${items.length} matching ${items.length === 1 ? "opportunity" : "opportunities"}`} className="crm-records-card" bodyClassName="p-0">
          <div className="crm-opportunity-mobile-list">{items.map((item) => <OpportunityCard key={item.id} item={item} />)}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Opportunity</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Property / service</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Source</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Next follow-up</th><th className="px-4 py-3" data-no-sort="true">Action</th></tr>
              </thead>
              <tbody className="divide-y">{items.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/opportunities/${item.id}`)}>
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-slate-500">{item.reference_no || `OPP-${item.id}`}</td>
                  <td className="px-4 py-4 font-bold">{item.title}</td>
                  <td className="px-4 py-4"><p className="font-semibold">{item.customer_name}</p><p className="text-xs text-slate-500">{item.customer_mobile}</p></td>
                  <td className="px-4 py-4 text-slate-600">{item.property_name || item.service_name || "-"}</td>
                  <td className="px-4 py-4"><StatusBadge status={item.stage} label={stageLabel(item.stage)} tone={opportunityTone(item.stage)} /></td>
                  <td className="px-4 py-4"><StatusBadge status={item.priority} label={priorityLabel(item.priority)} tone={item.priority === "HIGH" ? "danger" : item.priority === "MEDIUM" ? "warning" : "neutral"} /></td>
                  <td className="px-4 py-4">{sourceLabel(item.source)}</td>
                  <td className="px-4 py-4 text-right font-semibold" data-sort-value={item.estimated_value || 0}>{item.estimated_value ? money(item.estimated_value) : "-"}</td>
                  <td className="px-4 py-4" data-sort-value={item.next_follow_up || ""}>{item.next_follow_up ? new Date(item.next_follow_up).toLocaleDateString("en-GB") : "-"}</td>
                  <td className="px-4 py-4"><Link to={`/opportunities/${item.id}`} onClick={(event) => event.stopPropagation()} className="inline-flex rounded-lg border px-3 py-2 font-semibold">View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <EmptyState title="No opportunities found" description="Create an opportunity or adjust the current filters." />
      )}
    </div>
  );
}

export function StatCard({ label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function OpportunityCard({ item }) {
  return (
    <article className="crm-opportunity-card rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-400">
            {item.reference_no || `OPP-${item.id}`}
          </p>
          <Link
            to={`/opportunities/${item.id}`}
            className="mt-0.5 block break-words text-lg font-bold text-slate-900 hover:text-amber-700"
          >
            {item.title}
          </Link>
        </div>
        <StatusBadge status={item.stage} label={stageLabel(item.stage)} tone={opportunityTone(item.stage)} />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-700">
        {item.customer_name}
        <span className="font-normal text-slate-400"> · {item.customer_mobile}</span>
      </p>
      <p className="mt-0.5 break-words text-sm text-slate-500">
        {item.property_name || item.service_name}
      </p>
      <div className="crm-opportunity-card-metadata">
        <span><strong>Estimated value</strong>{item.estimated_value ? money(item.estimated_value) : "Not set"}</span>
        <span><strong>Priority</strong>{priorityLabel(item.priority)}</span>
        <span><strong>Source</strong>{sourceLabel(item.source)}</span>
        <span><strong>Next follow-up</strong>{item.next_follow_up ? new Date(item.next_follow_up).toLocaleDateString("en-IN") : "Not scheduled"}</span>
      </div>
      {item.customer_mobile && <a href={`tel:${item.customer_mobile}`} aria-label={`Call ${item.customer_name}`} className="crm-opportunity-call"><Phone className="h-4 w-4" aria-hidden="true" />Call customer</a>}
    </article>
  );
}

function sourceLabel(value) {
  return SOURCE_OPTIONS.find(([option]) => option === value)?.[1] || stageLabel(value) || "Not recorded";
}

function priorityLabel(value) {
  return PRIORITY_OPTIONS.find(([option]) => option === value)?.[1] || "Not set";
}

function opportunityTone(value) {
  if (["WON", "COMPLETED"].includes(value)) return "success";
  if (["LOST", "CANCELLED"].includes(value)) return "danger";
  if (["FOLLOW_UP", "NEGOTIATION"].includes(value)) return "warning";
  if (["NEW", "CONTACTED", "SITE_VISIT", "MEASUREMENT", "QUOTATION", "IN_PROGRESS"].includes(value)) return "info";
  return "neutral";
}
