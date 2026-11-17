import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, FilePlus2, KeyRound, MessageCircle, MoreHorizontal, Phone, UserRound } from 'lucide-react';
import { EmptyState, LoadingState } from '../ui';
import { customerAccountStatus } from '../../utils/customerActivation';
import { formatLastActivity } from '../../utils/lastActivity.js';
import './customer-directory.css';

const propertyLabel = item => item?.name || item?.property_type || 'Unnamed property';
const restrictedConnections = new Set(['PENDING', 'RECONNECT_PENDING', 'REJECTED', 'BLOCKED', 'DISCONNECTED', 'NOT_CONNECTED']);

function fullPhone(value) {
  const text = String(value || '').trim();
  const digits = text.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(text) && digits.length >= 10 && digits.length <= 15 ? text : '';
}

function accessFor(customer) {
  const account = customerAccountStatus(customer);
  const localProfile = /^\d+$/.test(String(customer.id));
  const restricted = customer.is_saved_contact || customer.is_pending_connection || restrictedConnections.has(customer.connection_status)
    || account?.tone === 'danger' || customer.account_status === 'DISABLED' || customer.status === 'CANCELLED';
  return { account, localProfile, canUse: localProfile && customer.connection_status === 'CONNECTED' && !restricted };
}
export { accessFor as customerDirectoryAccess };

function PortalStatus({ customer }) {
  if (customer.is_saved_contact || customer.is_pending_connection || restrictedConnections.has(customer.connection_status) || customer.status === 'CANCELLED') return null;
  const status = customer.account_status || (customer.activation_pending === true ? 'NOT_ACTIVATED' : customer.activation_pending === false ? 'ACTIVE' : null);
  const statuses = { ACTIVE: 'Portal account activated', NOT_ACTIVATED: 'Portal account not activated', DISABLED: 'Portal account disabled' };
  const text = statuses[status];
  if (!text) return null;
  return <span className={`customer-directory-portal ${status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`} title={text}>
    <span aria-hidden="true" /><span className="sr-only">{text}</span>
  </span>;
}

function Identity({ customer }) {
  const { localProfile } = accessFor(customer);
  return <div className="customer-directory-identity">
    {localProfile ? <Link className="customer-directory-name" to={`/customers/${customer.id}`}>{customer.name || 'Unnamed customer'}</Link> : <strong className="customer-directory-name">{customer.name || 'Saved contact'}</strong>}
    <PortalStatus customer={customer} />
  </div>;
}

function Properties({ items, loading, unavailable }) {
  if (!items.length) return <span className="customer-directory-muted">{loading ? 'Loading properties…' : unavailable ? 'Properties unavailable' : 'No properties'}</span>;
  return <div className="customer-directory-properties"><strong title={items.map(propertyLabel).join(', ')}>{propertyLabel(items[0])}</strong>
    <small>{items.length} {items.length === 1 ? 'property' : 'properties'}</small>
  </div>;
}

function LastActivity({ customer }) {
  if (!accessFor(customer).canUse) return <span className="customer-directory-muted">Not available</span>;
  const value = customer.last_activity_at;
  const text = formatLastActivity(value);
  return text === 'No recorded activity'
    ? <span className="customer-directory-muted">{text}</span>
    : <time className="customer-directory-last-activity" dateTime={value}>{text}</time>;
}

