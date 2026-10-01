import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BriefcaseBusiness,
  CalendarDays,
  Crosshair,
  Eye,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import IndiaLocationPicker from "../components/IndiaLocationPicker";
import { getMobileLocation } from "../utils/indiaLocation";
import WorkNetworkTabs from "../components/WorkNetworkTabs";
import {
  paintingSkillOptions as skillOptions,
  WORK_REQUIREMENTS_PATH,
} from "../constants/workNetwork";

const workTypes = [
  "Paint Applicator",
  "Interior Applicator",
  "Exterior Applicator",
  "Wall Texture Applicator",
  "Wood Polish Applicator",
  "Waterproofing Applicator",
];
const empty = {
  title: "",
  description: "",
  skills: "",
  preferred_location: "",
  city: "India",
  location: "",
  state: "",
  pincode: "",
  pinEntry: "",
  latitude: null,
  longitude: null,
  radius_km: 10,
  location_source: "MANUAL",
  available_from: "",
  available_until: "",
  wage_type: "DAILY",
  expected_wage: "",
  willing_to_travel: false,
  status: "ACTIVE",
};
const values = (text) =>
  String(text || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export default function PainterSeeking() {
  const { user } = useAuth();
  const [items, setItems] = useState([]),
    [search, setSearch] = useState(""),
    [pinFilter, setPinFilter] = useState(""),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [searchGeo, setSearchGeo] = useState({ latitude: null, longitude: null, radius_km: 10 }),
    [locating, setLocating] = useState(false),
    [editing, setEditing] = useState(null),
    [detail, setDetail] = useState(null),
    [booking, setBooking] = useState(null),
    [bookingError, setBookingError] = useState(""),
    [form, setForm] = useState(empty),
    [error, setError] = useState(""),
    [requirementsCount, setRequirementsCount] = useState(null),
    [saving, setSaving] = useState(false);
  const isPainter = user?.role === "PAINTER";
  const { pathname } = useLocation();
  const visibleItems = useMemo(() => {
    const needle = pinFilter.trim();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.pincode || ""} ${item.preferred_location || ""}`
        .toLowerCase()
        .includes(needle.toLowerCase()),
    );
  }, [items, pinFilter]);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/jobs/seeking/", {
        params: {
          search: search || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          latitude: searchGeo.latitude ?? undefined,
          longitude: searchGeo.longitude ?? undefined,
          radius_km: searchGeo.radius_km,
        },
      });
      setItems(data);
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Job-seeking posts could not be loaded.",
      );
    }
  }, [search, dateFrom, dateTo, searchGeo]);
  async function useNearbyApplicators() {
    setLocating(true);
    try {
      const current = await getMobileLocation();
      setSearchGeo((old) => ({ ...old, latitude: current.latitude, longitude: current.longitude }));
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Location permission was not granted.");
    } finally {
      setLocating(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/jobs/list/", { params: { page_size: 1 } })
      .then(({ data }) => {
        if (cancelled) return;
        setRequirementsCount(data?.count ?? null);
      })
      .catch(() => {
        if (!cancelled) setRequirementsCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function open(item = null) {
    setEditing(item || "NEW");
    setForm(
      item
        ? {
            ...empty,
            ...item,
            expected_wage: item.expected_wage || "",
            pinEntry: "",
          }
        : empty,
    );
  }
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        preferred_location: form.location || form.preferred_location || form.pincode,
      };
      delete payload.pinEntry;
      if (editing !== "NEW")
        await api.patch(`/jobs/seeking/${editing.id}/`, payload);
      else await api.post("/jobs/seeking/", payload);
      setEditing(null);
      setForm(empty);
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Post could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(item) {
    if (!confirm("Delete this job-seeking post?")) return;
    await api.delete(`/jobs/seeking/${item.id}/`);
    await load();
  }
  async function toggle(item) {
    await api.patch(`/jobs/seeking/${item.id}/`, {
      status: item.status === "ACTIVE" ? "CLOSED" : "ACTIVE",
    });
    await load();
  }
  async function book(payload) {
    setSaving(true);
    setBookingError("");
    try {
      await api.post("/jobs/applicator-bookings/", {
        ...payload,
        seeking_post: booking.id,
      });
      setBooking(null);
      await load();
    } catch (requestError) {
      setBookingError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Booking request could not be sent.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">Work Network</p>
          <h1 className="mt-1 text-3xl font-bold">
            {isPainter
              ? "My job-seeking posts"
              : "Paint Applicators seeking work"}
          </h1>
          <p className="mt-2 text-slate-500">
            {isPainter
              ? "Select your work, skills, PIN-code locations and available dates."
              : "Browse availability, compare skills and PIN codes, then send a booking request."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={WORK_REQUIREMENTS_PATH}
            className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            {isPainter ? "Find available jobs" : "Go to work requirements"}
          </Link>
          {isPainter && (
            <button
              onClick={() => open()}
              className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Post availability
            </button>
          )}
        </div>
      </header>
      <WorkNetworkTabs
        pathname={pathname}
        contractor={!isPainter}
        requirementsCount={requirementsCount}
        availabilityCount={visibleItems.length}
      />
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search work, skill or applicator"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <MapPin className="h-4 w-4 text-slate-400" />
            <input
              value={pinFilter}
              onChange={(event) => setPinFilter(event.target.value)}
              placeholder="PIN code or area"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            Required from
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 block w-full bg-transparent text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <label className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            Required until
            <input
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 block w-full bg-transparent text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          {!isPainter && (
            <div className="flex flex-wrap gap-2 md:col-span-4">
              <button type="button" onClick={useNearbyApplicators} disabled={locating} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                <Crosshair className="h-4 w-4" />{locating ? "Finding..." : "Applicators near my mobile location"}
              </button>
              <select value={searchGeo.radius_km} onChange={(event) => setSearchGeo((old) => ({ ...old, radius_km: Number(event.target.value) }))} className="rounded-xl border bg-white px-3 text-sm font-semibold">
                {[5, 10, 15, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
              </select>
              {searchGeo.latitude != null && <button type="button" onClick={() => setSearchGeo((old) => ({ ...old, latitude: null, longitude: null }))} className="rounded-xl border px-3 text-sm font-semibold">Show all locations</button>}
            </div>
          )}
        </div>
        {visibleItems.length ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                onClick={() => !isPainter && setDetail(item)}
                className={`flex min-h-[330px] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg ${!isPainter ? "cursor-pointer" : ""}`}
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-950 font-bold text-white">
                  {item.painter_name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold">{item.painter_name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.painter_name} · {item.experience_years} years ·{" "}
                    {item.bharath_id || "Verified"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    Skills: {item.skills || "Not selected"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      PIN: {item.pincode || item.preferred_location}
                    </span>
                    {item.distance_km != null && <b className="text-blue-700">{item.distance_km} km away</b>}
                    <span>{item.radius_km || 10} km work radius</span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {item.available_from}
                      {item.available_until
                        ? ` to ${item.available_until}`
                        : " onwards"}
                    </span>
                    {item.expected_wage && (
                      <b>
                        ₹{Number(item.expected_wage).toLocaleString("en-IN")} /{" "}
                        {item.wage_type.toLowerCase()}
                      </b>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {isPainter ? (
                    <>
                      <button
                        onClick={() => open(item)}
                        className="rounded-xl border p-3"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggle(item)}
                        className="rounded-xl border px-4 py-2 text-sm font-semibold"
                      >
                        {item.status === "ACTIVE" ? "Close" : "Reopen"}
                      </button>
                      <button
                        onClick={() => remove(item)}
                        className="rounded-xl border border-red-200 p-3 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setDetail(item)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                      <Eye className="h-4 w-4" /> View profile
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-slate-400">
              {isPainter
                ? "You have not posted any availability yet."
                : "No Paint Applicators match these filters."}
            </p>
            {isPainter ? (
              <button
                onClick={() => open()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Post availability
              </button>
            ) : (
              <Link
                to={WORK_REQUIREMENTS_PATH}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold"
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Post a work requirement instead
              </Link>
            )}
          </div>
        )}
      </section>
      {editing !== null && isPainter && (
        <PostModal
          form={form}
          setForm={setForm}
          saving={saving}
          editing={editing}
          onClose={() => {
            setEditing(null);
            setForm(empty);
          }}
          onSubmit={save}
        />
      )}
      {detail && !isPainter && (
        <ApplicatorDetailModal
          post={detail}
          onClose={() => setDetail(null)}
          onBook={() => {
            setBooking(detail);
            setDetail(null);
          }}
        />
      )}
      {booking && !isPainter && (
        <BookingModal
          post={booking}
          saving={saving}
          error={bookingError}
          onClose={() => {
            setBooking(null);
            setBookingError("");
          }}
          onSubmit={book}
        />
      )}
    </div>
  );
}

function ApplicatorDetailModal({ post, onClose, onBook }) {
  const skills = values(post.skills);
  const locations = values(post.pincode || post.preferred_location);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-xl font-extrabold text-white">{post.painter_name?.charAt(0) || "A"}</div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Available Paint Applicator</p>
              <h2 className="truncate text-2xl font-extrabold">{post.painter_name}</h2>
              <p className="text-sm text-slate-500">{post.bharath_id || "Verification pending"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border p-2" aria-label="Close applicator details"><X className="h-5 w-5" /></button>
        </header>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <ProfileDetail label="Experience" value={`${post.experience_years || 0} years`} />
            <ProfileDetail label="Work type" value={post.title || "Paint Applicator"} />
            <ProfileDetail label="Available from" value={post.available_from || "Now"} />
            <ProfileDetail label="Available until" value={post.available_until || "Open"} />
            <ProfileDetail label="Work radius" value={`${post.radius_km || 10} km`} />
            <ProfileDetail label="Expected wage" value={post.expected_wage ? `₹${Number(post.expected_wage).toLocaleString("en-IN")} / ${String(post.wage_type || "DAILY").toLowerCase()}` : "Discuss directly"} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Skills</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.length ? skills.map((skill) => <span key={skill} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">{skill}</span>) : <span className="text-sm text-slate-500">No skills selected</span>}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Preferred locations</p>
            <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{locations.join(", ") || post.city || "Location not selected"}</p>
            {post.distance_km != null && <p className="mt-2 text-xs font-bold text-blue-700">{post.distance_km} km from your search location</p>}
          </div>
          {post.description && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-slate-700">{post.description}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <a href={`tel:${post.mobile}`} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold"><Phone className="h-4 w-4" /> Call</a>
            <button type="button" onClick={onBook} className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Book Applicator</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileDetail({ label, value }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>;
}

function PostModal({ form, setForm, saving, editing, onClose, onSubmit }) {
  const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal";
  const selectedWork = useMemo(() => new Set(values(form.title)), [form.title]);
  const selectedSkills = useMemo(
    () => new Set(values(form.skills)),
    [form.skills],
  );
  const pincodes = values(form.pincode);
  function toggle(field, option, selected) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    setForm({ ...form, [field]: [...next].join(", ") });
  }
  function addPin() {
    const pin = String(form.pinEntry || "").trim();
    if (!/^\d{6}$/.test(pin) || pincodes.includes(pin)) return;
    setForm({ ...form, pincode: [...pincodes, pin].join(", "), pinEntry: "" });
  }
  function removePin(pin) {
    setForm({
      ...form,
      pincode: pincodes.filter((value) => value !== pin).join(", "),
    });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6"
      >
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {editing === "NEW"
                ? "Post job-seeking availability"
                : "Edit availability"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tap the options. Type only the six-digit PIN codes.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-6 space-y-6">
          <ChoiceGroup
            label="Select work type"
            options={workTypes}
            selected={selectedWork}
            onToggle={(option) => toggle("title", option, selectedWork)}
          />
          <ChoiceGroup
            label="Select skills"
            options={skillOptions}
            selected={selectedSkills}
            onToggle={(option) => toggle("skills", option, selectedSkills)}
          />
          <IndiaLocationPicker value={form} onChange={setForm} required title="Where are you available for work?" />
          <div className="hidden">
            <p className="text-sm font-semibold">Work locations by PIN code</p>
            <div className="mt-2 flex gap-2">
              <input
                inputMode="numeric"
                maxLength="6"
                value={form.pinEntry}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pinEntry: event.target.value.replace(/\D/g, ""),
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPin();
                  }
                }}
                placeholder="Example: 560017"
                className="w-full rounded-xl border px-3 py-3"
              />
              <button
                type="button"
                onClick={addPin}
                className="rounded-xl bg-slate-950 px-5 font-semibold text-white"
              >
                Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {pincodes.map((pin) => (
                <button
                  type="button"
                  key={pin}
                  onClick={() => removePin(pin)}
                  className="rounded-full bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800"
                >
                  {pin} ×
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Add multiple PIN codes from anywhere in India. Tap a PIN code to
              remove it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Available from">
              <input
                required
                type="date"
                value={form.available_from}
                onChange={(event) =>
                  setForm({ ...form, available_from: event.target.value })
                }
                className={input}
              />
            </Field>
            <Field label="Available until">
              <input
                type="date"
                value={form.available_until || ""}
                onChange={(event) =>
                  setForm({ ...form, available_until: event.target.value })
                }
                className={input}
              />
            </Field>
            <Field label="Wage type">
              <select
                value={form.wage_type}
                onChange={(event) =>
                  setForm({ ...form, wage_type: event.target.value })
                }
                className={input}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="NEGOTIABLE">Negotiable</option>
              </select>
            </Field>
            <Field label="Expected wage">
              <input
                type="number"
                min="0"
                value={form.expected_wage || ""}
                onChange={(event) =>
                  setForm({ ...form, expected_wage: event.target.value })
                }
                className={input}
              />
            </Field>
          </div>
        </div>
        <button
          disabled={saving || !form.title || !form.skills || (!form.pincode && form.latitude == null)}
          className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save availability post"}
        </button>
      </form>
    </div>
  );
}

function ChoiceGroup({ label, options, selected, onToggle }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => onToggle(option)}
            className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${selected.has(option) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-white"}`}
          >
            {selected.has(option) ? "✓ " : ""}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function BookingModal({ post, saving, error, onClose, onSubmit }) {
  const works = values(post.title),
    pins = values(post.pincode || post.preferred_location);
  const [form, setForm] = useState({
    work_type: works[0] || "",
    pincode: pins[0] || "",
    start_date: post.available_from || "",
    end_date: post.available_until || post.available_from || "",
    wage_type: post.wage_type || "DAILY",
    agreed_wage: post.expected_wage || "",
    notes: "",
  });
  const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal";
  const selectedDays =
    form.start_date && form.end_date
      ? Math.floor(
          (new Date(`${form.end_date}T12:00:00`) -
            new Date(`${form.start_date}T12:00:00`)) /
            86400000,
        ) + 1
      : 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="w-full max-w-xl rounded-2xl bg-white p-6"
      >
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">Book {post.painter_name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              The applicator must accept this request.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        {post.booked_periods?.length > 0 && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <b>Already booked:</b>{" "}
            {post.booked_periods
              .map((period) => `${period.start_date} to ${period.end_date}`)
              .join(", ")}
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Required work">
            <select
              required
              value={form.work_type}
              onChange={(event) =>
                setForm({ ...form, work_type: event.target.value })
              }
              className={input}
            >
              {works.map((work) => (
                <option key={work}>{work}</option>
              ))}
            </select>
          </Field>
          <Field label="Work PIN code">
            <select
              required
              value={form.pincode}
              onChange={(event) =>
                setForm({ ...form, pincode: event.target.value })
              }
              className={input}
            >
              {pins.map((pin) => (
                <option key={pin}>{pin}</option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              required
              type="date"
              min={post.available_from}
              max={post.available_until || undefined}
              value={form.start_date}
              onChange={(event) =>
                setForm({ ...form, start_date: event.target.value })
              }
              className={input}
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              min={form.start_date}
              max={post.available_until || undefined}
              value={form.end_date}
              onChange={(event) =>
                setForm({ ...form, end_date: event.target.value })
              }
              className={input}
            />
          </Field>
          <Field label="Wage type">
            <select
              value={form.wage_type}
              onChange={(event) =>
                setForm({ ...form, wage_type: event.target.value })
              }
              className={input}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="NEGOTIABLE">Negotiable</option>
            </select>
          </Field>
          <Field label="Agreed wage">
            <input
              type="number"
              min="0"
              value={form.agreed_wage}
              onChange={(event) =>
                setForm({ ...form, agreed_wage: event.target.value })
              }
              className={input}
            />
          </Field>
        </div>
        {selectedDays > 0 && (
          <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">
            Selected duration: {selectedDays} calendar day
            {selectedDays === 1 ? "" : "s"} (start and end dates included)
          </p>
        )}
        <label className="mt-4 block text-sm font-semibold">
          Work instructions
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            className={input}
          />
        </label>
        <button
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Sending..." : "Send booking request"}
        </button>
      </form>
    </div>
  );
}
