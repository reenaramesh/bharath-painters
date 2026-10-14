import useMobileView from "../hooks/useMobileView.js";
import { workOrderPriority } from "../utils/workspaceLists.js";
import "./mobile-workspace.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { StatusBadge } from "../components/ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";
import CreateSubcontractOffer from "../components/CreateSubcontractOffer";
import WorkOrderNetworkTabs from "../components/WorkOrderNetworkTabs";
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
  const mobile = useMobileView();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("DEFAULT");
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
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    return selected.sort((a, b) => {
      if (sort === "DEFAULT" && mobile) return workOrderPriority(a,b,today);
      let comparison = 0;
      const descending = sort === "DEFAULT" || sort.endsWith("_DESC");
      const key = (sort === "DEFAULT" ? "DATE_DESC" : sort).replace(/_(ASC|DESC)$/, "");
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
  }, [rows, filter, sort, mobile]);

  const isCustomer = user?.role === "CUSTOMER";
  const effectiveSort = sort === "DEFAULT" && !mobile ? "DATE_DESC" : sort;

  return (
    <div className="subcontract-orders-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 bp-ui-page-header">
        <div>
          <p className="text-sm font-semibold text-amber-600">Outsourcing</p>
          <h1 className="mt-1 text-3xl font-bold bp-ui-page-title">Work Orders</h1>
          
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white bp-ui-action"
          >
            <Plus className="h-4 w-4" /> Create Work Order
          </button>
        </div>
      </header>

      <WorkOrderNetworkTabs />
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
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

      <div className="hidden flex-wrap gap-2 md:flex">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={(`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`) + " bp-ui-action"}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="mobile-square-summary wo-mobile-summary md:hidden" aria-label="Work order status filters">
        {FILTERS.map(option => <button key={option.value} type="button" className="mobile-square-stat bp-ui-action" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}><span>{option.label}</span><strong>{option.value === 'ALL' ? rows.length : option.value === 'ACTIVE' ? rows.filter(row => ['ACCEPTED','SCHEDULED','IN_PROGRESS','CORRECTION_REQUESTED'].includes(row.status)).length : counts[option.value] || 0}</strong></button>)}
        <div className="mobile-square-stat wo-mobile-value"><span>Agreed value</span><strong>{rupees(rows.reduce((sum,row) => sum+Number(row.agreed_amount || 0),0))}</strong></div>
      </section>

      <div className="wo-list-toolbar">
        <p role="status" className="text-sm text-slate-500">{visible.length} work order{visible.length === 1 ? "" : "s"}</p>
      </div>

      {loading ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          Loading subcontract work…
        </p>
      ) : visible.length === 0 ? (
        null
      ) : (
        mobile ? <WorkOrderTable rows={visible} sort={sort} onSort={setSort} mobile={mobile} /> : (
        <div className="wo-order-list">
          <div className="wo-order-columns" role="group" aria-label="Sort work orders by column">{SORT_COLUMNS.map(([key, label]) => {
            const active = effectiveSort.replace(/_(ASC|DESC)$/, "") === key;
            const descending = active && effectiveSort.endsWith("_DESC");
            const Icon = active ? descending ? ArrowDown : ArrowUp : ArrowUpDown;
            return <button className="bp-ui-action" key={key} type="button" aria-pressed={active} aria-label={`${label}, ${active ? descending ? "descending" : "ascending" : "not sorted"}. Sort ${active && !descending ? "descending" : "ascending"}`} onClick={() => setSort(active && !descending ? `${key}_DESC` : key === "DATE" || key === "AMOUNT" ? `${key}_ASC` : key)}><span>{label}</span><Icon size={14} aria-hidden="true"/></button>;
          })}</div>
          <ul aria-label="Subcontract work orders">{visible.map(row => <li key={row.id}><WorkOrderRow row={row}/></li>)}</ul>
        </div>
        )
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

function SortButton({ column, sort, onSort }) {
  const [key,label] = SORT_COLUMNS.find(([value]) => value === column);
  const active = sort.replace(/_(ASC|DESC)$/, '') === key;
  const descending = active && sort.endsWith('_DESC');
  const Icon = active ? descending ? ArrowDown : ArrowUp : ArrowUpDown;
  return <button className="bp-ui-action" type="button" aria-pressed={active} aria-label={`${label}, ${active ? descending ? 'descending' : 'ascending' : 'not sorted'}. Sort ${active && !descending ? 'descending' : 'ascending'}`} onClick={() => onSort(active && !descending ? `${key}_DESC` : key === 'DATE' || key === 'AMOUNT' ? `${key}_ASC` : key)}><span>{key === "AMOUNT" ? "Value" : label}</span><Icon size={12} aria-hidden="true" /></button>;
}

function WorkOrderTable({ rows, sort, onSort, mobile }) {
  const heading = (column) => <SortButton column={column} sort={sort} onSort={onSort} />;
  return <div className="wo-table-container">
    <table className={`wo-order-table ${mobile ? 'wo-compact-table' : ''}`} data-mobile-table="keep" aria-label="Subcontract work orders">
      <thead><tr>{mobile ? <>
        <th scope="col">{heading('NAME')}{heading('CONTRACTOR')}</th>
        <th scope="col">{heading('DATE')}{heading('START')}</th>
        <th scope="col">{heading('STATUS')}</th><th scope="col">{heading('AMOUNT')}</th>
      </> : SORT_COLUMNS.map(([key]) => <th key={key} scope="col" aria-sort={sort.replace(/_(ASC|DESC)$/,'') === key ? sort.endsWith('_DESC') ? 'descending' : 'ascending' : 'none'}>{heading(key)}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const sent = row.viewer_authority === 'MAIN';
        const counterparty = (sent ? row.receiving_contractor_name : row.main_contractor_name) || '\u2014';
        const corrections = row.correction_requests?.filter(item => !item.resolved_at).length || 0;
        const created = <time dateTime={row.created_at || undefined}>{prettyDate(row.created_at)}</time>;
        const start = <time dateTime={row.required_start_date || undefined}>{prettyDate(row.required_start_date)}</time>;
        return <tr key={row.id} data-work-order={row.id}>
          <td className="wo-table-title"><Link to={`/subcontract-work-orders/${row.id}`}><small>{row.reference}</small><strong>{row.project_title || 'Subcontract work'}</strong></Link>{mobile && <p><small>{sent ? 'To' : 'From'}</small> {counterparty}</p>}<small>{row.scopes?.length || 0} scopes</small>{corrections > 0 && <p className="text-amber-700">{corrections} corrections open</p>}</td>
          {!mobile && <td><small>{sent ? 'Sent to' : 'Received from'}</small>{counterparty}</td>}
          <td>{mobile && <small>Created</small>}{created}{mobile && <><small>Start</small>{start}</>}</td>
          {!mobile && <td>{start}</td>}
          <td><StatusBadge status={row.status} /></td>
          <td className="wo-table-amount">{Number(row.agreed_amount) > 0 ? rupees(row.agreed_amount) : 'Awaiting quote'}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
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
