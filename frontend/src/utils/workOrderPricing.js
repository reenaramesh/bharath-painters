import { rateAtPercentage } from './quotationPricing.js';
export const approvedQuotationStatuses = ['ACCEPTED','SCHEDULED','IN_PROGRESS','COMPLETED','CONVERTED'];
export const workOrderMoney = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));

export function initialWorkOrderPricing(items, order) {
 const state={material_mode:order?.material_mode || 'WITH_MATERIAL',discount_mode:'OVERALL',discount_type:'FIXED',discount_value:0,gst_mode:'NO_GST',gst_percentage:0,
  labour_method:order?.private_pricing?.labour_method || 'DIRECT',adjustment_percent:order?.private_pricing?.adjustment_percent ?? '',
  ...order?.pricing_quote?.pricing,rates:{WITH_MATERIAL:Object.fromEntries(items.map(item=>[item.id,String(item.rate)])),WITHOUT_MATERIAL:{}},discounts:{}};
 for(const line of order?.pricing_quote?.quote_lines || []) {
  const source=order.scopes.find(scope=>scope.id===line.source_scope)?.source_quotation_item;
  if(source){state.rates[state.material_mode][source]=line.unit_rate;state.discounts[source]={type:line.discount_type,value:line.discount_value};}
 }
 return state;
}

export function workOrderPricingItems(items, selected, state) {
 return items.filter(item=>selected.includes(item.id)).map(item=>({id:item.id,description:item.description,quantity:item.quantity,
  rate:state.material_mode==='WITHOUT_MATERIAL' && state.labour_method==='SELLING_PERCENT' ? rateAtPercentage(item.rate,state.adjustment_percent) : state.rates[state.material_mode]?.[item.id] ?? (state.material_mode==='WITH_MATERIAL'?String(item.rate):''),
  discount_type:state.discounts[item.id]?.type || 'FIXED',discount_value:state.discounts[item.id]?.value ?? 0}));
}

export function workOrderPricingPayload(items, selected, state) {
 if(state.margin_mode) {
  if(!selected.length || selected.some(id=>!items.some(item=>item.id===id)) || new Set(selected).size!==selected.length || (!state.allocation_mode && (items.length!==selected.length || items.some(item=>!selected.includes(item.id)))))throw Error('Import the complete saved quotation or valid allocated items.');
  return {margin_mode:state.margin_mode,margin_type:state.margin_type,margin_value:state.margin_value,
   lines:items.filter(item=>selected.includes(item.id)).map(item=>({source_item:item.id,margin_type:state.margins[item.id]?.type || 'PERCENTAGE',margin_value:state.margins[item.id]?.value ?? '0'})),
   gst_mode:state.gst_mode || 'NO_GST',gst_percentage:state.gst_percentage ?? '0',
   ...Object.fromEntries(['share_site_pin','share_customer_address','share_customer_contact','show_pricing_adjustment'].map(key=>[key,Boolean(state[key])]))};
 }
 if(!selected.length || new Set(selected).size!==selected.length)throw Error('Select unique saved quotation lines.');
 const percent=state.material_mode==='WITHOUT_MATERIAL' && state.labour_method==='SELLING_PERCENT';
 if(percent && (state.adjustment_percent==='' || !Number.isFinite(Number(state.adjustment_percent)) || Number(state.adjustment_percent)<0 || Number(state.adjustment_percent)>100))throw Error('Enter a labour percentage from 0 to 100.');
 const lines=workOrderPricingItems(items,selected,state).map(row=>{
  if(row.rate==='' || !Number.isFinite(Number(row.rate)) || Number(row.rate)<0)throw Error('Enter an agreed labour rate for every selected line.');
  return {source_item:row.id,unit_rate:percent?null:row.rate,discount_type:row.discount_type,discount_value:row.discount_value};
 });
 if(lines.length!==selected.length)throw Error('A selected source line is unavailable.');
 return {lines,labour_method:state.labour_method,adjustment_percent:state.adjustment_percent || null,
  ...Object.fromEntries(['discount_mode','discount_type','discount_value','gst_mode','gst_percentage'].map(key=>[key,state[key]]))};
}


export function initialWorkOrderMargins(items, order, source) {
 const margin=order?.private_pricing?.margin;
 return {material_mode:order?.material_mode || 'WITH_MATERIAL',margin_mode:margin?.margin_mode || 'LINE',margin_type:margin?.margin_type || 'PERCENTAGE',margin_value:margin?.margin_value ?? '0',
  margins:Object.fromEntries(items.map(item=>{const saved=margin?.lines.find(line=>line.source_item===item.id);return [item.id,{type:saved?.margin_type || 'PERCENTAGE',value:saved?.margin_value ?? '0'}];})),
  source_snapshot:order?.private_pricing?.source_snapshot || null,source_quotation:source?.id || order?.quotation,
  work_order:order?.id,allocation_mode:Boolean(order?.private_pricing?.allocated_item_ids),gst_mode:order?.pricing_quote?.pricing?.gst_mode || 'NO_GST',gst_percentage:order?.pricing_quote?.pricing?.gst_percentage ?? '0',...order?.private_pricing?.sharing_permissions};
}
