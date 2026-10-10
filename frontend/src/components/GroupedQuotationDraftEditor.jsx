import QuotationDiscountControls from "./QuotationDiscountControls.jsx";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import GroupedQuotationWorkspace from "./GroupedQuotationWorkspace";
import BackButton from "./BackButton";
import { Button, FormField, PageHeader, SectionCard } from "./ui";
import { groupedQuotationRoom, pricedLines } from "../utils/groupedQuotation.js";
import { groupedDraftItems, hasAssignment, restoreDraftAssignments } from "../utils/groupedQuotationDraft.js";
import { draftSaveError, draftSavePayload } from "../utils/quotationDraftSave.js";
import useDraftUnsavedChanges from "../hooks/useDraftUnsavedChanges.js";
import { rememberQuotationSubmission } from "../utils/quotationSubmission.js";

const textFields = [
  ["prepared_by", "Prepared by"], ["inspected_by", "Inspected by"],
  ["work_duration", "Work duration"], ["payment_terms", "Payment terms"],
  ["product_details", "Product details"], ["work_procedures", "Work procedures"],
  ["notes", "Notes"], ["terms_conditions", "Terms and conditions"],
];

export default function GroupedQuotationDraftEditor({ quotation, form, setForm, measurement, masters }) {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState(() => restoreDraftAssignments(quotation.items || []));
  const [extraItems, setExtraItems] = useState(() => (quotation.items || []).filter((item) => !hasAssignment(item)));
  const [phase, setPhase] = useState("assignments");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const latestDraft = useRef(quotation);
  const snapshot = JSON.stringify({ form, assignments, extraItems });
  const initial = useRef(snapshot);
  const markSaved = useDraftUnsavedChanges(snapshot !== initial.current);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  async function saveDraft(send = false) {
    if (inFlight.current) return;
    if (send && !window.confirm("Save this Draft and send it to the customer? Sent quotations cannot be edited directly.")) return;
    setError("");
    setNotice("");
    const lines = pricedLines(measurement, assignments);
    if ((!lines.length && !extraItems.length) || lines.some((line) => !line.rate_valid)) {
      setError("Enter a valid rate for every priced line before saving the draft.");
      return;
    }
    setSaving(true);
    inFlight.current = true;
    let saved = false;
    try {
      const draft = latestDraft.current;
      const roomIds = new Set((draft.rooms || []).map((room) => room.property_room).filter(Boolean));
      assignments.groups.forEach((group) => group.room_ids.forEach((id) => roomIds.add(id)));
      [...assignments.specials, ...assignments.services].forEach((entry) => { if (entry.room_id) roomIds.add(entry.room_id); });
      const rooms = [...(draft.rooms || [])];
      for (const roomId of roomIds) {
        if (!rooms.some((room) => String(room.property_room) === String(roomId))) {
          const source = measurement.rooms.find((room) => String(room.id) === String(roomId));
          if (!source) throw new Error("A selected room is missing from the saved Area Calculation.");
          rooms.push(groupedQuotationRoom(source));
        }
      }
      const items = groupedDraftItems(measurement, assignments, masters, draft.items || [], rooms);
      const {data} = await api.patch(`/quotations/${quotation.id}/draft/`, draftSavePayload(draft, form, rooms, [...items, ...extraItems]));
      if (data?.updated_at) latestDraft.current = data;
      saved = true;
      initial.current = snapshot;
      markSaved();
      if (send) {
        const {data:submission} = await api.post(`/quotations/${quotation.id}/submit/`, {});
        rememberQuotationSubmission(quotation.id,submission);
      }
      navigate(`/quotations/${quotation.id}`, { state: { draftSaved: !send } });
    } catch (requestError) {
      if (saved) setNotice("Draft saved. Sending could not be confirmed; refresh the quotation before retrying.");
      setError(saved ? `Sending could not be confirmed. ${draftSaveError(requestError)}` : draftSaveError(requestError));
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <div className="bp-quotation-builder quotation-measurement-page mx-auto min-w-0 max-w-7xl space-y-4 pb-4 sm:space-y-5 sm:pb-8">
    <BackButton fallback={`/quotations/${quotation.id}`} label="Back to quotation" />
    <PageHeader eyebrow="Draft quotation" title={`Edit ${quotation.quotation_number || "quotation"}`} description="Create and edit paint areas using the saved Area Calculation." />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <p className="text-sm text-slate-600">Continue reviews your changes without saving. Save Draft keeps them for later; Save &amp; send issues the reviewed quotation.</p>
    <fieldset disabled={saving} className="min-w-0 space-y-4">
    <GroupedQuotationWorkspace measurement={measurement} masters={masters} state={assignments} onChange={setAssignments} phase={phase} />
    <form id="grouped-quotation-draft-details" onSubmit={(event) => { event.preventDefault(); if (phase === "final") saveDraft(); }} className="space-y-4">
    {extraItems.length > 0 && <SectionCard title="Other saved quotation lines">
      <div className="space-y-3">{extraItems.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
        {["description", "quantity", "rate"].map((field) => <FormField key={field} label={field === "description" ? "Description" : field === "quantity" ? "Quantity" : "Rate"} type={field === "description" ? "text" : "number"} value={item[field]} min={field === "quantity" ? "0.01" : "0"} step="0.01" onChange={(event) => setExtraItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, [field]: event.target.value } : entry))} />)}
      </div>)}</div>
    </SectionCard>}
    <QuotationDiscountControls form={form} onChange={(name,value)=>setForm(current=>({...current,[name]:value}))}
      items={[...groupedDraftItems(measurement, assignments, masters, quotation.items || [], quotation.rooms || []),...extraItems]}
      onLineChange={(item,field,value)=>{
        const id=item.specification_details?.assignment_id;
        if (id) setAssignments(current=>({...current,discounts:{...current.discounts,[id]:{...current.discounts?.[id],[field === "discount_type"?"type":"value"]:value}}}));
        else setExtraItems(current=>current.map(entry=>entry.id === item.id?{...entry,[field]:value}:entry));
      }} />
    {phase === "final" && <SectionCard title="Quotation details">
      <div className="grid gap-4 sm:grid-cols-2">
        <p className="text-sm font-semibold text-slate-600">Status: Draft</p>
        <FormField label="Valid until" name="valid_until" type="date" value={form.valid_until} onChange={update} />
        {textFields.map(([name, label]) => <FormField key={name} label={label} name={name} as="textarea" rows={3} value={form[name]} onChange={update} />)}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.show_product_key_features} onChange={(event) => setForm((current) => ({ ...current, show_product_key_features: event.target.checked }))} />Show product key features</label>
      </div>
    </SectionCard>}
    </form>
    <div className="flex flex-wrap justify-end gap-3">
      <Button variant="secondary" disabled={saving} onClick={() => phase === "final" ? setPhase("assignments") : navigate(`/quotations/${quotation.id}`)}>{phase === "final" ? "Back to paint areas" : "Cancel"}</Button>
      {phase === "assignments" ? <Button key="continue-review" type="button" onClick={event => { event?.preventDefault(); setPhase("final"); }}>Continue to final quotation</Button> : <>
        <Button key="save-draft" type="submit" form="grouped-quotation-draft-details" loading={saving}>Save draft</Button>
        <Button key="send-draft" type="button" variant="secondary" disabled={saving} onClick={() => saveDraft(true)}>Save &amp; send</Button>
      </>}
    </div>
    </fieldset>
  </div>;
}
