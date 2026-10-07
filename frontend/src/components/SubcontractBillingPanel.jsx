import { useState } from "react";
import { ReceiptIndianRupee } from "lucide-react";
import api from "../api/client";
import { StatusBadge } from "./ui";
import { apiErrorMessage, PAYMENT_MODES, prettyDate, rupees } from "../utils/subcontract";

// The subcontract invoice is the main contractor paying the receiving
// contractor. It is deliberately separate from the customer invoice on the
// quotation and from the receiving contractor's own wage ledger.
export default function SubcontractBillingPanel({ workOrder, isMain, onChanged }) {
  const invoice = (workOrder.invoices || [])[0] || null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    subtotal: String(workOrder.agreed_amount || ""),
    tax_amount: "0",
    total: String(workOrder.agreed_amount || ""),
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
  });
  const [payment, setPayment] = useState({
    amount: "",
    payment_mode: "UPI",
    payment_reference: "",
    notes: "",
  });

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "That billing change could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const canInvoice = isMain && workOrder.status === "COMPLETED" && !invoice;

  return (
    <section className="rounded-2xl border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ReceiptIndianRupee className="h-5 w-5" /> Bill to {isMain ? "your contractor" : "you"}
          </h2>
          
        </div>
        {invoice && <StatusBadge status={invoice.status} />}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!invoice && (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          {isMain
            ? workOrder.status === "COMPLETED"
              ? "Work is approved complete. You can raise the invoice now."
              : "An invoice can be raised once the work is approved as complete."
            : "No invoice raised yet. You will see it here as soon as the main contractor sends it."}
        </p>
      )}

      {canInvoice && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              api.post(`/outsourcing/work-orders/${workOrder.id}/invoices/`, {
                subtotal: form.subtotal,
                tax_amount: form.tax_amount || "0",
                total: form.total,
                issue_date: form.issue_date,
                due_date: form.due_date || null,
                notes: form.notes,
              }),
            );
          }}
        >
          {[
            ["subtotal", "Subtotal"],
            ["tax_amount", "Tax"],
            ["total", "Total"],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-semibold">{label}</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Issue date</span>
            <input
              type="date"
              value={form.issue_date}
              onChange={(event) => setForm({ ...form, issue_date: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Due date</span>
            <input
              type="date"
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Notes</span>
            <input
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <div className="sm:col-span-3">
            <button
              disabled={busy}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
            >
              Raise invoice
            </button>
          </div>
        </form>
      )}

      {invoice && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {invoice.reference}
              </p>
              <p className="text-sm text-slate-500">
                Issued {prettyDate(invoice.issue_date)}
                {invoice.due_date ? ` · due ${prettyDate(invoice.due_date)}` : ""}
              </p>
            </div>
            <p className="text-xl font-bold">{rupees(invoice.total)}</p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <Figure label="Total" value={rupees(invoice.total)} />
            <Figure label="Paid" value={rupees(invoice.amount_paid)} tone="text-emerald-600" />
            <Figure label="Balance" value={rupees(invoice.balance)} tone="text-amber-600" />
          </dl>

          {(invoice.payments || []).length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoice.payments.map((paymentRow) => (
                  <tr key={paymentRow.id}>
                    <td className="py-2 pr-3">{prettyDate(paymentRow.received_date)}</td>
                    <td className="py-2 pr-3">{paymentRow.payment_mode}</td>
                    <td className="py-2 pr-3 text-slate-500">
                      {paymentRow.payment_reference || "—"}
                    </td>
                    <td className="py-2 text-right font-bold">{rupees(paymentRow.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isMain && Number(invoice.balance) > 0 && invoice.status !== "VOID" && (
            <form
              className="grid gap-2 sm:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault();
                run(() =>
                  api.post(`/outsourcing/work-orders/${workOrder.id}/payments/`, {
                    invoice: invoice.id,
                    amount: payment.amount,
                    payment_mode: payment.payment_mode,
                    payment_reference: payment.payment_reference,
                    notes: payment.notes,
                  }),
                );
              }}
            >
              <input
                required
                type="number"
                min="0"
                step="0.01"
                max={invoice.balance}
                placeholder={`Up to ${invoice.balance}`}
                value={payment.amount}
                onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
              />
              <select
                value={payment.payment_mode}
                onChange={(event) => setPayment({ ...payment, payment_mode: event.target.value })}
              >
                {PAYMENT_MODES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Reference"
                value={payment.payment_reference}
                onChange={(event) =>
                  setPayment({ ...payment, payment_reference: event.target.value })
                }
              />
              <input
                placeholder="Note"
                value={payment.notes}
                onChange={(event) => setPayment({ ...payment, notes: event.target.value })}
              />
              <button
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
              >
                Record payment
              </button>
            </form>
          )}

          {isMain && invoice.notes && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{invoice.notes}</p>
          )}
        </div>
      )}
    </section>
  );
}

function Figure({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-bold ${tone}`}>{value}</dd>
    </div>
  );
}