import useAuth from "../context/useAuth";
import { menuEnabled, menuRouteEnabled } from "../utils/menuVisibility";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, FileText, MessageCircle, Phone, Plus, ReceiptText, RefreshCw, UserRoundPlus, Users } from "lucide-react";
import { Button, EmptyState, ErrorState, PageHeader, SectionCard, StatCard, StatusBadge } from "../components/ui";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const tools = [
  [UserRoundPlus, "Add customer", "Connect with a customer", "/customers", "add-customer"],
  [FileText, "Create quotation", "Prepare an estimate", "/quotations/new", "new-quotation"],
  [CalendarClock, "Site visits", "Scheduled site visits", "/site-visits"],
  [CalendarDays, "Follow-ups", "Customer follow-ups", "/tasks"],
  [ClipboardList, "Manage work", "Review your work schedules", "/work-schedules"],
];

function PanelLink({ to, children }) {
  return <Link className="contractor-panel-link" to={to}>{children}<ArrowRight size={16} aria-hidden="true" /></Link>;
}

function DateLabel({ value }) {
  return value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Date not set";
}

export default function ContractorDashboard({ data, onRefresh, error, children }) {
  const { user, menuVisibility } = useAuth();
  const visible = (to) => menuRouteEnabled(user?.role, menuVisibility, to);
  const c = data.counts;
  const metrics = [
    [Users, "Customers", c.customers, `${c.active_leads ?? 0} active leads`, "/customers"],
    [Building2, "Properties", c.properties, "Sites in your workspace", "/properties"],
    [FileText, "Quotations", c.quotations, `${money(c.quotation_value)} total value`, "/quotations"],
    [ReceiptText, "Invoices", c.invoices ?? "—", "View your customer invoices", "/invoices"],
  ];
  const dueTasks = Number(c.due_tasks || 0);

  return <div className="contractor-dashboard">
    <PageHeader
      eyebrow="Contractor workspace"
      title={`Namaste, ${data.contractor_name || "there"}`}
      description="A clear view of customer conversations, estimates and upcoming commitments."
      actions={<Button variant="secondary" onClick={onRefresh} aria-label="Refresh contractor dashboard"><RefreshCw size={17} aria-hidden="true" />Refresh</Button>}
    />

    {(dueTasks > 0 || data.profile_completion?.percent < 100) && <section className="contractor-priority" aria-label="Priority attention">
      {dueTasks > 0 && <div className="contractor-priority-item contractor-priority-urgent">
        <span className="contractor-priority-icon"><CalendarClock size={20} aria-hidden="true" /></span>
        <div><StatusBadge status="OVERDUE" label="Needs attention" /><h2>{dueTasks} follow-up{dueTasks === 1 ? "" : "s"} overdue</h2></div>
        <PanelLink to="/tasks">Review follow-ups</PanelLink>
      </div>}
      {data.profile_completion?.percent < 100 && <Link to="/settings" className="contractor-priority-item contractor-profile-prompt">
        <span className="contractor-priority-icon"><Users size={20} aria-hidden="true" /></span>
        <div><span className="contractor-priority-label">Company profile</span><h2>{data.profile_completion.percent}% complete</h2></div>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>}
    </section>}

    {error && <ErrorState message={error} onRetry={onRefresh} />}

    <section className="contractor-overview" aria-label="Workspace overview">
      {metrics.filter((entry) => visible(entry[4])).map(([icon, label, value, hint, to]) => <Link className="contractor-stat-link" key={label} to={to} aria-label={`${label}: ${value ?? 0}. ${hint}`}>
        <StatCard icon={icon} label={label} value={value} hint={hint} />
      </Link>)}
    </section>

    <section className="contractor-quick-actions" aria-labelledby="contractor-actions-title">
      <div className="contractor-section-heading"><div><h2 id="contractor-actions-title">Quick actions</h2></div></div>
      <div className="contractor-tools-grid">{tools.filter((entry) => entry[4] ? menuEnabled(user?.role, menuVisibility, entry[4]) : visible(entry[3])).map(([Icon, label, hint, to]) => <Link key={label} to={to} aria-label={`${label}: ${hint}`}>
        <span className="contractor-icon"><Icon size={21} aria-hidden="true" /></span><span><strong>{label}</strong></span><ArrowRight size={17} aria-hidden="true" />
      </Link>)}</div>
    </section>

    <div className="contractor-workspace">
      <div className="contractor-workspace-column">
      <SectionCard title="Recent quotations" description="Estimates and customer decisions" action={<PanelLink to="/quotations">View all</PanelLink>} className="contractor-panel" bodyClassName="contractor-quote-list">
        {data.recent_quotations.length ? data.recent_quotations.map((item) => <Link className="contractor-quote" key={item.id} to={`/quotations/${item.id}`}>
          <span className="contractor-icon"><FileText size={20} aria-hidden="true" /></span><span className="contractor-quote-main"><strong>{item.property}</strong><span>{item.customer} · {item.number}</span></span><span className="contractor-quote-side"><StatusBadge status={item.status} /><strong>{money(item.amount)}</strong></span>
        </Link>) : <EmptyState title="No quotations yet" description="Create an estimate to start your next project." />}
        <Link className="contractor-inline-action" to="/quotations/new"><Plus size={17} aria-hidden="true" />Create quotation</Link>
      </SectionCard>

      <SectionCard title="Recent customers" description="Your latest customer connections" action={<PanelLink to="/customers">Customer directory</PanelLink>} className="contractor-panel" bodyClassName="contractor-customer-list">
        {data.recent_customers.length ? data.recent_customers.map((item) => <Link className="contractor-customer" key={item.id} to={`/customers/${item.id}`}>
          <span className="contractor-customer-avatar" aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span><span className="contractor-customer-main"><strong>{item.name}</strong><span>{[item.mobile, item.city].filter(Boolean).join(" · ")}</span></span><StatusBadge status={item.status} />
        </Link>) : <EmptyState title="No customers yet" description="Add your first customer to get started." />}
      </SectionCard>
      </div>
      <div className="contractor-workspace-column">
      <SectionCard title="Communication & requests" description="Messages and service requests to review" className="contractor-panel" bodyClassName="contractor-communication">
        {[[MessageCircle, "Unread messages", c.unread_messages, "/messages"], [FileText, "New service requests", c.new_requests, "/service-requests"], [CalendarClock, "Due follow-ups", c.due_tasks, "/tasks"], [CalendarDays, "Site visits", c.site_visits, "/site-visits"]].map(([Icon, label, value, to]) => <Link key={label} to={to}>
          <span className="contractor-icon"><Icon size={19} aria-hidden="true" /></span><span>{label}</span><strong>{value ?? 0}</strong><ArrowRight size={16} aria-hidden="true" />
        </Link>)}
        {data.new_requests?.length > 0 && <div className="contractor-request-list"><h3>Latest new requests</h3>{data.new_requests.map((request) => <Link key={request.id} to="/service-requests"><span><strong>{request.title}</strong><span>{request.customer}</span></span><StatusBadge status={request.status} /></Link>)}</div>}
      </SectionCard>

      <SectionCard title="Upcoming follow-ups" description="Your next customer commitments" action={<PanelLink to="/tasks">View all</PanelLink>} className="contractor-panel" bodyClassName="contractor-timeline">
        {data.tasks.length ? data.tasks.map((task) => <article className={`contractor-task ${task.overdue ? "is-overdue" : ""}`} key={task.id}>
          <span className="contractor-timeline-dot" aria-hidden="true" /><div className="contractor-task-content"><div className="contractor-task-top"><span className="contractor-task-date"><DateLabel value={task.next_follow_up} /></span>{task.overdue && <StatusBadge status="OVERDUE" label="Overdue" />}</div><Link to={`/customers/${task.customer}`}><strong>{task.customer_name}</strong></Link><p>{task.comment || task.type?.replaceAll("_", " ")}</p>{task.customer_mobile && <a className="contractor-call" href={`tel:${task.customer_mobile}`} aria-label={`Call ${task.customer_name} at ${task.customer_mobile}`}><Phone size={15} aria-hidden="true" />{task.customer_mobile}</a>}</div>
        </article>) : <EmptyState title="All caught up" description="There are no pending customer follow-ups." />}
      </SectionCard>

      <SectionCard title="Site visits" action={<PanelLink to="/site-visits">View all</PanelLink>} className="contractor-panel" bodyClassName="contractor-timeline">
        {data.site_visits?.length ? data.site_visits.map((visit) => <Link key={visit.id} to={visit.customer_id ? `/customers/${visit.customer_id}` : "/site-visits"} className="contractor-task"><span className="contractor-icon"><CalendarDays size={20} aria-hidden="true" /></span><span className="contractor-task-content"><strong>{visit.customer_name}</strong><span className="block">{visit.property_name || visit.opportunity_title}</span><span className="contractor-task-date">{visit.scheduled_date}{visit.scheduled_time ? ` ? ${visit.scheduled_time.slice(0, 5)}` : ""}</span></span><StatusBadge status={visit.status} /></Link>) : <EmptyState title="No scheduled site visits" />}
      </SectionCard>
      </div>
    </div>

    <SectionCard title="Lead pipeline" description="Customers by current CRM stage" action={<PanelLink to="/customers">Manage customers</PanelLink>} className="contractor-panel contractor-pipeline" bodyClassName="contractor-pipeline-grid">
      {data.pipeline.length ? data.pipeline.map((item) => <Link to="/customers" key={item.status} className="contractor-pipeline-stage">
        <span className="contractor-pipeline-title"><StatusBadge status={item.status} label={item.label} /><ArrowRight size={14} aria-hidden="true" /></span><strong>{item.count}</strong>
      </Link>) : <EmptyState title="Pipeline is empty" description="Add customers to start tracking your opportunities." />}
    </SectionCard>

    {children && <div className="contractor-subscription">{children}<span className="contractor-subscription-note"><CheckCircle2 size={15} aria-hidden="true" />Plan and account details</span></div>}
  </div>;
}
