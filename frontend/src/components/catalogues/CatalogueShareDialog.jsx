import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import useAuth from '../../context/useAuth';
import useDraftUnsavedChanges from '../../hooks/useDraftUnsavedChanges';
import { cancelConfirmation, confirmAction } from '../../utils/confirmAction';
import CustomerContactPicker from '../CustomerContactPicker';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';
import { downloadCatalogue, shareCatalogueFile } from '../../utils/catalogueFiles';
import './catalogue-sharing.css';

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function unavailable(customer) {
  return !customer || customer.account_status === 'DISABLED' || customer.connection_status !== 'CONNECTED';
}

function sendError(failure) {
  if (failure.response?.status === 409) return 'One or more catalogue files have changed or are unavailable. Close this window, refresh your library and choose the files again.';
  if ([403, 404].includes(failure.response?.status)) return 'These files could not be sent. The customer relationship, conversation or catalogue may now be unavailable. Refresh and check the saved customer before retrying.';
  if (failure.response?.status === 429) return 'Too many requests. Your selected customer and message are preserved; wait a moment before retrying.';
  if (typeof failure.response?.data?.detail === 'string') return failure.response.data.detail;
  return failure.response ? 'The catalogues could not be sent. Your customer and message are preserved. Review the selected files and retry.'
    : 'The request could not be confirmed. Your customer and message are preserved. Retry with the same files, customer and message to avoid a duplicate send.';
}

