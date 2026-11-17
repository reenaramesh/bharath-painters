import { useEffect, useId, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Download, Eye, FileImage, FileText, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Send, Share2 } from 'lucide-react';
import api from '../../api/client';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from '../ui';
import { confirmAction, cancelConfirmation } from '../../utils/confirmAction.js';
import { apiErrorMessage } from '../../utils/subcontract';
import { previewCatalogue, downloadCatalogue, shareCatalogueFile } from '../../utils/catalogueFiles.js';
import CatalogueForm, { CATALOGUE_TYPES } from './CatalogueForm';
import CatalogueShareDialog from './CatalogueShareDialog';
import './catalogues.css';

const typeLabel = type => CATALOGUE_TYPES.find(([value]) => value === type)?.[1] || 'Catalogue';
const formatLabel = type => ({ 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }[type] || 'File');
const fileSize = size => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil((size || 0) / 1024))} KB`;
const updatedDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function CatalogueLibrary() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState(null);
  const [shareItems, setShareItems] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const busy = useRef(false);
  const live = useRef(true);
  const owner = useRef({});
  const menuRef = useRef(null);
  const menuTrigger = useRef(null);
  const selectAllRef = useRef(null);
  const id = useId();
  const pending = loading || search !== query;
  const selectedItems = items.filter(item => selected.includes(item.id) && !item.is_archived);
  const selectable = items.filter(item => !item.is_archived).slice(0, 5);
  const allSelected = selectable.length > 0 && selectable.every(item => selected.includes(item.id));

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; cancelConfirmation(owner.current); };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(''); setSelected([]); setMenu(null);
    api.get('/quotations/catalogues/', { params: { search: query, category, document_type: documentType, archived: archived ? 1 : 0 }, signal: controller.signal })
      .then(({ data }) => {
        if (!active) return;
        setItems(data.results || []);
        setCategories(data.categories || []);
      }).catch(err => {
        if (active) setError(apiErrorMessage(err, 'Your library could not be loaded. Please try again.'));
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [query, category, documentType, archived, retry]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedItems.length > 0 && !allSelected;
  }, [selectedItems.length, allSelected]);

  useEffect(() => {
    if (menu === null) return;
    function outside(event) {
      if (!menuRef.current?.contains(event.target) && !menuTrigger.current?.contains(event.target)) setMenu(null);
    }
    function escape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setMenu(null); menuTrigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);

  function changeFilter(setter, value) {
    setter(value); setSelected([]); setMenu(null); setActionError(''); setNotice('');
  }

  function toggleSelection(item) {
    if (item.is_archived || pending) return;
    setSelected(current => current.includes(item.id) ? current.filter(value => value !== item.id) : current.length < 5 ? [...current, item.id] : current);
  }

  function openForm(mode, item) {
    if (menu !== null) menuTrigger.current?.focus();
    setMenu(null); setActionError(''); setForm({ mode, item });
  }

  async function fileAction(action, item) {
    if (busy.current || pending) return;
    if (menu !== null) menuTrigger.current?.focus();
    busy.current = true; setBusyId(item.id); setMenu(null); setActionError(''); setNotice('');
    try {
      const result = await action(item);
      if (live.current && result?.notice) setNotice(result.notice);
    }
    catch (err) { if (live.current) setActionError(apiErrorMessage(err, 'The file could not be opened. Please try again.')); }
    finally { busy.current = false; if (live.current) setBusyId(null); }
  }

  async function toggleArchive(item) {
    if (busy.current || pending) return;
    if (menu !== null) menuTrigger.current?.focus();
    busy.current = true; setBusyId(item.id); setMenu(null); setActionError(''); setNotice('');
    try {
      const next = !item.is_archived;
      if (next && !await confirmAction({ question: 'Are you sure you want to archive this catalogue?', detail: item.title, owner: owner.current })) return;
      if (!live.current) return;
      await api.patch(`/quotations/catalogues/${item.id}/`, { is_archived: next });
      if (!live.current) return;
      setSelected(current => current.filter(value => value !== item.id));
      setNotice(next ? 'Catalogue archived. Previously sent copies are unchanged.' : 'Catalogue restored.');
      setRetry(n => n + 1);
    } catch (err) { if (live.current) setActionError(apiErrorMessage(err, 'The catalogue could not be updated. Please try again.')); }
    finally { busy.current = false; if (live.current) setBusyId(null); }
  }

  function saved() {
    const mode = form?.mode;
    setForm(null); setSelected([]); setRetry(n => n + 1);
    setNotice(mode === 'replace' ? 'File replaced. Previously sent copies are unchanged.' : mode === 'edit' ? 'Catalogue details saved.' : 'Catalogue added to your library.');
  }

  const filtered = Boolean(search || category || documentType);
  return <section className="catalogue-library" aria-label="Catalogue library">
    <PageHeader eyebrow="Services & rates" title="Catalogue library" description="Keep product catalogues, brochures and examples of your work ready to share."
      actions={<Button onClick={() => openForm('create')}><Plus size={17} aria-hidden="true" />Add catalogue</Button>} />
    <div className="catalogue-filterbar">
      <label className="catalogue-search"><span className="catalogue-sr-only">Search catalogues</span><Search size={17} aria-hidden="true" />
        <input className="bp-ui-control" type="search" value={search} onChange={e => changeFilter(setSearch, e.target.value)} placeholder="Search title, brand or description" />
      </label>
      <label className="catalogue-filter"><span>Category</span><select className="bp-ui-control" value={category} onChange={e => changeFilter(setCategory, e.target.value)}>
        <option value="">All categories</option>
        {[...new Set([...categories, category].filter(Boolean))].map(label => <option key={label} value={label}>{label}</option>)}
      </select></label>
      <label className="catalogue-filter"><span>Type</span><select className="bp-ui-control" value={documentType} onChange={e => changeFilter(setDocumentType, e.target.value)}>
        <option value="">All types</option>{CATALOGUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="catalogue-filter"><span>Show</span><select className="bp-ui-control" value={archived ? 'archived' : 'active'} onChange={e => changeFilter(setArchived, e.target.value === 'archived')}>
        <option value="active">Active</option><option value="archived">Archived</option>
      </select></label>
      {filtered && <Button size="sm" variant="quiet" onClick={() => { setSearch(''); setQuery(''); setCategory(''); setDocumentType(''); setSelected([]); }}>Clear filters</Button>}
    </div>
    <div className="catalogue-selectionbar">
      <p role="status" aria-live="polite">{archived ? 'Archived files can be restored, previewed or downloaded.' : selectedItems.length ? `${selectedItems.length} of 5 selected` : 'Select up to 5 files to share with a customer.'}</p>
      {!archived && <Button size="sm" variant="secondary" disabled={!selectedItems.length || pending || Boolean(error) || busyId !== null} onClick={() => setShareItems(selectedItems)}><Send size={16} aria-hidden="true" />Share{selectedItems.length ? ` (${selectedItems.length})` : ''}</Button>}
    </div>
    {notice && <p className="catalogue-notice" role="status">{notice}</p>}
    {actionError && <p className="catalogue-error catalogue-notice" role="alert">{actionError}</p>}
    <div className="catalogue-results" aria-busy={pending}>
      {pending ? <LoadingState label="Loading your catalogue library…" /> : error ? <ErrorState message={error} onRetry={() => setRetry(n => n + 1)} /> : !items.length ? <><EmptyState
        title={filtered ? 'No matching catalogues' : archived ? 'No archived catalogues' : 'Your library is ready for its first file'}
        description={filtered ? 'Try another search or clear your filters.' : archived ? 'Archived files will appear here. Previously sent copies remain available.' : 'Add a product catalogue, brochure or example of your work.'}
        />{!archived && !filtered && <div className="catalogue-empty-action"><Button onClick={() => openForm('create')}>Add catalogue</Button></div>}</> : <>
        <div className="catalogue-list-heading"><span>{!archived && <input ref={selectAllRef} type="checkbox" checked={allSelected}
          onChange={() => setSelected(allSelected ? [] : selectable.map(item => item.id))} aria-label="Select first five catalogues" />}</span><span>Catalogue</span><span>Category / type</span><span>Updated</span><span>Actions</span></div>
        {!archived && <Button className="catalogue-mobile-select" size="sm" variant="quiet" onClick={() => setSelected(allSelected ? [] : selectable.map(item => item.id))}>{allSelected ? 'Clear selection' : 'Select first 5'}</Button>}
        <ul className="catalogue-list" aria-label={archived ? 'Archived catalogues' : 'Active catalogues'}>{items.map(item => {
          const version = item.current_version;
          const isSelected = selected.includes(item.id);
          const FileIcon = version?.content_type?.startsWith('image/') ? FileImage : FileText;
          return <li className={`catalogue-row${isSelected ? ' catalogue-row-selected' : ''}`} key={item.id}>
            <div className="catalogue-row-selection">{!item.is_archived && <input type="checkbox" checked={isSelected} disabled={!isSelected && selected.length >= 5}
              onChange={() => toggleSelection(item)} aria-label={`Select ${item.title}`} />}</div>
            <div className="catalogue-row-main"><span className="catalogue-file-icon"><FileIcon size={21} aria-hidden="true" /></span><div>
              <button type="button" className="catalogue-title" onClick={() => fileAction(previewCatalogue, item)} disabled={!version} aria-disabled={busyId !== null}>{item.title}</button>
              <p>{item.brand_vendor && <span>{item.brand_vendor} · </span>}{version ? `${formatLabel(version.content_type)} · ${version.file_name} · ${fileSize(version.size)} · v${version.version}` : 'No file available'}</p>
            </div></div>
            <div className="catalogue-row-category"><span>{item.category || 'Other'}</span><small>{typeLabel(item.document_type)}</small></div>
            <div className="catalogue-row-date"><span className="catalogue-card-label">Updated </span><time dateTime={item.updated_at}>{updatedDate(item.updated_at)}</time></div>
            <div className="catalogue-row-actions" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(current => current === item.id ? null : current); }}>
              {!item.is_archived && <Button size="sm" variant="quiet" disabled={!version || busyId !== null} onClick={() => setShareItems([item])}><Send size={15} aria-hidden="true" />Share</Button>}
              <button type="button" className="catalogue-menu-trigger" aria-label={`Actions for ${item.title}`} aria-expanded={menu === item.id} aria-controls={`${id}-actions-${item.id}`}
                aria-disabled={busyId !== null} onClick={event => { if (busy.current) return; menuTrigger.current = event.currentTarget; setMenu(current => current === item.id ? null : item.id); }}><MoreHorizontal size={20} aria-hidden="true" /></button>
              {menu === item.id && <div className="catalogue-row-menu" id={`${id}-actions-${item.id}`} ref={menuRef}>
                <button type="button" disabled={!version} onClick={() => fileAction(previewCatalogue, item)}><Eye size={16} aria-hidden="true" />Preview</button>
                <button type="button" onClick={() => openForm('edit', item)}><Pencil size={16} aria-hidden="true" />Edit details</button>
                {!item.is_archived && <button type="button" onClick={() => openForm('replace', item)}><RefreshCw size={16} aria-hidden="true" />Replace file</button>}
                <button type="button" disabled={!version} onClick={() => fileAction(downloadCatalogue, item)}><Download size={16} aria-hidden="true" />Download</button>
                {!item.is_archived && <button type="button" disabled={!version} onClick={() => fileAction(shareCatalogueFile, item)}><Share2 size={16} aria-hidden="true" />Share file…</button>}
                <button type="button" onClick={() => toggleArchive(item)}>{item.is_archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}{item.is_archived ? 'Restore' : 'Archive'}</button>
              </div>}
              {busyId === item.id && <span className="catalogue-sr-only" role="status">Working…</span>}
            </div>
          </li>;
        })}</ul>
      </>}
    </div>
    {form && <CatalogueForm key={`${form.mode}-${form.item?.id || 'new'}`} {...form} categories={categories} onClose={() => setForm(null)} onSaved={saved} />}
    {shareItems && <CatalogueShareDialog items={shareItems} onClose={() => setShareItems(null)} onSent={() => { setShareItems(null); setSelected([]); setNotice('Catalogues sent to the customer.'); }} />}
  </section>;
}
