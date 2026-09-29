import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import api from "../api/client";
import RegistrationConsent from "../components/RegistrationConsent";

export default function CustomerRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState({ accepted: false, policyVersion: "", scrolled: false });
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    if (!consent.accepted) {
      setError("Read and accept the Terms of Use and Privacy Notice before registering.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/accounts/register/customer/", {
        ...form,
        policy_version: consent.policyVersion,
        document_scrolled: consent.scrolled,
        terms_accepted: true,
        privacy_notice_acknowledged: true,
      });
      navigate("/login", { replace: true, state: { customerRegistered: true, ...(location.state?.returnTo ? { from: { pathname: location.state.returnTo } } : {}) } });
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Customer account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen bg-slate-950 p-4 sm:p-6">
    <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><MessageCircle /></span>
      <h1 className="mt-5 text-3xl font-bold">Customer account</h1>
      <p className="mt-2 text-sm text-slate-500">Create your account directly. No contractor registration is required.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" value={form.name} onChange={update} />
        <div>
          <Field label="Mobile number" name="mobile" inputMode="tel" value={form.mobile} onChange={update} />
          <p className="mt-1 text-xs text-slate-500">Use 9876543210, 09876543210, or +91 9876543210. For other countries, include + and the country code.</p>
        </div>
        <Field label="Email (optional)" name="email" type="email" required={false} value={form.email} onChange={update} />
        <Field label="Create password" name="password" type="password" minLength="8" value={form.password} onChange={update} />
        <RegistrationConsent role="CUSTOMER" onConsentChange={setConsent} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <button disabled={saving || !consent.accepted} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Creating account..." : "Create customer account"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-semibold text-slate-950">Sign in</Link></p>
    </div>
  </main>;
}

function Field({ label, required = true, ...props }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<input required={required} {...props} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-slate-900" /></label>;
}
