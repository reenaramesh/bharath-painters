import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { authError, retryAfter, useAuthLifecycle, useOtpCooldown } from "../utils/authFlow.js";
import "../styles/auth-reference.css";

const roles = [
  ["CUSTOMER", "Customer"],
  ["CONTRACTOR", "Contractor"],
  ["PAINTER", "Employee"],
];

export default function ForgotPassword() {
  const active = useAuthLifecycle();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [step, setStep] = useState("LOOKUP");
  const [role, setRole] = useState("CUSTOMER");
  const [mobile, setMobile] = useState("");
  const cooldown = useOtpCooldown();
  const [challengeId, setChallengeId] = useState(null);
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function lookup(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      await api.post("/accounts/forgot-password/lookup/", { mobile: mobile.trim(), role });
      if (!active.current) return;
      setStep("READY");
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Account could not be checked. Try again."));
    } finally { if (active.current) setLoading(false); }
  }

  async function sendOtp() {
    if (loading || cooldown.remaining) return;
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/forgot-password/request/", { mobile: mobile.trim(), role });
      if (!active.current) return;
      setChallengeId(data.challenge_id);
      setOtp("");
      setResetToken("");
      cooldown.start(data.resend_after_seconds ?? 60);
      setStep("OTP");
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Code could not be sent. Try again."));
      if (requestError.response?.status === 429) cooldown.start(retryAfter(requestError));
    } finally { if (active.current) setLoading(false); }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    if (loading) return; setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/forgot-password/verify/", { challenge_id: challengeId, otp });
      if (!active.current) return;
      if (!data.reset_token) throw new Error("Missing reset token");
      setResetToken(data.reset_token);
      setOtp("");
      setChallengeId(null);
      setStep("PASSWORD");
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Code could not be verified. Check the code or request a new one."));
    } finally { if (active.current) setLoading(false); }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (loading) return;
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await api.post("/accounts/forgot-password/confirm/", {
        reset_token: resetToken,
        new_password: password,
        confirm_password: confirmPassword,
      });
      if (!active.current) return;
      setResetToken(""); setPassword(""); setConfirmPassword("");
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Password could not be reset. If your verification expired, start again."));
    } finally { if (active.current) setLoading(false); }
  }

  function restart() {
    cooldown.start(0);
    setStep("LOOKUP"); setChallengeId(null); setOtp("");
    setResetToken(""); setPassword(""); setConfirmPassword(""); setShowPassword(false); setError("");
  }

  return (
    <main className="bp-public-auth bp-auth-recovery auth-reference-page grid min-h-screen place-items-center bg-slate-950 p-4 sm:p-6">
      <div className="bp-auth-card w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><KeyRound /></span>
        <h1 className="mt-5 text-3xl font-bold bp-ui-page-title">Forgot password</h1>
        <p role="status" className="mt-2 text-sm text-slate-600">{step === "LOOKUP" ? "Use your registered mobile number and account type to recover your password." : step === "PASSWORD" ? "Email verified. Choose a new password." : "If this account has a verified recovery email, a code can be sent to it. Check your inbox and spam folder."}</p>
        <p id="recovery-error" role="alert" className={error ? "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" : "sr-only"}>{error}</p>
        

        {step === "LOOKUP" && <form aria-busy={loading} onSubmit={lookup} className="mt-6 space-y-4">
          <Field label="Account type"><select disabled={loading} value={role} onChange={(event) => setRole(event.target.value)} className={(input) + " bp-ui-control"}>{roles.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
          <Field label="Registered mobile number"><input disabled={loading} required autoFocus type="tel" autoComplete="tel" aria-describedby="recovery-error" aria-invalid={Boolean(error)} inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} className={(input) + " bp-ui-control"} /></Field>
          <button disabled={loading} className={(button) + " bp-ui-action"}>{loading ? "Checking..." : "Continue"}</button>
        </form>}

        {step === "READY" && <div className="mt-6 space-y-4">
          <button type="button" disabled={loading || cooldown.remaining > 0} onClick={sendOtp} className={(button) + " bp-ui-action"}>{loading ? "Sending..." : cooldown.remaining ? `Send OTP in ${cooldown.remaining}s` : "Send OTP"}</button>
          <Back onClick={restart} disabled={loading} />
        </div>}

        {step === "OTP" && <form aria-busy={loading} onSubmit={verifyOtp} className="mt-6 space-y-4">
          <p className="text-sm text-slate-600">Enter the latest email code before the expiry shown in your email.</p>
          <Field label="Email OTP"><input disabled={loading} required autoFocus minLength={6} pattern="[0-9]{6,10}" aria-describedby="recovery-error" aria-invalid={Boolean(error)} autoComplete="one-time-code" inputMode="numeric" maxLength="10" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={(`${input} text-center text-xl tracking-[0.35em]`) + " bp-ui-control"} /></Field>
          <button disabled={loading || !challengeId} className={(button) + " bp-ui-action"}>{loading ? "Verifying..." : "Verify OTP"}</button>
          <button type="button" disabled={loading || cooldown.remaining > 0} onClick={sendOtp} className="w-full text-sm font-semibold text-slate-600 bp-ui-action">{cooldown.remaining ? `Resend OTP in ${cooldown.remaining}s` : "Resend OTP"}</button>
          <Back onClick={restart} disabled={loading} />
        </form>}

        {step === "PASSWORD" && <form aria-busy={loading} onSubmit={resetPassword} className="mt-6 space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-5 w-5" />Recovery email verified</div>
          <div className="text-sm font-semibold text-slate-700"><label htmlFor="new-password">Create New Password</label><span className="relative block"><input disabled={loading} id="new-password" autoFocus aria-describedby="recovery-error" aria-invalid={Boolean(error)} required type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide passwords" : "Show passwords"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-2 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 bp-ui-action">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></div>
          <Field label="Confirm New Password"><input disabled={loading} required aria-describedby="recovery-error" aria-invalid={Boolean(error)} type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={input} /></Field>
          <button disabled={loading} className={(button) + " bp-ui-action"}>{loading ? "Updating..." : "Update password"}</button>
          <Back onClick={restart} disabled={loading} />
        </form>}
        <p className="mt-6 text-center text-sm text-slate-500"><Link to="/login" className="font-semibold text-slate-950">Back to sign in</Link></p>
      </div>
    </main>
  );
}

const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";
const button = "flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3.5 text-center font-semibold text-white disabled:opacity-50";
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>; }
function Back({ onClick, disabled }) { return <button type="button" disabled={disabled} onClick={onClick} className="w-full text-sm font-semibold text-slate-600 bp-ui-action">Use another mobile number</button>; }
