import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./special-wall-sheet.css";
import { availableWallArea } from "../utils/specialWallArea";

export default function SpecialWallSheet({ parent, wall, walls, masters, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({ name: "", quantity: "", service_category: parent.service_category || masters.categories.find((entry) => entry.name.toLowerCase().includes("paint"))?.id || "", custom_service_category: "", paint_brand: "", paint_type: "", coats: 2, ...wall }));
  const dialog = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  const available = availableWallArea(parent.quantity, walls, parent.field_id, wall?.field_id);
  const area = Number(draft.quantity);
  const tooLarge = area > available;
  const valid = draft.name.trim() && Number.isFinite(area) && area > 0 && !tooLarge;
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.querySelector("input")?.focus();
    function onKey(event) {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input, select, textarea')];
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, []);
  return createPortal(<div className="special-wall-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={dialog} className="special-wall-sheet" role="dialog" aria-modal="true" aria-labelledby="special-wall-title" onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ ...draft, name: draft.name.trim(), quantity: area }); }}>
      <header className="special-wall-header"><div className="special-wall-handle" /><h2 id="special-wall-title">{wall ? "Edit Special Wall" : "Add Special Wall"}</h2><p>{parent.room_name} · All Walls {parent.quantity} sqft</p></header>
      <div className="special-wall-body">
        <p className="special-wall-available">Available wall area: {available} sqft</p>
        <label>Wall / Surface Name<input required maxLength={120} placeholder="Example: Texture Wall" value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
        <div className="special-wall-options">{["Texture Wall", "Accent Wall", "Damp Area", "Custom"].map((name) => <button key={name} type="button" onClick={() => { update("name", name === "Custom" ? "" : name); dialog.current.querySelector("input").focus(); }}>{name}</button>)}</div>
        <label>Area<div className="special-wall-area"><input type="number" inputMode="decimal" required min="0.01" step="0.01" max={available} value={draft.quantity} aria-invalid={tooLarge} aria-describedby="special-wall-maximum special-wall-error" onChange={(event) => update("quantity", event.target.value)} /><span>sqft</span></div><small id="special-wall-maximum">Maximum available: {available} sqft</small></label>
        <p id="special-wall-error" className="special-wall-error" role="alert">{tooLarge ? `Area cannot exceed the available wall area of ${available} sqft.` : draft.quantity !== "" && area <= 0 ? "Enter an area greater than zero." : ""}</p>
        <label>Type of service<select value={draft.service_category || ""} onChange={(event) => setDraft((current) => ({ ...current, service_category: event.target.value, custom_service_category: "", paint_type: "" }))}>{!draft.service_category && <option value="">Select service</option>}{masters.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label>Brand<select value={draft.paint_brand} onChange={(event) => update("paint_brand", event.target.value)}><option value="">Select brand</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label>Product<select value={draft.paint_type} onChange={(event) => {
          const product = masters.paintTypes.find((entry) => String(entry.id) === event.target.value);
          setDraft((current) => ({ ...current, paint_type: event.target.value, ...(product?.service_category ? { service_category: product.service_category, custom_service_category: "" } : {}) }));
        }}><option value="">Select product</option>{masters.paintTypes.filter((entry) => !draft.service_category || !entry.service_category || String(entry.service_category) === String(draft.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label>Paint Coats<select value={draft.coats} onChange={(event) => update("coats", Number(event.target.value))}>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>

      </div>
      <footer className="special-wall-footer">{wall && <button type="button" className="special-wall-delete" onClick={onDelete}>Delete</button>}<button type="button" onClick={onClose}>Cancel</button><button type="submit" className="special-wall-primary" disabled={!valid}>{wall ? "Save Changes" : "Add Special Wall"}</button></footer>
    </form>
  </div>, document.body);
}
