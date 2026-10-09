import { lockBodyScroll } from "../utils/bodyScrollLock.js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Eye } from "lucide-react";
import { assignedGroup, deleteAssignment, measuredSurfaces, pricedLines, roomContribution, saveGroup, saveSpecial, specificationLines, surfaceLabel, surfaceKey, surfaceOptions, validateSpec, saveGeneralService } from "../utils/groupedQuotation.js";
import "./special-wall-sheet.css";
import "./grouped-quotation.css";
import { quotationMeasurementTables, measuredTotal, measurementBucket, hasMeasurement } from "../utils/quotationMeasurementTables.js";
const AssignmentContext = createContext(null);
const number = (value) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const labelFor = (entries, id) => entries.find((entry) => String(entry.id) === String(id))?.name || "Not selected";
const nextId = (kind) => `${kind}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

function Dialog({ title, onClose, children, footer, className = "" }) {
  const { measurement } = useContext(AssignmentContext);
  const element = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    element.current.querySelector("select, input, button")?.focus();
    const handle = (event) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const controls = [...element.current.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea")];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { releaseScrollLock(); document.removeEventListener("keydown", handle); before?.focus(); };
  }, []);
  return <div className="special-wall-backdrop gq-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={element} className={`special-wall-sheet gq-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="gq-dialog-title">
      <header className="special-wall-header"><div className="special-wall-handle" /><div className="gq-heading"><h2 id="gq-dialog-title">{title}</h2><button type="button" className="gq-icon" onClick={onClose} aria-label="Close popup"><X size={20} /></button></div><p>Measurement version {measurement.version}</p></header>
      <div className="special-wall-body gq-dialog-body">{children}</div>
      <footer className="special-wall-footer">{footer}</footer>
    </section>
  </div>;
}

