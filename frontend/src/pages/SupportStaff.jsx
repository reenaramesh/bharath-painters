import { useEffect, useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function SupportStaff() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({ name: "", mobile: "", email: "" });
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [staffResponse, auditResponse] = await Promise.all([
        api.get("/quotations/support-staff/"),
        api.get("/quotations/support-workspace/audit/"),
      ]);
      setMembers(staffResponse.data);
      setAudit(auditResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Support staff could not be loaded.");
    }
  }
  useEffect(() => { if (user?.role === "ADMIN") load(); }, [user?.role]);

  async function create(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { data } = await api.post("/quotations/support-staff/", form);
      setCredentials(data);
      setForm({ name: "", mobile: "", email: "" });
      await load();
      setMessage("Support staff account created. Share the temporary password privately and ask the staff member to change it on first sign-in.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Staff account could not be created.");
    } finally { setBusy(false); }
  }

  async function toggle(member) {
    const action = member.is_active ? "disable" : "enable";
    if (!window.confirm(`${action === "disable" ? "Disable" : "Enable"} ${member.name}'s support access?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api.patch(`/quotations/support-staff/${member.id}/`, { is_active: !member.is_active, reason: `Administrator chose to ${action} staff access.` });
      await load();
      setMessage(`Support access ${member.is_active ? "disabled" : "enabled"}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Support access could not be updated.");
    } finally { setBusy(false); }
  }

  if (user?.role !== "ADMIN") return <p className="rounded-xl border bg-white p-6">Administrator access only.</p>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><p className="text-sm font-semibold text-[var(--app-primary)]">Administration</p><h1 className="text-3xl font-bold">Support staff</h1><p className="mt-2 text-sm text-slate-600">Give staff a separate Support Desk login. They cannot use the administrator dashboard.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {credentials && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><h2 className="font-bold">One-time login details</h2><p className="mt-2">Mobile: <strong>{credentials.mobile}</strong></p><p>Temporary password: <strong>{credentials.temporary_password}</strong></p><button type="button" onClick={() => setCredentials(null)} className="mt-3 rounded-lg border px-3 py-2 font-semibold">I have saved these details</button></section>}
    <form onSubmit={create} className="rounded-xl border bg-white p-5"><h2 className="font-bold">Add support staff</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{[["Name", "name", "text"], ["Mobile", "mobile", "tel"], ["Email", "email", "email"]].map(([label, field, type]) => <label key={field} className="text-sm font-semibold">{label}<input required type={type} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>)}</div><button disabled={busy} className="mt-4 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Create staff login</button></form>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Staff access</h2><div className="mt-4 divide-y">{members.length === 0 && <p className="text-sm text-slate-500">No support staff yet.</p>}{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{member.name}</p><p className="text-sm text-slate-500">{member.mobile} · {member.email}</p></div><button type="button" disabled={busy} onClick={() => toggle(member)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{member.is_active ? "Disable access" : "Enable access"}</button></div>)}</div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Recent support actions</h2><p className="mt-1 text-sm text-slate-500">Latest 100 actions, including staff access changes and record recovery.</p><div className="mt-3 max-h-96 divide-y overflow-y-auto">{audit.length === 0 && <p className="py-3 text-sm text-slate-500">No actions recorded yet.</p>}{audit.map((item) => <div key={item.id} className="py-3 text-sm"><p><strong>{item.actor}</strong> · {item.action.replaceAll("_", " ")} · {item.target_type} #{item.target_id}</p><p className="mt-1 text-slate-600">{item.reason}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}{item.ticket_id ? ` · Ticket #${item.ticket_id}` : ""}</p></div>)}</div></section>
  </div>;
}
