import { ArrowRight, FileText, MapPin, Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import { money, stageLabel } from "../../utils/opportunityOptions";

function RecordRow({ title, detail, to }) {
  const contents = <><span className="lead-record-copy"><strong>{title}</strong>{detail && <span>{detail}</span>}</span>{to && <ArrowRight size={16} aria-hidden="true" />}</>;
  return to ? <Link className="lead-record-row" to={to}>{contents}</Link> : <div className="lead-record-row">{contents}</div>;
}

export default function LeadDetailRecords({ item, canManage }) {
  const visits = canManage ? item.visits || [] : [];
  const quotes = item.linked_quotations || [];
  const schedules = canManage ? [...new Map((item.work_schedules || []).map(row => [row.id, row])).values()] : [];
  const workStage = ["WON", "IN_PROGRESS", "COMPLETED"].includes(item.workflow_stage);
  const hasRecords = visits.length || quotes.length || schedules.length || (canManage && (item.property || workStage));
  const quotePath = `/quotations/new?customer=${item.customer}&lead=${item.id}${item.property ? `&property=${item.property}` : ""}`;
  return <section className="lead-panel lead-detail-section" aria-label="Linked records">
    <h2>Linked records</h2>
    {canManage && !item.is_closed && <div className="lead-record-create-actions">
      <Link className="lead-secondary-action" to={`/site-visits?opportunity=${item.id}`}><MapPin size={15} aria-hidden="true" />Schedule visit</Link>
      <Link className="lead-secondary-action" to={quotePath}><FileText size={15} aria-hidden="true" />{quotes.length ? "Another quotation" : "Prepare quotation"}</Link>
    </div>}
    {!hasRecords && <p className="lead-muted mt-4">Linked records will appear as this enquiry progresses.</p>}
    {visits.length > 0 && <section className="lead-record-group"><h3>Visits</h3>{visits.map(visit => <RecordRow key={visit.id} title={visit.date} detail={stageLabel(visit.status)} to={`/site-visits?visit=${visit.id}`} />)}</section>}
    {canManage && item.property && <section className="lead-record-group"><h3>Property & area calculations</h3><RecordRow title={item.property_name || "Open property"} to={`/properties/${item.property}`} /><Link className="lead-record-row" to={`/properties/${item.property}/measurements?lead=${item.id}`}><span className="lead-row-heading"><Ruler size={16} aria-hidden="true" />Open area calculations</span><ArrowRight size={16} aria-hidden="true" /></Link></section>}
    {quotes.length > 0 && <section className="lead-record-group"><h3>Quotations</h3>{quotes.map(quote => <RecordRow key={quote.id} title={quote.number} detail={`${stageLabel(quote.status)}${canManage && quote.amount != null ? ` · ${money(quote.amount)}` : ""}`} to={canManage ? `/quotations/${quote.id}` : undefined} />)}</section>}
    {schedules.length > 0 && <section className="lead-record-group"><h3>Work schedules</h3>{schedules.map(schedule => <RecordRow key={schedule.id} title={stageLabel(schedule.status)} detail={[schedule.start, schedule.end].filter(Boolean).join(" to ")} to={`/work-schedules?quotation=${schedule.quotation}`} />)}</section>}
    {canManage && workStage && <section className="lead-record-group"><h3>Payments</h3><RecordRow title={stageLabel(item.payment_status)} detail={item.balance_due != null ? `Balance: ${money(item.balance_due)}` : ""} to={`/customers/${item.customer}/project-account`} /></section>}
  </section>;
}
