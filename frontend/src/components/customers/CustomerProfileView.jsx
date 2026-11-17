import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, CalendarClock, ChevronDown, FileText, Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, ReceiptText } from 'lucide-react';
import CustomerAccountStatus from '../CustomerAccountStatus';
import { Button, ErrorState, LoadingState, StatusBadge } from '../ui';
import { customerAccountStatus } from '../../utils/customerActivation';
import { stageLabel } from '../../utils/opportunityOptions';
import { customerWhatsApp, pendingCustomerFollowups } from './customer-workflow';
import CustomerProfileActivity, { customerProfileDate } from './CustomerProfileActivity';
import './customer-profile.css';

const TABS = [['overview', 'Overview'], ['properties', 'Properties'], ['quotations', 'Quotations'], ['activity', 'Activity']];
const CONNECTION_LABELS = { PENDING: 'Connection pending', RECONNECT_PENDING: 'Connection pending', BLOCKED: 'Connection unavailable', DISCONNECTED: 'Disconnected', REJECTED: 'Not connected', NOT_CONNECTED: 'Not connected' };
const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';

export default function CustomerProfileView({ customer, leads = [],
  loading = false, error = '', success = '', onRetry, onFollowUp, onEdit, onActivate,
  activationBusy = false, onRequestConnection, requestBusy = false, canWork = false, canRequestConnection = false,
  callEvents = [], callsLoading = false, callsError = '', onRetryCalls, onComplete, completingId }) {
  const [tab, setTab] = useState('overview');
  const tabRefs = useRef({});
  const menu = useRef(null);
  const id = useId();
  useEffect(() => {
    const outside = event => { if (menu.current && !menu.current.contains(event.target)) menu.current.open = false; };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  if (!customer) return <div className="customer-profile"><Link to="/customers" className="customer-profile-back"><ArrowLeft size={16} aria-hidden="true" />Customers</Link>{loading ? <LoadingState label="Loading customer…" /> : <ErrorState message={error || 'Customer details are unavailable.'} onRetry={onRetry} />}</div>;
  const properties = customer.properties || [];
  const quotations = [...(customer.quotations || [])].sort((left, right) => (Date.parse(right.created_at || right.quotation_date) || 0) - (Date.parse(left.created_at || left.quotation_date) || 0));
  const pending = pendingCustomerFollowups(customer.follow_ups || []);
  const next = pending[0];
  const portal = customerAccountStatus(customer);
  const workAllowed = Boolean(canWork && customer.account_status !== 'DISABLED');
  const mobile = String(customer.mobile || '').replace(/[^\d+]/g, '');
  const canCall = mobile.replace(/\D/g, '').length >= 10;
  const whatsapp = customerWhatsApp(customer.whatsapp || customer.mobile);
  const connection = CONNECTION_LABELS[customer.connection_status];
  const statusLabel = connection || customer.status_display || stageLabel(customer.status) || 'Saved contact';
  const statusTone = ['BLOCKED', 'DISCONNECTED', 'REJECTED'].includes(customer.connection_status) || ['LOST', 'CANCELLED'].includes(customer.status) ? 'danger' : connection ? 'warning' : 'neutral';
  const contactDetails = [['Email', customer.email], ['WhatsApp', customer.whatsapp], ['Address', customer.address], ['Pincode', customer.pincode], ['GST number', customer.gst_number], ['Notes', customer.notes]].filter(([, value]) => hasValue(value));
  const customerPath = `/customers/${customer.id}`;
  const paymentHistory = customer.connection_status === 'CONNECTED' && !customer.is_saved_contact && !customer.is_pending_connection;
  const activation = workAllowed && portal?.canResend && onActivate;
  function action(callback) {
    menu.current?.querySelector('summary')?.focus();
    if (menu.current) menu.current.open = false;
    callback?.();
  }
  function navigateTabs(event, index) {
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    const name = TABS[nextIndex][0];
    setTab(name);
    tabRefs.current[name]?.focus();
  }
  function openTab(name) {
    setTab(name);
    tabRefs.current[name]?.focus();
  }
  return <div className="customer-profile">
    <Link to="/customers" className="customer-profile-back"><ArrowLeft size={16} aria-hidden="true" />Customers</Link>
    <header className="customer-profile-header">
      <div className="customer-profile-identity"><span className="customer-profile-avatar" aria-hidden="true">{String(customer.name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span><div className="customer-profile-identity-copy"><h1>{customer.name || 'Customer'}</h1><div className="customer-profile-contact-line">{customer.mobile && <span>{customer.mobile}</span>}{customer.bharath_id && <span>{customer.bharath_id}</span>}{customer.city && <span>{customer.city}</span>}</div><div className="customer-profile-statuses"><div className="customer-profile-contact-status"><span>Contact status</span><StatusBadge status={customer.status} label={statusLabel} tone={statusTone} /></div><div className="customer-profile-portal"><span>Portal status</span>{portal ? <CustomerAccountStatus customer={customer} /> : <span className="customer-profile-meta">Not available</span>}</div></div></div></div>
      <div className="customer-profile-header-actions">{workAllowed && onFollowUp && <Button className="customer-profile-primary-action" onClick={onFollowUp}><Plus size={16} aria-hidden="true" />Add follow-up</Button>}{canCall && <a className="customer-profile-local-action" href={`tel:${mobile}`}><Phone size={16} aria-hidden="true" />Call</a>}{whatsapp && <a className="customer-profile-local-action" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
        <details ref={menu} className="customer-profile-more" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label="More customer actions">More<MoreHorizontal size={17} aria-hidden="true" /></summary><div className="customer-profile-more-panel">{onEdit && <button type="button" onClick={() => action(onEdit)}><Pencil size={15} aria-hidden="true" />Edit details</button>}{customer.email && <a href={`mailto:${customer.email}`}><Mail size={15} aria-hidden="true" />Email</a>}{paymentHistory && <Link to={`${customerPath}/project-account`}><ReceiptText size={15} aria-hidden="true" />Payment history</Link>}{activation && <button type="button" disabled={activationBusy} onClick={() => action(onActivate)}>{activationBusy ? 'Preparing…' : 'Share activation link'}</button>}{canRequestConnection && customer.account_status !== 'DISABLED' && onRequestConnection && <button type="button" disabled={requestBusy} onClick={() => action(onRequestConnection)}>{requestBusy ? 'Sending request…' : 'Request connection'}</button>}</div></details>
      </div>
    </header>
    {success && <p className="customer-profile-success" role="status">{success}</p>}
    {error && tab !== 'activity' && <div className="customer-profile-resource-error" role="alert"><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Retry refresh</Button>}</div>}
    <div role="tablist" aria-label="Customer profile sections" className="customer-profile-tabs">{TABS.map(([name, label], index) => <button type="button" role="tab" key={name} id={`${id}-${name}-tab`} aria-controls={`${id}-${name}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} ref={element => { tabRefs.current[name] = element; }} onKeyDown={event => navigateTabs(event, index)} onClick={() => setTab(name)}>{label}</button>)}</div>
    {TABS.map(([panel]) => <div key={panel} role="tabpanel" className="customer-profile-tab-panel" tabIndex={0} hidden={tab !== panel} id={`${id}-${panel}-panel`} aria-labelledby={`${id}-${panel}-tab`}>
      {panel === 'overview' && <div className="customer-profile-overview">
        <section className="customer-profile-section customer-profile-next"><div className="customer-profile-next-copy"><p className="customer-profile-eyebrow"><CalendarClock size={15} aria-hidden="true" />Next follow-up</p>{next ? <><h2>{next.next_action || stageLabel(next.follow_up_type || 'Follow up with customer')}</h2><p className={Date.parse(next.next_follow_up) < Date.now() ? 'customer-profile-overdue' : 'customer-profile-meta'}>{Date.parse(next.next_follow_up) < Date.now() ? 'Overdue · ' : ''}<time dateTime={next.next_follow_up}>{customerProfileDate(next.next_follow_up)}</time></p>{next.comment && <p className="customer-profile-next-note">{next.comment}</p>}</> : <h2>No follow-up scheduled</h2>}</div><Button variant="secondary" onClick={() => openTab('activity')}>View activity<ArrowRight size={15} aria-hidden="true" /></Button></section>
        <div className="customer-profile-counts">{[['properties', 'Properties', properties.length, Building2], ['quotations', 'Quotations', quotations.length, FileText], ['activity', 'Pending follow-ups', pending.length, CalendarClock]].map(([name, label, count, Icon]) => <button key={name} type="button" onClick={() => openTab(name)}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{count}</strong></button>)}</div>
        {hasValue(customer.requirement) && <section className="customer-profile-section customer-profile-requirement"><h2>Requirement</h2><p>{customer.requirement}</p></section>}
        {contactDetails.length > 0 && <details className="customer-profile-contact-details"><summary>Contact details<ChevronDown size={16} aria-hidden="true" /></summary><dl>{contactDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
      </div>}
      {panel === 'properties' && <section className="customer-profile-section"><header className="customer-profile-section-heading"><h2>Properties</h2>{workAllowed && <Link className="customer-profile-local-action" to={`/properties?customer=${customer.id}&action=add`}><Plus size={15} aria-hidden="true" />Add property</Link>}</header>{properties.length ? <ul className="customer-profile-record-list">{properties.map(property => <li key={property.id}><div><Link className="customer-profile-record-title" to={`/properties/${property.id}`} state={{ customerPath }}>{property.name || property.property_type || 'Property'}</Link>{[property.address, property.city].filter(Boolean).length > 0 && <p className="customer-profile-meta">{[property.address, property.city].filter(Boolean).join(', ')}</p>}</div>{property.property_type && property.name && <span className="customer-profile-meta">{stageLabel(property.property_type)}</span>}<Link className="customer-profile-text-link" to={`/properties/${property.id}`} state={{ customerPath }}>View<ArrowRight size={14} aria-hidden="true" /></Link></li>)}</ul> : <p className="customer-profile-resource-state">No properties linked to this customer.</p>}</section>}
      {panel === 'quotations' && <section className="customer-profile-section"><header className="customer-profile-section-heading"><h2>Quotations</h2>{workAllowed && <Link className="customer-profile-local-action" to={`/quotations/new?customer=${customer.id}`}><Plus size={15} aria-hidden="true" />Create quotation</Link>}</header>{quotations.length ? <ul className="customer-profile-record-list">{quotations.map(quotation => <li key={quotation.id}><div><Link className="customer-profile-record-title" to={`/quotations/${quotation.id}`} state={{ customerPath }}>{quotation.quotation_number || quotation.reference_no || 'Draft quotation'}</Link>{customerProfileDate(quotation.created_at || quotation.quotation_date) && <p className="customer-profile-meta">{customerProfileDate(quotation.created_at || quotation.quotation_date)}</p>}</div><StatusBadge status={quotation.status} label={stageLabel(quotation.status)} /><Link className="customer-profile-text-link" to={`/quotations/${quotation.id}`} state={{ customerPath }}>View<ArrowRight size={14} aria-hidden="true" /></Link></li>)}</ul> : <p className="customer-profile-resource-state">No quotations for this customer yet.</p>}</section>}
      {panel === 'activity' && <CustomerProfileActivity customer={customer} leads={leads} loading={loading} error={error} onRetry={onRetry} canWork={workAllowed} onFollowUp={onFollowUp} callEvents={callEvents} callsLoading={callsLoading} callsError={callsError} onRetryCalls={onRetryCalls} onComplete={onComplete} completingId={completingId} />}
    </div>)}
  </div>;
}
