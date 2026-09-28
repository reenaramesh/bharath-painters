import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CircleHelp,
  ClipboardList,
  FileText,
  MessageCircle,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import api from "../api/client";
import CustomerAds from "../components/CustomerAds";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";

export default function CustomerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await api.get("/quotations/customer-portal/dashboard/");
      setData(response.data);
      setError("");
    } catch {
      setError("Customer dashboard could not be loaded.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data)
    return (
      <div className="p-12 text-center text-slate-500">
        {error || "Loading customer dashboard..."}
      </div>
    );
  const counts = data.counts;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Customer portal
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            Welcome, {data.customer_name}
          </h1>
          <p className="mt-2 text-slate-500">
            Manage your painting services, messages, quotations, and support in
            one place.
          </p>
        </div>
        <Link to="/appearance" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#176b9b] bg-white px-4 text-sm font-bold text-[#176b9b]"><Settings className="h-4 w-4" />Profile settings</Link>
      </header>
      <MobileDashboardShortcuts />
      <CustomerAds />
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
        <PortalCard
          icon={MessageCircle}
          label="Unread messages"
          value={counts.unread_messages}
          to="/messages"
          action="Open chat"
        />
        <PortalCard
          icon={ClipboardList}
          label="Service requests"
          value={counts.service_requests}
          to="/service-requests"
          action="Request service"
        />
        <PortalCard
          icon={CircleHelp}
          label="Open tickets"
          value={counts.open_tickets}
          to="/support-tickets"
          action="Get support"
        />
        <PortalCard
          icon={Building2}
          label="Properties"
          value={counts.properties}
        />
        <PortalCard
          icon={FileText}
          label="Quotations"
          value={counts.quotations}
        />
        <PortalCard
          icon={Users}
          label="Connected contractors"
          value={counts.contractors}
          to="/customer/connections"
          action="Manage contractors"
        />
        <PortalCard
          icon={Users}
          label="Pending requests"
          value={counts.pending_connection_requests || 0}
          to="/customer/connections?tab=pending"
          action="Review requests"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="My contractors" link="/customer/connections" action="View all contractors">
          {data.my_contractors?.length ? data.my_contractors.map((item) => <Row key={item.id} title={item.contractor?.business_name} subtitle={`${item.contractor?.contractor_id || "Bharath Painters Contractor"} · ${item.counts?.quotations || 0} quotations · ${item.counts?.active_projects || 0} active projects`} badge="CONNECTED" />) : <p className="p-6 text-sm text-slate-400">No connected contractors yet.</p>}
        </Panel>
        <Panel
          title="Recent service requests"
          link="/service-requests"
          action="View all"
        >
          {data.recent_requests.length ? (
            data.recent_requests.map((item) => (
              <Row
                key={item.id}
                title={item.service_name}
                subtitle={item.contractor_name}
                badge={item.status}
              />
            ))
          ) : (
            <Empty text="No service requests yet." link="/service-requests" />
          )}
        </Panel>
        <Panel
          title="Recent support tickets"
          link="/support-tickets"
          action="View all"
        >
          {data.recent_tickets.length ? (
            data.recent_tickets.map((item) => (
              <Row
                key={item.id}
                title={item.subject}
                subtitle={item.ticket_number}
                badge={item.status}
              />
            ))
          ) : (
            <Empty text="No support tickets yet." link="/support-tickets" />
          )}
        </Panel>
        <Panel title="My properties">
          {data.properties.length ? (
            data.properties.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                subtitle={[item.property_type, item.city]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          ) : (
            <p className="p-6 text-sm text-slate-400">
              No properties have been added by your contractor.
            </p>
          )}
        </Panel>
        <Panel title="My quotations">
          {data.quotations.length ? (
            data.quotations.map((item) => (
              <Row
                key={item.id}
                title={item.quotation_number}
                subtitle={`${item.quotation_date} · ₹${Number(item.grand_total || 0).toLocaleString("en-IN")}`}
                badge={item.status}
              />
            ))
          ) : (
            <p className="p-6 text-sm text-slate-400">
              No quotations available yet.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
function PortalCard({ icon: Icon, label, value, to, action }) {
  const body = (
    <div className="rounded-xl border bg-white p-3 transition hover:border-slate-300 sm:rounded-2xl sm:p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 sm:h-11 sm:w-11 sm:rounded-xl">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="text-2xl font-bold sm:text-3xl">{value}</span>
      </div>
      <p className="mt-3 text-xs font-semibold sm:mt-4 sm:text-base">{label}</p>
      {action && (
        <p className="mt-1 truncate text-[10px] font-semibold text-amber-700 sm:text-sm">
          {action} →
        </p>
      )}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
function Panel({ title, link, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-bold">{title}</h2>
        {link && (
          <Link to={link} className="text-sm font-semibold text-amber-700">
            {action}
          </Link>
        )}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}
function Row({ title, subtitle, badge, to }) {
  const content = (
    <div className="flex items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="mt-1 truncate text-sm text-slate-500">{subtitle}</p>
      </div>
      {badge && (
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {badge.replaceAll("_", " ")}
        </span>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="block hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    content
  );
}
function Empty({ text, link }) {
  return (
    <div className="p-6 text-center">
      <p className="text-sm text-slate-400">{text}</p>
      <Link
        to={link}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-700"
      >
        <Plus className="h-4 w-4" />
        Create now
      </Link>
    </div>
  );
}
