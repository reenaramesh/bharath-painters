import { lockBodyScroll } from "../utils/bodyScrollLock.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Check, FileText, ImagePlus, Layers, Palette, Plus, QrCode, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { SectionCard as BaseSectionCard } from "./ui";
import ProfileImageControl from "./ProfileImageControl";
import "./business-settings.css";

function SectionCard({ children, ...props }) {
  return <BaseSectionCard {...props}><div className="msp-card-body">{children}</div></BaseSectionCard>;
}
function Field({ label, required, children }) {
  return <label className="block"><span className="mb-2 block">{label}{required && <span aria-hidden="true" className="ml-1 text-rose-600">*</span>}</span>{children}</label>;
}
function Input(props) { return <input {...props} />; }
function Textarea(props) { return <textarea {...props} />; }
const APP_THEMES = [
  { name: "Coastal", primary: "#176B9B", accent: "#508398" },
  { name: "Indigo", primary: "#4F46E5", accent: "#7771E8" },
  { name: "Forest", primary: "#276749", accent: "#8BBF9F" },
  { name: "Slate", primary: "#4B6470", accent: "#A7C8D5" },
];
const TABS = [{ id: "business", label: "Business details", icon: Building2 }, { id: "appearance", label: "Appearance", icon: Palette }];
const DOCUMENT_FONTS = { MODERN: '"Segoe UI", sans-serif', CLASSIC: "Georgia, serif", CLEAN: "Arial, sans-serif", COMPACT: "Tahoma, sans-serif" };

