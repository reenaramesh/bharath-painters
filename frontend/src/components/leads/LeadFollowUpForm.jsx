import { useEffect, useRef, useState } from "react";
import api from "../../api/client";
import useAuth from "../../context/useAuth";
import useDraftUnsavedChanges from "../../hooks/useDraftUnsavedChanges";
import { Button } from "../ui";
import ContractorDialog from "../ContractorDialog";
import { FOLLOW_UP_OUTCOMES } from "../../utils/opportunityOptions";
import { apiDateTime, requestError } from "./lead-format";
import { initialQuickUpdate, pendingFollowups, quickUpdateDirty, NEXT_CHOICES, shortcutDate, submissionKey } from "./lead-quick-update";
import LeadQuickUpdateFields from "./LeadQuickUpdateFields";

export default function LeadFollowUpForm(props) {
  const { user } = useAuth();
  return <LeadFollowUpResource key={`${user?.id}-${props.item.id}`} {...props} />;
}

function LeadFollowUpResource({ item, onSaved, dialogOpen = true, onClose, draft, onDraftChange }) {
  const [internalDraft, setInternalDraft] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadRetry, setLoadRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [validationAttempt, setValidationAttempt] = useState(0);
  const version = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const accepted = useRef(false);
  const form = draft ?? internalDraft;
  const formRef = useRef(form);
  formRef.current = form;
  const saveDraft = onDraftChange || setInternalDraft;
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const allowNavigation = useDraftUnsavedChanges(quickUpdateDirty(form), !onDraftChange, { preservePathname: `/opportunities/${item.id}` });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const request = ++version.current;
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setError(""); setErrors({}); setFresh(null);
    accepted.current = false;
    api.get(`/quotations/leads/${item.id}/`, { signal: controller.signal }).then(({ data }) => {
      if (request !== version.current) return;
      if (data.can_follow_up !== true || data.is_closed) {
        setLoadError("This lead is closed or you no longer have permission to update it.");
        return;
      }
      setFresh(data);
      if (!formRef.current || !quickUpdateDirty(formRef.current)) saveDraftRef.current(initialQuickUpdate(data));
    }).catch(failure => {
      if (request === version.current) setLoadError(requestError(failure, "The latest lead details could not be loaded. Please retry."));
    }).finally(() => { if (request === version.current) setLoading(false); });
    return () => { version.current += 1; controller.abort(); };
  }, [item.id, dialogOpen, loadRetry]);

  function update(key, value) {
    const next = { ...formRef.current, [key]: value, edited: true };
    if (key === "next_choice") next.next_follow_up = value === "custom" ? (formRef.current?.next_follow_up || "") : shortcutDate(value);
    if (key === "next_follow_up") next.next_choice = "custom";
    formRef.current = next; saveDraft(next);
    setErrors(current => ({ ...current, [key]: "", ...(key === "next_choice" ? { next_follow_up: "" } : {}) }));
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (busyRef.current || accepted.current || !fresh || loading || loadError || !form) return;
    const selected = form.completed_task && pendingFollowups(fresh).find(task => Number(task.id) === Number(form.completed_task));
    const invalid = {};
    if (!FOLLOW_UP_OUTCOMES.some(([key]) => key === form.outcome && !["WON", "LOST"].includes(key))) invalid.outcome = "Choose an outcome.";
    if (!NEXT_CHOICES.some(([key]) => key === form.next_choice)) invalid.next_choice = "Choose when to follow up, or choose No follow-up needed.";
    let due = null;
    if (form.next_choice && form.next_choice !== "none") {
      try { due = apiDateTime(form.next_follow_up); } catch { /* Show the error beside the date field. */ }
      if (!due) invalid.next_follow_up = "Choose a future date and time in India time.";
    }
    const payload = { follow_up_type: form.follow_up_type, outcome: form.outcome, comment: form.comment.trim(),
      next_action: due ? form.next_action.trim() || "Follow up with customer" : "", next_follow_up: due, completed_task: form.completed_task ? Number(form.completed_task) : null };
    const signature = JSON.stringify(payload);
    const exactRetry = form.submission?.signature === signature;
    if (due && new Date(due).getTime() <= Date.now() && !exactRetry) invalid.next_follow_up = "Choose a future date and time in India time.";
    // A lost response may be retried after this task was completed by that POST.
    // The server checks the submission key before deciding whether a task is stale.
    if (form.completed_task && !selected && !exactRetry) invalid.completed_task = "That follow-up is no longer pending. Choose another action or keep existing actions open.";
    if (Object.keys(invalid).length) { setErrors(invalid); setValidationAttempt(value => value + 1); return; }
    const submission = form.submission?.signature === signature ? form.submission : { signature, key: submissionKey() };
    const next = { ...form, submission };
    formRef.current = next; saveDraft(next);
    busyRef.current = true; setBusy(true); setError(""); setErrors({});
    const request = version.current;
    try {
      await api.post(`/quotations/leads/${item.id}/follow-ups/`, { ...payload, creation_key: submission.key });
      if (request !== version.current) return;
      accepted.current = true;
      formRef.current = null; saveDraft(null); allowNavigation();
      // Once accepted, a refresh failure must never make this update retryable.
      try { await onSaved("Update saved."); }
      catch { if (request === version.current) setError("Update saved. Close this window and use Retry refresh to reload the lead."); }
    } catch (failure) {
      if (request !== version.current) return;
      setError(requestError(failure, "Update could not be confirmed. Your entries are retained; retry the same update."));
      const data = failure.response?.data;
      if (data && typeof data === "object") {
        setErrors(Object.fromEntries(["outcome", "next_follow_up", "completed_task", "comment", "next_action", "follow_up_type"].filter(key => data[key]).map(key => [key, Array.isArray(data[key]) ? data[key].join(" ") : String(data[key])])));
        setValidationAttempt(value => value + 1);
      }
      if ([401, 403, 404, 409].includes(failure.response?.status)) { setFresh(null); setLoadError("Access or the selected follow-up changed. Reload the latest details before retrying."); }
    } finally {
      busyRef.current = false;
      // Closing the detail dialog retains this resource while refresh finishes.
      // No newer POST can start while busyRef is held by this operation.
      if (mounted.current) setBusy(false);
    }
  }

  const close = () => { if (!busyRef.current) onClose?.(); };
  if (!dialogOpen) return null;
  return <ContractorDialog title="Update lead" description="Record the outcome and plan the next follow-up." size="md" onClose={close} popupProtection="handled">
    <div className="lead-workspace lead-quick-update" aria-busy={loading || busy}>
      {loading ? <p className="lead-muted" role="status">Loading the latest lead details...</p>
        : loadError ? <div className="lead-quick-load-error" role="alert"><p>{loadError}</p><Button variant="secondary" onClick={() => setLoadRetry(value => value + 1)}>Retry latest details</Button></div>
          : fresh && form && <LeadQuickUpdateFields item={fresh} form={form} update={update} errors={errors} validationAttempt={validationAttempt} error={error} busy={busy} onSubmit={save} onClose={close} />}
      {(loading || loadError || !form) && <div className="lead-quick-footer"><Button variant="secondary" onClick={close} disabled={busy}>Close</Button></div>}
      {accepted.current && error && !form && <p className="lead-form-error" role="status">{error}</p>}
    </div>
  </ContractorDialog>;
}
