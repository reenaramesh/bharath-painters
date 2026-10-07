import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import "./admin-portal.css";

const groups = [
  ["accounts", "Accounts"], ["customers", "Customers"],
  ["quotations", "Quotations"], ["invoices", "Invoices"],
  ["properties", "Properties"], ["measurements", "Area calculations"],
];
const guides = [
  ["Cannot sign in", "Find the account. Check whether it is active and has a verified email. Link it to the owner's ticket, then send recovery steps. Never ask for a password or OTP."],
  ["Duplicate or deleted mobile", "Find the old account and its status. Add a private note with the record ID. An administrator can release a number held by a previously deleted account."],
  ["Customer connection", "Check the customer's contractor and the ticket details. Ask the customer to accept, reject, reconnect or unblock from My Contractors; do not change consent for them."],
  ["Area calculation", "Find the property and measurement reference. Ask the contractor to correct an editable record. Link locked or submitted records to the ticket for administrator review."],
  ["Quotation", "Find the quotation number. A deleted draft can be restored when its contractor raised the ticket. Sent or approved quotations need the existing revision process."],
  ["Invoice or payment", "Find and link the invoice. Record the amount and issue in a private note. Ask an administrator to review corrections, cancellation or payment disputes."],
  ["Messages or safety", "Record the conversation and evidence in the ticket. Escalate harassment, fraud or blocking decisions to an administrator."],
  ["Missing data or live outage", "Record the exact page, time, affected account and error. Previously hard-deleted records need a database backup; support actions cannot recreate them from memory."],
];

