import { useEffect, useState } from "react";
import { Camera, CheckCircle2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function CustomerProfile() {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", pincode: "" });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: "", password: "" });
  const [emailChallenge, setEmailChallenge] = useState(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/accounts/customer-profile/").then(({ data }) => {
      if (!active) return;
      setProfile(data);
      setEmailForm((current) => ({ ...current, email: data.email || "" }));
      setForm({ name: data.name || "", address: data.address || "", city: data.city || "", pincode: data.pincode || "" });
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.detail || "Customer profile could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value.trim()));
    if (photo) data.append("profile_photo", photo);
    try {
      const response = await api.patch("/accounts/customer-profile/", data, { headers: { "Content-Type": "multipart/form-data" } });
      setProfile(response.data);
      setPhoto(null);
      await refreshUser();
      setSaved(true);
    } catch (requestError) {
      const details = requestError.response?.data;
      setError(details?.detail || Object.values(details || {}).flat().join(" ") || "Profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailOtp(event) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailError("");
    try {
      const { data } = await api.post("/accounts/recovery-email/request/", {
        recovery_email: emailForm.email.trim(),
        confirm_recovery_email: emailForm.email.trim(),
        current_password: emailForm.password,
      });
      setEmailChallenge(data);
      setEmailOtp("");
    } catch (requestError) {
      setEmailError(formatError(requestError.response?.data) || "OTP could not be sent.");
    } finally { setEmailBusy(false); }
  }

  async function verifyEmailOtp(event) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailError("");
    try {
      await api.post("/accounts/recovery-email/verify/", { challenge_id: emailChallenge.challenge_id, otp: emailOtp });
      const { data } = await api.get("/accounts/customer-profile/");
      setProfile(data);
      await refreshUser();
      setEmailChallenge(null);
      setEmailOpen(false);
      setEmailForm({ email: data.email || "", password: "" });
      setEmailSuccess("Email verified and saved successfully.");
    } catch (requestError) {
      setEmailError(formatError(requestError.response?.data) || "Email could not be verified.");
    } finally { setEmailBusy(false); }
  }

  const field = (key) => ({ value: form[key], onChange: (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setSaved(false); } });
  return <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-hidden pb-16 sm:space-y-5">
    <header className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-primary,#176b9b)]">Customer portal</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">My profile</h1>
      <p className="mt-1 text-sm text-slate-600">Keep your contact details and address up to date.</p>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Profile saved successfully.</p>}
    {profile && <form onSubmit={save} className="min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-7">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-2xl font-bold text-[var(--app-primary,#176b9b)] sm:h-20 sm:w-20">{profile.profile_photo ? <img src={profile.profile_photo} alt="Profile" className="h-full w-full object-cover" /> : profile.name?.charAt(0)?.toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="break-words font-bold text-slate-900">{profile.customer_id || "Customer"}</p><label className="mt-2 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Camera className="h-4 w-4 shrink-0" />Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPhoto(event.target.files?.[0] || null); setSaved(false); }} className="sr-only" /></label>{photo && <p className="mt-1 truncate text-xs text-slate-500" title={photo.name}>{photo.name} selected</p>}</div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold text-slate-800 sm:col-span-2">Full name<input required maxLength={150} {...field("name")} className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-[var(--app-primary,#176b9b)]" /></label>
        <label className="min-w-0 text-sm font-semibold text-slate-800">Mobile number<input value={profile.mobile || ""} readOnly className="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal text-slate-600" /></label>
        <label className="min-w-0 text-sm font-semibold text-slate-800">Email<input value={profile.email || ""} readOnly className="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal text-slate-600" /></label>
        <label className="min-w-0 text-sm font-semibold text-slate-800 sm:col-span-2">Address<textarea rows={3} {...field("address")} className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-[var(--app-primary,#176b9b)]" /></label>
        <label className="min-w-0 text-sm font-semibold text-slate-800">City<input maxLength={100} {...field("city")} className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-[var(--app-primary,#176b9b)]" /></label>
        <label className="min-w-0 text-sm font-semibold text-slate-800">PIN code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} {...field("pincode")} className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-[var(--app-primary,#176b9b)]" /></label>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><Link to="/account-security" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-[var(--app-primary,#176b9b)] sm:justify-start"><ShieldCheck className="h-4 w-4 shrink-0" />Account security</Link><button disabled={busy} className="min-h-11 w-full rounded-xl bg-[var(--app-primary,#176b9b)] px-6 py-3 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">{busy ? "Saving…" : "Save profile"}</button></div>
    </form>}
    {profile && <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-7">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="font-bold text-slate-950">Email address</h2><p className="mt-1 break-all text-sm text-slate-600">{profile.email || "No email saved"}</p><p className="mt-1 text-xs text-slate-600">{profile.email_verified ? "Verified" : "Verification needed"}</p><p className="mt-1 text-xs text-slate-500">A verified email can be used to sign in and receive password recovery codes.</p></div><button type="button" onClick={() => { setEmailOpen((value) => !value); setEmailError(""); setEmailSuccess(""); }} className="min-h-11 w-full shrink-0 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-[var(--app-primary,#176b9b)] sm:w-auto">{profile.email_verified ? "Change email" : "Verify or change email"}</button></div>
      {emailSuccess && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{emailSuccess}</p>}
      {emailError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{emailError}</p>}
      {emailOpen && (!emailChallenge ? <form onSubmit={requestEmailOtp} className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2"><label className="text-sm font-semibold">Email<input required type="email" value={emailForm.email} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label><label className="text-sm font-semibold">Current password<input required type="password" autoComplete="current-password" value={emailForm.password} onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label><button disabled={emailBusy} className="rounded-xl bg-[var(--app-primary,#176b9b)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{emailBusy ? "Sending…" : "Send email OTP"}</button></form> : <form onSubmit={verifyEmailOtp} className="mt-5 space-y-4 border-t border-slate-200 pt-5"><p className="text-sm text-slate-600">Enter the six-digit code sent to {emailChallenge.masked_email}.</p>{emailChallenge.test_otp && <p className="rounded-lg bg-amber-50 p-3 text-sm">Development OTP: {emailChallenge.test_otp}</p>}<label className="block text-sm font-semibold">Email OTP<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailOtp} onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-xl tracking-widest" /></label><button disabled={emailBusy || emailOtp.length !== 6} className="w-full rounded-xl bg-[var(--app-primary,#176b9b)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{emailBusy ? "Verifying…" : "Verify and save email"}</button><button type="button" onClick={() => setEmailChallenge(null)} className="w-full text-sm font-semibold text-slate-600">Change email address</button></form>)}
    </section>}
  </div>;
}

function formatError(data) { return data ? Object.entries(data).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" ") : ""; }
