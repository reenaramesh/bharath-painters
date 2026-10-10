import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';
import WorkOrderPricingFields from './WorkOrderPricingFields';
import { approvedQuotationStatuses, initialWorkOrderPricing, workOrderPricingPayload } from '../utils/workOrderPricing';
import { apiErrorMessage, connectionCounterparty } from '../utils/subcontract';
import { offerPayload, offerServices, sendScopeOffer } from '../utils/subcontractOffer';

const control = 'w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2.5';

export default function CreateSubcontractOffer({ initialQuotation = '', initialContractor = '', onClose, onCreated }) {
  const [priced, setPriced] = useState(true);
  const [sourceItems, setSourceItems] = useState([]);
  const [pricing, setPricing] = useState(() => initialWorkOrderPricing([]));
  const [quotations, setQuotations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ quotation: initialQuotation, receiving_contractor: '', project_title: '', site_address: '', agreed_scope_summary: '', instructions: '', terms: '', required_start_date: '', required_end_date: '' });
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const busyRef = useRef(false);
  const creationKey = useRef(crypto.randomUUID());
  const draftRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { dialog.close(); opener?.focus(); };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setCatalogueError('');
    Promise.all([
      api.get('/quotations/', { params: { include_converted: 1 } }),
      api.get('/quotations/contractor-connections/', { params: { status: 'CONNECTED' } }),
    ]).then(([quotes, contacts]) => {
      if (!active) return;
      const rows = Array.isArray(quotes.data) ? quotes.data : quotes.data?.results || [];
      if(initialQuotation && rows.some(row=>String(row.id)===String(initialQuotation) && !approvedQuotationStatuses.includes(row.status)))setPriced(false);
      setQuotations(rows.filter(row => !['CANCELLED', 'REJECTED'].includes(row.status)));
      setConnections(Array.isArray(contacts.data) ? contacts.data : contacts.data?.results || []);
      const contactsList=Array.isArray(contacts.data)?contacts.data:contacts.data?.results||[];
      if(initialContractor && contactsList.some(row=>row.can_send_work_order && String(connectionCounterparty(row).id)===String(initialContractor))) setForm(current=>({...current,receiving_contractor:current.receiving_contractor || String(initialContractor)}));
    }).catch(err => { if (active) setCatalogueError(apiErrorMessage(err, 'Quotations and contractors could not be loaded.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload,initialContractor,initialQuotation]);

  useEffect(() => {
    let active = true;
    setServices([]); setSelected([]); setServicesError('');
    if (!form.quotation) { setServicesLoading(false); return () => { active = false; }; }
    setServicesLoading(true);
    api.get(`/quotations/${form.quotation}/`).then(({ data }) => {
      if (!active) return;
      setServices(offerServices(data));
      setSourceItems(data.items || []);
      setPricing(initialWorkOrderPricing(data.items || []));
      setForm(current => ({ ...current, project_title: current.project_title || data.property_name || data.quotation_number || 'Subcontract work' }));
    }).catch(err => { if (active) setServicesError(apiErrorMessage(err, 'Quotation services could not be loaded.')); })
      .finally(() => { if (active) setServicesLoading(false); });
    return () => { active = false; };
  }, [form.quotation, reload]);

  const update = event => { const { name, value } = event.target; setForm(current => ({ ...current, [name]: value })); };
  const selectedServices = services.filter(item => selected.includes(item.id));
  const grouped = Object.groupBy(services, item => item.category);
  const close = () => { if (!busyRef.current) onClose(); };
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true); setError('');
    try {
      if (priced) {
        const { data } = await api.post('/outsourcing/work-orders/', {...offerPayload(form, selected), creation_key:creationKey.current, terms:form.terms, material_mode:pricing.material_mode, pricing_input:workOrderPricingPayload(sourceItems,selected,pricing)});
        onCreated(data);
        return;
      }
      await sendScopeOffer(api, offerPayload(form, selected), draftRef.current, id => { draftRef.current = id; setDraftId(id); });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'The scope offer could not be sent.'));
    } finally { busyRef.current = false; setSaving(false); }
  }

  return <dialog ref={dialogRef} aria-labelledby="subcontract-offer-title" onCancel={event => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6">
    <header className="mb-5 flex items-start justify-between gap-3">
      <div><h2 id="subcontract-offer-title" className="text-xl font-bold">Offer work to a subcontractor</h2><p className="mt-1 text-sm text-slate-600">Share selected services and quantities without your customer's prices.</p></div>
      <button type="button" disabled={saving} onClick={close} aria-label="Close work offer" className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-slate-100"><X size={20} /></button>
    </header>
    {loading && <p role="status">Loading quotations and connected contractors…</p>}
    {catalogueError && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{catalogueError}<button type="button" onClick={() => setReload(n => n + 1)} className="ml-3 min-h-11 underline">Retry</button></div>}
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={saving || Boolean(draftId) || loading || Boolean(catalogueError)} className="min-w-0 space-y-4">
        <Field label="Preparation"><select className={control} value={priced ? "PRICED" : "SCOPE"} onChange={event=>{setPriced(event.target.value === "PRICED");setForm(current=>({...current,quotation:""}));}}><option value="PRICED">Priced Work Order Draft</option><option value="SCOPE">Request subcontractor quotation (existing flow)</option></select></Field>
        <Field label="Quotation"><select required name="quotation" value={form.quotation} onChange={event => { const quotation = event.target.value; setServices([]); setSelected([]); setServicesLoading(Boolean(quotation)); setForm(current => ({ ...current, quotation, project_title: '', agreed_scope_summary: '' })); }} className={control}>
          <option value="">Choose a quotation</option>{quotations.filter(row=>!priced || approvedQuotationStatuses.includes(row.status)).map(row => <option key={row.id} value={row.id}>{[row.quotation_number || `#${row.id}`, row.customer_name, row.property_name].filter(Boolean).join(' · ')}</option>)}
        </select></Field>
        {!loading && !catalogueError && !quotations.some(row=>!priced || approvedQuotationStatuses.includes(row.status)) && <p role="status" className="text-sm text-amber-800">No eligible quotations are available. Priced Work Orders require an approved quotation.</p>}
        <Field label="Subcontractor"><select required name="receiving_contractor" value={form.receiving_contractor} onChange={update} className={control}>
          <option value="">Choose a connected contractor</option>{connections.map(row => { const other = connectionCounterparty(row); return <option key={row.id} value={other.id}>{other.label}</option>; })}
        </select></Field>
        {!loading && !catalogueError && !connections.length && <p role="status" className="text-sm text-amber-800">Connect with a subcontractor in Contractor Network first.</p>}
        {form.quotation && <fieldset className="min-w-0 rounded-xl border p-4"><legend className="px-2 font-semibold">Services for this subcontractor</legend>
          <p className="mb-3 text-sm text-slate-600">Select only the work they will handle. Customer rates and totals are excluded.</p>
          {servicesLoading ? <p role="status">Loading quotation services…</p> : servicesError ? <p role="alert" className="text-red-700">{servicesError}<button type="button" onClick={() => setReload(n => n + 1)} className="ml-3 min-h-11 underline">Retry</button></p> : !services.length ? <p role="status">This quotation has no service lines. Add services to the quotation first.</p> : Object.entries(grouped).map(([category, items]) => <div key={category} className="mb-4 last:mb-0"><h3 className="mb-2 text-sm font-bold">{category}</h3>{items.map(item => <label key={item.id} className="flex min-h-11 items-start gap-3 rounded-lg py-2">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={event => { const checked = event.target.checked; setSelected(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); }} className="mt-1 h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words"><strong>{item.title}</strong><span className="block text-sm text-slate-600">{[item.service, `${item.quantity} ${item.unit}`].filter(Boolean).join(' · ')}</span></span>
          </label>)}</div>)}
        </fieldset>}
        {priced && selected.length > 0 && <WorkOrderPricingFields items={sourceItems} selected={selected} pricing={pricing} onChange={setPricing} />}
        <Field label="Work title"><input required name="project_title" value={form.project_title} onChange={update} maxLength={200} className={control} /></Field>
        <Field label="Site address"><textarea name="site_address" value={form.site_address} onChange={update} rows={2} className={control} /></Field>
        <Field label="Scope notes"><textarea name="agreed_scope_summary" value={form.agreed_scope_summary} onChange={update} rows={2} placeholder="What is included, excluded, and who supplies materials" className={control} /></Field>
        {priced && <Field label="Work Order terms"><textarea name="terms" value={form.terms} onChange={update} rows={2} className={control} /></Field>}
        <Field label="Instructions"><textarea name="instructions" value={form.instructions} onChange={update} rows={2} className={control} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Required from"><input type="date" name="required_start_date" value={form.required_start_date} onChange={update} className={control} /></Field><Field label="Required by"><input type="date" name="required_end_date" value={form.required_end_date} min={form.required_start_date || undefined} onChange={update} className={control} /></Field></div>
      </fieldset>
      {!priced && selectedServices.length > 0 && <section aria-label="Offer summary" className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">Offer summary · {selectedServices.length} services</h3><ul className="mt-2 space-y-1 text-sm">{selectedServices.map(item => <li key={item.id} className="break-words">{item.title} · {item.quantity} {item.unit}</li>)}</ul><p className="mt-3 text-sm text-slate-600">No customer prices are shared. The subcontractor can submit their own quotation.</p></section>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      {draftId && <p role="status" className="text-sm text-amber-800">The draft is saved. Retry sending it, or find it in your work orders after closing.</p>}
      <footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={close} className="min-h-11 rounded-xl border px-4 font-semibold">{draftId ? 'Close' : 'Cancel'}</button><button disabled={saving || loading || servicesLoading || Boolean(catalogueError) || Boolean(servicesError) || !connections.length || !selected.length} className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : priced ? 'Save Work Order Draft' : draftId ? 'Retry sending offer' : 'Send scope offer'}</button></footer>
    </form>
  </dialog>;
}

function Field({ label, children }) { return <label className="block min-w-0"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}</label>; }
