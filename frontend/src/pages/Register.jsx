import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Eye, EyeOff, Palette } from "lucide-react";
import api from "../api/client";
import { authError, useAuthLifecycle } from "../utils/authFlow.js";
import "../styles/auth-reference.css";
import RegistrationConsent from "../components/RegistrationConsent";
import RegistrationEmailVerification from "../components/RegistrationEmailVerification";

export default function Register() {
  const active = useAuthLifecycle();
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
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState({ ready: false, accepted: false, policyVersion: "" });
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const input =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!consent.ready) {
      setError("Wait for the Terms of Use and Privacy Notice to load before registering.");
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
      contractor.append("acceptance_method", "REGISTRATION_SUBMIT");
      contractor.append("terms_accepted", "true");
      contractor.append("privacy_notice_acknowledged", "true");
      const painter = {
        mobile: form.mobile,
        email: form.email,
        password: form.password,
        name: form.name.trim(),
        policy_version: consent.policyVersion,
        acceptance_method: "REGISTRATION_SUBMIT",
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
      if (!active.current) return;
      if (data.email_verification_pending) setVerification(data);
      else navigate("/login", { state: { registered: true } });
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Registration failed. Try again."));
    } finally {
      if (active.current) setSaving(false);
    }
  }

  return (
    <main className="bp-public-auth bp-auth-register auth-reference-page min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <Link to="/login" className="text-sm font-semibold text-slate-600">
          ← Back to login
        </Link>
        <div className="auth-registration-card mt-6 rounded-2xl border bg-white p-6 sm:p-8">
          <h1 className="text-3xl font-bold bp-ui-page-title">Create your account</h1>
          
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              ["CONTRACTOR", BriefcaseBusiness],
              ["PAINTER", Palette],
            ].map(([value, Icon]) => (
              <button
                key={value}
                disabled={saving || Boolean(verification)}
                aria-pressed={role === value}
                onClick={() => setRole(value)}
                className={(`auth-role-option rounded-xl border p-4 text-left ${role === value ? "border-slate-950 bg-slate-50" : "border-slate-200"}`) + " bp-ui-action"}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-2 font-semibold">
                  {value === "CONTRACTOR" ? "Contractor" : "Employee"}
                </p>
              </button>
            ))}
          </div>
          <p id="registration-error" role="alert" className={error ? "mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700" : "sr-only"}>{error}</p>
          {verification ? <RegistrationEmailVerification initialVerification={verification} mobile={form.mobile} password={form.password} email={form.email} onVerified={() => navigate("/login", { state: { registered: true } })} /> : <>
          <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Name *
              <input aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} required name="name" autoComplete="name" value={form.name} onChange={update} className={(input) + " bp-ui-control"} />
            </label>
            <label className="text-sm font-medium">
              Mobile *
              <input aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving}
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
              <input aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving}
                required
                autoComplete="email"
                type="email"
                name="email"
                value={form.email}
                onChange={update}
                className={(input) + " bp-ui-control"}
              />
            </label>
            <div className="text-sm font-medium sm:col-span-2">
              <label htmlFor="registration-password">Password *</label>
              <span className="relative block"><input aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} required minLength="8" type={showPassword ? "text" : "password"} id="registration-password" name="password" autoComplete="new-password" value={form.password} onChange={update} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-1.5 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 bp-ui-action">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span>
            </div>
            
            <RegistrationConsent role={role} onConsentChange={setConsent} />
            <button
              disabled={saving || !consent.ready}
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
