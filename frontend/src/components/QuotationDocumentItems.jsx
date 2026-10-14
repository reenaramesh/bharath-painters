import { Eye } from 'lucide-react';
import { quotationItemHeaders, quotationItemPresentation } from '../utils/quotationItemPresentation.js';
import { quotationTotals } from '../utils/quotationPricing.js';
import './quotation-document-items.css';

const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value || 0));
export function QuotationDocumentItemDetails({item,masters,rooms,form}) {
  const values=quotationItemPresentation(item,masters,rooms);
  const line=quotationTotals([item],form).lines[0];
  const fields=[['Service / Product Category',values.category],['Room / Area & Surface',values.roomSurface],['Description',values.description],['Brand / Product',values.brandProduct],['Coats',values.coats],['Sqft',line.quantity],['Unit',item.unit_name || item.custom_unit || (typeof item.unit==='string' ? item.unit : masters?.units?.find(unit=>String(unit.id)===String(item.unit))?.name) || '-'],['Rate',money(item.rate)],...(line.discount > 0 ? [['Gross amount',money(line.amount)],['Line discount',money(line.discount)]] : []),['Total',money(line.net)]];
  return <dl className="quotation-document-detail-grid">{fields.map(([label,value])=><div key={label} className={['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Total'].includes(label)?'is-wide':''}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
export default function QuotationDocumentItems({ items, masters, rooms, form, onView, columnWidths, tableRef, renderResizer, mobileOnly = false }) {
  const totals = quotationTotals(items,form);
  const headers = onView ? quotationItemHeaders : quotationItemHeaders.slice(0,-1);
  const widths = columnWidths || (onView ? [14,15,15,13,6,8,8,12,9] : [16,17,17,15,6,9,9,11]);
  const rows = items.map((item,index) => {
    const values=quotationItemPresentation(item,masters,rooms);
    const unit=item.unit_name || item.custom_unit || (typeof item.unit==='string' && !/^\d+$/.test(item.unit) ? item.unit : masters?.units?.find(entry=>String(entry.id)===String(item.unit))?.name) || 'Sq ft';
    return {item,index,values,unit,cells:[values.category,values.roomSurface,values.description,values.brandProduct,values.coats,totals.lines[index].quantity,money(item.rate),money(totals.lines[index].net)]};
  });
  return <>
    <div className="quotation-document-mobile">{rows.map(({item,index,cells,values,unit})=><article className={onView?'quotation-document-box':''} key={item.id || item.field_id || index}>{onView ? <button className="quotation-document-card" type="button" aria-label={`View work item ${index+1}`} aria-haspopup="dialog" onClick={()=>onView(item,index)}>
      <span className="quotation-document-card-heading">
        <span className="quotation-document-card-header"><span>Item {index+1} · {cells[0]}</span><strong>{cells[7]}</strong></span>
        <span className="quotation-document-card-scope">{values.surfaceRoom}</span>
        <span className="quotation-document-card-product">{values.product}</span>
      </span>
      <span className="quotation-document-card-metrics">{[["Quantity",`${Number(cells[5]).toLocaleString('en-IN',{maximumFractionDigits:2})} ${unit}`],["Rate",cells[6]],["Amount",cells[7]]].map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</span>
    </button> : <dl>{headers.slice(0,8).map((label,column)=><div key={label}><dt>{label}</dt><dd>{cells[column]}</dd></div>)}</dl>}</article>)}</div>
    {!mobileOnly && <div className="quotation-document-region" role="region" aria-label="Quotation item details" tabIndex={0}><table ref={tableRef} className="quotation-document-table" data-mobile-table="keep">
      <colgroup>{widths.map((width,index)=><col key={index} style={{width:`${width}%`}} />)}</colgroup>
      <thead><tr>{headers.map((label,index)=><th key={label} scope="col" className="quotation-resizable-heading">{label}{renderResizer?.(index)}</th>)}</tr></thead>
      <tbody>{rows.map(({item,index,cells})=><tr key={item.id || item.field_id || index}>{cells.map((value,column)=><td key={headers[column]}>{value}</td>)}{onView && <td><button className="bp-ui-icon-action" type="button" aria-label={`View work item ${index+1}`} onClick={()=>onView(item,index)}><Eye size={18} aria-hidden="true" /></button></td>}</tr>)}</tbody>
    </table></div>}
  </>;
}
