import { useState } from "react";
import { Link } from "react-router-dom";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function EmployeePayrollWorkspace({ section, employees, month, onMonthChange, loading, error }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const rows = employees.filter(employee => [employee.employee_code, employee.name, employee.job_title]
    .some(value => String(value || "").toLowerCase().includes(query)));
  const isWages = section === "wages";
  const isBonus = section === "bonus";
  const title = isWages ? "Monthly wage register" : isBonus ? "Monthly bonuses" : "Monthly leave register";
  const description = isWages
    ? "Base wages and OT pay use contractor-approved attendance. Total includes both. Bonuses and payments are recorded separately."
    : isBonus ? "Bonuses recorded for each employee in the selected month." : "Approved leave days for each employee in the selected month.";
  const detailUrl = employee => `/in-house-applicators/${employee.membership_id}?section=${section}&month=${encodeURIComponent(month)}`;

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="employee-payroll-workspace-title">
    <div className="border-b border-slate-200 bg-slate-50/80 p-4 sm:p-6">
      <h2 id="employee-payroll-workspace-title" className="text-lg font-bold text-slate-950 bp-ui-section-heading">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-semibold text-slate-800">Search employees
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or ID" className="bp-ui-control mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm placeholder:text-xs" />
        </label>
        <label className="min-w-0 text-sm font-semibold text-slate-800">Month and year
          <input type="month" value={month} onChange={event => onMonthChange(event.target.value)} className="bp-ui-control mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500 sm:hidden">Swipe the table sideways to see all columns.</p>
    </div>
    <div className="employee-table-wrap employee-payroll-register" role="region" aria-label={`${title} table`} tabIndex={0}>
      <table className="employee-table" data-mobile-table="keep" aria-label={title}>
        <thead><tr>
          <th scope="col" className="hidden md:table-cell">Employee ID</th><th scope="col">Employee Name</th><th scope="col">Job title</th>
          {isWages ? <><th scope="col">Earn days</th><th scope="col">Day Wage</th><th scope="col">Base wages</th><th scope="col">OT hours</th><th scope="col">OT pay</th><th scope="col">Total</th></>
            : isBonus ? <th scope="col">Bonus this month</th> : <th scope="col">Leave days</th>}
        </tr></thead>
        <tbody>{rows.map(employee => {
          const summary = employee.payroll_summary || {};
          return <tr key={employee.membership_id}>
            <td className="hidden md:table-cell">{employee.employee_code || "ID pending"}</td>
            <td><Link to={detailUrl(employee)}><strong>{employee.name}</strong>{employee.is_active === false && <small>Removed</small>}</Link></td>
            <td>{employee.job_title || "Not set"}</td>
            {isWages ? <>
              <td className="tabular-nums">{Number(summary.earned_days || 0)}</td>
              <td className="tabular-nums">{employee.salary_amount == null ? "Not set" : summary.day_wage_varies ? "Varies" : money(summary.day_wage)}</td>
              <td className="tabular-nums">{money(summary.total)}</td>
              <td className="tabular-nums">{Number(summary.overtime_hours || 0)} hrs</td>
              <td className="tabular-nums">{money(summary.overtime_pay)}</td>
              <td className="font-semibold tabular-nums">{money(summary.gross_total ?? (Number(summary.total || 0) + Number(summary.overtime_pay || 0)))}</td>
            </> : isBonus ? <td className="font-semibold tabular-nums">{money(summary.bonus_total)}</td>
              : <td className="font-semibold tabular-nums">{summary.leave_days ?? 0}</td>}
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={isWages ? 9 : 4} className="p-8 text-center text-slate-500">
          {loading ? "Loading employee records..." : error ? "Employee records could not be loaded." : query ? "No employee matches that name or ID." : "No employee records for this contractor."}
        </td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
