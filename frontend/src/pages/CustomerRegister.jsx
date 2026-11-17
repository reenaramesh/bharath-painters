import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import api from "../api/client";
import { authError, useAuthLifecycle } from "../utils/authFlow.js";
import "../styles/auth-reference.css";
import RegistrationConsent from "../components/RegistrationConsent";
import RegistrationEmailVerification from "../components/RegistrationEmailVerification";

export default function CustomerRegister() {
  const active = useAuthLifecycle();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("property_invitation_token") || location.state?.propertyInvitationToken || "";
  const [invitation, setInvitation] = useState(null);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState(null);
  const [loginDestination, setLoginDestination] = useState("");
  const [consent, setConsent] = useState({ ready: false, accepted: false, policyVersion: "" });
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  useEffect(() => {
    if (!invitationToken) return;
    let active = true;
    api.get(`/quotations/property-invitations/token/${invitationToken}/`).then(({ data }) => {
      if (active) setInvitation(data);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.detail || "This property invitation is invalid or has expired.");
    });
    return () => { active = false; };
  }, [invitationToken]);

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
      const { data } = await api.post("/accounts/register/customer/", {
        ...form,
        ...(invitationToken ? { property_invitation_token: invitationToken } : {}),
        policy_version: consent.policyVersion,
        acceptance_method: "REGISTRATION_SUBMIT",
        terms_accepted: true,
        privacy_notice_acknowledged: true,
      });
      if (!active.current) return;
      const returnTo = data.property_id ? `/customer-properties/${data.property_id}` : (location.state?.returnTo || "");
      setLoginDestination(returnTo);
      if (data.email_verification_pending) setVerification(data);
      else finishRegistration(returnTo);
    } catch (requestError) {
      if (!active.current) return;
      setError(authError(requestError, "Customer account could not be created. Try again."));
    } finally {
      if (active.current) setSaving(false);
    }
  }

  function finishRegistration(returnTo = loginDestination) {
    navigate("/login", { replace: true, state: { customerRegistered: true, ...(returnTo ? { from: { pathname: returnTo } } : {}) } });
  }

  return <main className="bp-public-auth bp-auth-customer auth-reference-page min-h-screen bg-slate-950 p-4 sm:p-6">
    <div className="bp-auth-card mx-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><MessageCircle /></span>
       <h1 className="mt-5 text-3xl font-bold bp-ui-page-title">{invitation ? "Create an account to join this property" : "Customer account"}</h1>
       <p className="mt-2 text-sm text-slate-500">{invitation ? `You’re joining ${invitation.property_name}${invitation.city ? ` · ${invitation.city}` : ""}${invitation.relationship ? ` as ${roleLabel(invitation.relationship)}` : ""} with ${accessLabel(invitation.access_level)}.` : "Create your account directly. No contractor registration is required."}</p>
       {invitationToken && !invitation && !error && <p role="status" className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Checking your property invitation…</p>}
      {verification ? <RegistrationEmailVerification initialVerification={verification} mobile={form.mobile} password={form.password} email={form.email} onVerified={() => finishRegistration()} /> : <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} label="Name" name="name" value={form.name} onChange={update} />
        <div>
          <Field aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} label="Mobile number" name="mobile" inputMode="tel" value={form.mobile} onChange={update} />
          
        </div>
         <Field aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} label={invitation?.requires_email ? "Email address (required for invitation)" : "Email (optional)"} name="email" type="email" autoComplete="email" required={Boolean(invitation?.requires_email)} value={form.email} onChange={update} />
        <Field aria-describedby="registration-error" aria-invalid={Boolean(error)} disabled={saving} label="Create password" name="password" type="password" autoComplete="new-password" minLength="8" value={form.password} onChange={update} />
        <RegistrationConsent role="CUSTOMER" onConsentChange={setConsent} />
        <p id="registration-error" role="alert" className={error ? "rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2" : "sr-only"}>{error}</p>
        <button disabled={saving || !consent.ready} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2 bp-ui-action">{saving ? "Creating account..." : "Create customer account"}</button>
      </form>}
       <p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link to="/login" state={invitationToken ? { from: { pathname: `/join/property/${invitationToken}` } } : undefined} className="font-semibold text-slate-950">Sign in</Link></p>
    </div>
  </main>;
}

function roleLabel(role) { return ({ OWNER: "an owner", TENANT: "a tenant", PROPERTY_MANAGER: "a property manager", FACILITY_MANAGER: "a facility manager", OTHER: "another contact" })[role] || "a property contact"; }
function accessLabel(value) { return ({ VIEW_ONLY: "view only access", SITE_COORDINATION: "site coordination access", QUOTATION_APPROVAL: "quotation and approval access", FINANCE: "finance access", PROPERTY_MANAGEMENT: "property management access", FULL_ACCESS: "full access", CUSTOM: "custom access" })[value] || "the requested access"; }

function Field({ label, required = true, ...props }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<input required={required} {...props} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-slate-900 bp-ui-control" /></label>;
}
