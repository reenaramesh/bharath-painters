import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import InHouseEmployeeDetail from "../pages/InHouseEmployeeDetail";
import { searchEmployees } from "../utils/employeeSearch.js";

const currentMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);

export default function InHouseAttendanceWorkspace({ employees, loading = false }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const activeEmployees = useMemo(() => employees.filter(employee => employee.is_active !== false), [employees]);
  const matches = searchEmployees(activeEmployees, query);
  const selectedId = params.get("employee");
  const selectedEmployee = activeEmployees.find(employee => String(employee.membership_id) === selectedId);
  const month = params.get("month") || currentMonth;
  const date = params.get("date") || "";

  function updateFilters(changes, { clearDate = false } = {}) {
    const next = new URLSearchParams(params);
    if (clearDate) next.delete("date");
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next, { replace: true });
  }

  function selectEmployee(employee) {
    const next = new URLSearchParams(params);
    next.set("employee", String(employee.membership_id));
    setParams(next, { replace: true });
    setQuery("");
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="attendance-workspace-title">
    <div className="border-b border-slate-200 bg-slate-50/80 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><Check size={20} aria-hidden="true" /></span>
        <div className="min-w-0"><h2 id="attendance-workspace-title" className="text-lg font-bold text-slate-950 bp-ui-section-heading">Attendance entry and monthly summary</h2><p className="mt-1 text-sm text-slate-600">Search employees, review attendance totals, and select a row to record attendance.</p></div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="min-w-0 text-xs font-semibold text-slate-800">Search employees
          <span className="mt-2 block"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or ID" autoComplete="off" className="bp-ui-control min-h-12 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm placeholder:text-xs" /></span>
        </label>
        <label className="text-sm font-semibold text-slate-800">Filter by date<input aria-label="Filter attendance by date" type="date" value={date} onChange={event => updateFilters({ date: event.target.value })} className="bp-ui-control mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-semibold text-slate-800">Filter by month and year<input aria-label="Filter attendance by month and year" type="month" value={month} onChange={event => updateFilters({ month: event.target.value }, { clearDate: true })} className="bp-ui-control mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
      </div>
      <p className="mt-3 text-xs text-slate-500">A specific date takes priority over the month filter. Total present days count a half-day as 0.5.</p>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left" aria-label="Employee attendance totals">
        <thead className="bg-white text-xs uppercase tracking-wide text-slate-500"><tr>
          <th scope="col" className="px-4 py-3 font-semibold">Name</th><th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Employee ID</th><th scope="col" className="px-4 py-3 text-right font-semibold">Present days</th><th scope="col" className="px-4 py-3 text-right font-semibold">Overtime</th><th scope="col" className="px-4 py-3 text-right font-semibold">Absents</th><th scope="col" className="px-4 py-3 text-right font-semibold">Total present days</th><th scope="col" className="px-4 py-3 text-right font-semibold">Select</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{matches.map(employee => {
          const metrics = employee.attendance_metrics || {};
          const selected = String(employee.membership_id) === selectedId;
          return <tr key={employee.membership_id} aria-selected={selected} className={selected ? "bg-blue-50" : "hover:bg-slate-50"}>
            <td className="px-4 py-3 font-semibold text-slate-900">{employee.name}</td><td className="hidden px-4 py-3 text-sm text-slate-600 md:table-cell">{employee.employee_code || "Not assigned"}</td><td className="px-4 py-3 text-right tabular-nums">{metrics.present_days ?? 0}</td><td className="px-4 py-3 text-right tabular-nums">{Number(metrics.overtime_hours || 0)} hrs</td><td className="px-4 py-3 text-right tabular-nums">{metrics.absents ?? 0}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{Number(metrics.total_present_days || 0)}</td><td className="px-4 py-3 text-right"><button type="button" aria-label={`Update attendance for ${employee.name}`} aria-pressed={selected} onClick={() => selectEmployee(employee)} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${selected ? "bg-blue-700 text-white" : "border border-slate-300 bg-white text-slate-800 hover:bg-blue-50"}`}>Update</button></td>
          </tr>;
        })}
        {!matches.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-slate-500">{loading ? "Loading employees..." : query ? "No active employee matches that name or ID." : "No active employees found."}</td></tr>}</tbody>
      </table>
    </div>

    {selectedEmployee && <div className="border-t border-slate-200 p-3 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Selected employee</p><p className="mt-1 font-bold text-slate-950">{selectedEmployee.name}</p></div><p className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800">ID: {selectedEmployee.employee_code || "Not assigned"}</p></div><InHouseEmployeeDetail employeeId={selectedEmployee.membership_id} embedded selectedMonth={month} onMonthChange={value => updateFilters({ month: value }, { clearDate: true })} /></div>}
  </section>;
}
