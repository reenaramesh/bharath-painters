import { useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { localDateKey } from "../utils/employeeAttendance.js";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const label = value => String(value || "").replaceAll("_", " ");

export default function EmployeeWages({ data, onSaved }) {
  const { user } = useAuth();
  const [entry, setEntry] = useState({ date: localDateKey(), entry_type: "PAYMENT", amount: "", payment_mode: "CASH", reference: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
  return <section id="employee-wages" className="scroll-mt-20 rounded-xl border bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold bp-ui-section-heading">Wages &amp; payments</h2>
    <p className="mt-1 text-xs text-slate-500">Saved {label(data.salary_basis).toLowerCase()} wage: {money(data.salary_amount)}. Current week: {data.week_start} to {data.week_end}.</p>
    <dl className="employee-wage-summary mt-4">
      {[["Current week attendance earnings",data.weekly_earning],["Recorded earnings & bonus",data.total_earnings],["Payments & advances recorded",data.total_paid],["Recorded ledger balance",data.balance]].map(([title,value]) => <div key={title}><dt>{title}</dt><dd>{money(value)}</dd></div>)}
    </dl>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="employee-success mt-3">{success}</p>}
    {user?.role === "CONTRACTOR" && data.is_active !== false && <details className="mt-4">
      <summary className="cursor-pointer py-3 text-sm font-semibold">Record wage transaction</summary>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Date<input required type="date" max={localDateKey()} name="date" value={entry.date} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Transaction<select name="entry_type" value={entry.entry_type} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control"><option value="PAYMENT">Wage payment</option><option value="EARNING">Record earning</option><option value="ADVANCE">Advance</option></select></label>
        <label className="text-xs">Amount<input required name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={entry.amount} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Payment mode<select name="payment_mode" value={entry.payment_mode} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank</option></select></label>
        <label className="text-xs">Reference<input name="reference" value={entry.reference} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <label className="text-xs">Note<input name="note" value={entry.note} onChange={update} className="mt-1 block min-h-11 w-full rounded-lg border px-3 bp-ui-control" /></label>
        <button disabled={saving} className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : "Save wage transaction"}</button>
      </form>
    </details>}
    <div className="employee-table-wrap mt-4"><table className="employee-table" data-mobile-table="keep" aria-label="Employee wage transactions"><thead><tr><th scope="col">Date / type</th><th scope="col">Amount</th><th scope="col">Details</th></tr></thead><tbody>{data.ledger.map(row => <tr key={row.id}><td>{row.date}<small>{label(row.entry_type)}</small></td><td>{money(row.amount)}</td><td>{row.note || "No note"}<small>{[row.payment_mode,row.reference,row.schedule ? `Site ${row.schedule}` : ""].filter(Boolean).join(" · ")}</small></td></tr>)}{!data.ledger.length && <tr><td colSpan={3} className="text-slate-500">No wage transactions for the selected month.</td></tr>}</tbody></table></div>
  </section>;
}
