import { useEffect, useState } from "react";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import api from "../api/client";

export default function RecoveryEmailSettings() {
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ recovery_email: "", confirm_recovery_email: "", current_password: "" });
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [testOtp, setTestOtp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try { const { data } = await api.get("/accounts/recovery-email/"); setAccount(data); setError(""); }
    catch { setError("Account security details could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function requestOtp(event) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const { data } = await api.post("/accounts/recovery-email/request/", form);
      setChallenge(data); setTestOtp(data.test_otp || "");
    } catch (requestError) { setError(formatError(requestError.response?.data) || "OTP could not be sent."); }
    finally { setSaving(false); }
  }

  async function verify(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const { data } = await api.post("/accounts/recovery-email/verify/", { challenge_id: challenge.challenge_id, otp });
      setSuccess(data.message); setChallenge(null); setOtp(""); setTestOtp("");
      setForm({ recovery_email: "", confirm_recovery_email: "", current_password: "" });
      await load();
    } catch (requestError) { setError(formatError(requestError.response?.data) || "Email could not be verified."); }
    finally { setSaving(false); }
  }

  if (loading && !account) return <div className="p-12 text-center text-slate-500">Loading account security...</div>;
  return <div className="mx-auto max-w-2xl space-y-6">
    <header><p className="text-sm font-semibold text-amber-600">Account security</p><h1 className="mt-1 text-3xl font-bold">Recovery Email</h1><p className="mt-2 text-slate-500">Verify a private email address for secure password recovery.</p></header>
    {account?.verified && <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" /><div><h2 className="font-bold text-emerald-900">Recovery email verified</h2><p className="mt-1 text-sm text-emerald-800">{account.masked_email}</p><p className="mt-1 text-xs text-emerald-700">Use the form below whenever you need to change it.</p></div></section>}
    {!account?.verified && <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><Mail className="mt-0.5 h-6 w-6 text-amber-700" /><div><h2 className="font-bold">No Recovery Email Added</h2><p className="mt-1 text-sm text-slate-600">Add and verify an email address to enable account recovery.</p><p className="mt-2 text-xs font-semibold text-slate-500">{account?.bharath_id || "Account"} · {account?.masked_mobile}</p></div></section>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</p>}
    {!challenge ? <form onSubmit={requestOtp} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">{account?.verified ? "Change recovery email" : "Add recovery email"}</h2></div>
      <Field label="Recovery Email"><input required type="email" value={form.recovery_email} onChange={(event) => setForm({ ...form, recovery_email: event.target.value })} className={input} /></Field>
      <Field label="Confirm Recovery Email"><input required type="email" value={form.confirm_recovery_email} onChange={(event) => setForm({ ...form, confirm_recovery_email: event.target.value })} className={input} /></Field>
      <Field label="Current Password"><input required type="password" autoComplete="current-password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} className={input} /></Field>
      <button disabled={saving} className={button}>{saving ? "Sending..." : "Send OTP"}</button>
    </form> : <form onSubmit={verify} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
      <div><h2 className="font-bold">Verify Recovery Email</h2><p className="mt-1 text-sm text-slate-500">Enter the code sent to {challenge.masked_email}.</p></div>
      {testOtp && <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">Development OTP: <strong className="tracking-[0.25em]">{testOtp}</strong></p>}
      <Field label="OTP"><input required inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={`${input} text-center text-xl tracking-[0.35em]`} /></Field>
      <button disabled={saving || otp.length !== 6} className={button}>{saving ? "Verifying..." : "Verify Email"}</button>
      <button type="button" onClick={() => { setChallenge(null); setOtp(""); setError(""); }} className="w-full text-sm font-semibold text-slate-600">Change email address</button>
    </form>}
  </div>;
}
const input = "mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";
const button = "w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white disabled:opacity-50";
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>; }
function formatError(data) { return data ? Object.entries(data).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" ") : ""; }
