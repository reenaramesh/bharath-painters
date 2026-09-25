import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, MapPin, Phone, Search } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import MobilePageBack from "../components/MobilePageBack";

const statusStyle = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  COMPLETED: "bg-blue-100 text-blue-700",
  CLOSED: "bg-slate-200 text-slate-700",
};

const emptyBooking = {
  work_type: "",
  pincode: "",
  start_date: "",
  end_date: "",
  wage_type: "DAILY",
  agreed_wage: "",
  notes: "",
};

export default function ApplicatorBookings() {
  const { user } = useAuth();
  const [data, setData] = useState({ pending_count: 0, results: [] });
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(emptyBooking);
  const painter = user?.role === "PAINTER";

  const load = useCallback(async () => {
    try {
      const { data: result } = await api.get("/jobs/applicator-bookings/", {
        params: user?.role === "CONTRACTOR" ? { mark_seen: 1 } : undefined,
      });
      setData(result);
      setError("");
    } catch {
      setError("Bookings could not be loaded.");
    }
  }, [user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (painter || search.trim().length < 3) {
      setMatches([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      api
        .get("/jobs/applicator-bookings/search/", { params: { search } })
        .then(({ data: results }) => setMatches(results))
        .catch(() => setMatches([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, painter]);

  async function action(id, value) {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/jobs/applicator-bookings/${id}/action/`, {
        action: value,
      });
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "Booking could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function book(event) {
    event.preventDefault();
    if (!selected) {
      setError("Search and select a Paint Applicator.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/jobs/applicator-bookings/", {
        ...booking,
        applicator: selected.id,
      });
      setBooking(emptyBooking);
      setSelected(null);
      setSearch("");
      setMatches([]);
      await load();
    } catch (requestError) {
      const details = requestError.response?.data || {};
      setError(
        details.detail ||
          details.dates ||
          details.applicator ||
          Object.values(details).flat().join(" ") ||
          "Booking request could not be sent.",
      );
    } finally {
      setSaving(false);
    }
  }

  const pendingItems = painter
    ? data.results.filter((item) => item.status === "PENDING")
    : [];
  const historyResults = painter
    ? data.results.filter((item) => item.status !== "PENDING")
    : data.results;
  const items =
    filter === "ALL"
      ? historyResults
      : historyResults.filter((item) => item.status === filter);

  return (
    <div className="space-y-6">
      <MobilePageBack />
      <header>
        <h1 className="text-3xl font-bold">
          {painter ? "Booking Requests" : "Book Applicator"}
        </h1>
      </header>

      {!painter && (
        <details open className="group overflow-visible rounded-2xl border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden sm:p-5">
            <h2 className="font-bold">Find and book an applicator</h2>
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <form
            onSubmit={book}
            className="border-t p-4 sm:p-5"
          >
          <div className="relative mt-4">
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelected(null);
                }}
                placeholder="Name, mobile, Bharath ID, skill or location"
                className="w-full text-sm outline-none"
              />
            </label>
            {matches.length > 0 && !selected && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
                {matches.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelected(item);
                      setSearch(
                        `${item.name} · ${item.bharath_id || item.mobile}`,
                      );
                      setMatches([]);
                    }}
                    className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <b className="text-sm">{item.name}</b>
                    <p className="text-xs text-slate-500">
                      {[item.mobile, item.bharath_id, item.skills, item.preferred_locations]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Work type">
              <input
                required
                value={booking.work_type}
                onChange={(event) =>
                  setBooking({ ...booking, work_type: event.target.value })
                }
              />
            </Field>
            <Field label="PIN code">
              <input
                required
                maxLength="6"
                value={booking.pincode}
                onChange={(event) =>
                  setBooking({
                    ...booking,
                    pincode: event.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Start date">
              <input
                required
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={booking.start_date}
                onChange={(event) =>
                  setBooking({ ...booking, start_date: event.target.value })
                }
              />
            </Field>
            <Field label="End date">
              <input
                required
                type="date"
                min={
                  booking.start_date || new Date().toISOString().slice(0, 10)
                }
                value={booking.end_date}
                onChange={(event) =>
                  setBooking({ ...booking, end_date: event.target.value })
                }
              />
            </Field>
            <Field label="Wage basis">
              <select
                value={booking.wage_type}
                onChange={(event) =>
                  setBooking({ ...booking, wage_type: event.target.value })
                }
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </Field>
            <Field label="Agreed wage">
              <input
                type="number"
                min="0"
                value={booking.agreed_wage}
                onChange={(event) =>
                  setBooking({ ...booking, agreed_wage: event.target.value })
                }
              />
            </Field>
            <Field label="Notes">
              <input
                value={booking.notes}
                onChange={(event) =>
                  setBooking({ ...booking, notes: event.target.value })
                }
              />
            </Field>
            <button
              disabled={saving || !selected}
              className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send booking request
            </button>
          </div>
          </form>
        </details>
      )}

      {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

      {painter && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
          <header className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3 sm:px-5">
            <h2 className="font-bold text-slate-950">New requests</h2>
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-extrabold text-amber-900">{pendingItems.length}</span>
          </header>
          {pendingItems.length ? <div className="divide-y">{pendingItems.map((item) => (
            <article key={item.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{item.work_type}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[item.status]}`}>{item.status}</span></div>
                  <p className="mt-1 text-sm font-medium text-slate-600">{item.contractor_name}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600"><span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{item.start_date} to {item.end_date}</span><span className="flex items-center gap-1"><MapPin className="h-4 w-4" />PIN {item.pincode}</span></div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex"><button disabled={saving} onClick={() => action(item.id, "ACCEPT")} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">Accept</button><button disabled={saving} onClick={() => action(item.id, "REJECT")} className="rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600">Reject</button><a href={`tel:${item.contractor_mobile}`} aria-label={`Call ${item.contractor_name}`} className="grid place-items-center rounded-xl border px-4 py-3"><Phone className="h-4 w-4" /></a></div>
              </div>
            </article>
          ))}</div> : <p className="p-8 text-center text-sm text-slate-400">No new requests.</p>}
        </section>
      )}

      <details open={painter || undefined} className="group overflow-hidden rounded-2xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden sm:p-5">
          <div>
            <h2 className="font-bold">Booking history</h2>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="flex flex-wrap gap-2 border-t bg-slate-50 p-4">
          {(painter ? ["ALL", "CONFIRMED", "REJECTED", "CANCELLED", "CLOSED"] : ["ALL", "PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "CLOSED"]).map(
            (value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  filter === value
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-600"
                }`}
              >
                {value}
              </button>
            ),
          )}
        </div>

      <section className="overflow-hidden border-t bg-white">
        {items.length ? (
          <div className="divide-y">
            {items.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{item.work_type}</h2>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[item.status]}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {painter
                        ? `Contractor: ${item.contractor_name}`
                        : `Applicator: ${item.applicator_name} · ${item.applicator_bharath_id || "Verified"}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-4 w-4" />
                        {item.start_date} to {item.end_date}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        PIN {item.pincode}
                      </span>
                      {item.agreed_wage && (
                        <b>
                          ₹{Number(item.agreed_wage).toLocaleString("en-IN")} /{" "}
                          {item.wage_type.toLowerCase()}
                        </b>
                      )}
                    </div>
                    {item.notes && (
                      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {painter && item.status === "PENDING" && (
                      <>
                        <button
                          disabled={saving}
                          onClick={() => action(item.id, "ACCEPT")}
                          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
                        >
                          Accept
                        </button>
                        <button
                          disabled={saving}
                          onClick={() => action(item.id, "REJECT")}
                          className="rounded-xl border border-red-200 px-5 py-3 font-semibold text-red-600"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {!painter &&
                      ["PENDING", "CONFIRMED"].includes(item.status) && (
                        <button
                          disabled={saving}
                          onClick={() => action(item.id, "CANCEL")}
                          className="rounded-xl border border-red-200 px-5 py-3 font-semibold text-red-600"
                        >
                          Cancel
                        </button>
                      )}
                    <a
                      href={`tel:${painter ? item.contractor_mobile : item.applicator_mobile}`}
                      className="flex items-center gap-2 rounded-xl border px-4 py-3 font-semibold"
                    >
                      <Phone className="h-4 w-4" />
                      Call
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="p-14 text-center text-slate-400">
            No bookings in this section.
          </p>
        )}
      </section>
      </details>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <span className="mt-1 block [&>*]:w-full [&>*]:rounded-lg [&>*]:border [&>*]:px-3 [&>*]:py-2.5 [&>*]:text-sm [&>*]:font-normal [&>*]:outline-none">
        {children}
      </span>
    </label>
  );
}
