import { useEffect, useState } from 'react';
import api from '../api/client';
import { FormField } from './ui';
import { workOrderMoney, workOrderPricingPayload } from '../utils/workOrderPricing.js';
import { apiErrorMessage } from '../utils/subcontract';
import './work-order-margin.css';

export default function WorkOrderPricingFields({ items, selected, pricing, onChange, showTax = true }) {
 const [preview,setPreview]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 useEffect(()=>{
  let active=true;
  setPending(true);
  const timer=setTimeout(async()=>{
   try {
    const {data}=await api.post('/outsourcing/work-orders/pricing-preview/',{quotation:pricing.source_quotation,work_order:pricing.work_order,material_mode:pricing.material_mode,...(pricing.allocation_mode ? {quotation_item_ids:selected} : {}),pricing_input:workOrderPricingPayload(items,selected,pricing)});
    if(active){setPreview(data);setError('');}
   } catch(err){if(active)setError(apiErrorMessage(err,'Margin preview could not be calculated.'));}
   finally{if(active)setPending(false);}
  },200);
  return()=>{active=false;clearTimeout(timer);};
 },[items,selected,pricing]);
 const update=(key,value)=>onChange(current=>({...current,[key]:value}));
 const frozen=preview?.source_snapshot || pricing.source_snapshot;
 const source=(frozen?.items || items).filter(item=>selected.includes(item.id));
 const rows=new Map((preview?.lines || []).map(line=>[line.source_item,line]));
 return <section className="wo-margin-editor" aria-label="Contractor margin pricing">
  <h3>Contractor margin</h3>
  <p className="wo-margin-hint">Approved scope is read only. Margin uses post-discount, pre-tax values. Customer GST is excluded from the margin.</p>
  <FormField label="Margin mode" as="select" value={pricing.margin_mode} onChange={event=>update('margin_mode',event.target.value)}><option value="LINE">Line-by-Line Margin</option><option value="OVERALL">Overall Quotation Margin</option></FormField>
  {showTax && <WorkOrderTaxFields pricing={pricing} onChange={onChange}/>}
  {pricing.margin_mode==='OVERALL' && <MarginControl label="Overall margin" type={pricing.margin_type} value={pricing.margin_value} onType={value=>update('margin_type',value)} onValue={value=>update('margin_value',value)}/>}
  {error && <p role="alert" className="wo-margin-error">{error}</p>}
  <div className="wo-margin-columns" aria-hidden="true"><span>Sl.</span><span>Work scope / specification</span><span>Qty / Unit</span><span>Approved rate</span><span>Original / Eligible total</span><span>Margin</span><span>Contractor amount</span></div>
  <div className="wo-margin-lines">{source.map((item,index)=>{
   const spec=item.specification || item.specification_details || {};
   const choice=pricing.margins[item.id] || {type:'PERCENTAGE',value:'0'};
   const vendor=rows.get(item.id);
   const change=(key,value)=>onChange(current=>({...current,margins:{...current.margins,[item.id]:{...choice,[key]:value}}}));
   return <article key={item.id} className="wo-margin-line">
    <span className="wo-margin-serial">{index+1}</span>
    <div className="wo-margin-scope"><h4>{item.description}</h4><p>{[item.category_name || item.service_category_name,spec.scope_name,spec.service || item.service_name,spec.product || item.paint_type_name,spec.brand || item.brand_name].filter(Boolean).join(' · ')}</p>
     <details><summary>Work specifications</summary><p>{[spec.features,spec.colour,spec.line_type,...(spec.rooms || item.included_areas || []),`Coats ${spec.coats || item.coats || 1} · Primer ${spec.primer_coats || 0}`,...(spec.surfaces || [])].filter(Boolean).join(' · ')}</p></details>
    </div>
    <div><small>Qty / Unit</small><span>{item.quantity} {item.unit_name}</span></div>
    <div><small>Approved rate</small><span>{workOrderMoney(item.rate)}</span></div>
    <div><small>Original / Eligible</small><span>{workOrderMoney(item.amount)}</span>{item.eligible_amount!==undefined && <span className="wo-margin-hint">Eligible {workOrderMoney(item.eligible_amount)}</span>}</div>
    <div>{pricing.margin_mode==='LINE' ? <MarginControl label={`Margin ${index+1}`} type={choice.type} value={choice.value} onType={value=>change('type',value)} onValue={value=>change('value',value)}/> : <span className="wo-margin-hint">Overall allocation</span>}</div>
    <div className="wo-margin-payable"><small>Contractor amount</small><strong>{vendor ? workOrderMoney(vendor.amount) : '—'}</strong><span className="wo-margin-hint">Vendor rate {vendor?.vendor_rate ? Number(vendor.vendor_rate).toLocaleString('en-IN',{maximumFractionDigits:12}) : '—'}</span></div>
   </article>;
  })}</div>
  <div className="wo-margin-summary" role="status"><span>{pending?'Calculating…':'Contractor payable'}</span><strong>{preview ? workOrderMoney(preview.totals.grand_total) : '—'}</strong>{preview && <small>Subtotal {workOrderMoney(preview.totals.subtotal)} · GST {workOrderMoney(preview.totals.gst_amount)}</small>}</div>
  <details className="wo-margin-source"><summary>Original quotation · read-only reference</summary><p>{frozen?.quotation_number} · Revision {frozen?.revision}</p><p>Original subtotal {workOrderMoney(frozen?.subtotal)} · Customer discount {workOrderMoney(frozen?.discount)} · Original total {workOrderMoney(frozen?.total)}</p><p>{frozen?.customer_name} · {frozen?.site_address}</p><p>{frozen?.notes}</p><p>{frozen?.terms}</p></details>
  <details><summary>Open Platform</summary><p className="wo-margin-hint">Publishing requires a separate Jobs integration. Only approximate locality and vendor-facing scope and amounts may be published.</p><button type="button" disabled className="min-h-11 rounded-xl border px-3 text-sm opacity-60">Publish to Open Platform · pending integration</button></details>
  <fieldset className="wo-sharing-controls"><legend>Recipient visibility</legend>{[['share_site_pin','Show Precise Site Pin'],['share_customer_address','Show Full Property Address'],['share_customer_contact','Show Customer Contact Details'],['show_pricing_adjustment','Show Pricing Adjustment to Vendor']].map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(pricing[key])} onChange={event=>update(key,event.target.checked)}/><span>{label}</span></label>)}</fieldset>
 </section>;
}

