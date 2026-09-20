import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  IndianRupee,
  Phone,
  Plus,
  Search,
  Target,
} from "lucide-react";
import api from "../api/client";
import {
  OPPORTUNITY_STAGES,
  STAGE_STYLES,
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">Sales</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Sales Opportunities
          </h1>
          <p className="mt-2 text-slate-500">
            Every service enquiry is a separate opportunity, even for an
            existing client.
          </p>
        </div>
        <button
          onClick={() => navigate("/opportunities/new")}
          className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          New Opportunity
        </button>
      </header>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{" "}
          <button onClick={load} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open" value={counts.open} tone="slate" />
        <StatCard label="New" value={counts.new} tone="blue" />
        <StatCard label="Follow-up due" value={counts.followUp} tone="amber" />
        <StatCard label="Quotation sent" value={counts.quotation} tone="cyan" />
        <StatCard label="Won" value={counts.won} tone="emerald" />
        <StatCard label="Lost" value={counts.lost} tone="red" />
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
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
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : items.length ? (
        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Opportunity</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Property / service</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Next follow-up</th><th className="px-4 py-3" data-no-sort="true">Action</th></tr>
              </thead>
              <tbody className="divide-y">{items.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/opportunities/${item.id}`)}>
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-slate-500">{item.reference_no || `OPP-${item.id}`}</td>
                  <td className="px-4 py-4 font-bold">{item.title}</td>
                  <td className="px-4 py-4"><p className="font-semibold">{item.customer_name}</p><p className="text-xs text-slate-500">{item.customer_mobile}</p></td>
                  <td className="px-4 py-4 text-slate-600">{item.property_name || item.service_name || "-"}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${STAGE_STYLES[item.stage] || "bg-slate-100 text-slate-600"}`}>{stageLabel(item.stage)}</span></td>
                  <td className="px-4 py-4 text-right font-semibold" data-sort-value={item.estimated_value || 0}>{item.estimated_value ? money(item.estimated_value) : "-"}</td>
                  <td className="px-4 py-4" data-sort-value={item.next_follow_up || ""}>{item.next_follow_up ? new Date(item.next_follow_up).toLocaleDateString("en-GB") : "-"}</td>
                  <td className="px-4 py-4"><Link to={`/opportunities/${item.id}`} onClick={(event) => event.stopPropagation()} className="inline-flex rounded-lg border px-3 py-2 font-semibold">View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border bg-white p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-900">
            No opportunities yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first sales opportunity to start tracking enquiries.
          </p>
          <Link
            to="/opportunities/new"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New Opportunity
          </Link>
        </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-400">
            {item.reference_no || `OPP-${item.id}`}
          </p>
          <Link
            to={`/opportunities/${item.id}`}
            className="mt-0.5 block truncate text-lg font-bold text-slate-900 hover:text-amber-700"
          >
            {item.title}
          </Link>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            STAGE_STYLES[item.stage] || "bg-slate-100 text-slate-600"
          }`}
        >
          {stageLabel(item.stage)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-700">
        {item.customer_name}
        <span className="font-normal text-slate-400"> · {item.customer_mobile}</span>
      </p>
      <p className="mt-0.5 truncate text-sm text-slate-500">
        {item.property_name || item.service_name}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {item.estimated_value && (
          <span className="flex items-center gap-1 font-semibold text-slate-700">
            <IndianRupee className="h-3.5 w-3.5" />
            {money(item.estimated_value)}
          </span>
        )}
        {item.next_follow_up && (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {new Date(item.next_follow_up).toLocaleDateString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Phone className="h-3.5 w-3.5" />
          <a href={`tel:${item.customer_mobile}`} className="hover:text-slate-800">
            Call
          </a>
        </span>
      </div>
    </div>
  );
}
