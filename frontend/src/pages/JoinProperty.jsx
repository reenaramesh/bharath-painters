import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function JoinProperty() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get(`/quotations/property-invitations/token/${token}/`).then(({ data }) => {
      if (active) setInvite(data);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.detail || "This property invitation is unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/property-invitations/token/${token}/accept/`);
      navigate(`/customer-properties/${data.property_id}`, { replace: true, state: { propertyInvitationAccepted: true } });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The invitation could not be accepted. Check that you are signed in to the invited customer account.");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    await logout();
    navigate("/login", { state: { from: { pathname: `/join/property/${token}` } } });
  }

  const registrationUrl = `/customer-register?property_invitation_token=${encodeURIComponent(token)}`;

  return <main className="property-invitation-page min-h-screen bg-[#f5f7f8] px-4 py-8 text-[#102331] sm:px-6 sm:py-14">
    <a href="#join-property-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:shadow">Skip to invitation</a>
    <section id="join-property-content" className="mx-auto max-w-2xl">
      <header className="mb-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#176b9b] text-white"><Building2 aria-hidden="true" className="h-5 w-5" /></span>
        <div><p className="text-sm font-bold tracking-wide">Bharath Apps</p><p className="text-xs text-[#536774]">Property access</p></div>
      </header>

      {loading ? <div role="status" aria-live="polite" className="space-y-4 rounded-2xl border border-[#d8e1e5] bg-white p-6 sm:p-9">
        <span className="block h-3 w-24 animate-pulse rounded bg-slate-200" />
        <span className="block h-8 w-3/4 animate-pulse rounded bg-slate-200" />
        <span className="block h-20 animate-pulse rounded bg-slate-100" />
        <span className="sr-only">Loading invitation details…</span>
      </div> : error && !invite ? <section className="rounded-2xl border border-[#d8e1e5] bg-white p-6 sm:p-9" aria-labelledby="join-title">
        <p className="text-sm font-bold uppercase tracking-wider text-[#176b9b]">Invitation unavailable</p>
        <h1 id="join-title" className="mt-3 text-2xl font-extrabold">This property link can’t be opened</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-[#536774]">{error}</p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#102331] px-5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Go to sign in <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </section> : invite && <section className="overflow-hidden rounded-2xl border border-[#d8e1e5] bg-white" aria-labelledby="join-title">
        <div className="border-b border-[#d8e1e5] px-6 py-7 sm:px-9 sm:py-9">
          <p className="text-sm font-bold uppercase tracking-wider text-[#176b9b]">You’re invited to this place</p>
          <h1 id="join-title" className="mt-3 max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">Join the property team</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[#536774]">Accept access to see property information and updates shared with your role.</p>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_auto] sm:items-center sm:px-9">
          <div>
            <h2 className="text-xl font-bold">{invite.property_name}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#536774]">
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{invite.property_type}{invite.city ? ` · ${invite.city}` : ""}</span>
            </p>
          </div>
          <span className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-[#e9f3f8] px-4 text-sm font-semibold text-[#145878] sm:self-center">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" /> {relationshipName(invite.relationship)} · {accessName(invite.access_level)}
          </span>
        </div>

        <div className="border-t border-[#d8e1e5] bg-[#fbfcfc] px-6 py-6 sm:px-9">
          <p className="text-sm leading-6 text-[#536774]">Invitation expires {new Date(invite.expires_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {!user ? <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to={registrationUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 text-sm font-bold text-white hover:bg-[#12577f] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]">Create customer account <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link to="/login" state={{ from: { pathname: `/join/property/${token}` } }} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#b9cbd3] bg-white px-5 text-sm font-bold text-[#102331] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">I already have an account</Link>
          </div> : user.role !== "CUSTOMER" ? <div className="mt-6">
            <p className="text-sm text-[#536774]">This invitation is for a customer account. Switch accounts to continue.</p>
            <button type="button" onClick={switchAccount} className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-[#102331] px-5 text-sm font-bold text-white hover:bg-[#1c3b4e] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Switch account</button>
          </div> : <div className="mt-6">
            <p className="text-sm text-[#536774]">Signed in as <strong className="text-[#102331]">{user.mobile || "customer account"}</strong>.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={busy} aria-busy={busy} onClick={accept} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 text-sm font-bold text-white hover:bg-[#12577f] active:translate-y-px disabled:cursor-wait disabled:opacity-65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]">{busy ? "Accepting invitation…" : "Accept property invitation"}</button>
              <Link to="/customer-dashboard" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#b9cbd3] bg-white px-5 text-sm font-bold text-[#102331] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Not now</Link>
            </div>
          </div>}
          <p className="mt-6 border-t border-[#e3e9ec] pt-4 text-xs leading-5 text-[#536774]">You’ll only see information made available to your property-contact role. You can leave the property later from its access settings.</p>
        </div>
      </section>}
    </section>
  </main>;
}

function relationshipName(value) { return ({ OWNER: "Owner", TENANT: "Tenant", PROPERTY_MANAGER: "Property manager", FACILITY_MANAGER: "Facility manager", OTHER: "Other" })[value] || "Relationship not specified"; }
function accessName(value) { return ({ VIEW_ONLY: "View only", SITE_COORDINATION: "Site coordination", QUOTATION_APPROVAL: "Quotation & approval", FINANCE: "Finance", PROPERTY_MANAGEMENT: "Property management", FULL_ACCESS: "Full access", CUSTOM: "Custom access" })[value] || "Access"; }
