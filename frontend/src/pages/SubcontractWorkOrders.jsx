import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Network, Plus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { StatusBadge } from "../components/ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";
import CreateSubcontractOffer from "../components/CreateSubcontractOffer";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Awaiting response" },
  { value: "ACTIVE", label: "In progress" },
  { value: "SUBMITTED_FOR_REVIEW", label: "Awaiting review" },
  { value: "COMPLETED", label: "Completed" },
];

export default function SubcontractWorkOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
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
    if (filter === "ALL") return rows;
    if (filter === "ACTIVE") {
      return rows.filter((row) =>
        ["ACCEPTED", "SCHEDULED", "IN_PROGRESS", "CORRECTION_REQUESTED"].includes(row.status),
      );
    }
    return rows.filter((row) => row.status === filter);
  }, [rows, filter]);

  const isCustomer = user?.role === "CUSTOMER";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-600">Outsourcing</p>
          <h1 className="mt-1 text-3xl font-bold">Subcontract Work Orders</h1>
          
        </div>
        <div className="flex gap-2">
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
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((row) => (
            <WorkOrderCard key={row.id} row={row} />
          ))}
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

function WorkOrderCard({ row }) {
  // The backend tells us which side of the trade this user is on, so the card
  // never guesses from names.
  const role = row.viewer_authority === "MAIN" ? "You sent this work" : "You received this work";
  const counterparty =
    row.viewer_authority === "MAIN" ? row.receiving_contractor_name : row.main_contractor_name;
  const openCorrections = row.correction_requests?.filter((item) => !item.resolved_at).length || 0;

  return (
    <Link
      to={`/subcontract-work-orders/${row.id}`}
      className="block rounded-2xl border bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-mono text-slate-500">{row.reference}</p>
          <h3 className="mt-1 truncate text-lg font-bold">{row.project_title || "Subcontract work"}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {role} · {counterparty || "—"}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Pricing</dt>
          <dd className="font-bold">{Number(row.agreed_amount) > 0 ? rupees(row.agreed_amount) : "Awaiting quote"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Scopes</dt>
          <dd className="font-bold">{row.scopes?.length || 0}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Start</dt>
          <dd className="font-bold">{prettyDate(row.required_start_date)}</dd>
        </div>
      </dl>

      {openCorrections > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          {openCorrections} correction{openCorrections > 1 ? "s" : ""} open
        </p>
      )}
    </Link>
  );
}
