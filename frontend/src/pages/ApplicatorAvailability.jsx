import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarCells(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export default function ApplicatorAvailability() {
  const { user } = useAuth();
  const profession = user?.branding?.employee_singular_label || "Employee";
  const today = useMemo(() => new Date(), []);
  const lastBlockDate = useMemo(() => { const value = new Date(today); value.setDate(value.getDate() + 45); return value; }, [today]);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [error, setError] = useState("");
  const [blockForm, setBlockForm] = useState({ start_date: dateKey(today), end_date: dateKey(today), reason: "" });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { const { data: result } = await api.get("/jobs/applicator-availability/"); setData(result); setError(""); } catch { setError("Availability could not be loaded."); } }, []);
  useEffect(() => { load(); }, [load]);
  const cells = useMemo(() => calendarCells(month), [month]);
  const assignmentFor = (date) => data?.schedule?.find((item) => dateKey(date) >= item.start_date && dateKey(date) <= item.end_date);
  const selectedWork = data ? assignmentFor(selected) : null;
  const selectedIsBlock = selectedWork?.source === "BLOCK";
  async function blockDates(event) {
    event.preventDefault(); setSaving(true); setError("");
    try { await api.post("/jobs/applicator-availability/blocks/", blockForm); await load(); }
    catch (requestError) { setError(requestError.response?.data?.dates || requestError.response?.data?.detail || "Dates could not be blocked."); }
    finally { setSaving(false); }
  }
  async function removeBlock(blockId) {
    try { await api.delete(`/jobs/applicator-availability/blocks/${blockId}/`); await load(); }
    catch { setError("Blocked dates could not be removed."); }
  }
  function changeMonth(offset) { const next = new Date(month.getFullYear(), month.getMonth() + offset, 1); setMonth(next); setSelected(next); }
  function selectDate(date) { setSelected(date); if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }
  if (!data) return <p className="p-12 text-center text-slate-500">{error || "Loading availability..."}</p>;

  return <div className="space-y-6"><header><p className="text-sm font-semibold text-amber-600">{profession} workspace</p><h1 className="mt-1 text-3xl font-bold">My Availability</h1><p className="mt-2 flex items-center gap-1 text-slate-500"><MapPin className="h-4 w-4" />Current location: {data.current_location || "Not selected in profile"}</p></header>{error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <form onSubmit={blockDates} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div><h2 className="text-lg font-bold">Block unavailable dates</h2><p className="mt-1 text-sm text-slate-500">Select today or any date within the next 45 days.</p></div><label className="lg:ml-auto"><span className="mb-1 block text-sm font-semibold">From</span><input required type="date" min={dateKey(today)} max={dateKey(lastBlockDate)} value={blockForm.start_date} onChange={(event) => setBlockForm((old) => ({ ...old, start_date: event.target.value, end_date: old.end_date < event.target.value ? event.target.value : old.end_date }))} className="rounded-xl border px-4 py-3" /></label><label><span className="mb-1 block text-sm font-semibold">To</span><input required type="date" min={blockForm.start_date} max={dateKey(lastBlockDate)} value={blockForm.end_date} onChange={(event) => setBlockForm((old) => ({ ...old, end_date: event.target.value }))} className="rounded-xl border px-4 py-3" /></label><label className="min-w-52 flex-1"><span className="mb-1 block text-sm font-semibold">Reason (optional)</span><input value={blockForm.reason} maxLength={180} onChange={(event) => setBlockForm((old) => ({ ...old, reason: event.target.value }))} placeholder="Personal work, leave..." className="w-full rounded-xl border px-4 py-3" /></label><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Block dates"}</button></div></form>
    <div className="flex flex-col items-start gap-5 lg:flex-row">
      <section className="w-full shrink-0 overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ maxWidth: 430 }}>
        <div className="flex items-center justify-between border-b px-5 py-4"><p className="text-lg font-medium">{selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p><button type="button" onClick={() => { setSelected(today); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }} className="rounded-lg border p-2" title="Go to today"><ChevronDown className="h-4 w-4" /></button></div>
        <div className="p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><div className="flex gap-2"><button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button></div></div>
          <div className="mt-6 text-center text-sm font-semibold" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="mt-4 gap-y-2" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>{cells.map((date) => { const inMonth = date.getMonth() === month.getMonth(); const work = assignmentFor(date); const isBlock = work?.source === "BLOCK"; const isSelected = dateKey(date) === dateKey(selected); return <button type="button" key={dateKey(date)} onClick={() => selectDate(date)} className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-sm transition ${!inMonth ? "text-slate-300" : isSelected ? "bg-slate-900 font-bold text-white ring-4 ring-slate-200" : isBlock ? "bg-amber-100 font-bold text-amber-800 hover:bg-amber-200" : work ? "bg-red-100 font-bold text-red-700 hover:bg-red-200" : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"}`} title={isBlock ? "Blocked by you" : work ? "Work assigned" : "Available"}>{date.getDate()}</button>; })}</div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 border-t pt-4 text-xs"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-500" />Available</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-red-500" />Work assigned</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-amber-500" />Blocked by me</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-slate-900" />Selected</span></div>
        </div>
      </section>
      <section className={`w-full flex-1 rounded-2xl border p-6 ${selectedIsBlock ? "border-amber-200 bg-amber-50" : selectedWork ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-sm font-semibold text-slate-500">Selected date</p><h2 className="mt-1 text-2xl font-bold">{selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2><p className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-bold ${selectedIsBlock ? "bg-amber-200 text-amber-900" : selectedWork ? "bg-red-200 text-red-800" : "bg-emerald-200 text-emerald-800"}`}>{selectedIsBlock ? "Blocked by you" : selectedWork ? "Work assigned" : "Available"}</p>{selectedWork ? <><div className="mt-5 grid gap-4 sm:grid-cols-2"><Detail label={selectedIsBlock ? "Reason" : "Quotation"} value={selectedIsBlock ? selectedWork.property : selectedWork.quotation_number} />{!selectedIsBlock && <Detail label="Property" value={selectedWork.property} />}<Detail label="Location" value={selectedWork.city} /><Detail label="Period" value={`${selectedWork.start_date} to ${selectedWork.end_date}`} /></div>{selectedIsBlock && <button type="button" onClick={() => removeBlock(selectedWork.block_id)} className="mt-5 rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700">Make these dates available</button>}</> : <p className="mt-5 text-slate-600">You are available in {data.current_location || "your selected location"} on this date.</p>}</section>
    </div>
  </div>;
}

function Detail({ label, value }) { return <div className="rounded-xl bg-white/70 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value || "—"}</p></div>; }
