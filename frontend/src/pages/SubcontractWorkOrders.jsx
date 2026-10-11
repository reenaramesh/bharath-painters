import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Network, Plus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { StatusBadge } from "../components/ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";
import CreateSubcontractOffer from "../components/CreateSubcontractOffer";
import "./subcontract-work-orders-list.css";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Awaiting response" },
  { value: "ACTIVE", label: "In progress" },
  { value: "SUBMITTED_FOR_REVIEW", label: "Awaiting review" },
  { value: "COMPLETED", label: "Completed" },
];

const SORT_COLUMNS = [
  ["NAME", "Work order"], ["CONTRACTOR", "Contractor"], ["DATE", "Created date"],
  ["START", "Start date"], ["STATUS", "Status"], ["AMOUNT", "Agreed value"],
];

export default function SubcontractWorkOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("DATE_DESC");
  // Quotation links open the offer picker; the sender chooses the service lines.
  const [creating, setCreating] = useState(Boolean(searchParams.get("quotation") || searchParams.get('contractor')));
  const presetQuotation = searchParams.get("quotation") || "";

  const closeCreate = () => {
    setCreating(false);
    if (searchParams.get("quotation") || searchParams.get("scope") || searchParams.get('contractor')) setSearchParams({});
  };

  const load = useCallback(
    () =>
      api
        .get("/outsourcing/work-orders/")
        .then(({ data }) => {
          setRows(Array.isArray(data) ? data : data?.results || []);
          setError("");
        })
        .catch((err) => setError(apiErrorMessage(err, "Subcontract work could not be loaded.")))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const tally = {};
    for (const row of rows) tally[row.status] = (tally[row.status] || 0) + 1;
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    const selected = rows.filter((row) => filter === "ALL" || (filter === "ACTIVE"
      ? ["ACCEPTED", "SCHEDULED", "IN_PROGRESS", "CORRECTION_REQUESTED"].includes(row.status)
      : row.status === filter));
    const date = (value) => { const time = Date.parse(value); return Number.isFinite(time) ? time : null; };
    return selected.sort((a, b) => {
      let comparison = 0;
      const descending = sort.endsWith("_DESC");
      const key = sort.replace(/_(ASC|DESC)$/, "");
      if (key === "NAME") comparison = (a.project_title || "").localeCompare(b.project_title || "");
      else if (key === "CONTRACTOR") {
        const name = row => (row.viewer_authority === "MAIN" ? row.receiving_contractor_name : row.main_contractor_name) || "";
        comparison = name(a).localeCompare(name(b));
      }
      else if (key === "STATUS") comparison = a.status.localeCompare(b.status);
      else if (key === "AMOUNT") comparison = Number(a.agreed_amount || 0) - Number(b.agreed_amount || 0);
      else {
        const first = date(key === "START" ? a.required_start_date : a.created_at);
        const second = date(key === "START" ? b.required_start_date : b.created_at);
        if (first === null || second === null) return (first === second ? 0 : first === null ? 1 : -1) || Number(b.id) - Number(a.id);
        else comparison = first - second;
      }
      return comparison * (descending ? -1 : 1) || Number(b.id) - Number(a.id);
    });
  }, [rows, filter, sort]);

  const isCustomer = user?.role === "CUSTOMER";

  return (
    <div className="subcontract-orders-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-600">Outsourcing</p>
          <h1 className="mt-1 text-3xl font-bold">Subcontract Work Orders</h1>
          
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/contractor-network"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            <Network className="h-4 w-4" /> Contractor Network
          </Link>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Send work
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total work orders" value={rows.length} />
        <Metric label="Awaiting review" value={counts.SUBMITTED_FOR_REVIEW || 0} tone="amber" />
        <Metric label="In progress" value={counts.IN_PROGRESS || 0} tone="blue" />
        <Metric
          label="Agreed value"
          value={rupees(rows.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0))}
          tone="green"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="wo-list-toolbar">
        <p role="status" className="text-sm text-slate-500">{visible.length} work order{visible.length === 1 ? "" : "s"}</p>
      </div>

      {loading ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          Loading subcontract work…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          {rows.length === 0
            ? isCustomer
              ? "Subcontract work is between contractors and is not shown on customer accounts."
              : "No subcontract work yet. Connect with another contractor to send work."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <div className="wo-order-list">
          <div className="wo-order-columns" role="group" aria-label="Sort work orders by column">{SORT_COLUMNS.map(([key, label]) => {
            const active = sort.replace(/_(ASC|DESC)$/, "") === key;
            const descending = active && sort.endsWith("_DESC");
            const Icon = active ? descending ? ArrowDown : ArrowUp : ArrowUpDown;
            return <button key={key} type="button" aria-pressed={active} aria-label={`${label}, ${active ? descending ? "descending" : "ascending" : "not sorted"}. Sort ${active && !descending ? "descending" : "ascending"}`} onClick={() => setSort(active && !descending ? `${key}_DESC` : key === "DATE" || key === "AMOUNT" ? `${key}_ASC` : key)}><span>{label}</span><Icon size={14} aria-hidden="true"/></button>;
          })}</div>
          <ul aria-label="Subcontract work orders">{visible.map(row => <li key={row.id}><WorkOrderRow row={row}/></li>)}</ul>
        </div>
      )}

      {creating && (
        <CreateSubcontractOffer
          initialQuotation={presetQuotation}
          initialContractor={searchParams.get('contractor') || ''}
          onClose={closeCreate}
          onCreated={(draft) => {
            closeCreate();
            if (draft?.material_mode) navigate(`/subcontract-work-orders/${draft.id}`);
            else load();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    blue: "text-sky-600",
    green: "text-emerald-600",
  };
  return (
    <article className="rounded-2xl border bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </article>
  );
}

function WorkOrderRow({ row }) {
  const sent = row.viewer_authority === "MAIN";
  const counterparty = sent ? row.receiving_contractor_name : row.main_contractor_name;
  const openCorrections = row.correction_requests?.filter(item => !item.resolved_at).length || 0;
  return <Link to={`/subcontract-work-orders/${row.id}`} className="wo-order-row">
    <div className="wo-order-title"><span className="text-xs font-mono text-slate-500">{row.reference}</span><h3 className="font-bold">{row.project_title || "Subcontract work"}</h3><p className="text-xs text-slate-500">{row.scopes?.length || 0} scope{row.scopes?.length === 1 ? "" : "s"}</p>{openCorrections > 0 && <p className="text-xs font-semibold text-amber-700">{openCorrections} correction{openCorrections > 1 ? "s" : ""} open</p>}</div>
    <div className="wo-order-party"><small>{sent ? "Sent to" : "Received from"}</small><span>{counterparty || "\u2014"}</span></div>
    <div><small>Created date</small><time dateTime={row.created_at || undefined}>{prettyDate(row.created_at)}</time></div>
    <div><small>Start date</small><time dateTime={row.required_start_date || undefined}>{prettyDate(row.required_start_date)}</time></div>
    <div><small>Status</small><StatusBadge status={row.status}/></div>
    <div className="wo-order-amount"><small>Agreed value</small><strong>{Number(row.agreed_amount) > 0 ? rupees(row.agreed_amount) : "Awaiting quote"}</strong></div>
  </Link>;
}