function Actions({ customer, onActivate, activatingCustomerId, disabled }) {
  const menu = useRef(null);
  const { account, localProfile, canUse } = accessFor(customer);
  const phone = fullPhone(customer.mobile);
  const whatsapp = fullPhone(customer.whatsapp) || phone;
  const digits = whatsapp.replace(/\D/g, '');
  const whatsappNumber = digits.length === 10 ? `91${digits}` : digits;
  const canActivate = canUse && account?.canResend;
  useEffect(() => {
    const outside = event => { if (!menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function activate(event) {
    menu.current.open = false;
    menu.current.querySelector('summary')?.focus();
    onActivate(customer, event);
  }
  return <div className="customer-directory-actions" role="group" aria-label={`Actions for ${customer.name || 'customer'}`} onClick={event => event.stopPropagation()}>
    {phone ? <a className="customer-directory-icon" href={`tel:${phone}`} aria-label={`Call ${customer.name || 'customer'}`} title="Call"><Phone size={17} aria-hidden="true" /></a>
      : <button className="customer-directory-icon" type="button" disabled aria-label="No full phone number available"><Phone size={17} aria-hidden="true" /></button>}
    {whatsappNumber ? <a className="customer-directory-icon is-whatsapp" href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${customer.name || 'customer'}`} title="WhatsApp"><MessageCircle size={17} aria-hidden="true" /></a>
      : <button className="customer-directory-icon" type="button" disabled aria-label="No full WhatsApp number available"><MessageCircle size={17} aria-hidden="true" /></button>}
    <details className="customer-directory-menu" ref={menu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
      <summary className="customer-directory-icon" aria-label={`More actions for ${customer.name || 'customer'}`}><MoreHorizontal size={20} aria-hidden="true" /></summary>
      <div className="customer-directory-menu-items">
        {localProfile && <Link to={`/customers/${customer.id}`}><UserRound size={16} aria-hidden="true" />View saved profile</Link>}
        {canUse && <Link to={`/quotations/new?customer=${customer.id}`}><FilePlus2 size={16} aria-hidden="true" />New quotation</Link>}
        {canActivate && <button type="button" disabled={disabled || activatingCustomerId !== null} onClick={activate}><KeyRound size={16} aria-hidden="true" />{activatingCustomerId === customer.id ? 'Preparing link…' : 'Share activation link'}</button>}
        {!localProfile && <span className="customer-directory-muted">Saved profile unavailable</span>}
      </div>
    </details>
  </div>;
}

function SortHeader({ children, sortKey, sort, onSort }) {
  return <th scope="col" aria-sort={sort.key === sortKey ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" onClick={() => onSort(sortKey)}>{children}<ArrowUpDown size={14} aria-hidden="true" /></button>
  </th>;
}

export default function CustomerDirectoryRecords({ customers, propertiesByCustomer, loading, propertiesLoading, propertiesError, sort, onSort, onOpen, onActivate, activatingCustomerId, actionsDisabled = false }) {
  if (loading && !customers.length) return <LoadingState label="Loading customers…" />;
  if (!customers.length) return <EmptyState title="No customers found" description="Try another search or adjust More filters." />;
  const propertyItems = customer => propertiesByCustomer[String(customer.id)] || customer.properties || [];
  function open(event, customer) {
    if (event.defaultPrevented || event.target.closest('a,button,input,select,textarea,summary,details')) return;
    if (accessFor(customer).localProfile) onOpen(customer);
  }
  function keyboard(event, customer) {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (accessFor(customer).localProfile) onOpen(customer);
  }
  const propertyProps = customer => ({ items: propertyItems(customer), loading: propertiesLoading, unavailable: propertiesError });
  const actionProps = customer => ({ customer, onActivate, activatingCustomerId, disabled: actionsDisabled });
  return <div className="customer-directory-records" aria-busy={loading}>
    <div className="customer-directory-desktop"><table className="customer-directory-table" data-mobile-table="keep">
      <caption className="sr-only">Customer names with portal activation indicators, properties, last activity and actions</caption>
      <colgroup><col /><col style={{ width: '28%' }} /><col style={{ width: '24%' }} /><col style={{ width: 156 }} /></colgroup>
      <thead><tr><SortHeader sortKey="name" sort={sort} onSort={onSort}>Customer name</SortHeader><SortHeader sortKey="property" sort={sort} onSort={onSort}>Property</SortHeader>
        <SortHeader sortKey="last_activity_at" sort={sort} onSort={onSort}>Last activity</SortHeader>
        <th scope="col" data-no-sort="true">Actions</th></tr></thead>
      <tbody>{customers.map(customer => <tr key={customer.id} className={accessFor(customer).localProfile ? 'is-openable' : ''} tabIndex={accessFor(customer).localProfile ? 0 : undefined}
        onClick={event => open(event, customer)} onKeyDown={event => keyboard(event, customer)}>
        <td><Identity customer={customer} /></td><td><Properties {...propertyProps(customer)} /></td><td><LastActivity customer={customer} /></td><td><Actions {...actionProps(customer)} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="customer-directory-cards">{customers.map(customer => <article key={customer.id} className="customer-directory-card" onClick={event => open(event, customer)}>
      <header><Identity customer={customer} /><Actions {...actionProps(customer)} /></header>
      <dl><div><dt>Property</dt><dd><Properties {...propertyProps(customer)} /></dd></div><div><dt>Last activity</dt><dd><LastActivity customer={customer} /></dd></div></dl>
    </article>)}</div>
  </div>;
}
