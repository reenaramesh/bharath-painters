import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { LeadContact, LeadStage } from "./lead-ui";
import { localDateTime } from "./lead-format";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const validDate = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
const followupDate = item => item.is_closed ? null : validDate(item.next_follow_up);

function CreatedDate({ value }) {
  const date = validDate(value);
  return date ? <time dateTime={date.toISOString()} title={localDateTime(value)}>{dateFormatter.format(date)}</time> : <span aria-label="Created date unavailable">—</span>;
}

function FollowupDate({ item }) {
  const date = followupDate(item);
  if (!date) return <span className="lead-list-no-date">Not scheduled</span>;
  const overdue = date.getTime() < Date.now();
  return <div className={`lead-list-followup ${overdue ? "is-overdue" : ""}`}>
    <time dateTime={date.toISOString()}><span>{dateFormatter.format(date)}</span><span>{timeFormatter.format(date)}</span></time>
    {overdue && <span className="lead-list-overdue">Overdue</span>}
  </div>;
}

function LeadListStatus({ item }) {
  const due = validDate(item.next_action?.due_at);
  const followup = followupDate(item);
  const otherOverdue = !item.is_closed && item.queue_flags?.overdue && due && (item.next_action?.kind === "SITE_VISIT" || due.getTime() !== followup?.getTime());
  return <div className="lead-list-status"><LeadStage item={item} />
    {item.queue_flags?.payment_pending && <span className="lead-list-payment">{item.payment_status === "INVOICE_NOT_RAISED" ? "Invoice pending" : "Payment pending"}</span>}
    {otherOverdue && <span className="lead-list-overdue">{item.next_action?.kind === "SITE_VISIT" ? "Visit overdue" : "Action overdue"}<span className="block">{localDateTime(due)}</span></span>}
  </div>;
}

function LeadListMenu({ item, contractor }) {
  const ref = useRef(null);
  const canManage = contractor && item.can_manage_lead === true;
  const canFollow = item.can_follow_up === true && !item.is_closed;
  const canChangeStatus = canManage && !["WON", "IN_PROGRESS", "COMPLETED"].includes(item.workflow_stage);
  const path = `/opportunities/${item.id}`;
  useEffect(() => {
    const closeOutside = event => { if (ref.current && !ref.current.contains(event.target)) ref.current.open = false; };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <details ref={ref} className="lead-list-menu"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
    <summary aria-label={`Actions for ${item.customer_name}: ${item.title}`}><MoreHorizontal size={20} aria-hidden="true" /></summary>
    <div className="lead-list-menu-items">
      <Link to={path}>View lead</Link>
      {canManage && item.next_action?.url && item.next_action.url.split("?")[0] !== path && <Link to={item.next_action.url}>{item.next_action.label || "Next action"}</Link>}
      {canFollow && <Link to={`${path}?action=follow-up`}>Record follow-up</Link>}
      {canManage && <Link to={`${path}?action=edit`}>Edit lead</Link>}
      {canManage && item.can_assign === true && <Link to={`${path}?action=assignment`}>Change assigned person</Link>}
      {canChangeStatus && <Link to={`${path}?action=status`}>{item.is_closed ? "Reopen enquiry" : "Update status"}</Link>}
      {canChangeStatus && !item.is_closed && <Link className="lead-list-cancel" to={`${path}?action=cancel`}>Cancel enquiry</Link>}
    </div>
  </details>;
}

function LeadListActions({ item, contractor, onUpdate }) {
  return <div className="lead-list-actions">{item.can_follow_up === true && !item.is_closed && onUpdate && <button type="button" className="lead-list-update" aria-label={`Update ${item.customer_name}: ${item.title || item.service_name}`} onClick={() => onUpdate(item)}>Update</button>}{item.customer_mobile && <LeadContact item={item} />}<LeadListMenu item={item} contractor={contractor} /></div>;
}

export default function LeadListRecords({ items, contractor, onUpdate }) {
  return <>
    <div className="lead-list-table-wrap"><table className="lead-table lead-compact-table" data-mobile-table="keep">
      <caption className="sr-only">Leads with created date, customer, enquiry, assignment, status and next follow-up. All dates use India time.</caption>
      <colgroup><col style={{ width: "11%" }} /><col style={{ width: "17%" }} /><col style={{ width: "18%" }} /><col style={{ width: "12%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /></colgroup>
      <thead><tr><th scope="col">Created date</th><th scope="col">Customer name</th><th scope="col">Enquiry</th><th scope="col">Assigned</th><th scope="col">Status</th><th scope="col">Next follow-up</th><th scope="col" data-no-sort="true">Actions</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}>
        <td data-sort-value={validDate(item.created_at)?.getTime() ?? ""}><CreatedDate value={item.created_at} /></td>
        <td data-sort-value={item.customer_name}><Link className="lead-title" to={`/opportunities/${item.id}`}>{item.customer_name}</Link></td>
        <td data-sort-value={item.title}><Link className="lead-list-enquiry" to={`/opportunities/${item.id}`}>{item.title || item.service_name}</Link></td>
        <td data-sort-value={item.assigned_user_name || "Unassigned"}><span className="lead-list-assignee">{item.assigned_user_name || "Unassigned"}</span>{!contractor && item.contractor_name && <span className="lead-list-business">{item.contractor_name}</span>}</td>
        <td data-sort-value={item.workflow_stage || item.stage}><LeadListStatus item={item} /></td>
        <td data-sort-value={followupDate(item)?.getTime() ?? ""}><FollowupDate item={item} /></td>
        <td><LeadListActions item={item} contractor={contractor} onUpdate={onUpdate} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="lead-list-cards">{items.map(item => <article className="lead-list-card" key={item.id}>
      <header><span className="lead-list-created"><span>Created</span><CreatedDate value={item.created_at} /></span><LeadListActions item={item} contractor={contractor} onUpdate={onUpdate} /></header>
      <Link className="lead-title" to={`/opportunities/${item.id}`}>{item.customer_name}</Link>
      <p className="lead-list-card-enquiry">{item.title || item.service_name}</p>
      <dl><div><dt>Assigned</dt><dd>{item.assigned_user_name || "Unassigned"}{!contractor && item.contractor_name && <span className="lead-list-business">{item.contractor_name}</span>}</dd></div><div><dt>Status</dt><dd><LeadListStatus item={item} /></dd></div><div className="lead-list-card-followup"><dt>Next follow-up</dt><dd><FollowupDate item={item} /></dd></div></dl>
    </article>)}</div>
  </>;
}
