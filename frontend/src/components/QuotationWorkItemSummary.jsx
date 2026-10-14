import { useState } from 'react';
import { Pencil, Plus, Trash2, ChevronRight, Eye } from 'lucide-react';
import { QuotationLineItemPopup } from './QuotationLineItemPopup';
import { quotationTotals } from '../utils/quotationPricing.js';
import { quotationLineKey, quotationServiceDetails } from '../utils/quotationServiceDetails.js';
import { isUnfinishedLumpSumItem } from '../utils/quotationItemValidation.js';
import './quotation-work-item-summary.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

export default function QuotationWorkItemSummary({ items, masters, onEdit, onDelete, onAdd, form, onLineChange, canEdit = true }) {
  const committed = items.filter(item => !isUnfinishedLumpSumItem(item, masters));
  const totals = quotationTotals(committed, form);
  const [selection, setSelection] = useState(null);
  const selectedIndex = selection?.count === committed.length ? committed.findIndex((item, index) => quotationLineKey(item, index) === selection.key) : -1;
  const item = committed[selectedIndex];
  const values = item ? quotationServiceDetails(item, masters) : null;
  const lineMode = form && ['LINE', 'BOTH'].includes(form.discount_mode);
  const roomName = entry => entry.room_name || masters.rooms?.find(room => String(room.id) === String(entry.property_room_id || entry.room))?.name || entry.included_areas?.join(', ') || 'General';
  return <div className="lsq-work-items">
    <div className="lsq-toolbar"><h2 className="bp-ui-section-heading">Services &amp; products</h2><button className="bp-ui-action" type="button" disabled={!canEdit} onClick={onAdd}><Plus size={16} aria-hidden="true" />Add Item</button></div>
    {items.some(entry => isUnfinishedLumpSumItem(entry, masters)) && <p role="status" className="lsq-pending">Unfinished item retained. Choose Add Item to continue editing it.</p>}
    <div className="lsq-desktop-table" role="region" aria-label="Services and products table" tabIndex={0}>
      <table data-mobile-table="keep"><colgroup>{[3,13,16,29,6,6,8,13,6].map((width,index)=><col key={index} style={{width:`${width}%`}} />)}</colgroup><thead><tr>{['No.','Service / Product Category','Room / Area & Surface','Service / Product details','Quantity','MOU','Rate','Amount','Actions'].map(label=><th key={label} scope="col" data-no-sort="true">{label}</th>)}</tr></thead><tbody>{committed.map((entry,index)=>{
        const details=quotationServiceDetails(entry,masters), line=totals.lines[index];
        const complete=entry.rate !== '' && entry.rate != null && Number.isFinite(Number(entry.rate)) && Number(entry.quantity)>0;
        return <tr key={quotationLineKey(entry,index)}><td>{index+1}</td><td>{details.category || details.service || 'Not specified'}</td><td><span>{roomName(entry)}</span><small>{details.surface || 'Surface not specified'}</small></td><td><p><strong>{details.product || details.service || 'Type not specified'}</strong> | {entry.description || 'Description not specified'}</p><small>Brand: {details.brand || 'Not specified'} | No. of coats: {entry.coats ?? 'Not specified'}</small>{entry.calculation_method==='LUMPSUM' && <small>Saved fixed lump sum</small>}</td><td>{line.quantity}</td><td>{details.unit || 'MOU not set'}</td><td>{entry.rate !== '' && entry.rate != null ? money(Number(entry.rate)) : 'Rate not set'}</td><td>{complete ? money(line.amount) : 'Not set'}{form && <small>Discount {money(line.discount)} / Net {money(line.net)}</small>}</td><td><button className="bp-ui-icon-action" type="button" aria-label={`Open work item ${index+1}`} title="View item" aria-haspopup="dialog" onClick={()=>setSelection({key:quotationLineKey(entry,index),count:committed.length})}><Eye size={18} aria-hidden="true" /></button></td></tr>;
      })}</tbody></table>
    </div>
    <ul className="lsq-card-list" aria-label="Lump-sum quotation work items">{committed.map((entry, index) => {
      const details = quotationServiceDetails(entry, masters);
      const complete = entry.rate !== '' && entry.rate != null && Number.isFinite(Number(entry.rate)) && Number(entry.quantity) > 0;
      return <li key={quotationLineKey(entry, index)}><button className="bp-ui-action" type="button" aria-label={`Open work item ${index + 1}`} aria-haspopup="dialog" onClick={() => setSelection({ key: quotationLineKey(entry, index), count: committed.length })}>
        <span className="lsq-card-title">{index + 1}. {details.product || details.service || 'Type not specified'} | {entry.description || 'Description not specified'}</span><ChevronRight size={18} aria-hidden="true" />
        <span className="lsq-card-meta">Service / Product Category: {details.category || details.service || 'Not specified'}</span>
        <span className="lsq-card-meta">{details.surface || 'Surface not specified'}</span>
        <span className="lsq-card-meta">Room / Area: {roomName(entry)}</span>
        <span className="lsq-card-meta">Brand: {details.brand || 'Not specified'} | No. of coats: {entry.coats ?? 'Not specified'}</span>
        <span className="lsq-card-meta">Quantity: {totals.lines[index].quantity} / MOU: {details.unit || 'Not specified'}</span>
        <span className="lsq-card-meta">Rate: {entry.rate !== '' && entry.rate != null ? money(Number(entry.rate)) : 'Rate not set'}</span>
        <span className="lsq-card-amount">Amount <output>{complete ? money(totals.lines[index].amount) : '—'}</output></span>
        {entry.calculation_method === 'LUMPSUM' && <small className="lsq-card-meta">Saved fixed lump sum</small>}
        {form && <span className="lsq-card-net">Line discount {money(totals.lines[index].discount)} · Net {money(totals.lines[index].net)}</span>}
      </button></li>;
    })}</ul>
    {!committed.length && <p className="lsq-empty">Choose Add Item to include a service or product.</p>}
    <div className="lsq-subtotal"><span>Subtotal</span><output>{money(totals.subtotal)}</output></div>
    {!form && <p className="lsq-total-note">Item amounts are before discounts and GST. Final pricing is in Step 3.</p>}
    {item && <QuotationLineItemPopup index={selectedIndex} description={item.description} editable={Boolean(form)} onClose={() => setSelection(null)}>
      <dl className="lsq-details">{[
        ['Service / Product Category', values.category || values.service],
        ['Room / Area', roomName(item)],
        ['Surface Category', values.surface || 'Not specified'],
        ['Service / Product Type', values.product || values.service],
        ['Description', item.description],
        ['Brand', values.brand],
        ['Quantity', totals.lines[selectedIndex].quantity],
        ['MOU', values.unit],
        ['No. of Coats', item.coats],
        ['Rate', money(Number(item.rate))],
        ['Item Amount', money(totals.lines[selectedIndex].amount)],
      ].map(([label, value]) => <div key={label} className={label === 'Description' ? 'lsq-detail-wide' : ''}><dt>{label}</dt><dd>{value == null || value === '' ? 'Not specified' : value}</dd></div>)}</dl>
      {item.calculation_method === 'LUMPSUM' && <p className="lsq-total-note">This saved item uses a fixed lump-sum amount. Its existing calculation is preserved.</p>}
      {form && <div className="lsq-line-discount"><label>Line discount<div className="qp-discount"><select className="bp-ui-control" aria-label={`Line ${selectedIndex + 1} discount type`} disabled={!canEdit || !lineMode} value={item.discount_type || 'FIXED'} onChange={event => onLineChange(item, 'discount_type', event.target.value)}><option value="PERCENTAGE">%</option><option value="FIXED">₹</option></select><input className="bp-ui-control" aria-label={`Line ${selectedIndex + 1} discount`} disabled={!canEdit || !lineMode} type="number" min="0" max={item.discount_type === 'PERCENTAGE' ? 100 : undefined} step="0.01" value={item.discount_value ?? 0} onChange={event => onLineChange(item, 'discount_value', event.target.value)} /></div></label><p>Net amount <output>{money(totals.lines[selectedIndex].net)}</output></p>{!lineMode && <p className="lsq-total-note">Line discounts are retained but inactive in overall-only mode.</p>}</div>}
      <div className="lsq-actions"><button className="bp-ui-action" type="button" disabled={!canEdit} aria-label={`Edit work item ${selectedIndex + 1}`} onClick={() => { setSelection(null); onEdit(item); }}><Pencil size={16} aria-hidden="true" />Edit</button><button type="button" disabled={!canEdit} className="lsq-delete bp-ui-action" aria-label={`Delete work item ${selectedIndex + 1}`} onClick={() => { if (onDelete(item)) setSelection(null); }}><Trash2 size={16} aria-hidden="true" />Delete</button></div>
    </QuotationLineItemPopup>}
  </div>;
}