function SpecificationFields({ spec, onChange }) {
  const { masters } = useContext(AssignmentContext);
  const update = (key, value) => onChange({ ...spec, [key]: value });
  return <div className="gq-spec-fields">
    <label>Type of service<select value={spec.service_category} onChange={(event) => onChange({ ...spec, service_category: Number(event.target.value), paint_type: "" })}>{masters.categories.filter((entry) => !entry.general).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Brand<select value={spec.paint_brand} onChange={(event) => update("paint_brand", Number(event.target.value))}><option value="">Select brand</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Product<select value={spec.paint_type} onChange={(event) => update("paint_type", Number(event.target.value))}><option value="">Select product</option>{masters.paintTypes.filter((entry) => entry.service_category === Number(spec.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Primer Coats<select value={spec.primer_coats} onChange={(event) => update("primer_coats", Number(event.target.value))}>{[0,1,2,3,4,5,6].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Paint Coats<select value={spec.coats} onChange={(event) => update("coats", Number(event.target.value))}>{[1,2,3,4,5,6].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Description / treatment<input maxLength={255} list={`gq-description-${spec.service_category}`} value={spec.description || ""} onChange={(event) => update("description", event.target.value)} /><datalist id={`gq-description-${spec.service_category}`}>{(masters.descriptions || []).filter((entry) => !entry.service_category || String(entry.service_category) === String(spec.service_category)).map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label>
    {String(spec.description || "").trim() && <label className="gq-save-description"><input type="checkbox" checked={Boolean(spec.promote_to_master)} onChange={(event) => update("promote_to_master", event.target.checked)} />Save this Product Description for future quotations</label>}
  </div>;
}

function AssignmentDialog({ editor, state, onSave, onClose }) {
  const { measurement, masters, defaultSpec, initialRoomIds } = useContext(AssignmentContext);
  const special = editor.kind === "special";
  const availableSurfaces = surfaceOptions(measurement);
  const initialSurface = editor.initialSurface && availableSurfaces.includes(editor.initialSurface) ? editor.initialSurface : availableSurfaces.includes("WALL") ? "WALL" : availableSurfaces[0] || "WALL";
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(state.rates[editor.value?.id] ?? "");
  const [draft, setDraft] = useState(() => editor.value ? { ...editor.value, spec: { ...editor.value.spec } } : special
    ? { id: nextId("special"), name: "Texture Wall", room_id: editor.initialRoomId ?? measurement.rooms[0]?.id ?? "", surface_ids: [], spec: { ...defaultSpec, service_category: masters.categories.find((entry) => /texture/i.test(entry.name))?.id || defaultSpec.service_category, paint_type: "" } }
    : { id: nextId("group"), name: "", surface: initialSurface, room_ids: initialRoomIds.filter((id) => !assignedGroup(state.groups, id, initialSurface) && roomContribution(measurement, state.specials, id, initialSurface).quantity > 0), spec: { ...defaultSpec } });
  const contributions = special ? [] : draft.room_ids.map((roomId) => roomContribution(measurement, state.specials, roomId, draft.surface));
  const walls = special ? measuredSurfaces(measurement, draft.room_id, "WALL") : [];
  const total = special ? walls.filter((wall) => draft.surface_ids.includes(wall.id)).reduce((sum, wall) => sum + Number(wall.net_area), 0) : contributions.reduce((sum, entry) => sum + entry.quantity, 0);
  const selectionCount = special ? draft.surface_ids.length : draft.room_ids.length;
  const availableRoomIds = special ? [] : measurement.rooms
    .filter((room) => !assignedGroup(state.groups, room.id, draft.surface, draft.id) && roomContribution(measurement, state.specials, room.id, draft.surface).quantity > 0)
    .map((room) => room.id);
  const allRoomsSelected = availableRoomIds.length > 0 && availableRoomIds.every((id) => draft.room_ids.includes(id));
  const surfaceBalances = special ? [] : availableSurfaces.map((surface) => {
    const remainingRooms = measurement.rooms.filter((room) =>
      !assignedGroup(state.groups, room.id, surface, draft.id)
      && !(surface === draft.surface && draft.room_ids.includes(room.id))
      && roomContribution(measurement, state.specials, room.id, surface).quantity > 0);
    return {
      surface, rooms: remainingRooms,
      quantity: remainingRooms.reduce((sum, room) => sum + roomContribution(measurement, state.specials, room.id, surface).quantity, 0),
    };
  });
  const toggleAllRooms = () => {
    setError("");
    setDraft((current) => ({ ...current, room_ids: allRoomsSelected ? [] : [...availableRoomIds] }));
  };
  const toggle = (key, id) => { setError(""); setDraft((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] })); };
  let specValid = true;
  try { validateSpec(draft.spec, masters); } catch { specValid = false; }
  const save = () => {
    try {
      const fallback = special ? "Special Wall" : contributions.length > 1 ? `${contributions.length} Rooms - ${surfaceLabel(draft.surface)}` : `${contributions[0]?.room_name || "Room"} - ${surfaceLabel(draft.surface)}`;
      const named = { ...draft, name: draft.name.trim() || fallback.slice(0, 120) };
      if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate.");
      const next = special ? saveSpecial(state, named, measurement, masters) : saveGroup(state, named, measurement, masters);
      onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } });
    } catch (failure) { setError(failure.message); }
  };
  return <Dialog title={`${editor.value ? "Edit" : "Create"} ${special ? "Special Wall" : "Paint Areas"}`} onClose={onClose} footer={<>
    <button type="button" onClick={onClose}>Cancel</button>
    {stage === 1 && <button type="button" onClick={() => setStage(0)}>Back</button>}
    <button type="button" className="special-wall-primary" disabled={!selectionCount || total <= 0 || (stage === 1 && !specValid)} onClick={() => stage === 0 ? setStage(1) : save()}>{stage === 0 ? "Continue" : special ? "Save Special Wall" : "Save Paint Areas"}</button>
  </>}>
    {error && <p className="gq-error" role="alert">{error}</p>}
    {stage === 0 ? <>
      {special ? <label>Select Room<select value={draft.room_id} onChange={(event) => setDraft((current) => ({ ...current, room_id: Number(event.target.value), surface_ids: [] }))}>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        : <label>1. Select Surface<select value={draft.surface} onChange={(event) => setDraft((current) => ({ ...current, surface: event.target.value, room_ids: [] }))}>{surfaceOptions(measurement).map((type) => <option key={type} value={type}>{surfaceLabel(type)}</option>)}</select></label>}
      {!special && <section className="gq-surface-balances" aria-label="Remaining surface areas">
        <h3>Remaining surface areas</h3>
        <p>Available after saved assignments and your current selection.</p>
        <div className="gq-surface-balance-grid">{surfaceBalances.map((balance) => <div key={balance.surface} data-surface={balance.surface} className="gq-surface-balance">
          <strong>{surfaceLabel(balance.surface)}</strong>
          <span>Remaining: {number(balance.quantity)} sqft</span>
          <p>{balance.rooms.length ? balance.rooms.map((room) => room.name).join(", ") : "No remaining rooms"}</p>
        </div>)}</div>
      </section>}
      <h3>{special ? "Select Individual Measured Walls" : "2. Select Multiple Rooms"}</h3>
      {!special && <div className="gq-select-all"><button type="button" disabled={!availableRoomIds.length} onClick={toggleAllRooms}>{allRoomsSelected ? "Clear selection" : "Select all"}</button><span>{availableRoomIds.length} available rooms</span></div>}
      <div className="gq-room-list">{special ? walls.map((wall) => {
        const assigned = state.specials.find((entry) => entry.id !== draft.id && entry.surface_ids.includes(wall.id));
        return <label key={wall.id} className={`gq-room-option ${assigned ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.surface_ids.includes(wall.id)} disabled={Boolean(assigned) || Number(wall.net_area) <= 0} onChange={() => toggle("surface_ids", wall.id)} /><span>{wall.name}{assigned && <small>Assigned - {assigned.name}</small>}</span><b>{number(wall.net_area)} sqft</b></label>;
      }) : measurement.rooms.map((room) => {
        const contribution = roomContribution(measurement, state.specials, room.id, draft.surface);
        const assigned = assignedGroup(state.groups, room.id, draft.surface, draft.id);
        const disabled = Boolean(assigned) || contribution.quantity <= 0;
        return <label key={room.id} className={`gq-room-option ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.room_ids.includes(room.id)} disabled={disabled} onChange={() => toggle("room_ids", room.id)} /><span>{room.name}{assigned && <small>Assigned - {labelFor(masters.paintTypes, assigned.spec.paint_type)}</small>}{!assigned && contribution.quantity !== contribution.original_area && <small>Normal walls; original {number(contribution.original_area)} sqft</small>}</span><b>{number(contribution.quantity)} sqft</b></label>;
      })}</div>
    </> : <>
      <label>{special ? "Wall / Surface Name" : "Area Name"}<input maxLength={120} value={draft.name} placeholder={special ? "Texture Wall" : "Example: Bedrooms Walls"} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <h3>3. Assign Product and Coats</h3>
      <SpecificationFields spec={draft.spec} onChange={(spec) => setDraft((current) => ({ ...current, spec }))} />
      <label>Rate per sqft<input aria-label="Assignment rate" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
      <div className="gq-selection-summary"><strong>Amount: {money(Number.isFinite(Number(rate)) && Number(rate) >= 0 ? total * Number(rate) : 0)}</strong></div>
    </>}
    <div className="gq-selection-summary" aria-live="polite" aria-atomic="true"><b>Selected: {selectionCount} {special ? "Walls" : "Rooms"}</b><strong>Total Area: {number(total)} sqft</strong></div>
  </Dialog>;
}

function GeneralServiceDialog({ editor, state, onClose, onSave }) {
  const { measurement, masters, defaultSpec } = useContext(AssignmentContext);
  const [draft, setDraft] = useState(() => editor.value || { id: nextId("service"), room_id: "", quantity: 1, unit: masters.units.find((entry) => /job|lump/i.test(entry.name))?.id || masters.units[0]?.id || "", spec: { service_category: defaultSpec.service_category, description: "", coats: 1 } });
  const [error, setError] = useState("");
  const [rate, setRate] = useState(state.rates[editor.value?.id] ?? "");
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => { try { if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate."); const next = saveGeneralService(state, draft, measurement, masters); onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } }); } catch (failure) { setError(failure.message); } };
  return <Dialog title={editor.value ? "Edit General Service" : "Add General Service"} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="special-wall-primary" onClick={submit}>Save General Service</button></>}>
    {error && <p className="gq-error" role="alert">{error}</p>}
    <label>Type of service<select value={draft.spec.service_category} onChange={(event) => update("spec", { ...draft.spec, service_category: Number(event.target.value), paint_type: "" })}>{masters.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Room / Area<select value={draft.room_id || ""} onChange={(event) => update("room_id", event.target.value ? Number(event.target.value) : "")}><option value="">General / Whole property</option>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Brand<select value={draft.spec.paint_brand || ""} onChange={(event) => update("spec", { ...draft.spec, paint_brand: event.target.value ? Number(event.target.value) : "" })}><option value="">Select brand - optional</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Product<select value={draft.spec.paint_type || ""} onChange={(event) => update("spec", { ...draft.spec, paint_type: event.target.value ? Number(event.target.value) : "" })}><option value="">Select product - optional</option>{masters.paintTypes.filter((entry) => Number(entry.service_category) === Number(draft.spec.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Description<textarea maxLength={255} value={draft.spec.description} rows={3} onChange={(event) => update("spec", { ...draft.spec, description: event.target.value })} placeholder="Describe the work to be done" /></label>
    <label>Quantity<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} /></label>
    <label>Unit<select value={draft.unit} onChange={(event) => update("unit", Number(event.target.value))}>{masters.units.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Rate per unit<input aria-label="Assignment rate" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
    <div className="gq-selection-summary"><strong>Amount: {money(Number(draft.quantity || 0) * (Number.isFinite(Number(rate)) && Number(rate) >= 0 ? Number(rate) : 0))}</strong></div>
  </Dialog>;
}

function AssignmentCard({ line, onEdit, onDelete, onContributions }) {
  const { masters, squareFeetUnit } = useContext(AssignmentContext);
  return <article className="gq-assignment-card">
    <div className="gq-assignment-row">
      <div className="gq-assignment-scope"><h3>{line.name}</h3><p>{line.contributions.length > 0 ? <button type="button" className="gq-room-surface-trigger" aria-label={`View rooms for ${line.name}`} aria-haspopup="dialog" onClick={onContributions}>{line.scope}</button> : line.scope}</p></div>
      <div><span className="gq-row-label">Type of service</span><span>{labelFor(masters.categories, line.spec.service_category)}</span></div>
      <div><span className="gq-row-label">Surface</span>{line.contributions.length > 0 ? <button type="button" className="gq-tag gq-room-surface-trigger" aria-label={`View surface for ${line.name}`} aria-haspopup="dialog" onClick={onContributions}>{line.surface_label}</button> : <span className="gq-tag">{line.surface_label}</span>}</div>
      <div><span className="gq-row-label">Brand</span><span>{labelFor(masters.brands, line.spec.paint_brand)}</span></div>
      <div><span className="gq-row-label">Product</span><strong>{labelFor(masters.paintTypes, line.spec.paint_type)}</strong></div>
      <div><span className="gq-row-label">Area</span><b className="gq-assignment-area">{number(line.quantity)} {labelFor(masters.units, line.unit || squareFeetUnit)}</b></div>
      <div><span className="gq-row-label">Coats</span><span>{line.kind === "service" ? "Not applicable" : `Primer ${line.spec.primer_coats} + Paint ${line.spec.coats}`}</span></div>
      <div className="gq-actions gq-assignment-actions"><button onClick={onEdit}><Pencil size={16} />Edit</button><button onClick={onDelete}><Trash2 size={16} />Delete</button></div>
    </div>

  </article>;
}


function MeasurementTables({ measurement, onView }) {
  const tables = quotationMeasurementTables(measurement);
  const labels = { WALL: "Net Walls", CEILING: "Net Ceiling", DOOR: "Door", WINDOW: "Window", OTHER: "Other" };
  return <div className="gq-surface-tables">{tables.map(({title, types, rows}) => <section key={title} aria-label={title} className="gq-measurement-table-card">
    <h4>{title}</h4>
    <table className="gq-surface-table" data-mobile-table="keep">
      <thead><tr><th scope="col">Room / Area</th>{types.map((type) => <th key={type} scope="col">{labels[type]}<small>sqft</small></th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <th scope="row"><button type="button" className="gq-room-name" onClick={() => onView(row)} aria-haspopup="dialog">{row.name}</button></th>
        {types.map((type) => <td key={type}>{row.surfaces.some((surface) => measurementBucket(surface) === type && hasMeasurement(surface)) ? number(measuredTotal(row, type)) : "—"}</td>)}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Final net total</th>{types.map((type) => <td key={type}>{number(rows.reduce((total, row) => total + measuredTotal(row, type), 0))}</td>)}</tr></tfoot>
    </table>
  </section>)}{!tables.length && <p className="gq-measurement-none">No measurements saved yet.</p>}</div>;
}

export default function GroupedQuotationWorkspace({ measurement, masters, state, onChange, phase = "assignments", showMeasurements = true, extraActions = null, displayMeasurement = null, requestedEditor = null, onEditorRequestHandled = null }) {
  const [editor, setEditor] = useState(null);
  const [recordRoom, setRecordRoom] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [contributionId, setContributionId] = useState(null);
  const [notice, setNotice] = useState("");
  const [initialRoomIds, setInitialRoomIds] = useState([]);
  useEffect(() => {
    if (!requestedEditor) return;
    setInitialRoomIds(measurement.rooms.map((room) => room.id));
    setEditor(requestedEditor);
    onEditorRequestHandled?.();
  }, [requestedEditor, onEditorRequestHandled, measurement.rooms]);
  const lines = specificationLines(measurement, state);
  const pricing = pricedLines(measurement, state);
  const detail = pricing.find((line) => line.id === detailId);
  const contribution = lines.find((line) => line.id === contributionId);
  const painting = masters.categories.find((entry) => entry.name.toLowerCase() === "painting") || masters.categories.find((entry) => /paint/i.test(entry.name));
  const squareFeetUnit = masters.units.find((entry) => /^(sq\.?\s*(?:ft|feet)|sqft|square feet|square foot|sft|sq ft)$/i.test(entry.name.trim()))?.id || masters.units[0]?.id;
  const defaultSpec = { service_category: painting?.id || masters.categories[0]?.id || "", paint_brand: "", paint_type: "", primer_coats: 1, coats: 2, description: "" };
  const edit = (line) => setEditor({ kind: line.kind, value: (state[line.kind === "special" ? "specials" : line.kind === "service" ? "services" : "groups"] || []).find((entry) => entry.id === line.id) });
  const save = (next) => { onChange(next); setEditor(null); setNotice("Assignment saved. Areas and amounts recalculated."); };
  const roomCount = new Set([...state.groups.flatMap((group) => group.room_ids), ...state.specials.map((special) => special.room_id)]).size;
  const area = lines.filter((line) => line.kind !== "service").reduce((sum, line) => sum + line.quantity, 0);
  return <AssignmentContext.Provider value={{ measurement, masters, defaultSpec, squareFeetUnit, initialRoomIds }}><div className="gq-workspace">
    <p role="status" aria-live="polite" className="gq-notice">{notice}</p>
    {(phase === "measurements" || (phase === "assignments" && showMeasurements)) && <section className="gq-panel"><div className="gq-heading"><h2>Measurements</h2></div>
      <MeasurementTables measurement={displayMeasurement || measurement} onView={setRecordRoom} />
    </section>}
    {phase === "assignments" && <>
      <section className="gq-panel"><div className="gq-heading"><h2>Services &amp; Product</h2><div className="gq-actions"><button type="button" className="primary" onClick={() => setEditor({ kind: "group" })}><Plus size={18} />Create Paint Areas</button><button type="button" onClick={() => setEditor({ kind: "service" })}><Plus size={18} />Add General Service</button>{extraActions}</div></div>
        <dl className="gq-assignment-summary"><div><dt>Paint areas</dt><dd>{state.groups.length}</dd></div><div><dt>Special walls</dt><dd>{state.specials.length}</dd></div><div><dt>Assigned rooms</dt><dd>{roomCount} <small>of {measurement.rooms.length}</small></dd></div><div><dt>Assigned area</dt><dd>{number(area)} <small>sqft</small></dd></div></dl>
        {!lines.length && <div className="gq-empty"><p>Create a paint areas to assign measured rooms, or add a general service.</p></div>}
        {lines.length > 0 && <div className="gq-assignment-list"><div className="gq-assignment-columns" aria-hidden="true">{["Paint Areas / Rooms", "Type of service", "Surface", "Brand", "Product", "Area", "Coats", "Actions"].map((label) => <span key={label}>{label}</span>)}</div>{lines.map((line) => <AssignmentCard key={line.id} line={line} onEdit={() => edit(line)} onDelete={() => { onChange(deleteAssignment(state, line.id, line.kind)); setNotice("Assignment deleted. Remaining areas recalculated."); }} onContributions={() => setContributionId(line.id)} />)}</div>}
      </section>
    </>}
    {phase === "final" && <div className="gq-panel"><div className="gq-final-lines"><div className="gq-final-columns" aria-hidden="true">{["Area / Service", "Rooms", "Product", "Description", "Quantity", "Rate", "Amount", ""].map((label) => <span key={label}>{label}</span>)}</div>{pricing.map((line) => <article key={line.id} className="gq-final-row"><h3 className="gq-final-name">{line.name}</h3><p className="gq-final-scope">{line.contributions.length > 0 ? <button type="button" className="gq-room-surface-trigger" aria-label={`View rooms for ${line.name}`} aria-haspopup="dialog" onClick={() => setContributionId(line.id)}>{line.scope}</button> : line.scope}</p><b className="gq-final-product">{line.spec.paint_type ? labelFor(masters.paintTypes, line.spec.paint_type) : line.spec.description || "Service"}</b><span className="gq-final-description">{line.spec.description || line.name}</span><span className="gq-final-quantity">{number(line.quantity)} {labelFor(masters.units, line.unit || squareFeetUnit)}</span><span className="gq-final-rate">{line.rate_valid ? money(Number(line.rate)) : "Rate needed"}</span><strong className="gq-final-amount">{money(line.amount)}</strong><div className="gq-final-actions"><button type="button" className="gq-final-details" aria-label={`View details for ${line.name}`} onClick={() => setDetailId(line.id)}><Eye size={18} /></button><button type="button" className="gq-final-details" aria-label={`Edit ${line.name}`} onClick={() => edit(line)}><Pencil size={18} /></button></div></article>)}</div>{!pricing.length && <p>No assignments yet. Return to Services &amp; Product to add work.</p>}</div>}
    {recordRoom && <Dialog className="gq-measurement-dialog" title={`Original measurement records - ${recordRoom.name}`} onClose={() => setRecordRoom(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setRecordRoom(null)}>Close</button>}><div className="gq-room-record-card"><table className="gq-room-record-table" data-mobile-table="keep" aria-label={`Measurements for ${recordRoom.name}`}><thead><tr>{["Surface", "L", "W / H", "Deduction", "Addition", "Total"].map((label) => <th scope="col" key={label} data-no-sort="true" aria-label={label === "L" ? "Length" : label === "W / H" ? "Width or height" : undefined}>{label}{["Deduction", "Addition", "Total"].includes(label) && <small>sqft</small>}</th>)}</tr></thead><tbody>{(recordRoom.surfaces || measurement.surfaces.filter((surface) => String(surface.room) === String(recordRoom.id))).map((surface) => <tr key={surface.id}><th scope="row">{surface.name || surfaceLabel(surfaceKey(surface))}</th><td>{surface.length == null ? "\u2014" : number(surface.length)}</td><td>{surface.breadth == null ? "\u2014" : number(surface.breadth)}</td><td>{number(surface.deduction_area || 0)}</td><td>{number(surface.addition_area || 0)}</td><td>{number(surface.net_area || 0)}</td></tr>)}</tbody></table></div></Dialog>}
    {contribution && <Dialog title={`Room & surface details - ${contribution.name}`} onClose={() => setContributionId(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setContributionId(null)}>Close</button>}><table className="gq-records-table"><thead><tr><th scope="col">Room / Area</th><th scope="col">Assigned area</th></tr></thead><tbody>{contribution.contributions.map((entry) => <tr key={entry.room_id}><th scope="row">{entry.room_name}</th><td>{number(entry.quantity)} sqft</td></tr>)}</tbody></table><strong>Total: {number(contribution.quantity)} sqft</strong></Dialog>}
    {detail && <Dialog title={detail.name} onClose={() => setDetailId(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setDetailId(null)}>Close</button>}><dl className="gq-final-detail-list">{[["Room / Area", detail.scope], ["Type of service", labelFor(masters.categories, detail.spec.service_category)], ["Product", labelFor(masters.paintTypes, detail.spec.paint_type)], ["Brand", labelFor(masters.brands, detail.spec.paint_brand)], ["Description / treatment", detail.spec.description || detail.name], ["Quantity", `${number(detail.quantity)} ${labelFor(masters.units, detail.unit || squareFeetUnit)}`], ...(detail.kind !== "service" ? [["Coats", `Primer ${detail.spec.primer_coats} + Paint ${detail.spec.coats}`]] : []), ["Rate", detail.rate_valid ? money(Number(detail.rate)) : "Rate needed"], ["Amount", money(detail.amount)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Dialog>}
    {editor?.kind === "service" && <GeneralServiceDialog editor={editor} state={state} onSave={save} onClose={() => setEditor(null)} />}
    {editor && editor.kind !== "service" && <AssignmentDialog editor={editor} state={state} onSave={save} onClose={() => setEditor(null)} />}
  </div></AssignmentContext.Provider>;
}
