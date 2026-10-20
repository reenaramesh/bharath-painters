import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import ContractorDialog from './ContractorDialog';
import CustomerActivationShare from './CustomerActivationShare';
import { bookCallVisit, bookedVisitUrl } from '../utils/callBooking';

export default function CallVisitConversionDialog({ event, onClose, onBooked }) {
  const [current, setCurrent] = useState(event);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({ name: event.customer_name || event.caller_name || '', date: '', time: '', comment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [booked, setBooked] = useState(null);
  const share = pending?.share || (booked && customer?.link_purpose === 'ACTIVATION' ? customer : null);
  const update = (e) => setForm((value) => ({ ...value, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await bookCallVisit(api, { event: current, customer, form, onPrepared: setCustomer, onLinked: setCurrent });
      setCurrent(result.event);
      if (result.status === 'pending') setPending(result);
      else { setBooked(result.event); setPending(null); onBooked(result.event); }
    } catch (failure) {
      const data = failure.response?.data;
      const message = data?.detail || data?.next_follow_up || data?.mobile || data?.name || failure.message;
      setError(Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'The visit could not be booked. Your details are retained; try again.');
    } finally { setBusy(false); }
  }
  async function regenerateShare() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/quotations/customers/${current.matched_customer}/share-link/`, {});
      if (booked) setCustomer((value) => ({ ...value, ...data }));
      else setPending((value) => ({ ...value, share: data }));
    } catch (failure) { setError(failure.response?.data?.detail || 'The approval link could not be prepared.'); }
    finally { setBusy(false); }
  }
  return <>
    <ContractorDialog title={booked ? 'Site visit booked' : 'Convert & book site visit'} description={event.phone_number} icon={CalendarDays} size="md" onClose={() => { if (!busy) onClose(); }}>
      {booked ? <div className="call-inbox-modal-body"><p role="status">Site visit scheduled for {new Date(booked.booked_visit.next_follow_up).toLocaleString('en-IN')}.</p><Link to={bookedVisitUrl(booked)} className="call-inbox-action primary">Open site visit</Link>{share?.share_link && <button type="button" className="call-inbox-action" onClick={() => setShareOpen(true)}>Share customer activation link</button>}<div className="call-inbox-modal-footer"><button type="button" className="call-inbox-secondary" onClick={onClose}>Done</button></div></div> : <form onSubmit={submit}>
        {error && <p role="alert" className="call-inbox-alert">{error}</p>}
        {pending && <div className="call-inbox-alert" role="status"><p>{pending.detail || 'Customer approval is required before scheduling this visit.'} Your visit details are retained. After approval, choose Check approval & book.</p>{pending.share?.share_link && <button type="button" className="call-inbox-action" onClick={() => setShareOpen(true)}>Share approval link</button>}<Link className="call-inbox-action" to={`/customers/${current.matched_customer}`} target="_blank" rel="noreferrer">Open customer connection</Link></div>}
        <div className="call-inbox-modal-body">
          <label>Customer name *<input required name="name" value={form.name} onChange={update} maxLength="150" readOnly={Boolean(current.matched_customer)} /></label>
          <label>Visit date *<input required type="date" name="date" value={form.date} onChange={update}/></label>
          <label>Visit time *<input required type="time" name="time" value={form.time} onChange={update}/></label>
          <label>Visit notes<textarea name="comment" value={form.comment} onChange={update} rows="3" maxLength="10000"/></label>
        </div>
        <div className="call-inbox-modal-footer"><button type="button" className="call-inbox-secondary" disabled={busy} onClick={onClose}>Close</button><button className="call-inbox-submit" disabled={busy}>{busy ? 'Checking & booking…' : pending ? 'Check approval & book' : 'Convert & book site visit'}</button></div>
      </form>}
    </ContractorDialog>
    {shareOpen && share?.share_link && <CustomerActivationShare customer={{ ...customer, ...share, mobile: event.phone_number }} contractor={{}} onClose={() => setShareOpen(false)} onRegenerate={regenerateShare} busy={busy} error={error}/>}
  </>;
}
