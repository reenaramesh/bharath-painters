import { useEffect, useRef, useState } from "react";
import { Palette, Search, X } from "lucide-react";
import api from "../api/client";

const groups = ["All", "Chromatics", "Colours of India", "Whites", "Fandeck"];

export default function ChatColourPicker({ onClose, onSend, sending }) {
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const [colours, setColours] = useState([]);
  const [count, setCount] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filterKey = useRef("");
  filterKey.current = `${group}:${query.trim()}`;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/quotations/chat/colours/", { params: { q: query.trim(), group, offset: 0 } });
        if (!active) return;
        setColours(data.results);
        setCount(data.count);
        setNextOffset(data.next_offset);
      } catch {
        if (active) setError("Colours could not be loaded. Try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [group, query]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function showMore() {
    if (nextOffset === null || loading) return;
    const requestedFilter = filterKey.current;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/quotations/chat/colours/", { params: { q: query.trim(), group, offset: nextOffset } });
      if (requestedFilter !== filterKey.current) return;
      setColours((current) => [...current, ...data.results]);
      setNextOffset(data.next_offset);
    } catch {
      setError("More colours could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-colour-picker fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="chat-colour-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b p-4">
          <div><h2 id="chat-colour-title" className="text-xl font-bold text-slate-900">Paint colours</h2><p className="mt-1 text-xs text-slate-500">Search by colour name or brand shade code</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100" aria-label="Close colour picker"><X className="h-5 w-5" /></button>
        </header>
        <div className="border-b p-3 sm:p-4">
          <label className="flex items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setColours([]); setCount(0); setNextOffset(null); }} placeholder="Search 9436, Air Breeze…" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{groups.map((item) => <button type="button" key={item} onClick={() => { setGroup(item); setSelected(null); setColours([]); setCount(0); setNextOffset(null); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${group === item ? "border-[#176b9b] bg-[#176b9b] text-white" : "border-slate-200 text-slate-600"}`}>{item}</button>)}</div>
        </div>
        <p className="px-4 pt-3 text-xs text-slate-500">Showing {colours.length.toLocaleString()} of {count.toLocaleString()} colours</p>
        {error && <p role="alert" className="mx-4 mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="min-h-24 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2">{colours.map((colour) => <button type="button" key={colour.id} onClick={() => setSelected(colour)} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left ${selected?.id === colour.id ? "border-[#176b9b] bg-sky-50 ring-1 ring-[#176b9b]" : "border-slate-200 hover:bg-slate-50"}`}><span className="h-10 w-10 shrink-0 rounded-lg border border-black/10" style={{ backgroundColor: colour.hex }} /><span className="min-w-0"><b className="block truncate text-xs text-slate-900">{colour.name}</b><small className="block truncate text-[11px] text-slate-500">{colour.brand} · {colour.code}</small></span></button>)}</div>
          {loading && colours.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Loading colours…</p>}
          {!loading && colours.length === 0 && !error && <p className="py-8 text-center text-sm text-slate-500">No matching colours.</p>}
          {nextOffset !== null && <button type="button" onClick={showMore} disabled={loading} className="mt-3 w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-[#176b9b] disabled:opacity-50">{loading ? "Loading…" : "Show more colours"}</button>}
        </div>
        <footer className="border-t p-3 sm:p-4">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-black/10" style={{ backgroundColor: selected?.hex || "#f1f5f9" }}>{!selected && <Palette className="h-5 w-5 text-slate-400" />}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{selected?.name || "Select a colour"}</b><small className="block truncate text-xs text-slate-500">{selected ? `${selected.brand} · ${selected.code}` : "Preview before sending"}</small></span><button type="button" onClick={() => selected && onSend(selected)} disabled={!selected || sending} className="shrink-0 rounded-xl bg-[#176b9b] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{sending ? "Sending…" : "Send colour"}</button></div>
          <p className="mt-2 text-[11px] text-slate-500">Screen colours are approximate. Confirm the final shade with a physical fan deck.</p>
        </footer>
      </div>
    </div>
  );
}
