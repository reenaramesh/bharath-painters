import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import useDraftUnsavedChanges from '../hooks/useDraftUnsavedChanges';
import { FormField, SectionCard } from './ui';
import { previewPdf } from './PdfPreview';
import WorkOrderPricingFields from './WorkOrderPricingFields';
import { initialWorkOrderMargins, workOrderMoney, workOrderPricingPayload } from '../utils/workOrderPricing';
import { apiErrorMessage } from '../utils/subcontract';

export default function WorkOrderPricingPanel({ workOrder, isMain, onChanged, onEditing }) {
 const [editing,setEditing]=useState(false), [items,setItems]=useState([]), [selected,setSelected]=useState([]);
 const [pricing,setPricing]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
 const [metadata,setMetadata]=useState({});
 const [conversionConfirmed,setConversionConfirmed]=useState(false);
 const guard=useRef(false);
 useDraftUnsavedChanges(editing);
 useEffect(()=>{onEditing?.(editing);return()=>onEditing?.(false);},[editing,onEditing]);

 async function edit(){setBusy(true);setError('');try{const {data}=workOrder.private_pricing?.source_snapshot ? {data:{items:workOrder.private_pricing.source_snapshot.items}} : await api.get(`/quotations/${workOrder.quotation}/`);setMetadata(Object.fromEntries(['project_title','site_address','agreed_scope_summary','instructions','terms','required_start_date','required_end_date'].map(key=>[key,workOrder[key] || ''])));setItems(data.items || []);setSelected((data.items || []).map(item=>item.id));setPricing(initialWorkOrderMargins(data.items || [],workOrder,data));setConversionConfirmed(Boolean(workOrder.private_pricing?.margin));setEditing(true);}catch(err){setError(apiErrorMessage(err,'Source revision could not be loaded.'));}finally{setBusy(false);}}
 async function save(event){event.preventDefault();if(guard.current || !conversionConfirmed)return;guard.current=true;setBusy(true);setError('');try{await api.patch(`/outsourcing/work-orders/${workOrder.id}/draft-pricing/`,{...metadata,required_start_date:metadata.required_start_date || null,required_end_date:metadata.required_end_date || null,expected_updated_at:workOrder.updated_at,quotation_item_ids:selected,material_mode:pricing.material_mode,pricing_input:workOrderPricingPayload(items,selected,pricing)});setEditing(false);setMessage('Work Order Draft saved.');onChanged();}catch(err){setError(apiErrorMessage(err,'Draft could not be saved. Your saved values are unchanged.'));}finally{guard.current=false;setBusy(false);}}
 async function pdf(){setBusy(true);setError('');try{const {data}=await api.get(`/outsourcing/work-orders/${workOrder.id}/pdf/`,{responseType:'blob'});previewPdf(data,`${workOrder.reference}.pdf`);}catch(err){setError(apiErrorMessage(err,'PDF could not be loaded.'));}finally{setBusy(false);}}
 async function share(){try{const url=window.location.href;if(navigator.share)await navigator.share({title:workOrder.reference,url});else{await navigator.clipboard.writeText(url);setMessage('Recipient link copied. Sign-in is required.');}}catch{setError('Sharing was cancelled or unavailable. Copy this page address to the recipient.');}}
 const quote=workOrder.pricing_quote;
 const site=workOrder.site_details;
 return <SectionCard title="Agreed Work Order pricing">
  <p className="mb-3 text-sm text-slate-600">{workOrder.material_mode==='WITH_MATERIAL'?'With Material':'Without Material'} · Source revision {workOrder.source_revision_number}</p>
  {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  {message && <p role="status" className="mb-3 text-sm text-emerald-800">{message}</p>}
  {site && <div className="mb-4 space-y-2 text-sm"><p>{site.address || site.approximate_location || 'Site locality is not available.'}</p>{site.site_pin && <a className="inline-flex min-h-11 items-center font-semibold underline" href={site.site_pin} target="_blank" rel="noopener noreferrer">View site pin</a>}{site.customer_contact && <p>Customer contact: {Object.values(site.customer_contact).filter(Boolean).join(' \u00b7 ')}</p>}</div>}
  {!editing && workOrder.pricing_adjustment && <details className="my-3"><summary className="min-h-11 cursor-pointer font-semibold">Shared pricing adjustment</summary>{workOrder.pricing_adjustment.lines.map((line,index)=><p key={index} className="text-sm">{line.description} · Original {workOrderMoney(line.original_amount)} · Eligible {workOrderMoney(line.eligible_amount)} · Retained {workOrderMoney(line.retained_amount)}</p>)}</details>}
  {editing ? <form onSubmit={save} className="min-w-0 space-y-4">
   <fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="font-semibold">Complete saved quotation</legend>
    {!workOrder.private_pricing?.margin && <label className="flex min-h-11 items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm"><input type="checkbox" checked={conversionConfirmed} onChange={event=>setConversionConfirmed(event.target.checked)}/><span>Replace this legacy Draft pricing with the complete quotation and the margin values shown here. Current saved payable: {workOrderMoney(workOrder.agreed_amount)}.</span></label>}
    <WorkOrderPricingFields items={items} selected={selected} pricing={pricing} onChange={setPricing}/>
    <details><summary className="min-h-11 cursor-pointer font-semibold">Work details, dates and terms</summary><div className="space-y-3">
    {[['project_title','Work title'],['agreed_scope_summary','Scope notes'],['instructions','Instructions'],['terms','Work Order terms']].map(([key,label])=><FormField key={key} label={label} as={key==='project_title'?'input':'textarea'} required={key==='project_title'} value={metadata[key] || ''} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/>)}
    <div className="grid gap-3 sm:grid-cols-2">{[['required_start_date','Required from'],['required_end_date','Required by']].map(([key,label])=><FormField key={key} label={label} type="date" value={metadata[key] || ''} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/>)}</div>
    </div></details>
   </fieldset>
   <div className="flex flex-wrap gap-3"><button disabled={busy || !selected.length || !conversionConfirmed} className="min-h-11 rounded-xl bg-slate-900 px-4 font-bold text-white disabled:opacity-50 bp-ui-action">{busy?'Saving…':'Save Draft'}</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Discard unsaved Work Order changes?')){setEditing(false);setError('');}}} className="min-h-11 rounded-xl border px-4 bp-ui-action">Cancel editing</button></div>
  </form> : <>
   <div className="wo-vendor-columns" aria-hidden="true"><span>Sl.</span><span>Work scope / specification</span><span>Qty / Unit</span><span>Vendor rate</span><span>Total</span></div>
   <div className="wo-vendor-lines">{(quote?.quote_lines || []).map((line,index)=><article key={line.id} className="wo-vendor-line"><span className="wo-vendor-serial">{index+1}</span><div className="wo-vendor-scope"><h3 className="break-words font-semibold">{fullDescription(line)}</h3><Specification value={line.specification}/></div><div><small>Qty / Unit</small><span>{line.quantity} {line.unit_name_snapshot}</span></div><div><small>Vendor rate</small><span>{quote?.pricing?.basis==='MARGIN' ? `₹${Number(line.unit_rate).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:12})}` : workOrderMoney(line.unit_rate)}</span></div><div><small>Total</small><strong>{workOrderMoney(line.net_amount)}</strong></div></article>)}</div>
   <dl className="my-4 grid grid-cols-2 gap-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{workOrderMoney(quote?.subtotal)}</dd>{quote?.pricing?.basis!=='MARGIN' && <><dt>Agreed discount</dt><dd className="text-right">{workOrderMoney(quote?.pricing?.discount)}</dd></>}<dt>{({NO_GST:'No GST',GST_EXTRA:'GST Exclusive',GST_INCLUDED:'GST Inclusive'})[quote?.pricing?.gst_mode] || 'GST'}</dt><dd className="text-right">{workOrderMoney(quote?.tax_amount)}</dd><dt className="font-bold">Contractor payable</dt><dd className="text-right font-bold">{workOrderMoney(quote?.total)}</dd></dl>
   <div className="flex flex-wrap gap-3">{isMain && ['DECLINED','WITHDRAWN'].includes(workOrder.status) && <a href={`/subcontract-work-orders?quotation=${workOrder.quotation}`} className="inline-flex min-h-11 items-center rounded-xl border px-4">Offer to another vendor</a>}{isMain && workOrder.status==='DRAFT' && <button disabled={busy} onClick={edit} className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white bp-ui-action">Edit Draft</button>}<button disabled={busy} onClick={pdf} className="min-h-11 rounded-xl border px-4 bp-ui-action">Preview / PDF</button>{workOrder.status!=='DRAFT' && <button onClick={share} className="min-h-11 rounded-xl border px-4 bp-ui-action">Share recipient link</button>}</div>
  </>}
 </SectionCard>;
}

function fullDescription(line) {
 try{return JSON.parse(line.specification || '{}').description || line.description_snapshot;}catch{return line.description_snapshot;}
}

function Specification({value}) {
 let spec;try{spec=JSON.parse(value || "{}");}catch{return null;}
 return <details className="my-1 break-words text-slate-600"><summary className="min-h-11 cursor-pointer">Work specifications</summary><p>{[spec.scope_name,spec.service,spec.product,spec.brand,spec.colour,spec.features,spec.line_type,`Coats ${spec.coats || 1} \u00b7 Primer ${spec.primer_coats || 0}`,...(spec.rooms || []),...(spec.surfaces || [])].filter(Boolean).join(" \u00b7 ")}</p></details>;
}
