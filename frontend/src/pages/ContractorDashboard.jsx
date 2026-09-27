import { Link } from "react-router-dom";
import { ArrowRight, Building2, CalendarClock, FileText, MessageCircle, Paintbrush, Phone, Plus, RefreshCw, Ruler, Users } from "lucide-react";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const tools = [
  [Ruler, "Area estimator", "Measure your next project", "/properties?calculator=1"],
  [FileText, "Create quotation", "Build an estimate & GST", "/quotations/new"],
  [Paintbrush, "Book applicator", "Find your site crew", "/applicator-bookings"],
  [CalendarClock, "Work schedules", "Plan upcoming site work", "/work-schedules"],
];

function Status({ value = "Pending" }) {
  return <span className={`contractor-status ${["WON", "ACCEPTED", "CONVERTED"].includes(value) ? "is-success" : ""}`}>{value.replaceAll("_", " ")}</span>;
}
function Heading({ title, subtitle, to }) {
  return <header className="contractor-panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div><Link to={to}>View all <ArrowRight size={15} /></Link></header>;
}
function Empty({ children }) {
  return <p className="contractor-empty">{children}</p>;
}

export default function ContractorDashboard({ data, onRefresh, error, children }) {
  const c = data.counts;
  const metrics = [
    [Building2, "Customer properties", c.properties, "Sites in your workspace", "/properties"],
    [Paintbrush, "Crew working today", c.active_applicators, "Applicators scheduled today", "/applicator-team"],
    [FileText, "Quotations", c.quotations, `${money(c.quotation_value)} quotation value`, "/quotations"],
    [Users, "Customers", c.customers, `${c.active_leads} active leads`, "/customers"],
  ];
  return <div className="contractor-dashboard">
    <header className="contractor-greeting">
      <div className="contractor-avatar" aria-hidden="true">{(data.contractor_name || "C").charAt(0).toUpperCase()}</div>
      <div className="contractor-greeting-copy"><span className="contractor-eyebrow">Contractor hub · Operational overview</span><h1>Namaste, {data.contractor_name}</h1><p>Your customers, crew and site commitments in one place.</p></div>
      <button className="contractor-button contractor-secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
    </header>
    {error && <p role="alert" className="contractor-error">{error}</p>}
    {c.due_tasks > 0 && <section className="contractor-notice"><CalendarClock size={28} /><div><span className="contractor-eyebrow">Attention required</span><h2>{c.due_tasks} follow-up{c.due_tasks === 1 ? "" : "s"} need your attention</h2><p>Keep customer commitments moving. Review overdue and due callbacks.</p></div><Link className="contractor-button" to="/tasks">Review follow-ups <ArrowRight size={16} /></Link></section>}
    <div className="contractor-metrics">{metrics.map(([Icon, label, value, hint, to]) => <Link key={label} to={to} className="contractor-metric"><div><span className="contractor-eyebrow">{label}</span><span className="contractor-icon"><Icon size={21} /></span></div><strong>{value ?? 0}</strong><p>{hint}</p></Link>)}</div>
    <section className="contractor-tools"><div className="contractor-section-title"><h2>Supervisory tools</h2><span>From estimate to execution</span></div><div className="contractor-tools-grid">{tools.map(([Icon, label, hint, to]) => <Link key={label} to={to}><span className="contractor-icon"><Icon size={23} /></span><div><h3>{label}</h3><p>{hint}</p></div><ArrowRight size={17} /></Link>)}</div></section>
    <div className="contractor-workspace">
      <section className="contractor-panel"><Heading title="Recent quotations" subtitle="Estimates and customer decisions" to="/quotations" /><div className="contractor-quotes">{data.recent_quotations.length ? data.recent_quotations.map(item => <Link className="contractor-quote" key={item.id} to={`/quotations/${item.id}`}><div className="contractor-quote-top"><span className="contractor-icon"><Building2 size={21} /></span><Status value={item.status} /></div><h3>{item.property}</h3><p>{item.customer}</p><div className="contractor-quote-meta"><span>{item.number}</span><strong>{money(item.amount)}</strong></div><div className="contractor-quote-link">Open quotation <ArrowRight size={16} /></div></Link>) : <Empty>No quotations yet. Create an estimate to start your next project.</Empty>}</div><Link className="contractor-add" to="/quotations/new"><Plus size={17} /> Create new quotation</Link></section>
      <section className="contractor-panel"><Heading title="Follow-up timeline" subtitle="Your next customer commitments" to="/tasks" /><div className="contractor-timeline">{data.tasks.length ? data.tasks.map(task => <div className={`contractor-task ${task.overdue ? "is-overdue" : ""}`} key={task.id}><span className="contractor-timeline-dot" /><div><span className="contractor-task-date">{task.overdue ? "Due · " : ""}{new Date(task.next_follow_up).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><Link to={`/customers/${task.customer}`}><h3>{task.customer_name}</h3></Link><p>{task.comment || task.type?.replaceAll("_", " ")}</p>{task.customer_mobile && <a className="contractor-call" href={`tel:${task.customer_mobile}`}><Phone size={13} />{task.customer_mobile}</a>}</div></div>) : <Empty>You're all caught up. No pending follow-ups.</Empty>}</div></section>
    </div>
    <div className="contractor-workspace contractor-lower">
      <section className="contractor-panel"><Heading title="Customer directory" subtitle="Your latest customer connections" to="/customers" />{data.recent_customers.length ? data.recent_customers.map(item => <Link className="contractor-customer" key={item.id} to={`/customers/${item.id}`}><span className="contractor-customer-avatar">{item.name.charAt(0).toUpperCase()}</span><div><h3>{item.name}</h3><p>{[item.mobile, item.city].filter(Boolean).join(" · ")}</p></div><Status value={item.status} /></Link>) : <Empty>No customers yet. Add your first customer to get started.</Empty>}</section>
      <section className="contractor-attention"><span className="contractor-eyebrow">Communication desk</span><h2>Keep every project moving.</h2><p>Respond to requests and stay connected with your customers.</p>{[[MessageCircle, "Unread messages", c.unread_messages, "/messages"], [FileText, "New service requests", c.new_requests, "/service-requests"], [CalendarClock, "Due follow-ups", c.due_tasks, "/tasks"]].map(([Icon, label, value, to]) => <Link key={label} to={to}><Icon size={18} /><span>{label}</span><strong>{value ?? 0}</strong><ArrowRight size={15} /></Link>)}</section>
    </div>
    <section className="contractor-panel contractor-pipeline"><Heading title="Lead pipeline" subtitle="Customers by current CRM stage" to="/customers" /><div>{data.pipeline.length ? data.pipeline.map(item => <Link to="/customers" key={item.status}><span>{item.label}</span><strong>{item.count}</strong></Link>) : <Empty>Add customers to start your pipeline.</Empty>}</div></section>
    {children}
  </div>;
}
