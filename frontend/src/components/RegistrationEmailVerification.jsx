import { useState } from "react";
import api from "../api/client";
import { authError, retryAfter, useAuthLifecycle, useOtpCooldown } from "../utils/authFlow.js";

export default function RegistrationEmailVerification({ initialVerification, mobile, password, email, onVerified }) {
  const active = useAuthLifecycle();
  const [verification, setVerification] = useState(initialVerification);
  const [otp, setOtp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialVerification.email_verification_error || "");
  const cooldown = useOtpCooldown(initialVerification.challenge_id ? initialVerification.resend_after_seconds ?? 60 : 0);

  async function resend() {
    if (saving || cooldown.remaining) return;
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/accounts/register/email/request/", { mobile, password });
      if (!active.current) return;
      setVerification(data);
      setOtp("");
      if (data.challenge_id) cooldown.start(data.resend_after_seconds ?? 60);
      if (data.email_verification_error) setError(data.email_verification_error);
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Verification code could not be sent. Try again."));
      if (requestError.response?.status === 429) cooldown.start(retryAfter(requestError));
    } finally { if (active.current) setSaving(false); }
  }

  async function verify(event) {
    event.preventDefault();
    if (saving || !verification.challenge_id) return;
    setSaving(true); setError("");
    try {
      await api.post("/accounts/register/email/verify/", { mobile, password, challenge_id: verification.challenge_id, otp });
      if (!active.current) return;
      setOtp("");
      onVerified();
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Code could not be verified. Check the code or request a new one."));
    } finally { if (active.current) setSaving(false); }
  }

  return <form onSubmit={verify} className="mt-6 space-y-4" aria-busy={saving}>
    <p role="status" className="text-sm text-slate-600">{verification.challenge_id ? <>We sent a verification code to <strong>{verification.masked_email || email}</strong>. Enter it to verify your recovery email. Use the latest code before the expiry shown in your email.</> : "Your account was created, but a verification code could not be sent. Request a new code to verify your email."}</p>
    <p id="registration-code-error" role="alert" className={error ? "rounded-xl bg-red-50 p-3 text-sm text-red-700" : "sr-only"}>{error}</p>
    <label className="block text-sm font-semibold">Email verification code<input disabled={saving} required autoFocus inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} pattern="[0-9]{6,10}" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} aria-describedby="registration-code-error" aria-invalid={Boolean(error)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 bp-ui-control" /></label>
    <button disabled={saving || !verification.challenge_id} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Please wait..." : "Verify email"}</button>
    <button type="button" disabled={saving || cooldown.remaining > 0} onClick={resend} className="text-sm font-semibold text-slate-700 disabled:opacity-50 bp-ui-action">{cooldown.remaining ? `Resend code in ${cooldown.remaining}s` : "Resend code"}</button>
  </form>;
}
