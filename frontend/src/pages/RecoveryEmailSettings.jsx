import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Mail, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function RecoveryEmailSettings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ recovery_email: "", confirm_recovery_email: "", current_password: "" });
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [testOtp, setTestOtp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [showChangePasswords, setShowChangePasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/accounts/recovery-email/");
      setAccount(data);
      if (!data.verified && data.registration_email) setForm((current) => ({ ...current, recovery_email: current.recovery_email || data.registration_email, confirm_recovery_email: current.confirm_recovery_email || data.registration_email }));
      setError("");
    }
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

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (changePassword.new_password !== changePassword.confirm_password) {
      setChangePasswordError("New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    setChangePasswordError("");
    try {
      await api.post("/accounts/change-password/", changePassword);
      setChangePassword({ current_password: "", new_password: "", confirm_password: "" });
      await logout();
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (requestError) {
      setChangePasswordError(formatError(requestError.response?.data) || "Password could not be changed.");
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading && !account) return <div className="p-12 text-center text-slate-500">Loading account security...</div>;
  if (!account) return <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Account Security</h1><p role="alert" className="mt-3 text-sm text-red-700">{error || "Account security details could not be loaded."}</p><button type="button" onClick={load} className="mt-4 rounded-xl bg-[#176b9b] px-4 py-2 text-sm font-bold text-white">Try again</button></div>;
  return <div className="mx-auto max-w-2xl space-y-6">
    <header><p className="text-sm font-semibold text-[#176b9b]">Your account</p><h1 className="mt-1 text-3xl font-bold">Account Security</h1><p className="mt-2 text-slate-500">{user?.role === "CUSTOMER" ? "Change your password here. Verify your sign-in email in My Profile." : "Change your password and manage the verified email used for sign-in and account recovery."}</p></header>
    <form onSubmit={submitPasswordChange} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
      <div><h2 className="font-bold">Change password</h2><p className="mt-1 text-sm text-slate-500">Enter your current password, then choose a new one.</p></div>
      {changePasswordError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{changePasswordError}</p>}
      {[["Current password", "current_password", "current-password"], ["New password", "new_password", "new-password"], ["Confirm new password", "confirm_password", "new-password"]].map(([label, field, autoComplete]) => <Field key={field} label={label}><span className="relative block"><input required minLength={field === "current_password" ? undefined : 8} type={showChangePasswords ? "text" : "password"} autoComplete={autoComplete} value={changePassword[field]} onChange={(event) => setChangePassword((current) => ({ ...current, [field]: event.target.value }))} className={`${input} pr-12`} /><button type="button" onClick={() => setShowChangePasswords((current) => !current)} aria-label={showChangePasswords ? "Hide passwords" : "Show passwords"} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{showChangePasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>)}
      <button disabled={changingPassword} className={button}>{changingPassword ? "Changing password..." : "Change password"}</button>
      <Link to="/forgot-password" className="block text-center text-sm font-semibold text-[#176b9b]">Forgot your current password?</Link>
    </form>
    {user?.role === "CUSTOMER" && <Link to="/customer/profile" className="block rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-[#176b9b]">Manage email in My Profile</Link>}
    {user?.role !== "CUSTOMER" && <>
    {account?.verified && <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" /><div><h2 className="font-bold text-emerald-900">Email verified for sign-in</h2><p className="mt-1 text-sm text-emerald-800">{account.masked_email}</p><p className="mt-1 text-xs text-emerald-700">Use this email or your mobile number to sign in. Use the form below to change it.</p></div></section>}
    {!account?.verified && <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><Mail className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><h2 className="font-bold">Email verification needed</h2><p className="mt-1 text-sm text-slate-600">{account.registration_email ? "Verify the email from registration, or enter a different address below." : "Add and verify an email address to enable account recovery."}</p><p className="mt-2 text-xs font-semibold text-slate-500">{account?.bharath_id || "Account"} · {account?.masked_mobile}</p></div></section>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</p>}
    {!challenge ? <form onSubmit={requestOtp} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">{account?.verified ? "Change recovery email" : "Add recovery email"}</h2></div>
      <Field label="Recovery Email"><input required type="email" value={form.recovery_email} onChange={(event) => setForm({ ...form, recovery_email: event.target.value })} className={input} /></Field>
      <Field label="Confirm Recovery Email"><input required type="email" value={form.confirm_recovery_email} onChange={(event) => setForm({ ...form, confirm_recovery_email: event.target.value })} className={input} /></Field>
      <Field label="Current Password"><span className="relative block"><input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
      <button disabled={saving} className={button}>{saving ? "Sending..." : "Send OTP"}</button>
    </form> : <form onSubmit={verify} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
      <div><h2 className="font-bold">Verify Recovery Email</h2><p className="mt-1 text-sm text-slate-500">Enter the code sent to {challenge.masked_email}.</p></div>
      {testOtp && <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">Development OTP: <strong className="tracking-[0.25em]">{testOtp}</strong></p>}
      <Field label="OTP"><input required inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={`${input} text-center text-xl tracking-[0.35em]`} /></Field>
      <button disabled={saving || otp.length !== 6} className={button}>{saving ? "Verifying..." : "Verify Email"}</button>
      <button type="button" disabled={saving} onClick={requestOtp} className="w-full text-sm font-semibold text-[#176b9b] disabled:opacity-50">Resend code</button>
      <button type="button" onClick={() => { setChallenge(null); setOtp(""); setError(""); }} className="w-full text-sm font-semibold text-slate-600">Change email address</button>
    </form>}
    </>}
  </div>;
}
const input = "mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";
const button = "w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white disabled:opacity-50";
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>; }
function formatError(data) { return data ? Object.entries(data).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" ") : ""; }