export default function CatalogueShareDialog({ items = [], onClose, onSent }) {
  const { user } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [message, setMessage] = useState('');
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileBusy, setFileBusy] = useState(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const busy = useRef(false);
  const closing = useRef(false);
  const closeOwner = useRef(Symbol('catalogue-share-draft'));
  const fileInProgress = useRef(false);
  const sent = useRef(false);
  const mounted = useRef(true);
  const account = useRef(user?.id);
  account.current = user?.id;
  const previousAccount = useRef(user?.id);
  const safetyResolve = useRef(null);
  const key = useRef(null);
  const allowNavigation = useDraftUnsavedChanges(Boolean(customer || message) && !sent.current);
  const itemsSignature = JSON.stringify(items.map(item => [item.id, item.current_version?.id]));
  const previousItems = useRef(itemsSignature);
  const latestItems = useRef(itemsSignature);
  latestItems.current = itemsSignature;
  if (previousItems.current !== itemsSignature) {
    previousItems.current = itemsSignature;
    key.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelConfirmation(closeOwner.current);
      safetyResolve.current?.(false);
      safetyResolve.current = null;
    };
  }, []);
  useEffect(() => {
    if (previousAccount.current === user?.id) return;
    previousAccount.current = user?.id;
    cancelConfirmation(closeOwner.current);
    key.current = null;
    safetyResolve.current?.(false);
    safetyResolve.current = null;
    setSafetyOpen(false);
    setCustomer(null);
    setMessage('');
    setError('Your account changed. Choose a customer again before sharing.');
  }, [user?.id]);

  const invalidItems = !items.length || items.length > 5 || items.some(item => item.is_archived || !item.current_version?.id)
    || new Set(items.map(item => String(item.current_version?.id))).size !== items.length;

  function safetyDecision(answer) {
    const resolve = safetyResolve.current;
    safetyResolve.current = null;
    setSafetyOpen(false);
    resolve?.(answer);
  }
  async function acknowledgeSafety(conversationId, owner) {
    const safetyKey = `bp-chat-safety-v1-${owner}-${conversationId}`;
    const dueKey = `bp-chat-safety-due-${owner}`;
    let needed = true;
    try { needed = Boolean(localStorage.getItem(dueKey)) || !localStorage.getItem(safetyKey); }
    catch { /* Ask explicitly when browser storage cannot remember acknowledgement. */ }
    if (!needed) return true;
    const accepted = await new Promise(resolve => { safetyResolve.current = resolve; setSafetyOpen(true); });
    if (!accepted || !mounted.current || account.current !== owner) return false;
    try { localStorage.setItem(safetyKey, '1'); localStorage.removeItem(dueKey); }
    catch { /* This send has an explicit acknowledgement even if storage is unavailable. */ }
    return true;
  }

  async function send() {
    if (busy.current || fileInProgress.current || sent.current || !customer || invalidItems) return;
    busy.current = true;
    setSending(true);
    setError('');
    setNotice('');
    const owner = user?.id;
    const chosen = customer;
    const text = message;
    const signature = JSON.stringify([owner, chosen.id, text, itemsSignature]);
    const versionIds = items.map(item => item.current_version.id);
    const active = () => mounted.current && account.current === owner;
    let sentMessage;
    let conversation;
    try {
      if (!key.current || key.current.signature !== signature) key.current = { signature, value: uuid() };
      const sendKey = key.current.value;
      const { data: fresh } = await api.get(`/quotations/customers/${chosen.id}/`);
      if (!active()) return;
      if (unavailable(fresh)) { setError('This saved customer is no longer connected or is unavailable. Choose another saved customer.'); return; }
      setCustomer(fresh);
      const { data } = await api.post('/quotations/chat/conversations/', { customer: fresh.id });
      if (!active()) return;
      conversation = data;
      if (!conversation?.id) throw new Error('The conversation could not be opened. Please retry.');
      if (latestItems.current !== itemsSignature) { setError('Your selected catalogue files changed. Review them before sending again.'); return; }
      if (!await acknowledgeSafety(conversation.id, owner)) return;
      if (!active()) return;
      if (latestItems.current !== itemsSignature) { setError('Your selected catalogue files changed. Review them before sending again.'); return; }
      const response = await api.post(`/quotations/chat/conversations/${conversation.id}/messages/`, {
        text, catalogue_version_ids: versionIds, catalogue_send_key: sendKey,
      });
      if (!active()) return;
      sent.current = true;
      key.current = null;
      sentMessage = response.data;
    } catch (failure) {
      if (active()) setError(sendError(failure));
    } finally {
      busy.current = false;
      if (active()) setSending(false);
    }
    if (sent.current && active()) {
      allowNavigation();
      try { await onSent?.(sentMessage, conversation); }
      catch { /* A view refresh failure must never make an accepted message retryable. */ }
      finally { if (active()) onClose(); }
    }
  }

  async function fileAction(item, operation) {
    if (fileInProgress.current || busy.current) return;
    fileInProgress.current = true;
    const owner = account.current;
    const active = () => mounted.current && account.current === owner;
    setFileBusy(item.id);
    setNotice('');
    setError('');
    try {
      const result = await operation(item);
      if (active()) setNotice(result?.notice || 'File is ready.');
    } catch (failure) {
      if (active()) setError(failure.response?.status === 404 ? 'This file is unavailable. Refresh your library and choose it again.' : failure.message || 'This file could not be opened. Retry or refresh the library.');
    } finally {
      fileInProgress.current = false;
      if (mounted.current) setFileBusy(null);
    }
  }
  const close = async () => {
    if (busy.current || fileInProgress.current || closing.current) return;
    closing.current = true;
    const owner = account.current;
    try {
      if ((customer || message) && !await confirmAction({ question: 'Are you sure you want to discard this catalogue message?', owner: closeOwner.current })) return;
      if (!mounted.current || account.current !== owner) return;
      allowNavigation();
      onClose();
    } finally { closing.current = false; }
  };
  return <>
    <Dialog title="Share catalogue files" description="Send saved file versions to one connected customer in Messages." size="lg" popupProtection="handled" onClose={close}>
      <div className="catalogue-sharing" aria-busy={sending || fileBusy !== null}>
        <p className="catalogue-meta">The shared copies keep these versions even if you update your library later.</p>
        {invalidItems && <p role="alert" className="catalogue-error">Choose between one and five available files from your current library before sending.</p>}
        <ul className="catalogue-selected" aria-label="Files to share">{items.map(item => <li key={item.id}><span className="catalogue-copy"><strong>{item.title}</strong><small>{item.current_version?.file_name || 'No file available'} · Version {item.current_version?.version || 'unavailable'}</small></span></li>)}</ul>
        <div className="catalogue-state"><p className="catalogue-copy"><strong>Customer</strong><span>{customer ? customer.name || 'Selected customer' : 'Choose a saved customer to continue.'}</span></p><Button type="button" variant="secondary" disabled={sending || fileBusy !== null} onClick={() => setChoosingCustomer(true)}>{customer ? 'Change customer' : 'Choose saved customer'}</Button></div>
        <label>Message (optional)<textarea rows={3} maxLength={4000} value={message} disabled={sending || fileBusy !== null} onChange={event => { key.current = null; setMessage(event.target.value); }} placeholder="Add a note about these files" /></label>
        {error && <p role="alert" className="catalogue-error">{error}</p>}
        {notice && <p role="status" aria-live="polite" className="catalogue-state">{notice}</p>}
        {sending && <p role="status">{safetyOpen ? 'Review the message safety information to continue.' : 'Sending catalogue files…'}</p>}
        <div className="catalogue-actions"><Button type="button" variant="secondary" disabled={sending || fileBusy !== null} onClick={close}>Cancel</Button><Button type="button" disabled={!customer || invalidItems || sending || fileBusy !== null || sent.current} onClick={send}>{sending ? 'Sending…' : 'Send in Messages'}</Button></div>
        <section className="catalogue-manual-share" aria-label="Share files with another app"><h3>Share a file manually</h3><p className="catalogue-meta">Choose Share file to open your device’s file sharing options. You can also download a file and attach it manually in WhatsApp. This does not send a message in the app.</p><ul className="catalogue-selected">{items.map(item => <li key={item.id}><span className="catalogue-copy"><strong>{item.title}</strong>{fileBusy === item.id && <small role="status">Preparing file…</small>}</span><div className="catalogue-actions"><Button type="button" variant="secondary" disabled={sending || fileBusy !== null || !item.current_version?.file_url} onClick={() => fileAction(item, shareCatalogueFile)}>Share file</Button><Button type="button" variant="quiet" disabled={sending || fileBusy !== null || !item.current_version?.file_url} onClick={() => fileAction(item, downloadCatalogue)}>Download</Button></div></li>)}</ul></section>
      </div>
    </Dialog>
    {choosingCustomer && <CustomerContactPicker selectionContext="catalogue share" onClose={() => setChoosingCustomer(false)} onSelect={async value => { if (String(customer?.id) !== String(value.id)) key.current = null; setCustomer(value); setError(''); }} />}
    {safetyOpen && <Dialog title="Keep your information safe" description="Bharath Apps · Messages" size="sm" popupProtection="readonly" isolateEvents onClose={() => safetyDecision(false)}>
      <div className="catalogue-sharing"><p>This messenger is not a private channel. Bharath Apps may review reported conversations for safety and support.</p><p>Do not share OTPs, passwords, bank or payment details, identity documents, or other sensitive personal information.</p><p>If someone asks for these details, use the <strong>Report conversation</strong> button at the top of the chat.</p><div className="catalogue-actions"><Button type="button" variant="secondary" onClick={() => safetyDecision(false)}>Cancel</Button><Button type="button" onClick={() => safetyDecision(true)}>I understand · Send</Button></div></div>
    </Dialog>}
  </>;
}
