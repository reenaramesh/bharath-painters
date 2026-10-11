import { useEffect, useRef, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { buildCustomerWelcomeMessage, whatsappNumber } from '../utils/welcomeMessages';

export default function CustomerActivationShare({ customer, contractor, onClose, onRegenerate, busy, error }) {
  const [feedback, setFeedback] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const message = buildCustomerWelcomeMessage(customer, contractor);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${customer.share_link}`);
      setFeedback('Activation link copied.');
    } catch {
      setFeedback('Copy failed. Use WhatsApp or SMS to share the link.');
    }
  }
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto w-[calc(100%-2rem)] max-w-md border-0 bg-transparent p-0 backdrop:bg-slate-950/50" aria-labelledby="customer-share-title" data-popup-readonly>
    <section className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <h2 id="customer-share-title" className="text-xl font-extrabold">{customer.link_purpose === 'CONNECTION' ? 'Connection request ready' : 'Customer activation ready'}</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">{customer.link_purpose === 'CONNECTION' ? 'The customer must approve your connection request.' : 'The customer must complete activation to use the app.'} Opening WhatsApp does not confirm delivery. You can share again from Customers.</p>
      <div className="mt-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{message}</div>
      {customer.share_link && <>
        <p className="mt-3 text-xs text-slate-500">Expires {new Date(customer.link_expires_at).toLocaleString('en-IN')}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a href={`https://wa.me/${whatsappNumber(customer.whatsapp || customer.mobile || customer.customer_mobile)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"><MessageCircle className="h-4 w-4" />Share on WhatsApp</a>
          <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold"><Copy className="h-4 w-4" />Copy Link</button>
          <a href={`sms:${customer.mobile || customer.customer_mobile}?body=${encodeURIComponent(message)}`} className="flex items-center justify-center rounded-xl border px-3 py-3 text-sm font-semibold">Share by SMS</a>
        </div>
        <button type="button" disabled={busy} onClick={onRegenerate} className="mt-3 min-h-11 text-sm font-semibold text-[#176b9b] disabled:opacity-50">{busy ? 'Preparing link...' : 'Generate a new link'}</button>
        <p className="text-xs text-slate-500">A new link replaces the previous link.</p>
      </>}
      {feedback && <p role="status" className="mt-2 text-sm">{feedback}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy} onClick={onClose} className="mt-3 w-full rounded-xl border px-4 py-3 font-bold">Done</button>
    </section>
  </dialog>;
}
