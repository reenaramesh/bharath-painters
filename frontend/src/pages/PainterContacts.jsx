import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Paintbrush, Plus, Search } from 'lucide-react';
import api from '../api/client';
import useAuth from '../context/useAuth';
import useMobileView from '../hooks/useMobileView';
import { ContractorContactLinks } from '../components/ContractorProfileDetails';
import DirectoryPagination, { paginate } from '../components/DirectoryPagination';
import { EmptyState, LoadingState } from '../components/ui';
import PageHeader from '../components/ContractorModuleHeader';
import HiringWorkspaceNav from '../components/HiringWorkspaceNav';
import './painter-contacts.css';
import './contractor-network.css';

export default function PainterContacts() {
  const { user } = useAuth();
  const mobile = useMobileView();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', remarks: '' });
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/accounts/painter-contacts/'); setContacts(data); }
    catch { setError('Painters could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user?.role === 'CONTRACTOR') load(); }, [load, user?.role]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter(contact => [contact.name, contact.mobile, contact.remarks].some(value => String(value || '').toLowerCase().includes(term)));
  }, [contacts, search]);
  const { pageRows, safePage, totalPages } = paginate(filtered, page, pageSize);

  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setSaving(true); setSaveError(''); setExisting(null);
    try {
      const { data } = await api.post('/accounts/painter-contacts/', form);
      const path = data.existing_url || `/painters/contacts/${data.id}`;
      if (data.already_saved) { setExisting(path); return; }
      navigate(path);
    } catch (err) {
      const data = err.response?.data;
      setSaveError(data ? Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : value}`).join(' ') : 'Painter was not saved. Check your connection and try again.');
    } finally { busy.current = false; setSaving(false); }
  }
  const change = event => { setExisting(null); setForm(current => ({ ...current, [event.target.name]: event.target.value })); };
  if (user?.role !== 'CONTRACTOR') return <p role="alert">Only contractors can access painter contacts.</p>;

  return <div className="painter-contacts-page contractor-network-page contractor-people-page space-y-5">
    <PageHeader icon={Paintbrush} eyebrow="Jobs & Applications" title="Painters" description="Your painter contacts, saved from Truecaller or added here." actions={<button className="painter-contact-primary people-header-action people-primary-action" onClick={() => setAdding(value => !value)} aria-expanded={adding} aria-controls="add-painter-form"><Plus size={18} aria-hidden="true" />Add Painter</button>} />
    <HiringWorkspaceNav />
    {adding && <section id="add-painter-form" className="painter-contact-surface"><h2>Add Painter</h2>
      <form onSubmit={save}>
        <fieldset disabled={saving}><legend className="sr-only">Painter contact details</legend>
          <label>Name<input name="name" value={form.name} onChange={change} required maxLength={150} autoComplete="name" /></label>
          <label>Mobile Number<input name="mobile" value={form.mobile} onChange={change} required maxLength={32} type="tel" autoComplete="tel" /></label>
          <label>Remarks <span>(optional)</span><textarea name="remarks" value={form.remarks} onChange={change} rows={3} /></label>
        </fieldset>
        {saveError && <p className="painter-contact-error" role="alert">{saveError}</p>}
        <div className="painter-contact-actions">{existing ? <Link className="painter-contact-primary" to={existing}>View Existing Contact</Link> : <button className="painter-contact-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Painter'}</button>}<button type="button" className="painter-contact-secondary" disabled={saving} onClick={() => setAdding(false)}>Cancel</button></div>
      </form>
    </section>}
    <section className="painter-contact-surface">
      <label className="painter-contact-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search painters</span><input type="search" value={search} placeholder="Search name, mobile or remarks" onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {error ? <div role="alert"><p className="painter-contact-error">{error}</p><button className="painter-contact-secondary" onClick={load}>Try again</button></div> : loading ? <LoadingState label="Loading painters…" /> : !filtered.length ? <EmptyState title={search ? 'No matching painters' : 'No painters saved yet'} description={search ? 'Try another name or mobile number.' : 'Add a painter here, or share a Truecaller contact and select Painter.'} /> : <>
        <p className="painter-contact-count">{filtered.length} painter{filtered.length === 1 ? '' : 's'} · Contact information is unverified</p>
        <div className="network-table-scroll"><table className="network-compact-table" data-mobile-table="keep" aria-label="Painter contact list">
          <thead><tr><th scope="col">Painter</th><th scope="col">Contact</th><th scope="col">Remarks / status</th>{!mobile && <th scope="col">Actions</th>}</tr></thead>
          <tbody>{pageRows.map(contact => {
            const action = <div className="network-table-actions"><Link className="painter-table-view" to={`/painters/contacts/${contact.id}`}>View contact</Link></div>;
            return <tr key={contact.id}>
              <td><Link className="network-table-name bp-ui-action" to={`/painters/contacts/${contact.id}`}><strong>{contact.name}</strong></Link></td>
              <td><p>{contact.mobile}</p><ContractorContactLinks mobile={contact.mobile} /></td>
              <td><span className="painter-contact-status">Unverified</span><p className="painter-contact-remarks">{contact.remarks || 'No remarks added.'}</p>{mobile && action}</td>
              {!mobile && <td>{action}</td>}
            </tr>;
          })}</tbody>
        </table></div>
        <DirectoryPagination total={filtered.length} page={safePage} totalPages={totalPages} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
      </>}
    </section>
  </div>;
}
