import { useState } from "react";
import { PlusCircle } from "lucide-react";
import api from "../api/client";
import { StatusBadge } from "./ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";

const RAISABLE = ["SCHEDULED", "IN_PROGRESS", "SUBMITTED_FOR_REVIEW", "CORRECTION_REQUESTED"];

// Extra work found on site. The receiving contractor asks, the main contractor
// decides — the asker can never approve their own request.
export default function SubcontractAdditionalWorkPanel({ workOrder, isMain, onChanged }) {
  const rows = workOrder.additional_work_requests || [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ description: "", estimated_amount: "" });

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "That request could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((row) => row.status === "PENDING");

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <PlusCircle className="h-5 w-5" /> Extra work found
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Work that was not in the agreed scope. Whoever does the extra work asks, the other side
        decides the money.
      </p>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!isMain && RAISABLE.includes(workOrder.status) && (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await api.post(`/outsourcing/work-orders/${workOrder.id}/additional-work/`, {
                description: form.description,
                estimated_amount: form.estimated_amount || "0",
              });
              setForm({ description: "", estimated_amount: "" });
            });
          }}
        >
          <input
            required
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Describe the extra work"
            className="min-w-[240px] flex-1"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.estimated_amount}
            onChange={(event) => setForm({ ...form, estimated_amount: event.target.value })}
            placeholder="Estimate (optional)"
            className="w-44"
          />
          <button
            disabled={busy}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            Ask for approval
          </button>
        </form>
      )}

      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{row.description}</p>
                <p className="text-xs text-slate-500">
                  Asked by {row.requested_by_name} · {prettyDate(row.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{rupees(row.estimated_amount)}</span>
                <StatusBadge status={row.status} />
              </div>
            </div>

            {row.status === "APPROVED" && (
              <p className="mt-2 text-sm font-semibold text-emerald-700">
                Approved at {rupees(row.approved_amount)}
              </p>
            )}
            {row.decision_note && (
              <p className="mt-1 text-sm text-slate-600">{row.decision_note}</p>
            )}

            {isMain && row.status === "PENDING" && (
              <DecisionForm
                busy={busy}
                estimate={row.estimated_amount}
                onDecide={(decision, payload) =>
                  run(() =>
                    api.post(
                      `/outsourcing/work-orders/${workOrder.id}/additional-work/decisions/`,
                      { request: row.id, decision, ...payload },
                    ),
                  )
                }
              />
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
            No extra work raised{pending.length ? "" : " yet"}.
          </li>
        )}
      </ul>
    </section>
  );
}

function DecisionForm({ busy, estimate, onDecide }) {
  const [note, setNote] = useState("");
  const [approved, setApproved] = useState(String(estimate ?? ""));

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="number"
          min="0"
          step="0.01"
          value={approved}
          onChange={(event) => setApproved(event.target.value)}
          placeholder="Approved amount"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note (required to decline)"
          className="sm:col-span-2"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy || approved === ""}
          onClick={() => onDecide("APPROVED", { approved_amount: approved, note })}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={busy || !note.trim()}
          onClick={() => onDecide("DECLINED", { note })}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}