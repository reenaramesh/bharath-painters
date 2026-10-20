import { useEffect, useState } from "react";
import { FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import api from "../api/client";
import { Dialog } from "./ui/Dialog";

export default function RegistrationConsent({ role, onConsentChange }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDocument(null);
    setOpen(null);
    onConsentChange({ ready: false, accepted: false, policyVersion: "" });
    api.get("/accounts/legal/registration/", { params: { role } })
      .then(({ data }) => {
        if (!data?.policy_version || !Array.isArray(data.terms_sections) || !Array.isArray(data.privacy_sections)) throw new Error("Invalid policy");
        if (active) {
          setDocument(data);
          onConsentChange({ ready: true, accepted: false, policyVersion: data.policy_version });
        }
      })
      .catch(() => {
        if (active) setError("Terms and Privacy Notice could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, onConsentChange, attempt]);

  return <section className="registration-consent-card space-y-2 text-sm text-slate-600 sm:col-span-2">
    {loading && <p role="status" className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Loading Terms and Privacy Notice...</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 font-semibold underline">Retry</button></div>}
    {!loading && document && <>
      <p>By continuing with registration, you accept the <a href="#registration-terms" onClick={event => { event.preventDefault(); setOpen("terms"); }} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Terms of Use</a> and acknowledge the <a href="#registration-privacy" onClick={event => { event.preventDefault(); setOpen("privacy"); }} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Privacy and Data Protection Notice</a>.</p>
      <p className="text-xs text-slate-500">Version {document.policy_version} / Effective {document.effective_date}</p>
    </>}
    {open && document && <Dialog title={open === "terms" ? document.terms_title : document.privacy_title} description={<span>{document.operator_name} / {document.operator_address}<br />Version {document.policy_version} / Effective {document.effective_date}</span>} icon={ShieldCheck} size="xl" onClose={() => setOpen(null)} closeLabel="Close" className="registration-agreement-dialog" bodyClassName="registration-agreement-body">
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-7">
        <LegalDocument title={open === "terms" ? document.terms_title : document.privacy_title} sections={open === "terms" ? document.terms_sections : document.privacy_sections} icon={open === "terms" ? FileText : ShieldCheck} />
        <section className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Official legal references</h3>
          <div className="mt-3 space-y-2">{document.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-blue-700 underline">{reference.label}</a>)}</div>
          <p className="mt-4 break-words text-sm">Questions or grievances: <a href={`mailto:${document.contact_email}`} className="font-bold">{document.contact_email}</a></p>
        </section>
      </div>
    </Dialog>}
  </section>;
}

function LegalDocument({ title, sections, icon: Icon }) {
  return <section className="mb-5 overflow-hidden rounded-2xl border bg-white">
    <header className="flex items-center gap-3 border-b bg-slate-950 px-5 py-4 text-white"><Icon className="h-5 w-5" /><h3 className="text-lg font-extrabold">{title}</h3></header>
    <div className="divide-y">{sections.map((section) => <article key={section.title} className="p-5"><h4 className="font-bold text-slate-950">{section.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p></article>)}</div>
  </section>;
}
