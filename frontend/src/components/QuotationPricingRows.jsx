import QuotationDocumentItems from "./QuotationDocumentItems.jsx";
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import useMobileView from '../hooks/useMobileView';
import { QuotationLineItemPopup } from './QuotationLineItemPopup';
import { quotationTotals } from '../utils/quotationPricing.js';
import { quotationLineKey, quotationServiceDetails } from '../utils/quotationServiceDetails.js';
import './quotation-pricing-rows.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
const descriptionFor = item => item.specification_details?.base_description ?? item.description ?? item.specification_details?.name ?? '—';

export default function QuotationPricingRows({ items, form, units, masters = {}, onChange, onEdit, onDelete, popupOnly = false, canEdit = true }) {
  const totals = quotationTotals(items, form);
  const lineMode = ['LINE', 'BOTH'].includes(form.discount_mode);
  const mobile = useMobileView();
  const [selection, setSelection] = useState(null);
  const selectedIndex = selection?.count === items.length ? items.findIndex((item, index) => quotationLineKey(item, index) === selection.key) : -1;
  const renderDiscount = (item, index) => <div className="qp-discount">
    <select className="bp-ui-control" aria-label={`Line ${index + 1} discount type`} disabled={!canEdit || !lineMode} value={item.discount_type || 'FIXED'} onChange={event => onChange(item, 'discount_type', event.target.value)}><option value="PERCENTAGE">%</option><option value="FIXED">₹</option></select>
    <input className="bp-ui-control" placeholder="Enter discount" inputMode="decimal" aria-label={`Line ${index + 1} discount`} disabled={!canEdit || !lineMode} type="number" min="0" max={item.discount_type === 'PERCENTAGE' ? 100 : undefined} step="0.01" value={item.discount_value ?? 0} onChange={event => onChange(item, 'discount_value', event.target.value)} />
  </div>;
  const renderPopup = (item, index) => {
    const values=quotationServiceDetails(item,masters), line=totals.lines[index];
    const quantityLocked=Boolean(item.calculation_method && item.calculation_method !== 'MANUAL') || Boolean(item.specification_details?.kind && item.specification_details.kind !== 'service') || Boolean(item.field_id && item.specification_details?.kind !== 'service');
    return <div className="qp-item-editor">
      <section className="qp-editor-section"><h3>Work details</h3><dl className="qp-editor-details">{[
        ['Service / Product Category',values.category || values.service],['Room / Area & Surface',[values.roomArea,values.surface].filter(Boolean).join(' · ')],['Description',descriptionFor(item)],['Brand / Product',[values.brand,values.product].filter(Boolean).join(' / ')],['Coats',values.coats],
      ].map(([label,value])=><div key={label} className={label === 'Description' ? 'qp-editor-wide' : ''}><dt>{label}</dt><dd>{value == null || value === '' ? 'Not specified' : value}</dd></div>)}</dl></section>
      <section className="qp-editor-section"><h3>Quantity &amp; rate</h3><div className="qp-editor-fields">
        <label>Quantity<input className="bp-ui-control" aria-label={`Line ${index+1} quantity`} disabled={!canEdit} readOnly={quantityLocked} inputMode="decimal" type="number" min="0.01" step="0.01" value={item.quantity ?? ''} placeholder="Enter quantity" onChange={event=>onChange(item,'quantity',event.target.value)} /></label>
        <label>MOU<select className="bp-ui-control" aria-label={`Line ${index+1} unit`} disabled={!canEdit} value={item.unit || ''} onChange={event=>onChange(item,'unit',event.target.value)}><option value="">{item.custom_unit || 'Select unit'}</option>{item.unit && !units.some(unit=>String(unit.id)===String(item.unit)) && <option value={item.unit}>{item.unit_name || 'Saved unit'}</option>}{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label>Rate<input className="bp-ui-control" aria-label={`Line ${index+1} rate`} disabled={!canEdit} type="number" inputMode="decimal" min="0" step="0.01" value={item.rate ?? ''} placeholder="Enter rate" onChange={event=>onChange(item,'rate',event.target.value)} /></label>
      </div></section>
      <section className="qp-editor-section"><h3>Discount &amp; amount</h3><div className="qp-editor-discount"><span>Line discount</span>{renderDiscount(item,index)}</div><dl className="qp-editor-total"><div><dt>Gross amount</dt><dd>{money(line.amount)}</dd></div><div><dt>Discount</dt><dd>{money(line.discount)}</dd></div><div className="qp-editor-net"><dt>Net amount</dt><dd>{money(line.net)}</dd></div></dl></section>
      <div className="qp-item-actions"><button className="bp-ui-icon-action" disabled={!canEdit} type="button" aria-label={`Edit specifications for work item ${index+1}`} title="Edit specifications" onClick={()=>{setSelection(null);onEdit(item);}}><Pencil size={18} aria-hidden="true" /></button>{onDelete && <button disabled={!canEdit} type="button" className="qp-delete-item bp-ui-icon-action" aria-label={`Delete work item ${index+1}`} title="Delete item" onClick={()=>{if(onDelete(item))setSelection(null);}}><Trash2 size={18} aria-hidden="true" /></button>}</div>
    </div>;
  };
  const renderEditableRow = (item, index) => {
    const values = quotationServiceDetails(item, masters);
    return <tr className="qp-item" key={quotationLineKey(item,index)}>
      <td className="qp-service" data-label="Service / Product Category">{values.category || values.service || '—'}</td>
      <td data-label="Room / Area & Surface"><span>{values.roomArea}</span><small>{values.surface || '—'}</small></td>
      <td className="qp-description" data-label="Description">{descriptionFor(item)}</td>
      <td data-label="Brand / Product"><span>{values.brand || '-'}</span><small>{values.product || '-'}</small></td>
      <td data-label="Coats">{values.coats ?? '-'}</td>
      <td data-label="Sqft">{totals.lines[index].quantity}</td>
      <td data-label="Rate">{item.rate === '' || item.rate == null ? '-' : money(Number(item.rate))}</td>
      <td className="qp-net" data-label="Total"><output>{money(totals.lines[index].net)}</output></td>
      <td className="qp-action-cell" data-label="Actions"><div className="qp-item-actions">
        <button className="bp-ui-icon-action" disabled={!canEdit} type="button" aria-label={`Edit specifications for work item ${index+1}`} title="Edit specifications" onClick={()=>onEdit(item)}><Pencil size={16} aria-hidden="true" /></button>
        {onDelete && <button className="qp-delete-item bp-ui-icon-action" disabled={!canEdit} type="button" aria-label={`Delete work item ${index+1}`} title="Delete" onClick={()=>onDelete(item)}><Trash2 size={16} aria-hidden="true" /></button>}
      </div></td>
    </tr>;
  };
  const renderRow = (item, index, editable = true) => {
        const values = quotationServiceDetails(item, masters);
        return <tr className="qp-item" key={quotationLineKey(item, index)}>
          <td className="qp-service" data-label="Service / Product Category">{values.category || values.service || 'Select service category'}{values.category && values.service && values.category !== values.service && <small>{values.service}</small>}</td>
          <td data-label="Room / Area & Surface"><span>{values.roomArea}</span><small>{values.surface || 'Surface not specified'}</small></td>
          <td className="qp-description" data-label="Service / Product details"><p><strong>{values.product || values.service || 'Type not specified'}</strong> | {values.description || item.specification_details?.name || 'Description not specified'}</p><small>Brand: {values.brand || 'Not specified'} | No. of coats: {values.coats ?? 'Not specified'}{item.specification_details?.primer_coats != null && ` / Primer: ${item.specification_details.primer_coats}`}</small></td>
          {editable ? <>
          <td data-label="Qty"><input className="bp-ui-control" disabled={!canEdit} inputMode="decimal" placeholder="Enter quantity" aria-label={`Line ${index + 1} quantity`} type="number" min="0.01" step="0.01" value={item.quantity ?? ''} readOnly={Boolean(item.calculation_method && item.calculation_method !== 'MANUAL') || Boolean(item.specification_details?.kind && item.specification_details.kind !== 'service') || Boolean(item.field_id && item.specification_details?.kind !== 'service')} onChange={event => onChange(item, 'quantity', event.target.value)} /></td>
          <td data-label="Unit"><select className="bp-ui-control" disabled={!canEdit} aria-label={`Line ${index + 1} unit`} value={item.unit || ''} onChange={event => onChange(item, 'unit', event.target.value)}>
            <option value="">{item.custom_unit || 'Select unit'}</option>
            {item.unit && !units.some(unit => String(unit.id) === String(item.unit)) && <option value={item.unit}>{item.unit_name || 'Saved unit'}</option>}
            {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select></td>
          <td data-label="Rate"><input className="bp-ui-control" disabled={!canEdit} placeholder="Enter rate in ₹" inputMode="decimal" aria-label={`Line ${index + 1} rate`} type="number" min="0" step="0.01" value={item.rate ?? ''} onChange={event => onChange(item, 'rate', event.target.value)} /></td>
          <td data-label="Gross"><output>{money(totals.lines[index].amount)}</output></td>
          <td className="qp-discount-cell" data-label="%/₹ · Discount"><div className="qp-discount">
            <select className="bp-ui-control" aria-label={`Line ${index + 1} discount type`} disabled={!canEdit || !lineMode} value={item.discount_type || 'FIXED'} onChange={event => onChange(item, 'discount_type', event.target.value)}><option value="PERCENTAGE">%</option><option value="FIXED">₹</option></select>
            <input className="bp-ui-control" placeholder="Enter discount" inputMode="decimal" aria-label={`Line ${index + 1} discount`} disabled={!canEdit || !lineMode} type="number" min="0" max={item.discount_type === 'PERCENTAGE' ? 100 : undefined} step="0.01" value={item.discount_value ?? 0} onChange={event => onChange(item, 'discount_value', event.target.value)} />
          </div></td>
          </> : <>
          <td data-label="Qty">{totals.lines[index].quantity}</td>
          <td data-label="Unit">{values.unit || units.find(unit => String(unit.id) === String(item.unit))?.name || 'Not specified'}</td>
          <td data-label="Rate">{money(Number(item.rate || 0))}</td>
          <td data-label="Gross"><output>{money(totals.lines[index].amount)}</output></td>
          <td className="qp-discount-cell" data-label="Discount">{renderDiscount(item, index)}</td>
          </>}
          <td className="qp-net" data-label="Net"><output>{money(totals.lines[index].net)}</output></td>
          <td className="qp-action-cell" data-label="Actions"><div className="qp-item-actions">
            <button className="bp-ui-icon-action" disabled={!canEdit} type="button" aria-label={`Edit specifications for work item ${index + 1}`} title="Edit specifications" onClick={() => { setSelection(null); onEdit(item); }}><Pencil size={16} aria-hidden="true" /></button>
            {onDelete && (!popupOnly || editable) && <button disabled={!canEdit} type="button" className="qp-delete-item bp-ui-icon-action" aria-label={`Delete work item ${index + 1}`} title="Delete work item" onClick={() => { if (onDelete(item)) setSelection(null); }}><Trash2 size={16} aria-hidden="true" /></button>}
          </div></td>
        </tr>;
  };
  const renderTable = (entries, editable = true) => <div className="qp-table-region" role="region" aria-label="Quotation item details and pricing" tabIndex={0}><table className={`qp-table qp-complete-table${popupOnly ? '' : ' qp-ordered-table'}`} aria-label="Quotation work-item pricing" data-mobile-table="keep">
    <colgroup>{(popupOnly ? [10,11,20,7,5,8,10,13,10,6] : [14,15,15,13,6,8,8,12,9]).map((width,index)=><col key={index} style={{width:`${width}%`}} />)}</colgroup>
    <thead><tr>{(popupOnly ? ['Service / Product Category','Room / Area & Surface','Service / Product details','Quantity','MOU','Rate','Amount','Discount','Net','Actions'] : ['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Coats','Sqft','Rate','Total','Actions']).map(label=><th key={label} scope="col" data-no-sort="true">{label}</th>)}</tr></thead>
    <tbody>{entries.map(({ item, index }) => popupOnly ? renderRow(item, index, editable) : renderEditableRow(item,index))}</tbody>
  </table></div>;
  return <section className={`qp-pricing${popupOnly ? ' qp-pricing-popup-only' : ''}`} aria-labelledby="quotation-pricing-title">
    <h2 className="bp-ui-section-heading" id="quotation-pricing-title">{popupOnly ? 'Work-item pricing' : 'Editable Pricing'}</h2>
    {mobile ? <>
      <QuotationDocumentItems mobileOnly items={items} masters={{...masters,units}} form={form} onView={(item,index)=>setSelection({key:quotationLineKey(item,index),count:items.length})} />
    </> : renderTable(items.map((item, index) => ({ item, index })), !popupOnly)}
      {selectedIndex >= 0 && <QuotationLineItemPopup className="qp-pricing-popup" index={selectedIndex} description={items[selectedIndex].description || items[selectedIndex].specification_details?.name} editable onClose={() => setSelection(null)}>{renderPopup(items[selectedIndex], selectedIndex)}</QuotationLineItemPopup>}
  </section>;
}
