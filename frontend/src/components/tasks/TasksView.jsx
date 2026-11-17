import { useId } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Phone, Plus, RefreshCw } from "lucide-react";
import { Button } from "../ui";
import TaskCalendarFilters from "./TaskCalendarFilters";
import { formatTaskDate, initialTaskFilters, rowDueGroup } from "./task-calendar";
import "../../pages/tasks.css";

const SCOPES = [["today", "Today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["all", "All follow-ups"]];
const CATEGORIES = [["all", "All customers"], ["requirements", "Active requirements"], ["serviced", "Services provided"]];
const DUE_LABELS = { today: "Due today", overdue: "Overdue", upcoming: "Upcoming" };

function readable(value) {
  return String(value || "").replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function requirementText(row) {
  const requirement = row.requirement;
  if (typeof requirement === "string" && requirement.trim()) return requirement;
  if (requirement && typeof requirement === "object") return requirement.title || requirement.name || requirement.service_name || requirement.description || "Active requirement";
  if (row.opportunity_title) return row.opportunity_title;
  if (Number(row.active_lead_count) > 0) return `${row.active_lead_count} active requirement${Number(row.active_lead_count) === 1 ? "" : "s"}`;
  return "No active requirement";
}

function DateValue({ value, time = false, fallback }) {
  const label = formatTaskDate(value, { includeTime: time });
  return label ? <time dateTime={String(value)}>{label}</time> : <span className="task-muted">{fallback}</span>;
}

function CustomerRow({ row, scheduled, completingId, onComplete, onMove, onFollowUp }) {
  const customer = row.customer && typeof row.customer === "object" ? row.customer : null;
  const customerId = customer?.id ?? row.customer ?? row.customer_id;
  const customerName = row.customer_name || customer?.name || "Customer name unavailable";
  const mobile = String(row.customer_mobile || customer?.mobile || "").trim();
  const digits = mobile.replace(/\D/g, "");
  const canCall = row.can_follow_up !== false && /^\+?[\d\s().-]+$/.test(mobile) && digits.length >= 10 && digits.length <= 15;
  const canAct = row.can_follow_up !== false && !!customerId;
  const busy = completingId !== null && completingId !== undefined && String(completingId) === String(row.id);
  const dueGroup = rowDueGroup(row);
  const pending = Number(row.pending_follow_up_count);
  const hasPendingCount = row.pending_follow_up_count != null && Number.isFinite(pending) && pending >= 0;
  const hasService = !!row.has_service_history || !!row.last_service_name || !!row.last_service_date;
  const contactDate = formatTaskDate(row.last_contact_at, { includeTime: true });
  return <li className="task-result-item">
    <article className="task-result-row" aria-label={`${customerName}${scheduled ? " follow-up" : " contact history"}`}>
      <div className="task-customer-cell">
        <h3>{customerId ? <Link className="task-customer-link" to={`/customers/${customerId}`}>{customerName}</Link> : customerName}</h3>
        {mobile && <p className="task-muted task-phone">{mobile}</p>}
        <p className="task-requirement"><span className="task-cell-label">Requirement</span>{requirementText(row)}</p>
        {scheduled && row.follow_up_type && <span className="task-type">{readable(row.follow_up_type)}</span>}
        {row.comment && <details className="task-note"><summary>Follow-up note</summary><p>{String(row.comment)}</p></details>}
      </div>
      <dl className="task-history-cell">
        <dt>Last contact attempt</dt>
        <dd>{contactDate ? <time dateTime={row.last_contact_at}>{contactDate}</time> : <span className="task-muted">No contact recorded</span>}</dd>
        {(row.last_contact_outcome || row.last_contact_method) && <dd className="task-muted">{[readable(row.last_contact_outcome), readable(row.last_contact_method)].filter(Boolean).join(" · ")}</dd>}
      </dl>
      <dl className="task-history-cell">
        <dt>Latest service provided</dt>
        <dd>{hasService ? row.last_service_name || "Service recorded" : <span className="task-muted">No services recorded</span>}</dd>
        {hasService && <dd><DateValue value={row.last_service_date} fallback="Date not recorded" /></dd>}
      </dl>
      <dl className="task-history-cell task-next-followup">
        <dt>Next follow-up</dt>
        <dd><DateValue value={row.next_follow_up} time fallback="No follow-up scheduled" /></dd>
        {DUE_LABELS[dueGroup] && <dd><span className={`task-due is-${dueGroup}`}>{DUE_LABELS[dueGroup]}</span></dd>}
        {hasPendingCount && <dd className="task-muted">{pending === 0 ? "No pending reminders" : `${pending} pending reminder${pending === 1 ? "" : "s"}`}</dd>}
      </dl>
      <div className="task-row-actions">
        <Button size="sm" onClick={() => onFollowUp(row)} disabled={!canAct || busy} aria-label={`Add follow-up for ${customerName}`}><Plus aria-hidden="true" />Add follow-up</Button>
        <div className="task-quick-actions">
          {canCall ? <a className="task-action bp-ui-action" href={`tel:${mobile.replace(/[\s().-]/g, "")}`} aria-label={`Call ${customerName}`}><Phone size={16} aria-hidden="true" />Call</a> : <button className="task-action" type="button" disabled title={row.can_follow_up === false ? "This customer is unavailable for follow-up" : "A full phone number is required to call"}><Phone size={16} aria-hidden="true" />Call</button>}
          {scheduled && <>
            <button className="task-action" type="button" disabled={!canAct || busy || row.is_completed === true} onClick={() => onMove(row)} aria-label={`Move follow-up for ${customerName}`}><CalendarClock size={16} aria-hidden="true" />Move</button>
            <button className="task-action" type="button" disabled={!canAct || busy || row.is_completed === true} aria-busy={busy || undefined} onClick={() => onComplete(row)} aria-label={`Complete follow-up for ${customerName}`}><Check size={16} aria-hidden="true" />{busy ? "Saving…" : row.is_completed === true ? "Completed" : "Done"}</button>
          </>}
        </div>
        {canAct && <Link className="task-new-requirement" to={`/opportunities/new?customer=${encodeURIComponent(customerId)}&from=tasks`}>New requirement</Link>}
        {!canAct && <p className="task-help">Customer unavailable for follow-up.</p>}
      </div>
    </article>
  </li>;
}

export default function TasksView({
  view, onViewChange, filters, onFiltersChange, scope, onScopeChange,
  category, onCategoryChange, search, onSearchChange, rows = [], counts = {},
  loading, error, onRetry, notice, onRefresh, page = 1, pageSize = 25, total = 0,
  onPageChange, onPageSizeChange, completingId, onComplete, onMove, onFollowUp,
}) {
  const id = useId();
  const scheduled = view === "scheduled";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!search?.trim() || filters.period !== "all" || (scheduled ? scope !== "today" : category !== "all");
  function resetFilters() {
    onSearchChange("");
    onFiltersChange(initialTaskFilters(view));
    if (scheduled) onScopeChange("all");
    else onCategoryChange("all");
  }
  return <div className="tasks-workspace">
    <header className="task-page-heading">
      <div><h1>Tasks</h1><p>Follow up on time and find customers ready for another conversation.</p></div>
      <Button variant="secondary" onClick={onRefresh} loading={loading}><RefreshCw aria-hidden="true" />Refresh</Button>
    </header>
    <fieldset className="task-view-picker">
      <legend className="task-sr-only">Tasks view</legend>
      {[["scheduled", "Scheduled follow-ups"], ["customers", "Find customers"]].map(([value, label]) => <label key={value} className={`task-view-option${view === value ? " is-selected" : ""}`}>
        <input type="radio" name={`${id}-view`} value={value} checked={view === value} onChange={() => onViewChange(value)} /><span>{label}</span>
      </label>)}
    </fieldset>
    <section className="task-filter-panel" aria-label={scheduled ? "Filter scheduled follow-ups" : "Find customers"}>
      <label className="task-field task-search" htmlFor={`${id}-search`}><span>Search customers</span>
        <input className="bp-ui-control" id={`${id}-search`} type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Name, mobile or Customer ID" autoComplete="off" />
      </label>
      {!scheduled && <fieldset className="task-category-picker">
        <legend>Customer group</legend>
        <div className="task-choice-group">{CATEGORIES.map(([value, label]) => <label className={`task-choice${category === value ? " is-selected" : ""}`} key={value}>
          <input type="radio" name={`${id}-category`} value={value} checked={category === value} onChange={() => onCategoryChange(value)} /><span>{label}</span>
        </label>)}</div>
      </fieldset>}
      <TaskCalendarFilters filters={filters} onFiltersChange={onFiltersChange} />
      {scheduled && <fieldset className="task-scope-picker"><legend>Follow-up due</legend><div className="task-choice-group">
        {SCOPES.map(([value, label]) => <label className={`task-choice${scope === value ? " is-selected" : ""}`} key={value}>
          <input type="radio" name={`${id}-scope`} value={value} checked={scope === value} onChange={() => onScopeChange(value)} /><span>{label}<b className="task-count">{counts[value] ?? 0}</b></span>
        </label>)}
      </div></fieldset>}
    </section>
    {notice && <p className="task-notice" role="status">{typeof notice === "string" ? notice : notice.message}</p>}
    {error && <div className="task-error" role="alert"><p>{typeof error === "string" ? error : "These results could not be loaded. Try again."}</p><Button variant="secondary" onClick={onRetry} disabled={loading}>Retry refresh</Button></div>}
    <section className="task-results" aria-labelledby={`${id}-results`} aria-busy={loading || undefined}>
      <div className="task-results-heading"><h2 id={`${id}-results`} data-task-results-heading tabIndex={-1}>{scheduled ? "Scheduled follow-ups" : "Customers"}</h2>
        <p className="task-muted" role="status">{loading ? "Updating results…" : `${total} ${scheduled ? `follow-up${total === 1 ? "" : "s"}` : `customer${total === 1 ? "" : "s"}`}`}</p>
      </div>
      {rows.length > 0 ? <ul className="task-result-list">{rows.map((row, index) => <CustomerRow key={scheduled ? row.id ?? index : (typeof row.customer === "object" ? row.customer?.id : row.customer) ?? row.customer_id ?? index} row={row} scheduled={scheduled} completingId={completingId} onComplete={onComplete} onMove={onMove} onFollowUp={onFollowUp} />)}</ul> :
        loading ? <div className="task-empty" role="status"><CalendarClock aria-hidden="true" /><p>Loading {scheduled ? "follow-ups" : "customers"}…</p></div> :
          !error && <div className="task-empty"><CalendarClock aria-hidden="true" />
            <h3>{search?.trim() ? `No matches for “${search.trim()}”` : scheduled && scope === "today" && filters.period === "all" ? "No follow-ups due today" : scheduled ? "No follow-ups in this selection" : "No customers in this selection"}</h3>
            <p>{scheduled ? "Find a customer to schedule a follow-up, or widen your date selection." : "Try another customer group, search or date range. You can add a follow-up from any available customer."}</p>
            <div className="task-empty-actions">{hasFilters && <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>}{scheduled && <Button onClick={() => onViewChange("customers")}>Find customers</Button>}</div>
          </div>}
      {total > 0 && <nav className="task-pagination" aria-label={`${scheduled ? "Follow-up" : "Customer"} pages`}>
        <label className="task-page-size" htmlFor={`${id}-size`}>Per page<select className="bp-ui-control" id={`${id}-size`} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{[25, 50, 100].map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
        <p className="task-help">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p>
        <div className="task-pagination-actions"><Button variant="secondary" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} aria-label="Previous page"><ChevronLeft aria-hidden="true" />Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)} aria-label="Next page">Next<ChevronRight aria-hidden="true" /></Button></div>
      </nav>}
    </section>
  </div>;
}
