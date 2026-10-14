import { cloneElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';
import useDraftUnsavedChanges from '../hooks/useDraftUnsavedChanges';
import WorkOrderPricingFields from './WorkOrderPricingFields';
import { initialWorkOrderMargins, workOrderMoney, workOrderPricingPayload } from '../utils/workOrderPricing';
import { apiErrorMessage, connectionCounterparty } from '../utils/subcontract';
import { categoryGroups, eligibleChoices, allocationItems, resetOfferSource } from '../utils/workOrderOfferWizard';
import './offer-work-wizard.css';

const control='w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5';

async function allRows(path) {
 const rows=[];
 while(path){const {data}=await api.get(path);rows.push(...(Array.isArray(data)?data:data.results || []));if(!data.next)break;const next=new URL(data.next,location.origin);path=next.pathname.replace(/^\/api/,'')+next.search;}
 return rows;
}

export default function OfferWorkWizard({initialQuotation='',initialContractor='',onClose,onCreated,onRequestScope}) {
 const [catalog,setCatalog]=useState({customers:[],properties:[],quotations:[]}),[categories,setCategories]=useState([]),[connections,setConnections]=useState([]);
 const [source,setSource]=useState({customer:'',property:'',quotation:''}),[quote,setQuote]=useState(null),[search,setSearch]=useState('');
 const [mode,setMode]=useState('SINGLE'),[vendors,setVendors]=useState(['']),[allocation,setAllocation]=useState({}),[pricing,setPricing]=useState({});
 const [metadata,setMetadata]=useState({project_title:'Contractor work',terms:'',instructions:'',agreed_scope_summary:'',required_start_date:'',required_end_date:''});
 const [loading,setLoading]=useState(true),[quoteLoading,setQuoteLoading]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[review,setReview]=useState({}),[reviewKey,setReviewKey]=useState(''),[saved,setSaved]=useState([]),[retry,setRetry]=useState(0);
 const dialogRef=useRef(null),busy=useRef(false),creationKey=useRef(crypto.randomUUID());
 const dirty=Boolean(source.customer || Object.keys(allocation).length) && !saved.length;
 const allowNavigation=useDraftUnsavedChanges(dirty);
 const vendorRows=connections.filter(row=>row.can_send_work_order!==false).map(connectionCounterparty);
 const choices=eligibleChoices(catalog,source);
 const items=useMemo(()=>quote?.items || [],[quote]);
 const selectedQuote=catalog.quotations.find(row=>String(row.id)===source.quotation);
 const reserved=new Set(selectedQuote?.allocated_item_ids || []);
 const assignedVendors=useMemo(()=>vendors.filter(Boolean),[vendors]);
 const updatePricing=(vendor,update)=>setPricing(current=>({...current,[vendor]:typeof update==='function'?update(current[vendor]):update}));

 useEffect(()=>{const opener=document.activeElement,dialog=dialogRef.current;dialog.showModal();return()=>{dialog.close();opener?.focus();};},[]);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  Promise.all([api.get('/outsourcing/work-orders/offer-catalog/'),allRows('/quotations/service-categories/'),allRows('/quotations/contractor-connections/?status=CONNECTED')]).then(([response,master,contacts])=>{
   if(!active)return;setCatalog(response.data);setCategories(master);setConnections(contacts);
   const preset=response.data.quotations.find(row=>String(row.id)===String(initialQuotation));
   if(preset)setSource({customer:String(preset.customer),property:String(preset.property),quotation:String(preset.id)});
   const connected=contacts.map(connectionCounterparty).some(row=>String(row.id)===String(initialContractor));if(connected)setVendors([String(initialContractor)]);
  }).catch(err=>{if(active)setError(apiErrorMessage(err,'Connected customers and quotation choices could not be loaded.'));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[initialQuotation,initialContractor,retry]);
 useEffect(()=>{
  let active=true;setQuote(null);setPricing({});setReview({});
  if(!source.quotation){setQuoteLoading(false);return()=>{active=false;};}
  setQuoteLoading(true);api.get(`/quotations/${source.quotation}/`).then(({data})=>{if(active){setQuote(data);setMetadata(current=>({...current,project_title:data.property_name || 'Contractor work'}));}}).catch(err=>{if(active)setError(apiErrorMessage(err,'Quotation could not be loaded.'));}).finally(()=>{if(active)setQuoteLoading(false);});
  return()=>{active=false;};
 },[source.quotation]);
 useEffect(()=>{
  if(!quote)return;
  setPricing(current=>Object.fromEntries(assignedVendors.map(vendor=>[vendor,current[vendor] || {...initialWorkOrderMargins(items,null,quote),allocation_mode:true}])));
 },[quote,items,assignedVendors]);
 const selectionReady=Boolean(source.customer && source.property && source.quotation && quote && !quoteLoading && vendors.every(Boolean) && new Set(vendors).size===vendors.length && assignedVendors.length && assignedVendors.every(vendor=>allocationItems(allocation,vendor).length>0 && pricing[vendor] && (pricing[vendor].gst_mode==='NO_GST' || Number(pricing[vendor].gst_percentage)>0)));
 const previewKey=JSON.stringify([source.quotation,allocation,pricing,vendors]);
 useEffect(()=>{
  let active=true;setReview({});setReviewKey('');
  if(!selectionReady)return()=>{active=false;};
  const timer=setTimeout(()=>{
   Promise.all(assignedVendors.map(async vendor=>{const ids=allocationItems(allocation,vendor);const {data}=await api.post('/outsourcing/work-orders/pricing-preview/',{quotation:quote.id,quotation_item_ids:ids,pricing_input:workOrderPricingPayload(items,ids,pricing[vendor])});return [vendor,data];})).then(rows=>{if(active){setReview(Object.fromEntries(rows));setReviewKey(previewKey);}}).catch(err=>{if(active)setError(apiErrorMessage(err,'Pricing could not be calculated. Check the margin and GST values.'));});
  },200);
  return()=>{active=false;clearTimeout(timer);};
 },[selectionReady,previewKey,quote,items,assignedVendors,allocation,pricing]);

 function changeSource(field,value){
  if(value===source[field])return;
  if(field==='quotation' && value!==source.quotation && Object.values(allocation).some(Boolean) && !window.confirm('Replace the selected work and vendor allocations with this quotation?'))return;
  setSource(resetOfferSource(source,field,value));setAllocation({});setReview({});setPricing({});setVendors(['']);creationKey.current=crypto.randomUUID();setError('');
 }
 function setVendor(index,value){const previous=vendors[index];setVendors(current=>current.map((entry,i)=>i===index?value:entry));setAllocation(current=>Object.fromEntries(Object.entries(current).map(([id,vendor])=>[id,vendor===previous && previous ? '' : vendor])));}
 function changeMode(value){if(mode===value)return;if(Object.values(allocation).some(Boolean) && !window.confirm('Change vendor assignment mode and clear the current allocations?'))return;setMode(value);setVendors(['']);setAllocation({});}
 function assign(ids,vendor){setAllocation(current=>({...current,...Object.fromEntries(ids.filter(id=>!reserved.has(id)).map(id=>[id,vendor]))}));}
 function close(){if(!busy.current && (!dirty || window.confirm('Discard unsaved Work Order selections?'))){allowNavigation();onClose();}}
 const canSave=selectionReady && !loading && !saving && reviewKey===previewKey && assignedVendors.every(vendor=>review[vendor]);
 async function save(){
  if(busy.current || !canSave)return;
  busy.current=true;setSaving(true);setError('');
  try{
   const payload={customer:Number(source.customer),property:Number(source.property),quotation:Number(source.quotation),creation_key:creationKey.current,assignments:assignedVendors.map(vendor=>({...metadata,required_start_date:metadata.required_start_date || null,required_end_date:metadata.required_end_date || null,receiving_contractor:Number(vendor),quotation_item_ids:allocationItems(allocation,vendor),pricing_input:workOrderPricingPayload(items,allocationItems(allocation,vendor),pricing[vendor])}))};
   const {data}=await api.post('/outsourcing/work-orders/allocation-drafts/',payload);allowNavigation();setSaved(data.work_orders);
   if(data.work_orders.length===1)onCreated(data.work_orders[0]);
  }catch(err){setError(apiErrorMessage(err,'Drafts could not be saved. Your selections are retained.'));}finally{busy.current=false;setSaving(false);}
 }
 const vendorName=vendor=>vendorRows.find(row=>String(row.id)===String(vendor))?.label || 'Vendor';
 return <dialog ref={dialogRef} data-popup-protection="handled" aria-labelledby="offer-wizard-title" onCancel={event=>{event.preventDefault();close();}} className="offer-work-wizard">
  <header className="flex items-start justify-between gap-3"><div><h2 id="offer-wizard-title" className="text-xl font-bold bp-ui-section-heading">Offer work to a subcontractor</h2></div><button type="button" onClick={close} disabled={saving} aria-label="Close work offer" className="grid min-h-11 min-w-11 place-items-center bp-ui-icon-action"><X size={20}/></button></header>
  {saved.length ? <section className="space-y-4"><p role="status">{saved.length} independent Work Order Drafts saved. Nothing has been issued or shared.</p>{saved.map(order=><a key={order.id} className="block min-h-11 rounded-xl border p-3" href={`/subcontract-work-orders/${order.id}`}>{order.reference} · {order.receiving_contractor_name} · {workOrderMoney(order.agreed_amount)} · Open Draft</a>)}<button type="button" className="min-h-11 rounded-xl border px-4 bp-ui-action" onClick={()=>onCreated()}>Close and view Work Orders</button></section> : <>
   {loading && <p role="status">Loading connected customers and eligible quotations…</p>}
   {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}{loading===false && !catalog.customers.length && <button type="button" onClick={()=>setRetry(value=>value+1)} className="ml-2 min-h-11 underline bp-ui-action">Retry loading</button>}</div>}
   <fieldset disabled={loading || saving} className="min-w-0 space-y-4">
   <section className="offer-source-section"><h3 className="font-bold">Customer and quotation</h3><div className="offer-source-grid"><Field label="Search customer by name or mobile"><input className={(control) + " bp-ui-control"} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name or mobile number"/></Field><Field label="Customer"><select className={(control) + " bp-ui-control"} value={source.customer} onChange={event=>changeSource('customer',event.target.value)}><option value="">Choose a connected customer</option>{catalog.customers.filter(row=>`${row.name} ${row.mobile}`.toLowerCase().includes(search.toLowerCase())).map(row=><option key={row.id} value={row.id}>{row.name} · {row.mobile}</option>)}</select></Field>{!catalog.customers.length && <p className="text-sm">No connected customers are available.</p>}<button type="button" onClick={onRequestScope} className="min-h-11 text-sm underline bp-ui-action">Request a subcontractor quotation using the existing scope-offer flow</button></div>
   <div className="offer-source-grid"><Field label="Property"><select disabled={!source.customer} className={(control) + " bp-ui-control"} value={source.property} onChange={event=>changeSource('property',event.target.value)}><option value="">Choose a property</option>{choices.properties.map(row=><option key={row.id} value={row.id}>{row.name} · {row.city}</option>)}</select></Field>{source.customer && !choices.properties.length && <p>No accessible properties are available for this customer.</p>}
   <Field label="Quotation revision"><select disabled={!source.property} className={(control) + " bp-ui-control"} value={source.quotation} onChange={event=>changeSource('quotation',event.target.value)}><option value="">Choose an eligible quotation revision</option>{choices.quotations.map(row=><option key={row.id} value={row.id}>{row.quotation_number} · Revision {row.revision}</option>)}</select></Field>{selectedQuote && <dl className="offer-quote-summary"><dt>Status</dt><dd>{selectedQuote.status_display}</dd><dt>Date</dt><dd>{selectedQuote.date}</dd><dt>Customer quotation amount</dt><dd>{workOrderMoney(selectedQuote.amount)}</dd></dl>}{quoteLoading && <p role="status">Loading saved work items…</p>}{source.property && !choices.quotations.length && <p>No approved quotations belong to this property.</p>}</div></section>
   {quote && <section className="offer-section space-y-3"><h3 className="font-bold">Vendor assignment</h3><Field label="Vendor assignment"><select className={(control) + " bp-ui-control"} value={mode} onChange={event=>changeMode(event.target.value)}><option value="SINGLE">Single Vendor</option><option value="MULTIPLE">Multiple Vendors</option></select></Field>{vendors.map((vendor,index)=><div key={index} className="flex min-w-0 items-end gap-2"><Field label={`Vendor ${index+1}`}><select className={(control) + " bp-ui-control"} value={vendor} onChange={event=>setVendor(index,event.target.value)}><option value="">Choose a connected vendor</option>{vendorRows.filter(row=>String(row.id)===vendor || !vendors.includes(String(row.id))).map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></Field>{mode==='MULTIPLE' && vendors.length>1 && <button type="button" className="min-h-11 rounded-lg border px-3 bp-ui-action" aria-label={`Remove vendor ${index+1}`} onClick={()=>{setVendor(index,'');setVendors(current=>current.filter((_,i)=>i!==index));}}>Remove</button>}</div>)}{mode==='MULTIPLE' && <button type="button" className="min-h-11 rounded-xl border px-4 bp-ui-action" onClick={()=>setVendors(current=>[...current,''])}>Add vendor</button>}<p className="text-sm">Each vendor gets a separate Draft, pricing, PDF and acceptance.</p></section>}
   {quote && <section className="offer-section"><h3 className="font-bold">Select work categories and items</h3><p className="text-sm">Allocate categories or individual items. Unassigned work stays available; existing allocations are locked.</p>{categoryGroups(items,categories).map(group=><section key={group.key} className="offer-category"><h3 className="font-bold">{group.name}</h3><Field label={`Assign ${group.name} category`}><select className={(control) + " bp-ui-control"} value="" onChange={event=>assign(group.items.map(item=>item.id),event.target.value)}><option value="">Choose a vendor for this category</option>{assignedVendors.map(vendor=><option key={vendor} value={vendor}>{vendorName(vendor)}</option>)}</select></Field>{group.items.map(item=><div key={item.id} className="offer-item"><div><strong>{item.description}</strong><small>{item.quantity} {item.unit_name} · Approved {workOrderMoney(item.rate)}</small></div>{reserved.has(item.id) ? <span className="text-sm text-slate-500">Already allocated</span> : mode==='SINGLE' ? <label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`Allocate ${item.description}`} disabled={!vendors[0]} checked={Boolean(vendors[0]) && allocation[item.id]===vendors[0]} onChange={event=>assign([item.id],event.target.checked?vendors[0]:'')}/>Select</label> : <select aria-label={`Assign ${item.description}`} className={(control) + " bp-ui-control"} value={allocation[item.id] || ''} onChange={event=>assign([item.id],event.target.value)}><option value="">Unassigned</option>{assignedVendors.map(vendor=><option key={vendor} value={vendor}>{vendorName(vendor)}</option>)}</select>}</div>)}</section>)}<p role="status">{items.filter(item=>!reserved.has(item.id) && !allocation[item.id]).length} available items remain unassigned.</p></section>}
   {assignedVendors.filter(vendor=>allocationItems(allocation,vendor).length>0).map(vendor=><section key={vendor} className="space-y-3"><h3 className="font-bold">{vendorName(vendor)}</h3>{pricing[vendor] && <WorkOrderPricingFields items={items} selected={allocationItems(allocation,vendor)} pricing={pricing[vendor]} onChange={update=>updatePricing(vendor,update)} showTax/>}</section>)}
   {quote && <><details><summary className="min-h-11 cursor-pointer font-semibold">Work details, dates and terms</summary><div className="space-y-3">{[['project_title','Work title'],['terms','Work Order terms'],['instructions','Instructions'],['agreed_scope_summary','Scope notes'],['required_start_date','Required from'],['required_end_date','Required by']].map(([key,label])=><Field key={key} label={label}>{key.includes('date') ? <input className={(control) + " bp-ui-control"} type="date" value={metadata[key]} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/> : key==='project_title' ? <input className={(control) + " bp-ui-control"} maxLength={200} value={metadata[key]} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/> : <textarea className={(control) + " bp-ui-control"} rows={2} value={metadata[key]} onChange={event=>setMetadata(current=>({...current,[key]:event.target.value}))}/>}</Field>)}</div></details></>}
   </fieldset>
   {selectionReady && reviewKey===previewKey && <p role="status" className="text-sm text-slate-600">Pricing checked for {assignedVendors.length} vendor{assignedVendors.length>1?'s':''}. Save Draft does not issue or share work.</p>}
   <footer className="offer-step-actions"><button type="button" disabled={saving} onClick={close} className="min-h-11 rounded-xl border px-4 bp-ui-action">Cancel</button><button type="button" disabled={!canSave} onClick={save} className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:opacity-50 bp-ui-action">{saving?'Saving\u2026':assignedVendors.length>1?'Save Work Order Drafts':'Save Work Order Draft'}</button></footer>
  </>}
 </dialog>;
}

function Field({label,children}){const id=useId();return <div className="block min-w-0 flex-1"><label htmlFor={id} className="mb-2 block text-sm font-semibold">{label}</label>{cloneElement(children,{id})}</div>;}
