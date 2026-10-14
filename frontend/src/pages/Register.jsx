import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Eye, EyeOff, Palette } from "lucide-react";
import api from "../api/client";
import RegistrationConsent from "../components/RegistrationConsent";

export default function Register() {
  const navigate = useNavigate();
  const [role, setRole] = useState("CONTRACTOR");
  const [form, setForm] = useState({
    mobile: "",
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState(null);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState({ accepted: false, policyVersion: "", scrolled: false });
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const input =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  async function submit(event) {
    event.preventDefault();
    if (!consent.accepted) {
      setError("Read and accept the Terms of Use and Privacy Notice before registering.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const contractor = new FormData();
      [
        "mobile",
        "email",
        "password",
        "name",
      ].forEach((field) => contractor.append(field, form[field]));
      contractor.append("policy_version", consent.policyVersion);
      contractor.append("document_scrolled", String(consent.scrolled));
      contractor.append("terms_accepted", "true");
      contractor.append("privacy_notice_acknowledged", "true");
      const painter = {
        mobile: form.mobile,
        email: form.email,
        password: form.password,
        name: form.name.trim(),
        policy_version: consent.policyVersion,
        document_scrolled: consent.scrolled,
        terms_accepted: true,
        privacy_notice_acknowledged: true,
      };
      const { data } = await api.post(
        `/accounts/register/${role.toLowerCase()}/`,
        role === "CONTRACTOR" ? contractor : painter,
        role === "CONTRACTOR"
          ? { headers: { "Content-Type": "multipart/form-data" } }
          : undefined,
      );
      if (data.email_verification_pending) setVerification(data);
      else navigate("/login", { state: { registered: true } });
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Registration failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resendOtp() {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/accounts/register/email/request/", { mobile: form.mobile, password: form.password });
      setVerification(data);
      setOtp("");
      if (data.email_verification_error) setError(data.email_verification_error);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Verification code could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/accounts/register/email/verify/", { mobile: form.mobile, password: form.password, challenge_id: verification.challenge_id, otp });
      navigate("/login", { state: { registered: true } });
    } catch (requestError) {
      setError(requestError.response?.data?.otp || requestError.response?.data?.detail || "Code could not be verified.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <Link to="/login" className="text-sm font-semibold text-slate-600">
          ← Back to login
        </Link>
        <div className="mt-6 rounded-2xl border bg-white p-6 sm:p-8">
          <h1 className="text-3xl font-bold bp-ui-page-title">Create your account</h1>
          
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              ["CONTRACTOR", BriefcaseBusiness],
              ["PAINTER", Palette],
            ].map(([value, Icon]) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={(`rounded-xl border p-4 text-left ${role === value ? "border-slate-950 bg-slate-50" : "border-slate-200"}`) + " bp-ui-action"}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-2 font-semibold">
                  {value === "CONTRACTOR" ? "Contractor" : "Employee"}
                </p>
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {verification ? <form onSubmit={verifyOtp} className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">Verify your email to enable password recovery. We sent a verification code to <strong>{verification.masked_email || form.email}</strong>.</p>
            {verification.test_otp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Development code: <strong>{verification.test_otp}</strong></p>}
            <label className="block text-sm font-semibold">Email verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={(input) + " bp-ui-control"} /></label>
            <button disabled={saving || (otp.length < 6 || otp.length > 10) || !verification.challenge_id} className="w-full rounded-xl bg-[#176b9b] px-4 py-3 font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Verifying..." : "Verify email"}</button>
            <button type="button" disabled={saving} onClick={resendOtp} className="text-sm font-semibold text-[#176b9b] bp-ui-action">Resend code</button>
          </form> : <>
          <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Name *
              <input required name="name" autoComplete="name" value={form.name} onChange={update} className={(input) + " bp-ui-control"} />
            </label>
            <label className="text-sm font-medium">
              Mobile *
              <input
                required
                name="mobile"
                type="tel"
                autoComplete="tel"
                placeholder="9876543210 or +91 9876543210"
                value={form.mobile}
                onChange={update}
                className={(input) + " bp-ui-control"}
              />
              
            </label>
            <label className="text-sm font-medium">
              Email *
              <input
                required
                type="email"
                name="email"
                value={form.email}
                onChange={update}
                className={(input) + " bp-ui-control"}
              />
            </label>
            <div className="text-sm font-medium sm:col-span-2">
              <label htmlFor="registration-password">Password *</label>
              <span className="relative block"><input required minLength="8" type={showPassword ? "text" : "password"} id="registration-password" name="password" autoComplete="new-password" value={form.password} onChange={update} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-1.5 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 bp-ui-action">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span>
            </div>
            
            <RegistrationConsent role={role} onConsentChange={setConsent} />
            <button
              disabled={saving || !consent.accepted}
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white sm:col-span-2 disabled:opacity-60 bp-ui-action"
            >
              {saving ? "Creating account..." : "Register"}
            </button>
          </form>
          </>}
        </div>
      </div>
    </main>
  );
}
