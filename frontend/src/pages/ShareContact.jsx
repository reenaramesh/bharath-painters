import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import useAuth from '../context/useAuth';
import { parseSharedContact } from '../utils/sharedContact';
import './share-contact.css';

const draftKey = 'bp-shared-contact';
function readDraft(ownerId) {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has('share_error')) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    let previous;
    try { previous = JSON.parse(sessionStorage.getItem(draftKey)); } catch { /* empty draft below */ }
    const draft = { ...(previous && (!previous.ownerId || !ownerId || previous.ownerId === ownerId) ? previous : { name: '', mobile: '', category: '', remarks: '' }), importError: 'Shared contact could not be read. Please check or enter the name and number.' };
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
    return draft;
  }
  if (['title', 'text', 'url'].some(key => params.has(key))) {
    const draft = { ...parseSharedContact(Object.fromEntries(params)), category: '', remarks: '' };
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
    window.history.replaceState(window.history.state, '', window.location.pathname);
    return draft;
  }
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey));
    return draft && (!draft.ownerId || !ownerId || draft.ownerId === ownerId) ? draft : { name: '', mobile: '', category: '', remarks: '' };
  }
  catch { return { name: '', mobile: '', category: '', remarks: '' }; }
}
const errorText = data => typeof data === 'string' ? data : Object.entries(data || {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : value}`).join(' ');

export default function ShareContact() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => readDraft(user?.id));
  const [existing, setExisting] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    const receiveShare = () => {
      if (window.location.hash) setForm(readDraft(user?.id));
    };
    window.addEventListener('hashchange', receiveShare);
    return () => window.removeEventListener('hashchange', receiveShare);
  }, [user?.id]);
  useEffect(() => {
    if (form.ownerId && user?.id && form.ownerId !== user.id) {
      setForm({ name: '', mobile: '', category: '', remarks: '' });
      return;
    }
    if (user?.id && !form.ownerId) {
      setForm(current => ({ ...current, ownerId: user.id }));
      return;
    }
    sessionStorage.setItem(draftKey, JSON.stringify({ ...form, ownerId: user?.id || form.ownerId }));
  }, [form, user?.id]);
  useEffect(() => {
    let active = true;
    setExisting(null); setError('');
    if (user?.role !== 'CONTRACTOR' || !form.category || !form.mobile.trim()) return;
    setChecking(true);
    const timer = setTimeout(() => {
      api.get('/call-inbox/shared-contact-lookup/', { params: { category: form.category, mobile: form.mobile } })
        .then(({ data }) => { if (active) setExisting(data.existing_url); })
        .catch(err => { if (active) setError(errorText(err.response?.data) || 'Could not check this contact. Check your connection and try Save again.'); })
        .finally(() => { if (active) setChecking(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); setChecking(false); };
  }, [form.category, form.mobile, user?.role]);

  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    if (!form.category) { setError('Select Painter or Customer.'); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const { data: checked } = await api.get('/call-inbox/shared-contact-lookup/', { params: { category: form.category, mobile: form.mobile } });
      if (checked.existing_url) { setExisting(checked.existing_url); return; }
      const painter = form.category === 'Painter';
      const { data } = await api.post(painter ? '/accounts/painter-contacts/' : '/quotations/customers/', painter
        ? { name: form.name, mobile: checked.mobile, remarks: form.remarks }
        : { name: form.name, mobile: checked.mobile, notes: form.remarks, contact_only: true });
      const path = data.existing_url || (painter ? `/painters/contacts/${data.id}` : `/customers/${data.id}`);
      if (data.already_saved) { setExisting(path); return; }
      sessionStorage.removeItem(draftKey);
      navigate(path);
    } catch (err) {
      setError(errorText(err.response?.data) || 'Contact was not saved. Check your connection and try again.');
    } finally { busy.current = false; setSaving(false); }
  }
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  return <main className="share-contact-page"><section className="share-contact-panel">
    <p className="share-contact-eyebrow">Bharath Apps · Shared contact</p>
    <h1>Review contact</h1><p>Choose where to save this contact. Shared details are unverified.</p>
    {form.importError && <p className="share-contact-error" role="alert">{form.importError}</p>}
    {!user ? <div className="share-contact-notice"><p>Sign in as a contractor to save this contact. Your draft will stay here.</p><Link to="/login" state={{ from: { pathname: '/share-contact' } }}>Sign in</Link></div>
      : user.role !== 'CONTRACTOR' ? <p role="alert">Only contractors can import contacts.</p>
        : <form onSubmit={save}>
          <fieldset disabled={saving}><legend className="sr-only">Contact review</legend>
            <label>Name<input name="name" value={form.name} onChange={change} required maxLength={150} autoComplete="name" /></label>
            <label>Mobile Number<input name="mobile" value={form.mobile} onChange={change} required maxLength={32} type="tel" autoComplete="tel" /></label>
            <fieldset className="share-contact-categories"><legend>Category</legend>{['Painter', 'Customer'].map(category => <label key={category}><input type="radio" name="category" value={category} checked={form.category === category} onChange={change} required />{category}</label>)}</fieldset>
            <label>Remarks <span>(optional)</span><textarea name="remarks" value={form.remarks} onChange={change} rows={3} /></label>
          </fieldset>
          {error && <p className="share-contact-error" role="alert">{error}</p>}
          {checking && <p role="status">Checking for existing contact…</p>}
          {existing ? <Link className="share-contact-save" to={existing}>View Existing Contact</Link> : <button className="share-contact-save" type="submit" disabled={saving || checking}>{saving ? 'Saving…' : 'Save Contact'}</button>}
        </form>}
  </section></main>;
}
