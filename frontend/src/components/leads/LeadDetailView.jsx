import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarClock, MoreHorizontal, Phone, UserRound } from "lucide-react";
import BackButton from "../BackButton";
import ContractorDialog from "../ContractorDialog";
import { Button } from "../ui";
import LeadFollowUpForm from "./LeadFollowUpForm";
import LeadAssignment from "./LeadAssignment";
import LeadDetailActivity from "./LeadDetailActivity";
import LeadDetailRecords from "./LeadDetailRecords";
import { LeadEditDialog, LeadStatusDialog } from "./LeadDetailForms";
import { LeadDue, LeadStage } from "./lead-ui";
import { sourceLabel } from "./lead-format";
import { money, stageLabel } from "../../utils/opportunityOptions";

const tabs = [["overview", "Overview"], ["activity", "Activity"], ["records", "Linked records"]];
const dialogActions = { "follow-up": "followup", edit: "edit", assignment: "assignment", status: "status", cancel: "status" };
const journey = ["New enquiry", "Contacted", "Visit / area", "Quotation", "Accepted", "Work", "Completed", "Closed"];
function journeyIndex(item) {
  if (item.is_closed && item.workflow_stage === "COMPLETED") return 7;
  return { NEW: 0, CONTACTED: 1, FOLLOW_UP: 1, SITE_VISIT: 2, MEASUREMENT: 2, QUOTATION: 3, NEGOTIATION: 3, WON: item.job_id ? 5 : 4, IN_PROGRESS: 5, COMPLETED: 6 }[item.workflow_stage] ?? 0;
}

