import { Button } from "../ui";
import ContractorDialog from "../ContractorDialog";
import { LeadStage } from "../leads/lead-ui";
import { localDateTime } from "../leads/lead-format";

export default function CustomerFollowUpChoice({ customer, leads, loading, error, onRetry, onGeneral, onLead, onClose, existingFollowUps = [] }) {
  const eligible = leads.filter(lead => lead.can_follow_up === true && !lead.is_closed && String(lead.customer) === String(customer.id));
  return <ContractorDialog title="Add follow-up" description={`Choose what this follow-up is about for ${customer.name}.`} size="md" onClose={onClose} popupProtection="readonly">
    <div className="customer-followup-choice">
      {existingFollowUps.length > 0 && <p role="note">{existingFollowUps.length} {existingFollowUps.length === 1 ? "reminder is" : "reminders are"} already scheduled. Next: {localDateTime(existingFollowUps[0].next_follow_up)}.</p>}
      <button type="button" className="customer-followup-option" onClick={onGeneral}><strong>General customer follow-up</strong><span>A note or reminder that is not tied to an enquiry.</span></button>
      <h3>Update an enquiry</h3>
      {loading ? <p role="status">Loading the latest enquiries…</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={onRetry}>Retry enquiries</Button></div>
        : eligible.length ? eligible.map(lead => <button type="button" className="customer-followup-option" key={lead.id} onClick={() => onLead(lead)}><strong>{lead.title || lead.service_name}</strong><span>{lead.reference_no} · {lead.assigned_user_name || "Unassigned"}</span><LeadStage item={lead} /></button>)
          : <p>No active enquiries are available to update. You can still add a general follow-up.</p>}
      <div className="customer-followup-footer"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  </ContractorDialog>;
}
