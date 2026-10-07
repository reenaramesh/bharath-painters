import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  CalendarDays,
  CreditCard,
  IndianRupee,
  ReceiptText,
  RefreshCw,
  Search,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import "./admin-portal.css";

const months = [
  "All months",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const money = (value) =>
  `${String.fromCharCode(8377)}${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function AdminRevenue() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get("/billing/revenue/", {
        params: { year, month: month || undefined },
      });
      setData(response);
      setError("");
    } catch {
      setError("Subscription revenue details could not be loaded.");
    }
  }, [year, month]);
  useEffect(() => {
    if (user?.role === "ADMIN") load();
  }, [load, user]);
  const rows = useMemo(() => {
    const query = search.toLowerCase().trim();
    return (data?.transactions || []).filter(
      (item) =>
        !query ||
        `${item.user} ${item.mobile} ${item.bharath_id || ""} ${item.plan} ${item.receipt_number || ""} ${item.reference || ""}`
          .toLowerCase()
          .includes(query),
    );
  }, [data, search]);
  if (user?.role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  const peak = Math.max(
    ...(data?.monthly || []).map((item) => Number(item.total)),
    1,
  );
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">Admin billing</p>
          <h1 className="mt-1 text-3xl font-bold">Subscription revenue</h1>
          <p className="mt-2 text-slate-500">
            Only Bharath Apps package payments received from contractors and
            employees.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          icon={IndianRupee}
          label="Subscription revenue"
          value={money(data?.total)}
        />
        <Metric
          icon={ReceiptText}
          label="Confirmed payments"
          value={data?.payments_count || 0}
        />
        <Metric
          icon={CalendarDays}
          label="Reporting period"
          value={month ? `${months[month]} ${year}` : String(year)}
        />
        <Metric
          icon={CreditCard}
          label="Payment modes"
          value={data?.payment_modes?.length || 0}
        />
      </section>
      <section className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-xl border px-4 py-3"
          >
            {(data?.available_years || [year]).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="rounded-xl border px-4 py-3"
          >
            {months.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <label className="relative flex-1">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search member, Bharath ID, package, receipt or reference"
              className="w-full rounded-xl border py-3 pl-11 pr-4"
            />
          </label>
        </div>
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-3">
        <section className="min-w-0 rounded-2xl border bg-white p-5 xl:col-span-2">
          <h2 className="font-bold">
            Month-wise subscription revenue · {year}
          </h2>
          <div className="mt-5 space-y-3">
            {months.slice(1).map((name, index) => {
              const value = Number(
                data?.monthly?.find((item) => item.month === index + 1)
                  ?.total || 0,
              );
              return (
                <div
                  key={name}
                  className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 text-sm"
                >
                  <span>{name.slice(0, 3)}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(value / peak) * 100}%` }}
                    />
                  </div>
                  <b>{money(value)}</b>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Package payments by mode</h2>
          <div className="mt-4 divide-y">
            {data?.payment_modes?.length ? (
              data.payment_modes.map((item) => (
                <div
                  key={item.mode}
                  className="flex justify-between gap-3 py-4 text-sm"
                >
                  <span>{String(item.mode).replaceAll("_", " ")}</span>
                  <b>{money(item.total)}</b>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                No package payments in this period.
              </p>
            )}
          </div>
        </section>
      </div>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <header className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-bold">Package payment details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Customer project receipts and contractor invoices are not included
              here.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">
            {rows.length}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-4">Received</th>
                <th className="p-4">Receipt</th>
                <th className="p-4">Member</th>
                <th className="p-4">Package</th>
                <th className="p-4">Mode / reference</th>
                <th className="p-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className="p-4">
                    {new Date(item.date).toLocaleDateString("en-IN")}
                  </td>
                  <td className="p-4 font-semibold">
                    {item.receipt_number || "—"}
                  </td>
                  <td className="p-4">
                    <b>{item.user}</b>
                    <small className="block text-slate-500">
                      {item.role === "PAINTER"
                        ? "Employee"
                        : "Contractor"}{" "}
                      · {item.mobile} · {item.bharath_id || "No ID"}
                    </small>
                  </td>
                  <td className="p-4">
                    <b>{item.plan}</b>
                    <small className="block text-slate-500">
                      {item.months} {item.months === 1 ? "month" : "months"}
                    </small>
                  </td>
                  <td className="p-4">
                    {String(item.mode).replaceAll("_", " ")}
                    <small className="block text-slate-500">
                      {item.reference || "—"}
                    </small>
                  </td>
                  <td className="p-4 text-right text-base font-bold">
                    {money(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-10 text-center text-sm text-slate-400">
              No confirmed package payments found.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-bold">{value}</p>
    </div>
  );
}
