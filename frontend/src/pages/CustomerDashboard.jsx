import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import api from "../api/client";
import CustomerAds from "../components/CustomerAds";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "../components/ui";
import "./customer-dashboard.css";

const quickActions = [
  { label: "My contractors", detail: "Manage connections", to: "/customer/connections", icon: Users },
  { label: "My quotations", detail: "Review estimates", to: "/customer-quotations", icon: FileText },
  { label: "Work progress", detail: "See dates and updates", to: "/work-schedules", icon: CalendarDays },
  { label: "Payments", detail: "View receipts and balances", to: "/customer-invoices", icon: Banknote },
  { label: "Messages", detail: "Talk with your contractors", to: "/messages", icon: MessageCircle },
  { label: "Service requests", detail: "Ask for painting work", to: "/service-requests", icon: ClipboardList },
];

export default function CustomerDashboard() {
  const [data, setData] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [finance, setFinance] = useState(null);
  const [error, setError] = useState("");
  const [supplementalNotice, setSupplementalNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    const [dashboardResult, quotationsResult, financeResult] = await Promise.allSettled([
      api.get("/quotations/customer-portal/dashboard/"),
      api.get("/quotations/customer-portal/quotations/"),
      api.get("/billing/customer-finance/"),
    ]);

    if (dashboardResult.status === "rejected") {
      setError("Your dashboard could not be loaded.");
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    const dashboard = dashboardResult.value.data;
    setData(dashboard);
    const notices = [];
    if (quotationsResult.status === "fulfilled") {
      setQuotations(quotationsResult.value.data || []);
    } else {
      setQuotations([]);
      notices.push("Quotation details are temporarily unavailable.");
    }
    if (financeResult.status === "fulfilled") {
      setFinance(financeResult.value.data);
    } else {
      setFinance(null);
      notices.push("Payment totals are temporarily unavailable.");
    }
    setSupplementalNotice(notices.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.counts || {};
  const today = localDateKey(new Date());
  const quotationsToReview = useMemo(
    () => quotations.filter((item) => ["SENT", "VIEWED"].includes(item.status)),
    [quotations],
  );
  const workItems = useMemo(
    () =>
      quotations
        .filter((item) => {
          if (!item.schedule_start_date) return false;
          if (["CANCELLED", "COMPLETED", "REJECTED"].includes(item.status)) return false;
          return item.schedule_end_date >= today || item.status === "IN_PROGRESS";
        })
        .sort((first, second) =>
          String(first.schedule_start_date).localeCompare(String(second.schedule_start_date)),
        ),
    [quotations, today],
  );
  const awaitingDateConfirmation = workItems.filter((item) =>
    String(item.schedule_status || "").toLowerCase().includes("pending"),
  );
  const pendingConnections =
    counts.pending_connection_requests ?? data?.pending_connection_count ?? 0;
  const paymentDue = Number(finance?.balance_due || 0);
  const attention = [
    pendingConnections > 0 && {
      label: `${pendingConnections} contractor connection ${pendingConnections === 1 ? "request" : "requests"}`,
      detail: "Review who can share work updates and quotations with you.",
      action: "Review requests",
      to: "/customer/connections?tab=pending",
      icon: Users,
      tone: "warning",
    },
    quotationsToReview.length > 0 && {
      label: `${quotationsToReview.length} quotation${quotationsToReview.length === 1 ? "" : "s"} to review`,
      detail: "Check the work, price and terms before you respond.",
      action: "Review quotations",
      to: "/customer-quotations",
      icon: FileText,
      tone: "info",
    },
    awaitingDateConfirmation.length > 0 && {
      label: `${awaitingDateConfirmation.length} work ${awaitingDateConfirmation.length === 1 ? "date" : "dates"} awaiting confirmation`,
      detail: "Open your schedule to see the proposed dates.",
      action: "Check dates",
      to: "/work-schedules",
      icon: CalendarDays,
      tone: "warning",
    },
    paymentDue > 0 && {
      label: "Payment balance due",
      detail: formatMoney(paymentDue),
      action: "View payments",
      to: "/customer-invoices",
      icon: Banknote,
      tone: "warning",
    },
    Number(counts.unread_messages || 0) > 0 && {
      label: `${counts.unread_messages} unread message${counts.unread_messages === 1 ? "" : "s"}`,
      detail: "There may be an update from one of your contractors.",
      action: "Open messages",
      to: "/messages",
      icon: MessageCircle,
      tone: "info",
    },
  ].filter(Boolean);

  if (loading && !data) {
    return <LoadingState label="Loading your home projects…" className="customer-dashboard-loading" />;
  }
  if (loadFailed || !data) {
    return (
      <div className="customer-dashboard-page">
        <ErrorState message={error || "Your dashboard could not be loaded."} onRetry={load} />
      </div>
    );
  }

  const customerIds = (data.customer_bharath_ids || []).filter(Boolean);
  const customerContext = [
    customerIds.length ? `Customer ID ${customerIds.join(" · ")}` : "Your customer account",
    `${counts.properties ?? data.properties?.length ?? 0} saved ${Number(counts.properties ?? data.properties?.length ?? 0) === 1 ? "property" : "properties"}`,
  ].join(" · ");

  return (
    <div className="customer-dashboard-page space-y-4">
      <PageHeader
        eyebrow="Your home projects"
        title={`Welcome back, ${data.customer_name || "there"}`}
        description={customerContext}
        actions={
          <Link to="/customer/profile" aria-label="Profile settings" className="bp-button bp-button-secondary customer-profile-action">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="customer-profile-action-label">Profile settings</span>
          </Link>
        }
      />

      <section className="customer-overview-grid" aria-label="Account overview">
        <StatCard icon={Building2} label="My properties" value={counts.properties || 0} hint="Places connected to your projects" tone="brand" />
        <StatCard icon={Users} label="My contractors" value={counts.contractors || 0} hint="Contractors connected to you" tone="info" />
        <StatCard icon={FileText} label="My quotations" value={counts.quotations || 0} hint="Estimates shared with you" tone="success" />
      </section>

      <MobileDashboardShortcuts />

      {attention.length > 0 ? (
        <SectionCard
          title="Needs your attention"
          description="A few things are ready for you to review."
          className="customer-attention-card"
        >
          <div className="customer-attention-grid">
            {attention.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.to} className={`customer-attention-item is-${item.tone}`}>
                  <span className="customer-attention-icon"><Icon aria-hidden="true" /></span>
                  <span className="customer-attention-copy">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <span className="customer-attention-action">{item.action}<ArrowRight aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        </SectionCard>
      ) : !supplementalNotice ? (
        <div className="customer-all-caught-up" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span><strong>You’re all caught up.</strong> We’ll show new requests, quotes and updates here.</span>
        </div>
      ) : null}

      {supplementalNotice && <p className="customer-dashboard-notice" role="status">{supplementalNotice}</p>}



      <section className="customer-desktop-quick-actions" aria-label="Quick actions">
        <h2>Quick actions</h2>
        <div className="customer-quick-action-grid">
          {quickActions.map(({ label, detail, to, icon: Icon }) => (
            <Link key={to} to={to} className="customer-quick-action">
              <span><Icon aria-hidden="true" /></span>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <CustomerAds />

      <div className="customer-project-grid">
      <SectionCard
        title="Your work"
        description="Upcoming and active projects, with the dates shared by your contractor."
        action={<PanelLink to="/work-schedules" label="View work progress" />}
        className="customer-work-card"
        bodyClassName="p-0"
      >
        {workItems.length ? (
          <div className="customer-record-list">
            {workItems.slice(0, 4).map((item) => (
              <CustomerWorkItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No scheduled work yet"
            description="When a project is scheduled, you’ll see its dates and progress here."
            className="customer-dashboard-empty"
          />
        )}
      </SectionCard>

      <SectionCard
        title="Quotations"
        description="See who sent each estimate, the property, total and what to do next."
        action={<PanelLink to="/customer-quotations" label="View all quotations" />}
        className="customer-quotations-card"
        bodyClassName="p-0"
      >
        {quotations.length ? (
          <div className="customer-record-list">
            {quotations.slice(0, 5).map((item) => (
              <CustomerQuotationItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No quotations yet"
            description="Quotations from connected contractors will appear here."
            className="customer-dashboard-empty"
          />
        )}
      </SectionCard>

      {finance && (
        <SectionCard
          title="Payments"
          description="Totals from your receipts and invoices."
          action={<PanelLink to="/customer-invoices" label="View payments" />}
          className="customer-payments-card"
        >
          <div className="customer-payment-summary">
            <StatCard label="Paid" value={formatMoney(finance.total_paid)} hint="Payments received" tone="success" />
            <StatCard label="Balance due" value={formatMoney(finance.balance_due)} hint={Number(finance.balance_due || 0) > 0 ? "See invoices and payment details" : "No invoice balance due"} tone="warning" />
            <StatCard label="Advance credit" value={formatMoney(finance.advance_credit)} hint="Credit recorded before final invoices" tone="info" />
          </div>
        </SectionCard>
      )}

      </div>

      <div className="customer-dashboard-columns">
        <SectionCard
          title="Service requests"
          description={`${counts.service_requests || 0} request${Number(counts.service_requests) === 1 ? "" : "s"} on your account`}
          action={<PanelLink to="/service-requests" label="View requests" />}
          className="customer-list-card"
          bodyClassName="p-0"
        >
          {data.recent_requests?.length ? (
            <div className="customer-record-list">
              {data.recent_requests.slice(0, 4).map((item) => (
                <SimpleRecord
                  key={item.id}
                  title={item.service_name || item.title || "Painting service"}
                  subtitle={item.contractor_name || "Your contractor"}
                  status={item.status}
                  to="/service-requests"
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No service requests yet" description="Ask for painting work when you’re ready." className="customer-dashboard-empty" />
          )}
        </SectionCard>

        <SectionCard
          title="Your contractors"
          description="People connected to your projects."
          action={<PanelLink to="/customer/connections" label="View connections" />}
          className="customer-list-card"
          bodyClassName="p-0"
        >
          {data.my_contractors?.length ? (
            <div className="customer-record-list">
              {data.my_contractors.slice(0, 4).map((item) => (
                <SimpleRecord
                  key={item.id}
                  title={item.contractor?.business_name || "Connected contractor"}
                  subtitle={`${item.counts?.quotations || 0} quotations · ${item.counts?.active_projects || 0} active projects`}
                  status="CONNECTED"
                  to="/customer/connections"
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No contractors connected yet" description="Review connection requests or find your contractor details." className="customer-dashboard-empty" />
          )}
        </SectionCard>

        <SectionCard
          title="My properties"
          description="Properties your contractors have added for your projects."
          action={<PanelLink to="/customer-properties" label="View properties" />}
          className="customer-list-card"
          bodyClassName="p-0"
        >
          {data.properties?.length ? (
            <div className="customer-record-list">
              {data.properties.slice(0, 4).map((item) => (
                <SimpleRecord
                  key={item.id}
                  title={item.name || item.property_type || "Property"}
                  subtitle={[item.property_type, item.city].filter(Boolean).join(" · ")}
                  to={`/customer-properties/${item.id}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No properties yet" description="Properties will appear when added by your contractor." className="customer-dashboard-empty" />
          )}
        </SectionCard>

        <SectionCard
          title="Support requests"
          description={`${counts.open_tickets || 0} open support request${Number(counts.open_tickets) === 1 ? "" : "s"}`}
          action={<PanelLink to="/support-tickets" label="Get support" />}
          className="customer-list-card"
          bodyClassName="p-0"
        >
          {data.recent_tickets?.length ? (
            <div className="customer-record-list">
              {data.recent_tickets.slice(0, 4).map((item) => (
                <SimpleRecord
                  key={item.id}
                  title={item.subject || "Support request"}
                  subtitle={item.ticket_number || "Support"}
                  status={item.status}
                  to="/support-tickets"
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No support requests" description="If you need help, start a support request." className="customer-dashboard-empty" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function CustomerWorkItem({ item }) {
  return (
    <article className="customer-work-item">
      <span className="customer-work-icon" aria-hidden="true"><CalendarDays /></span>
      <div className="customer-work-main">
        <div className="customer-work-heading">
          <div className="min-w-0">
            <p className="customer-work-kicker">{item.quotation_number || "Current project"}</p>
            <h3>{item.property_name || "Your property"}</h3>
          </div>
          <StatusBadge status={workStatus(item)} label={workStatusLabel(item)} tone={workStatusTone(item)} />
        </div>
        <p className="customer-work-contractor">With {item.contractor_name || "your contractor"}</p>
        <p className="customer-work-dates">
          {formatDashboardDate(item.schedule_start_date)}
          {item.schedule_end_date && item.schedule_end_date !== item.schedule_start_date
            ? ` – ${formatDashboardDate(item.schedule_end_date)}`
            : ""}
        </p>
        <Link to="/work-schedules" className="customer-record-action">View work progress <ArrowRight aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

function CustomerQuotationItem({ item }) {
  const waiting = ["SENT", "VIEWED"].includes(item.status);
  const scheduled = Boolean(item.schedule_start_date);
  return (
    <article className="customer-quotation-item">
      <div className="customer-quotation-main">
        <div className="customer-quotation-heading">
          <div className="min-w-0">
            <p className="customer-quotation-kicker">{item.quotation_number || "Quotation"}</p>
            <h3>{item.contractor_name || "Contractor"}</h3>
          </div>
          <StatusBadge status={item.status} label={item.status_display || readableStatus(item.status)} tone={quotationTone(item.status)} />
        </div>
        <p className="customer-quotation-property">{item.property_name || "Property details unavailable"}</p>
        <div className="customer-quotation-meta">
          <span>Created {formatDashboardDate(item.quotation_date)}</span>
          {scheduled && <span>Work dates · {formatDashboardDate(item.schedule_start_date)} to {formatDashboardDate(item.schedule_end_date)}</span>}
        </div>
      </div>
      <div className="customer-quotation-side">
        <strong>{formatMoney(item.grand_total)}</strong>
        <Link to={`/customer-quotations/${item.id}`} className="customer-record-action">
          {waiting ? "Review quotation" : scheduled ? "View work dates" : "View details"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function SimpleRecord({ title, subtitle, status, to }) {
  const content = (
    <>
      <span className="customer-record-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      {status && <StatusBadge status={status} label={readableStatus(status)} tone={statusTone(status)} />}
      {to && <ArrowRight className="customer-record-chevron" aria-hidden="true" />}
    </>
  );
  return to ? (
    <Link to={to} className="customer-simple-record">
      {content}
    </Link>
  ) : (
    <div className="customer-simple-record">{content}</div>
  );
}

function PanelLink({ to, label }) {
  return (
    <Link to={to} className="customer-panel-link">
      {label}<ArrowRight aria-hidden="true" />
    </Link>
  );
}

function statusTone(status) {
  if (["CONNECTED", "ACCEPTED", "COMPLETED", "RESOLVED", "CLOSED"].includes(status)) return "success";
  if (["PENDING", "REVIEWING", "SITE_VISIT", "NEW"].includes(status)) return "warning";
  if (["REJECTED", "CANCELLED", "DECLINED"].includes(status)) return "danger";
  if (["SENT", "VIEWED", "SCHEDULED", "IN_PROGRESS"].includes(status)) return "info";
  return "neutral";
}

function quotationTone(status) {
  if (["ACCEPTED", "CONVERTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(status)) return "success";
  if (["SENT", "VIEWED", "REVISION_REQUESTED"].includes(status)) return "warning";
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) return "danger";
  return "neutral";
}

function workStatus(item) {
  if (item.status === "IN_PROGRESS") return "IN_PROGRESS";
  const schedule = String(item.schedule_status || "").toLowerCase();
  if (schedule.includes("pending")) return "PENDING";
  if (schedule.includes("confirm") || ["ACCEPTED", "SCHEDULED", "CONVERTED"].includes(item.status)) return "SCHEDULED";
  return item.status || "SCHEDULED";
}

function workStatusLabel(item) {
  const value = workStatus(item);
  if (value === "IN_PROGRESS") return "Work in progress";
  if (value === "PENDING") return "Dates awaiting confirmation";
  if (value === "SCHEDULED") return "Work scheduled";
  return readableStatus(value);
}

function workStatusTone(item) {
  const value = workStatus(item);
  return value === "PENDING" ? "warning" : value === "IN_PROGRESS" ? "info" : "success";
}

function readableStatus(status) {
  return String(status || "Status unavailable")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDashboardDate(value) {
  if (!value) return "Date to be confirmed";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
