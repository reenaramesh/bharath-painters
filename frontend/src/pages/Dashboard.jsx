import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Paintbrush,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ContractorDashboard from "./ContractorDashboard";
import AdminDashboard from "./AdminDashboard";
import SupportWorkspace from "./SupportWorkspace";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";
import "./painter-portal.css";

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
          ? `${user.branding?.employee_singular_label || "Employee"} dashboard could not be loaded.`
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
  if (user?.role === "SUPPORT") return <SupportWorkspace />;
  if (user?.role === "PAINTER")
    return loading ? (
      <p className="p-12 text-center text-slate-500">
        Loading {user.branding?.employee_singular_label || "Employee"} dashboard...
      </p>
    ) : data ? (
      <div className="space-y-4">
        <ApplicatorDashboard data={data} onRefresh={load} />
        <SubscriptionCard billing={billing} />
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
        <p className="mt-2 text-slate-500">Welcome to Bharath Apps.</p>
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
  return <ContractorDashboard data={data} onRefresh={load} error={error}><SubscriptionCard billing={billing} /></ContractorDashboard>;
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
      className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 transition hover:shadow-sm"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Current subscription
        </p>
        <h2 className="truncate text-sm font-bold">
          {plan?.name || "No active package"}
        </h2>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {subscription
            ? `Active from ${formatDate(subscription.start_date)} · Valid until ${end ? formatDate(end) : "No expiry"}`
            : "Default package access"}
        </p>
      </div>
      {subscription && (
        <div className="hidden sm:block sm:text-right">
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
      <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700" />
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
    <div className="painter-portal-page painter-dashboard-page space-y-4 sm:space-y-7">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Welcome, {data.name}</h1>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-xl border bg-white p-3"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </header>
      <MobileDashboardShortcuts />
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
      <section className="painter-dashboard-focus" aria-label="Painter work focus">
        <div><span>Work in motion</span><strong>{Number(c.in_progress || 0) + Number(c.assigned || 0)}</strong><small>Assigned or currently in progress</small></div>
        <div><span>Finished work</span><strong>{c.completed || 0}</strong><small>Projects in your work history</small></div>
        <div><span>Contractors</span><strong>{c.active_contractors || 0}</strong><small>Contractors connected to your work</small></div>
      </section>
      <ApplicatorActiveCount value={c.active_contractors} />
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
