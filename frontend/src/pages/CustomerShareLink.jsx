import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import RegistrationConsent from "../components/RegistrationConsent";

export default function CustomerShareLink() {
  const { token } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [details, setDetails] = useState(null);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [emailChallenge, setEmailChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState({ accepted: false, policyVersion: "", scrolled: false });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/quotations/customer-link/${token}/`).then(({ data }) => {
      if (active) setDetails(data);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.detail || "This link is invalid or has expired.");
    });
    return () => { active = false; };
  }, [token]);

  async function submit(action) {
    if (busy) return;
    if (action === "activate" && (!emailChallenge?.challenge_id || otp.length !== 6)) {
      setError("Verify your email with the 6-digit code before activating your account.");
      return;
    }
    if (action === "activate" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = action === "activate" ? {
        password, challenge_id: emailChallenge.challenge_id, otp,
        policy_version: consent.policyVersion, document_scrolled: consent.scrolled,
        terms_accepted: true, privacy_notice_acknowledged: true,
      } : { action };
      const { data } = await api.post(`/quotations/customer-link/${token}/`, payload);
      setSuccess(data.detail || "Your response has been saved.");
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(data?.detail || Object.values(data || {}).flat().join(" ") || "This action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailOtp() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/customer-link/${token}/`, { action: "request_email_otp", email: email.trim() });
      setEmailChallenge(data);
      setOtp("");
    } catch (requestError) {
      setError(requestError.response?.data?.email || requestError.response?.data?.detail || "Email code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
    <section className="mx-auto max-w-xl rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-[#176b9b]">Bharath Painters</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950">{details?.purpose === "ACTIVATION" ? "Activate your customer account" : "Contractor connection request"}</h1>
      {details && <p className="mt-3 text-sm leading-6 text-slate-600">Hello {details.customer_name}, {details.contractor_name} {details.purpose === "ACTIVATION" ? "invited you to activate your customer account." : "would like to connect with you."}</p>}
      {details && <p className="mt-2 text-xs text-slate-500">Link expires {new Date(details.expires_at).toLocaleString("en-IN")}.</p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success} <Link to="/login" className="font-bold underline">Sign in</Link></div>}
      {!success && details?.purpose === "ACTIVATION" && <form onSubmit={(event) => { event.preventDefault(); submit("activate"); }} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">Your email address<input required type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailChallenge(null); setOtp(""); }} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <button type="button" disabled={busy || !email.trim()} onClick={requestEmailOtp} className="rounded-xl border border-[#176b9b] px-4 py-2 text-sm font-bold text-[#176b9b] disabled:opacity-50">{emailChallenge ? "Resend email code" : "Send verification code"}</button>
        {emailChallenge && <div className="space-y-2 rounded-xl bg-sky-50 p-4"><p className="text-sm text-slate-700">Enter the 6-digit code sent to <strong>{emailChallenge.masked_email}</strong>. It expires in 10 minutes.</p>{emailChallenge.test_otp && <p className="text-xs text-amber-800">Development code: <strong>{emailChallenge.test_otp}</strong></p>}<label className="block text-sm font-semibold">Email verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border px-4 py-3" /></label></div>}
        <label className="block text-sm font-semibold">Create password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="block text-sm font-semibold">Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <RegistrationConsent role="CUSTOMER" onConsentChange={setConsent} />
        <button disabled={busy || !consent.accepted || !emailChallenge || otp.length !== 6} className="w-full rounded-xl bg-[#176b9b] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Activating..." : "Activate account"}</button>
      </form>}
      {!success && details?.purpose === "CONNECTION" && <div className="mt-6">
        {!details.account_ready ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Create your customer password first, then sign in to respond. <Link to="/customer-register" state={{ returnTo: location.pathname }} className="font-bold underline">Create password</Link></p> : user?.role !== "CUSTOMER" ? <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Sign in as the customer named above to respond. <Link to="/login" state={{ from: { pathname: location.pathname } }} className="font-bold underline">Sign in</Link></p> : <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={() => submit("accept")} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">Accept</button>
          <button type="button" disabled={busy} onClick={() => submit("reject")} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">Reject</button>
          <button type="button" disabled={busy} onClick={() => submit("block")} className="rounded-xl border border-red-200 px-4 py-3 font-bold text-red-700 disabled:opacity-50">Block</button>
        </div>}
      </div>}
    </section>
  </main>;
}
