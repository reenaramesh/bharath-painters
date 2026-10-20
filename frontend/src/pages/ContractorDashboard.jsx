import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileText,
  ListTodo,
  MessageCircle,
  Plus,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react";
import useMobileView from "../hooks/useMobileView.js";
import { recentFirst } from "../utils/workspaceLists.js";
import useAuth from "../context/useAuth";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";
import { menuRouteEnabled } from "../utils/menuVisibility";
import { Button, ErrorState, StatusBadge } from "../components/ui";
import {
  PremiumDashboardEmpty,
  PremiumDashboardIcon,
  PremiumDashboardMetric,
  PremiumDashboardPanel,
  PremiumServiceDirectory,
} from "../components/dashboard/PremiumDashboardComponents";
import paintServiceIllustration from "../assets/services/painting.webp";
import "../components/dashboard/premium-dashboard.css";

const money = (value) => `Γé╣${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function PanelLink({ to, children }) {
  return <Link className="contractor-panel-link" to={to}>{children}<ArrowRight size={15} aria-hidden="true" /></Link>;
}

function DateLabel({ value }) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ScheduleLabel({ date, time }) {
  if (!date) return "Time to be confirmed";
  const parsed = new Date(`${date}T${time || "00:00:00"}`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getQuotationStages(quotations) {
  const stageCounts = new Map();
  quotations.forEach((quotation) => {
    if (!quotation.status) return;
    stageCounts.set(quotation.status, (stageCounts.get(quotation.status) || 0) + 1);
  });
  return [...stageCounts].map(([status, count]) => ({ status, count }));
}

function getRevenueByMonth(revenue) {
  const year = Number(revenue?.year) || new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, month) => ({
    month,
    label: new Date(year, month, 1).toLocaleString("en-IN", { month: "short" }),
    amount: 0,
  }));
  (revenue?.receipts || []).forEach((receipt) => {
    const month = Number(String(receipt.date || "").slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    monthly[month].amount += Number(receipt.amount) || 0;
  });
  return monthly;
}

export default function ContractorDashboard({ data = {}, revenue, revenueLoading = false, onRefresh, error, children }) {
  const mobile = useMobileView();
  const { user, menuVisibility } = useAuth();
  const visible = (to) => menuRouteEnabled(user?.role, menuVisibility, to);
  const counts = data.counts || {};
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const visits = Array.isArray(data.site_visits) ? data.site_visits : [];
  const quotations = Array.isArray(data.recent_quotations) ? data.recent_quotations : [];
  const customers = Array.isArray(data.recent_customers) ? data.recent_customers : [];
  const requests = Array.isArray(data.new_requests) ? data.new_requests : [];
  const pipeline = Array.isArray(data.pipeline) ? data.pipeline : [];
  const quotationStages = getQuotationStages(quotations);
  const revenueByMonth = getRevenueByMonth(revenue);
  const maxMonthlyRevenue = Math.max(0, ...revenueByMonth.map((month) => month.amount));
  const dueTasks = Number(counts.due_tasks || 0);
  const showCreateQuotation = visible("/quotations");
  const metrics = [
    { icon: Users, label: "Customers", value: counts.customers, hint: `${counts.active_leads ?? 0} active leads`, to: "/customers", tone: "blue" },
    { icon: Building2, label: "Properties", value: counts.properties, hint: "Connected customer sites", to: "/properties", tone: "sky" },
    { icon: FileText, label: "Quotations", value: counts.quotations, hint: `${money(counts.quotation_value)} total value`, to: "/quotations", tone: "purple" },
    { icon: Banknote, label: "Payments", value: revenue ? money(revenue.total_collected) : revenueLoading ? "ΓÇª" : "ΓÇö", hint: revenue ? `${money(revenue.outstanding)} outstanding` : "Open payment register", to: "/contractor-revenue", tone: "green" },
  ];
  const visibleMetrics = metrics.filter((metric) => visible(metric.to));
  const sortedTasks = mobile ? recentFirst(tasks, ["created_at", "next_follow_up"]) : tasks;
  const pipelineTotal = pipeline.reduce((sum, stage) => sum + Number(stage.count || 0), 0);

  return (
    <div className="contractor-dashboard">
      <header className="contractor-dashboard__hero">
        <div className="contractor-dashboard__hero-copy">
          <p className="contractor-dashboard__eyebrow">Contractor workspace</p>
          <h1>Namaste, {data.contractor_name || "there"}</h1>
          <p className="contractor-dashboard__hero-description">Your customers, painting projects, quotations and next steps, together in one place.</p>
          <div className="contractor-dashboard__hero-actions">
            {showCreateQuotation && <Link className="contractor-dashboard__hero-cta" to="/quotations/new"><Plus size={16} aria-hidden="true" />New quotation</Link>}
            <Button className="contractor-dashboard__hero-refresh" variant="secondary" onClick={onRefresh} aria-label="Refresh contractor dashboard"><RefreshCw size={15} aria-hidden="true" /><span>Refresh</span></Button>
          </div>
        </div>
        <img className="contractor-dashboard__illustration" src={paintServiceIllustration} alt="" aria-hidden="true" width="1024" height="1024" fetchPriority="high" />
      </header>

      {(dueTasks > 0 || data.profile_completion?.percent < 100) && <section className="contractor-dashboard__priority" aria-label="Priority attention">
        {dueTasks > 0 && <div className="contractor-priority-item contractor-priority-urgent">
          <span className="contractor-priority-icon"><CalendarClock size={19} aria-hidden="true" /></span>
          <div><StatusBadge status="OVERDUE" label="Needs attention" /><h2>{dueTasks} follow-up{dueTasks === 1 ? "" : "s"} overdue</h2></div>
          <PanelLink to="/tasks">Review follow-ups</PanelLink>
        </div>}
        {data.profile_completion?.percent < 100 && <Link to="/settings" className="contractor-priority-item contractor-profile-prompt">
          <span className="contractor-priority-icon"><Users size={19} aria-hidden="true" /></span>
          <div><span className="contractor-priority-label">Company profile</span><h2>{data.profile_completion.percent}% complete</h2></div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>}
      </section>}

      {error && <ErrorState message={error} onRetry={onRefresh} />}

      <section className="contractor-dashboard__metrics" aria-label="Workspace overview">
        {visibleMetrics.map((metric) => <PremiumDashboardMetric key={metric.label} {...metric} />)}
      </section>

      {visible("/master-services") && <PremiumServiceDirectory />}

      <MobileDashboardShortcuts mobileOnly={false} />

      <div className="contractor-dashboard__grid">
        <div className="contractor-dashboard__column">
          <PremiumDashboardPanel title="Recent quotations" action={<PanelLink to="/quotations">View all</PanelLink>}>
            {quotations.length ? quotations.map((item) => <Link className="premium-dashboard-quote" key={item.id} to={`/quotations/${item.id}`}>
              <PremiumDashboardIcon icon={FileText} tone="blue" />
              <span className="premium-dashboard-quote__main"><strong>{item.property}</strong><span>{item.customer} ┬╖ {item.number}</span></span>
              <span className="premium-dashboard-quote__side"><StatusBadge status={item.status} /><strong>{money(item.amount)}</strong></span>
            </Link>) : <PremiumDashboardEmpty title="No quotations yet" description="Create a quotation to start a new painting project." />}
            {showCreateQuotation && <Link className="premium-dashboard-create" to="/quotations/new"><Plus size={16} aria-hidden="true" />Create quotation</Link>}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Recent customers" action={<PanelLink to="/customers">Customer directory</PanelLink>}>
            {customers.length ? <div className="premium-dashboard-customers">{customers.map((item) => <Link className="premium-dashboard-record" key={item.id} to={`/customers/${item.id}`}>
              <span className="premium-dashboard-customer-avatar" aria-hidden="true">{item.name?.charAt(0).toUpperCase() || "?"}</span>
              <span className="premium-dashboard-record__content"><strong>{item.name}</strong><span>{[item.mobile, item.city].filter(Boolean).join(" ┬╖ ")}</span></span>
              <StatusBadge status={item.status} />
            </Link>)}</div> : <PremiumDashboardEmpty title="No customers yet" description="Your connected customers will appear here." />}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Customer pipeline" action={<PanelLink to="/customers">Manage customers</PanelLink>}>
            {pipeline.length ? <div className="contractor-dashboard__pipeline">
              <div className="contractor-dashboard__pipeline-track" role="img" aria-label={`Customer pipeline with ${pipelineTotal} customers across ${pipeline.length} stages`}>
                {pipeline.map((stage) => <span key={stage.status} className="contractor-dashboard__pipeline-segment" style={{ flexGrow: Math.max(0, Number(stage.count) || 0) }} title={`${stage.label}: ${stage.count}`} />)}
              </div>
              <ul className="contractor-dashboard__pipeline-list">{pipeline.map((stage) => <li key={stage.status}><span>{stage.label}</span><strong>{stage.count}</strong></li>)}</ul>
              <span className="contractor-dashboard__pipeline-caption">{pipelineTotal} connected customer{pipelineTotal === 1 ? "" : "s"} by current status</span>
            </div> : <PremiumDashboardEmpty title="Pipeline is empty" description="Customer stages will appear as your CRM grows." />}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Quotation pipeline" action={<PanelLink to="/quotations">View quotations</PanelLink>}>
            <p className="premium-dashboard-panel__description">Recent quotation stages use the status values returned by your CRM.</p>
            {quotationStages.length ? <div className="contractor-dashboard__quotation-pipeline">
              <div className="contractor-dashboard__quotation-track" role="img" aria-label={`Recent quotation statuses: ${quotationStages.map((stage) => `${stage.status}, ${stage.count}`).join("; ")}`}>
                {quotationStages.map((stage, index) => <span key={stage.status} className={`contractor-dashboard__quotation-segment contractor-dashboard__quotation-segment--${index % 6}`} style={{ flexGrow: stage.count }} title={`${stage.status}: ${stage.count}`} />)}
              </div>
              <ul className="contractor-dashboard__quotation-list">
                {quotationStages.map((stage) => <li key={stage.status}><span><StatusBadge status={stage.status} /></span><strong>{stage.count}</strong></li>)}
              </ul>
            </div> : <PremiumDashboardEmpty title="No quotation stages yet" description="Quotations will appear here as they enter the CRM." />}
          </PremiumDashboardPanel>
        </div>

        <div className="contractor-dashboard__column">
          <PremiumDashboardPanel title="TodayΓÇÖs schedule" action={<PanelLink to="/site-visits">View calendar</PanelLink>}>
            {visits.length ? <div className="premium-dashboard-schedule">{visits.slice(0, 5).map((visit) => <Link className="premium-dashboard-record" key={visit.id} to={visit.customer_id ? `/customers/${visit.customer_id}` : "/site-visits"}>
              <PremiumDashboardIcon icon={CalendarDays} tone="amber" />
              <span className="premium-dashboard-record__content"><strong>{visit.customer_name}</strong><span>{visit.property_name || visit.opportunity_title || "Site visit"}</span></span>
              <span className="premium-dashboard-record__meta">{ScheduleLabel({ date: visit.scheduled_date, time: visit.scheduled_time })}</span>
            </Link>)}</div> : <PremiumDashboardEmpty title="No scheduled site visits" description="Scheduled visits and measurements will appear here." />}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Follow-ups & reminders" action={<PanelLink to="/tasks">View all</PanelLink>}>
            {sortedTasks.length ? <div className="premium-dashboard-followups">{sortedTasks.slice(0, 5).map((task) => <article className="premium-dashboard-record" key={task.id}>
              <PremiumDashboardIcon icon={task.overdue ? CalendarClock : ListTodo} tone={task.overdue ? "rose" : "purple"} />
              <span className="premium-dashboard-record__content"><Link to={`/customers/${task.customer}`}><strong>{task.customer_name}</strong></Link><span>{task.comment || task.type?.replaceAll("_", " ")}</span><span>{DateLabel({ value: task.next_follow_up })}</span>{task.customer_mobile && <a className="premium-dashboard-record__phone" href={`tel:${task.customer_mobile}`} aria-label={`Call ${task.customer_name} at ${task.customer_mobile}`}><MessageCircle size={13} aria-hidden="true" />{task.customer_mobile}</a>}</span>
              {task.overdue && <StatusBadge status="OVERDUE" label="Overdue" />}
            </article>)}</div> : <PremiumDashboardEmpty title="All caught up" description="New customer follow-ups will show up here." />}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Revenue & payments" action={<PanelLink to="/contractor-revenue">Payment register</PanelLink>}>
            {revenueLoading && !revenue ? <p className="premium-dashboard-loading" role="status">Loading payment summaryΓÇª</p> : revenue ? <>
              <div className="premium-dashboard-revenue-total"><span>Collected this year</span><strong>{money(revenue.total_collected)}</strong><span>{money(revenue.advance_received)} in advances ┬╖ {money(revenue.invoice_payments)} against invoices</span></div>
              <div className="premium-dashboard-revenue-chart" role="img" aria-label={`Monthly receipts for ${revenue.year}: ${revenueByMonth.map((month) => `${month.label} ${money(month.amount)}`).join(", ")}`}>
                {revenueByMonth.map((month) => <div className="premium-dashboard-revenue-month" key={month.month}>
                  <span className="premium-dashboard-revenue-bar-track"><span className="premium-dashboard-revenue-bar" style={{ height: `${maxMonthlyRevenue ? Math.max(3, (month.amount / maxMonthlyRevenue) * 100) : 3}%` }} /></span>
                  <span>{month.label}</span>
                </div>)}
              </div>
            </> : <PremiumDashboardEmpty title="Payment summary unavailable" description="Open the payment register to review receipts and balances." />}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Messages & service requests" action={<PanelLink to="/messages">Open inbox</PanelLink>}>
            <div className="premium-dashboard-followups">
              {[[MessageCircle, "Unread messages", counts.unread_messages, "/messages", "sky"], [BriefcaseBusiness, "New service requests", counts.new_requests, "/service-requests", "amber"], [Banknote, "Active applicators", counts.active_applicators, "/painters", "green"]].map(([Icon, label, value, to, tone]) => visible(to) && <Link className="premium-dashboard-record" key={label} to={to}>
                <PremiumDashboardIcon icon={Icon} tone={tone} />
                <span className="premium-dashboard-record__content"><strong>{label}</strong><span>Open this module to review</span></span>
                <strong className="premium-dashboard-record__meta">{value ?? 0}</strong>
              </Link>)}
            </div>
            {requests.length > 0 && <div className="contractor-dashboard__requests"><h3>Latest new requests</h3>{requests.slice(0, 3).map((request) => <Link key={request.id} to="/service-requests"><span><strong>{request.title}</strong><small>{request.customer}</small></span><StatusBadge status={request.status} /></Link>)}</div>}
          </PremiumDashboardPanel>

          <PremiumDashboardPanel title="Jobs & team" className="contractor-dashboard__jobs-team" action={<PanelLink to="/jobs">Open work network</PanelLink>}>
            <div className="premium-dashboard-team-links">
              {visible("/contractor-network") && <Link className="premium-dashboard-record" to="/contractor-network"><PremiumDashboardIcon icon={Users} tone="purple" /><span className="premium-dashboard-record__content"><strong>Active applicators</strong><span>Team members available in your network</span></span><strong className="premium-dashboard-record__meta">{counts.active_applicators ?? 0}</strong></Link>}
              {visible("/site-visits") && <Link className="premium-dashboard-record" to="/site-visits"><PremiumDashboardIcon icon={CalendarDays} tone="sky" /><span className="premium-dashboard-record__content"><strong>Scheduled site visits</strong><span>Upcoming measurements and appointments</span></span><strong className="premium-dashboard-record__meta">{counts.site_visits ?? visits.length}</strong></Link>}
              {visible("/subcontract-work-orders") && <Link className="premium-dashboard-record" to="/subcontract-work-orders"><PremiumDashboardIcon icon={Wrench} tone="amber" /><span className="premium-dashboard-record__content"><strong>Work orders</strong><span>Assignments and subcontractor jobs</span></span><ArrowRight size={16} aria-hidden="true" /></Link>}
            </div>
          </PremiumDashboardPanel>
        </div>
      </div>

      {children && <div className="contractor-dashboard__footer">{children}<span className="contractor-subscription-note"><CheckCircle2 size={15} aria-hidden="true" />Plan and account details</span></div>}
    </div>
  );
}
