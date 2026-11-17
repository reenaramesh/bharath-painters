import { useEffect, useId, useRef, useState } from "react";
import api from "../../api/client";
import ContractorDialog from "../ContractorDialog";
import { Button } from "../ui";
import { apiDateTime, inputDateTime, localDateTime, requestError } from "../leads/lead-format";
import { CONTACT_METHODS, NEXT_CHOICES, shortcutDate, submissionKey } from "../leads/lead-quick-update";
import { customerCanWork, customerWhatsApp, initialGeneralFollowup } from "./customer-workflow";
import "./customer-followups.css";

export default function GeneralCustomerFollowUp({ customer, draft, onDraftChange, open, onClose, onSaved }) {
  const form = draft || initialGeneralFollowup();
  const [fresh, setFresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const accepted = useRef(false);
  const windowRef = useRef(null);
  const formElement = useRef(null);
  const id = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      try { if (windowRef.current?.location.href === "about:blank") windowRef.current.close(); } catch { /* User owns the opened WhatsApp page. */ }
    };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const request = ++generation.current;
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setError(""); setFresh(null); accepted.current = false;
    api.get(`/quotations/customers/${customer.id}/`, { signal: controller.signal }).then(({ data }) => {
      if (request !== generation.current) return;
      if (!customerCanWork(data)) { setLoadError("This customer is unavailable for follow-ups."); return; }
      setFresh(data);
    }).catch(failure => { if (request === generation.current) setLoadError(requestError(failure, "Customer details could not be refreshed. Please retry.")); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => { generation.current += 1; controller.abort(); };
  }, [customer.id, open, retry]);
  function update(key, value) {
    const next = { ...form, [key]: value, edited: true };
    if (key === "next_choice") next.next_follow_up = value === "custom" ? form.next_follow_up : shortcutDate(value);
    if (key === "next_follow_up") next.next_choice = "custom";
    onDraftChange(next); setError("");
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || accepted.current || !fresh || loading || loadError) return;
    if (!NEXT_CHOICES.some(([key]) => key === form.next_choice)) { setError("Choose a reminder time or No follow-up needed."); formElement.current?.querySelector('input[type="radio"]')?.focus(); return; }
    let due = null;
    if (form.next_choice !== "none") {
      try { due = apiDateTime(form.next_follow_up); } catch { /* Report an invalid custom date below. */ }
      if (!due) { setError("Choose a valid future date and time in India time."); formElement.current?.querySelector('input[type="datetime-local"]')?.focus(); return; }
    }
    if (!due && !form.comment.trim()) { setError("Add a note or choose a reminder time."); formElement.current?.querySelector("textarea")?.focus(); return; }
    if (form.follow_up_type === "SITE_VISIT" && !due) { setError("Choose a future date and time for this site visit."); return; }
    const payload = { follow_up_type: form.follow_up_type, comment: form.comment.trim(), next_follow_up: due };
    const signature = JSON.stringify(payload);
    if (due && Date.parse(due) <= Date.now() && form.submission?.signature !== signature) { setError("Choose a future date and time in India time."); return; }
    const submission = form.submission?.signature === signature ? form.submission : { signature, key: submissionKey() };
    onDraftChange({ ...form, submission });
    const whatsapp = form.follow_up_type === "SITE_VISIT" ? customerWhatsApp(fresh.whatsapp || fresh.mobile) : "";
    const prepared = whatsapp ? window.open("", "_blank") : null;
    if (prepared) prepared.opener = null;
    windowRef.current = prepared;
    lock.current = true; setBusy(true); setError("");
    const request = generation.current;
    try {
      await api.post(`/quotations/customers/${customer.id}/follow-ups/`, { ...payload, creation_key: submission.key });
      if (request !== generation.current || !alive.current) { prepared?.close(); return; }
      accepted.current = true;
      onDraftChange(null);
      let shareReady = false;
      if (whatsapp) {
        const message = `Bharath Apps site visit is scheduled for ${localDateTime(due)}. Please contact the contractor if the schedule needs clarification.`;
        const target = `${whatsapp}?text=${encodeURIComponent(message)}`;
        try {
          if (prepared) { prepared.location.href = target; shareReady = true; }
          else shareReady = Boolean(window.open(target, "_blank", "noopener,noreferrer"));
        } catch { prepared?.close(); /* Sharing is optional after the reminder has been saved. */ }
      }
      windowRef.current = null;
      onClose();
      try { await onSaved(shareReady ? "Site visit saved. WhatsApp is ready for you to send." : "Customer follow-up saved."); }
      catch { /* The parent keeps refresh errors separate from the accepted save. */ }
    } catch (failure) {
      prepared?.close(); windowRef.current = null;
      if (request === generation.current && alive.current) {
        setError(requestError(failure, "The save could not be confirmed. Your entries are retained; retry the same follow-up."));
        if ([401, 403, 404].includes(failure.response?.status)) { setFresh(null); setLoadError("Customer access changed. Refresh before trying again."); }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const close = () => { if (!lock.current) onClose(); };
  if (!open) return null;
  return <ContractorDialog title="General customer follow-up" description="This note or reminder does not change an enquiry’s progress." size="md" onClose={close} popupProtection="handled">
    <div className="customer-general-followup" aria-busy={loading || busy}>
      {loading ? <p role="status">Checking the latest customer details…</p> : loadError ? <div role="alert"><p>{loadError}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry customer details</Button></div>
        : <form ref={formElement} onSubmit={save} noValidate><fieldset disabled={busy}>
          <p className="customer-general-context">{fresh?.name}</p>
          {error && <p role="alert" className="customer-general-error">{error}</p>}
          <label>Contact method<select value={form.follow_up_type} onChange={event => update("follow_up_type", event.target.value)}>{CONTACT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <fieldset className="customer-general-time"><legend>Next follow-up *</legend><div className="customer-general-choices">{NEXT_CHOICES.map(([key, label]) => <label key={key}><input type="radio" name={`${id}-next`} value={key} checked={form.next_choice === key} onChange={() => update("next_choice", key)} /><span>{label}</span></label>)}</div></fieldset>
          {form.next_choice && form.next_choice !== "none" && <label>Date and time · India time<input type="datetime-local" min={inputDateTime(new Date())} value={form.next_follow_up} onChange={event => update("next_follow_up", event.target.value)} /></label>}
          <label>Notes — optional<textarea rows={3} value={form.comment} onChange={event => update("comment", event.target.value)} placeholder="Add a note, a reminder, or both" /></label>
          <p className="customer-general-help">A note or reminder is required. Tomorrow means 10:00 am India time.</p>
          <div className="customer-followup-footer"><Button variant="secondary" onClick={close}>Close</Button><Button type="submit" loading={busy}>Save follow-up</Button></div>
        </fieldset></form>}
      {(loading || loadError) && <div className="customer-followup-footer"><Button variant="secondary" onClick={close}>Close</Button></div>}
    </div>
  </ContractorDialog>;
}
