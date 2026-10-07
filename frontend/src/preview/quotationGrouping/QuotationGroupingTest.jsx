import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, ArrowRight, Eye } from "lucide-react";
import { measurement, masters, defaultSpec, exampleAssignments } from "./fixtures.js";
import { assignedGroup, deleteAssignment, measuredSurfaces, pricedLines, roomContribution, saveGroup, saveSpecial, specificationLines, surfaceLabel, surfaceOptions, toQuotationItems, validateSpec, saveGeneralService } from "./model.js";
import "../../components/special-wall-sheet.css";
import "./quotation-grouping-test.css";

const number = (value) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const labelFor = (entries, id) => entries.find((entry) => String(entry.id) === String(id))?.name || "Not selected";
const emptyState = () => ({ groups: [], specials: [], services: [], rates: {} });
const nextId = (kind) => `${kind}-${crypto.randomUUID()}`;

function Dialog({ title, onClose, children, footer }) {
  const element = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.current.querySelector("select, input, button")?.focus();
    const handle = (event) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const controls = [...element.current.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea")];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handle); before?.focus(); };
  }, []);
  return <div className="special-wall-backdrop pg-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={element} className="special-wall-sheet pg-dialog" role="dialog" aria-modal="true" aria-labelledby="pg-dialog-title">
      <header className="special-wall-header"><div className="special-wall-handle" /><div className="pg-heading"><h2 id="pg-dialog-title">{title}</h2><button type="button" className="pg-icon" onClick={onClose} aria-label="Close popup"><X size={20} /></button></div><p>Sample measurements - version {measurement.version}</p></header>
      <div className="special-wall-body pg-dialog-body">{children}</div>
      <footer className="special-wall-footer">{footer}</footer>
    </section>
  </div>;
}

