import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  MessageCircle,
  Paintbrush,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import AdminDashboard from "./AdminDashboard";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const badge = (status) =>
  status === "WON" || status === "ACCEPTED" || status === "CONVERTED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "LOST" || status === "REJECTED" || status === "CANCELLED"
      ? "bg-red-50 text-red-700"
      : status === "NEW" || status === "SENT"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [billing, setBilling] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!user || !["CONTRACTOR", "PAINTER"].includes(user.role)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dashboardResponse, billingResponse] = await Promise.all([
        api.get(
          user.role === "PAINTER"
            ? "/jobs/applicator-dashboard/"
            : "/quotations/contractor-crm/dashboard/",
        ),
        api.get("/billing/me/"),
      ]);
      setData(dashboardResponse.data);
      setBilling(billingResponse.data);
      setError("");
    } catch {
      setError(
        user.role === "PAINTER"
          ? "Paint Applicator dashboard could not be loaded."
          : "CRM dashboard could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    load();
  }, [load]);
  if (user?.role === "ADMIN") return <AdminDashboard />;
  if (user?.role === "PAINTER")
    return loading ? (
      <p className="p-12 text-center text-slate-500">
        Loading Paint Applicator dashboard...
      </p>
    ) : data ? (
      <div className="space-y-4">
        <SubscriptionCard billing={billing} />
        <ApplicatorActiveCount value={data.counts.active_contractors} />
        <ApplicatorDashboard data={data} onRefresh={load} />
      </div>
    ) : (
      <div className="rounded-2xl bg-red-50 p-6 text-red-700">
        {error}
        <button onClick={load} className="ml-3 font-bold">
          Retry
        </button>
      </div>
    );
  if (user?.role !== "CONTRACTOR")
    return (
      <div className="rounded-2xl border bg-white p-10">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-slate-500">Welcome to Bharath Painters.</p>
      </div>
    );
  if (loading)
    return (
      <p className="p-12 text-center text-slate-500">
        Loading contractor CRM...
      </p>
    );
  if (!data)
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-red-700">
        {error}
        <button onClick={load} className="ml-3 font-bold">
          Retry
        </button>
      </div>
    );
  const c = data.counts;
  const pipeline = data.pipeline.filter((item) => item.count > 0);
  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">Contractor CRM</p>
          <h1 className="mt-1 text-3xl font-bold">
            Welcome, {data.contractor_name}
          </h1>
          <p className="mt-2 text-slate-500">
            Customers, sales, follow-ups, and service activity in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            className="rounded-xl border bg-white p-3"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <Link
            to="/customers?action=add"
            className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
          >
            <UserPlus className="h-4 w-4" />
            Add Customer
          </Link>
          <Link
            to="/properties?action=add"
            className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
          >
            <Building2 className="h-4 w-4" />
            Add Property
          </Link>
          <Link
            to="/properties?calculator=1"
            className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
          >
            <Calculator className="h-4 w-4" />
            Area Calculator
          </Link>
          <Link
            to="/quotations/new"
            className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New quotation
          </Link>
        </div>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <SubscriptionCard billing={billing} />
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-5">
        <Metric
          icon={Users}
          label="Customers"
          value={c.customers}
          hint={`${c.active_leads} active leads`}
          to="/customers"
        />
        <Metric
          icon={CalendarClock}
          label="Due follow-ups"
          value={c.due_tasks}
          hint="Overdue and due now"
          to="/tasks"
          alert={c.due_tasks}
        />
        <Metric
          icon={FileText}
          label="Quotations"
          value={c.quotations}
          hint={money(c.quotation_value)}
          to="/quotations"
        />
        <Metric
          icon={Building2}
          label="Properties"
          value={c.properties}
          hint="Customer sites"
          to="/properties"
        />
        <Metric
          icon={Paintbrush}
          label="Applicators working today"
          value={c.active_applicators}
          hint="Scheduled on your projects today"
          to="/applicator-team"
        />
      </div>
      <Link to="/find-painter" className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:bg-amber-100 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-white"><Paintbrush className="h-6 w-6" /></span>
        <div className="flex-1"><h2 className="text-lg font-bold">Find Painter</h2><p className="mt-1 text-sm text-slate-600">Search verified painters by skill, location, name or Bharath ID and add them to your team.</p></div>
        <ArrowRight className="h-5 w-5" />
      </Link>
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border bg-white xl:col-span-2">
          <PanelHead
            title="Follow-up queue"
            subtitle="Callbacks and customer commitments"
            to="/tasks"
          />
          <div className="divide-y">
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl ${task.overdue ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}
                  >
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/customers/${task.customer}`}
                      className="font-bold hover:text-amber-700"
                    >
                      {task.customer_name}
                    </Link>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {task.comment || task.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="text-sm sm:text-right">
                    <p
                      className={
                        task.overdue
                          ? "font-semibold text-red-600"
                          : "font-semibold"
                      }
                    >
                      {new Date(task.next_follow_up).toLocaleString()}
                    </p>
                    <a
                      href={`tel:${task.customer_mobile}`}
                      className="mt-1 inline-flex items-center gap-1 text-slate-500"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {task.customer_mobile}
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No pending follow-ups." />
            )}
          </div>
        </section>
        <section className="rounded-2xl bg-slate-950 p-6 text-white">
          <h2 className="text-lg font-bold">Attention required</h2>
          <p className="mt-1 text-sm text-slate-400">
            Items needing a response
          </p>
          <div className="mt-6 space-y-3">
            <Action
              icon={MessageCircle}
              label="Unread messages"
              value={c.unread_messages}
              to="/messages"
            />
            <Action
              icon={FileText}
              label="New service requests"
              value={c.new_requests}
              to="/service-requests"
            />
            <Action
              icon={CalendarClock}
              label="Due follow-ups"
              value={c.due_tasks}
              to="/tasks"
            />
          </div>
        </section>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CollapsiblePanel
          title="Recent customers"
          count={data.recent_customers.length}
          to="/customers"
        >
          <div className="divide-y">
            {data.recent_customers.length ? (
              data.recent_customers.map((item) => (
                <Link
                  key={item.id}
                  to={`/customers/${item.id}`}
                  className="flex items-center gap-4 p-5 hover:bg-slate-50"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 font-bold">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      {item.mobile}
                      {item.city ? ` | ${item.city}` : ""}
                    </p>
                  </div>
                  <Status value={item.status} />
                </Link>
              ))
            ) : (
              <Empty text="No customers yet." />
            )}
          </div>
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Recent quotations"
          count={data.recent_quotations.length}
          to="/quotations"
        >
          <div className="divide-y">
            {data.recent_quotations.length ? (
              data.recent_quotations.map((item) => (
                <Link
                  key={item.id}
                  to={`/quotations/${item.id}`}
                  className="flex items-center gap-4 p-5 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.number}</p>
                    <p className="truncate text-sm text-slate-500">
                      {item.customer} | {item.property}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{money(item.amount)}</p>
                    <Status value={item.status} />
                  </div>
                </Link>
              ))
            ) : (
              <Empty text="No quotations yet." />
            )}
          </div>
        </CollapsiblePanel>
      </div>
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Lead pipeline</h2>
            <p className="mt-1 text-sm text-slate-500">
              Customers grouped by current CRM stage
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-500">
            {c.active_leads} active
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {pipeline.length ? (
            pipeline.map((item) => (
              <div key={item.status} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-bold">{item.count}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">
              Add customers to start your pipeline.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
function Metric({ icon: Icon, label, value, hint, to, alert }) {
  return (
    <Link
      to={to}
      className="rounded-xl border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-sm sm:rounded-2xl sm:p-5"
    >
      <div className="flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 sm:h-11 sm:w-11 sm:rounded-xl">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        {alert > 0 && (
          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 sm:px-2 sm:py-1 sm:text-xs">
            Action
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500 sm:mt-5 sm:text-sm">{label}</p>
      <p className="mt-0.5 text-2xl font-bold sm:mt-1 sm:text-3xl">{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-400 sm:mt-2 sm:text-xs">
        {hint}
      </p>
    </Link>
  );
}
function PanelHead({ title, subtitle, to }) {
  return (
    <header className="flex items-center justify-between border-b p-5">
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <Link to={to} className="flex items-center gap-1 text-sm font-semibold">
        View all
        <ArrowRight className="h-4 w-4" />
      </Link>
    </header>
  );
}
function CollapsiblePanel({ title, count, to, children }) {
  return (
    <details className="group overflow-hidden rounded-2xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 marker:hidden">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {count}
        </span>
        <Link
          to={to}
          onClick={(event) => event.stopPropagation()}
          className="hidden items-center gap-1 text-sm font-semibold sm:flex"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </Link>
        <ChevronDown className="h-5 w-5 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}
function Status({ value }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${badge(value)}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Action({ icon: Icon, label, value, to }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl bg-white/10 p-4 hover:bg-white/15"
    >
      <Icon className="h-5 w-5" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span
        className={`min-w-7 rounded-full px-2 py-1 text-center text-xs font-bold ${value ? "bg-red-500" : "bg-white/10"}`}
      >
        {value}
      </span>
    </Link>
  );
}
function Empty({ text }) {
  return <p className="p-8 text-center text-sm text-slate-400">{text}</p>;
}
function SubscriptionCard({ billing }) {
  const plan = billing?.plan;
  const subscription = billing?.subscription;
  const end = subscription?.end_date;
  const days = end
    ? Math.max(
        0,
        Math.ceil((new Date(`${end}T23:59:59`) - new Date()) / 86400000),
      )
    : null;
  return (
    <Link
      to="/my-packages"
      className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 transition hover:shadow-sm sm:flex-row sm:items-center"
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
      </span>
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
          Current subscription
        </p>
        <h2 className="mt-1 text-xl font-bold">
          {plan?.name || "No active package"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {subscription
            ? `Active from ${formatDate(subscription.start_date)} · Valid until ${end ? formatDate(end) : "No expiry"}`
            : "Default package access"}
        </p>
      </div>
      {subscription && (
        <div className="sm:text-right">
          <p className="text-xs text-slate-500">Subscription valid till</p>
          <p className="mt-1 font-bold">
            {end ? formatDate(end) : "No expiry"}
          </p>
          {days !== null && (
            <p className="mt-1 text-xs text-emerald-700">
              {days} days remaining
            </p>
          )}
        </div>
      )}
      <ArrowRight className="h-5 w-5 text-emerald-700" />
    </Link>
  );
}
function formatDate(value) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function ApplicatorActiveCount({ value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-3 sm:gap-4 sm:rounded-2xl sm:p-5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11 sm:rounded-xl">
        <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <div>
        <p className="text-xs text-slate-500 sm:text-sm">
          Contractors working today
        </p>
        <p className="mt-0.5 text-2xl font-bold sm:mt-1 sm:text-3xl">{value}</p>
      </div>
    </div>
  );
}

function ApplicatorDashboard({ data, onRefresh }) {
  const c = data.counts;
  return (
    <div className="space-y-4 sm:space-y-7">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Paint Applicator portal
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Welcome, {data.name}</h1>
          <p className="mt-1 text-sm text-slate-500 sm:mt-2 sm:text-base">
            Track your current workload and completed painting projects.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-xl border bg-white p-3"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <ApplicatorMetric
          icon={ClipboardList}
          label="Assigned projects"
          value={c.assigned}
          color="bg-blue-50 text-blue-700"
        />
        <ApplicatorMetric
          icon={PlayCircle}
          label="In progress"
          value={c.in_progress}
          color="bg-violet-50 text-violet-700"
        />
        <ApplicatorMetric
          icon={CheckCircle2}
          label="Completed projects"
          value={c.completed}
          color="bg-emerald-50 text-emerald-700"
        />
        <ApplicatorMetric
          icon={Paintbrush}
          label="Total projects"
          value={c.total}
          color="bg-amber-50 text-amber-700"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border bg-white xl:col-span-2">
          <header className="flex items-center justify-between border-b p-4 sm:p-5">
            <div>
              <h2 className="font-bold">Recent completed projects</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest finished work history
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
              {c.completed}
            </span>
          </header>
          {data.recent_completed.length ? (
            <div className="divide-y">
              {data.recent_completed.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold sm:text-base">
                      {item.quotation_number} · {item.property}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.contractor}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-[10px] text-slate-400 sm:text-xs">
                    {item.completed_at
                      ? new Date(item.completed_at).toLocaleDateString()
                      : "Completed"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No completed projects yet." />
          )}
        </section>
        <section className="rounded-2xl bg-slate-950 p-6 text-white">
          <h2 className="font-bold">Current work</h2>
          <p className="mt-1 text-sm text-slate-400">
            Open active assignments to start or complete work.
          </p>
          <Link
            to="/painter-assignments"
            className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-slate-950"
          >
            <ClipboardList className="h-4 w-4" />
            Open My Assignments
          </Link>
          <Link
            to="/jobs"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 font-semibold"
          >
            <ArrowRight className="h-4 w-4" />
            Find available jobs
          </Link>
        </section>
      </div>
    </div>
  );
}
function ApplicatorMetric({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl border bg-white p-3 sm:rounded-2xl sm:p-5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl ${color}`}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <p className="mt-3 min-h-8 text-xs leading-4 text-slate-500 sm:mt-5 sm:min-h-0 sm:text-sm">{label}</p>
      <p className="mt-0.5 text-2xl font-bold sm:mt-1 sm:text-3xl">{value}</p>
    </div>
  );
}
