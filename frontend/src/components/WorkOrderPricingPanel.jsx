import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import useDraftUnsavedChanges from '../hooks/useDraftUnsavedChanges';
import { FormField, SectionCard } from './ui';
import { previewPdf } from './PdfPreview';
import WorkOrderPricingFields from './WorkOrderPricingFields';
import { initialWorkOrderPricing, workOrderMoney, workOrderPricingPayload } from '../utils/workOrderPricing';
import { apiErrorMessage } from '../utils/subcontract';

export default function WorkOrderPricingPanel({ workOrder, isMain, onChanged, onEditing }) {
 const [editing,setEditing]=useState(false), [items,setItems]=useState([]), [selected,setSelected]=useState([]);
 const [pricing,setPricing]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
 const [metadata,setMetadata]=useState({});
 const guard=useRef(false);
 useDraftUnsavedChanges(editing);
 useEffect(()=>{onEditing?.(editing);return()=>onEditing?.(false);},[editing,onEditing]);

 async function edit(){setBusy(true);setError('');try{const {data}=await api.get(`/quotations/${workOrder.quotation}/`);setMetadata(Object.fromEntries(['project_title','site_address','agreed_scope_summary','instructions','terms','required_start_date','required_end_date'].map(key=>[key,workOrder[key] || ''])));setItems(data.items || []);setSelected(workOrder.scopes.map(scope=>scope.source_quotation_item).filter(Boolean));setPricing(initialWorkOrderPricing(data.items || [],workOrder));setEditing(true);}catch(err){setError(apiErrorMessage(err,'Source revision could not be loaded.'));}finally{setBusy(false);}}
 async function save(event){event.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await api.patch(`/outsourcing/work-orders/${workOrder.id}/draft-pricing/`,{...metadata,required_start_date:metadata.required_start_date || null,required_end_date:metadata.required_end_date || null,expected_updated_at:workOrder.updated_at,quotation_item_ids:selected,material_mode:pricing.material_mode,pricing_input:workOrderPricingPayload(items,selected,pricing)});setEditing(false);setMessage('Work Order Draft saved.');onChanged();}catch(err){setError(apiErrorMessage(err,'Draft could not be saved. Your saved values are unchanged.'));}finally{guard.current=false;setBusy(false);}}
 async function pdf(){setBusy(true);setError('');try{const {data}=await api.get(`/outsourcing/work-orders/${workOrder.id}/pdf/`,{responseType:'blob'});previewPdf(data,`${workOrder.reference}.pdf`);}catch(err){setError(apiErrorMessage(err,'PDF could not be loaded.'));}finally{setBusy(false);}}
 async function share(){try{const url=window.location.href;if(navigator.share)await navigator.share({title:workOrder.reference,url});else{await navigator.clipboard.writeText(url);setMessage('Recipient link copied. Sign-in is required.');}}catch{setError('Sharing was cancelled or unavailable. Copy this page address to the recipient.');}}
 const quote=workOrder.pricing_quote;
 return <SectionCard title="Agreed Work Order pricing" description={`${workOrder.material_mode==='WITH_MATERIAL'?'With Material':'Without Material'} · Source revision ${workOrder.source_revision_number}`}>
  <p className="mb-3 text-sm text-slate-600">{workOrder.material_mode==='WITH_MATERIAL'?'With Material':'Without Material'} · Source revision {workOrder.source_revision_number}</p>
  {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  {message && <p role="status" className="mb-3 text-sm text-emerald-800">{message}</p>}
  {editing ? <form onSubmit={save} className="min-w-0 space-y-4">
   <fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="font-semibold">Selected saved quotation lines</legend>{items.map(item=><label key={item.id} className="flex min-h-11 items-start gap-3 break-words"><input type="checkbox" className="mt-1" checked={selected.includes(item.id)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{item.description}</label>)}
    {[['project_title','Work title'],['site_address','Site address'],['agreed_scope_summary','Scope notes'],['instructions','Instructions'],['terms','Work Order terms']].map(([key,label])=><FormField key={key} label={label} as={key==='project_title'?'input':'textarea'} required={key==='project_title'} value={metadata[key] || ''} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/>)}
    <div className="grid gap-3 sm:grid-cols-2">{[['required_start_date','Required from'],['required_end_date','Required by']].map(([key,label])=><FormField key={key} label={label} type="date" value={metadata[key] || ''} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/>)}</div>
    <WorkOrderPricingFields items={items} selected={selected} pricing={pricing} onChange={setPricing}/>
   </fieldset>
   <div className="flex flex-wrap gap-3"><button disabled={busy || !selected.length} className="min-h-11 rounded-xl bg-slate-900 px-4 font-bold text-white disabled:opacity-50">{busy?'Saving…':'Save Draft'}</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Discard unsaved Work Order changes?')){setEditing(false);setError('');}}} className="min-h-11 rounded-xl border px-4">Cancel editing</button></div>
  </form> : <>
   <div className="space-y-3">{(quote?.quote_lines || []).map(line=><article key={line.id} className="min-w-0 rounded-xl border p-3 text-sm"><h3 className="break-words font-semibold">{line.description_snapshot}</h3><Specification value={line.specification}/><p>{line.quantity} {line.unit_name_snapshot} × {workOrderMoney(line.unit_rate)}</p><p>Gross {workOrderMoney(line.amount)} · Discount {workOrderMoney(line.discount_amount)} · Net {workOrderMoney(line.net_amount)}</p></article>)}</div>
   <dl className="my-4 grid grid-cols-2 gap-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{workOrderMoney(quote?.subtotal)}</dd><dt>Agreed discount</dt><dd className="text-right">{workOrderMoney(quote?.pricing?.discount)}</dd><dt>GST</dt><dd className="text-right">{workOrderMoney(quote?.tax_amount)}</dd><dt className="font-bold">Contractor payable</dt><dd className="text-right font-bold">{workOrderMoney(quote?.total)}</dd></dl>
   <div className="flex flex-wrap gap-3">{isMain && workOrder.status==='DRAFT' && <button disabled={busy} onClick={edit} className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white">Edit Draft</button>}<button disabled={busy} onClick={pdf} className="min-h-11 rounded-xl border px-4">Preview / PDF</button>{workOrder.status!=='DRAFT' && <button onClick={share} className="min-h-11 rounded-xl border px-4">Share recipient link</button>}</div>
  </>}
 </SectionCard>;
}

function Specification({value}) {
 let spec;try{spec=JSON.parse(value || "{}");}catch{return null;}
 return <p className="my-1 break-words text-slate-600">{[spec.description,spec.scope_name,spec.service,spec.product,spec.brand,spec.colour,spec.features,`Coats ${spec.coats || 1} \u00b7 Primer ${spec.primer_coats || 0}`,...(spec.rooms || []),...(spec.surfaces || [])].filter(Boolean).join(" \u00b7 ")}</p>;
}
