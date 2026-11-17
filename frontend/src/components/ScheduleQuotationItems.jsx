import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import QuotationDocumentItems, { QuotationDocumentItemDetails } from './QuotationDocumentItems';
import { QuotationLineItemPopup } from './QuotationLineItemPopup';
import { scheduleCategories, filterScheduleItems } from '../utils/scheduleCategory.js';
import '../pages/quotation-ui.css';

const money = value => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' }).format(Number(value || 0));

export default function ScheduleQuotationItems({ quotationId, role, onFilterItems }) {
  const [quotation, setQuotation] = useState(null), [error, setError] = useState('');
  const [category, setCategory] = useState(''), [selected, setSelected] = useState(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setQuotation(null); setError(''); setCategory(''); setSelected(null);
    const url = role === 'CUSTOMER' ? `/quotations/customer-portal/quotations/${quotationId}/` : `/quotations/${quotationId}/`;
    api.get(url).then(({data}) => { if (active) setQuotation(data); }).catch(() => { if (active) setError('Quotation items could not be loaded. Please try again.'); });
    return () => { active = false; };
  }, [quotationId, role, retry]);
  const items = useMemo(() => filterScheduleItems(quotation?.items || [], category), [quotation, category]);
  useEffect(() => { onFilterItems?.(category && quotation ? items.map(item => String(item.id)) : null); }, [category, quotation, items, onFilterItems]);
  const quotePath = role === 'CUSTOMER' ? `/customer-quotations/${quotationId}` : `/quotations/${quotationId}`;
  return <section className="quotation-items rounded-2xl border bg-white" aria-label="Scheduled quotation items">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b p-4 sm:p-6">
      <div><h2 className="font-bold bp-ui-section-heading">Quotation items</h2><p className="mt-1 text-sm text-slate-500">Original quotation lines, rates and specifications.</p></div>
      {quotation && <label className="grid gap-2 text-sm font-semibold">Service / Product Category<select aria-label="Service / Product Category" value={category} onChange={event => { setCategory(event.target.value); setSelected(null); }} className="min-h-11 max-w-full rounded-xl border px-3 py-2 bp-ui-control"><option value="">All categories</option>{scheduleCategories(quotation.items || []).map(([key,name]) => <option value={key} key={key}>{name}</option>)}</select></label>}
      <Link to={quotePath} className="min-h-11 py-3 text-sm font-semibold text-indigo-700 underline">Open full quotation</Link>
    </div>
    {error ? <div role="alert" className="p-6"><p>{error}</p><button type="button" className="mt-3 min-h-11 rounded-xl border px-4" onClick={() => setRetry(value=>value+1)}>Retry quotation items</button></div> : !quotation ? <p role="status" className="p-6">Loading quotation items…</p> : <>
      <p className="px-4 pt-4 text-sm text-slate-500" role="status">Showing {items.length} of {quotation.items?.length || 0} quotation items{category ? '. Work steps below use the same category.' : '.'}</p>
      {items.length ? <QuotationDocumentItems items={items} rooms={quotation.rooms || []} form={quotation} onView={item=>setSelected(item)} /> : <p className="p-6 text-slate-500">No quotation items match this category.</p>}
      <div className="ml-auto grid max-w-sm gap-3 p-4 sm:p-6" aria-label="Full quotation totals"><dl className="grid gap-3">{[['Subtotal',quotation.subtotal],['Discount',quotation.discount],['GST',quotation.gst_amount],['Grand total',quotation.grand_total]].map(([label,value])=><div key={label} className="flex justify-between gap-6"><dt>{label}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl><p className="text-xs text-slate-500">Full quotation totals remain unchanged by category filters.</p></div>
    </>}
    {selected && <QuotationLineItemPopup titleText="Quotation item" description="Scheduled work specification" onClose={()=>setSelected(null)} footer={<button type="button" className="min-h-11 rounded-xl border px-4" onClick={()=>setSelected(null)}>Close</button>}><QuotationDocumentItemDetails item={selected} rooms={quotation.rooms || []} form={quotation} /></QuotationLineItemPopup>}
  </section>;
}
