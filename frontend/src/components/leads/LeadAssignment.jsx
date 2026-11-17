import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import api from "../../api/client";
import { Button } from "../ui";
import { requestError } from "./lead-format";
import useLeadAssignees from "./useLeadAssignees";
import ContractorDialog from "../ContractorDialog";

export function LeadAssigneeSelect({ value, onChange, team, currentName = "", disabled = false, label = "Assign to" }) {
  const unavailable = value && value !== "self" && !team.members.some(member => String(member.id) === String(value));
  return <div>
    <label className="lead-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)} disabled={disabled || team.loading}>
      <option value="self">Myself</option><option value="">Unassigned</option>
      {unavailable && <option value={value} disabled>{currentName || "Previous employee"} (unavailable)</option>}
      {team.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
    </select></label>
    {team.loading && <p className="lead-muted mt-2" role="status">Loading team members…</p>}
    {team.error && <p className="lead-muted mt-2" role="alert">{team.error} <button type="button" className="lead-inline-button" onClick={team.retry} disabled={disabled}>Retry</button></p>}
    {!team.loading && !team.error && !team.members.length && <p className="lead-muted mt-2">Add an active in-house employee in Employees & Attendance to assign leads to your team.</p>}
  </div>;
}

export default function LeadAssignment({ item, onSaved, dialogOpen, onClose }) {
  const team = useLeadAssignees(dialogOpen !== false);
  const savedValue = item.assigned_user === item.contractor ? "self" : String(item.assigned_user || "");
  const [value, setValue] = useState(savedValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { setValue(savedValue); setError(""); setNotice(""); }, [savedValue, item.id]);
  async function save(event) {
    event.preventDefault();
    if (busy || value === savedValue) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.patch(`/quotations/leads/${item.id}/`, { assigned_user: value === "self" ? item.contractor : value ? Number(value) : null });
      await onSaved("Assignment updated."); setNotice("Assignment updated.");
    } catch (failure) { setError(requestError(failure, "Assignment could not be saved. Please retry.")); }
    finally { setBusy(false); }
  }
  const close = () => { if (!busy) onClose?.(); };
  if (dialogOpen === false) return null;
  const content = <form onSubmit={save} className="space-y-3">
      <LeadAssigneeSelect value={value} onChange={setValue} team={team} currentName={item.assigned_user_name} disabled={busy} />
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      <div className="lead-record-actions justify-end">{dialogOpen && <Button type="button" variant="secondary" onClick={close} disabled={busy}>Close</Button>}<Button type="submit" loading={busy} disabled={value === savedValue || team.loading}>Save assignment</Button></div>
    </form>;
  return dialogOpen ? <ContractorDialog title="Change lead owner" icon={UserRound} size="md" onClose={close} popupProtection="handled">{content}</ContractorDialog>
    : <section className="lead-panel lead-assignment-panel"><h2><UserRound size={17} aria-hidden="true" />Lead owner</h2><p className="lead-muted my-3">{item.assigned_user_name || "Unassigned"}</p>{content}</section>;
}
