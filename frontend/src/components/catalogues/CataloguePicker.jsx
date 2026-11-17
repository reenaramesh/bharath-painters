import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/client';
import useAuth from '../../context/useAuth';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';
import { catalogueApiUrl } from '../../utils/catalogueFiles';
import './catalogue-sharing.css';

const TYPES = { PRODUCT_CATALOGUE: 'Product catalogue', OUR_WORK: 'Our work', BROCHURE: 'Brochure' };
const keyOf = value => String(value);

export default function CataloguePicker({ initialSelection = [], limit = 5, onClose, onSelect }) {
  const { user } = useAuth();
  const owner = useRef(user?.id);
  const initial = useRef(new Map(initialSelection.map(item => [keyOf(item.id), item])));
  const [selected, setSelected] = useState(() => [...initial.current.keys()]);
  const [expectedVersions, setExpectedVersions] = useState(() => new Map(initialSelection.map(item => [keyOf(item.id), keyOf(item.current_version?.id)])));
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const max = Math.max(0, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 5);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      let response = await api.get('/quotations/catalogues/', { params: { archived: 0 } });
      if (request !== generation.current) return;
      const all = [];
      const labels = new Set();
      const visited = new Set();
      while (response) {
        const data = response.data;
        const entries = Array.isArray(data) ? data : data.results;
        if (!Array.isArray(entries)) throw new Error('Unexpected catalogue response');
        all.push(...entries.filter(item => !item.is_archived));
        for (const label of data.categories || []) labels.add(label);
        if (!data.next) break;
        const next = catalogueApiUrl(data.next);
        if (visited.has(next) || visited.size >= 100) throw new Error('Catalogue pages could not be loaded');
        visited.add(next);
        response = await api.get(next);
        if (request !== generation.current) return;
      }
      if (request !== generation.current) return;
      const unique = [...new Map(all.map(item => [keyOf(item.id), item])).values()];
      for (const item of unique) if (item.category) labels.add(item.category);
      setItems(unique);
      setCategories([...labels].sort((a, b) => String(a).localeCompare(String(b))));
    } catch {
      if (request === generation.current) setError('Your private catalogue library could not be loaded. Retry before choosing files.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (owner.current !== user?.id) {
      owner.current = user?.id;
      initial.current.clear();
      setItems([]);
      setCategories([]);
      setSelected([]);
      setExpectedVersions(new Map());
    }
    if (user?.id) load();
    else { setLoading(false); setError('Sign in to load your private catalogue library.'); }
    return () => { generation.current += 1; };
  }, [load, user?.id]);
  const current = useMemo(() => new Map(items.map(item => [keyOf(item.id), item])), [items]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter(item => (!category || item.category === category)
      && (!documentType || item.document_type === documentType)
      && (!query || [item.title, item.category, item.brand_vendor, item.description].some(value => String(value || '').toLocaleLowerCase().includes(query))));
  }, [items, search, category, documentType]);
  const issueFor = id => {
    const item = current.get(id);
    if (!item || item.is_archived || !item.current_version?.id) return 'This file is unavailable or archived. Remove it or refresh the library.';
    if (expectedVersions.get(id) !== keyOf(item.current_version.id)) return 'A newer file version is available. Choose the latest version or remove it.';
    return '';
  };
  const hasIssues = selected.some(issueFor);
  function toggle(item) {
    const id = keyOf(item.id);
    setSelectionError('');
    if (selected.includes(id)) { setSelected(values => values.filter(value => value !== id)); return; }
    if (selected.length >= max) { setSelectionError(`Choose up to ${max} files. Remove one before adding another.`); return; }
    setExpectedVersions(values => new Map(values).set(id, keyOf(item.current_version?.id)));
    setSelected(values => [...values, id]);
  }
  async function choose() {
    if (busy.current || loading || error || hasIssues || selected.length > max) return;
    busy.current = true;
    setChoosing(true);
    setSelectionError('');
    const request = generation.current;
    try {
      const result = await onSelect(selected.map(id => current.get(id)));
      if (request !== generation.current) return;
      if (result === false) { setSelectionError('These files could not be selected. Please retry.'); return; }
      onClose();
    } catch {
      if (request === generation.current) setSelectionError('These files could not be selected. Your selection is still here; please retry.');
    } finally {
      busy.current = false;
      if (request === generation.current) setChoosing(false);
    }
  }
  return <Dialog title="Choose catalogue files" description={`Choose up to ${max} files from your private library.`} size="lg" popupProtection="readonly" onClose={() => { if (!busy.current) onClose(); }}>
    <div className="catalogue-sharing" aria-busy={loading || choosing}>
      <div className="catalogue-filters">
        <label>Search library<input type="search" value={search} disabled={choosing} onChange={event => setSearch(event.target.value)} placeholder="Title, brand or description" /></label>
        <label>Category<select value={category} disabled={choosing} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Document type<select value={documentType} disabled={choosing} onChange={event => setDocumentType(event.target.value)}><option value="">All types</option>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p role="status" aria-live="polite" className="catalogue-meta">{selected.length} of {max} selected. Selections stay when you filter.</p>
      {selected.length > 0 && <section aria-label="Selected catalogue files"><ul className="catalogue-selected">{selected.map(id => {
        const item = current.get(id) || initial.current.get(id);
        const issue = !loading && !error ? issueFor(id) : '';
        return <li key={id}><div className="catalogue-copy"><strong>{item?.title || 'Unavailable file'}</strong>{issue && <small className="catalogue-error">{issue}</small>}</div><div className="catalogue-actions">
          {issue && current.get(id)?.current_version?.id && <Button type="button" variant="secondary" disabled={choosing} onClick={() => setExpectedVersions(values => new Map(values).set(id, keyOf(current.get(id).current_version.id)))}>Use latest version</Button>}
          <Button type="button" variant="quiet" disabled={choosing} aria-label={`Remove ${item?.title || 'unavailable file'} from selection`} onClick={() => setSelected(values => values.filter(value => value !== id))}>Remove selection</Button>
        </div></li>;
      })}</ul></section>}
      {selectionError && <p role="alert" className="catalogue-error">{selectionError}</p>}
      {selected.length > max && <p role="alert" className="catalogue-error">Remove files until no more than {max} are selected.</p>}
      {loading ? <p role="status" className="catalogue-state">Loading your library…</p>
        : error ? <div role="alert" className="catalogue-state"><p className="catalogue-error">{error}</p><Button type="button" variant="secondary" onClick={load}>Retry library</Button></div>
          : !items.length ? <p className="catalogue-state">Your library has no active files. Add a catalogue, brochure or work example in your catalogue library, then return here.</p>
            : !filtered.length ? <div className="catalogue-state"><p>No files match these filters.</p><Button type="button" variant="secondary" onClick={() => { setSearch(''); setCategory(''); setDocumentType(''); }}>Clear filters</Button></div>
              : <ul className="catalogue-list" aria-label="Catalogue library">{filtered.map(item => {
                const checked = selected.includes(keyOf(item.id));
                return <li key={item.id}><label className="catalogue-choice"><input type="checkbox" checked={checked} disabled={choosing || !item.current_version?.id || (!checked && selected.length >= max)} onChange={() => toggle(item)} /><span className="catalogue-copy"><strong>{item.title}</strong><small>{[TYPES[item.document_type], item.category, item.brand_vendor].filter(Boolean).join(' · ')}</small><small>{item.current_version ? `${item.current_version.file_name} · Version ${item.current_version.version}` : 'No file available'}</small></span></label></li>;
              })}</ul>}
      <div className="catalogue-actions"><Button type="button" variant="secondary" disabled={choosing || loading} onClick={load}>Refresh library</Button><Button type="button" variant="secondary" disabled={choosing} onClick={onClose}>Cancel</Button><Button type="button" disabled={choosing || loading || Boolean(error) || hasIssues || selected.length > max} onClick={choose}>{choosing ? 'Choosing…' : `Use ${selected.length} ${selected.length === 1 ? 'file' : 'files'}`}</Button></div>
    </div>
  </Dialog>;
}
