import { useState } from "react";
import { Copy, MessageCircle, Share2, X } from "lucide-react";
import api, { API_BASE_URL } from "../api/client";
import { useLanguage } from '../i18n/LanguageContext';
import { formatSystemText } from '../i18n/transliterate';

export default function ContractorInvitation({ user }) {
  const { language } = useLanguage();
  const copyText = (source, values) => formatSystemText(source, language, values);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function prepare() {
    setOpen(true);
    setStatus("");
    setError("");
    if (profile) return;
    setLoading(true);
    try {
      const { data } = await api.get("/accounts/contractor-profile/");
      setProfile(data);
    } catch {
      setError("Your profile details could not be loaded. Please try again.");
    } finally { setLoading(false); }
  }

  const name = profile?.company_name || profile?.owner_name || user?.first_name || "Contractor";
  const registrationUrl = new URL("/register", window.location.origin).href;
  const profileUrl = user?.bharath_id ? new URL(`${API_BASE_URL.replace(/\/$/, "")}/accounts/verify-page/${encodeURIComponent(user.bharath_id)}/`, window.location.origin).href : "";
  const message = [
    copyText('Hello! {name} invites you to join Bharath Apps as a contractor.', { name }),
    copyText('Connect with other contractors, find B2B work opportunities and collaborate on projects.'),
    "",
    copyText('My contractor profile:'),
    profile?.company_name && copyText('Company: {value}', { value: profile.company_name }),
    profile?.owner_name && copyText('Owner: {value}', { value: profile.owner_name }),
    (profile?.mobile || user?.mobile) && copyText('Phone: {value}', { value: profile?.mobile || user.mobile }),
    profile?.work_skills && copyText('Work: {value}', { value: profile.work_skills }),
    profile?.service_areas && copyText('Service areas: {value}', { value: profile.service_areas }),
    user?.bharath_id && copyText('Bharath ID: {value}', { value: user.bharath_id }),
    profileUrl && copyText('View my profile: {value}', { value: profileUrl }),
    "",
    copyText('Join as a contractor: {value}', { value: registrationUrl }),
    copyText('After registration and verification, find my profile and send a connection request.'),
  ].filter((line) => line !== false && line != null).join("\n");

  async function copy() {
    setStatus("");
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Invitation copied. Paste it into WhatsApp, SMS or another app.");
    } catch {
      setStatus("Select the invitation text above and copy it to share.");
    }
  }

  async function share() {
    setStatus("");
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: `${name} invites you to Bharath Apps`, text: message });
    } catch (err) {
      if (err.name !== "AbortError") setStatus("Sharing could not open. Use WhatsApp or Copy invitation below.");
    }
  }

  return <div className="min-w-0">
    <button type="button" onClick={prepare} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Share2 className="h-4 w-4" />Share invitation</button>
    {open && <section aria-label="Contractor invitation" className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-bold text-slate-900">Invite a contractor</h3></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close invitation" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-white"><X className="h-4 w-4" /></button>
      </div>
      {loading && <p role="status" className="mt-3 text-sm text-slate-600">Preparing your invitation…</p>}
      {error && <div className="mt-3"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" onClick={prepare} className="mt-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Try again</button></div>}
      {profile && !loading && !error && <>
        <label className="mt-3 block"><span className="mb-1 block text-sm font-semibold">Invitation message</span><textarea readOnly value={message} rows={9} onFocus={(event) => event.target.select()} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-700" /></label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176b9b] px-4 py-2 text-sm font-semibold text-white"><Share2 className="h-4 w-4" />Share</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a>
          <button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />Copy invitation</button>
        </div>
        {status && <p role="status" className="mt-3 text-sm text-slate-700">{status}</p>}
      </>}
    </section>}
  </div>;
}
