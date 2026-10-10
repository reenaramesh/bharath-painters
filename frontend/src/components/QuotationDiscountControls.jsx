import { FormField, SectionCard } from './ui';
import { quotationTotals } from '../utils/quotationPricing.js';

const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export default function QuotationDiscountControls({ form, onChange, items, onLineChange, pricing: suppliedPricing, documentLabel = 'quotation' }) {
  const lineMode = form.discount_mode === 'LINE';
  const pricing = suppliedPricing || quotationTotals(items,form);
  return <SectionCard title="Discounts and GST" description="Apply discounts before GST. Choose discounts for each line or one overall discount." className="quotation-financial-controls sm:col-span-2">
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <FormField label="Discount mode" as="select" name="discount_mode" value={form.discount_mode || 'OVERALL'} onChange={event=>onChange('discount_mode',event.target.value)}><option value="OVERALL">Overall {documentLabel}</option><option value="LINE">Each line separately</option></FormField>
      {!lineMode && <>
        <FormField label="Overall discount type" as="select" name="discount_type" value={form.discount_type} onChange={event=>onChange('discount_type',event.target.value)}><option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option></FormField>
        <FormField label="Overall discount" type="number" name="discount_value" min="0" max={form.discount_type === 'PERCENTAGE'?100:undefined} step="0.01" value={form.discount_value} onChange={event=>onChange('discount_value',event.target.value)} />
      </>}
      <FormField label="GST mode" as="select" name="gst_mode" value={form.gst_mode} onChange={event=>onChange('gst_mode',event.target.value)}><option value="GST_EXTRA">GST extra</option><option value="GST_INCLUDED">GST included</option><option value="NO_GST">No GST</option></FormField>
      <FormField label="GST percentage" type="number" name="gst_percentage" min="0" step="0.01" value={form.gst_percentage} onChange={event=>onChange('gst_percentage',event.target.value)} />
    </div>
    {lineMode && <div className="mt-4 space-y-3">{items.map((item,index)=><fieldset key={item.id || item.field_id || index} className="min-w-0 rounded-xl border border-slate-200 p-3">
      <legend className="max-w-full px-1 text-sm font-semibold">{index+1}. {item.specification_details?.name || item.description || 'Quotation line'}</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <FormField label={`Line ${index+1} discount type`} as="select" value={item.discount_type || 'FIXED'} onChange={event=>onLineChange(item,'discount_type',event.target.value)}><option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option></FormField>
        <FormField label={`Line ${index+1} discount`} type="number" min="0" max={item.discount_type === 'PERCENTAGE'?100:undefined} step="0.01" value={item.discount_value ?? 0} onChange={event=>onLineChange(item,'discount_value',event.target.value)} />
      </div>
      <p className="mt-2 text-sm text-slate-600">Gross {money(pricing.lines[index].amount)} · Discount {money(pricing.lines[index].discount)} · Net {money(pricing.lines[index].net)}</p>
    </fieldset>)}</div>}
    <p role="status" className="mt-4 text-sm font-semibold">Subtotal {money(pricing.subtotal)} · Discount {money(pricing.discount)} · GST {money(pricing.gst)} · Total {money(pricing.total)}</p>
  </SectionCard>;
}
