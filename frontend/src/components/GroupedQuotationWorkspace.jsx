import GroupedMasterChoice from "./GroupedMasterChoice.jsx";
import PaintingItemDialog from "./PaintingItemDialog.jsx";
import AssignmentLineItems from './AssignmentLineItems.jsx';
import QuotationAssignmentActions from './QuotationAssignmentActions.jsx';
import useMobileView from '../hooks/useMobileView.js';
import { SERVICE_MASTER_LABELS } from "../utils/serviceMasterLabels.js";
import { lockBodyScroll } from "../utils/bodyScrollLock.js";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Plus, Pencil, X, Eye } from "lucide-react";
import { assignedGroup, groupContribution, groupSurfaces, deleteAssignment, measuredSurfaces, pricedLines, roomContribution, saveGroup, saveSpecial, specificationLines, surfaceLabel, surfaceKey, surfaceOptions, validateSpec, saveGeneralService, replacesStandard } from "../utils/groupedQuotation.js";
import "./special-wall-sheet.css";
import "./grouped-quotation.css";
import { quotationMeasurementTables, measuredTotal, measurementBucket, hasMeasurement } from "../utils/quotationMeasurementTables.js";
const AssignmentContext = createContext(null);
const number = (value) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const labelFor = (entries, id, custom = "") => entries.find((entry) => String(entry.id) === String(id))?.name || custom || "Not selected";
const nextId = (kind) => `${kind}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

function Dialog({ title, onClose, children, footer, className = "", dismissOnBackdrop = true }) {
  const { measurement } = useContext(AssignmentContext);
  const element = useRef(null);
  const titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = element.current;
    const before = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    dialog.showModal();
    element.current.querySelector("select, input, button")?.focus();
    const handle = (event) => {
      if (event.key !== "Tab") return;
      const controls = [...element.current.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")].filter(control => control.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { dialog.close(); releaseScrollLock(); document.removeEventListener("keydown", handle); if (before?.isConnected) before.focus(); };
  }, []);
  return <div className="special-wall-backdrop gq-dialog-backdrop" onClick={(event) => { if (dismissOnBackdrop && event.target === event.currentTarget) onClose(); }}>
    <dialog ref={element} onClick={event => {
      if (!dismissOnBackdrop || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }} onCancel={event => { event.preventDefault(); onClose(); }} className={`special-wall-sheet gq-dialog ${className}`} aria-labelledby={titleId} data-popup-protection={!dismissOnBackdrop ? "handled" : undefined}>
      <header className="special-wall-header"><div className="special-wall-handle" /><div className="gq-heading"><h2 className="bp-ui-section-heading" id={titleId}>{title}</h2><button type="button" className="gq-icon bp-ui-icon-action" onClick={onClose} aria-label="Close popup"><X size={20} /></button></div><p>Measurement version {measurement.version}</p></header>
      <div className="special-wall-body gq-dialog-body">{children}</div>
      <footer className="special-wall-footer">{footer}</footer>
    </dialog>
  </div>;
}


function SpecificationFields({ spec, onChange, showService = false }) {
  const { masters } = useContext(AssignmentContext);
  const update = (key, value) => onChange({ ...spec, [key]: value });
  return <div className="gq-spec-fields">
    <GroupedMasterChoice label={SERVICE_MASTER_LABELS.category} options={masters.categories.filter(entry => !entry.general)} value={spec.service_category} customValue={spec.custom_service_category} onChange={(id, name) => onChange({...spec, service_category:id ? Number(id) : "", custom_service_category:name, save_service_category_to_master:false, paint_type:"", custom_product_type:"", service_type:""})} save={spec.save_service_category_to_master} onSave={value => update("save_service_category_to_master", value)} />
    <GroupedMasterChoice label="Brand" options={masters.brands} value={spec.paint_brand} customValue={spec.custom_brand} onChange={(id, name) => onChange({...spec, paint_brand:id ? Number(id) : "", custom_brand:name, save_brand_to_master:false})} save={spec.save_brand_to_master} onSave={value => update("save_brand_to_master", value)} />
    {showService && masters.services?.length > 0 && <label>Service<select className="bp-ui-control" aria-label="Service" value={spec.service_type || ""} onChange={event=>update("service_type",event.target.value)}><option value="">No additional service specification</option>{masters.services.filter(entry=>!entry.category_master || String(entry.category_master)===String(spec.service_category)).map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
    <GroupedMasterChoice label="Product" options={masters.paintTypes.filter(entry => !entry.service_category || String(entry.service_category) === String(spec.service_category))} value={spec.paint_type} customValue={spec.custom_product_type} onChange={(id, name) => onChange({...spec, paint_type:id ? Number(id) : "", custom_product_type:name, save_product_type_to_master:false})} save={spec.save_product_type_to_master} onSave={value => update("save_product_type_to_master", value)} />

    <label>Primer Coats<select className="bp-ui-control" aria-label="Primer Coats" value={spec.primer_coats} onChange={(event) => update("primer_coats", Number(event.target.value))}>{[0,1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Paint Coats<select className="bp-ui-control" aria-label="Paint Coats" value={spec.coats} onChange={(event) => update("coats", Number(event.target.value))}>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>{SERVICE_MASTER_LABELS.description}<input className="bp-ui-control" placeholder="Enter work description" aria-label={SERVICE_MASTER_LABELS.description} maxLength={255} list={`gq-description-${spec.service_category}`} value={spec.description || ""} onChange={(event) => update("description", event.target.value)} /><datalist id={`gq-description-${spec.service_category}`}>{(masters.descriptions || []).filter((entry) => !entry.service_category || String(entry.service_category) === String(spec.service_category)).map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label>
    {String(spec.description || "").trim() && <label className="gq-save-description"><input type="checkbox" checked={Boolean(spec.promote_to_master)} onChange={(event) => update("promote_to_master", event.target.checked)} />Save this Description for future quotations</label>}
  </div>;
}

function AssignmentDialog({ editor, state, onSave, onClose, recovery, onRecovery }) {
  const { measurement, masters, defaultSpec, initialRoomIds } = useContext(AssignmentContext);
  const special = editor.kind === "special";
  const availableSurfaces = surfaceOptions(measurement);
  const initialSurface = editor.initialSurface && availableSurfaces.includes(editor.initialSurface) ? editor.initialSurface : "";
  const [stage, setStage] = useState(editor.value && special ? 1 : recovery?.stage || 0);
  const [error, setError] = useState("");
  const [initialRate] = useState(state.rates[editor.value?.id] ?? "");
  const [rate, setRate] = useState(recovery?.rate ?? initialRate);
  const [initialDraft] = useState(() => editor.value ? { ...editor.value, spec: { ...editor.value.spec } } : special
    ? { id: recovery?.draft?.id || nextId("special"), name: "Texture Wall", room_id: editor.initialRoomId ?? measurement.rooms[0]?.id ?? "", surface_ids: [], spec: { ...defaultSpec, service_category: masters.categories.find((entry) => /texture/i.test(entry.name))?.id || defaultSpec.service_category, paint_type: "" } }
    : { id: recovery?.draft?.id || nextId("group"), name: "", surface: initialSurface, surfaces: initialSurface ? [initialSurface] : [], room_ids: initialRoomIds.filter((id) => !assignedGroup(state.groups, id, initialSurface) && roomContribution(measurement, state.specials, id, initialSurface).quantity > 0), spec: { ...defaultSpec } });
  const [draft, setDraft] = useState(() => recovery?.draft ?? initialDraft);
  const requestClose = () => {
    const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || rate !== initialRate;
    if (dirty && !window.confirm("Discard unsaved changes in this form? Choose Cancel to keep editing.")) return;
    onClose();
  };
  useEffect(() => { onRecovery?.({ editor, draft, rate, stage }); }, [onRecovery, editor, draft, rate, stage]);
  const contributions = special ? [] : draft.room_ids.map((roomId) => groupContribution(measurement, state.specials, roomId, groupSurfaces(draft)));
  const walls = special ? measuredSurfaces(measurement, draft.room_id, "WALL") : [];
  const total = special ? walls.filter((wall) => draft.surface_ids.includes(wall.id)).reduce((sum, wall) => sum + Number(wall.net_area), 0) : contributions.reduce((sum, entry) => sum + entry.quantity, 0);
  const selectionCount = special ? draft.surface_ids.length : draft.room_ids.length;
  const availableRoomIds = special ? [] : measurement.rooms
    .filter((room) => !assignedGroup(state.groups, room.id, groupSurfaces(draft), draft.id) && groupContribution(measurement, state.specials, room.id, groupSurfaces(draft)).quantity > 0)
    .map((room) => room.id);
  const allRoomsSelected = availableRoomIds.length > 0 && availableRoomIds.every((id) => draft.room_ids.includes(id));
  const surfaceBalances = special ? [] : availableSurfaces.map((surface) => {
    const remainingRooms = measurement.rooms.filter((room) =>
      !assignedGroup(state.groups, room.id, surface, draft.id)
      && !(groupSurfaces(draft).includes(surface) && draft.room_ids.includes(room.id))
      && roomContribution(measurement, state.specials, room.id, surface).quantity > 0);
    const availableRooms = measurement.rooms.filter(room => !assignedGroup(state.groups, room.id, surface, draft.id) && roomContribution(measurement, state.specials, room.id, surface).quantity > 0);
    return {
      surface, rooms: remainingRooms,
      available: availableRooms.reduce((sum, room) => sum + roomContribution(measurement, state.specials, room.id, surface).quantity, 0),
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
      const fallback = special ? "Special Wall" : contributions.length > 1 ? `${contributions.length} Rooms - ${groupSurfaces(draft).map(surfaceLabel).join(" + ")}` : `${contributions[0]?.room_name || "Room"} - ${groupSurfaces(draft).map(surfaceLabel).join(" + ")}`;
      const named = { ...draft, name: draft.name.trim() || fallback.slice(0, 120) };
      if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate.");
      const next = special ? saveSpecial(state, named, measurement, masters) : saveGroup(state, named, measurement, masters);
      onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } });
    } catch (failure) { setError(failure.message); }
  };
  return <Dialog title={`${editor.value ? "Edit" : "Create"} ${special ? "Special Wall" : "Paint Areas"}`} onClose={requestClose} dismissOnBackdrop={false} footer={<>
    <button className="bp-ui-action" type="button" onClick={requestClose}>Cancel</button>
    {stage === 1 && !special && <button className="bp-ui-action" type="button" onClick={() => setStage(0)}>Back</button>}
    <button type="button" className="special-wall-primary bp-ui-action" disabled={!selectionCount || total <= 0 || (stage === 1 && !specValid)} onClick={() => stage === 0 ? setStage(1) : save()}>{stage === 0 ? "Continue" : special ? "Save Special Wall" : "Save Paint Areas"}</button>
  </>}>
    {error && <p className="gq-error" role="alert">{error}</p>}
    {stage === 0 ? <>
      {special ? <label>Select Room<select className="bp-ui-control" value={draft.room_id} onChange={(event) => setDraft((current) => ({ ...current, room_id: Number(event.target.value), surface_ids: [] }))}>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        : null}
      {!special && <fieldset className="gq-surface-picker"><legend>1. Select surfaces</legend><div>{surfaceBalances.map(balance => <label key={balance.surface} className="gq-surface-pick"><input type="checkbox" aria-label={`Select ${surfaceLabel(balance.surface)}`} checked={groupSurfaces(draft).includes(balance.surface)} disabled={balance.available <= 0 && !groupSurfaces(draft).includes(balance.surface)} onChange={event => setDraft(current => { const surfaces = event.target.checked ? [...groupSurfaces(current), balance.surface] : groupSurfaces(current).filter(surface => surface !== balance.surface); return {...current, surfaces, surface: surfaces[0] || "", room_ids: []}; })} /><span>{surfaceLabel(balance.surface)}</span></label>)}</div></fieldset>}
      {special && <div>
        <label className="gq-allocation-option"><input type="checkbox" checked={replacesStandard(draft)} onChange={event => setDraft(current => ({...current,exclude_from_standard:event.target.checked,surface_ids:[]}))} />Exclude selected walls from standard painting</label>

      </div>}
      <h3>{special ? "Select Individual Measured Walls" : "2. Select Multiple Rooms"}</h3>
      {!special && <div className="gq-select-all"><button className="bp-ui-action" type="button" disabled={!availableRoomIds.length} onClick={toggleAllRooms}>{allRoomsSelected ? "Clear selection" : "Select all"}</button><span>{availableRoomIds.length} available rooms</span></div>}
      <div className="gq-room-list">{special ? walls.map((wall) => {
        const assigned = replacesStandard(draft) && state.specials.find((entry) => replacesStandard(entry) && entry.id !== draft.id && entry.surface_ids.includes(wall.id));
        return <label key={wall.id} className={`gq-room-option ${assigned ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.surface_ids.includes(wall.id)} disabled={Boolean(assigned) || Number(wall.net_area) <= 0} onChange={() => toggle("surface_ids", wall.id)} /><span>{wall.name}{assigned && <small>Assigned - {assigned.name}</small>}</span><b>{number(wall.net_area)} sqft</b></label>;
      }) : measurement.rooms.map((room) => {
        const contribution = groupContribution(measurement, state.specials, room.id, groupSurfaces(draft));
        const assigned = assignedGroup(state.groups, room.id, groupSurfaces(draft), draft.id);
        const disabled = Boolean(assigned) || contribution.quantity <= 0;
        return <label key={room.id} className={`gq-room-option ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={draft.room_ids.includes(room.id)} disabled={disabled} onChange={() => toggle("room_ids", room.id)} /><span>{room.name}{assigned && <small>Assigned - {labelFor(masters.paintTypes, assigned.spec.paint_type, assigned.spec.custom_product_type)}</small>}{!assigned && contribution.quantity !== contribution.original_area && <small>Normal walls; original {number(contribution.original_area)} sqft</small>}</span><b>{number(contribution.quantity)} sqft</b></label>;
      })}</div>
      {!special && <section className="gq-room-balances" aria-label="Remaining selection balance"><h3>Remaining selection balance</h3><p>Balance for the selected surfaces, by room.</p><div>{measurement.rooms.map(room => {
        const available = assignedGroup(state.groups, room.id, groupSurfaces(draft), draft.id) ? 0 : groupContribution(measurement, state.specials, room.id, groupSurfaces(draft)).quantity;
        const selected = draft.room_ids.includes(room.id) ? available : 0;
        return <div key={room.id} className="gq-room-balance"><strong>{room.name}</strong><span>Selected: {number(selected)} sqft</span><span>Remaining: {number(available - selected)} sqft</span></div>;
      })}</div></section>}
    </> : <>
      <label>{special ? "Wall / Surface Name" : "Area Name"}<input className="bp-ui-control" maxLength={120} value={draft.name} placeholder={special ? "Texture Wall" : "Example: Bedrooms Walls"} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <h3>3. Assign Product and Coats</h3>
      <SpecificationFields spec={draft.spec} showService={special} onChange={(spec) => setDraft((current) => ({ ...current, spec }))} />
      {special && <label>Quantity (saved measurement)<input className="bp-ui-control" type="number" readOnly value={total} /><small>Area comes from the selected measured walls and stays linked to this measurement version.</small></label>}
      <label>Unit<select className="bp-ui-control" value={draft.unit || ""} onChange={event=>setDraft(current=>({...current,unit:Number(event.target.value)}))}><option value="">{draft.custom_unit || "Default square feet unit"}</option>{masters.units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label>Rate per sqft<input className="bp-ui-control" placeholder="Enter rate in ₹" aria-label="Assignment rate" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
      <div className="gq-selection-summary"><strong>Amount: {money(Number.isFinite(Number(rate)) && Number(rate) >= 0 ? total * Number(rate) : 0)}</strong></div>
    </>}
    <div className="gq-selection-summary" aria-live="polite" aria-atomic="true"><b>Selected: {selectionCount} {special ? "Walls" : "Rooms"}</b><strong>Total Area: {number(total)} sqft</strong></div>
  </Dialog>;
}

function GeneralServiceDialog({ editor, state, onClose, onSave, recovery, onRecovery }) {
  const { measurement, masters, defaultSpec } = useContext(AssignmentContext);
  const [initialDraft] = useState(() => editor.value || { id: recovery?.draft?.id || nextId("service"), room_id: "", quantity: 1, unit: masters.units.find((entry) => /job|lump/i.test(entry.name))?.id || masters.units[0]?.id || "", spec: { service_category: defaultSpec.service_category, description: "", coats: 1 } });
  const [draft, setDraft] = useState(() => recovery?.draft ?? initialDraft);
  const [error, setError] = useState("");
  const [initialRate] = useState(state.rates[editor.value?.id] ?? "");
  const [rate, setRate] = useState(recovery?.rate ?? initialRate);
  const fieldPrefix = useId();
  const descriptionMissing = !String(draft.spec.description || "").trim();
  const quantityMissing = draft.quantity === "" || !Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0;
  const rateMissing = rate === "" || !Number.isFinite(Number(rate)) || Number(rate) < 0;
  useEffect(() => setError(""), [draft, rate]);
  const requestClose = () => {
    const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || rate !== initialRate;
    if (dirty && !window.confirm("Discard unsaved changes in this form? Choose Cancel to keep editing.")) return;
    onClose();
  };
  useEffect(() => { onRecovery?.({ editor, draft, rate }); }, [onRecovery, editor, draft, rate]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => { try { if (rate !== "" && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw new Error("Enter a non-negative rate."); const next = saveGeneralService(state, draft, measurement, masters); onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } }); } catch (failure) { setError(failure.message); } };
  return <Dialog className="gq-general-service-dialog" title={editor.value ? "Edit Service" : "Add Services"} onClose={requestClose} dismissOnBackdrop={false} footer={<><button className="bp-ui-action" onClick={requestClose}>Cancel</button><button className="special-wall-primary bp-ui-action" onClick={submit}>Save Service</button></>}>
    {error && <p className="gq-error" role="alert">{error}</p>}
    <div className="gq-general-service-fields">
    <label>{SERVICE_MASTER_LABELS.category}<select className="bp-ui-control" aria-label={SERVICE_MASTER_LABELS.category} value={draft.spec.service_category} onChange={(event) => update("spec", { ...draft.spec, service_category: Number(event.target.value), paint_type: "", service_type: "" })}>{masters.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Room / Area<select className="bp-ui-control" aria-label="Room / Area" value={draft.room_id || ""} onChange={(event) => update("room_id", event.target.value ? Number(event.target.value) : "")}><option value="">General / Whole property</option>{measurement.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Surface Category<select className="bp-ui-control" aria-label="General Service Surface Category" value={draft.surface || ""} onChange={event => update("surface", event.target.value)}><option value="">General / Not surface-specific</option>{[...new Set([...surfaceOptions(measurement), "OTHER"])].map(surface => <option key={surface} value={surface}>{surfaceLabel(surface)}</option>)}</select></label>
    <label>Brand<select className="bp-ui-control" aria-label="Brand" value={draft.spec.paint_brand || ""} onChange={(event) => update("spec", { ...draft.spec, paint_brand: event.target.value ? Number(event.target.value) : "" })}><option value="">Select brand - optional</option>{masters.brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <div className="gq-general-service-three-fields">
    <label>Product<select className="bp-ui-control" aria-label="Product" value={draft.spec.paint_type || ""} onChange={(event) => update("spec", { ...draft.spec, paint_type: event.target.value ? Number(event.target.value) : "" })}><option value="">Select product - optional</option>{masters.paintTypes.filter((entry) => (!entry.service_category || String(entry.service_category) === String(draft.spec.service_category))).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>Unit / MOU<select className="bp-ui-control" aria-label="Unit / MOU" value={draft.unit} onChange={(event) => update("unit", Number(event.target.value))}>{masters.units.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label>No. of coats<select className="bp-ui-control" aria-label="No. of coats" value={draft.spec.coats || 1} onChange={event => update("spec", {...draft.spec,coats:Number(event.target.value)})}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <label className="gq-general-service-description">{SERVICE_MASTER_LABELS.description}<textarea className="bp-ui-control" aria-label="Description" aria-invalid={descriptionMissing || undefined} aria-describedby={descriptionMissing ? `${fieldPrefix}-description` : undefined} maxLength={255} value={draft.spec.description} rows={3} onChange={(event) => update("spec", { ...draft.spec, description: event.target.value })} placeholder="Describe the work to be done" />{descriptionMissing && <small className="gq-field-required" id={`${fieldPrefix}-description`}>Describe the work.</small>}</label>
    <label>Quantity<input className="bp-ui-control" aria-label="Quantity" aria-invalid={quantityMissing || undefined} aria-describedby={quantityMissing ? `${fieldPrefix}-quantity` : undefined} placeholder="Enter quantity" type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} />{quantityMissing && <small className="gq-field-required" id={`${fieldPrefix}-quantity`}>Enter a quantity greater than zero.</small>}</label>
    <label>Rate per unit<input className="bp-ui-control" placeholder="Enter rate in ₹" aria-label="Assignment rate" aria-invalid={rateMissing || undefined} aria-describedby={rateMissing ? `${fieldPrefix}-rate` : undefined} type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} />{rateMissing && <small className="gq-field-required" id={`${fieldPrefix}-rate`}>Enter a rate. Use 0 for no charge.</small>}</label>
    </div>
    <div className="gq-selection-summary"><strong>Amount: {money(Number(draft.quantity || 0) * (Number.isFinite(Number(rate)) && Number(rate) >= 0 ? Number(rate) : 0))}</strong></div>
  </Dialog>;
}

function AssignmentCard({ line, itemNumber, onEdit, onDelete, onView }) {
  const { masters, squareFeetUnit } = useContext(AssignmentContext);
  const category = labelFor(masters.categories, line.spec.service_category, line.spec.custom_service_category);
  const product = labelFor(masters.paintTypes, line.spec.paint_type, line.spec.custom_product_type);
  const validRate = line.rate !== "" && line.rate != null && Number.isFinite(Number(line.rate)) && Number(line.rate) >= 0;
  const total = validRate ? money(line.quantity * Number(line.rate)) : "—";
  return <article className="gq-assignment-card gq-mobile-line-item">
    <button type="button" className="gq-mobile-item-view" aria-label={`View details for ${line.name}`} aria-haspopup="dialog" onClick={onView}><span className="sr-only">View complete item details</span></button>
    <div className="gq-mobile-item-top">
      <div className="gq-mobile-item-heading"><span className="gq-mobile-item-caption">Item {itemNumber} · {category}</span><strong className="gq-mobile-item-total">{total}</strong><QuotationAssignmentActions name={line.name} onView={onView} onEdit={onEdit} onDelete={onDelete} /></div>
      <h3 className="gq-mobile-item-scope">{line.contributions.length > 0 ? line.scope : `${line.surface_label} - ${line.scope}`}</h3>
      <div className="gq-mobile-item-specs"><p className="gq-mobile-item-product">{product !== "Not selected" ? product : line.name}</p><p className="gq-mobile-item-meta">No. of coats: {line.spec.coats || 1}</p></div>
    </div>
    <dl className="gq-mobile-item-metrics"><div><dt>Quantity</dt><dd>{number(line.quantity)} {labelFor(masters.units,line.unit || squareFeetUnit)}</dd></div><div><dt>Rate</dt><dd className={!validRate ? "gq-field-required" : undefined}>{validRate ? money(Number(line.rate)) : "Rate needed"}</dd></div><div><dt>Amount</dt><dd>{total}</dd></div></dl>
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
        <th scope="row"><button type="button" className="gq-room-name bp-ui-action" onClick={() => onView(row)} aria-haspopup="dialog">{row.name}</button></th>
        {types.map((type) => <td key={type}>{row.surfaces.some((surface) => measurementBucket(surface) === type && hasMeasurement(surface)) ? number(measuredTotal(row, type)) : "—"}</td>)}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Final net total</th>{types.map((type) => <td key={type}>{number(rows.reduce((total, row) => total + measuredTotal(row, type), 0))}</td>)}</tr></tfoot>
    </table>
  </section>)}{!tables.length && <p className="gq-measurement-none">No measurements saved yet.</p>}</div>;
}

export default function GroupedQuotationWorkspace({ measurement, masters, state, onChange, phase = "assignments", showPricing = true, showMeasurements = true, extraActions = null, displayMeasurement = null, requestedEditor = null, onEditorRequestHandled = null, editorRecovery = null, onEditorRecovery = null }) {
  const mobile = useMobileView();
  const [editor, setEditor] = useState(editorRecovery?.editor || null);
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
  // Recovered stages can mount before reference measurements finish loading.
  if (!measurement.rooms.length && (state.groups.length || state.specials.length)) return <p role="status">Loading saved paint area measurements...</p>;
  const lines = specificationLines(measurement, state);
  const pricing = pricedLines(measurement, state);
  const detail = pricing.find((line) => line.id === detailId);
  const contribution = lines.find((line) => line.id === contributionId);
  const painting = masters.categories.find((entry) => entry.name.toLowerCase() === "painting") || masters.categories.find((entry) => /paint/i.test(entry.name));
  const hasMeasuredWalls = measurement.surfaces.some((surface) => surface.surface_type === "WALL" && Number(surface.net_area) > 0);
  const squareFeetUnit = masters.units.find((entry) => /^(sq\.?\s*(?:ft|feet)|sqft|square feet|square foot|sft|sq ft)$/i.test(entry.name.trim()))?.id || masters.units[0]?.id;
  const defaultSpec = { service_category: painting?.id || masters.categories[0]?.id || "", paint_brand: "", paint_type: "", primer_coats: 1, coats: 2, description: "" };
  const edit = (line) => setEditor({ kind: line.kind, value: (state[line.kind === "special" ? "specials" : line.kind === "service" ? "services" : "groups"] || []).find((entry) => entry.id === line.id) });
  const removeAssignment = line => {
    if (!window.confirm(`Delete ${line.name}? Its selections will become available again.`)) return;
    onChange(deleteAssignment(state, line.id, line.kind));
    setNotice("Assignment deleted. Remaining areas recalculated.");
  };
  const closeEditor = () => { setEditor(null); onEditorRecovery?.(null); };
  const save = (next) => { onChange(next); closeEditor(); setNotice("Assignment saved. Areas and amounts recalculated."); };
  const roomCount = new Set([...state.groups.flatMap((group) => group.room_ids), ...state.specials.map((special) => special.room_id)]).size;
  const area = lines.filter((line) => line.kind !== "service").reduce((sum, line) => sum + line.quantity, 0);
  return <AssignmentContext.Provider value={{ measurement, masters, defaultSpec, squareFeetUnit, initialRoomIds }}><div className={`gq-workspace gq-workspace-${phase}`}>
    <p role="status" aria-live="polite" className="gq-notice">{notice}</p>
    {(phase === "measurements" || (phase === "assignments" && showMeasurements)) && <section className="gq-panel">
      <MeasurementTables measurement={displayMeasurement || measurement} onView={setRecordRoom} />
    </section>}
    {phase === "assignments" && <>
      <section className="gq-panel"><div className="gq-heading"><h2 className="bp-ui-section-heading">Surface, Materials &amp; Specifications</h2><div className="gq-actions"><button type="button" className="primary bp-ui-action" onClick={() => setEditor({ kind: "group" })}><Plus size={18} />Add Painting Item</button>{hasMeasuredWalls && <button className="bp-ui-action" type="button" onClick={() => setEditor({ kind: "special" })}><Plus size={18} />Add Special Wall</button>}<button className="bp-ui-action" type="button" onClick={() => setEditor({ kind: "service" })}><Plus size={18} />Add Services</button>{extraActions}</div></div>
        <dl className="gq-assignment-summary"><div><dt>Painting items</dt><dd>{state.groups.length}</dd></div>{state.specials.length > 0 && <div><dt>Saved special walls</dt><dd>{state.specials.length}</dd></div>}<div><dt>Assigned rooms</dt><dd>{roomCount} <small>of {measurement.rooms.length}</small></dd></div><div><dt>{state.specials.some(entry => !replacesStandard(entry)) ? "Area across services" : "Assigned area"}</dt><dd>{number(area)} <small>sqft</small></dd></div></dl>
        {!lines.length && <div className="gq-empty"><p>Add a painting item to select measured surfaces, rooms and materials.</p></div>}
        {lines.length > 0 && (mobile ? <div className="gq-assignment-list gq-painting-items" role="region" aria-label="Measured services and products" tabIndex={0}>{lines.map((line,index) => <AssignmentCard key={line.id} itemNumber={index+1} line={{...line,rate:state.rates[line.id] ?? ""}} onView={() => setDetailId(line.id)} onEdit={() => edit(line)} onDelete={() => removeAssignment(line)} />)}</div> : <AssignmentLineItems lines={lines.map(line => ({...line,rate:state.rates[line.id] ?? ""}))} masters={masters} squareFeetUnit={squareFeetUnit} onView={line => setDetailId(line.id)} onEdit={edit} onDelete={removeAssignment} onContributions={line => setContributionId(line.id)} />)}
      </section>
    </>}
    {phase === "final" && showPricing && <div className="gq-panel"><div className="gq-final-lines"><div className="gq-final-columns" aria-hidden="true">{["Area / Service", "Rooms", "Product", SERVICE_MASTER_LABELS.description, "Quantity", "Rate", "Amount", ""].map((label) => <span key={label}>{label}</span>)}</div>{pricing.map((line) => <article key={line.id} className="gq-final-row"><h3 className="gq-final-name">{line.name}</h3><p className="gq-final-scope">{line.contributions.length > 0 ? <button type="button" className="gq-room-surface-trigger bp-ui-action" aria-label={`View rooms for ${line.name}`} aria-haspopup="dialog" onClick={() => setContributionId(line.id)}>{line.scope}</button> : line.scope}</p><b className="gq-final-product">{line.spec.paint_type ? labelFor(masters.paintTypes, line.spec.paint_type, line.spec.custom_product_type) : line.spec.description || "Service"}</b><span className="gq-final-description">{line.spec.description || line.name}</span><span className="gq-final-quantity">{number(line.quantity)} {labelFor(masters.units, line.unit || squareFeetUnit)}</span><span className="gq-final-rate">{line.rate_valid ? money(Number(line.rate)) : "Rate needed"}</span><strong className="gq-final-amount">{money(line.amount)}</strong><div className="gq-final-actions"><button type="button" className="gq-final-details bp-ui-icon-action" aria-label={`View details for ${line.name}`} onClick={() => setDetailId(line.id)}><Eye size={18} /></button><button type="button" className="gq-final-details bp-ui-icon-action" aria-label={`Edit ${line.name}`} onClick={() => edit(line)}><Pencil size={18} /></button></div></article>)}</div>{!pricing.length && <p>No assignments yet. Return to Services &amp; Product to add work.</p>}</div>}
    {recordRoom && <Dialog className="gq-measurement-dialog" title={`Original measurement records - ${recordRoom.name}`} onClose={() => setRecordRoom(null)} footer={<button type="button" className="special-wall-primary bp-ui-action" onClick={() => setRecordRoom(null)}>Close</button>}><div className="gq-room-record-card"><table className="gq-room-record-table" data-mobile-table="keep" aria-label={`Measurements for ${recordRoom.name}`}><thead><tr>{["Surface", "L", "W / H", "Deduction", "Addition", "Total"].map((label) => <th scope="col" key={label} data-no-sort="true" aria-label={label === "L" ? "Length" : label === "W / H" ? "Width or height" : undefined}>{label}{["Deduction", "Addition", "Total"].includes(label) && <small>sqft</small>}</th>)}</tr></thead><tbody>{(recordRoom.surfaces || measurement.surfaces.filter((surface) => String(surface.room) === String(recordRoom.id))).map((surface) => <tr key={surface.id}><th scope="row">{surface.name || surfaceLabel(surfaceKey(surface))}</th><td>{surface.length == null ? "\u2014" : number(surface.length)}</td><td>{surface.breadth == null ? "\u2014" : number(surface.breadth)}</td><td>{number(surface.deduction_area || 0)}</td><td>{number(surface.addition_area || 0)}</td><td>{number(surface.net_area || 0)}</td></tr>)}</tbody></table></div></Dialog>}
    {contribution && <Dialog title={`Room & surface details - ${contribution.name}`} onClose={() => setContributionId(null)} footer={<button type="button" className="special-wall-primary bp-ui-action" onClick={() => setContributionId(null)}>Close</button>}><table className="gq-records-table bp-ui-table"><thead><tr><th scope="col">Room / Area</th><th scope="col">Assigned area</th></tr></thead><tbody>{contribution.contributions.map((entry) => <tr key={entry.room_id}><th scope="row">{entry.room_name}</th><td>{number(entry.quantity)} sqft</td></tr>)}</tbody></table><strong>Total: {number(contribution.quantity)} sqft</strong></Dialog>}
    {detail && <Dialog title={detail.name} onClose={() => setDetailId(null)} footer={<button type="button" className="special-wall-primary bp-ui-action" onClick={() => setDetailId(null)}>Close</button>}><dl className="gq-final-detail-list">{[["Painting Area", detail.work_area === "EXTERIOR" ? "Exterior" : detail.work_area === "INTERIOR" ? "Interior" : "Saved scope"], ["Room / Area", detail.scope], [SERVICE_MASTER_LABELS.category, labelFor(masters.categories, detail.spec.service_category, detail.spec.custom_service_category)], ["Product", labelFor(masters.paintTypes, detail.spec.paint_type, detail.spec.custom_product_type)], ["Brand", labelFor(masters.brands, detail.spec.paint_brand, detail.spec.custom_brand)], [SERVICE_MASTER_LABELS.description, detail.spec.description || detail.name], ["Quantity", `${number(detail.quantity)} ${labelFor(masters.units, detail.unit || squareFeetUnit)}`], ["Coats", detail.spec.coats || 1], ["Rate", detail.rate_valid ? money(Number(detail.rate)) : "Rate needed"], ["Amount", money(detail.amount)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Dialog>}
    {editor?.kind === "service" && masters.units.length > 0 && <GeneralServiceDialog editor={editor} state={state} recovery={editorRecovery} onRecovery={onEditorRecovery} onSave={save} onClose={closeEditor} />}
    {editor?.kind === "group" && masters.units.length > 0 && measurement.rooms.length > 0 && <PaintingItemDialog measurement={measurement} masters={masters} defaultSpec={defaultSpec} Dialog={Dialog} renderSpecs={(spec, onChange) => <SpecificationFields spec={spec} onChange={onChange} />} editor={editor} state={state} recovery={editorRecovery} onRecovery={onEditorRecovery} onSave={save} onClose={closeEditor} />}
    {editor?.kind === "special" && masters.units.length > 0 && measurement.rooms.length > 0 && <AssignmentDialog editor={editor} state={state} recovery={editorRecovery} onRecovery={onEditorRecovery} onSave={save} onClose={closeEditor} />}
  </div></AssignmentContext.Provider>;
}
