import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import api from "../api/client";
import { authError, useAuthLifecycle } from "../utils/authFlow.js";
import "../styles/auth-reference.css";

export default function InHouseEmployeeActivation() {
  const { token } = useParams();
  const active = useAuthLifecycle();
  const currentToken = useRef(token);
  currentToken.current = token;
  const [employee, setEmployee] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canRetry, setCanRetry] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setEmployee(null); setPassword(""); setConfirmPassword(""); setError(""); setSuccess("");
    setBusy(false); setLoading(true); setCanRetry(false);
    api.get(`/jobs/my-team/employee-activation/${token}/`).then(({ data }) => {
      if (current) setEmployee(data);
    }).catch((requestError) => {
      if (!current) return;
      const retryable = !requestError.response || requestError.response.status >= 500;
      setError(authError(requestError, retryable ? "Activation details could not be loaded. Try again." : "This activation link is invalid or expired."));
      setCanRetry(retryable);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, retry]);

  async function submit(event) {
    event.preventDefault();
    if (busy || !employee) return;
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    const submittedToken = token;
    setBusy(true); setError("");
    try {
      const { data } = await api.post(`/jobs/my-team/employee-activation/${token}/`, { password, confirm_password: confirmPassword });
      if (!active.current || currentToken.current !== submittedToken) return;
      setPassword(""); setConfirmPassword("");
      setSuccess(data.detail || "Password set successfully. You can now sign in.");
    } catch (requestError) {
      if (active.current && currentToken.current === submittedToken) setError(authError(requestError, "Password could not be set. Try again."));
    } finally { if (active.current && currentToken.current === submittedToken) setBusy(false); }
  }

  return <main className="bp-public-auth bp-auth-employee auth-reference-page grid min-h-screen place-items-center bg-slate-50 p-4 sm:p-8">
    <section className="auth-registration-card w-full max-w-lg rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><KeyRound aria-hidden="true" /></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-700">Bharath Apps · Permanent workforce</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950 bp-ui-page-title">Set your password</h1>
      <p role="status" className="mt-3 text-sm leading-6 text-slate-600">{loading ? "Checking your employee activation link..." : success || (employee ? `Welcome, ${employee.name}. Create a password for your employee account ending in ${employee.mobile?.slice(-4)}.` : "Ask your employer for a new activation link if this one has expired.")}</p>
      <p id="employee-activation-error" role="alert" className={error ? "mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700" : "sr-only"}>{error}</p>
      {canRetry && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 font-semibold text-slate-700 bp-ui-action">Retry loading activation</button>}
      {success ? <p className="mt-5"><Link to="/login" className="font-bold underline">Sign in</Link></p> : employee && <form onSubmit={submit} aria-busy={busy} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">New password<input disabled={busy} required autoFocus minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="employee-activation-error" aria-invalid={Boolean(error)} className="bp-ui-control mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="block text-sm font-semibold">Confirm password<input disabled={busy} required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-describedby="employee-activation-error" aria-invalid={Boolean(error)} className="bp-ui-control mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <button disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50 bp-ui-action">{busy ? "Saving password..." : "Set password"}</button>
      </form>}
      {!success && <p className="mt-6 text-sm"><Link to="/login" className="font-semibold text-slate-700">Back to sign in</Link></p>}
    </section>
  </main>;
}