function MarginControl({label,type,value,onType,onValue}) {
 return <div className="wo-margin-control"><select aria-label={`${label} type`} value={type} onChange={event=>onType(event.target.value)}><option value="PERCENTAGE">%</option><option value="FIXED">₹</option></select><input aria-label={`${label} value`} type="number" min="0" max={type==='PERCENTAGE'?100:undefined} step="0.01" required value={value} onChange={event=>onValue(event.target.value)}/></div>;
}

export function WorkOrderTaxFields({pricing,onChange}) {
 return <fieldset className="min-w-0 space-y-3"><legend className="font-semibold">Work Order GST</legend><p className="wo-margin-hint">Select the applicable tax for this vendor agreement. Customer quotation GST is not inherited.</p><FormField label="GST treatment" as="select" value={pricing.gst_mode || 'NO_GST'} onChange={event=>onChange(current=>({...current,gst_mode:event.target.value}))}><option value="NO_GST">No GST</option><option value="GST_EXTRA">GST Exclusive</option><option value="GST_INCLUDED">GST Inclusive</option></FormField>{pricing.gst_mode && pricing.gst_mode!=='NO_GST' && <FormField label="GST percentage" aria-label="GST percentage" type="number" min="0.01" step="0.01" required value={pricing.gst_percentage} onChange={event=>onChange(current=>({...current,gst_percentage:event.target.value}))}/>}</fieldset>;
}
