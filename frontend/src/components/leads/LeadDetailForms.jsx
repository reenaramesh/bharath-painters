import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import api from "../../api/client";
import ContractorDialog from "../ContractorDialog";
import { Button } from "../ui";
import { requestError } from "./lead-format";
import { LOST_REASON_OPTIONS, PRIORITY_OPTIONS, SOURCE_OPTIONS } from "../../utils/opportunityOptions";

const editFields = ["title", "description", "source", "source_detail", "priority", "estimated_value", "expected_start_date", "notes"];
const initialDraft = item => Object.fromEntries(editFields.map(key => [key, item[key] ?? ""]));

export function LeadEditDialog({ item, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => initialDraft(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(initialDraft(item)); }, [item]);
  const update = (key, value) => { dirty.current = true; setDraft(current => ({ ...current, [key]: value })); };
  const close = () => { if (!busy) onClose(); };
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.patch(`/quotations/leads/${item.id}/`, { ...draft, estimated_value: draft.estimated_value || null, expected_start_date: draft.expected_start_date || null });
      dirty.current = false;
      setDraft(initialDraft(data));
      await onSaved("Lead details updated.");
    } catch (failure) { setError(requestError(failure, "Lead details could not be saved. Your entries are retained.")); }
    finally { setBusy(false); }
  }
  if (!open) return null;
  return <ContractorDialog title="Edit lead" icon={Pencil} onClose={close} popupProtection="handled">
    {error && <p role="alert" className="lead-form-error">{error}</p>}
    <form onSubmit={save}><fieldset disabled={busy} className="lead-form-grid">
      <label className="lead-field lead-full"><span>Requested service / enquiry *</span><input required maxLength={180} value={draft.title} onChange={event => update("title", event.target.value)} /></label>
      <label className="lead-field lead-full"><span>Requirement details</span><textarea rows={3} value={draft.description} onChange={event => update("description", event.target.value)} /></label>
      <label className="lead-field"><span>Source</span><select value={draft.source} onChange={event => update("source", event.target.value)}>{SOURCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="lead-field"><span>Source details</span><input maxLength={255} value={draft.source_detail} onChange={event => update("source_detail", event.target.value)} /></label>
      <label className="lead-field"><span>Priority</span><select value={draft.priority} onChange={event => update("priority", event.target.value)}>{PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="lead-field"><span>Estimated value (₹)</span><input type="number" min="0" step="0.01" value={draft.estimated_value} onChange={event => update("estimated_value", event.target.value)} /></label>
      <label className="lead-field"><span>Expected start</span><input type="date" value={draft.expected_start_date} onChange={event => update("expected_start_date", event.target.value)} /></label>
      <label className="lead-field lead-full"><span>Internal notes</span><textarea rows={3} value={draft.notes} onChange={event => update("notes", event.target.value)} /></label>
      <div className="lead-record-actions lead-full justify-end"><Button type="button" variant="secondary" onClick={close}>Close</Button><Button type="submit" loading={busy}>Save changes</Button></div>
    </fieldset></form>
  </ContractorDialog>;
}

export function LeadStatusDialog({ item, open, presetStage = "", onClose, onSaved }) {
  const [stage, setStage] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelling = presetStage === "CANCELLED";
  const currentStage = cancelling ? "CANCELLED" : stage;
  useEffect(() => { if (open && presetStage) setStage(presetStage); }, [open, presetStage]);
  const close = () => { if (!busy) onClose(); };
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.patch(`/quotations/leads/${item.id}/`, { stage: currentStage, stage_note: note, lost_reason: currentStage === "LOST" ? lostReason : undefined, lost_note: currentStage === "LOST" ? note : undefined });
      setStage(""); setLostReason(""); setNote("");
      await onSaved(cancelling ? "Enquiry cancelled. Its history has been kept." : "Enquiry status updated.");
    } catch (failure) { setError(requestError(failure, "Status could not be updated. Your entries are retained.")); }
    finally { setBusy(false); }
  }
  if (!open) return null;
  return <ContractorDialog title={cancelling ? "Cancel enquiry" : item.is_closed ? "Reopen enquiry" : "Update enquiry status"} description={cancelling ? "This moves the enquiry to history. Its records and activity will be kept." : undefined} size="md" onClose={close} popupProtection="handled">
    {error && <p role="alert" className="lead-form-error">{error}</p>}
    <form onSubmit={save}><fieldset disabled={busy} className="lead-form-grid">
      {!cancelling && <label className="lead-field lead-full"><span>Enquiry status *</span><select required value={stage} onChange={event => setStage(event.target.value)}><option value="">Choose status</option>{[["CONTACTED", "Contacted"], ["SITE_VISIT", "Site visit"], ["MEASUREMENT", "Area calculation"], ["NEGOTIATION", "Negotiation"], ["LOST", "Lost"], ["CANCELLED", "Cancelled"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {currentStage === "LOST" && <label className="lead-field lead-full"><span>Lost reason *</span><select required value={lostReason} onChange={event => setLostReason(event.target.value)}><option value="">Choose reason</option>{LOST_REASON_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <label className="lead-field lead-full"><span>Reason / note{currentStage === "CANCELLED" ? " *" : ""}</span><textarea required={currentStage === "CANCELLED"} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>
      <div className="lead-record-actions lead-full justify-end"><Button type="button" variant="secondary" onClick={close}>{cancelling ? "Keep enquiry" : "Close"}</Button><Button type="submit" loading={busy}>{cancelling ? "Cancel enquiry" : "Update status"}</Button></div>
    </fieldset></form>
  </ContractorDialog>;
}
