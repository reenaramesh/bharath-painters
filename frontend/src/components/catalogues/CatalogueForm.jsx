import { useEffect, useId, useRef, useState } from 'react';
import { FilePlus2, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';
import { confirmAction, cancelConfirmation } from '../../utils/confirmAction.js';
import { apiErrorMessage } from '../../utils/subcontract';
import useDraftUnsavedChanges from '../../hooks/useDraftUnsavedChanges';
import './catalogues.css';

export const CATALOGUE_TYPES = [
  ['PRODUCT_CATALOGUE', 'Product catalogue'], ['OUR_WORK', 'Our work'], ['BROCHURE', 'Brochure'],
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DETAIL_FIELDS = ['category', 'brand_vendor', 'description', 'document_type', 'service_category', 'product'];

function initialValues(item) {
  return {
    title: item?.title || '', category: item?.category || 'Other',
    brand_vendor: item?.brand_vendor || '', description: item?.description || '',
    document_type: item?.document_type || 'PRODUCT_CATALOGUE',
    service_category: String(item?.service_category || ''), product: String(item?.product || ''),
  };
}

async function allChoices(path, signal) {
  const rows = [];
  let params = {};
  do {
    const { data } = await api.get(path, { params, signal });
    rows.push(...(Array.isArray(data) ? data : data.results || []));
    if (!data.next) break;
    params = Object.fromEntries(new URL(data.next, window.location.origin).searchParams);
  } while (true);
  return rows;
}

/** mode: create | edit | replace. onSaved receives the authoritative catalogue DTO. */
export default function CatalogueForm({ mode = 'create', item, categories = [], onClose, onSaved }) {
  const replace = mode === 'replace';
  const edit = mode === 'edit';
  const [values, setValues] = useState(() => initialValues(item));
  const baseline = useRef(JSON.stringify(initialValues(item)));
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState(false);
  const [choices, setChoices] = useState({ categories: [], products: [] });
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [choicesError, setChoicesError] = useState('');
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const closing = useRef(false);
  const live = useRef(true);
  const owner = useRef({});
  const autoTitle = useRef('');
  const id = useId();
  const titleRef = useRef(null);
  const dirty = Boolean(file) || JSON.stringify(values) !== baseline.current;
  const allowNavigation = useDraftUnsavedChanges(dirty);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; cancelConfirmation(owner.current); };
  }, []);

  useEffect(() => {
    if (!details || replace) return;
    const controller = new AbortController();
    let active = true;
    setChoicesLoading(true); setChoicesError('');
    Promise.all([
      allChoices('/quotations/service-categories/', controller.signal),
      allChoices('/quotations/paint-types/', controller.signal),
    ]).then(([serviceCategories, products]) => {
      if (active) setChoices({ categories: serviceCategories.filter(row => row.is_active !== false), products: products.filter(row => row.is_active !== false) });
    }).catch(err => {
      if (active) setChoicesError(apiErrorMessage(err, 'Linked services and products could not be loaded.'));
    }).finally(() => { if (active) setChoicesLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [details, replace, retry]);

  function update(field, value) {
    setValues(current => ({ ...current, [field]: value,
      ...(field === 'service_category' && value !== current.service_category ? { product: '' } : {}),
    }));
  }

  function chooseFile(event) {
    const next = event.target.files?.[0];
    if (!next) return;
    const extensionValid = /\.(pdf|jpe?g|png|webp)$/i.test(next.name);
    if (!extensionValid || (next.type && next.type !== 'application/octet-stream' && !FILE_TYPES.has(next.type)) || next.size > MAX_FILE_SIZE || !next.size) {
      setFileError(`Choose a PDF, JPG, PNG or WebP file up to 10 MB. Empty files cannot be uploaded.${file ? ' Your previously selected file is still selected.' : ''}`);
      event.target.value = '';
      return;
    }
    setFileError(''); setError(''); setFile(next);
    if (!edit && !replace) {
      const title = next.name.replace(/\.[^.]+$/, '').slice(0, 180);
      const previousAutoTitle = autoTitle.current;
      setValues(current => ({ ...current, title: !current.title || current.title === previousAutoTitle ? title : current.title }));
      autoTitle.current = title;
    }
  }

  async function close() {
    if (busy.current || closing.current) return;
    closing.current = true;
    try {
      if (dirty && !await confirmAction({ question: 'Are you sure you want to discard these changes?', detail: values.title || item?.title || '', owner: owner.current })) return;
      if (!live.current) return;
      allowNavigation(); onClose();
    } finally { closing.current = false; }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy.current || closing.current) return;
    if (!replace && !values.title.trim()) { setError('Enter a title.'); titleRef.current?.focus(); return; }
    if (!edit && !file) { setFileError('Choose a file to upload.'); return; }
    if (replace && !item?.current_version?.id) { setError('The current file version is missing. Close this form and reload the library.'); return; }
    busy.current = true; setSaving(true); setError(''); setFileError('');
    try {
      let response;
      if (edit) {
        const normalized = {
          ...values, title: values.title.trim(), category: values.category.trim() || 'Other',
          service_category: values.service_category || null, product: values.product || null,
        };
        const initial = initialValues(item);
        const changes = Object.fromEntries(Object.entries(normalized).filter(([key]) => values[key] !== initial[key]));
        // Leave unchanged relationships alone, including links to retired master entries.
        response = Object.keys(changes).length ? await api.patch(`/quotations/catalogues/${item.id}/`, changes) : { data: item };
      } else {
        const body = new FormData();
        body.append('file', file);
        if (replace) body.append('expected_version', item.current_version.id);
        else Object.entries({ ...values, title: values.title.trim(), category: values.category.trim() || 'Other' }).forEach(([key, value]) => body.append(key, value));
        response = await api.post(replace ? `/quotations/catalogues/${item.id}/versions/` : '/quotations/catalogues/', body,
          { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      if (!live.current) return;
      allowNavigation();
      onSaved(response.data);
    } catch (err) {
      if (live.current) {
        if (DETAIL_FIELDS.some(field => Object.hasOwn(err.response?.data || {}, field))) setDetails(true);
        setError(apiErrorMessage(err, 'The catalogue could not be saved. Your entries are still here.'));
      }
    } finally {
      busy.current = false;
      if (live.current) setSaving(false);
    }
  }

  const categoryLabels = [...new Set(['Other', ...categories, values.category].filter(Boolean))];
  const products = choices.products.filter(row => !values.service_category || !row.service_category || String(row.service_category) === values.service_category);
  const title = replace ? 'Replace file' : edit ? 'Edit catalogue details' : 'Add catalogue';
  return <Dialog title={title} description={replace ? 'Future shares use the new file. Previously sent copies stay unchanged.' : 'Your library is private until you share a file with a customer.'}
    onClose={close} size="md" icon={replace ? RefreshCw : FilePlus2} popupProtection="handled" initialFocusRef={replace ? undefined : titleRef}>
    <form className="catalogue-form" onSubmit={submit} aria-busy={saving}>
      {replace && <p className="catalogue-form-context"><strong>{item.title}</strong><span>Current file: {item.current_version.file_name} · Version {item.current_version.version}</span></p>}
      {!replace && <label className="catalogue-field"><span>Title <span aria-hidden="true">*</span></span>
        <input className="bp-ui-control" ref={titleRef} value={values.title} maxLength={180} onChange={e => update('title', e.target.value)} required disabled={saving} />
      </label>}
      {!edit && <label className="catalogue-field"><span>{replace ? 'New file' : 'File'} <span aria-hidden="true">*</span></span>
        <input className="bp-ui-control catalogue-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          onChange={chooseFile} required={!file} disabled={saving} aria-invalid={Boolean(fileError)} aria-describedby={`${id}-file-help${fileError ? ` ${id}-file-error` : ''}`} />
        <small id={`${id}-file-help`}>PDF, JPG, PNG or WebP · Up to 10 MB{file ? ` · Selected: ${file.name}` : ''}</small>
        {fileError && <span id={`${id}-file-error`} className="catalogue-error" role="alert">{fileError}</span>}
      </label>}
      {!replace && <details className="catalogue-more" open={details} onToggle={e => setDetails(e.currentTarget.open)}>
        <summary>More details</summary>
        <div className="catalogue-form-grid">
          <label className="catalogue-field"><span>Category</span>
            <input className="bp-ui-control" list={`${id}-categories`} value={values.category} maxLength={100} onChange={e => update('category', e.target.value)} disabled={saving} />
            <datalist id={`${id}-categories`}>{categoryLabels.map(label => <option key={label} value={label} />)}</datalist>
            <small>Choose an existing label or enter your own.</small>
          </label>
          <label className="catalogue-field"><span>Document type</span><select className="bp-ui-control" value={values.document_type} onChange={e => update('document_type', e.target.value)} disabled={saving}>
            {CATALOGUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="catalogue-field catalogue-full"><span>Brand / vendor</span><input className="bp-ui-control" value={values.brand_vendor} maxLength={160} onChange={e => update('brand_vendor', e.target.value)} disabled={saving} /></label>
          <label className="catalogue-field catalogue-full"><span>Description</span><textarea className="bp-ui-control" rows={3} value={values.description} onChange={e => update('description', e.target.value)} disabled={saving} /></label>
          {choicesLoading && <p className="catalogue-full" role="status">Loading services and products…</p>}
          {choicesError && <div className="catalogue-full catalogue-error" role="alert">{choicesError} <Button size="sm" variant="quiet" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>}
          <label className="catalogue-field"><span>Linked service category</span><select className="bp-ui-control" value={values.service_category} onChange={e => update('service_category', e.target.value)} disabled={saving || choicesLoading || Boolean(choicesError)}>
            <option value="">None</option>
            {values.service_category && !choices.categories.some(row => String(row.id) === values.service_category) && <option value={values.service_category}>Current category</option>}
            {choices.categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label className="catalogue-field"><span>Linked product</span><select className="bp-ui-control" value={values.product} onChange={e => update('product', e.target.value)} disabled={saving || choicesLoading || Boolean(choicesError)}>
            <option value="">None</option>
            {values.product && !products.some(row => String(row.id) === values.product) && <option value={values.product}>Current product</option>}
            {products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
        </div>
      </details>}
      {error && <p className="catalogue-error" role="alert">{error}</p>}
      <footer className="catalogue-form-footer"><Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{saving ? 'Saving…' : replace ? 'Replace file' : edit ? 'Save details' : 'Add catalogue'}</Button>
      </footer>
    </form>
  </Dialog>;
}
