import { useState } from "react";
import { FileSignature, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import api from "../api/client";
import { StatusBadge } from "./ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";

const QUOTABLE = ["SENT", "ACCEPTED", "SCHEDULED", "IN_PROGRESS", "CORRECTION_REQUESTED"];

// One panel for both sides of the trade, because the quote is the shared record:
// the receiving contractor prices it, the main contractor decides on it.
export default function SubcontractQuotePanel({ workOrder, isMain, onChanged }) {
  const quotes = workOrder.quotes || [];
  const current = quotes.find((quote) => quote.is_current) || quotes[0] || null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "The quote could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  const canDecide =
    isMain && current && current.status === "SENT" && workOrder.status !== "CANCELLED";

  return (
    <section className="rounded-2xl border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileSignature className="h-5 w-5" /> Price
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isMain
              ? "What the other contractor charges for this work. Your customer invoice is a separate ledger."
              : "Send your price for this work. The main contractor accepts or rejects it."}
          </p>
        </div>
        {!isMain && QUOTABLE.includes(workOrder.status) && (
          <button
            onClick={() => setEditing((open) => !open)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            {editing ? "Close" : current?.status === "DRAFT" ? "Edit price" : "New price"}
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {editing && !isMain && (
        <QuoteForm
          workOrder={workOrder}
          quote={current?.status === "DRAFT" ? current : null}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await run(async () => {
              await api.post(`/outsourcing/work-orders/${workOrder.id}/quotes/`, {
                work_order: workOrder.id,
                ...payload,
              });
              setEditing(false);
            });
          }}
        />
      )}

      {!editing && !current && (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          {isMain
            ? "The other contractor has not sent a price yet."
            : "No price sent yet. Build one to ask for this work."}
        </p>
      )}

      {!editing && current && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {current.reference}
              </p>
              <p className="text-sm text-slate-500">
                Sent by {current.created_by_name || "—"}
                {current.sent_at ? ` · ${prettyDate(current.sent_at)}` : " · not sent yet"}
                {current.expires_at ? ` · valid till ${prettyDate(current.expires_at)}` : ""}
              </p>
            </div>
            <StatusBadge status={current.status} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4 text-right">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(current.quote_lines || []).map((line) => (
                  <tr key={line.id}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold">{line.description_snapshot}</p>
                      {line.specification && (
                        <p className="text-xs text-slate-500">{line.specification}</p>
                      )}
                      {line.is_optional && (
                        <p className="text-xs font-semibold text-amber-600">Optional</p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {line.quantity} {line.unit_name_snapshot}
                    </td>
                    <td className="py-3 pr-4 text-right">{rupees(line.unit_rate)}</td>
                    <td className="py-3 text-right font-semibold">{rupees(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="grid gap-2 border-t pt-4 text-sm sm:grid-cols-3">
            <Total label="Subtotal" value={rupees(current.subtotal)} />
            <Total label="Tax" value={rupees(current.tax_amount)} />
            <Total label="Total" value={rupees(current.total)} strong />
          </dl>

          {current.terms && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{current.terms}</p>
          )}

          {current.decision_note && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Decision note: {current.decision_note}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!isMain && current.status === "DRAFT" && (
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api.patch(`/outsourcing/work-orders/${workOrder.id}/quotes/`, {
                      quote: current.id,
                    }),
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
              >
                <Send className="h-4 w-4" /> Send price
              </button>
            )}
            {canDecide && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.post(
                        `/outsourcing/work-orders/${workOrder.id}/quote-decisions/`,
                        { quote: current.id, decision: "ACCEPTED" },
                      ),
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <ThumbsUp className="h-4 w-4" /> Accept price
                </button>
                <RejectQuote
                  workOrder={workOrder}
                  quote={current}
                  busy={busy}
                  onRun={run}
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function RejectQuote({ workOrder, quote, busy, onRun }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700"
      >
        <ThumbsDown className="h-4 w-4" /> Reject
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-red-100 bg-red-50/60 p-3">
      <p className="text-sm font-semibold text-red-800">Tell them what to change</p>
      <textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="Rate looks high for the second coat."
      />
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy || !note.trim()}
          onClick={() =>
            onRun(async () => {
              await api.post(`/outsourcing/work-orders/${workOrder.id}/quote-decisions/`, {
                quote: quote.id,
                decision: "REJECTED",
                note,
              });
              setOpen(false);
              setNote("");
            })
          }
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Confirm rejection
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

function QuoteForm({ workOrder, quote, busy, onSubmit, onCancel }) {
  // Reuse the shared scopes when they exist so the price cannot drift away from
  // the work description, otherwise start from one blank line.
  const [lines, setLines] = useState(() =>
    quote
      ? (quote.quote_lines || []).map((line) => ({
          description_snapshot: line.description_snapshot,
          specification: line.specification || "",
          quantity: String(line.quantity ?? ""),
          unit_name_snapshot: line.unit_name_snapshot || "",
          unit_rate: String(line.unit_rate ?? ""),
          is_optional: Boolean(line.is_optional),
        }))
      : (workOrder.scopes || []).map((scope) => ({
          description_snapshot: scope.work_description_snapshot || scope.title_snapshot,
          specification: "",
          quantity: String(scope.quantity ?? ""),
          unit_name_snapshot: scope.unit_name_snapshot || "",
          unit_rate: String(scope.unit_rate ?? ""),
          is_optional: false,
        })),
  );
  const [taxAmount, setTaxAmount] = useState(String(quote?.tax_amount ?? "0"));
  const [terms, setTerms] = useState(quote?.terms || "");
  const [notes, setNotes] = useState(quote?.notes || "");

  const update = (index, patch) =>
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );

  const estimated = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_rate || 0),
    0,
  );

  return (
    <form
      className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          quote_lines: lines
            .filter((line) => line.description_snapshot?.trim() && Number(line.quantity) > 0)
            .map((line) => ({
              description_snapshot: line.description_snapshot,
              specification: line.specification,
              quantity: line.quantity,
              unit_rate: line.unit_rate,
              is_optional: line.is_optional,
            })),
          tax_amount: taxAmount || "0",
          terms,
          notes,
        });
      }}
    >
      <p className="text-sm font-bold">
        {quote ? "Edit draft price" : "Price this work"}{" "}
        <span className="font-normal text-slate-500">
          Estimated {rupees(estimated + Number(taxAmount || 0))}
        </span>
      </p>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="rounded-xl border bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-12">
              <input
                required
                value={line.description_snapshot}
                onChange={(event) => update(index, { description_snapshot: event.target.value })}
                placeholder="Work description"
                className="sm:col-span-6"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={line.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
                placeholder="Qty"
                className="sm:col-span-2"
              />
              <input
                value={line.unit_name_snapshot}
                onChange={(event) => update(index, { unit_name_snapshot: event.target.value })}
                placeholder="Unit"
                className="sm:col-span-2"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={line.unit_rate}
                onChange={(event) => update(index, { unit_rate: event.target.value })}
                placeholder="Rate"
                className="sm:col-span-2"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                value={line.specification}
                onChange={(event) => update(index, { specification: event.target.value })}
                placeholder="Specification or note"
                className="flex-1"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={line.is_optional}
                  onChange={(event) => update(index, { is_optional: event.target.checked })}
                />
                Optional
              </label>
              <span className="text-sm font-bold">
                {rupees(Number(line.quantity || 0) * Number(line.unit_rate || 0))}
              </span>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  className="text-sm font-semibold text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setLines((current) => [
            ...current,
            {
              description_snapshot: "",
              specification: "",
              quantity: "1",
              unit_name_snapshot: "",
              unit_rate: "",
              is_optional: false,
            },
          ])
        }
        className="rounded-lg border px-4 py-2 text-sm font-semibold"
      >
        Add line
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Tax amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={taxAmount}
            onChange={(event) => setTaxAmount(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Terms</span>
        <textarea
          rows={2}
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          placeholder="Payment on completion. 15 day defect liability."
        />
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          disabled={busy}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
        >
          {busy ? "Saving…" : "Save price"}
        </button>
      </div>
    </form>
  );
}

function Total({ label, value, strong }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-lg ${strong ? "font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}