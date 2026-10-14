import { useEffect, useId, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { quotationLineKey, quotationServiceDetails } from '../utils/quotationServiceDetails.js';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import './quotation-line-item-popup.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

export function QuotationMobileLines({ items, masters, totals, pricing = false, onOpen, renderDiscount }) {
  return <ul className="qp-mobile-lines" aria-label="Quotation work items">{items.map((item, index) => {
    const values = quotationServiceDetails(item, masters);
    const line = totals.lines[index];
    const validQuantity = Number(item.quantity) > 0;
    const validPrice = item.rate !== '' && item.rate != null && Number.isFinite(Number(item.rate));
    return <li key={quotationLineKey(item, index)}>
      <button className="bp-ui-action" type="button" aria-label={`Open work item ${index + 1}`} aria-haspopup="dialog" onClick={() => onOpen(index)}>
        <span className="qp-mobile-line-name">{index + 1}. {values.product || values.service || 'Type not specified'} | {item.description || item.specification_details?.name || 'Description not specified'}</span>
        <ChevronRight size={18} aria-hidden="true" />
        <span className="qp-mobile-line-scope">Service / Product Category: {values.category || values.service || 'Not specified'}</span>
        <span className="qp-mobile-line-room">Room / Area: {values.roomArea}</span>
        <span className="qp-mobile-line-room">{values.surface || 'Surface not specified'}</span>
        <span className="qp-mobile-line-scope">Brand: {values.brand || 'Not specified'} | No. of coats: {values.coats ?? 'Not specified'}</span>
        <span className="qp-mobile-line-quantity">Quantity: {validQuantity ? line.quantity : 'Not set'} / MOU: {values.unit || 'Not specified'}{item.calculation_method === 'LUMPSUM' ? ' · Fixed lump sum' : ''}</span>
        {pricing && <span className="qp-mobile-line-scope">Amount: {money(line.amount)}</span>}
        <span className="qp-mobile-line-rate">Rate {validPrice ? money(Number(item.rate)) : 'Not set'}</span>
        <span className="qp-mobile-line-total">{pricing ? 'Net' : 'Total'} <output>{pricing || (validPrice && validQuantity) ? money(pricing ? line.net : line.amount) : '—'}</output></span>
      </button>
      {renderDiscount?.(item, index)}
    </li>;
  })}</ul>;
}

export function QuotationLineItemPopup({ index, description, titleText, footer, editable: _editable = false, children, onClose, popupProtection = "handled", className = "" }) {
  const ref = useRef(null);
  const title = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    dialog.showModal();
    title.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      releaseScrollLock();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  function containFocus(event) {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const controls = [...ref.current.querySelectorAll('button:enabled, a[href], input:enabled:not([type="hidden"]), select:enabled, textarea:enabled, [tabindex="0"]')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === title.current)) {
      event.preventDefault(); controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault(); controls[0]?.focus();
    }
  }
  return <dialog ref={ref} className={`qp-line-popup ${className}`.trim()} aria-labelledby={titleId} data-popup-protection={popupProtection} onKeyDown={containFocus} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header>
      <div><h2 className="bp-ui-section-heading" ref={title} id={titleId} tabIndex={-1}>{titleText || `Work item ${index + 1}`}</h2><p>{description || 'Quotation line item'}</p></div>
      <button className="bp-ui-icon-action" type="button" aria-label="Close work item" onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    <div className="qp-line-popup-body">{children}</div>
    <footer>{footer || <button className="bp-ui-action" type="button" onClick={onClose}>Done</button>}</footer>
  </dialog>;
}
