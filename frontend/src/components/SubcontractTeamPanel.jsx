import { useCallback, useEffect, useState } from "react";
import { IndianRupee, Users } from "lucide-react";
import api from "../api/client";
import { StatusBadge } from "./ui";
import { apiErrorMessage, prettyDate, rupees, WAGE_TYPES } from "../utils/subcontract";

const TEAM_OPEN = ["ACCEPTED", "SCHEDULED", "IN_PROGRESS"];

// Only the receiving contractor sees this panel. Their team and their wage
// costs are never shown to the main contractor.
export default function SubcontractTeamPanel({ workOrder, onChanged }) {
  const [employees, setEmployees] = useState([]);
  const [wages, setWages] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [employee, setEmployee] = useState("");
  const [wage, setWage] = useState({
    employee: "",
    wage_type: "DAILY",
    amount: "",
    days_worked: "",
    accrued_on: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const loadWages = useCallback(
    () =>
      api
        .get(`/outsourcing/work-orders/${workOrder.id}/wages/`)
        .then(({ data }) => setWages(Array.isArray(data) ? data : data?.results || []))
        .catch(() => setWages([])),
    [workOrder.id],
  );

  useEffect(() => {
    api
      .get("/jobs/in-house-applicators/")
      .then(({ data }) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]));
    loadWages();
  }, [loadWages]);

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "That change could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const team = (workOrder.assignments || []).filter((row) => row.status !== "RELEASED");
  const released = (workOrder.assignments || []).filter((row) => row.status === "RELEASED");
  const canEditTeam = TEAM_OPEN.includes(workOrder.status);
  const totalWages = wages.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Users className="h-5 w-5" /> Your team
      </h2>
      

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {canEditTeam && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={employee}
            onChange={(event) => setEmployee(event.target.value)}
            className="min-w-[220px] flex-1"
          >
            <option value="">Add an employee</option>
            {employees
              .filter((row) => row.is_active !== false)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.employee_code ? ` · ${row.employee_code}` : ""}
                </option>
              ))}
          </select>
          <button
            disabled={busy || !employee}
            onClick={() =>
              run(async () => {
                await api.post(`/outsourcing/work-orders/${workOrder.id}/assignments/`, {
                  employee: Number(employee),
                });
                setEmployee("");
              })
            }
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            Assign
          </button>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {team.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <div>
              <p className="font-bold">{row.employee_name}</p>
              <p className="text-xs text-slate-500">Added {prettyDate(row.assigned_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={row.status} />
              {canEditTeam && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.delete(`/outsourcing/work-orders/${workOrder.id}/assignments/`, {
                        data: { assignment: row.id },
                      }),
                    )
                  }
                  className="text-sm font-semibold text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
        {team.length === 0 && (
          <li className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
            Nobody assigned yet.
          </li>
        )}
      </ul>

      {released.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          {released.length} earlier assignment{released.length > 1 ? "s" : ""} released.
        </p>
      )}

      <div className="mt-6 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold">
            <IndianRupee className="h-4 w-4" /> Wages on this job
          </h3>
          <p className="text-sm font-bold">{rupees(totalWages)}</p>
        </div>
        

        {team.length > 0 && (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await api.post(`/outsourcing/work-orders/${workOrder.id}/wages/`, {
                  employee: Number(wage.employee),
                  wage_type: wage.wage_type,
                  amount: wage.amount,
                  days_worked: wage.days_worked || "0",
                  accrued_on: wage.accrued_on || null,
                  note: wage.note,
                });
                setWage({ ...wage, amount: "", days_worked: "", note: "" });
                loadWages();
              });
            }}
          >
            <select
              required
              value={wage.employee}
              onChange={(event) => setWage({ ...wage, employee: event.target.value })}
              className="sm:col-span-2"
            >
              <option value="">Employee</option>
              {team.map((row) => (
                <option key={row.id} value={row.employee}>
                  {row.employee_name}
                </option>
              ))}
            </select>
            <select
              value={wage.wage_type}
              onChange={(event) => setWage({ ...wage, wage_type: event.target.value })}
            >
              {WAGE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={wage.amount}
              onChange={(event) => setWage({ ...wage, amount: event.target.value })}
            />
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="Days"
              value={wage.days_worked}
              onChange={(event) => setWage({ ...wage, days_worked: event.target.value })}
            />
            <input
              type="date"
              value={wage.accrued_on}
              onChange={(event) => setWage({ ...wage, accrued_on: event.target.value })}
            />
            <input
              placeholder="Note"
              value={wage.note}
              onChange={(event) => setWage({ ...wage, note: event.target.value })}
              className="sm:col-span-5"
            />
            <button
              disabled={busy || !wage.employee}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
            >
              Record wage
            </button>
          </form>
        )}

        {wages.length > 0 && (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Days</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {wages.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 font-semibold">{row.employee_name}</td>
                  <td className="py-2 pr-3">{row.wage_type}</td>
                  <td className="py-2 pr-3">{row.days_worked || "—"}</td>
                  <td className="py-2 pr-3 text-right font-bold">{rupees(row.amount)}</td>
                  <td className="py-2 text-slate-500">{prettyDate(row.accrued_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}