export default function BusinessSettingsForm({ initial, catalogue: CATALOGUE, onSave, live = false, renderAppearance }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "appearance" ? "appearance" : "business";
  const [form, setForm] = useState(() => structuredClone(initial));
  const [saved, setSaved] = useState(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState({});
  const [savedFiles, setSavedFiles] = useState({});
  const [notice, setNotice] = useState("");
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);
  const [fileVersion, setFileVersion] = useState(0);
  const qrRef = useRef(null);
  const invalidFieldRef = useRef(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved) || [...new Set([...Object.keys(files), ...Object.keys(savedFiles)])].some((key) => (files[key] || null) !== (savedFiles[key] || null));
  const core = CATALOGUE.find((entry) => entry.identifier === form.core_service);
  const savedCore = CATALOGUE.find((entry) => entry.identifier === saved.core_service);
  const currentPublishedWorkspace = core ? (form.workspace_name_override || core.workspaceName || "Bharath Apps") : "Bharath Apps";
  const publishedBrandingChanged = Boolean(saved.is_published && (
    currentPublishedWorkspace !== (saved.brand_snapshot?.workspace_name || "Bharath Apps")
    || (core?.contractorLabel || "Contractor") !== (saved.brand_snapshot?.contractor_label || "Contractor")
  ));
  const offered = new Set([form.core_service, ...form.additional_services]);

  useEffect(() => {
    const invalid = invalidFieldRef.current;
    if (!invalid || invalid.closest('[role="tabpanel"]')?.hidden) return;
    invalid.focus(); invalid.reportValidity(); invalidFieldRef.current = null;
  }, [tab, validationAttempt]);

  useEffect(() => {
    if (!dirty) return undefined;
    const preventExit = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [dirty]);
  useEffect(() => {
    if (!qrOpen) return undefined;
    const previousFocus = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    qrRef.current?.querySelector("button")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") setQrOpen(false);
      if (event.key === "Tab") { event.preventDefault(); qrRef.current?.querySelector("button")?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { releaseScrollLock(); document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [qrOpen]);

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setNotice(""); };
  const updateAppearance = useCallback((value) => { setForm(value); setNotice(""); }, []);
  const chooseCore = (next) => setForm((current) => ({
    ...current, core_service: next,
    additional_services: [...new Set([...current.additional_services, current.core_service])].filter((id) => id !== next && id),
  }));
  const toggleAdditional = (id) => setForm((current) => {
    const removing = current.additional_services.includes(id);
    const additional_services = removing ? current.additional_services.filter((value) => value !== id) : [...new Set([...current.additional_services, id])].filter((value) => value !== current.core_service);
    const allowedSubs = new Set(CATALOGUE.filter((entry) => entry.identifier === current.core_service || additional_services.includes(entry.identifier)).flatMap((entry) => entry.subServices.map((sub) => sub.identifier)));
    return { ...current, additional_services, sub_services: current.sub_services.filter((sub) => allowedSubs.has(sub)) };
  });
  const toggleSub = (id) => setForm((current) => ({ ...current, sub_services: current.sub_services.includes(id) ? current.sub_services.filter((value) => value !== id) : [...new Set([...current.sub_services, id])] }));
  const changeTab = (id) => { const next = new URLSearchParams(params); next.set("tab", id); setParams(next, { replace: true }); };
  const save = async (event, republish = false) => {
    event.preventDefault();
    const invalid = event.currentTarget.querySelector("input:invalid, select:invalid, textarea:invalid");
    if (invalid) {
      invalidFieldRef.current = invalid;
      setValidationAttempt((value) => value + 1);
      const panel = invalid.closest('[role="tabpanel"]');
      changeTab(panel?.id === "merged-panel-appearance" ? "appearance" : "business");
      setNotice("Please correct the highlighted field.");
      return;
    }
    if (!live) { setSaved(structuredClone(form)); setSavedFiles({ ...files }); setNotice("Preview changes saved."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await onSave({ form, saved, files, republish });
      setForm(result.form); setSaved(structuredClone(result.form)); setFiles({}); setSavedFiles({}); setFileVersion((value) => value + 1);
      setNotice(result.warning || (republish ? "Settings saved and published identity updated." : "Settings saved."));
    } catch (requestError) { setError(requestError.message || "Settings could not be saved."); }
    finally { setSaving(false); }
  };
  const discard = () => { setForm(structuredClone(saved)); setFiles({ ...savedFiles }); setFileVersion((value) => value + 1); setError(""); setNotice("Unsaved changes discarded."); };
  const field = (key, label, options = {}) => <Field key={key} label={label} required={options.required}><Input name={key} value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} {...options} type={live && options.type === "url" ? "text" : options.type} /></Field>;
  const upload = (key, label, photo = false) => {
    if (photo) {
      const positionKey = key === "company_logo" ? "company_logo_position" : "profile_photo_position";
      const shape = key === "company_logo" ? (form.company_logo_shape === "ROUND" ? "circle" : "rectangle") : "circle";
       return <ProfileImageControl key={`${key}-${fileVersion}`} className="contractor-profile-image" label={label} file={files[key]} existingUrl={form[`${key}_url`]} position={form[positionKey]} shape={shape} fit={key === "company_logo" && shape === "rectangle" ? "contain" : "cover"} onPositionChange={(position) => update(positionKey, position)} onFileChange={(file) => { setFiles((current) => ({ ...current, [key]: file })); setNotice(""); }} onRemove={() => { update(`${key}_url`, ""); update(positionKey, { x: 50, y: 50, zoom: 1 }); }} />;
    }
    return <FileField key={`${key}-${fileVersion}`} label={label} file={files[key]} existingUrl={form[`${key}_url`]} onRemove={() => update(`${key}_url`, "")} onChange={(file) => { setFiles((current) => ({ ...current, [key]: file })); setNotice(""); }} />;
  };
  const Content = live ? "div" : "main";

  return <div className={`merged-settings-preview ${live ? "msp-live" : ""}`} style={live ? undefined : { "--bp-brand": form.app_primary_color }}>
    {!live && <header className="msp-topbar"><Link to="/preview/sidebar" className="msp-brand"><span><Layers size={23} /></span><div><strong>Bharath Apps</strong><small>{form.workspace_name_override || core?.workspaceName || "Your workspace"}</small></div></Link><span className="msp-preview-badge">Preview · sample data</span></header>}
    <Content className="msp-content">
      <header className="msp-page-header"><div><p className="bp-eyebrow">Business setup</p><h1>Settings</h1></div>{live ? <Link to="/profile" target="_blank" rel="noreferrer" className="msp-qr-button"><QrCode size={18} />View QR profile</Link> : <button type="button" className="msp-qr-button" onClick={() => setQrOpen(true)}><QrCode size={18} />View QR profile</button>}</header>
      <div className="msp-tabbar" role="tablist" aria-label="Settings sections">{TABS.map(({ id, label, icon: Icon }, index) => <button key={id} id={`merged-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`merged-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? "is-selected" : ""} onClick={() => changeTab(id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? (index + 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
        if (next === null) return; event.preventDefault(); changeTab(TABS[next].id); document.getElementById(`merged-tab-${TABS[next].id}`)?.focus();
      }}><Icon size={18} />{label}</button>)}</div>
      {error && <p role="alert" className="msp-error">{error}</p>}
      {publishedBrandingChanged && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">Your published profile still shows <strong>{saved.brand_snapshot?.workspace_name || savedCore?.workspaceName || "Bharath Apps"}</strong>. Saving changes updates the current workspace; republish explicitly to update the published identity.</p>}
      <form onSubmit={save} noValidate>
        <fieldset disabled={saving} className="msp-form-fields">
        <section id="merged-panel-business" role="tabpanel" aria-labelledby="merged-tab-business" hidden={tab !== "business"}>
          <div className="msp-sections">
            <SectionCard title="Company & contact"><div className="msp-field-grid">
              {field("company_name", "Company name", { required: !live })}{field("owner_name", "Owner / proprietor")}
              {field("mobile", "Mobile", { required: true, type: "tel" })}{field("email", "Email", { required: true, type: "email" })}
              {upload("company_logo", "Company logo", true)}{upload("owner_photo", "Owner photo", true)}
               {live && <Field label="Logo shape"><select name="company_logo_shape" value={form.company_logo_shape} onChange={(event) => update("company_logo_shape", event.target.value)}><option value="RECTANGLE">Rectangle</option><option value="ROUND">Round</option></select></Field>}
              <div className="msp-wide"><Field label="Office address"><Textarea name="office_address" rows={2} value={form.office_address} onChange={(event) => update("office_address", event.target.value)} /></Field></div>
            </div></SectionCard>
            <SectionCard title="Services & experience"><div className="msp-field-grid">
              <div className="msp-wide"><Field label="Core service" required={!live || form.profile_status === "PUBLISHED"}><select name="core_service" required={!live || form.profile_status === "PUBLISHED"} value={form.core_service} onChange={(event) => { chooseCore(event.target.value); setNotice(""); }}>{live && <option value="">Select core service</option>}{CATALOGUE.map((entry) => <option key={entry.identifier} value={entry.identifier} disabled={entry.selectable === false}>{entry.name}</option>)}</select></Field></div>
              <fieldset className="msp-wide msp-selections"><legend>Additional services</legend><div className="msp-service-grid">{CATALOGUE.filter((entry) => entry.identifier !== form.core_service).map((entry) => <label key={entry.identifier} className={form.additional_services.includes(entry.identifier) ? "is-checked" : ""}><input type="checkbox" name="additional_services" value={entry.identifier} checked={form.additional_services.includes(entry.identifier)} disabled={entry.selectable === false && !form.additional_services.includes(entry.identifier)} onChange={() => { toggleAdditional(entry.identifier); setNotice(""); }} /><span>{entry.name}</span></label>)}</div></fieldset>
              <fieldset className="msp-wide msp-selections"><legend>Sub-services</legend><div className="msp-sub-services">{CATALOGUE.filter((entry) => offered.has(entry.identifier)).map((entry) => <fieldset key={entry.identifier}><legend>{entry.name}</legend><div className="msp-service-grid">{entry.subServices.map((sub) => <label key={sub.identifier} className={form.sub_services.includes(sub.identifier) ? "is-checked" : ""}><input type="checkbox" name="sub_services" value={sub.identifier} checked={form.sub_services.includes(sub.identifier)} onChange={() => { toggleSub(sub.identifier); setNotice(""); }} /><span>{sub.name}</span></label>)}</div></fieldset>)}</div></fieldset>
              <div className="msp-wide"><Field label="Other skills & service notes"><Textarea name="work_skills" rows={2} value={form.work_skills} onChange={(event) => update("work_skills", event.target.value)} /></Field></div>
              {field("years_in_business", "Years in business", { type: "number", min: 0 })}{field("team_size", "Declared workforce count", { type: "number", min: 0 })}
              {field("service_areas", "Service areas")}{field("base_location", "Professional base location")}
            </div></SectionCard>
            <SectionCard title="Professional introduction & branding"><div className="msp-field-grid">
              {field("headline", "Headline", { maxLength: 180 })}{field("tagline", "Tagline", { maxLength: 180 })}
              <div className="msp-wide"><Field label="About"><Textarea name="about" rows={3} maxLength={1200} value={form.about} onChange={(event) => update("about", event.target.value)} /></Field></div>
              <div className="msp-wide">{field("workspace_name_override", "Workspace name override", { maxLength: 150 })}</div>
            </div></SectionCard>
            <SectionCard title="Payment & tax details"><div className="msp-field-grid">
              {field("bank_account_name", "Account name")}{field("bank_account_number", "Account number", { inputMode: "numeric" })}
              {field("bank_name", "Bank name")}{field("bank_branch", "Branch")}
              {field("bank_ifsc", "IFSC code", { maxLength: 20 })}{field("upi_id", "UPI ID")}
              {field("gst_number", "GSTIN", { maxLength: 15 })}{field("pan_number", "PAN number", { maxLength: 10 })}
            </div></SectionCard>
            <SectionCard title="Documents & social links"><div className="msp-field-grid">
              {upload("gst_document", "GST certificate")}{upload("business_document", "Business licence")}
              {field("website", "Website", { type: "url" })}{field("google_business_url", "Google Business", { type: "url" })}
              {field("facebook_url", "Facebook", { type: "url" })}{field("instagram_url", "Instagram", { type: "url" })}
              {field("pinterest_url", "Pinterest", { type: "url" })}{field("whatsapp_number", "WhatsApp number", { type: "tel" })}
              <div className="msp-wide msp-extra-links">{form.extra_social_links.map((link, index) => <div key={link.id} className="msp-extra-link"><Field label={`Link ${index + 1} label`} required><Input required name={`extra_label_${link.id}`} value={link.label} onChange={(event) => update("extra_social_links", form.extra_social_links.map((row) => row.id === link.id ? { ...row, label: event.target.value } : row))} /></Field><Field label={`Link ${index + 1} URL`} required><Input required name={`extra_url_${link.id}`} type={live ? "text" : "url"} value={link.url} onChange={(event) => update("extra_social_links", form.extra_social_links.map((row) => row.id === link.id ? { ...row, url: event.target.value } : row))} /></Field><button type="button" className="msp-icon-button" aria-label={`Remove link ${index + 1}`} onClick={() => update("extra_social_links", form.extra_social_links.filter((row) => row.id !== link.id))}><Trash2 size={18} /></button></div>)}<button type="button" className="msp-secondary" disabled={live && form.extra_social_links.length >= 12} onClick={() => update("extra_social_links", [...form.extra_social_links, { id: crypto.randomUUID(), label: "", url: "" }])}><Plus size={17} />Add link</button></div>
            </div></SectionCard>
            <SectionCard title="Business preferences"><div className="msp-field-grid">
              <Field label="Measurement unit"><select name="default_measurement_unit" value={form.default_measurement_unit} onChange={(event) => update("default_measurement_unit", event.target.value)}><option value="FEET">Feet (ft)</option><option value="METRES">Metres (m)</option></select></Field>
              <Field label="Profile status"><select name="profile_status" value={form.profile_status} onChange={(event) => update("profile_status", event.target.value)}><option value="DRAFT">Draft</option>{live && !form.is_published && <option value="READY">Unpublished</option>}<option value="PUBLISHED">Published</option></select></Field>
              <Toggle label="Accept subcontract work" name="accepts_subcontract_work" checked={form.accepts_subcontract_work} onChange={(value) => update("accepts_subcontract_work", value)} />
              <Toggle label="Appear in contractor network" name="network_opt_in" checked={form.network_opt_in} onChange={(value) => update("network_opt_in", value)} />
            </div></SectionCard>
          </div>
        </section>
        <section id="merged-panel-appearance" role="tabpanel" aria-labelledby="merged-tab-appearance" hidden={tab !== "appearance"}>
          {renderAppearance ? renderAppearance(form, updateAppearance) : <div className="msp-sections"><SectionCard title="App appearance"><div className="msp-theme-grid">{APP_THEMES.map((theme) => <button key={theme.name} type="button" aria-pressed={form.app_primary_color === theme.primary && form.app_accent_color === theme.accent} className={form.app_primary_color === theme.primary ? "is-selected" : ""} onClick={() => { setForm((current) => ({ ...current, app_primary_color: theme.primary, app_accent_color: theme.accent })); setNotice(""); }}><span className="msp-swatch"><span style={{ background: theme.primary }} /><span style={{ background: theme.accent }} /></span>{theme.name}</button>)}</div><div className="msp-field-grid msp-colors">{[ ["app_primary_color", "Primary colour"], ["app_accent_color", "Accent colour"] ].map(([key, label]) => <ColorField key={key} label={label} name={key} value={form[key]} onChange={(value) => update(key, value)} />)}</div></SectionCard>
          <SectionCard title="Document appearance"><div className="msp-field-grid">{[["pdf_primary_color", "Document primary colour"], ["pdf_accent_color", "Document accent colour"], ["pdf_text_color", "Document text colour"]].map(([key, label]) => <ColorField key={key} label={label} name={key} value={form[key]} onChange={(value) => update(key, value)} />)}<Field label="Document font"><select name="pdf_font" value={form.pdf_font} onChange={(event) => update("pdf_font", event.target.value)}><option value="MODERN">Modern</option><option value="CLASSIC">Classic</option><option value="CLEAN">Clean</option><option value="COMPACT">Compact</option></select></Field></div><div className="msp-document-preview" style={{ borderColor: form.pdf_accent_color, color: form.pdf_text_color, fontFamily: DOCUMENT_FONTS[form.pdf_font] }}><header style={{ background: form.pdf_primary_color }}>QUOTATION</header><div><strong>{form.company_name}</strong><span>Sample document</span></div></div></SectionCard></div>}
        </section>
        </fieldset>
         <footer className="msp-savebar"><span className="msp-save-status" role="status" aria-live="polite">{notice || (dirty ? "Unsaved changes" : "")}</span><div>{publishedBrandingChanged && <button type="button" className="msp-secondary" disabled={saving} onClick={(event) => save(event, true)}>{saving ? "Publishing…" : "Republish updated identity"}</button>}<button type="button" className="msp-secondary" disabled={!dirty || saving} onClick={discard}><RotateCcw size={17} />Discard changes</button><button type="submit" className="msp-primary" disabled={saving}><Save size={17} />{saving ? "Saving…" : "Save changes"}</button></div></footer>
      </form>
    </Content>
    {qrOpen && <div className="msp-modal" role="dialog" aria-modal="true" aria-label="Profile preview" ref={qrRef} onClick={(event) => { if (event.target === event.currentTarget) setQrOpen(false); }}><section><header><h2>Profile preview</h2><button type="button" className="msp-icon-button" aria-label="Close profile preview" onClick={() => setQrOpen(false)}><X size={20} /></button></header><div className="msp-profile-symbol"><QrCode size={96} /></div><strong>{form.company_name}</strong><span>{core?.name}</span><span className="msp-preview-badge">Sample profile · QR placeholder</span></section></div>}
  </div>;
}

function Toggle({ label, name, checked, onChange }) {
  return <label className="msp-toggle"><span>{label}</span><input type="checkbox" role="switch" name={name} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="msp-toggle-track" aria-hidden="true"><span /></span></label>;
}
function ColorField({ label, name, value, onChange }) {
  return <div className="msp-color-field"><label htmlFor={`hex-${name}`}>{label}</label><div><input type="color" aria-label={`${label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} /><Input id={`hex-${name}`} name={name} pattern="#[0-9a-fA-F]{6}" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /></div></div>;
}
function FileField({ label, file, photo, onChange, existingUrl, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!photo || !file) { setUrl(null); return undefined; }
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, photo]);
  return <div className="msp-file-field"><span>{label}</span><div className="msp-file-box">{photo ? <span className="msp-photo">{url || existingUrl ? <img src={url || existingUrl} alt={label} /> : <ImagePlus size={23} />}</span> : <FileText size={24} className="msp-file-icon" />}<div className="msp-file-action"><label><Upload size={15} /><span>{file || existingUrl ? "Replace" : "Upload"}</span><input type="file" accept={photo ? "image/*" : "application/pdf,image/*"} aria-label={label} onChange={(event) => onChange(event.target.files?.[0] || null)} /></label>{existingUrl && !file ? <a href={existingUrl} target="_blank" rel="noreferrer" className="msp-filename">View uploaded file</a> : <span className="msp-filename" title={file?.name}>{file?.name || "Not uploaded"}</span>}</div>{(file || existingUrl) && <button type="button" className="msp-icon-button" aria-label={`Remove ${label}`} onClick={() => file ? onChange(null) : onRemove()}><X size={17} /></button>}{(file || existingUrl) && <Check size={16} className="msp-uploaded" />}</div></div>;
}