function SpecificationFields({ spec, onChange }) {
  const update = (key, value) => onChange({ ...spec, [key]: value });
  return <div className="pg-spec-fields">
    <label>Type of service<select value={spec.service_category} onChange={(event) => onChange({ ...spec, service_category: Number(event.target.value), paint_type: "" })}>{masters.categories.filter((entry) => !entry.general).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Brand<select value={spec.paint_brand} onChange={(event) => update("paint_brand", Number(event.target.value))}><option value="">Select brand</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Product<select value={spec.paint_type} onChange={(event) => update("paint_type", Number(event.target.value))}><option value="">Select product</option>{masters.paintTypes.filter((entry) => entry.service_category === Number(spec.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Primer Coats<select value={spec.primer_coats} onChange={(event) => update("primer_coats", Number(event.target.value))}>{[0,1,2,3,4,5,6].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Paint Coats<select value={spec.coats} onChange={(event) => update("coats", Number(event.target.value))}>{[1,2,3,4,5,6].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Description / treatment<textarea rows={3} value={spec.description || ""} onChange={(event) => update("description", event.target.value)} /></label>
  </div>;
}

function AssignmentDialog({ editor, state, onSave, onClose }) {
  const special = editor.kind === "special";
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(state.rates[editor.value?.id] ?? "");
  const [draft, setDraft] = useState(() => editor.value ? { ...editor.value, spec: { ...editor.value.spec } } : special
    ? { id: nextId("special"), name: "Texture Wall", room_id: 1, surface_ids: [], spec: { ...defaultSpec, service_category: 2, paint_type: 4 } }
    : { id: nextId("group"), name: "", surface: "WALL", room_ids: [], spec: { ...defaultSpec } });
  const contributions = special ? [] : draft.room_ids.map((roomId) => roomContribution(measurement, state.specials, roomId, draft.surface));
  const walls = special ? measuredSurfaces(measurement, draft.room_id, "WALL") : [];
  const total = special ? walls.filter((wall) => draft.surface_ids.includes(wall.id)).reduce((sum, wall) => sum + Number(wall.net_area), 0) : contributions.reduce((sum, entry) => sum + entry.quantity, 0);
  const selectionCount = special ? draft.surface_ids.length : draft.room_ids.length;
  const availableRoomIds = special ? [] : measurement.rooms
    .filter((room) => !assignedGroup(state.groups, room.id, draft.surface, draft.id) && roomContribution(measurement, state.specials, room.id, draft.surface).quantity > 0)
    .map((room) => room.id);
  const allRoomsSelected = availableRoomIds.length > 0 && availableRoomIds.every((id) => draft.room_ids.includes(id));
  const toggleAllRooms = () => {
    setError("");
    setDraft((current) => ({ ...current, room_ids: allRoomsSelected ? [] : [...availableRoomIds] }));
  };
  const toggle = (key, id) => { setError(""); setDraft((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] })); };
  let specValid = true;
  try { validateSpec(draft.spec, masters); } catch { specValid = false; }
  const save = () => {
    try {
      const named = { ...draft, name: draft.name || (special ? "Special Wall" : `${contributions.map((entry) => entry.room_name).join(", ")} ${surfaceLabel(draft.surface)}`) };
      if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate.");
      const next = special ? saveSpecial(state, named, measurement, masters) : saveGroup(state, named, measurement, masters);
      onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } });
    } catch (failure) { setError(failure.message); }
  };
  return <Dialog title={`${editor.value ? "Edit" : "Create"} ${special ? "Special Wall" : "Paint Group"}`} onClose={onClose} footer={<>
    <button type="button" onClick={onClose}>Cancel</button>
    {stage === 1 && <button type="button" onClick={() => setStage(0)}>Back</button>}
    <button type="button" className="special-wall-primary" disabled={!selectionCount || total <= 0 || (stage === 1 && !specValid)} onClick={() => stage === 0 ? setStage(1) : save()}>{stage === 0 ? "Continue" : special ? "Save Special Wall" : "Save Paint Group"}</button>
  </>}>
    {error && <p className="pg-error" role="alert">{error}</p>}
    {stage === 0 ? <>
      {special ? <label>Select Room<select value={draft.room_id} onChange={(event) => setDraft((current) => ({ ...current, room_id: Number(event.target.value), surface_ids: [] }))}>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        : <label>1. Select Surface<select value={draft.surface} onChange={(event) => setDraft((current) => ({ ...current, surface: event.target.value, room_ids: [] }))}>{surfaceOptions(measurement).map((type) => <option key={type} value={type}>{surfaceLabel(type)}</option>)}</select></label>}
      <h3>{special ? "Select Individual Measured Walls" : "2. Select Multiple Rooms"}</h3>
      {!special && <div className="pg-select-all"><button type="button" disabled={!availableRoomIds.length} onClick={toggleAllRooms}>{allRoomsSelected ? "Clear selection" : "Select all"}</button><span>{availableRoomIds.length} available rooms</span></div>}
      <div className="pg-room-list">{special ? walls.map((wall) => {
        const assigned = state.specials.find((entry) => entry.id !== draft.id && entry.surface_ids.includes(wall.id));
        return <label key={wall.id} className={`pg-room-option ${assigned ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.surface_ids.includes(wall.id)} disabled={Boolean(assigned) || Number(wall.net_area) <= 0} onChange={() => toggle("surface_ids", wall.id)} /><span>{wall.name}{assigned && <small>Assigned - {assigned.name}</small>}</span><b>{number(wall.net_area)} sqft</b></label>;
      }) : measurement.rooms.map((room) => {
        const contribution = roomContribution(measurement, state.specials, room.id, draft.surface);
        const assigned = assignedGroup(state.groups, room.id, draft.surface, draft.id);
        const disabled = Boolean(assigned) || contribution.quantity <= 0;
        return <label key={room.id} className={`pg-room-option ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.room_ids.includes(room.id)} disabled={disabled} onChange={() => toggle("room_ids", room.id)} /><span>{room.name}{assigned && <small>Assigned - {labelFor(masters.paintTypes, assigned.spec.paint_type)}</small>}{!assigned && contribution.quantity !== contribution.original_area && <small>Normal walls; original {number(contribution.original_area)} sqft</small>}</span><b>{number(contribution.quantity)} sqft</b></label>;
      })}</div>
    </> : <>
      <label>{special ? "Wall / Surface Name" : "Group Name"}<input value={draft.name} placeholder={special ? "Texture Wall" : "Example: Bedrooms Walls"} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <h3>3. Assign Product and Coats</h3>
      <SpecificationFields spec={draft.spec} onChange={(spec) => setDraft((current) => ({ ...current, spec }))} />
      <label>Rate per sqft<input aria-label="Assignment rate" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
      <div className="pg-selection-summary"><strong>Amount: {money(Number.isFinite(Number(rate)) && Number(rate) >= 0 ? total * Number(rate) : 0)}</strong></div>
    </>}
    <div className="pg-selection-summary" aria-live="polite" aria-atomic="true"><b>Selected: {selectionCount} {special ? "Walls" : "Rooms"}</b><strong>Total Area: {number(total)} sqft</strong></div>
  </Dialog>;
}

function GeneralServiceDialog({ editor, state, onClose, onSave }) {
  const [draft, setDraft] = useState(() => editor.value || { id: nextId("service"), room_id: "", quantity: 1, unit: 2, spec: { service_category: 5, description: "", coats: 1 } });
  const [error, setError] = useState("");
  const [rate, setRate] = useState(state.rates[editor.value?.id] ?? "");
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => { try { if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate."); const next = saveGeneralService(state, draft, measurement, masters); onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } }); } catch (failure) { setError(failure.message); } };
  return <Dialog title={editor.value ? "Edit General Service" : "Add General Service"} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="special-wall-primary" onClick={submit}>Save General Service</button></>}>
    {error && <p className="pg-error" role="alert">{error}</p>}
    <label>Type of service<select value={draft.spec.service_category} onChange={(event) => update("spec", { ...draft.spec, service_category: Number(event.target.value), paint_type: "" })}>{masters.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Room / Area<select value={draft.room_id || ""} onChange={(event) => update("room_id", event.target.value ? Number(event.target.value) : "")}><option value="">General / Whole property</option>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Brand<select value={draft.spec.paint_brand || ""} onChange={(event) => update("spec", { ...draft.spec, paint_brand: event.target.value ? Number(event.target.value) : "" })}><option value="">Select brand - optional</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Product<select value={draft.spec.paint_type || ""} onChange={(event) => update("spec", { ...draft.spec, paint_type: event.target.value ? Number(event.target.value) : "" })}><option value="">Select product - optional</option>{masters.paintTypes.filter((entry) => Number(entry.service_category) === Number(draft.spec.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Description<textarea value={draft.spec.description} rows={3} onChange={(event) => update("spec", { ...draft.spec, description: event.target.value })} placeholder="Describe the work to be done" /></label>
    <label>Quantity<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} /></label>
    <label>Unit<select value={draft.unit} onChange={(event) => update("unit", Number(event.target.value))}>{masters.units.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Rate per unit<input aria-label="Assignment rate" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
    <div className="pg-selection-summary"><strong>Amount: {money(Number(draft.quantity || 0) * (Number.isFinite(Number(rate)) && Number(rate) >= 0 ? Number(rate) : 0))}</strong></div>
  </Dialog>;
}

function AssignmentCard({ line, onEdit, onDelete, onContributions }) {
  return <article className="pg-assignment-card">
    <div className="pg-assignment-row">
      <div className="pg-assignment-scope"><h3>{line.name}</h3><p>{line.scope}</p></div>
      <div><span className="pg-row-label">Type of service</span><span>{labelFor(masters.categories, line.spec.service_category)}</span></div>
      <div><span className="pg-row-label">Surface</span><span className="pg-tag">{line.surface_label}</span></div>
      <div><span className="pg-row-label">Brand</span><span>{labelFor(masters.brands, line.spec.paint_brand)}</span></div>
      <div><span className="pg-row-label">Product</span><strong>{labelFor(masters.paintTypes, line.spec.paint_type)}</strong></div>
      <div><span className="pg-row-label">Area</span><b className="pg-assignment-area">{number(line.quantity)} {labelFor(masters.units, line.unit || 1)}</b></div>
      <div><span className="pg-row-label">Coats</span><span>{line.kind === "service" ? "Not applicable" : `Primer ${line.spec.primer_coats} + Paint ${line.spec.coats}`}</span></div>
      <div className="pg-actions pg-assignment-actions"><button onClick={onEdit}><Pencil size={16} />Edit</button><button onClick={onDelete}><Trash2 size={16} />Delete</button></div>
    </div>
    {line.contributions.length > 0 && <button type="button" className="pg-contribution-trigger" aria-haspopup="dialog" onClick={onContributions}>Room contribution details</button>}

  </article>;
}

export default function QuotationGroupingTest() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState(emptyState);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  const [recordsRoom, setRecordsRoom] = useState(null);
  const [finalDetailId, setFinalDetailId] = useState(null);
  const [contributionId, setContributionId] = useState(null);
  const lines = specificationLines(measurement, state);
  const pricing = pricedLines(measurement, state);
  const finalDetail = pricing.find((line) => line.id === finalDetailId);
  const contributionLine = lines.find((line) => line.id === contributionId);
  const assignedRooms = new Set([...state.groups.flatMap((group) => group.room_ids), ...state.specials.map((special) => special.room_id)]).size;
  const ready = pricing.length > 0 && pricing.every((line) => line.rate_valid);
  const subtotal = pricing.reduce((sum, line) => sum + line.amount, 0);
  const reset = () => { setState(emptyState()); setStep(1); setEditor(null); setNotice("Preview reset. Sample measurements remain unchanged."); };
  const load = () => { setState(exampleAssignments()); setStep(2); setNotice("Loaded the attachment's sample groups and Wall 4 texture assignment."); };
  const go = (target) => { setNotice(""); if (target >= 3 && !pricing.length) { setNotice("Create at least one assignment first."); return; } if (target === 3 && !ready) { setNotice("Enter a valid rate for each line first."); return; } setStep(target); };
  const payload = ready ? { measurement_record: measurement.id, items: toQuotationItems(measurement, state, masters), test_trace: lines.map(({ id, name, quantity, contributions }) => ({ id, name, quantity, contributions })) } : null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "paint-grouping-test-payload.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <main className="pg-test">
    <div className="pg-test-banner"><b>ISOLATED TEST MODULE</b><span>Sample data only. No API calls, saved quotations, or changes to the current application.</span></div>
    <header className="pg-page-header"><div><span className="pg-eyebrow">BHARATH APPS / QUOTATION SANDBOX</span><h1>Grouped paint assignment</h1><p>Review the proposed workflow before integrating it.</p></div><div className="pg-actions"><button onClick={load}>Load example</button><button onClick={reset}>Reset test</button></div></header>
    <nav className="pg-steps" aria-label="Test workflow">{["Measurements", "Services & Product", "Final Quotation"].map((name, index) => <button key={name} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "active" : ""} onClick={() => go(index + 1)}><b>{index + 1}</b><span>{name}</span></button>)}</nav>
    <p className="pg-notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
    {step === 1 && <section className="pg-panel">
      <div className="pg-heading"><h2>Existing measurements</h2><span className="pg-tag">Version {measurement.version}</span></div>
      <p>Review each room's measured areas. Open the original records to see individual walls.</p>
      <div className="pg-measurements">
        <div className="pg-measurement-columns" aria-hidden="true">{["Room / Area", "All Walls", "Ceiling", "Other Surfaces", "Measurement Records"].map((label) => <span key={label}>{label}</span>)}</div>
        {measurement.rooms.map((room) => {
          const surfaces = measurement.surfaces.filter((entry) => entry.room === room.id);
          const otherTypes = [...new Set(surfaces.filter((entry) => !["WALL", "CEILING"].includes(entry.surface_type)).map((entry) => entry.surface_type))];
          return <article key={room.id} className="pg-measurement-row">
            <h3>{room.name}</h3>
            <div><span className="pg-measurement-label">All Walls</span><b>{number(roomContribution(measurement, [], room.id, "WALL").quantity)} <small>sqft</small></b></div>
            <div><span className="pg-measurement-label">Ceiling</span><b>{number(roomContribution(measurement, [], room.id, "CEILING").quantity)} <small>sqft</small></b></div>
            <div><span className="pg-measurement-label">Other Surfaces</span>{otherTypes.length ? otherTypes.map((type) => <span className="pg-measurement-other" key={type}>{surfaceLabel(type)} <b>{number(roomContribution(measurement, [], room.id, type).quantity)} sqft</b></span>) : <span className="pg-measurement-none">None</span>}</div>
            <button type="button" className="pg-records-trigger" onClick={() => setRecordsRoom(room)} aria-haspopup="dialog" aria-label={`View original measurement records for ${room.name}`} title="Original measurement records"><Eye size={18} aria-hidden="true" /></button>
          </article>;
        })}
      </div>
    </section>}
    {step === 2 && <section className="pg-panel"><div className="pg-heading"><div><h2>Services & Product Assignment</h2><p>Choose surfaces, select rooms, then assign services, products and rates.</p></div><div className="pg-actions"><button className="primary" onClick={() => setEditor({ kind: "group" })}><Plus size={18} />Create Paint Group</button><button onClick={() => setEditor({ kind: "service" })}><Plus size={18} />Add General Service</button><button onClick={() => setEditor({ kind: "special" })}><Plus size={18} />Add Special Wall</button></div></div><dl className="pg-assignment-summary"><div><dt>Paint groups</dt><dd>{state.groups.length}</dd></div><div><dt>Special walls</dt><dd>{state.specials.length}</dd></div><div><dt>Assigned rooms</dt><dd>{assignedRooms} <small>of {measurement.rooms.length}</small></dd></div><div><dt>Assigned area</dt><dd>{number(lines.filter((line) => line.kind !== "service").reduce((sum, line) => sum + line.quantity, 0))} <small>sqft</small></dd></div></dl>{!lines.length ? <div className="pg-empty"><h3>No paint groups yet</h3><p>Create a group or load the example to test the complete flow.</p></div> : <div className="pg-assignment-list"><div className="pg-assignment-columns" aria-hidden="true">{["Group / Rooms", "Type of service", "Surface", "Brand", "Product", "Area", "Coats", "Actions"].map((label) => <span key={label}>{label}</span>)}</div>{lines.map((line) => <AssignmentCard key={line.id} line={line} onContributions={() => setContributionId(line.id)} onEdit={() => setEditor({ kind: line.kind, value: (state[line.kind === "special" ? "specials" : line.kind === "service" ? "services" : "groups"] || []).find((entry) => entry.id === line.id) })} onDelete={() => setState((current) => deleteAssignment(current, line.id, line.kind))} />)}</div>}</section>}
    {step === 2 && pricing.length > 0 && <div className="pg-subtotal"><span>Subtotal {ready ? "" : "- add missing rates using Edit"}</span><strong>{money(subtotal)}</strong></div>}
    {step === 3 && <section className="pg-panel"><div className="pg-heading"><div><h2>Final quotation test preview</h2><p>Read-only test output. The live PDF generator and commercial calculations are not invoked.</p></div><button onClick={download}>Download sample JSON</button></div><div className="pg-final-lines"><div className="pg-final-columns" aria-hidden="true">{["Group / Service", "Rooms", "Product", "Description", "Quantity", "Rate", "Amount", ""].map((label) => <span key={label}>{label}</span>)}</div>{pricing.map((line) => <article key={line.id} className="pg-final-row"><h3 className="pg-final-name">{line.name}</h3><p className="pg-final-scope">{line.scope}</p><b className="pg-final-product">{line.kind === "service" && !line.spec.paint_type ? line.spec.description : labelFor(masters.paintTypes, line.spec.paint_type)}</b><span className="pg-final-description">{line.spec.description || line.name}</span><span className="pg-final-quantity">{number(line.quantity)} <small>{labelFor(masters.units, line.unit || 1)}</small></span><span className="pg-final-rate">{money(Number(line.rate))}<small>/{labelFor(masters.units, line.unit || 1)}</small></span><strong className="pg-final-amount">{money(line.amount)}</strong><div className="pg-final-actions"><button className="pg-final-details" type="button" onClick={() => setFinalDetailId(line.id)} aria-haspopup="dialog" aria-label={`View details for ${line.name}`} title="View details"><Eye size={18} aria-hidden="true" /></button><button className="pg-final-details" type="button" aria-label={`Edit ${line.name}`} title="Edit" aria-haspopup="dialog" onClick={() => setEditor({ kind: line.kind, value: (state[line.kind === "special" ? "specials" : line.kind === "service" ? "services" : "groups"] || []).find((entry) => entry.id === line.id) })}><Pencil size={18} aria-hidden="true" /></button></div></article>)}</div><div className="pg-subtotal"><span>Sample subtotal</span><strong>{money(subtotal)}</strong></div><p className="pg-footnote">GST, discounts, additional charges, payment, customer information, quotation numbering and PDF generation remain in the existing application.</p><button onClick={() => setShowPayload((current) => !current)}>{showPayload ? "Hide" : "Inspect"} sample payload and measurement references</button>{showPayload && <pre className="pg-payload">{JSON.stringify(payload, null, 2)}</pre>}</section>}
    <footer className="pg-workflow-footer"><span>Measurement record {measurement.id} / Version {measurement.version}</span><div className="pg-actions">{step > 1 && <button onClick={() => go(step - 1)}>Back</button>}{step < 3 && <button className="primary" disabled={step === 2 && !ready} onClick={() => go(step + 1)}>Continue<ArrowRight size={17} /></button>}</div></footer>
    {finalDetail && <Dialog title={finalDetail.name} onClose={() => setFinalDetailId(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setFinalDetailId(null)}>Close</button>}>
      <dl className="pg-final-detail-list"><div><dt>Room / Area</dt><dd>{finalDetail.scope}</dd></div><div><dt>Type of service</dt><dd>{labelFor(masters.categories, finalDetail.spec.service_category)}</dd></div><div><dt>Product</dt><dd>{finalDetail.spec.paint_type ? labelFor(masters.paintTypes, finalDetail.spec.paint_type) : "Not selected"}</dd></div><div><dt>Brand</dt><dd>{finalDetail.spec.paint_brand ? labelFor(masters.brands, finalDetail.spec.paint_brand) : "Not selected"}</dd></div><div><dt>Description / treatment</dt><dd>{finalDetail.spec.description || finalDetail.name}</dd></div><div><dt>Quantity</dt><dd>{number(finalDetail.quantity)} {labelFor(masters.units, finalDetail.unit || 1)}</dd></div>{finalDetail.kind !== "service" && <div><dt>Coats</dt><dd>Primer {finalDetail.spec.primer_coats} + Paint {finalDetail.spec.coats}</dd></div>}<div><dt>Rate</dt><dd>{money(Number(finalDetail.rate))}/{labelFor(masters.units, finalDetail.unit || 1)}</dd></div></dl><div className="pg-selection-summary"><strong>Amount: {money(finalDetail.amount)}</strong></div>
    </Dialog>}
    {recordsRoom && <Dialog title={`Original measurement records - ${recordsRoom.name}`} onClose={() => setRecordsRoom(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setRecordsRoom(null)}>Close</button>}>
      <p className="pg-records-note">Saved measured areas for {recordsRoom.name}.</p>
      <table className="pg-records-table"><caption className="pg-sr-only">Original surface areas for {recordsRoom.name}</caption><thead><tr><th scope="col">Surface</th><th scope="col">Measured area</th></tr></thead><tbody>{measurement.surfaces.filter((surface) => surface.room === recordsRoom.id).map((surface) => <tr key={surface.id}><th scope="row">{surface.name}</th><td>{number(surface.net_area)} sqft</td></tr>)}</tbody></table>
      <div className="pg-selection-summary"><div className="pg-contribution"><span>All Walls</span><b>{number(roomContribution(measurement, [], recordsRoom.id, "WALL").quantity)} sqft</b></div><div className="pg-contribution"><span>Ceiling</span><b>{number(roomContribution(measurement, [], recordsRoom.id, "CEILING").quantity)} sqft</b></div></div>
    </Dialog>}
    {contributionLine && <Dialog title={`Room contribution details - ${contributionLine.name}`} onClose={() => setContributionId(null)} footer={<button type="button" className="special-wall-primary" onClick={() => setContributionId(null)}>Close</button>}><table className="pg-records-table"><thead><tr><th scope="col">Room / Area</th><th scope="col">Assigned area</th></tr></thead><tbody>{contributionLine.contributions.map((entry) => <tr key={entry.room_id}><th scope="row">{entry.room_name}</th><td>{number(entry.quantity)} sqft</td></tr>)}</tbody></table><div className="pg-selection-summary"><b>Total: {number(contributionLine.quantity)} sqft</b></div></Dialog>}
    {editor?.kind === "service" && <GeneralServiceDialog editor={editor} state={state} onClose={() => setEditor(null)} onSave={(next) => { setState(next); setEditor(null); setNotice("General service and rate saved."); }} />}
    {editor && editor.kind !== "service" && <AssignmentDialog editor={editor} state={state} onClose={() => setEditor(null)} onSave={(next) => { setState(next); setEditor(null); setNotice("Assignment saved. Group contributions recalculated from the unchanged measurement fixture."); }} />}
  </main>;
}