export default function LeadDetailView({ item, onSaved, refreshError, onRetry }) {
  const canManage = item.can_manage_lead === true;
  const canFollow = item.can_follow_up === true && !item.is_closed;
  const workStage = ["WON", "IN_PROGRESS", "COMPLETED"].includes(item.workflow_stage);
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState(null);
  const [statusPreset, setStatusPreset] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedRequirement, setExpandedRequirement] = useState(false);
  const [params, setParams] = useSearchParams();
  const requestedAction = params.get("action");
  const tabPrefix = useId();
  const tabRefs = useRef({});
  const followupButton = useRef(null);
  const moreMenu = useRef(null);
  const mounted = useRef(true);
  const action = item.next_action || {};
  const actionIsLocal = !canManage || (action.url || "").split("?")[0] === `/opportunities/${item.id}`;
  const requirement = (item.description || "").trim();
  const terminal = ["LOST", "CANCELLED"].includes(item.workflow_stage);
  const unpaid = item.workflow_stage === "COMPLETED" && !item.is_closed;
  const step = journeyIndex(item);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrentPage = () => mounted.current && window.location.pathname.replace(/\/$/, "") === `/opportunities/${item.id}`;

  useEffect(() => {
    const kind = Object.hasOwn(dialogActions, requestedAction) ? dialogActions[requestedAction] : null;
    if (!kind || (kind === "followup" ? !canFollow : !canManage)) return;
    if (kind === "assignment" && item.can_assign !== true) return;
    if (kind === "status" && (workStage || (requestedAction === "cancel" && item.is_closed))) return;
    setTab("overview");
    const frame = window.requestAnimationFrame(() => {
      if (kind === "followup") followupButton.current?.focus();
      else moreMenu.current?.querySelector("summary")?.focus();
      setStatusPreset(requestedAction === "cancel" ? "CANCELLED" : "");
      setDialog(kind);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedAction, canFollow, canManage, item.can_assign, item.is_closed, workStage]);

  function closeDialog() {
    if (!isCurrentPage()) return;
    setDialog(null);
    const next = new URLSearchParams(window.location.search);
    if (Object.hasOwn(dialogActions, next.get("action"))) {
      next.delete("action");
      setParams(next, { replace: true });
    }
  }
  async function formSaved(message) {
    if (!isCurrentPage()) return null;
    setNotice(message);
    closeDialog();
    return onSaved();
  }
  function openFromMenu(kind) {
    if (moreMenu.current) {
      moreMenu.current.open = false;
      moreMenu.current.querySelector("summary")?.focus();
    }
    setStatusPreset("");
    setDialog(kind);
  }
  function tabKeyDown(event, current) {
    const index = tabs.findIndex(([key]) => key === current);
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    tabRefs.current[tabs[next][0]]?.focus();
  }
  const primaryLabel = action.kind === "SITE_VISIT" ? "Open visit" : action.kind === "WORK" ? "Open schedule"
    : action.kind === "QUOTATION" ? (action.url?.startsWith("/quotations/new") ? "Prepare quotation" : "Open quotation")
      : action.label || "Continue";

  return <div className="lead-workspace lead-detail-workspace">
    <BackButton fallback="/opportunities" label={canManage ? "Back to leads" : "Back to my leads"} />
    <header className="lead-detail-header">
      <div className="lead-detail-heading"><p className="lead-detail-reference">{item.reference_no}{!canManage && item.contractor_name && <span> · {item.contractor_name}</span>}</p>
        <h1>{canManage ? <Link to={`/customers/${item.customer}`}>{item.customer_name}</Link> : item.customer_name}</h1>
        <p className="lead-detail-service">{item.title || item.service_name}</p>
        {item.customer_mobile && <a className="lead-detail-phone" href={`tel:${item.customer_mobile}`} aria-label={`Call ${item.customer_name}: ${item.customer_mobile}`}><Phone size={15} aria-hidden="true" />{item.customer_mobile}</a>}
      </div>
      <div className="lead-detail-header-actions"><LeadStage item={item} /><Button variant="quiet" onClick={() => setDialog("progress")}>View progress</Button>
        {canManage && <details ref={moreMenu} className="lead-detail-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="More lead actions"><MoreHorizontal size={20} aria-hidden="true" /><span>More</span></summary>
          <div><button type="button" onClick={() => openFromMenu("edit")}>Edit lead</button>{!workStage && <button type="button" onClick={() => openFromMenu("status")}>{item.is_closed ? "Reopen enquiry" : "Update enquiry status"}</button>}</div>
        </details>}
      </div>
    </header>
    <div className="lead-detail-owner"><span><UserRound size={15} aria-hidden="true" /><span>Assigned to <strong>{item.assigned_user_name || "Unassigned"}</strong></span></span>{canManage && <button type="button" className="lead-inline-button" onClick={() => setDialog("assignment")}>Change</button>}</div>
    {notice && <p className="lead-detail-notice" role="status">{notice}</p>}
    {refreshError && <div className="lead-form-error" role="alert"><p>{refreshError}</p><button type="button" className="lead-inline-button" onClick={onRetry}>Retry refresh</button></div>}
    {unpaid && <div className="lead-unpaid-alert" role="status"><strong>Work completed · {item.payment_status === "INVOICE_NOT_RAISED" ? "Invoice pending" : "Payment pending"}</strong><p>{canManage ? item.payment_status === "INVOICE_NOT_RAISED" ? "Raise the final invoice to track settlement." : `Outstanding balance: ${money(item.balance_due)}.` : "The contractor is handling invoicing and settlement."}</p></div>}
    <div className="lead-detail-tabs-row"><div role="tablist" aria-label="Lead sections" className="lead-detail-tabs">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" id={`${tabPrefix}-${key}`} aria-controls={`${tabPrefix}-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} ref={element => { tabRefs.current[key] = element; }} onClick={() => setTab(key)} onKeyDown={event => tabKeyDown(event, key)}>{label}</button>)}</div>
      {tab !== "overview" && canFollow && <Button variant="secondary" onClick={() => setDialog("followup")}>Record follow-up</Button>}
    </div>
    <div role="tabpanel" id={`${tabPrefix}-panel-overview`} aria-labelledby={`${tabPrefix}-overview`} tabIndex={0} hidden={tab !== "overview"} className="lead-detail-tab-panel">
      <section className={`lead-panel lead-next-action lead-detail-next-action ${item.queue_flags?.overdue ? "has-overdue" : ""}`} aria-label="Next action">
        <div><p className="lead-detail-eyebrow"><CalendarClock size={15} aria-hidden="true" />{item.is_closed ? "Lead closed" : "Next action"}</p><h2>{item.is_closed ? terminal ? stageLabel(item.workflow_stage) : "Work completed and settled" : action.label || "Plan the next contact"}</h2>{!item.is_closed && action.due_at && <LeadDue item={item} />}</div>
        {item.is_closed ? <Button onClick={() => { setTab("activity"); tabRefs.current.activity?.focus(); }}>View activity</Button>
          : actionIsLocal || !action.url ? canFollow && <Button ref={followupButton} onClick={() => setDialog("followup")}>Record follow-up<ArrowRight size={15} aria-hidden="true" /></Button>
            : <div className="lead-detail-next-buttons"><Link className="lead-primary-action" to={action.url}>{primaryLabel}<ArrowRight size={15} aria-hidden="true" /></Link>{canFollow && <button type="button" ref={followupButton} className="lead-inline-button" onClick={() => setDialog("followup")}>Record follow-up</button>}</div>}
      </section>
      {requirement && <section className="lead-panel lead-detail-section"><h2>Requirement</h2><p className={`lead-detail-requirement ${!expandedRequirement && requirement.length > 240 ? "is-collapsed" : ""}`}>{requirement}</p>{requirement.length > 240 && <button type="button" className="lead-inline-button" aria-expanded={expandedRequirement} onClick={() => setExpandedRequirement(value => !value)}>{expandedRequirement ? "Show less" : "Read more"}</button>}</section>}
      <details className="lead-panel lead-detail-metadata"><summary>Lead details</summary><dl>
        {item.priority && <div><dt>Priority</dt><dd>{stageLabel(item.priority)}</dd></div>}
        {canManage && item.source && <div><dt>Source</dt><dd>{sourceLabel(item.source)}{item.source_detail && <span className="block mt-1">{item.source_detail}</span>}</dd></div>}
        {canManage && item.estimated_value != null && item.estimated_value !== "" && <div><dt>Estimated value</dt><dd>{money(item.estimated_value)}</dd></div>}
        {item.expected_start_date && <div><dt>Expected start</dt><dd>{item.expected_start_date}</dd></div>}
        {item.service_name && item.service_name !== item.title && <div><dt>Service category</dt><dd>{item.service_name}</dd></div>}
        {canManage && item.notes && <div className="lead-full"><dt>Private notes</dt><dd className="whitespace-pre-wrap">{item.notes}</dd></div>}
      </dl></details>
    </div>
    <div role="tabpanel" id={`${tabPrefix}-panel-activity`} aria-labelledby={`${tabPrefix}-activity`} tabIndex={0} hidden={tab !== "activity"} className="lead-detail-tab-panel"><LeadDetailActivity item={item} /></div>
    <div role="tabpanel" id={`${tabPrefix}-panel-records`} aria-labelledby={`${tabPrefix}-records`} tabIndex={0} hidden={tab !== "records"} className="lead-detail-tab-panel"><LeadDetailRecords item={item} canManage={canManage} /></div>
    {canFollow && <LeadFollowUpForm item={item} onSaved={formSaved} dialogOpen={dialog === "followup"} onClose={closeDialog} />}
    {canManage && <>
      <LeadAssignment item={item} onSaved={formSaved} dialogOpen={dialog === "assignment"} onClose={closeDialog} />
      <LeadEditDialog item={item} open={dialog === "edit"} onClose={closeDialog} onSaved={formSaved} />
      {!workStage && <LeadStatusDialog item={item} open={dialog === "status"} presetStage={statusPreset} onClose={closeDialog} onSaved={formSaved} />}
    </>}
    {dialog === "progress" && <ContractorDialog title="Lead progress" onClose={closeDialog}>
      {terminal ? <p className="lead-muted">This enquiry is {stageLabel(item.workflow_stage).toLowerCase()}. See Activity for its history.</p> : <ol className="lead-journey lead-detail-progress">{journey.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index <= step ? "is-reached" : ""}>{label}{index === 2 && <span className="block text-xs">If needed</span>}</li>)}</ol>}
      <div className="lead-record-actions justify-end mt-5"><Button variant="secondary" onClick={closeDialog}>Close</Button></div>
    </ContractorDialog>}
  </div>;
}
