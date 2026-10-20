import { useEffect, useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import EmployeeOvertimeSettings from "./EmployeeOvertimeSettings.jsx";
import { localDateKey } from "../utils/employeeAttendance.js";
import { employeePayrollSummary } from "../utils/employeePayrollSummary.js";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const label = value => String(value || "").replaceAll("_", " ");
const adjustmentEntries = ledger => ledger.filter(row => ["DEBIT_ADJUSTMENT", "CREDIT_ADJUSTMENT"].includes(row.entry_type));
const adjustmentSource = row => row.source_attendance ? `Attendance #${row.source_attendance}` : "No attendance record linked";

export default function EmployeeWages({ data, onSaved, month, setMonth }) {
  const { user } = useAuth();
  const [entry, setEntry] = useState({ date: localDateKey(), entry_type: "PAYMENT", amount: "", payment_mode: "CASH", reference: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [period, setPeriod] = useState("month");
  const [year, setYear] = useState(String(month || localDateKey()).slice(0, 4));
  const [yearSummary, setYearSummary] = useState(null);
  const [yearLoading, setYearLoading] = useState(false);
  const [yearError, setYearError] = useState("");
  const monthly = employeePayrollSummary(data.attendance, data.ledger);
  const monthlyAdjustments = adjustmentEntries(data.ledger);
  useEffect(() => {
    if (period !== "year") return;
    if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear()) {
      setYearSummary(null); setYearError("Select a valid year."); return;
    }
    let active = true;
    setYearLoading(true); setYearError(""); setYearSummary(null);
    api.get(`/jobs/in-house-applicators/${data.membership_id}/`, { params: { month, wage_year: year } })
      .then(response => { if (active) setYearSummary(response.data.wage_year_summary); })
      .catch(failure => { if (active) setYearError(failure.response?.data?.wage_year || "Yearly wages could not be loaded. Try again."); })
      .finally(() => { if (active) setYearLoading(false); });
    return () => { active = false; };
  }, [period, year, month, data.membership_id, data.ledger]);
  const update = event => setEntry(current => ({ ...current, [event.target.name]: event.target.value }));
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await api.post(`/jobs/in-house-applicators/${data.membership_id}/ledger/`, entry);
      setEntry(current => ({ ...current, amount: "", reference: "", note: "" }));
      setSuccess("Wage transaction saved.");
      await onSaved();
    } catch (failure) { setError(failure.response?.data?.detail || "Wage transaction could not be saved. Your inputs are retained."); }
    finally { setSaving(false); }
  }
  return <>{user?.role === "CONTRACTOR" && <EmployeeOvertimeSettings data={data} onSaved={onSaved} />}<section id="employee-wages" className="scroll-mt-20 rounded-xl border bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold bp-ui-section-heading">Wage summary</h2><p className="mt-1 text-xs text-slate-500">Total earning = recorded earnings and bonus + OT pay + base adjustments − advances. Payments are listed separately in the ledger. OT pay is posted from approved attendance using its saved hourly rate.</p></div><div className="flex flex-wrap items-end gap-2"><div role="group" aria-label="Wage summary period" className="flex rounded-lg border p-1"><button type="button" onClick={() => setPeriod("month")} aria-pressed={period === "month"} className={`min-h-9 rounded-md px-3 text-sm ${period === "month" ? "bg-indigo-600 text-white" : "text-slate-700"}`}>Month</button><button type="button" onClick={() => setPeriod("year")} aria-pressed={period === "year"} className={`min-h-9 rounded-md px-3 text-sm ${period === "year" ? "bg-indigo-600 text-white" : "text-slate-700"}`}>Year</button></div>{period === "month" && month && setMonth ? <label className="text-xs font-semibold">Month<input aria-label="Wage summary month" type="month" max={localDateKey().slice(0, 7)} value={month} onChange={event => setMonth(event.target.value)} className="mt-1 block min-h-11 rounded-lg border px-3 text-sm bp-ui-control" /></label> : <label className="text-xs font-semibold">Year<input aria-label="Wage summary year" type="number" min="1900" max={new Date().getFullYear()} value={year} onChange={event => setYear(event.target.value)} className="mt-1 block min-h-11 w-28 rounded-lg border px-3 text-sm bp-ui-control" /></label>}</div></div>
    <p className="mt-3 text-xs text-slate-600">“Adjustments” are ledger corrections that add to or reduce the balance. OT corrections are included in OT pay; base adjustments show the remaining corrections. Open an adjustment below to see its date, reason and linked attendance record, if any.</p>
    {period === "month" ? <><div className="employee-table-wrap employee-payroll-summary mt-4"><table className="employee-table" data-mobile-table="keep" aria-label="Monthly employee wage summary"><caption className="sr-only">Monthly wages for {data.name}, Employee ID {data.employee_code}</caption><thead><tr><th scope="col">Name</th><th scope="col">Employee ID</th><th scope="col">Days worked</th><th scope="col">Earning</th><th scope="col">OT hours</th><th scope="col">OT pay</th><th scope="col">Advance deduction</th><th scope="col">Base adjustments</th><th scope="col">Total earning</th></tr></thead><tbody><tr><td><strong>{data.name}</strong></td><td>{data.employee_code || "Not assigned"}</td><td>{monthly.daysWorked}</td><td>{money(monthly.earning)}</td><td>{monthly.overtimeHours} hrs</td><td>{money(monthly.overtimePay)}</td><td>{money(monthly.advanceDeduction)}</td><td>{money(monthly.adjustments)}</td><td><strong>{money(monthly.totalEarning)}</strong></td></tr></tbody></table></div>{monthlyAdjustments.length > 0 && <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">View {monthlyAdjustments.length} adjustment{monthlyAdjustments.length === 1 ? "" : "s"} for {month}</summary><ul className="mt-2 space-y-2">{monthlyAdjustments.map(row => <li key={row.id} className="border-t pt-2 text-sm"><strong>{row.date} · {row.entry_type === "DEBIT_ADJUSTMENT" ? "+" : "−"}{money(row.amount)}</strong><span className="ml-2">{row.note || row.reference || "No reason recorded"} · {adjustmentSource(row)}</span></li>)}</ul></details>}</> : <>{yearLoading && <p role="status" className="mt-4 text-sm">Loading yearly wages…</p>}{yearError && <p role="alert" className="mt-4 text-sm text-red-700">{yearError}</p>}{yearSummary && <div className="employee-table-wrap employee-payroll-summary mt-4"><table className="employee-table" data-mobile-table="keep" aria-label={`Yearly employee wage summary for ${year}`}><thead><tr><th scope="col">Month</th><th scope="col">Days worked</th><th scope="col">Earning</th><th scope="col">OT hours</th><th scope="col">OT pay</th><th scope="col">Advance deduction</th><th scope="col">Base adjustments</th><th scope="col">Total earning</th></tr></thead><tbody>{yearSummary.months.map(row => <tr key={row.month}><th scope="row">{new Date(`${row.month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "short" })}</th><td>{row.days_worked}</td><td>{money(row.earning)}</td><td>{row.overtime_hours} hrs</td><td>{money(row.overtime_pay)}</td><td>{money(row.advance_deduction)}</td><td>{row.adjustment_entries.length ? <details><summary className="cursor-pointer font-semibold">{money(row.adjustments)}</summary><ul className="mt-2 min-w-48 space-y-2 text-xs font-normal">{row.adjustment_entries.map(entry => <li key={entry.id}>{entry.date} · {entry.entry_type === "DEBIT_ADJUSTMENT" ? "+" : "−"}{money(entry.amount)}<br />{entry.note || entry.reference || "No reason recorded"}<br />{adjustmentSource(entry)}</li>)}</ul></details> : money(row.adjustments)}</td><td><strong>{money(row.total_earning)}</strong></td></tr>)}</tbody><tfoot><tr><th scope="row">Year total</th><td>{yearSummary.totals.days_worked}</td><td>{money(yearSummary.totals.earning)}</td><td>{yearSummary.totals.overtime_hours} hrs</td><td>{money(yearSummary.totals.overtime_pay)}</td><td>{money(yearSummary.totals.advance_deduction)}</td><td>{money(yearSummary.totals.adjustments)}</td><td><strong>{money(yearSummary.totals.total_earning)}</strong></td></tr></tfoot></table></div>}</>}
    <h2 className="mt-7 text-lg font-semibold bp-ui-section-heading">Wage transactions for {month}</h2>
    <p className="mt-1 text-xs text-slate-500">Saved {label(data.salary_basis).toLowerCase()} wage: {money(data.salary_amount)}. Current week: {data.week_start} to {data.week_end}.</p>
    <dl className="employee-wage-summary mt-4">
      {[["Current week attendance earnings",data.weekly_earning],["Recorded earnings, bonus & OT",data.total_earnings],["Payments, advances & credit corrections",data.total_paid],["Recorded ledger balance",data.balance]].map(([title,value]) => <div key={title}><dt>{title}</dt><dd>{money(value)}</dd></div>)}
    </dl>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="employee-success mt-3">{success}</p>}
    {user?.role === "CONTRACTOR" && data.is_active !== false && <details className="mt-4">
      <summary className="cursor-pointer py-3 text-sm font-semibold">Record wage transaction</summary>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Date<input required type="date" max={localDateKey()} name="date" value={entry.date} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Transaction<select name="entry_type" value={entry.entry_type} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control"><option value="PAYMENT">Wage payment</option><option value="ADVANCE">Advance</option></select></label>
        <label className="text-xs">Amount<input required name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={entry.amount} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Payment mode<select name="payment_mode" value={entry.payment_mode} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank</option></select></label>
        <label className="text-xs">Reference<input name="reference" value={entry.reference} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Note<input name="note" value={entry.note} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <button disabled={saving} className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : "Save wage transaction"}</button>
      </form>
    </details>}
    <div className="employee-table-wrap mt-4"><table className="employee-table" data-mobile-table="keep" aria-label="Employee wage transactions"><thead><tr><th scope="col">Date / type</th><th scope="col">Amount</th><th scope="col">Details</th></tr></thead><tbody>{data.ledger.map(row => <tr key={row.id}><td>{row.date}<small>{label(row.entry_type)}</small></td><td>{money(row.amount)}</td><td>{row.note || "No note"}<small>{[row.payment_mode,row.reference,row.schedule ? `Site ${row.schedule}` : ""].filter(Boolean).join(" · ")}</small></td></tr>)}{!data.ledger.length && <tr><td colSpan={3} className="text-slate-500">No wage transactions for the selected month.</td></tr>}</tbody></table></div>
  </section></>;
}
