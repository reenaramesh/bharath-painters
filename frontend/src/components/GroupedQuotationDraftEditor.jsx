import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import GroupedQuotationWorkspace from "./GroupedQuotationWorkspace";
import BackButton from "./BackButton";
import { Button, FormField, PageHeader, SectionCard } from "./ui";
import { pricedLines } from "../utils/groupedQuotation.js";
import { groupedDraftItems, hasAssignment, restoreDraftAssignments } from "../utils/groupedQuotationDraft.js";

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
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  async function saveDraft() {
    setError("");
    const lines = pricedLines(measurement, assignments);
    if ((!lines.length && !extraItems.length) || lines.some((line) => !line.rate_valid)) {
      setError("Enter a valid rate for every priced line before saving the draft.");
      return;
    }
    setSaving(true);
    try {
      const roomIds = new Set((quotation.rooms || []).map((room) => room.property_room).filter(Boolean));
      assignments.groups.forEach((group) => group.room_ids.forEach((id) => roomIds.add(id)));
      [...assignments.specials, ...assignments.services].forEach((entry) => { if (entry.room_id) roomIds.add(entry.room_id); });
      const { data } = await api.post(`/quotations/${quotation.id}/rooms/sync/`, {
        property_room_ids: [...roomIds],
        custom_room_names: (quotation.rooms || []).filter((room) => !room.property_room).map((room) => room.name),
      });
      const items = groupedDraftItems(measurement, assignments, masters, quotation.items || [], data.quotation.rooms || []);
      await api.patch(`/quotations/${quotation.id}/`, {
        ...form, items: [...items, ...extraItems], valid_until: form.valid_until || null,
        discount_value: Number(form.discount_value) || 0, gst_percentage: Number(form.gst_percentage) || 0,
      });
      navigate(`/quotations/${quotation.id}`, { state: { draftSaved: true } });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Quotation draft could not be updated. Your edits are still available here.");
    } finally { setSaving(false); }
  }

  return <div className="bp-quotation-builder quotation-measurement-page mx-auto min-w-0 max-w-7xl space-y-4 pb-4 sm:space-y-5 sm:pb-8">
    <BackButton fallback={`/quotations/${quotation.id}`} label="Back to quotation" />
    <PageHeader eyebrow="Draft quotation" title={`Edit ${quotation.quotation_number || "quotation"}`} description="Create and edit paint areas using the saved Area Calculation." />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <GroupedQuotationWorkspace measurement={measurement} masters={masters} state={assignments} onChange={setAssignments} phase={phase} />
    <form id="grouped-quotation-draft-details" onSubmit={(event) => { event.preventDefault(); saveDraft(); }} className="space-y-4">
    {extraItems.length > 0 && <SectionCard title="Other saved quotation lines">
      <div className="space-y-3">{extraItems.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
        {["description", "quantity", "rate"].map((field) => <FormField key={field} label={field === "description" ? "Description" : field === "quantity" ? "Quantity" : "Rate"} type={field === "description" ? "text" : "number"} value={item[field]} min={field === "quantity" ? "0.01" : "0"} step="0.01" onChange={(event) => setExtraItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, [field]: event.target.value } : entry))} />)}
      </div>)}</div>
    </SectionCard>}
    {phase === "final" && <SectionCard title="Quotation details">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Status" name="status" as="select" value={form.status} onChange={update}>{["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}</FormField>
        <FormField label="Valid until" name="valid_until" type="date" value={form.valid_until} onChange={update} />
        <FormField label="Discount type" name="discount_type" as="select" value={form.discount_type} onChange={update}><option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option></FormField>
        <FormField label="Discount" name="discount_value" type="number" min="0" step="0.01" value={form.discount_value} onChange={update} />
        <FormField label="GST mode" name="gst_mode" as="select" value={form.gst_mode} onChange={update}><option value="GST_EXTRA">GST extra</option><option value="GST_INCLUDED">GST included</option><option value="NO_GST">No GST</option></FormField>
        <FormField label="GST percentage" name="gst_percentage" type="number" min="0" value={form.gst_percentage} onChange={update} />
        {textFields.map(([name, label]) => <FormField key={name} label={label} name={name} as="textarea" rows={3} value={form[name]} onChange={update} />)}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.show_product_key_features} onChange={(event) => setForm((current) => ({ ...current, show_product_key_features: event.target.checked }))} />Show product key features</label>
      </div>
    </SectionCard>}
    </form>
    <div className="flex flex-wrap justify-end gap-3">
      <Button variant="secondary" disabled={saving} onClick={() => phase === "final" ? setPhase("assignments") : navigate(`/quotations/${quotation.id}`)}>{phase === "final" ? "Back to paint areas" : "Cancel"}</Button>
      {phase === "assignments" ? <Button onClick={() => setPhase("final")}>Continue to final quotation</Button> : <Button type="submit" form="grouped-quotation-draft-details" loading={saving}>{form.status === "DRAFT" ? "Save draft" : "Save changes"}</Button>}
    </div>
  </div>;
}
