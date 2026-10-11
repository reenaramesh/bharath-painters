import { quotationTotals } from '../utils/quotationPricing.js';
import './quotation-pricing-rows.css';
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value);
export default function QuotationPricingRows({items,form,units,onChange,onEdit}) {
 const totals=quotationTotals(items,form),lineMode=form.discount_mode==='LINE';
 return <section className="qp-pricing" aria-labelledby="quotation-pricing-title"><h2 id="quotation-pricing-title">Editable Pricing</h2>
 <div className="qp-columns" aria-hidden="true">{['Qty','Unit','Rate','Gross','%/₹','Discount','Net'].map(label=><span key={label}>{label}</span>)}</div>
 {items.map((item,index)=><article className="qp-item" key={item.id || item.field_id || index}>
  <header><h3>{index+1}. {item.specification_details?.name || item.description || 'Work item'}</h3><button type="button" onClick={()=>onEdit(item)}>Edit specifications</button></header>
  <div className="qp-fields">
   <label><span>Qty</span><input aria-label={`Line ${index+1} quantity`} type="number" min="0.01" step="0.01" value={item.quantity ?? ''} readOnly={Boolean(item.calculation_method && item.calculation_method!=='MANUAL') || Boolean(item.specification_details?.kind && item.specification_details.kind!=='service') || Boolean(item.field_id && item.specification_details?.kind!=='service')} onChange={event=>onChange(item,'quantity',event.target.value)}/></label>
   <label><span>Unit</span><select aria-label={`Line ${index+1} unit`} value={item.unit || ''} onChange={event=>onChange(item,'unit',event.target.value)}><option value="">{item.custom_unit || 'Select unit'}</option>{item.unit && !units.some(unit=>String(unit.id)===String(item.unit)) && <option value={item.unit}>{item.unit_name || 'Saved unit'}</option>}{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
   <label><span>Rate</span><input aria-label={`Line ${index+1} rate`} type="number" min="0" step="0.01" value={item.rate ?? ''} onChange={event=>onChange(item,'rate',event.target.value)}/></label>
   <div><span>Gross</span><output>{money(totals.lines[index].amount)}</output></div>
   <div className="qp-discount"><label><span>%/₹</span><select aria-label={`Line ${index+1} discount type`} disabled={!lineMode} value={item.discount_type || 'FIXED'} onChange={event=>onChange(item,'discount_type',event.target.value)}><option value="PERCENTAGE">%</option><option value="FIXED">₹</option></select></label><label><span>Discount</span><input aria-label={`Line ${index+1} discount`} disabled={!lineMode} type="number" min="0" max={item.discount_type==='PERCENTAGE'?100:undefined} step="0.01" value={item.discount_value ?? 0} onChange={event=>onChange(item,'discount_value',event.target.value)}/></label></div>
   <div><span>Net</span><output>{money(totals.lines[index].net)}</output></div>
  </div>
 </article>)}
 {!lineMode && <p className="text-sm text-slate-500">Line discounts are retained but inactive in overall discount mode.</p>}
 </section>;
}
