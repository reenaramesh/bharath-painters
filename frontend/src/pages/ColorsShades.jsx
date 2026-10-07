import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, Search, Share2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

const groups = ["All", "Chromatics", "Colours of India", "Whites", "Fandeck"];

export default function ColorsShades() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState(Array(8).fill(null));
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const saveQueue = useRef(Promise.resolve());
  const selectedRef = useRef(Array(8).fill(null));
  const [changing, setChanging] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [overSlot, setOverSlot] = useState(null);
  const [movingSlot, setMovingSlot] = useState(null);
  const touchSource = useRef(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const pickerOpen = changing !== null;

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    setDraftLoaded(false);
    setRevision(0);
    api.get("/quotations/colour-comparison/draft/").then(({ data }) => {
      if (!active) return;
      const slots = Array.isArray(data.slots) ? data.slots : Array(8).fill(null);
      selectedRef.current = slots;
      setSelected(slots);
      setDraftLoaded(true);
    }).catch(() => {
      if (active) setNotice("Saved colours could not be loaded. Please reload before editing.");
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!draftLoaded || revision === 0) return;
    const ids = selected.map((colour) => colour?.id ?? null);
    saveQueue.current = saveQueue.current.catch(() => {}).then(() =>
      api.put("/quotations/colour-comparison/draft/", { slots: ids })
    ).catch(() => setNotice("These colours could not be saved. Please try changing a shade again."));
  }, [selected, revision, draftLoaded]);

  function updateSelected(change) {
    const next = change(selectedRef.current);
    selectedRef.current = next;
    setSelected(next);
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    if (!pickerOpen) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/quotations/chat/colours/", { params: { q: query.trim(), group, offset: 0 } });
        if (!active) return;
        setResults(data.results);
        setCount(data.count);
        setNextOffset(data.next_offset);
      } catch {
        if (active) setError("Colours could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pickerOpen, query, group]);

  async function more() {
    if (nextOffset === null || loading) return;
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/chat/colours/", { params: { q: query.trim(), group, offset: nextOffset } });
      setResults((current) => [...current, ...data.results]);
      setNextOffset(data.next_offset);
    } catch {
      setError("More colours could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function choose(colour) {
    updateSelected((current) => current.map((item, index) => index === changing ? colour : item));
    setChanging(null);
    setNotice("");
  }

  function swapSlots(from, to) {
    if (!Number.isInteger(from) || from < 0 || from > 7 || to < 0 || to > 7 || from === to) return;
    updateSelected((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setDragging(null);
    setOverSlot(null);
    setMovingSlot(null);
    setNotice("");
  }

  function dropColour(event, slot) {
    event.preventDefault();
    const sourceValue = event.dataTransfer.getData("application/x-bp-colour-slot");
    if (!sourceValue) return;
    const source = Number(sourceValue);
    swapSlots(source, slot);
  }

  function finishTouch(event) {
    if (touchSource.current === null) return;
    const touch = event.changedTouches[0];
    const destination = document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-colour-slot]");
    if (destination && Number(destination.dataset.colourSlot) !== touchSource.current) {
      event.preventDefault();
      swapSlots(touchSource.current, Number(destination.dataset.colourSlot));
    }
    touchSource.current = null;
  }

  function renderSlot(slot) {
    const colour = selected[slot];
    const selectedForMove = movingSlot === slot;
    return <div key={slot} data-colour-slot={slot} onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); setOverSlot(slot); } }} onDragLeave={() => setOverSlot((current) => current === slot ? null : current)} onDrop={(event) => dropColour(event, slot)} onClick={(event) => { if (movingSlot !== null && !event.target.closest("button")) swapSlots(movingSlot, slot); }} className={`min-w-0 overflow-hidden rounded-xl border ${dragging === slot || selectedForMove || overSlot === slot ? "border-[var(--app-primary,#176b9b)] ring-2 ring-sky-200" : "border-slate-200"}`}>
      {colour ? <article draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-bp-colour-slot", String(slot)); setDragging(slot); }} onDragEnd={() => { setDragging(null); setOverSlot(null); }}>
        <div className="h-28" style={{ backgroundColor: colour.hex }} />
        <div className="p-2.5"><div className="flex items-start justify-between gap-1"><div className="min-w-0"><b className="block truncate text-xs text-slate-900">{colour.name}</b><small className="block truncate text-[11px] text-slate-500">{colour.brand} · {colour.code}</small></div><button type="button" onClick={() => updateSelected((current) => current.map((item, index) => index === slot ? null : item))} aria-label={`Remove ${colour.name}`} className="rounded p-0.5 text-slate-500"><X className="h-4 w-4" /></button></div>
          <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={() => setChanging(slot)} className="rounded-md border border-sky-200 px-2 py-1 text-[11px] font-semibold text-[var(--app-primary,#176b9b)]">Change</button><button type="button" onClick={() => setMovingSlot((current) => current === slot ? null : slot)} onTouchStart={() => { touchSource.current = slot; }} onTouchEnd={finishTouch} className="rounded-md p-1 text-slate-500 touch-none" aria-label={`Drag ${colour.name} to another slot`} title="Drag to another slot, or tap then tap a destination"><GripVertical className="h-4 w-4" /></button></div>
        </div>
      </article> : <button type="button" onClick={() => { if (movingSlot !== null) swapSlots(movingSlot, slot); else setChanging(slot); }} className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 border-dashed text-sm font-semibold text-[var(--app-primary,#176b9b)]"><Plus className="h-5 w-5" />{movingSlot !== null ? "Place here" : "Add colour"}</button>}
    </div>;
  }

  async function openShare() {
    setShareOpen(true);
    setShareBusy(true);
    setShareError("");
    setSafetyAccepted(false);
    try {
      if (user?.role === "CUSTOMER") {
        const { data } = await api.get("/quotations/customer/connection-requests/");
        setContacts((data.results || []).filter((item) => item.status === "CONNECTED").map((item) => ({
          type: "CONTRACTOR",
          id: item.contractor.id,
          connection: item.id,
          name: item.contractor.business_name,
          subtitle: item.contractor.contractor_id || "Contractor",
        })));
      } else {
        const { data } = await api.get("/quotations/chat/contacts/");
        setContacts(data);
      }
    } catch (requestError) {
      setShareError(requestError.response?.data?.detail || "Messenger contacts could not be loaded.");
    } finally {
      setShareBusy(false);
    }
  }

  async function sendTo(target) {
    if (shareBusy || !safetyAccepted) return;
    setShareBusy(true);
    setShareError("");
    try {
      const recipient = user?.role === "PAINTER" ? { contractor: target.id }
        : user?.role === "CUSTOMER" ? { connection: target.connection }
          : target.type === "PAINTER" ? { painter: target.id } : { customer: target.id };
      const { data: conversation } = await api.post("/quotations/chat/conversations/", recipient);
      await api.post(`/quotations/chat/conversations/${conversation.id}/messages/`, {
        colour_comparison: [0, 1, 2, 3].map((section) => ({
          section: section + 1,
          colours: selected.slice(section * 2, section * 2 + 2).filter(Boolean).map((colour) => colour.id),
        })).filter((section) => section.colours.length > 0),
      });
      setShareOpen(false);
      navigate(`/messages?conversation=${conversation.id}`);
    } catch (requestError) {
      const response = requestError.response?.data;
      setShareError(response?.detail || response?.connection || response?.contractor || response?.customer || response?.painter || response?.colour_comparison || "Comparison could not be sent.");
    } finally {
      setShareBusy(false);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-primary,#176b9b)]">Work · Colour studio</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Colors &amp; Shades</h1>
      
    </header>
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 ${draftLoaded ? "" : "pointer-events-none opacity-60"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Your comparison</h2><p className="text-xs text-slate-500">{selected.filter(Boolean).length} of 8 colours selected · Drag a shade to another slot</p></div><button type="button" onClick={openShare} disabled={!selected.some(Boolean)} className="flex items-center gap-2 rounded-lg bg-[var(--app-primary,#176b9b)] text-[var(--app-on-primary,#fff)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Share2 className="h-4 w-4" />Share in Messages</button></div>
      {notice && <p role="status" className="mb-3 text-sm text-[var(--app-primary,#176b9b)]">{notice}</p>}
      {movingSlot !== null && <p role="status" className="mb-3 rounded-lg bg-sky-50 p-2 text-xs text-[var(--app-primary,#176b9b)]">Choose another slot to place this colour, or drag the grip icon to it.</p>}
      <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((section) => <section key={section} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Comparison {section + 1}</h3><span className="text-[11px] text-slate-500">{selected.slice(section * 2, section * 2 + 2).filter(Boolean).length} / 2 shades</span></div><div className="grid grid-cols-2 gap-2 sm:gap-3">{renderSlot(section * 2)}{renderSlot(section * 2 + 1)}</div></section>)}</div>
      
    </section>
    {pickerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Choose paint colour"><div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">{selected[changing] ? "Change colour" : "Add colour"}</h2></div><button type="button" onClick={() => setChanging(null)} aria-label="Close" className="rounded-lg p-2"><X className="h-5 w-5" /></button></div><div className="border-b p-4"><label className="flex items-center gap-2 rounded-lg border px-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search colours or shade code" className="h-10 min-w-0 flex-1 text-sm outline-none" /></label><div className="mt-3 flex gap-2 overflow-x-auto">{groups.map((item) => <button type="button" key={item} onClick={() => setGroup(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${group === item ? "border-[var(--app-primary,#176b9b)] bg-[var(--app-primary,#176b9b)] text-[var(--app-on-primary,#fff)]" : "border-slate-200"}`}>{item}</button>)}</div><p className="mt-2 text-xs text-slate-500">Showing {results.length} of {count} colours</p></div><div className="overflow-y-auto p-4"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{results.map((colour) => <button type="button" key={colour.id} disabled={selected.some((item, index) => item?.id === colour.id && index !== changing)} onClick={() => choose(colour)} className="flex items-center gap-2 rounded-lg border p-2 text-left disabled:opacity-40"><span className="h-10 w-10 shrink-0 rounded-md border" style={{ backgroundColor: colour.hex }} /><span className="min-w-0"><b className="block truncate text-xs">{colour.name}</b><small className="block truncate text-[11px] text-slate-500">{colour.brand} · {colour.code}</small></span></button>)}</div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{loading && <p className="mt-3 text-sm text-slate-500">Loading colours…</p>}{nextOffset !== null && <button type="button" onClick={more} disabled={loading} className="mt-4 w-full rounded-lg border px-3 py-2 text-sm">Show more colours</button>}</div></div></div>}
    {shareOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-labelledby="colour-share-title"><section className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div><h2 id="colour-share-title" className="font-bold">Share in Messages</h2><p className="text-xs text-slate-500">Choose a connected contact</p></div><button type="button" disabled={shareBusy} onClick={() => setShareOpen(false)} aria-label="Close sharing" className="rounded-lg p-2"><X className="h-5 w-5" /></button></div><div className="p-4"><label className="flex items-center gap-2 rounded-lg border px-3"><Search className="h-4 w-4 text-slate-400" /><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Search contacts" className="h-10 min-w-0 flex-1 text-sm outline-none" /></label><label className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={safetyAccepted} onChange={(event) => setSafetyAccepted(event.target.checked)} className="mt-0.5" /><span>Messages are not private. Do not share OTPs, passwords or sensitive personal information.</span></label></div>{shareError && <p role="alert" className="mx-4 text-sm text-red-700">{shareError}</p>}<div className="min-h-16 overflow-y-auto px-3 pb-4">{contacts.filter((target) => `${target.name} ${target.subtitle}`.toLowerCase().includes(contactSearch.toLowerCase())).map((target) => <button type="button" key={`${target.type}-${target.id}`} disabled={shareBusy || !safetyAccepted} onClick={() => sendTo(target)} className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left hover:bg-slate-50 disabled:opacity-50"><span className="min-w-0"><b className="block truncate text-sm">{target.name}</b><small className="text-xs text-slate-500">{target.type === "PAINTER" ? "Paint applicator" : target.type === "CUSTOMER" ? "Customer" : "Contractor"} · {target.subtitle}</small></span><Share2 className="h-4 w-4 shrink-0 text-[var(--app-primary,#176b9b)]" /></button>)}{!shareBusy && contacts.length === 0 && !shareError && <p className="p-4 text-center text-sm text-slate-500">No connected contacts are available.</p>}</div></section></div>}
  </div>;
}
