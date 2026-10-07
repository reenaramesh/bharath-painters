import { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Phone, Plus, RefreshCw } from "lucide-react";
import api from "../api/client";
import { siteVisitFollowups } from "../utils/siteVisitFollowups";
import { stageLabel } from "../utils/opportunityOptions";

const STATUS_STYLES = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  RESCHEDULED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  NO_SHOW: "bg-red-50 text-red-700",
};

const STATUS_OPTIONS = ["SCHEDULED", "COMPLETED", "RESCHEDULED", "CANCELLED", "NO_SHOW"];

const input =
  "rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function SiteVisits() {
  const [visits, setVisits] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);

  async function load() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      const [{ data }, { data: tasks }] = await Promise.all([api.get(`/quotations/site-visits/?${params}`), api.get("/quotations/tasks/?completed=all")]);
      const followups = siteVisitFollowups(tasks.results || tasks, { status: statusFilter, date: dateFilter });
      setVisits([...(data.results || data), ...followups]);
    } catch (requestError) {
      setVisits([]);
      setError(
        requestError.response?.data?.detail || "Site visits could not be loaded.",
      );
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter]);

  async function updateStatus(visit, status) {
    setBusyId(visit.id);
    setError("");
    try {
      if (visit.followup_id) {
        await api.patch(`/quotations/tasks/${visit.followup_id}/`, { is_completed: status === "COMPLETED" });
        await load();
        return;
      }
      const { data } = await api.patch(`/quotations/site-visits/${visit.id}/`, {
        status,
      });
      setVisits((current) =>
        (current || []).map((item) => (item.id === visit.id ? data : item)),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "Visit could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo(() => {
    const all = visits || [];
    const today = todayISO();
    return {
      today: all.filter((v) => v.scheduled_date === today && !["COMPLETED", "CANCELLED"].includes(v.status)),
      upcoming: all.filter((v) => v.scheduled_date > today && !["COMPLETED", "CANCELLED"].includes(v.status)),
      overdue: all.filter((v) => v.scheduled_date < today && v.status === "SCHEDULED"),
      past: all.filter((v) => ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(v.status) || (v.scheduled_date < today && v.status === "RESCHEDULED")),
    };
  }, [visits]);

  const [tab, setTab] = useState("today");
  const visible = groups[tab] || [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-600">Sales</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Site Visits</h1>
          
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-900"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Schedule Visit
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={input}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {stageLabel(value)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className={input}
        />
        {(statusFilter || dateFilter) && (
          <button
            onClick={() => {
              setStatusFilter("");
              setDateFilter("");
            }}
            className="text-sm font-semibold text-slate-500 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          ["today", `Today (${groups.today.length})`],
          ["upcoming", `Upcoming (${groups.upcoming.length})`],
          ["overdue", `Overdue (${groups.overdue.length})`],
          ["past", `Completed / Past (${groups.past.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key
                ? "bg-slate-950 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Visit list */}
      {visits === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          Loading site visits...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="font-semibold text-slate-700">
            {tab === "today" && "No site visits scheduled for today."}
            {tab === "upcoming" && "No upcoming site visits."}
            {tab === "overdue" && "No overdue visits. Good job staying on top of things!"}
            {tab === "past" && "No completed visits yet."}
          </p>
          <button
            onClick={() => setShowSchedule(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Schedule your first visit
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((visit) => (
            <article
              key={visit.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-500">
                    {visit.reference_no}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[visit.status] || "bg-slate-100"}`}>
                    {stageLabel(visit.status)}
                  </span>
                </div>
                <h3 className="mt-1.5 font-bold text-slate-900">
                  {visit.opportunity_title}
                </h3>
                <p className="text-sm text-slate-500">
                  {visit.opportunity_reference} · {visit.customer_name} ·{" "}
                  {visit.customer_mobile}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {visit.scheduled_date}
                    {visit.scheduled_time ? ` · ${String(visit.scheduled_time).slice(0, 5)}` : ""}
                  </span>
                  {visit.property_name && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" /> {visit.property_name}
                    </span>
                  )}
                  {visit.contact_person && <span>Contact: {visit.contact_person}</span>}
                </div>
                {visit.notes && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {visit.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  {visit.customer_mobile && (
                    <a
                      href={`tel:${visit.customer_mobile}`}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-slate-900"
                    >
                      <Phone className="h-4 w-4" /> Call
                    </a>
                  )}
                </div>
                {visit.status !== "COMPLETED" && visit.status !== "CANCELLED" && (
                  <select
                    disabled={busyId === visit.id}
                    value={visit.status}
                    onChange={(event) => updateStatus(visit, event.target.value)}
                    className={`${input} disabled:opacity-50`}
                  >
                    {(visit.followup_id ? ["SCHEDULED", "COMPLETED"] : STATUS_OPTIONS).map((value) => (
                      <option key={value} value={value}>
                        Mark: {stageLabel(value)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {showSchedule && (
        <ScheduleVisitModal
          onClose={() => setShowSchedule(false)}
          onCreated={() => {
            setShowSchedule(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ScheduleVisitModal({ onClose, onCreated }) {
  const [opportunities, setOpportunities] = useState([]);
  const [_properties, setProperties] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    opportunity: "",
    scheduled_date: todayISO(),
    scheduled_time: "",
    contact_person: "",
    contact_mobile: "",
    notes: "",
  });

  useEffect(() => {
    api
      .get("/quotations/leads/?view_scope=open")
      .then(({ data }) => setOpportunities(data.results || data))
      .catch(() => { });
  }, []);

  const selected = opportunities.find((o) => String(o.id) === String(form.opportunity));

  useEffect(() => {
    if (!selected?.customer) {
      setProperties([]);
      return;
    }
    api
      .get(`/quotations/properties/?customer=${selected.customer}`)
      .then(({ data }) => setProperties(data.results || data))
      .catch(() => setProperties([]));
  }, [selected]);

  async function submit(event) {
    event.preventDefault();
    if (!form.opportunity) {
      setError("Select an opportunity for this visit.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/quotations/site-visits/", {
        ...form,
        scheduled_time: form.scheduled_time || null,
      });
      onCreated();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Visit could not be scheduled.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6"
      >
        <h2 className="text-xl font-bold">Schedule site visit</h2>
        
        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-semibold">
            Opportunity *
            <select
              required
              value={form.opportunity}
              onChange={(event) => setForm({ ...form, opportunity: event.target.value })}
              className={`mt-2 w-full ${input}`}
            >
              <option value="">Select an open opportunity</option>
              {opportunities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.reference_no} · {item.title} · {item.customer_name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Client: <strong>{selected.customer_name}</strong>
              {selected.customer ? ` · ${selected.customer_mobile || ""}` : ""}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Visit date *
              <input
                required
                type="date"
                value={form.scheduled_date}
                onChange={(event) => setForm({ ...form, scheduled_date: event.target.value })}
                className={`mt-2 w-full ${input}`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Time
              <input
                type="time"
                value={form.scheduled_time}
                onChange={(event) => setForm({ ...form, scheduled_time: event.target.value })}
                className={`mt-2 w-full ${input}`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Contact person
              <input
                value={form.contact_person}
                onChange={(event) => setForm({ ...form, contact_person: event.target.value })}
                className={`mt-2 w-full ${input}`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Contact mobile
              <input
                inputMode="numeric"
                value={form.contact_mobile}
                onChange={(event) => setForm({ ...form, contact_mobile: event.target.value })}
                className={`mt-2 w-full ${input}`}
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Notes
            <textarea
              rows="2"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Scheduling..." : "Schedule visit"}
          </button>
        </div>
      </form>
    </div>
  );
}
