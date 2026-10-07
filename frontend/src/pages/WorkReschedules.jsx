import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { Button, EmptyState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./jobs-schedules.css";

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayKey = () => dateKey(new Date());
const tomorrowKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateKey(date);
};

export default function WorkReschedules() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/jobs/work-schedules/");
      setItems(
        data.filter((item) =>
          ["PENDING", "CONFIRMED"].includes(item.status),
        ),
      );
      setError("");
    } catch {
      setError("Schedules could not be loaded.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter((item) =>
        [item.quotation_number, item.customer, item.property].some((value) =>
          value?.toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [items, search],
  );

  function edit(item) {
    setEditing(item);
    setForm({
      start_date: item.needs_reschedule ? todayKey() : item.start_date,
      end_date: item.needs_reschedule ? tomorrowKey() : item.end_date,
      reason: item.needs_reschedule
        ? "Previous schedule dates have passed."
        : "",
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (form.start_date < todayKey()) {
      setError("Start date cannot be earlier than today.");
      return;
    }
    if (form.end_date < form.start_date) {
      setError("End date cannot be earlier than the start date.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/jobs/work-schedules/", {
        quotation: editing.quotation,
        ...form,
      });
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {}).flat().join(" ") ||
          "Revised dates could not be sent.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "CONTRACTOR") {
    return (
      <p className="rounded-xl bg-red-50 p-5 text-red-700">
        Only contractors can reschedule work dates.
      </p>
    );
  }

  return (
    <div className="space-y-6 jobs-schedules-page bp-work-reschedules-page">
      <div>
        <Link
          to="/work-schedules"
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Work Schedules
        </Link>
        <PageHeader eyebrow="Schedule changes" title="Reschedule work" description="Review pending approvals and schedules whose planned dates have passed." />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <SectionCard title="Schedules needing review" description={`${visible.length} schedules match your search.`} className="reschedule-list-card" bodyClassName="p-0">
        <div className="border-b p-4">
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quotation, customer, or property"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div>
          {visible.length ? (
            <>
            <div className="grid gap-3 p-3 md:hidden">{visible.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.needs_reschedule ? "border-red-200 bg-red-50/40" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-slate-900">{item.quotation_number}</p><p className="mt-1 truncate text-sm font-semibold text-slate-700">{item.customer}</p><p className="mt-0.5 truncate text-sm text-slate-600">{item.property}</p></div><StatusBadge status={item.needs_reschedule ? "OVERDUE" : item.status} label={item.needs_reschedule ? "Dates crossed" : item.status === "CONFIRMED" ? "Confirmed" : "Pending approval"} tone={item.needs_reschedule ? "danger" : item.status === "CONFIRMED" ? "info" : "warning"} /></div>
              <p className="mt-3 text-sm font-semibold text-slate-800">{formatScheduleDate(item.start_date)} – {formatScheduleDate(item.end_date)}</p>
              <Button variant={item.needs_reschedule ? "danger" : "secondary"} onClick={() => edit(item)} className="mt-3 w-full justify-center"><CalendarClock className="h-4 w-4" aria-hidden="true" />{item.needs_reschedule ? "Reschedule now" : "Change dates"}</Button>
            </article>)}</div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Quotation</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Property</th>
                  <th className="px-5 py-3">Current dates</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" data-no-sort="true">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.needs_reschedule
                        ? "bg-red-50/60"
                        : "hover:bg-slate-50"
                    }
                  >
                    <td className="px-5 py-4 font-bold">
                      {item.quotation_number}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {item.customer}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {item.property}
                    </td>
                    <td
                      className="px-5 py-4"
                      data-sort-value={item.start_date}
                    >
                      <p className="font-semibold">{formatScheduleDate(item.start_date)}</p>
                      <p className="text-sm text-slate-500">
                        to {formatScheduleDate(item.end_date)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.needs_reschedule ? "OVERDUE" : item.status} label={item.needs_reschedule ? "Dates crossed – reschedule" : item.status === "CONFIRMED" ? "Confirmed" : "Pending approval"} tone={item.needs_reschedule ? "danger" : item.status === "CONFIRMED" ? "info" : "warning"} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => edit(item)}
                        className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ${
                          item.needs_reschedule
                            ? "bg-red-600 text-white"
                            : "border"
                        }`}
                      >
                        <CalendarClock className="h-4 w-4" />
                        {item.needs_reschedule
                          ? "Reschedule now"
                          : "Change dates"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </>
          ) : (
            <EmptyState title="No schedules need changes" description="Pending approvals and date adjustments will appear here." />
          )}
        </div>
      </SectionCard>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-xl rounded-2xl bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Reschedule {editing.quotation_number}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editing.customer} | {editing.property}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                <X />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DateField
                label="New start date"
                min={todayKey()}
                value={form.start_date}
                onChange={(value) =>
                  setForm({
                    ...form,
                    start_date: value,
                    end_date:
                      form.end_date && form.end_date < value
                        ? ""
                        : form.end_date,
                  })
                }
              />
              <DateField
                label="New end date"
                min={form.start_date || todayKey()}
                value={form.end_date}
                onChange={(value) => setForm({ ...form, end_date: value })}
              />
            </div>
            <label className="mt-4 block text-sm font-semibold">
              Reason for rescheduling *
              <textarea
                required
                rows="4"
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                placeholder="Rain, material delay, customer request..."
                className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
              />
            </label>
            <button
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white"
            >
              Send revised dates for customer approval
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function DateField({ label, value, onChange, min }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        required
        type="date"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
      />
    </label>
  );
}

function formatScheduleDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
