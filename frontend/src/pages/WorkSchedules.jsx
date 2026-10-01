import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Paintbrush,
  Plus,
  Search,
  X,
} from "lucide-react";
import api from "../api/client";
import { previewPdf } from "../components/PdfPreview";
import useAuth from "../context/useAuth";
import MobilePageBack from "../components/MobilePageBack";

const filters = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "CANCELLED",
];
const statusStyle = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};
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
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [painters, setPainters] = useState([]);
  const [form, setForm] = useState({
    quotation: "",
    start_date: todayKey(),
    end_date: tomorrowKey(),
    reason: "",
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
        api.get("/jobs/work-schedules/"),
        api.get(
          user.role === "CUSTOMER"
            ? "/quotations/customer-portal/quotations/"
            : "/quotations/?include_converted=true",
        ),
      ];
      if (user.role === "CONTRACTOR") calls.push(api.get("/jobs/my-team/"));
      const responses = await Promise.all(calls);
      setItems(responses[0].data);
      setQuotations(
        (responses[1].data.results || responses[1].data).filter(
          (q) => q.status === "ACCEPTED" && !(user.role === "CUSTOMER" && q.accepted_via_receipt_at),
        ),
      );
      if (responses[2]) setPainters(responses[2].data);
      setError("");
    } catch {
      setError("Work schedules could not be loaded.");
    }
  }, [user.role]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);
  useEffect(() => {
    const quotation = params.get("quotation");
    if (quotation) {
      setForm((current) => ({ ...current, quotation }));
      setShowForm(true);
    }
  }, [params]);

  const schedulable = useMemo(
    () => quotations.filter(
      (q) => !items.some((item) => String(item.quotation) === String(q.id)),
    ),
    [items, quotations],
  );
  const visible = useMemo(() => {
    const today = todayKey();
    const rows = items.filter((item) => {
      if (item.status === "COMPLETED" || item.needs_reschedule) return false;
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
  }, [items, filter, search, datePreset, dateFrom, dateTo, sort]);
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
    () =>
      Object.fromEntries(
        filters.map((value) => [
          value,
              value === "ALL"
            ? items.filter((item) => item.status !== "COMPLETED" && !item.needs_reschedule).length
            : items.filter((item) => item.status === value && !item.needs_reschedule).length,
        ]),
      ),
    [items],
  );

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
      setSelected(item.painters.map((p) => p.id));
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
    <div className="space-y-6">
      <MobilePageBack />
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Project planning
          </p>
          <h1 className="mt-1 text-3xl font-bold">Work schedules</h1>
          <p className="mt-2 text-slate-500">
            One organized record for dates, advance payment, Paint Applicators,
            and work progress.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {user.role === "CONTRACTOR" && (
            <Link
              to="/work-reschedules"
              className="flex items-center justify-center gap-2 rounded-xl border bg-white px-5 py-3 text-sm font-semibold text-slate-700"
            >
              <CalendarDays className="h-4 w-4" />
              Reschedule work
            </Link>
          )}
          {schedulable.length > 0 && (
            <button
              onClick={() => setShowForm((value) => !value)}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              {showForm ? "Close form" : "Schedule quotation"}
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="rounded-2xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-3 xl:flex-row xl:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation, customer, or property"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={datePreset}
            onChange={(e) => chooseDatePreset(e.target.value)}
            className="rounded-xl border px-4 py-2.5 text-sm"
          >
            <option value="UPCOMING">Upcoming schedules</option>
            <option value="ALL">All dates</option>
            <option value="TODAY">Today</option>
            <option value="LAST_7">Past 7 days</option>
            <option value="THIS_MONTH">This month</option>
            <option value="CUSTOM">Custom dates</option>
          </select>
          <div className="flex gap-2 overflow-x-auto">
            {filters.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
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
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        )}
        {visible.length ? (
          <div className="overflow-x-auto">
            <div className="hidden min-w-[1120px] grid-cols-[minmax(220px,1.4fr)_180px_130px_155px_120px_230px_44px] gap-4 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 lg:grid">
              <SortHeader label="Quotation / customer" column="quotation" sort={sort} onSort={changeSort} />
              <SortHeader label="Work dates" column="dates" sort={sort} onSort={changeSort} />
              <SortHeader label="Schedule" column="schedule" sort={sort} onSort={changeSort} />
              <SortHeader label="Payment" column="payment" sort={sort} onSort={changeSort} />
              <SortHeader label="Paint Applicators" column="painters" sort={sort} onSort={changeSort} />
              <span>Next action</span>
              <span />
            </div>
            <div className="min-w-0 divide-y lg:min-w-[1120px]">
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
          <div className="p-14 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-slate-500">No schedules match this view.</p>
          </div>
        )}
      </section>
      {showForm && (
        <ScheduleModal onClose={() => setShowForm(false)}>
          <ScheduleForm
            form={form}
            setForm={setForm}
            quotations={schedulable}
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
      className={`flex items-center gap-1 text-left transition hover:text-slate-700 ${active ? "text-slate-900" : ""}`}
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
    item.status === "PENDING" && !myAccepted ? (
      <Action onClick={() => onAccept(item.id)} disabled={saving} primary>
        Accept dates
      </Action>
    ) : role === "CONTRACTOR" &&
      item.status === "CONFIRMED" &&
      item.painters.length === 0 ? (
      <Action onClick={() => onAssign(item)} primary>
        Assign Paint Applicators
      </Action>
    ) : role === "CONTRACTOR" &&
      item.status === "CONFIRMED" &&
      item.payment_status === "NOT_REQUESTED" ? (
      <>
        <Action
          onClick={() => onPayment(item, "REQUEST")}
          disabled={saving}
          primary
        >
          Set advance
        </Action>
        <Action onClick={() => onPayment(item, "RECORD")} disabled={saving}>
          Payment received
        </Action>
      </>
    ) : role === "CUSTOMER" && item.payment_status === "AWAITING_PAYMENT" ? (
      <Action onClick={() => onPayment(item, "SUBMIT")} primary>
        Pay advance
      </Action>
    ) : role === "CONTRACTOR" &&
      item.payment_status === "PENDING_CONFIRMATION" ? (
      <Action onClick={() => onPayment(item, "CONFIRM")} primary>
        Confirm payment
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
    <article className="bg-white">
      <div className="p-4 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-slate-950">
              {item.quotation_number}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-slate-700">
              {item.customer}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {item.property}
            </p>
          </div>
          <Status value={item.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Work dates</p>
            <p className="mt-1 text-xs font-bold text-slate-800">{item.start_date}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">to {item.end_date}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payment</p>
            <p className={`mt-1 truncate text-xs font-bold ${paid ? "text-emerald-700" : "text-amber-700"}`}>
              {label(item.payment_status)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {item.advance_amount ? `₹${Number(item.advance_amount).toLocaleString("en-IN")}` : "No advance"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Paint Applicators</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-700">
              {item.painters.length || 0} assigned
            </p>
          </div>
          <button
            onClick={onToggle}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
          >
            {expanded ? "Hide details" : "View details"}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {nextAction}
        </div>
      </div>
      <div className="hidden gap-4 p-5 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_180px_130px_155px_120px_230px_44px] lg:items-center">
        <div className="min-w-0">
          <h2 className="truncate font-bold">{item.quotation_number}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">
            {item.customer} | {item.property}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">{item.start_date}</p>
          <p className="mt-1 text-xs text-slate-400">to {item.end_date}</p>
        </div>
        <Status value={item.status} />
        <div>
          <p
            className={`text-sm font-semibold ${paid ? "text-emerald-700" : "text-amber-700"}`}
          >
            {label(item.payment_status)}
          </p>
          {item.advance_amount && (
            <p className="mt-1 text-xs text-slate-500">
              ₹{Number(item.advance_amount).toLocaleString("en-IN")}
            </p>
          )}
        </div>
        <button
          disabled={role !== "CONTRACTOR" || item.status !== "CONFIRMED"}
          onClick={() => onAssign(item)}
          className="text-left disabled:cursor-default"
        >
          <p className="text-sm font-semibold">
            {item.painters.length || 0} assigned
          </p>
          {role === "CONTRACTOR" && item.status === "CONFIRMED" && (
            <p className="mt-1 text-xs text-blue-600">Manage</p>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-2">{nextAction}</div>
        <button onClick={onToggle} className="rounded-lg border p-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="grid gap-3 border-t bg-slate-50/60 p-4 md:grid-cols-3 lg:p-5">
          <Detail title="Date approval">
            <p>
              Customer: <b>{item.customer_accepted ? "Accepted" : "Pending"}</b>
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
          <Detail title="Advance payment">
            <p>
              Status: <b>{label(item.payment_status)}</b>
            </p>
            {item.advance_amount && (
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
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                <Download className="h-4 w-4" />
                Download receipt
              </button>
            )}
            {paid && (
              <p className="mt-2 text-xs text-slate-500">
                This advance will be adjusted when the final invoice is created
                after project completion.
              </p>
            )}
            {role === "CONTRACTOR" && !paid && item.status === "CONFIRMED" && (
              <button
                onClick={() => onCancel(item)}
                className="mt-2 text-sm font-semibold text-red-600"
              >
                Cancel unpaid schedule
              </button>
            )}
          </Detail>
          <Detail title="Paint Applicators and work">
            <p>
              {item.painters.length
                ? item.painters.map((p) => p.name).join(", ")
                : "No Paint Applicators assigned"}
            </p>
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
      className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_180px_180px_auto]"
    >
      <label className="text-sm font-semibold">
        Accepted quotation
        <select
          required
          value={form.quotation}
          onChange={(e) => setForm({ ...form, quotation: e.target.value })}
          className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
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
        className="self-end rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
      >
        {rescheduling ? "Send revised dates" : "Propose dates"}
      </button>
      {role === "CONTRACTOR" && rescheduling && (
        <label className="text-sm font-semibold md:col-span-4">
          Reason for rescheduling *
          <textarea
            required
            rows="2"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
          />
        </label>
      )}
    </form>
  );
}
function ScheduleModal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Schedule work dates</h2>
            <p className="text-sm text-slate-500">
              Select an accepted quotation and propose dates.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PainterModal({
  item,
  painters,
  selected,
  setSelected,
  saving,
  onClose,
  onSubmit,
}) {
  function toggle(p) {
    setSelected((current) =>
      current.includes(p.id)
        ? current.filter((id) => id !== p.id)
        : [...current, p.id],
    );
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl bg-white p-6"
      >
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">
              Assign verified Paint Applicators
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select applicators for {item.start_date} to {item.end_date}.
              Payment and wages are handled separately.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
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
          className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-40"
        >
          Assign Paint Applicators
        </button>
      </form>
    </div>
  );
}
function Action({ children, onClick, disabled, primary }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${primary ? "bg-slate-950 text-white" : "border bg-white"}`}
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
      <p className="mt-2 text-xs text-slate-500">
        Available after dates are confirmed. This does not affect booking
        confirmation.
      </p>
    );
  if (role === "CONTRACTOR" && item.payment_status === "NOT_REQUESTED")
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => onPayment(item, "REQUEST")}
          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
        >
          Request advance
        </button>
        <button
          onClick={() => onPayment(item, "RECORD")}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
        >
          Payment received directly
        </button>
        <p className="w-full text-xs text-slate-500">
          Use "Payment received directly" if the customer already paid by cash
          or another mode.
        </p>
      </div>
    );
  if (role === "CUSTOMER" && item.payment_status === "AWAITING_PAYMENT")
    return (
      <button
        onClick={() => onPayment(item, "SUBMIT")}
        className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
      >
        Submit payment
      </button>
    );
  if (role === "CONTRACTOR" && item.payment_status === "PENDING_CONFIRMATION")
    return (
      <button
        onClick={() => onPayment(item, "CONFIRM")}
        className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
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
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[value] || "bg-slate-100 text-slate-600"}`}
    >
      {label(value)}
    </span>
  );
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
        className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
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
function message(error, fallback) {
  return (
    Object.values(error.response?.data || {})
      .flat()
      .join(" ") || fallback
  );
}
