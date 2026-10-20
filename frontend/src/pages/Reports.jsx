import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Download,
  FileText,
  IndianRupee,
  RefreshCw,
  Users,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import { Button, PageHeader, StatCard } from "../components/ui";
import useAuth from "../context/useAuth";
import ReportAnalytics from "../components/ReportAnalytics";
import "./admin-portal.css";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function Reports() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [userData, setUserData] = useState(null);
  const [userError, setUserError] = useState("");
  const loadUsers = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try { setUserData((await api.get("/quotations/admin-dashboard/")).data); setUserError(""); }
    catch { setUserError("User analytics could not be loaded."); }
  }, [user?.role]);
  const load = useCallback(async () => {
    try {
      setData((await api.get("/jobs/reports/")).data);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "Reports could not be loaded.",
      );
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  async function exportCsv() {
    setBusy(true);
    try {
      const response = await api.get("/jobs/reports/", {
        params: { export: "csv" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `operations-report-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Report export could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }
  if (!["ADMIN", "CONTRACTOR"].includes(user?.role))
    return <Navigate to="/dashboard" replace />;
  const summary = data?.summary || {};
  return (
    <div className="space-y-6 reports-reference-page">
      <PageHeader eyebrow={user.role === "ADMIN" ? "Platform operations" : "Business performance"} title="Reports" description="Review business activity, project progress and financial summaries." actions={<><Button variant="secondary" onClick={() => { load(); loadUsers(); }}><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</Button><Button disabled={busy} onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true"/>Export CSV</Button></>} />
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={Users} name="Customers" value={summary.customers} />
            <Metric
              icon={FileText}
              name="Quotations"
              value={summary.quotations}
            />
            <Metric
              icon={BriefcaseBusiness}
              name="Active projects"
              value={summary.active_projects}
            />
            <Metric
              icon={BriefcaseBusiness}
              name="Completed projects"
              value={summary.completed_projects}
            />
            <Metric
              icon={IndianRupee}
              name="Total invoiced"
              value={money(summary.invoiced)}
              dark
            />
            <Metric
              icon={IndianRupee}
              name="Payments received"
              value={money(summary.received)}
              green
            />
            <Metric
              icon={IndianRupee}
              name="Outstanding"
              value={money(summary.outstanding)}
              amber
            />
            <Metric
              icon={ImageIcon}
              name="Work photos"
              value={summary.photos}
            />
          </section>
          <ReportAnalytics report={data} users={userData} admin={user.role === "ADMIN"} userError={userError} onRetry={loadUsers} />
          <details className="rounded-2xl border bg-white p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">View detailed report tables</summary>
          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border bg-white">
              <h2 className="border-b p-5 font-bold bp-ui-section-heading">
                Monthly invoice performance
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm bp-ui-table">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-4">Month</th>
                      <th className="p-4 text-right">Billed</th>
                      <th className="p-4 text-right">Received</th>
                      <th className="p-4 text-right">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.monthly.map((row) => (
                      <tr key={row.month}>
                        <td className="p-4 font-semibold">
                          {new Date(row.month).toLocaleDateString("en-IN", {
                            month: "long",
                            year: "numeric",
                          })}
                        </td>
                        <td className="p-4 text-right">{money(row.billed)}</td>
                        <td className="p-4 text-right text-emerald-700">
                          {money(row.paid)}
                        </td>
                        <td className="p-4 text-right text-amber-700">
                          {money(Number(row.billed) - Number(row.paid))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.monthly.length && (
                  <p className="p-10 text-center text-slate-400">
                    No invoice data yet.
                  </p>
                )}
              </div>
            </section>
            <section className="rounded-2xl border bg-white">
              <h2 className="border-b p-5 font-bold bp-ui-section-heading">Quotation pipeline</h2>
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                {data.quotation_statuses.map((row) => (
                  <div key={row.status} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      {label(row.status)}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{row.count}</p>
                  </div>
                ))}
                {!data.quotation_statuses.length && (
                  <p className="col-span-full p-6 text-center text-slate-400">
                    No quotations yet.
                  </p>
                )}
              </div>
            </section>
          </div>
          </details>
          <section className="overflow-hidden rounded-2xl border bg-white">
            <h2 className="border-b p-5 font-bold bp-ui-section-heading">
              Upcoming and active projects
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm bp-ui-table">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-4">Quotation</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Property</th>
                    <th className="p-4">Dates</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.upcoming.map((row) => (
                    <tr key={row.id}>
                      <td className="p-4 font-semibold">
                        {row.quotation_number}
                      </td>
                      <td className="p-4">{row.customer}</td>
                      <td className="p-4">{row.property}</td>
                      <td className="p-4">
                        {row.start_date} to {row.end_date}
                      </td>
                      <td className="p-4">{label(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.upcoming.length && (
                <p className="p-10 text-center text-slate-400">
                  No upcoming projects.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ImageIcon(props) {
  return <BarChart3 {...props} />;
}
function Metric({ icon: Icon, name, value, dark, green, amber }) {
  return <StatCard icon={Icon} label={name} value={value} tone={green ? "success" : amber ? "warning" : dark ? "info" : "brand"} />;
}
