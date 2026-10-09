import { useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Handshake, Send } from "lucide-react";
import { StatusBadge } from "./ui";
import { connectionCounterparty, prettyDate } from "../utils/subcontract";

export default function ContractorConnectionCard({ row, busy, onAct, onRequestAgain, initialAction = null, compact = false }) {
  const [openAction, setOpenAction] = useState(initialAction);
  const [reason, setReason] = useState("");
  const other = connectionCounterparty(row);
  const isRecipient = row.viewer_authority === "RECIPIENT";
  const incomingPending = isRecipient && row.status === "PENDING";
  const live = row.status === "CONNECTED";

  const services = isRecipient ? row.requester_services : null;

  return (
    <article className="rounded-2xl border bg-white p-5">
      {!compact && <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{other.label}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {incomingPending ? "Wants to connect with you" : "Connected"} since{" "}
            {prettyDate(row.accepted_at || row.requested_at)}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>}

      {services?.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">They offer: {services.join(", ")}</p>
      )}
      {!compact && isRecipient && row.requester_details && <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
        {[
          ["Company", row.requester_details.company_name],
          ["Owner", row.requester_details.owner_name],
          ["Phone", row.requester_details.mobile],
          ["Bharath ID", row.requester_details.bharath_id],
          ["Service areas", row.requester_details.service_areas],
          ["Work", row.requester_details.work_skills],
        ].filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-800">{value}</dd></div>)}
      </dl>}
      {row.message && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          “{row.message}”
        </p>
      )}
      {row.rejection_reason && row.status === "REJECTED" && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          Reason: {row.rejection_reason}
        </p>
      )}
      {!compact && row.completed_work_orders > 0 && (
        <p className="mt-3 text-xs font-semibold text-slate-600">
          {row.completed_work_orders} job{row.completed_work_orders > 1 ? "s" : ""} completed
          together
          {Number(row.average_rating) > 0 ? ` · rated ${row.average_rating}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-2">
        {incomingPending && (
          <>
            <button
              disabled={busy}
              onClick={() => onAct(row, "accept")}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Handshake className="h-4 w-4" /> Accept
            </button>
            <button
              disabled={busy}
              onClick={() => setOpenAction(openAction === "reject" ? null : "reject")}
              className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700"
            >
              Reject
            </button>
          </>
        )}

        {!incomingPending && row.status === "PENDING" && (
          <p className="text-xs text-slate-500">
            Waiting for {other.label} to accept.
            {row.request_count > 1 ? ` You have asked ${row.request_count} times.` : ""}
          </p>
        )}

        {live && row.can_send_work_order && (
          <Link
            to="/subcontract-work-orders"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Briefcase className="h-4 w-4" /> Send work
          </Link>
        )}

        {live && (
          <details className="connection-management">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-semibold">Manage connection</summary>
            <div className="flex flex-wrap gap-3 py-3">
            <button
              disabled={busy}
              onClick={() => onAct(row, "disconnect")}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
            >
              Disconnect
            </button>
            <button
              disabled={busy}
              onClick={() => setOpenAction(openAction === "block" ? null : "block")}
              className="text-sm font-semibold text-red-600"
            >
              Block
            </button>
            </div>
          </details>
        )}

        {(row.status === "REJECTED" || row.status === "DISCONNECTED") && (
          <button
            disabled={busy}
            onClick={() => onRequestAgain(row)}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
          >
            <Send className="h-4 w-4" /> Request again
          </button>
        )}
      </div>

      {(openAction === "reject" || openAction === "block") && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">
            {openAction === "reject" ? "Why are you declining?" : "Block this contractor?"}
          </p>
          {openAction === "reject" && (
            <input
              maxLength={150}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="We are not taking work in that area."
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            />
          )}
          {openAction === "block" && (
            <p className="mt-1 text-sm text-slate-600">
              They will not be able to send or receive work from you again.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              disabled={busy || (openAction === "reject" && !reason.trim())}
              onClick={() =>
                onAct(row, openAction, openAction === "reject" ? { reason } : {})
              }
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setOpenAction(null)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
