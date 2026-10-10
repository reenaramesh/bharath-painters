import { useState } from "react";
import { Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

const roles = [
  ["CUSTOMER", "Customer"],
  ["CONTRACTOR", "Contractor"],
  ["PAINTER", "Employee"],
];

export default function ForgotPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [step, setStep] = useState("LOOKUP");
  const [role, setRole] = useState("CUSTOMER");
  const [mobile, setMobile] = useState("");
  const [account, setAccount] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [testOtp, setTestOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function lookup(event) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/forgot-password/lookup/", { mobile: mobile.trim(), role });
      setAccount(data);
      setStep(data.can_reset ? "READY" : "NO_EMAIL");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Account could not be checked.");
    } finally { setLoading(false); }
  }

  async function sendOtp() {
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/forgot-password/request/", { mobile: mobile.trim(), role });
      setChallengeId(data.challenge_id);
      setTestOtp(data.test_otp || "");
      setStep("OTP");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "OTP could not be sent.");
    } finally { setLoading(false); }
  }

  async function verifyOtp(event) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const { data } = await api.post("/accounts/forgot-password/verify/", { challenge_id: challengeId, otp });
      setResetToken(data.reset_token);
      setStep("PASSWORD");
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "OTP could not be verified.");
    } finally { setLoading(false); }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await api.post("/accounts/forgot-password/confirm/", {
        reset_token: resetToken,
        new_password: password,
        confirm_password: confirmPassword,
      });
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "Password could not be reset.");
    } finally { setLoading(false); }
  }

  function restart() {
    setStep("LOOKUP"); setAccount(null); setChallengeId(null); setOtp("");
    setResetToken(""); setTestOtp(""); setError("");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><KeyRound /></span>
        <h1 className="mt-5 text-3xl font-bold">Forgot password</h1>
        

        {step === "LOOKUP" && <form onSubmit={lookup} className="mt-6 space-y-4">
          <Field label="Account type"><select value={role} onChange={(event) => setRole(event.target.value)} className={input}>{roles.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
          <Field label="Registered mobile number"><input required inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} className={input} /></Field>
          {error && <Error>{error}</Error>}
          <button disabled={loading} className={button}>{loading ? "Checking..." : "Continue"}</button>
        </form>}

        {step === "READY" && <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Registered Recovery Email</p>
            <p className="mt-2 text-lg font-bold text-slate-950">{account?.masked_email}</p>
          </div>
          {error && <Error>{error}</Error>}
          <button type="button" disabled={loading} onClick={sendOtp} className={button}>{loading ? "Sending..." : "Send OTP"}</button>
          <Back onClick={restart} />
        </div>}

        {step === "NO_EMAIL" && <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <MailCheck className="h-6 w-6 text-amber-700" />
            <h2 className="mt-3 text-lg font-bold">No Recovery Email Added</h2>
            
            <p className="mt-3 text-xs font-semibold text-slate-500">{account?.bharath_id || "Account"} · {account?.masked_mobile}</p>
          </div>
          <Link to="/login" state={{ securitySetup: true }} className={button}>Sign in to add recovery email</Link>
          <Back onClick={restart} />
        </div>}

        {step === "OTP" && <form onSubmit={verifyOtp} className="mt-6 space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">OTP sent to <strong className="text-slate-950">{account?.masked_email}</strong>. Use it before the expiry shown in your email.</div>
          {testOtp && <div className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800"><span className="font-semibold">Development OTP: </span><strong className="tracking-[0.25em]">{testOtp}</strong></div>}
          <Field label="Email OTP"><input required autoComplete="one-time-code" inputMode="numeric" maxLength="10" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={`${input} text-center text-xl tracking-[0.35em]`} /></Field>
          {error && <Error>{error}</Error>}
          <button disabled={loading || (otp.length < 6 || otp.length > 10)} className={button}>{loading ? "Verifying..." : "Verify OTP"}</button>
          <button type="button" disabled={loading} onClick={sendOtp} className="w-full text-sm font-semibold text-slate-600">Resend OTP</button>
        </form>}

        {step === "PASSWORD" && <form onSubmit={resetPassword} className="mt-6 space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-5 w-5" />Recovery email verified</div>
          <div className="text-sm font-semibold text-slate-700"><label htmlFor="new-password">Create New Password</label><span className="relative block"><input id="new-password" required type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide passwords" : "Show passwords"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-2 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></div>
          <Field label="Confirm New Password"><input required type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={input} /></Field>
          {error && <Error>{error}</Error>}
          <button disabled={loading} className={button}>{loading ? "Updating..." : "Update password"}</button>
        </form>}
        <p className="mt-6 text-center text-sm text-slate-500"><Link to="/login" className="font-semibold text-slate-950">Back to sign in</Link></p>
      </div>
    </main>
  );
}

const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";
const button = "flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3.5 text-center font-semibold text-white disabled:opacity-50";
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>; }
function Error({ children }) { return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>; }
function Back({ onClick }) { return <button type="button" onClick={onClick} className="w-full text-sm font-semibold text-slate-600">Use another mobile number</button>; }
function formatError(data) { return data ? Object.values(data).flat().join(" ") : ""; }
