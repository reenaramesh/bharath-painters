import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import api from "../api/client";
import RegistrationEmailVerification from "../components/RegistrationEmailVerification";
import { authError, retryAfter, useAuthLifecycle, useOtpCooldown } from "../utils/authFlow.js";
import "../styles/auth-reference.css";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const active = useAuthLifecycle();
  const cooldown = useOtpCooldown();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event) {
    event.preventDefault();
    if (loading || cooldown.remaining) return;
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/register/email/request/", { mobile: mobile.trim(), password });
      if (active.current) setVerification(data);
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Verification code could not be sent. Try again."));
      if (requestError.response?.status === 429) cooldown.start(retryAfter(requestError));
    } finally { if (active.current) setLoading(false); }
  }

  return <main className="bp-public-auth bp-auth-verify auth-reference-page grid min-h-screen place-items-center p-4 sm:p-6">
    <div className="auth-registration-card w-full max-w-md rounded-3xl border bg-white p-6 sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><MailCheck aria-hidden="true" /></span>
      <h1 className="mt-5 text-3xl font-bold bp-ui-page-title">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-600">Continue email verification for an account you already created. Use the mobile number and password from registration.</p>
      {verification ? <RegistrationEmailVerification initialVerification={verification} mobile={mobile.trim()} password={password} onVerified={() => navigate("/login", { replace: true, state: { emailVerified: true } })} /> : <form onSubmit={requestCode} aria-busy={loading} className="mt-6 space-y-4">
        <p id="resume-verification-error" role="alert" className={error ? "rounded-xl bg-red-50 p-3 text-sm text-red-700" : "sr-only"}>{error}</p>
        <label className="block text-sm font-semibold" htmlFor="verify-email-mobile">Registered mobile number<input id="verify-email-mobile" autoFocus required type="tel" autoComplete="tel" disabled={loading} value={mobile} onChange={(event) => setMobile(event.target.value)} aria-describedby="resume-verification-error" className={input} /></label>
        <label className="block text-sm font-semibold" htmlFor="verify-email-password">Password<input id="verify-email-password" required type="password" autoComplete="current-password" disabled={loading} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="resume-verification-error" className={input} /></label>
        <button disabled={loading || cooldown.remaining > 0} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action">{loading ? "Sending..." : cooldown.remaining ? `Send code in ${cooldown.remaining}s` : "Send verification code"}</button>
      </form>}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-slate-950">Back to sign in</Link></p>
    </div>
  </main>;
}
const input = "mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-slate-900 bp-ui-control";
