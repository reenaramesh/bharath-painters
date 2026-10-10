import { FormField, SectionCard } from './ui';
import QuotationDiscountControls from './QuotationDiscountControls';
import { workOrderPricingItems, workOrderMoney } from '../utils/workOrderPricing.js';

export default function WorkOrderPricingFields({ items, selected, pricing, onChange }) {
 const rows=workOrderPricingItems(items,selected,pricing);
 const update=(name,value)=>onChange(current=>({...current,[name]:value}));
 const percent=pricing.material_mode==='WITHOUT_MATERIAL' && pricing.labour_method==='SELLING_PERCENT';
 return <div className="min-w-0 space-y-4">
  <SectionCard title="Contractor pricing" description="Customer selling references are private. Recipient views and PDF contain only your agreed Work Order values.">
   <p className="mb-3 text-sm text-slate-600">Customer selling references are private. The recipient sees only agreed Work Order values.</p>
   <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <FormField label="Material responsibility" as="select" value={pricing.material_mode} onChange={event=>update('material_mode',event.target.value)}><option value="WITH_MATERIAL">With Material</option><option value="WITHOUT_MATERIAL">Without Material</option></FormField>
    {pricing.material_mode==='WITHOUT_MATERIAL' && <FormField label="Labour pricing method" as="select" value={pricing.labour_method} onChange={event=>update('labour_method',event.target.value)}><option value="DIRECT">Enter labour-only rates</option><option value="SELLING_PERCENT">Percentage of original selling rate</option></FormField>}
    {percent && <FormField label="Labour percentage (private)" type="number" min="0" max="100" step="0.01" value={pricing.adjustment_percent} onChange={event=>update('adjustment_percent',event.target.value)} />}
   </div>
   <div className="mt-4 space-y-3">{rows.map(row=>{
    const source=items.find(item=>item.id===row.id);
    return <fieldset key={row.id} className="min-w-0 rounded-xl border p-3">
     <legend className="max-w-full px-1 text-sm font-semibold">{source.description}</legend>
     <p className="break-words text-sm text-slate-600">{source.quantity} {source.unit_name || 'units'} · {[source.service_name,source.paint_type_name,source.brand_name].filter(Boolean).join(' · ')} · Coats {source.coats || 1}</p>
     <p className="my-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Private customer reference: rate {workOrderMoney(source.rate)} · line amount {workOrderMoney(source.amount)}</p>
     <FormField label={`Agreed ${pricing.material_mode==='WITHOUT_MATERIAL'?'labour ':' '}rate — ${source.description}`} type="number" min="0" step="0.01" required readOnly={percent} value={row.rate} onChange={event=>onChange(current=>({...current,rates:{...current.rates,[current.material_mode]:{...current.rates[current.material_mode],[row.id]:event.target.value}}}))} />
    </fieldset>;
   })}</div>
  </SectionCard>
  <QuotationDiscountControls documentLabel="work order" form={pricing} onChange={update} items={rows} onLineChange={(row,field,value)=>onChange(current=>({...current,discounts:{...current.discounts,[row.id]:{...current.discounts[row.id],[field==='discount_type'?'type':'value']:value}}}))} />
 </div>;
}