export default function SupportWorkspace() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [operation, setOperation] = useState(null);
  const [ticketId, setTicketId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!["ADMIN", "SUPPORT"].includes(user?.role)) return;
    api.get("/quotations/support-tickets/").then(({ data }) => setTickets(data.filter((item) => ["OPEN", "IN_PROGRESS", ...(user?.role === "ADMIN" ? ["NEEDS_ADMIN"] : [])].includes(item.status)))).catch(() => setError("Support tickets could not be loaded."));
  }, [user?.role]);

  async function search(event) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const { data } = await api.get("/quotations/support-workspace/search/", { params: { q: query.trim() } });
      setResults(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Records could not be searched.");
    } finally { setBusy(false); }
  }

  function choose(action, target, targetType = "") {
    setOperation({ action, target, targetType }); setTicketId(""); setReason(""); setError(""); setSuccess("");
  }

  async function run(event) {
    event.preventDefault();
    const ticketRequired = user?.role === "SUPPORT" || !["SUSPEND_ACCOUNT", "DELETE_ACCOUNT"].includes(operation?.action);
    if (!operation || (ticketRequired && !ticketId) || reason.trim().length < 10) return;
    if (!window.confirm(`Apply ${operation.action.replaceAll("_", " ").toLowerCase()} to record #${operation.target.id}? This action is recorded in the support history.`)) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/quotations/support-workspace/actions/", {
        action: operation.action, target_id: operation.target.id, target_type: operation.targetType,
        ticket_id: ticketId ? Number(ticketId) : null, reason: reason.trim(),
      });
      setSuccess(data.message); setOperation(null);
      if (query.trim().length >= 3) {
        const refreshed = await api.get("/quotations/support-workspace/search/", { params: { q: query.trim() } });
        setResults(refreshed.data);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.reason || "The support action could not be completed.");
    } finally { setBusy(false); }
  }

  if (!["ADMIN", "SUPPORT"].includes(user?.role)) return <p className="rounded-xl border bg-white p-6">Support access only.</p>;
  return <div className="mx-auto max-w-6xl space-y-5">
    <header><p className="text-sm font-semibold text-[var(--app-primary)]">Support operations</p><h1 className="text-3xl font-bold">Recovery Center</h1><p className="mt-2 text-sm text-slate-600">Find an account or business record, link the fix to a ticket, and record the reason. Financial and linked project records are reviewed in the Support Desk.</p></header>
    <div className="rounded-xl border bg-white p-4 text-sm text-slate-600"><strong className="text-slate-900">Common cases:</strong> sign-in → verify account and send recovery instructions; quotation → restore or cancel an unlinked draft; invoice, payment or submitted measurement → document the issue in a ticket and escalate to an administrator.</div>
    <section className="grid gap-3 sm:grid-cols-2">{guides.map(([title, body]) => <details key={title} className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">{title}</summary><p className="mt-2 text-sm text-slate-600">{body}</p></details>)}</section>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    <form onSubmit={search} className="flex gap-2 rounded-xl border bg-white p-4"><input required minLength={3} maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phone number, Bharath ID, email, name or document number" aria-label="Search phone number, ID or email" className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm" /><button disabled={busy} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Search</button></form>
    {results?.accounts?.length > 0 && <section className="grid gap-3 sm:grid-cols-2">{results.accounts.map((account) => <article key={account.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{account.name || account.bharath_id || `Account #${account.id}`}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{account.role}</span></div><p className="mt-2 text-sm text-slate-600">{account.bharath_id || `#${account.id}`} · {account.mobile} · {account.email || "No email"}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Account</dt><dd className="font-semibold">{account.active ? "Active" : "Inactive"}</dd></div><div><dt className="text-slate-500">Recovery email</dt><dd className="font-semibold">{account.email_verified ? "Verified" : "Not verified"}</dd></div><div><dt className="text-slate-500">Verification</dt><dd className="font-semibold">{account.verification_status || "Unknown"}</dd></div><div><dt className="text-slate-500">Password login</dt><dd className="font-semibold">{account.has_password ? "Available" : "Not set"}</dd></div></dl><p className="mt-3 text-xs text-slate-500">Guide the account holder to Account Security for settings, or Forgot Password for recovery. Verification codes are sent to their email and never shown to support staff.</p>{["CUSTOMER", "CONTRACTOR", "PAINTER"].includes(account.role) && !String(account.mobile).startsWith("D") && <div className="mt-4 flex flex-wrap gap-2">{account.active && <button type="button" onClick={() => choose("SUSPEND_ACCOUNT", account, "USER")} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Suspend account</button>}<button type="button" onClick={() => choose("DELETE_ACCOUNT", account, "USER")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Delete account</button></div>}</article>)}</section>}
    {results && groups.map(([key, label]) => <section key={key} className="rounded-xl border bg-white p-4"><h2 className="font-bold">{label} <span className="text-sm font-normal text-slate-500">({results[key].length})</span></h2><div className="mt-3 divide-y">{results[key].length === 0 && <p className="py-2 text-sm text-slate-500">No matches</p>}{results[key].map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="font-semibold">{item.number || item.reference || item.bharath_id || item.name || `#${item.id}`}</p><p className="break-all text-xs text-slate-500">{[item.customer, item.contractor, item.role, item.status, item.deleted ? "Deleted draft" : null, item.mobile, item.email, item.property, item.amount ? `₹${item.amount}` : null].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => choose("LINK_RECORD", item, { accounts: "USER", customers: "CUSTOMER", quotations: "QUOTATION", invoices: "INVOICE", properties: "PROPERTY", measurements: "MEASUREMENT" }[key])} className="rounded-lg border px-3 py-2 text-xs font-semibold">Link to ticket</button>{key === "accounts" && item.active && item.email_verified && <button type="button" onClick={() => choose("SEND_RECOVERY_INSTRUCTIONS", item)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Send recovery steps</button>}{key === "quotations" && item.deleted && <button type="button" onClick={() => choose("RESTORE_DELETED_QUOTATION", item)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Restore deleted draft</button>}{key === "quotations" && !item.has_invoice && item.status === "DRAFT" && !item.deleted && <button type="button" onClick={() => choose("CANCEL_DRAFT_QUOTATION", item)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Cancel draft</button>}</div></div>)}</div></section>)}
    {results && <p className="text-xs text-slate-500">Showing up to 20 matches per record type. Use a more specific search to narrow results.</p>}
    <div className="rounded-xl border bg-white p-4 text-sm"><Link to="/support-tickets" className="font-semibold text-[var(--app-primary)]">Open Support Desk →</Link><p className="mt-1 text-slate-600">Reply to the customer, assign the case, add private notes, or close it after resolution.</p></div>
    {operation && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={run} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-bold">{operation.action.replaceAll("_", " ")}</h2>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="text-sm text-slate-600">Account #{operation.target.id}. This action will be recorded in the support audit.</p><label className="block text-sm font-semibold">Related support ticket {user?.role === "ADMIN" && ["SUSPEND_ACCOUNT", "DELETE_ACCOUNT"].includes(operation.action) ? "(optional)" : ""}<select required={user?.role === "SUPPORT" || !["SUSPEND_ACCOUNT", "DELETE_ACCOUNT"].includes(operation.action)} value={ticketId} onChange={(event) => setTicketId(event.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2.5"><option value="">{user?.role === "ADMIN" && ["SUSPEND_ACCOUNT", "DELETE_ACCOUNT"].includes(operation.action) ? "No related ticket" : "Select ticket"}</option>{tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.ticket_number} · {ticket.requester_name} · {ticket.subject}</option>)}</select></label><label className="block text-sm font-semibold">Justification<textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this account action is necessary" className="mt-2 w-full rounded-lg border px-3 py-2.5 font-normal" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setOperation(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Apply action</button></div></form></div>}
  </div>;
}
