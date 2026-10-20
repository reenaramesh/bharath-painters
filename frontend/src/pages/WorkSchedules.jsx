import useMobileView from "../hooks/useMobileView.js";
import "./mobile-workspace.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { needsKickoffAdvance, resolveScheduleQuery, schedulableQuotations } from "../utils/salesHandoffs.js";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Paintbrush,
  Plus,
  Search,
} from "lucide-react";
import api from "../api/client";
import ContractorDialog from "../components/ContractorDialog";
import { previewPdf } from "../components/PdfPreview";
import useAuth from "../context/useAuth";
import MobilePageBack from "../components/MobilePageBack";
import ScheduleWorkspaceNav from "../components/ScheduleWorkspaceNav";
import ScheduleApprovalMethod from "../components/ScheduleApprovalMethod";
import { Button, EmptyState, ErrorState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./jobs-schedules.css";

const filters = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "CANCELLED",
];
const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const tomorrowKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateKey(date);
};

export default function WorkSchedules() {
  const mobile = useMobileView();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const kickoffQueue = user.role === "CONTRACTOR" && params.get("queue") === "kickoff";
  const [loaded, setLoaded] = useState(false);
  const handledQuery = useRef("");
  const propertyId = params.get("property_id") || "";
  const [items, setItems] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [painters, setPainters] = useState([]);
  const [form, setForm] = useState({
    quotation: "",
    start_date: todayKey(),
    end_date: tomorrowKey(),
    reason: "",
    scheduling_mode: "PORTAL",
  });
  const [showForm, setShowForm] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [datePreset, setDatePreset] = useState("UPCOMING");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return dateKey(d);
  });
  const [dateTo, setDateTo] = useState(todayKey());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const calls = [
        api.get("/jobs/work-schedules/", { params: propertyId ? { property_id: propertyId } : {} }),
        api.get(
          user.role === "CUSTOMER"
            ? "/quotations/customer-portal/quotations/"
            : "/quotations/?include_converted=true",
          user.role === "CUSTOMER" && propertyId ? { params: { property_id: propertyId } } : {},
        ),
      ];
      if (user.role === "CONTRACTOR") calls.push(api.get("/jobs/my-team/"));
      const responses = await Promise.all(calls);
      setItems(responses[0].data);
      setQuotations(responses[1].data.results || responses[1].data);
      setLoaded(true);
      if (responses[2]) setPainters(responses[2].data);
      setError("");
    } catch {
      setError("Work schedules could not be loaded.");
    }
  }, [user.role, propertyId]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);
  const schedulable = useMemo(
    () => schedulableQuotations(quotations, items).filter(q => !(user.role === "CUSTOMER" && q.accepted_via_receipt_at)),
    [items, quotations, user.role],
  );
  const contractorSchedulable = useMemo(() => user.role === "CONTRACTOR"
    ? schedulableQuotations(quotations, items, { contractorAuthorized: true }) : schedulable,
  [items, quotations, schedulable, user.role]);
  useEffect(() => {
    if (!kickoffQueue) return;
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
    setFilter("ALL");
    setSearch("");
  }, [kickoffQueue]);
  useEffect(() => {
    const quotation = params.get("quotation");
    if (!quotation) { handledQuery.current = ""; return; }
    if (!loaded || handledQuery.current === quotation) return;
    handledQuery.current = quotation;
    const target = resolveScheduleQuery(quotation, items, contractorSchedulable, quotations);
    setShowForm(false);
    if (target.kind === "reschedule") {
      if (user.role === "CONTRACTOR") navigate(target.path, { replace: true });
      else setError("These work dates need to be revised by your contractor.");
    } else if (target.kind === "schedule") {
      setExpanded(target.schedule.id);
      setDatePreset("ALL");
      setDateFrom("");
      setDateTo("");
      setFilter("ALL");
      setSearch("");
    } else if (target.kind === "proposal") {
      const selectedQuotation = quotations.find(item => String(item.id) === target.quotation);
      setForm(current => ({ ...current, quotation: target.quotation, scheduling_mode: user.role === "CONTRACTOR" && selectedQuotation?.status !== "ACCEPTED" ? "CONTRACTOR" : "PORTAL" }));
      setShowForm(true);
    } else if (target.kind === "unavailable") {
      setError("This quotation is unavailable for a new schedule. Select a current eligible quotation below.");
    }
  }, [params, loaded, items, quotations, contractorSchedulable, navigate, user.role]);

  const visible = useMemo(() => {
    const today = todayKey();
    const rows = items.filter((item) => {
      if ((item.status === "COMPLETED" && expanded !== item.id) || item.needs_reschedule) return false;
      if (kickoffQueue && !needsKickoffAdvance(item)) return false;
      const upcoming =
        item.end_date >= today &&
        !["COMPLETED", "CANCELLED"].includes(item.status);
      const matchesDate =
        datePreset === "ALL" ||
        (datePreset === "UPCOMING"
          ? upcoming
          : item.start_date >= dateFrom && item.start_date <= dateTo);
      return (
        (filter === "ALL" || item.status === filter) &&
        matchesDate &&
        [item.quotation_number, item.customer, item.property].some((value) =>
          value?.toLowerCase().includes(search.toLowerCase()),
        )
      );
    });
    return rows.sort((first, second) => {
      if (!sort.key && mobile) return (Date.parse(second.updated_at) || 0) - (Date.parse(first.updated_at) || 0) || Number(second.id) - Number(first.id);
      if (!sort.key) {
        return datePreset === "UPCOMING"
          ? first.start_date.localeCompare(second.start_date)
          : second.start_date.localeCompare(first.start_date);
      }
      const value = (item) => {
        if (sort.key === "quotation") return `${item.quotation_number || ""} ${item.customer || ""}`;
        if (sort.key === "dates") return item.start_date || "";
        if (sort.key === "schedule") return item.status || "";
        if (sort.key === "payment") return item.payment_status || "";
        if (sort.key === "painters") return Number(item.painters?.length || 0);
        return "";
      };
      const left = value(first);
      const right = value(second);
      const result = typeof left === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? result : -result;
    });
  }, [items, filter, search, datePreset, dateFrom, dateTo, sort, mobile, kickoffQueue, expanded]);
  function changeSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }
  function chooseDatePreset(value) {
    const today = new Date();
    setDatePreset(value);
    if (value === "ALL") {
      setDateFrom("");
      setDateTo("");
    }
    if (value === "UPCOMING") {
      setDateFrom(dateKey(today));
      setDateTo("");
    }
    if (value === "TODAY") {
      setDateFrom(dateKey(today));
      setDateTo(dateKey(today));
    }
    if (value === "LAST_7") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      setDateFrom(dateKey(start));
      setDateTo(dateKey(today));
    }
    if (value === "THIS_MONTH") {
      setDateFrom(dateKey(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(dateKey(today));
    }
  }
  const counts = useMemo(
    () => {
      const records = kickoffQueue ? items.filter(needsKickoffAdvance) : items;
      return Object.fromEntries(
        filters.map((value) => [
          value,
              value === "ALL"
            ? records.filter((item) => item.status !== "COMPLETED" && !item.needs_reschedule).length
            : records.filter((item) => item.status === value && !item.needs_reschedule).length,
        ]),
      );
    },
    [items, kickoffQueue],
  );
  const customerUpcoming = useMemo(
    () => items
      .filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status) && !item.needs_reschedule)
      .sort((first, second) => String(first.start_date || "").localeCompare(String(second.start_date || "")))[0],
    [items],
  );
  const customerJourney = user.role === "CUSTOMER" ? [
    { label: "Schedule created", active: items.length > 0 },
    { label: "Dates confirmed", active: items.some((item) => ["CONFIRMED", "IN_PROGRESS"].includes(item.status)) },
    { label: "Work started", active: items.some((item) => item.status === "IN_PROGRESS") },
    { label: "Completed", active: items.some((item) => item.status === "COMPLETED") },
  ] : [];

  async function propose(e) {
    e.preventDefault();
    if (form.start_date < todayKey())
      return setError("Start date cannot be earlier than today.");
    if (form.end_date < form.start_date)
      return setError("End date cannot be earlier than the start date.");
    setSaving(true);
    try {
      await api.post("/jobs/work-schedules/", {
        ...form,
        quotation: Number(form.quotation),
      });
      setForm({
        quotation: "",
        start_date: todayKey(),
        end_date: tomorrowKey(),
        reason: "",
        scheduling_mode: "PORTAL",
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(message(err, "Dates could not be proposed."));
    } finally {
      setSaving(false);
    }
  }
  async function accept(id) {
    setSaving(true);
    try {
      await api.post(`/jobs/work-schedules/${id}/accept/`);
      await load();
    } catch (err) {
      setError(message(err, "Schedule could not be accepted."));
    } finally {
      setSaving(false);
    }
  }
  async function openAssign(item) {
    try {
      const { data } = await api.get(
        `/jobs/my-team/?start_date=${encodeURIComponent(item.start_date)}&end_date=${encodeURIComponent(item.end_date)}&schedule_id=${item.id}`,
      );
      setPainters(data);
      setAssigning(item);
      setSelected(item.painters.filter((p) => ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(p.status)).map((p) => p.id));
      setError("");
    } catch (err) {
      setError(
        message(err, "Available Paint Applicators could not be loaded."),
      );
    }
  }
  async function savePainters(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/jobs/work-schedules/${assigning.id}/painters/`, {
        painters: selected,
      });
      setAssigning(null);
      await load();
    } catch (err) {
      setError(message(err, "Paint Applicators could not be assigned."));
    } finally {
      setSaving(false);
    }
  }
  async function paymentAction(item, action) {
    let payload = { action };
    if (action === "REQUEST") {
      const amount = window.prompt(
        "Minimum advance amount to request:",
        item.advance_amount || "",
      );
      if (!amount) return;
      payload.amount = amount;
    }
    if (action === "SUBMIT") {
      const mode = (
        window.prompt("Payment mode: CASH, UPI, or ONLINE", "UPI") || ""
      )
        .trim()
        .toUpperCase();
      if (!mode) return;
      const reference =
        mode === "CASH"
          ? ""
          : window.prompt("Transaction reference / UTR:")?.trim();
      if (mode !== "CASH" && !reference) return;
      payload = {
        action,
        mode,
        reference,
        note: window.prompt("Payment note (optional):") || "",
      };
    }
    if (action === "RECORD") {
      const amount = window.prompt(
        "Advance amount received:",
        item.advance_amount || "",
      );
      if (!amount) return;
      const mode = (
        window.prompt("Payment mode: CASH, UPI, or ONLINE", "CASH") || ""
      )
        .trim()
        .toUpperCase();
      if (!["CASH", "UPI", "ONLINE"].includes(mode)) return;
      const reference =
        mode === "CASH"
          ? ""
          : window.prompt("Transaction reference / UTR:")?.trim();
      if (mode !== "CASH" && !reference) return;
      payload = {
        action,
        amount,
        mode,
        reference,
        note: window.prompt("Payment note (optional):") || "",
      };
    }
    if (
      action === "CONFIRM" &&
      !window.confirm("Confirm that the advance payment has been received?")
    )
      return;
    if (
      action === "RECORD" &&
      !window.confirm("Record this payment as received and confirm it?")
    )
      return;
    setSaving(true);
    try {
      await api.post(`/jobs/work-schedules/${item.id}/payment/`, payload);
      await load();
    } catch (err) {
      setError(message(err, "Payment could not be updated."));
    } finally {
      setSaving(false);
    }
  }
  async function downloadAdvanceReceipt(item) {
    try {
      const url = item.project_receipt_id
        ? `/billing/${user.role === "CUSTOMER" ? "customer-finance" : "contractor-revenue"}/receipts/${item.project_receipt_id}/pdf/`
        : `/jobs/work-schedules/${item.id}/advance-receipt/`;
      const response = await api.get(
        url,
        { responseType: "blob" },
      );
      previewPdf(
        response.data,
        `${item.advance_receipt_number || "advance-receipt"}.pdf`,
      );
    } catch (err) {
      setError(message(err, "Advance receipt could not be previewed."));
    }
  }
  async function cancelUnpaid(item) {
    const reason = window
      .prompt("Reason for cancelling this unpaid schedule:")
      ?.trim();
    if (!reason || !window.confirm("Cancel this schedule?")) return;
    setSaving(true);
    try {
      await api.post(`/jobs/work-schedules/${item.id}/cancel/`, { reason });
      await load();
    } catch (err) {
      setError(message(err, "Schedule could not be cancelled."));
    } finally {
      setSaving(false);
    }
  }
  async function updateProgress(item, action) {
    if (
      !window.confirm(
        action === "START"
          ? "Start this work and notify the customer?"
          : "Mark this work completed and notify the customer?",
      )
    )
      return;
    setSaving(true);
    try {
      await api.post(`/jobs/work-schedules/${item.id}/progress/`, { action });
      await load();
    } catch (err) {
      setError(message(err, "Work status could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 jobs-schedules-page bp-work-schedules-page">
      <MobilePageBack />
      <PageHeader eyebrow={user.role === "CUSTOMER" ? "Your projects" : "Project planning"} title={user.role === "CUSTOMER" ? "Work dates & progress" : "Work schedules"} description="Review proposed dates, scheduled work and project progress." actions={<div className="flex flex-col gap-2 sm:flex-row">
          {contractorSchedulable.length > 0 && (
            <Button
              type="button"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" />
              {showForm ? "Close form" : user.role === "CUSTOMER" ? "Choose work dates" : "Schedule quotation"}
            </Button>
          )}
      </div>} />
      <ScheduleWorkspaceNav />
      {error && <ErrorState message={error} onRetry={load} className="min-h-0 rounded-2xl border border-red-100 bg-white p-5" />}
      {kickoffQueue && <SectionCard title="Kickoff queue" description="Current accepted quotations needing dates, and scheduled work with advances awaiting action.">
        {!loaded ? <p className="text-sm text-slate-500">Loading kickoff queue...</p> : <>
          <div className="mb-4 flex justify-end"><Link to="/work-schedules" className="text-sm font-semibold text-slate-700 underline">View all work schedules</Link></div>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Accepted quotations needing dates ({schedulable.length})</h2>
          {schedulable.length ? <div className="space-y-3">{schedulable.map(q => <article key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div><p className="font-semibold text-slate-900">{q.quotation_number || q.number}</p><p className="text-sm text-slate-500">{q.customer_details?.name || q.customer_name || "Customer"} / {q.property_name || "Property"}</p></div>
            <Button variant="secondary" onClick={() => { setForm(current => ({ ...current, quotation: String(q.id), scheduling_mode: "PORTAL" })); setShowForm(true); }}>Propose work dates</Button>
          </article>)}</div> : <p className="text-sm text-slate-500">No accepted quotations are waiting for dates.</p>}
          {items.filter(item => item.needs_reschedule && needsKickoffAdvance(item)).map(item => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3"><p className="text-sm text-amber-800">{item.quotation_number}: revise the work dates before continuing.</p><Link to="/work-reschedules" className="text-sm font-semibold text-amber-900 underline">Reschedule work</Link></div>)}
        </>}
      </SectionCard>}
      {user.role === "CUSTOMER" && (
        <section className="customer-schedule-journey" aria-label="Project journey">
          <div className="customer-schedule-journey-heading">
            <div>
              <p className="customer-schedule-kicker">Your project journey</p>
              <h2 className="bp-ui-section-heading">From accepted quotation to finished work</h2>
            </div>
            {customerUpcoming && (
              <div className="customer-schedule-next">
                <span>Next scheduled work</span>
                <strong>{formatDate(customerUpcoming.start_date)}</strong>
                <small>{customerUpcoming.property || "Your property"}</small>
              </div>
            )}
          </div>
          <ol className="customer-schedule-steps">
            {customerJourney.map((step, index) => (
              <li key={step.label} className={step.active ? "is-active" : ""}>
                <span className="customer-schedule-step-marker">{index + 1}</span>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <SectionCard title={kickoffQueue ? "Schedules awaiting kickoff advances" : datePreset === "UPCOMING" ? "Upcoming work" : "Schedule records"}  className="schedule-list-card" bodyClassName="p-0">
        <div className="schedule-list-toolbar flex flex-col gap-3 border-b p-3 xl:flex-row xl:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
      <input
              type="search"
              aria-label="Search work schedules"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={user.role === "CUSTOMER" ? "Search quotation or property" : "Search quotation, customer, or property"}
              className="w-full bg-transparent text-sm outline-none bp-ui-control"
            />
          </label>
          <select
            aria-label="Filter schedule dates"
            value={datePreset}
            onChange={(e) => chooseDatePreset(e.target.value)}
            className="rounded-xl border px-4 py-2.5 text-sm bp-ui-control"
          >
            <option value="UPCOMING">Upcoming schedules</option>
            <option value="ALL">All dates</option>
            <option value="TODAY">Today</option>
            <option value="LAST_7">Past 7 days</option>
            <option value="THIS_MONTH">This month</option>
            <option value="CUSTOM">Custom dates</option>
          </select>
          <div className="schedule-status-scroll flex gap-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Schedule status filters">
            {filters.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={(`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`) + " bp-ui-action"}
              >
                {label(value)}{" "}
                <span className="ml-1 opacity-70">{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
        {datePreset === "CUSTOM" && (
          <div className="flex gap-2 border-b p-3">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm bp-ui-control"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm bp-ui-control"
            />
          </div>
        )}
        {visible.length ? (
          <div className="schedule-grid-scroll">
            <div className="schedule-summary-grid schedule-summary-head">
              <SortHeader label="Project" column="quotation" sort={sort} onSort={changeSort} />
              <SortHeader label="Work dates" column="dates" sort={sort} onSort={changeSort} />
              <SortHeader label="Status" column="schedule" sort={sort} onSort={changeSort} />
              <SortHeader label={user.role === "CUSTOMER" ? "Work team" : "Assigned painters"} column="painters" sort={sort} onSort={changeSort} />
              <span>Details</span>
            </div>
            <div className="min-w-0 divide-y">
              {visible.map((item) => (
                <ProjectRow
                  key={item.id}
                  item={item}
                  role={user.role}
                  saving={saving}
                  expanded={expanded === item.id}
                  onToggle={() =>
                    setExpanded(expanded === item.id ? null : item.id)
                  }
                  onAccept={accept}
                  onAssign={openAssign}
                  onPayment={paymentAction}
                  onReceipt={downloadAdvanceReceipt}
                  onCancel={cancelUnpaid}
                  onProgress={updateProgress}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="No schedules match this view"  />
        )}
      </SectionCard>
      {showForm && (
        <ScheduleModal error={error} onClose={() => setShowForm(false)}>
          <ScheduleForm
            form={form}
            setForm={setForm}
            quotations={user.role === "CONTRACTOR" && form.scheduling_mode === "CONTRACTOR" ? contractorSchedulable : schedulable}
            items={items}
            role={user.role}
            saving={saving}
            onSubmit={propose}
          />
        </ScheduleModal>
      )}
      {assigning && (
        <PainterModal
          item={assigning}
          error={error}
          painters={painters}
          selected={selected}
          setSelected={setSelected}
          saving={saving}
          onClose={() => setAssigning(null)}
          onSubmit={savePainters}
        />
      )}
    </div>
  );
}

function SortHeader({ label: text, column, sort, onSort }) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={(`flex items-center gap-1 text-left transition hover:text-slate-700 ${active ? "text-slate-900" : ""}`) + " bp-ui-action"}
      aria-label={`Sort by ${text}`}
    >
      <span>{text}</span>
      {active && sort.direction === "desc" ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronUp className={`h-3.5 w-3.5 ${active ? "" : "opacity-35"}`} />
      )}
    </button>
  );
}

function ProjectRow({
  item,
  role,
  saving,
  expanded,
  onToggle,
  onAccept,
  onAssign,
  onPayment,
  onReceipt,
  onCancel,
  onProgress,
}) {
  const myAccepted =
    role === "CUSTOMER" ? item.customer_accepted : item.contractor_accepted;
  const paid = item.payment_status === "CONFIRMED";
  const ready = item.painters.length > 0;
  const nextAction =
    item.status === "PENDING" && !myAccepted && (role !== "CUSTOMER" || item.property_access?.permissions?.approve_quotations) ? (
      <Action onClick={() => onAccept(item.id)} disabled={saving} primary>
        Accept dates
      </Action>
    ) : role === "CONTRACTOR" &&
      item.status === "CONFIRMED" &&
      ready &&
      item.payment_status !== "CONFIRMED" ? (
      <span className="text-sm font-semibold text-amber-700">
        Waiting for advance payment
      </span>
    ) : role === "CONTRACTOR" &&
      item.status === "CONFIRMED" &&
      ready &&
      item.start_date > todayKey() ? (
      <span className="text-sm font-semibold text-indigo-700">
        Starts on {item.start_date}
      </span>
    ) : role === "CONTRACTOR" && item.status === "CONFIRMED" && ready && paid ? (
      <Action onClick={() => onProgress(item, "START")} primary>
        Start work
      </Action>
    ) : role === "CONTRACTOR" && item.status === "IN_PROGRESS" ? (
      <Action onClick={() => onProgress(item, "COMPLETE")} primary>
        Complete work
      </Action>
    ) : (
      <span className="text-sm text-slate-400">No action required</span>
    );
  return (
    <article className={`bg-white ${role === "CUSTOMER" ? "customer-schedule-record" : ""}`}>
      <div className="schedule-summary-grid schedule-summary-row">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-950 bp-ui-section-heading">{item.quotation_number}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-700">{role === "CUSTOMER" ? item.property : item.customer}</p>
          <p className="mt-0.5 text-xs text-slate-500">{role === "CUSTOMER" ? `With ${item.contractor}` : item.property}</p>
        </div>
        <div><p className="schedule-mobile-label">Work dates</p><p className="text-sm font-semibold">{formatDate(item.start_date)}</p><p className="mt-1 text-xs text-slate-500">to {formatDate(item.end_date)}</p></div>
        <div className="flex flex-wrap items-start gap-2"><Status value={item.status} />{item.scheduling_mode === "CONTRACTOR" && <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Contractor-authorized</span>}</div>
        <div className="schedule-painters">
          <p className="schedule-mobile-label">{role === "CUSTOMER" ? "Work team" : "Assigned painters"}</p>
          {item.painters.length ? <ul className="space-y-1">{item.painters.map(painter => <li key={painter.assignment_id || painter.id} className="flex flex-wrap items-center gap-1 text-sm"><span className="font-semibold text-slate-800">{painter.name}</span><span className="text-xs text-slate-500">{label(painter.status || "ASSIGNED")}</span></li>)}</ul> : <p className="text-sm text-slate-500">No painters assigned</p>}
          {role === "CONTRACTOR" && item.status === "CONFIRMED" && <button type="button" onClick={() => onAssign(item)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-indigo-700 bp-ui-action"><Paintbrush className="h-4 w-4" aria-hidden="true" />Manage painters</button>}
        </div>
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`schedule-details-${item.id}`} className="schedule-details-toggle inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold text-indigo-700 bp-ui-action">{expanded ? "Hide details" : "View details"}{expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}</button>
      </div>
      {expanded && (
        <div id={`schedule-details-${item.id}`} className="grid gap-3 border-t bg-slate-50/60 p-4 md:grid-cols-3 lg:p-5">
          <Detail title="Schedule details">
            {item.scheduling_mode === "CONTRACTOR" && <p className="font-semibold text-blue-700">Contractor-authorized dates — portal approval not required.</p>}
            <p>
              {role === "CUSTOMER" ? "You" : "Customer"}: <b>{item.customer_accepted ? "Accepted" : item.scheduling_mode === "CONTRACTOR" ? "Not approved in portal" : "Pending"}</b>
            </p>
            <p>
              Contractor:{" "}
              <b>{item.contractor_accepted ? "Accepted" : "Pending"}</b>
            </p>
            {item.previous_start_date && (
              <p className="text-slate-500">
                Previous: {item.previous_start_date} to {item.previous_end_date}
              </p>
            )}
            {item.reschedule_reason && (
              <p className="text-amber-700">Reason: {item.reschedule_reason}</p>
            )}
          </Detail>
          <Detail title="Advance & receipts">
            <p>
              Status: <b>{role === "CUSTOMER" ? customerPaymentLabel(item.payment_status) : label(item.payment_status)}</b>
            </p>
            {Number(item.advance_amount) > 0 && (
              <p>
                Amount:{" "}
                <b>₹{Number(item.advance_amount).toLocaleString("en-IN")}</b>
              </p>
            )}
            {item.payment_mode && (
              <p>
                {item.payment_mode}
                {item.payment_reference && ` | ${item.payment_reference}`}
              </p>
            )}
            <PaymentActions item={item} role={role} onPayment={onPayment} />
            {paid && item.advance_receipt_number && (
              <button
                type="button"
                onClick={() => onReceipt(item)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 bp-ui-action"
              >
                <Download className="h-4 w-4" />
                Download receipt
              </button>
            )}
            {paid && (
              null
            )}
            {role === "CONTRACTOR" && !paid && item.status === "CONFIRMED" && (
              <button
                onClick={() => onCancel(item)}
                className="mt-2 text-sm font-semibold text-red-600 bp-ui-action"
              >
                Cancel unpaid schedule
              </button>
            )}
          </Detail>
          <Detail title="Work progress">
            <div className="flex flex-wrap gap-2">{nextAction}</div>
            {item.work_started_at && (
              <p className="text-slate-500">
                Started: {new Date(item.work_started_at).toLocaleString()}
              </p>
            )}
            {item.work_completed_at && (
              <p className="text-emerald-700">
                Completed: {new Date(item.work_completed_at).toLocaleString()}
              </p>
            )}
            {item.cancellation_reason && (
              <p className="text-red-600">
                Cancelled: {item.cancellation_reason}
              </p>
            )}
          </Detail>
        </div>
      )}
    </article>
  );
}

function ScheduleForm({
  form,
  setForm,
  quotations,
  items,
  role,
  saving,
  onSubmit,
}) {
  const rescheduling = items.some(
    (item) => String(item.quotation) === String(form.quotation),
  );
  const today = todayKey();
  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_auto]"
    >
      {role === "CONTRACTOR" && <div className="xl:col-span-4"><ScheduleApprovalMethod value={form.scheduling_mode || "PORTAL"} disabled={saving} onChange={mode => setForm(current => ({ ...current, scheduling_mode: mode, quotation: "" }))} /></div>}
      <label className="text-sm font-semibold">
        {role === "CONTRACTOR" && form.scheduling_mode === "CONTRACTOR" ? "Quotation" : "Accepted quotation"}
        <select
          required
          value={form.quotation}
          onChange={(e) => setForm({ ...form, quotation: e.target.value })}
          className="mt-2 w-full rounded-xl border px-3 py-3 font-normal bp-ui-control"
        >
          <option value="">Select quotation</option>
          {quotations.map((q) => (
            <option key={q.id} value={q.id}>
              {q.quotation_number || q.number} - {q.customer_details?.name || q.customer_name || "Customer"}
            </option>
          ))}
        </select>
      </label>
      <DateField
        label="Start date"
        min={today}
        value={form.start_date}
        onChange={(value) =>
          setForm({
            ...form,
            start_date: value,
            end_date:
              form.end_date && form.end_date < value ? "" : form.end_date,
          })
        }
      />
      <DateField
        label="End date"
        min={form.start_date || today}
        value={form.end_date}
        onChange={(value) => setForm({ ...form, end_date: value })}
      />
      <button
        disabled={saving}
        className="self-end rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white bp-ui-action"
      >
        {form.scheduling_mode === "CONTRACTOR" ? "Authorize work dates" : rescheduling ? "Send revised dates" : "Propose dates"}
      </button>
      {role === "CONTRACTOR" && rescheduling && (
        <label className="text-sm font-semibold xl:col-span-4">
          Reason for rescheduling *
          <textarea
            required
            rows="2"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="mt-2 w-full rounded-xl border px-3 py-3 font-normal bp-ui-control"
          />
        </label>
      )}
    </form>
  );
}
function ScheduleModal({ children, onClose, error }) {
  return <ContractorDialog title="Schedule work dates" description="Request portal approval or authorize the dates yourself." icon={CalendarDays} onClose={onClose}>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {children}
  </ContractorDialog>;
}
function PainterModal({
  item,
  painters,
  selected,
  setSelected,
  saving,
  onClose,
  onSubmit,
  error,
}) {
  function toggle(p) {
    setSelected((current) =>
      current.includes(p.id)
        ? current.filter((id) => id !== p.id)
        : [...current, p.id],
    );
  }
  return (
    <ContractorDialog title="Assign verified Paint Applicators" description={`Select applicators for ${item.start_date} to ${item.end_date}. Payment and wages are handled separately.`} icon={Paintbrush} size="md" onClose={onClose}>
      <form onSubmit={onSubmit}>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 max-h-[55vh] space-y-2 overflow-y-auto">
          {painters.map((p) => {
            const chosen = selected.includes(p.id);
            return (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"
              >
                <input
                  type="checkbox"
                  checked={chosen}
                  onChange={() => toggle(p)}
                />
                <Paintbrush className="h-5 w-5" />
                <span>
                  <b>{p.name}</b>
                  <small className="block text-slate-500">
                    {p.mobile} | {p.experience_years} years
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        <button
          disabled={saving || selected.length === 0}
          className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-40 bp-ui-action"
        >
          Assign Paint Applicators
        </button>
      </form>
    </ContractorDialog>
  );
}
function Action({ children, onClick, disabled, primary }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={(`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${primary ? "bg-slate-950 text-white" : "border bg-white"}`) + " bp-ui-action"}
    >
      {children}
    </button>
  );
}
function Detail({ title, children }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-sm">
      <h3 className="mb-2 font-bold">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function PaymentActions({ item, role, onPayment }) {
  if (item.status !== "CONFIRMED")
    return (
      null
    );
  if (role === "CONTRACTOR" && item.payment_status === "NOT_REQUESTED")
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => onPayment(item, "REQUEST")}
          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white bp-ui-action"
        >
          Request advance
        </button>
        <button
          onClick={() => onPayment(item, "RECORD")}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white bp-ui-action"
        >
          Payment received directly
        </button>
        
      </div>
    );
  if (role === "CUSTOMER" && item.property_access?.permissions?.make_payment && item.payment_status === "AWAITING_PAYMENT")
    return (
      <button
        onClick={() => onPayment(item, "SUBMIT")}
        className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white bp-ui-action"
      >
        Submit payment
      </button>
    );
  if (role === "CONTRACTOR" && item.payment_status === "PENDING_CONFIRMATION")
    return (
      <button
        onClick={() => onPayment(item, "CONFIRM")}
        className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white bp-ui-action"
      >
        Confirm receipt
      </button>
    );
  return (
    <p className="mt-2 text-xs text-emerald-700">
      Payment recorded separately from booking.
    </p>
  );
}
function Status({ value }) {
  const tone = value === "COMPLETED" ? "success" : value === "CANCELLED" ? "danger" : value === "PENDING" ? "warning" : "info";
  return <StatusBadge status={value} label={label(value)} tone={tone} />;
}
function DateField({ label: fieldLabel, value, onChange, min }) {
  return (
    <label className="text-sm font-semibold">
      {fieldLabel}
      <input
        required
        type="date"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border px-3 py-3 font-normal bp-ui-control"
      />
    </label>
  );
}
function label(value) {
  if (value === "CONFIRMED") return "Scheduled";
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function customerPaymentLabel(value) {
  return ({
    NOT_REQUESTED: "No advance requested",
    AWAITING_PAYMENT: "Advance payment due",
    PENDING_CONFIRMATION: "Payment submitted",
    CONFIRMED: "Paid",
  })[value] || label(value);
}
function message(error, fallback) {
  return (
    Object.values(error.response?.data || {})
      .flat()
      .join(" ") || fallback
  );
}

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
