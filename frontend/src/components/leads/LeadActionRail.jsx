import { CalendarClock } from "lucide-react";
import { LEAD_ACTIONS } from "./lead-action-config";

export default function LeadActionRail({ summary, queue, onChoose, loading, error, onRetry, contractor }) {
  const actions = LEAD_ACTIONS.map((action, index) => ({ ...action, index, urgency: summary?.urgency?.[action.key] || {} }))
    .sort((left, right) => (right.urgency.overdue || 0) - (left.urgency.overdue || 0) || (right.urgency.today || 0) - (left.urgency.today || 0) || left.index - right.index);
  return <aside className="lead-panel lead-action-rail" aria-label="Lead action list" aria-busy={loading}>
    <div className="lead-rail-heading"><h2>Action list</h2><CalendarClock size={18} aria-hidden="true" /></div>
    <p className="lead-muted mt-2">{contractor ? "Your team's pending work" : "Your assigned leads"}</p>
    {loading && <p role="status" className="lead-muted mt-2">{summary ? "Refreshing counts…" : "Loading counts…"}</p>}
    {error && <div role="alert" className="lead-rail-error"><p>{error}</p><button type="button" className="lead-inline-button" onClick={onRetry}>Retry counts</button></div>}
    <div className="lead-rail-urgency">{[["overdue", "Overdue"], ["today", "Today"]].map(([key, label]) => <button type="button" key={key} aria-pressed={queue === key} onClick={() => onChoose(key)} className={key === "overdue" ? "is-urgent" : ""}>{label}<strong>{summary?.counts[key] ?? "—"}</strong></button>)}</div>
    <div className="lead-rail-items">{actions.map(({ key, label, icon: Icon, urgency }) => <button type="button" className="lead-rail-item" key={key} onClick={() => onChoose(key)} aria-pressed={queue === key}>
      <Icon size={18} aria-hidden="true" /><span className="lead-rail-item-copy"><span>{label}</span>{Boolean(urgency.overdue || urgency.today) && <span className="lead-rail-badges">{urgency.overdue > 0 && <small className="is-overdue">{urgency.overdue} overdue</small>}{urgency.today > 0 && <small>{urgency.today} today</small>}</span>}</span><strong>{summary?.counts[key] ?? "—"}</strong>
    </button>)}</div>
    <div className="lead-rail-footer"><button type="button" aria-pressed={queue === "active"} onClick={() => onChoose("active")}>All active <strong>{summary?.counts.active ?? "—"}</strong></button>
      {contractor && <button type="button" aria-pressed={queue === "unassigned"} onClick={() => onChoose("unassigned")}>Unassigned <strong>{summary?.counts.unassigned ?? "—"}</strong></button>}
      <button type="button" aria-pressed={queue === "closed"} onClick={() => onChoose("closed")}>Closed history</button>
    </div>
  </aside>;
}
