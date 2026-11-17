import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Phone } from 'lucide-react';
import { Button, StatusBadge } from '../ui';
import { localDateTime } from '../leads/lead-format';
import { FOLLOW_UP_OUTCOMES, stageLabel } from '../../utils/opportunityOptions';
import { recentFirst } from '../../utils/workspaceLists';

export function customerProfileDate(value) {
  return value && Number.isFinite(Date.parse(value)) ? localDateTime(value) : '';
}

function FollowupContext({ item, leads }) {
  const reference = item.opportunity ?? item.lead;
  if (!reference) return <span>General customer</span>;
  const id = typeof reference === 'object' ? reference.id : reference;
  const lead = leads.find(row => String(row.id) === String(id));
  return id ? <Link to={`/opportunities/${id}`}>{lead?.title || lead?.service_name || item.opportunity_title || item.lead_title || 'Linked enquiry'}</Link> : <span>Linked enquiry</span>;
}

export default function CustomerProfileActivity({ customer, leads = [], loading = false, error = '', onRetry,
  canWork = false, onFollowUp, callEvents = [], callsLoading = false, callsError = '', onRetryCalls, onComplete, completingId }) {
  const [followupLimit, setFollowupLimit] = useState(10);
  const [callLimit, setCallLimit] = useState(8);
  const id = useId();
  const followups = recentFirst(customer.follow_ups || [], ['completed_at', 'follow_up_date', 'created_at']);
  const calls = recentFirst(callEvents, ['occurred_at', 'created_at']);
  return <div className="customer-profile-activity">
    <section className="customer-profile-section" aria-labelledby={`${id}-followups-title`} aria-busy={loading}>
      <header className="customer-profile-section-heading"><div><h2 id={`${id}-followups-title`}>Follow-ups</h2><p>Discussion, outcomes and scheduled tasks · India time</p></div>{canWork && onFollowUp && <Button variant="secondary" onClick={onFollowUp}>Add follow-up</Button>}</header>
      {loading && <p role="status" className="customer-profile-resource-state">Refreshing follow-ups…</p>}
      {error && <div role="alert" className="customer-profile-resource-error"><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Retry follow-ups</Button>}</div>}
      {followups.length > 0 ? <ol className="customer-profile-timeline">{followups.slice(0, followupLimit).map(item => {
        const due = customerProfileDate(item.next_follow_up);
        const recorded = customerProfileDate(item.follow_up_date || item.created_at);
        const completed = customerProfileDate(item.completed_at);
        const actor = item.performed_by_name || item.actor_name || item.created_by_name;
        const outcome = FOLLOW_UP_OUTCOMES.find(([value]) => value === item.outcome)?.[1] || stageLabel(item.outcome);
        return <li key={item.id}><span className="customer-profile-activity-icon" aria-hidden="true">{item.is_completed ? <Check size={17} /> : <CalendarClock size={17} />}</span><div className="customer-profile-activity-copy">
          <div className="customer-profile-row-heading"><h3>{stageLabel(item.follow_up_type || 'NOTE')}</h3><StatusBadge status={item.is_completed ? 'COMPLETED' : due ? 'PENDING' : 'RECORDED'} label={item.is_completed ? 'Completed' : due ? 'Pending' : 'Recorded'} tone={item.is_completed ? 'success' : due ? 'warning' : 'neutral'} /></div>
          <p className="customer-profile-context"><FollowupContext item={item} leads={leads} /></p>
          {outcome && <p className="customer-profile-outcome">Outcome: {outcome}</p>}
          {item.comment && <p className="customer-profile-note">{item.comment}</p>}
          {item.next_action && <p>Next action: {item.next_action}</p>}
          {due && <p className={!item.is_completed && Date.parse(item.next_follow_up) < Date.now() ? 'customer-profile-overdue' : 'customer-profile-meta'}>{item.is_completed ? 'Scheduled for' : 'Due'}: <time dateTime={item.next_follow_up}>{due}</time></p>}
          {(actor || recorded) && <p className="customer-profile-meta">{actor}{actor && recorded ? ' · ' : ''}{recorded && <time dateTime={item.follow_up_date || item.created_at}>{recorded}</time>}</p>}
          {completed && <p className="customer-profile-meta">Completed: <time dateTime={item.completed_at}>{completed}</time></p>}
        </div>{canWork && due && !item.is_completed && onComplete && <Button className="customer-profile-complete" variant="secondary" disabled={completingId != null} loading={String(completingId) === String(item.id)} onClick={() => onComplete(item)}>Mark done</Button>}</li>;
      })}</ol> : !loading && !error && <p className="customer-profile-resource-state">No follow-ups recorded yet.</p>}
      {followups.length > followupLimit && <div className="customer-profile-section-footer"><Button variant="quiet" onClick={() => setFollowupLimit(count => count + 10)}>Show more follow-ups</Button></div>}
    </section>
    <section className="customer-profile-section" aria-labelledby={`${id}-calls-title`} aria-busy={callsLoading}>
      <header className="customer-profile-section-heading"><div><h2 id={`${id}-calls-title`}>Incoming calls</h2><p>Calls linked to this customer · India time</p></div></header>
      {callsLoading && <p role="status" className="customer-profile-resource-state">Loading incoming calls…</p>}
      {callsError && <div role="alert" className="customer-profile-resource-error"><p>{callsError}</p>{onRetryCalls && <Button variant="secondary" onClick={onRetryCalls}>Retry calls</Button>}</div>}
      {calls.length > 0 ? <ol className="customer-profile-call-list">{calls.slice(0, callLimit).map(event => {
        const at = customerProfileDate(event.occurred_at);
        const phone = String(event.phone_number || '').replace(/[^\d+]/g, '');
        return <li key={event.id}><span className="customer-profile-activity-icon" aria-hidden="true"><Phone size={17} /></span><div className="customer-profile-activity-copy"><h3>{stageLabel(event.call_status) || 'Incoming call'}</h3>{at && <p className="customer-profile-meta"><time dateTime={event.occurred_at}>{at}</time></p>}{event.created_lead && <Link className="customer-profile-context" to={`/opportunities/${event.created_lead}`}>Linked enquiry</Link>}{event.actor_name && <p className="customer-profile-meta">{event.actor_name}</p>}</div>{phone.replace(/\D/g, '').length >= 10 && <a className="customer-profile-local-action" href={`tel:${phone}`}><Phone size={15} aria-hidden="true" />Call back</a>}</li>;
      })}</ol> : !callsLoading && !callsError && <p className="customer-profile-resource-state">No incoming calls linked to this customer.</p>}
      {calls.length > callLimit && <div className="customer-profile-section-footer"><Button variant="quiet" onClick={() => setCallLimit(count => count + 8)}>Show more calls</Button></div>}
    </section>
  </div>;
}
