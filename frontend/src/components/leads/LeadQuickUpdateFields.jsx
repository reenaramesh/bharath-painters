import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui";
import { FOLLOW_UP_OUTCOMES } from "../../utils/opportunityOptions";
import { inputDateTime, localDateTime } from "./lead-format";
import { LeadStage } from "./lead-ui";
import { CONTACT_METHODS, NEXT_CHOICES, pendingFollowups } from "./lead-quick-update";

export default function LeadQuickUpdateFields({ item, form, update, errors, validationAttempt, error, busy, onSubmit, onClose }) {
  const id = useId();
  const root = useRef(null);
  const outcome = useRef(null);
  const [more, setMore] = useState(false);
  const lastValidation = useRef(validationAttempt);
  const pending = pendingFollowups(item);
  const selected = pending.find(task => Number(task.id) === Number(form.completed_task));
  useEffect(() => { outcome.current?.focus(); }, []);
  useEffect(() => {
    if (lastValidation.current === validationAttempt) return undefined;
    lastValidation.current = validationAttempt;
    if (!Object.values(errors).some(Boolean)) return undefined;
    if (errors.completed_task || errors.follow_up_type || errors.next_action) setMore(true);
    const frame = window.requestAnimationFrame(() => {
      const invalid = root.current?.querySelector('[aria-invalid="true"]');
      (invalid?.matches("fieldset") ? invalid.querySelector("input") : invalid)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [errors, validationAttempt]);
  const errorId = key => errors[key] ? `${id}-${key}-error` : undefined;
  const message = key => errors[key] ? <span id={errorId(key)} className="lead-quick-error" role="alert">{errors[key]}</span> : null;
  return <div ref={root}>
    <section className="lead-quick-summary" aria-label="Lead being updated"><div><strong>{item.customer_name}</strong><p>{item.title || item.service_name}</p></div><LeadStage item={item} /></section>
    {selected && <p className="lead-quick-current" role="status"><strong>Completing this follow-up</strong><span>{selected.next_action || "Follow-up"} · {localDateTime(selected.next_follow_up)}</span></p>}
    {error && <p className="lead-form-error" role="alert">{error}</p>}
    <form onSubmit={onSubmit} noValidate><fieldset disabled={busy} className="lead-quick-fields">
      <label className="lead-field"><span>Outcome *</span><select ref={outcome} required value={form.outcome} aria-invalid={Boolean(errors.outcome)} aria-describedby={errorId("outcome")} onChange={event => update("outcome", event.target.value)}><option value="">Choose outcome</option>{FOLLOW_UP_OUTCOMES.filter(([key]) => !["WON", "LOST"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{message("outcome")}</label>
      <fieldset className="lead-quick-next" aria-invalid={Boolean(errors.next_choice)} aria-describedby={errorId("next_choice") || `${id}-date-help`}><legend>Next follow-up *</legend><div className="lead-quick-choices">{NEXT_CHOICES.map(([key, label]) => <label key={key} className={form.next_choice === key ? "is-selected" : ""}><input type="radio" name={`${id}-next-choice`} required value={key} checked={form.next_choice === key} onChange={() => update("next_choice", key)} /><span>{label}</span></label>)}</div>{message("next_choice")}</fieldset>
      {form.next_choice && form.next_choice !== "none" && <label className="lead-field"><span>{form.next_choice === "tomorrow" ? "Tomorrow at 10:00 am · India time" : "Follow-up date and time · India time"}</span><input type="datetime-local" required min={inputDateTime(new Date())} value={form.next_follow_up} aria-invalid={Boolean(errors.next_follow_up)} aria-describedby={errorId("next_follow_up") || `${id}-date-help`} onChange={event => update("next_follow_up", event.target.value)} />{message("next_follow_up")}</label>}
      <p id={`${id}-date-help`} className="lead-muted">{form.next_choice === "none" ? "No new reminder will be added. Other pending actions and visits remain unchanged." : "All dates use India time. Tomorrow schedules 10:00 am."}</p>
      <label className="lead-field"><span>Notes — optional</span><textarea rows={3} value={form.comment} onChange={event => update("comment", event.target.value)} placeholder="Add useful details from the conversation" aria-invalid={Boolean(errors.comment)} aria-describedby={errorId("comment")} />{message("comment")}</label>
      <details open={more} onToggle={event => setMore(event.currentTarget.open)} className="lead-quick-more"><summary>More options</summary><div className="lead-quick-fields">
        <label className="lead-field"><span>Contact method</span><select value={form.follow_up_type} aria-invalid={Boolean(errors.follow_up_type)} aria-describedby={errorId("follow_up_type")} onChange={event => update("follow_up_type", event.target.value)}>{CONTACT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{message("follow_up_type")}</label>
        <label className="lead-field"><span>Reminder text</span><input maxLength={200} disabled={form.next_choice === "none"} value={form.next_action} aria-invalid={Boolean(errors.next_action)} aria-describedby={errorId("next_action")} onChange={event => update("next_action", event.target.value)} />{message("next_action")}</label>
        {(pending.length > 0 || form.completed_task) && <label className="lead-field"><span>Scheduled follow-up to complete</span><select value={form.completed_task} aria-invalid={Boolean(errors.completed_task)} aria-describedby={errorId("completed_task")} onChange={event => update("completed_task", event.target.value)}><option value="">Keep existing follow-ups open</option>{form.completed_task && !selected && <option value={form.completed_task}>Previously selected follow-up — no longer pending</option>}{pending.map(task => <option key={task.id} value={task.id}>{task.next_action || "Follow-up"} · {localDateTime(task.next_follow_up)}</option>)}</select>{message("completed_task")}</label>}
        <p className="lead-muted">Only the selected follow-up is completed. Site visits and other tasks are kept.</p>
      </div></details>
      <div className="lead-quick-footer"><Button type="button" variant="secondary" onClick={onClose}>Close</Button><Button type="submit" loading={busy}>Save update</Button></div>
    </fieldset></form>
  </div>;
}
