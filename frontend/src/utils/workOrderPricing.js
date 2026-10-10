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
