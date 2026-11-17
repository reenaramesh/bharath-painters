import { useEffect, useId, useRef, useState } from "react";
import api from "../../api/client";
import ContractorDialog from "../ContractorDialog";
import { Button } from "../ui";
import { apiDateTime, inputDateTime, localDateTime, requestError } from "../leads/lead-format";
import { shortcutDate } from "../leads/lead-quick-update";

export default function TaskRescheduleDialog({ task, draft, onDraftChange, onClose, onSaved }) {
  const [fresh, setFresh] = useState(null);
  const base = fresh || task;
  const form = draft || { next_follow_up: inputDateTime(base.next_follow_up), comment: base.comment || "", edited: false };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  const accepted = useRef(false);
  const id = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setFresh(null);
    api.get("/quotations/tasks/", { signal: controller.signal }).then(({ data }) => {
      if (!active) return;
      const row = (Array.isArray(data) ? data : data.results || []).find(item => Number(item.id) === Number(task.id));
      if (!row || row.can_follow_up === false || row.is_completed) { setLoadError("This reminder is completed or no longer available. Close and refresh Tasks."); return; }
      setFresh(row);
    }).catch(failure => { if (active) setLoadError(requestError(failure, "The current reminder could not be loaded. Please retry.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [task.id, retry]);
  function update(key, value) {
    onDraftChange({ ...form, [key]: value, edited: true, baseline: form.baseline || { next_follow_up: form.next_follow_up, comment: form.comment } });
    setError("");
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || accepted.current || !fresh) return;
    let due;
    try { due = apiDateTime(form.next_follow_up); } catch { /* Validation below keeps the draft. */ }
    if (!due) { setError("Choose a valid date and time in India time."); return; }
    const baseline = form.baseline || { next_follow_up: inputDateTime(fresh.next_follow_up), comment: fresh.comment || "" };
    const changedDate = form.next_follow_up !== baseline.next_follow_up;
    const changedNote = form.comment.trim() !== baseline.comment.trim();
    if (changedDate && Date.parse(due) <= Date.now()) { setError("Choose a future date and time in India time."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { ...(changedDate ? { next_follow_up: due } : {}), ...(changedNote ? { comment: form.comment.trim() } : {}) };
      const data = Object.keys(payload).length ? (await api.patch(`/quotations/tasks/${task.id}/`, payload)).data : fresh;
      if (!alive.current) return;
      accepted.current = true; onDraftChange(null);
      // Once accepted, refreshing the board must not become a retry of PATCH.
      try { await onSaved(data); }
      catch { if (alive.current) setError("Schedule saved. Close and use Retry refresh on Tasks."); }
    } catch (failure) {
      if (alive.current) {
        setError(requestError(failure, "The schedule could not be confirmed. Your entries are retained."));
        if ([401, 403, 404, 409].includes(failure.response?.status)) { setFresh(null); setLoadError("Access to this reminder changed, or it was completed. Refresh before trying again."); }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const close = () => { if (!lock.current) onClose(); };
  return <ContractorDialog title="Reschedule follow-up" description={task.customer_name} size="md" onClose={close} popupProtection="handled">
    <div className="task-reschedule" aria-busy={loading || busy}>
      {loading ? <p role="status">Checking the current reminder…</p> : loadError ? <div role="alert"><p>{loadError}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry reminder</Button></div> : <form onSubmit={save} noValidate><fieldset disabled={busy}>
        <p>Currently scheduled: {localDateTime(fresh.next_follow_up)}</p>
        {error && <p role="alert" id={`${id}-error`} className="text-red-700">{error}</p>}
        <div className="task-reschedule-shortcuts"><Button variant="secondary" onClick={() => update("next_follow_up", shortcutDate("two_hours"))}>In 2 hours</Button><Button variant="secondary" onClick={() => update("next_follow_up", shortcutDate("tomorrow"))}>Tomorrow · 10 am</Button></div>
        <label>Date and time · India time<input type="datetime-local" value={form.next_follow_up} min={inputDateTime(new Date())} onChange={event => update("next_follow_up", event.target.value)} aria-describedby={error ? `${id}-error` : undefined} /></label>
        <label>Notes — optional<textarea rows={3} value={form.comment} onChange={event => update("comment", event.target.value)} /></label>
        <div className="task-reschedule-actions"><Button variant="secondary" onClick={close}>Close</Button><Button type="submit" loading={busy} disabled={accepted.current}>Save schedule</Button></div>
      </fieldset></form>}
      {(loading || loadError) && <Button variant="secondary" onClick={close}>Close</Button>}
    </div>
  </ContractorDialog>;
}
