import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Ban, Clock3, Eye, FilePlus2, Phone, Plus, Search, UserRoundPlus, X } from "lucide-react";
import api from "../api/client";
import CustomerForm from "../components/CustomerForm";
import ContractorDialog from "../components/ContractorDialog";
import CallVisitConversionDialog from "../components/CallVisitConversionDialog";
import { bookedVisitUrl, callBookingIntent } from "../utils/callBooking";
import { Button, PageHeader } from "../components/ui";
import "./call-inbox.css";

const tabs = [
  ["all", "All calls"], ["new", "New callers"], ["existing", "Existing customers"],
  ["pending", "Pending approval"], ["dismissed", "Dismissed"], ["blocked", "Blocked"],
];
const statusLabel = { ANSWERED: "Answered", MISSED: "Missed", REJECTED: "Rejected" };

export default function CallInbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const handledIntent = useRef('');
  const [conversionEvent, setConversionEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(null);
  const [customerEvent, setCustomerEvent] = useState(null);
  const [details, setDetails] = useState(null);
  const [leadEvent, setLeadEvent] = useState(null);
  const [leadIntentEvent, setLeadIntentEvent] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/call-inbox/events/", { params: { tab, search } });
      setEvents(data.results || []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Calls could not be loaded.");
    } finally { setLoading(false); }
  }, [tab, search]);

  useEffect(() => { const timer = window.setTimeout(load, search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);

  useEffect(() => {
    const intent = callBookingIntent(location.search);
    if (!intent || handledIntent.current === location.search) return;
    let active = true;
    api.get(`/call-inbox/events/${intent.id}/`).then(({ data }) => {
      if (!active) return;
      handledIntent.current = location.search;
      setSelectedEvent(data);
      if (intent.book && !data.booked_follow_up) setConversionEvent(data);
      else if (intent.book) navigate(bookedVisitUrl(data));
      else setDetails(data);
    }).catch((requestError) => { if (active) setError(requestError.response?.data?.detail || 'The selected call could not be opened. Refresh to try again.'); });
    return () => { active = false; };
  }, [location.search, navigate]);

  const counts = useMemo(() => events.reduce((out, item) => { out[item.review_status] = (out[item.review_status] || 0) + 1; return out; }, {}), [events]);
  const displayedEvents = selectedEvent && !events.some((event) => event.id === selectedEvent.id) ? [selectedEvent, ...events] : events;

  async function action(event, name, body = {}) {
    setError("");
    try {
      const { data } = await api.post(`/call-inbox/events/${event.id}/${name}/`, body);
      if (name === "add-customer") {
        if (data.action === "OPEN") navigate(`/customers/${data.customer_id}`);
        else { setCustomerEvent(event); setCustomerDraft(data.initial_value); }
      } else if (name === "create-lead") {
        setLeadEvent(null);
        navigate("/leads");
      } else await load();
    } catch (requestError) { setError(requestError.response?.data?.detail || "That call action could not be completed."); }
  }

  async function saveManual(form) {
    setSaving(true); setError("");
    try {
      await api.post("/call-inbox/events/", { ...form, capture_source: "MANUAL", idempotency_key: `manual:${crypto.randomUUID()}` });
      setManualOpen(false); await load();
    } catch (requestError) { setError(requestError.response?.data?.phone_number || requestError.response?.data?.detail || "Call could not be saved. Check the phone number and required fields."); }
    finally { setSaving(false); }
  }

  async function saveCustomer(values) {
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/quotations/customers/", values);
      await api.post(`/call-inbox/events/${customerEvent.id}/link-customer/`, { customer_id: data.id });
      setCustomerDraft(null); setCustomerEvent(null);
      if (leadIntentEvent) {
        setLeadEvent({ ...leadIntentEvent, matched_customer: data.id, display_name: data.name });
        setLeadIntentEvent(null);
      } else navigate(`/customers/${data.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.mobile || requestError.response?.data?.name || "Customer could not be saved. Review the existing customer validation.");
    } finally { setSaving(false); }
  }

  async function showDetails(event) {
    try { const { data } = await api.get(`/call-inbox/events/${event.id}/`); setDetails(data); }
    catch (requestError) { setError(requestError.response?.data?.detail || "Call details could not be loaded."); }
  }

  return <div className="call-inbox-page">
    <PageHeader eyebrow="Customer relationships" title="Call Inbox" description="Review incoming calls and connect new callers to your CRM." actions={<Button onClick={() => { setError(""); setManualOpen(true); }}><Plus size={18}/> Add call</Button>} />
    {error && <div role="alert" className="call-inbox-alert">{error}</div>}

    <section className="call-inbox-summary">
      <div className="call-inbox-summary-icon"><Phone size={23}/></div>
      <div><strong>Incoming calls, organized</strong><p>Existing customer names always come from your CRM. Caller names remain attributed to their source.</p></div>
      <span>{counts.PENDING || 0} awaiting review</span>
    </section>

    <section className="call-inbox-panel">
      <div className="call-inbox-toolbar"><label className="call-inbox-search"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone number" aria-label="Search by name or phone number"/></label></div>
      <div className="call-inbox-tabs" role="tablist" aria-label="Call filters">{tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>)}</div>
      {loading ? <div className="call-inbox-state" role="status">Loading call history…</div> : displayedEvents.length ? <div className="call-inbox-list">{displayedEvents.map((event) => <article className="call-inbox-event" key={event.id} aria-label={selectedEvent?.id === event.id ? 'Selected call' : undefined}>
        <div className="call-inbox-avatar"><Phone size={19}/></div>
        <div className="call-inbox-event-main"><div className="call-inbox-title-line"><h2>{event.display_name}</h2><span className={`call-inbox-badge ${event.matched_customer ? "matched" : event.review_status.toLowerCase()}`}>{event.matched_customer ? "Existing customer" : event.review_status === "PENDING" ? "Needs review" : event.review_status.replaceAll("_", " ")}</span></div>
          <a className="call-inbox-phone" href={`tel:${event.phone_number}`}>{event.phone_number}</a>
          <p className="call-inbox-meta"><Clock3 size={14}/>{new Date(event.occurred_at).toLocaleString("en-IN")}<span>·</span>{statusLabel[event.call_status] || "Call status unavailable"}{event.caller_name && !event.matched_customer && <><span>·</span>{event.name_source === "PHONE_CONTACTS" ? "Phone contact" : event.name_source === "USER_ENTRY" ? "Entered by you" : "Caller name provided"}</>}</p>
          {event.matched_customer && <p className="call-inbox-crm-name">CRM customer: {event.customer_name}</p>}
        </div>
        <div className="call-inbox-actions">
          {event.booked_follow_up ? <Link to={bookedVisitUrl(event)} className="call-inbox-action primary">Open booked visit</Link> : !['BLOCKED', 'DISMISSED'].includes(event.review_status) && <button type="button" className="call-inbox-action primary" onClick={() => setConversionEvent(event)}>Convert & book site visit</button>}
          {event.matched_customer ? <>
            <Link to={`/customers/${event.matched_customer}`} className="call-inbox-action"><Eye size={17}/>Customer</Link>
            <Link to={`/properties?customer=${event.matched_customer}`} className="call-inbox-action">Properties</Link>
            <Link to={`/customers/${event.matched_customer}/quotations`} className="call-inbox-action">Quotations</Link>
            <button type="button" className="call-inbox-action" onClick={() => navigate(`/customers/${event.matched_customer}`)}>Follow-ups</button>
          </> : <>
            <button type="button" className="call-inbox-action primary" onClick={() => action(event, "add-customer")}><UserRoundPlus size={17}/>Add to customer</button>
            <button type="button" className="call-inbox-action" onClick={async () => { try { const { data } = await api.post(`/call-inbox/events/${event.id}/add-customer/`, {}); if (data.action === "OPEN") setLeadEvent({ ...event, matched_customer: data.customer_id, display_name: data.customer_name }); else { setLeadIntentEvent(event); setCustomerEvent(event); setCustomerDraft(data.initial_value); } } catch (requestError) { setError(requestError.response?.data?.detail || "This caller could not be prepared for lead creation."); } }}><FilePlus2 size={17}/>Create lead</button>
            <button type="button" className="call-inbox-icon" aria-label="Dismiss caller" title="Dismiss" onClick={() => action(event, "dismiss")}><X size={18}/></button>
            <button type="button" className="call-inbox-icon" aria-label="Block caller from CRM suggestions" title="Block future suggestions" onClick={() => action(event, "block")}><Ban size={18}/></button>
          </>}
          <button type="button" className="call-inbox-icon" aria-label="View call details" title="View details" onClick={() => showDetails(event)}><Eye size={18}/></button>
        </div>
      </article>)}</div> : <div className="call-inbox-state"><Phone size={28}/><strong>No calls in this view</strong><span>Add a call manually or wait for the Android companion integration.</span>{tab === "all" && <button type="button" className="call-inbox-action primary" onClick={() => setManualOpen(true)}><Plus size={17}/>Add call</button>}</div>}
    </section>

    {manualOpen && <ManualCallModal onClose={() => setManualOpen(false)} onSave={saveManual} saving={saving} error={error}/>}
    {conversionEvent && <CallVisitConversionDialog key={conversionEvent.id} event={conversionEvent} onClose={() => setConversionEvent(null)} onBooked={(event) => { setSelectedEvent(event); load(); }}/>}
    {customerDraft && <CustomerForm initialValue={customerDraft} onSubmit={saveCustomer} onClose={() => { setCustomerDraft(null); setCustomerEvent(null); setLeadEvent(null); }} saving={saving} error={error}/>}
    {details && <DetailsModal event={details} onClose={() => setDetails(null)}/>}
    {leadEvent && leadEvent.matched_customer && <LeadModal event={leadEvent} onClose={() => setLeadEvent(null)} error={error} onSubmit={(values) => action(leadEvent, "create-lead", values)}/>}
  </div>;
}

function ManualCallModal({ onClose, onSave, saving, error }) {
  const [form, setForm] = useState({ phone_number: "", caller_name: "", name_source: "UNKNOWN", occurred_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), call_status: "" });
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  return <ContractorDialog title="Add incoming call" description="Record an incoming call and review it in your inbox." icon={Phone} size="md" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, occurred_at: new Date(form.occurred_at).toISOString() }); }}>
    {error && <p role="alert" className="call-inbox-alert">{error}</p>}
    <div className="call-inbox-modal-body"><label>Phone number *<input required name="phone_number" value={form.phone_number} onChange={update} placeholder="10-digit mobile or +country code" inputMode="tel"/></label><label>Caller name<input name="caller_name" value={form.caller_name} onChange={(event) => setForm({ ...form, caller_name: event.target.value, name_source: event.target.value ? "USER_ENTRY" : "UNKNOWN" })} placeholder="Optional"/></label><label>Call time<input required type="datetime-local" name="occurred_at" value={form.occurred_at} onChange={update}/></label><label>Call status<select name="call_status" value={form.call_status} onChange={update}><option value="">Unavailable</option><option value="ANSWERED">Answered</option><option value="MISSED">Missed</option><option value="REJECTED">Rejected</option></select></label></div>
    <div className="call-inbox-modal-footer"><button type="button" className="call-inbox-secondary" onClick={onClose}>Cancel</button><button className="call-inbox-submit" disabled={saving}>{saving ? "Saving…" : "Save call"}</button></div>
  </form></ContractorDialog>;
}

function DetailsModal({ event, onClose }) { return <ContractorDialog title="Call details" description={`${event.phone_number} \u00b7 ${new Date(event.occurred_at).toLocaleString("en-IN")}`} icon={Phone} size="md" onClose={onClose}><div className="call-inbox-modal-body">{event.caller_name && <p><b>Caller name:</b> {event.caller_name} ({event.name_source.replaceAll("_", " ").toLowerCase()})</p>}<p><b>Call status:</b> {statusLabel[event.call_status] || "Unavailable"}</p><p><b>Captured by:</b> {event.capture_source === "MANUAL" ? "Manual entry" : "Android companion"}</p><h3>Call history for this number</h3>{event.history?.length ? event.history.map((item) => <p key={item.id} className="call-inbox-history">{new Date(item.occurred_at).toLocaleString("en-IN")} · {statusLabel[item.call_status] || "Status unavailable"}</p>) : <p>No previous calls.</p>}</div><div className="call-inbox-modal-footer"><button className="call-inbox-submit" onClick={onClose}>Done</button></div></ContractorDialog>; }

function LeadModal({ event, onClose, onSubmit, error }) { const [title, setTitle] = useState("Incoming call enquiry"); const [description, setDescription] = useState(""); return <ContractorDialog title="Create lead" description={`${event.display_name} \u00b7 ${event.phone_number}`} icon={FilePlus2} size="md" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description }); }}>{error && <p role="alert" className="call-inbox-alert">{error}</p>}<div className="call-inbox-modal-body"><label>Lead title *<input required value={title} onChange={(e) => setTitle(e.target.value)}/></label><label>Notes<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="3"/></label></div><div className="call-inbox-modal-footer"><button type="button" className="call-inbox-secondary" onClick={onClose}>Cancel</button><button className="call-inbox-submit">Create lead</button></div></form></ContractorDialog>; }

