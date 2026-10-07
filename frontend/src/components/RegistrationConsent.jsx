import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, ShieldCheck, X } from "lucide-react";
import api from "../api/client";

export default function RegistrationConsent({ role, onConsentChange, inline = false }) {
  const documentEnd = useRef(null);
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDocument(null);
    setReachedEnd(false);
    setChecked(false);
    setAccepted(false);
    onConsentChange({ accepted: false, policyVersion: "", scrolled: false });
    api.get("/accounts/legal/registration/", { params: { role } })
      .then(({ data }) => {
        if (active) setDocument(data);
      })
      .catch(() => {
        if (active) setError("Terms and Privacy Notice could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [role, onConsentChange]);

  useEffect(() => {
    if (!inline || loading || !document || !documentEnd.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReachedEnd(true);
        observer.disconnect();
      }
    }, { threshold: 1 });
    observer.observe(documentEnd.current);
    return () => observer.disconnect();
  }, [inline, loading, document]);

  function changeInlineConsent(event) {
    const value = event.target.checked && reachedEnd && !!document;
    setChecked(value);
    setAccepted(value);
    onConsentChange({ accepted: value, policyVersion: document?.policy_version || "", scrolled: reachedEnd });
  }

  function handleScroll(event) {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 24) {
      setReachedEnd(true);
    }
  }

  function confirm() {
    if (!document || !reachedEnd || !checked) return;
    setAccepted(true);
    setOpen(false);
    onConsentChange({
      accepted: true,
      policyVersion: document.policy_version,
      scrolled: true,
    });
  }

  if (inline) return <section className="space-y-4 sm:col-span-2" aria-labelledby="customer-registration-agreement">
    <header className="border-t pt-6">
      <h2 id="customer-registration-agreement" className="text-xl font-bold">Terms of Use & Privacy Notice</h2>
      
      {document && <p className="mt-2 text-xs text-slate-500">Version {document.policy_version} / Effective {document.effective_date}</p>}
    </header>
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading Terms and Privacy Notice...</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loading && document && <>
      <p className="text-sm text-slate-500">{document.operator_name} / {document.operator_address}</p>
      <LegalDocument title={document.terms_title} sections={document.terms_sections} icon={FileText} />
      <LegalDocument title={document.privacy_title} sections={document.privacy_sections} icon={ShieldCheck} />
      <section className="rounded-2xl border bg-slate-50 p-5">
        <h3 className="font-bold">Official legal references</h3>
        <div className="mt-3 space-y-2">{document.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-blue-700 underline">{reference.label}</a>)}</div>
        <p className="mt-4 break-words text-sm text-slate-600">Questions or grievances: <a href={`mailto:${document.contact_email}`} className="font-bold">{document.contact_email}</a></p>
      </section>
      <div ref={documentEnd} className="h-1" aria-hidden="true" />
      <label className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${accepted ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
        <input type="checkbox" required disabled={!reachedEnd} checked={checked} onChange={changeInlineConsent} className="mt-1 h-5 w-5 shrink-0" />
        <span>I have read and accept the Terms of Use and acknowledge the Privacy and Data Protection Notice, including the role-specific responsibilities shown above.</span>
      </label>
    </>}
  </section>;

  return <>
    <section className={`rounded-2xl border p-4 sm:col-span-2 ${accepted ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accepted ? "bg-emerald-600 text-white" : "bg-slate-950 text-white"}`}>
          {accepted ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{accepted ? "Terms and Privacy Notice accepted" : "Terms and Privacy Notice required"}</p>
          {document && <p className="mt-1 text-xs text-slate-500">Version {document.policy_version} / Effective {document.effective_date}</p>}
          {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
        </div>
        <button type="button" disabled={loading || !document} onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">
          {loading ? "Loading..." : accepted ? "Review" : "Read document"}
        </button>
      </div>
    </section>

    {open && document && <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/70 sm:items-center sm:justify-center sm:p-5">
      <div className="flex h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[90vh] sm:max-w-4xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
          <div><p className="text-xs font-bold uppercase tracking-wider text-amber-600">Registration agreement</p><h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Terms of Use & Privacy Notice</h2><p className="mt-1 text-xs text-slate-500">{document.operator_name} / {document.operator_address}</p><p className="mt-1 text-xs text-slate-500">Version {document.policy_version} / Effective {document.effective_date}</p></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border p-2" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-7">
          <LegalDocument title={document.terms_title} sections={document.terms_sections} icon={FileText} />
          <LegalDocument title={document.privacy_title} sections={document.privacy_sections} icon={ShieldCheck} />
          <section className="rounded-2xl border bg-white p-5">
            <h3 className="font-extrabold">Official legal references</h3>
            <div className="mt-3 space-y-2">{document.references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-blue-700 underline">{reference.label}</a>)}</div>
            <p className="mt-4 text-sm text-slate-600">Questions or grievances: <a href={`mailto:${document.contact_email}`} className="font-bold text-slate-950">{document.contact_email}</a></p>
          </section>
          <div className="h-4" aria-hidden="true" />
        </div>

        <footer className="border-t bg-white p-4 sm:p-5">
          {!reachedEnd && <p className="mb-3 text-center text-sm font-semibold text-amber-700">Scroll through the complete document to enable acceptance.</p>}
          <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${reachedEnd ? "cursor-pointer bg-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
            <input type="checkbox" disabled={!reachedEnd} checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>I have read and accept the Terms of Use and acknowledge the Privacy and Data Protection Notice, including the role-specific responsibilities shown above.</span>
          </label>
          <button type="button" onClick={confirm} disabled={!reachedEnd || !checked} className="mt-3 w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Accept and continue</button>
        </footer>
      </div>
    </div>}
  </>;
}

function LegalDocument({ title, sections, icon: Icon }) {
  return <section className="mb-5 overflow-hidden rounded-2xl border bg-white">
    <header className="flex items-center gap-3 border-b bg-slate-950 px-5 py-4 text-white"><Icon className="h-5 w-5" /><h3 className="text-lg font-extrabold">{title}</h3></header>
    <div className="divide-y">{sections.map((section) => <article key={section.title} className="p-5"><h4 className="font-bold text-slate-950">{section.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p></article>)}</div>
  </section>;
}
