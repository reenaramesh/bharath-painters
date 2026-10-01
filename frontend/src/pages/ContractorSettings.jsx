import { useEffect, useState } from "react";
import { Award, Check, Eye, EyeOff, FileText, Plus, QrCode, Save, Trash2, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";

const pdfColorTemplates = [
  { value: "STUDIO", label: "Studio", colors: ["#142743", "#ff991f"] },
  { value: "INDIGO", label: "Indigo", colors: ["#25205c", "#7771e8"] },
  { value: "FOREST", label: "Forest", colors: ["#153b32", "#d4a842"] },
  { value: "CHARCOAL", label: "Charcoal", colors: ["#27313b", "#bd7959"] },
  { value: "COASTAL", label: "Coastal", colors: ["#508398", "#C2C9CC"] },
  { value: "CORAL", label: "Coral", colors: ["#395F6E", "#FCB29B"] },
  { value: "MIST", label: "Mist", colors: ["#7B8285", "#D9EDF5"] },
];
const appColorPresets = [
  { label: "Coastal", primary: "#176B9B", accent: "#508398" },
  { label: "Deep teal", primary: "#395F6E", accent: "#FCB29B" },
  { label: "Indigo", primary: "#4F46E5", accent: "#7771E8" },
  { label: "Forest", primary: "#276749", accent: "#8BBF9F" },
  { label: "Slate", primary: "#4B6470", accent: "#A7C8D5" },
];

const pdfFontTemplates = [
  { value: "MODERN", label: "Modern", family: '"Segoe UI", sans-serif' },
  { value: "CLASSIC", label: "Classic", family: "Georgia, serif" },
  { value: "CLEAN", label: "Clean", family: "Arial, sans-serif" },
  { value: "COMPACT", label: "Compact", family: "Tahoma, sans-serif" },
];

function themeTextColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return "#ffffff";
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.4 ? "#172033" : "#ffffff";
}

const socialPlatforms = [
  { field: "google_business_url", label: "Google Business", short: "G", color: "#4285F4", placeholder: "https://maps.app.goo.gl/…" },
  { field: "facebook_url", label: "Facebook", short: "f", color: "#1877F2", placeholder: "https://facebook.com/…" },
  { field: "instagram_url", label: "Instagram", short: "ig", color: "#E1306C", placeholder: "https://instagram.com/…" },
  { field: "pinterest_url", label: "Pinterest", short: "p", color: "#BD081C", placeholder: "https://pinterest.com/…" },
];

function PlatformBadge({ short, color, className = "h-9 w-9" }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-lg text-xs font-bold text-white ${className}`}
      style={{ background: color }}
    >
      {short}
    </span>
  );
}

function SectionTitle({ children }) {
  return <h2 className="font-bold">{children}</h2>;
}

const blank = {
  mobile: "",
  email: "",
  password: "",
  company_name: "",
  owner_name: "",
  company_logo: null,
  company_logo_url: "",
  company_logo_shape: "RECTANGLE",
  profile_photo: null,
  profile_photo_url: "",
  pdf_color_template: "STUDIO",
  pdf_font_template: "MODERN",
  pdf_custom_primary_color: "#142743",
  pdf_custom_accent_color: "#FF991F",
  pdf_custom_text_color: "#172033",
  app_primary_color: "#176B9B",
  app_accent_color: "#508398",
  office_address: "",
  service_areas: "",
  work_skills: "",
  gst_number: "",
  pan_number: "",
  years_in_business: 0,
  number_of_painters: 0,
  default_measurement_unit: "FEET",
  bank_account_name: "",
  bank_account_number: "",
  bank_name: "",
  bank_branch: "",
  bank_ifsc: "",
  upi_id: "",
  website: "",
  google_business_url: "",
  facebook_url: "",
  instagram_url: "",
  pinterest_url: "",
  whatsapp_number: "",
  extra_social_links: [],
  gst_document: null,
  gst_document_url: "",
  business_document: null,
  business_document_url: "",
  quotation_terms_conditions: "",
  quotation_prepared_by: "",
  quotation_inspected_by: "",
  quotation_work_duration: "",
  quotation_payment_terms: "",
  quotation_product_details: "",
  quotation_work_procedures: "",
};

export default function ContractorSettings({ themeOnly = false }) {
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [previewDocument, setPreviewDocument] = useState("QUOTATION");
  const [socialModal, setSocialModal] = useState(null);
  const [socialDraft, setSocialDraft] = useState("");
  const [extraDraft, setExtraDraft] = useState({ label: "", url: "" });
  const openSocialModal = (platform) => {
    setSocialModal(platform);
    setSocialDraft(platform.field ? form[platform.field] || "" : "");
    setExtraDraft(platform.extraIndex === undefined ? { label: platform.label || "", url: "" } : form.extra_social_links?.[platform.extraIndex] || { label: "", url: "" });
  };
  const commitSocialModal = () => {
    if (!socialModal) return;
    if (socialModal.field) {
      setForm((value) => ({ ...value, [socialModal.field]: socialDraft.trim() }));
    } else if (socialModal.extraIndex === undefined) {
      const url = extraDraft.url.trim();
      if (url) setForm((value) => ({ ...value, extra_social_links: [...(value.extra_social_links || []), { label: extraDraft.label.trim() || "Website", url }] }));
    } else {
      setForm((value) => ({
        ...value,
        extra_social_links: (value.extra_social_links || []).map((entry, index) => (index === socialModal.extraIndex ? { label: extraDraft.label.trim() || entry.label, url: extraDraft.url.trim() } : entry)),
      }));
    }
    setSocialModal(null);
  };
  const removeExtraSocial = (index) =>
    setForm((value) => ({ ...value, extra_social_links: (value.extra_social_links || []).filter((_, i) => i !== index) }));
  useEffect(() => {
    api
      .get("/accounts/contractor-profile/")
      .then(({ data }) =>
        setForm({
          ...blank,
          ...data,
          company_logo: null,
          company_logo_url: data.company_logo || "",
          profile_photo: null,
          profile_photo_url: data.profile_photo || "",
          gst_document: null,
          gst_document_url: data.gst_document || "",
          business_document: null,
          business_document_url: data.business_document || "",
          clear_gst_document: false,
          clear_business_document: false,
        }),
      )
      .catch(() => setError("Contractor details could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(""), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const input =
    "mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  const selectedTemplate = pdfColorTemplates.find((template) => template.value === form.pdf_color_template);
  const [previewPrimary, previewAccent] = selectedTemplate?.colors || [form.pdf_custom_primary_color, form.pdf_custom_accent_color];
  const previewText = themeTextColor(previewPrimary);
  const previewBodyText = /^#[0-9a-fA-F]{6}$/.test(form.pdf_custom_text_color) ? form.pdf_custom_text_color : "#172033";
  const previewFont = pdfFontTemplates.find((template) => template.value === form.pdf_font_template)?.family || pdfFontTemplates[0].family;
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = new FormData();
      (themeOnly ? [
        "pdf_color_template",
        "pdf_font_template",
        "pdf_custom_primary_color",
        "pdf_custom_accent_color",
        "pdf_custom_text_color",
        "app_primary_color",
        "app_accent_color",
      ] : [
        "mobile",
        "email",
        "company_name",
        "owner_name",
        "company_logo_shape",
        "office_address",
        "service_areas",
        "work_skills",
        "gst_number",
        "pan_number",
        "years_in_business",
        "number_of_painters",
        "default_measurement_unit",
        "bank_account_name",
        "bank_account_number",
        "bank_name",
        "bank_branch",
        "bank_ifsc",
        "upi_id",
        "website",
        "google_business_url",
        "facebook_url",
        "instagram_url",
        "pinterest_url",
        "whatsapp_number",
      ]).forEach((field) => payload.append(field, form[field] ?? ""));
      if (!themeOnly) payload.append("extra_social_links", JSON.stringify(form.extra_social_links ?? []));
      if (!themeOnly && form.password) payload.append("password", form.password);
      if (!themeOnly && form.company_logo) payload.append("company_logo", form.company_logo);
      if (!themeOnly && form.profile_photo) payload.append("profile_photo", form.profile_photo);
      if (!themeOnly && form.gst_document) payload.append("gst_document", form.gst_document);
      if (!themeOnly && form.business_document) payload.append("business_document", form.business_document);
      if (!themeOnly && form.clear_gst_document) payload.append("clear_gst_document", "1");
      if (!themeOnly && form.clear_business_document) payload.append("clear_business_document", "1");
      const { data } = await api.patch(
        "/accounts/contractor-profile/",
        payload,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setForm((value) => ({
        ...value,
        ...data,
        password: "",
        company_logo: null,
        company_logo_url: data.company_logo || value.company_logo_url,
        profile_photo: null,
        profile_photo_url: data.profile_photo || value.profile_photo_url,
        gst_document: null,
        gst_document_url: data.gst_document || "",
        business_document: null,
        business_document_url: data.business_document || "",
        clear_gst_document: false,
        clear_business_document: false,
      }));
      window.dispatchEvent(new CustomEvent("bp-app-theme-changed", { detail: data }));
      setSuccess(themeOnly ? "Theme settings saved successfully." : "Contractor and company details saved successfully.");
    } catch (requestError) {
      setError(
        formatError(requestError.response?.data) ||
          (themeOnly ? "Theme settings could not be saved." : "Contractor details could not be updated."),
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <p className="p-12 text-center text-slate-500">
        Loading contractor details...
      </p>
    );
  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-5 overflow-x-hidden sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-600">{themeOnly ? "Appearance settings" : "Account settings"}</p>
        <h1 className="mt-1 text-3xl font-bold">
          {themeOnly ? "Theme settings" : "Contractor and company details"}
        </h1>
        <p className="mt-2 text-slate-500">
          {themeOnly ? "Choose colors and fonts for the app and downloaded documents." : "These details appear on your quotations and downloadable estimates."}
        </p>
        </div>
        <Link to={themeOnly ? "/settings" : "/profile"} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-center text-sm font-semibold sm:w-auto">{themeOnly ? "Company details" : <><QrCode className="h-5 w-5 shrink-0" />View & share QR profile</>}</Link>
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && <div role="status" aria-live="polite" className="fixed inset-x-4 top-20 z-[100] rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl sm:left-auto sm:px-5 sm:py-4">✓ {success}</div>}
      {!themeOnly && <section className="rounded-2xl border bg-white p-5" aria-label="Company profile completion">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Company profile</h2><p className="mt-1 text-xs text-slate-500">Fill in your company details to complete your public profile.</p></div><strong className="text-2xl text-[var(--app-primary)]">{form.profile_completion?.percent ?? 0}%</strong></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--app-primary)]" style={{ width: `${form.profile_completion?.percent ?? 0}%` }} /></div>
        {form.profile_completion?.missing?.length > 0 && <p className="mt-2 text-xs text-slate-500">Still to add: {form.profile_completion.missing.map((field) => field.replaceAll("_", " ")).join(", ")}.</p>}
      </section>}
      <form
        onSubmit={submit}
        className="grid min-w-0 grid-cols-1 gap-5 rounded-2xl border bg-white p-4 sm:grid-cols-2 sm:p-6 [&>label]:min-w-0 [&>div]:min-w-0"
      >
        {!themeOnly && <>
        <div className="sm:col-span-2">
          <h2 className="font-bold">Company identity</h2>
        </div>
        <label className="text-sm font-medium">
          Company name
          <input
            name="company_name"
            value={form.company_name}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Owner / proprietor
          <input
            name="owner_name"
            value={form.owner_name}
            onChange={update}
            className={input}
          />
        </label>
        <div className="text-sm font-medium sm:col-span-2">
          Company logo
          <div className="mt-2 flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            {form.company_logo_url && (
              <span className={`grid shrink-0 place-items-center overflow-hidden border bg-white ${
                form.company_logo_shape === "ROUND"
                  ? "h-20 w-20 rounded-full"
                  : "h-20 w-36 rounded-xl"
              }`}>
                <img
                  src={form.company_logo_url}
                  alt="Company logo"
                  className={`h-full w-full ${
                    form.company_logo_shape === "ROUND"
                      ? "object-cover"
                      : "object-contain p-1"
                  }`}
                />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <span className="flex items-center gap-2 rounded-xl border border-dashed p-3">
                <Upload className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  type="file"
                  accept="image/*"
                  className="w-full min-w-0 text-sm"
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      company_logo: event.target.files?.[0] || null,
                    }))
                  }
                />
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["RECTANGLE", "Rectangle", "Best for wide company logos"],
                  ["ROUND", "Round", "Best for badges and icons"],
                ].map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        company_logo_shape: value,
                      }))
                    }
                    className={`rounded-xl border p-3 text-left transition ${
                      form.company_logo_shape === value
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <b className="block text-sm">{label}</b>
                    <small className="mt-1 block text-xs opacity-70">{hint}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        </>}
        {themeOnly && <>
        <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold">App theme</h2>
          <p className="mt-1 text-xs text-slate-500">Choose the colors used across your contractor workspace. PDF colors are set separately below.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {appColorPresets.map((preset) => <button key={preset.label} type="button" onClick={() => setForm((current) => ({ ...current, app_primary_color: preset.primary, app_accent_color: preset.accent }))} aria-pressed={form.app_primary_color?.toUpperCase() === preset.primary && form.app_accent_color?.toUpperCase() === preset.accent} className={`rounded-xl border p-3 text-left text-xs font-bold ${form.app_primary_color?.toUpperCase() === preset.primary && form.app_accent_color?.toUpperCase() === preset.accent ? "border-[#176b9b] ring-2 ring-[#e8f3f8]" : "border-slate-200"}`}><span className="mb-2 flex h-5 overflow-hidden rounded-md"><span className="flex-1" style={{ background: preset.primary }} /><span className="flex-1" style={{ background: preset.accent }} /></span>{preset.label}</button>)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[["app_primary_color", "Primary color"], ["app_accent_color", "Accent color"]].map(([field, label]) => <label key={field} className="text-sm font-medium">{label}<span className="mt-1.5 flex items-center gap-2"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form[field]) ? form[field] : "#176B9B"} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))} className="h-11 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1" aria-label={`${label} picker`} /><input type="text" name={field} value={form[field]} onChange={update} pattern="#[0-9a-fA-F]{6}" title="Enter a six-digit hex color" className={`${input} mt-0 font-mono uppercase`} /></span></label>)}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: form.app_primary_color }}>BP</span><span className="text-sm font-semibold" style={{ color: form.app_primary_color }}>Buttons and selected navigation</span><span className="ml-auto h-5 w-10 rounded-full" style={{ background: form.app_accent_color }} /></div>
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium">Quotation and invoice PDF style</p>
          <p className="mt-1 text-xs text-slate-500">Choose the theme, text color, and font used on both downloaded documents.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {pdfColorTemplates.map((template) => (
              <button
                key={template.value}
                type="button"
                aria-pressed={form.pdf_color_template === template.value}
                onClick={() => setForm((current) => ({ ...current, pdf_color_template: template.value }))}
                className={`rounded-xl border p-3 text-left text-sm font-semibold ${form.pdf_color_template === template.value ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-200"}`}
              >
                <span className="mb-2 flex h-5 overflow-hidden rounded-md" aria-hidden="true">
                  {template.colors.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
                </span>
                {template.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={form.pdf_color_template === "CUSTOM"}
              onClick={() => setForm((current) => ({ ...current, pdf_color_template: "CUSTOM" }))}
              className={`rounded-xl border p-3 text-left text-sm font-semibold ${form.pdf_color_template === "CUSTOM" ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-200"}`}
            >
              <span className="mb-2 flex h-5 overflow-hidden rounded-md" aria-hidden="true">
                {[form.pdf_custom_primary_color, form.pdf_custom_accent_color].map((color, index) => (
                  <span key={index} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              Custom
            </button>
          </div>
          {form.pdf_color_template === "CUSTOM" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                ["pdf_custom_primary_color", "Primary color"],
                ["pdf_custom_accent_color", "Accent color"],
              ].map(([field, label]) => (
                <label key={field} className="text-sm font-medium">
                  {label}
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(form[field]) ? form[field] : "#000000"}
                      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))}
                      className="h-11 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
                      aria-label={`${label} picker`}
                    />
                    <input
                      type="text"
                      name={field}
                      value={form[field]}
                      onChange={update}
                      pattern="#[0-9a-fA-F]{6}"
                      title="Enter a six-digit hex color, such as #395F6E"
                      className={`${input} mt-0 font-mono uppercase`}
                    />
                  </span>
                </label>
              ))}
            </div>
          )}
          <label className="mt-4 block text-sm font-medium">
            PDF text color
            <span className="mt-1.5 flex max-w-sm items-center gap-2">
              <input
                type="color"
                value={previewBodyText}
                onChange={(event) => setForm((current) => ({ ...current, pdf_custom_text_color: event.target.value.toUpperCase() }))}
                className="h-11 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
                aria-label="PDF text color picker"
              />
              <input
                type="text"
                name="pdf_custom_text_color"
                value={form.pdf_custom_text_color}
                onChange={update}
                pattern="#[0-9a-fA-F]{6}"
                title="Enter a six-digit hex color, such as #172033"
                className={`${input} mt-0 font-mono uppercase`}
              />
            </span>
          </label>
          <div className="mt-5">
            <p className="text-sm font-medium">PDF font</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {pdfFontTemplates.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  aria-pressed={form.pdf_font_template === font.value}
                  onClick={() => setForm((current) => ({ ...current, pdf_font_template: font.value }))}
                  className={`rounded-xl border p-3 text-left ${form.pdf_font_template === font.value ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-200"}`}
                >
                  <span className="block text-lg font-bold" style={{ fontFamily: font.family }}>Aa 123</span>
                  <span className="mt-1 block text-xs font-semibold">{font.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PDF style preview</p>
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                {[["QUOTATION", "Quotation"], ["INVOICE", "Invoice"], ["AREA_REPORT", "Area report"]].map(([document, label]) => <button key={document} type="button" onClick={() => setPreviewDocument(document)} className={`rounded-md px-3 py-1.5 ${previewDocument === document ? "bg-slate-900 text-white" : "text-slate-600"}`}>{label}</button>)}
              </div>
            </div>
            <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" style={{ fontFamily: previewFont }}>
              {previewDocument === "AREA_REPORT" ? (
                <div className="p-4 pb-0">
                  <div className="rounded-lg px-4 py-3 text-base font-extrabold tracking-wide" style={{ backgroundColor: previewPrimary, color: previewText }}>AREA CALCULATION REPORT</div>
                  <div className="grid grid-cols-[1fr_auto] gap-3 border-b-2 py-3" style={{ borderColor: previewAccent }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold" style={{ color: previewBodyText }}>{form.company_name || "Your company"}</p>
                      <p className="text-[9px] leading-tight text-slate-500">{form.office_address || "Company address"}</p>
                      <p className="text-[9px] leading-tight text-slate-500">{form.mobile || "Mobile"} · {form.email || "Email"}</p>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right text-[9px]" style={{ color: previewBodyText }}>
                      <p>CALCULATION NO. <strong>BPM-EXAMPLE-0001</strong></p>
                      <p>VERSION <strong>1</strong></p>
                      <p>CALCULATION DATE <strong>27 Sep 2026</strong></p>
                    </div>
                  </div>
                </div>
              ) : (
              <div className={`relative overflow-hidden px-5 py-5 ${previewDocument !== "QUOTATION" ? "border-b-4" : ""}`} style={{ backgroundColor: previewDocument === "QUOTATION" ? previewPrimary : "#ffffff", color: previewDocument === "QUOTATION" ? previewText : previewPrimary, borderColor: previewAccent }}>
                {previewDocument === "QUOTATION" && <><span className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: previewAccent }} /><span className="absolute -top-4 right-[36%] h-32 w-2 rotate-[26deg]" style={{ backgroundColor: previewAccent }} /></>}
                <div className="relative flex justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {previewDocument === "INVOICE" && form.company_logo_url && <img src={form.company_logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" />}
                      <p className="truncate text-sm font-extrabold uppercase">{form.company_name || "Your company"}</p>
                    </div>
                    <p className="mt-1 max-w-52 truncate text-[10px] opacity-80">{form.office_address || "Company address"}</p>
                    <p className="mt-2 text-[9px] opacity-80">{form.mobile || "Mobile"} · {form.email || "Email"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-extrabold">{previewDocument}</p>
                    <p className="text-[9px] font-bold">{previewDocument === "QUOTATION" ? "BRQ-EXAMPLE-0001" : "INV-EXAMPLE-0001"}</p>
                  </div>
                </div>
              </div>
              )}
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-2">
                  {(previewDocument === "AREA_REPORT" ? [["CUSTOMER", "Customer name · 9876543210"], ["PROPERTY", "Project address"]] : [["CUSTOMER DETAILS", "Customer name"], ["PROPERTY SITE DETAILS", "Project address"]]).map(([title, value]) => (
                    <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-[8px] font-bold" style={{ color: previewPrimary }}>{title}</p>
                      <p className="mt-1 text-[10px] font-semibold" style={{ color: previewBodyText }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 px-3 py-2 text-[8px] font-bold" style={{ backgroundColor: previewPrimary, color: previewText }}><span>{previewDocument === "AREA_REPORT" ? "ROOM / AREA" : "ITEM"}</span><span>{previewDocument === "AREA_REPORT" ? "WALLS" : "DESCRIPTION"}</span><span className="text-right">{previewDocument === "AREA_REPORT" ? "NET AREA" : "AMOUNT"}</span></div>
                  <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 px-3 py-2 text-[9px]" style={{ color: previewBodyText }}><span>{previewDocument === "AREA_REPORT" ? "Living room" : "01"}</span><span>{previewDocument === "AREA_REPORT" ? "450 sq.ft" : "Painting service"}</span><span className="text-right">{previewDocument === "AREA_REPORT" ? "420 sq.ft" : "₹ 12,500"}</span></div>
                </div>
                <div className="ml-auto flex w-fit overflow-hidden rounded-lg border border-slate-200 text-[10px] font-bold"><span className="px-3 py-2" style={{ color: previewBodyText }}>{previewDocument === "AREA_REPORT" ? "NET WALL AREA" : `${previewDocument} TOTAL`}</span><span className="px-3 py-2" style={{ backgroundColor: previewPrimary, color: previewText }}>{previewDocument === "AREA_REPORT" ? "420 sq.ft" : "₹ 12,500"}</span></div>
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[9px] text-slate-500" style={{ borderColor: previewPrimary }}>
                  {previewDocument === "INVOICE" ? <strong className="truncate" style={{ color: previewBodyText }}>{form.company_name || "Your company"}</strong> : form.company_logo_url ? <img src={form.company_logo_url} alt="Company logo preview" className={`h-8 w-12 object-contain ${form.company_logo_shape === "ROUND" ? "rounded-full" : "rounded"}`} /> : <span>Company logo</span>}
                  <span>Powered by Bharath Painters · Page 1</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Sample content shows the selected style. Save to use it on downloaded quotations, invoices, and area calculation reports.</p>
          </div>
        </div>
        </>}
        {!themeOnly && <>
        <label className="text-sm font-medium sm:col-span-2">
          Office address
          <textarea
            rows="3"
            name="office_address"
            value={form.office_address}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Service areas
          <input
            name="service_areas"
            value={form.service_areas}
            onChange={update}
            placeholder="Bangalore, Whitefield, Electronic City"
            className={input}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Separate locations with commas. Each location appears on your shared profile.</span>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Work skills
          <textarea name="work_skills" value={form.work_skills} onChange={update} rows="2" placeholder="Interior painting, Waterproofing, Wood polish" className={input} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Separate skills with commas.</span>
        </label>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium">Owner photo for digital card</p>
          <div className="mt-2 flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            {form.profile_photo_url ? <img src={form.profile_photo_url} alt="Owner" className="h-20 w-20 rounded-xl object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-xl bg-slate-100 text-xs text-slate-500">No photo</span>}
            <input type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, profile_photo: event.target.files?.[0] || null }))} className="w-full min-w-0 text-sm sm:flex-1" />
          </div>
        </div>
        <div className="border-t pt-5 sm:col-span-2">
          <h2 className="font-bold">Contact and tax details</h2>
        </div>
        <label className="text-sm font-medium">
          Mobile *
          <input
            required
            name="mobile"
            value={form.mobile}
            onChange={update}
            className={input}
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
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          GSTIN
          <input
            name="gst_number"
            maxLength="15"
            value={form.gst_number}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          PAN number
          <input
            name="pan_number"
            maxLength="10"
            value={form.pan_number}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Years in business
          <input
            type="number"
            min="0"
            name="years_in_business"
            value={form.years_in_business}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Number of workers / Paint Applicators
          <input
            type="number"
            min="0"
            name="number_of_painters"
            value={form.number_of_painters}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Default area calculation unit
          <select name="default_measurement_unit" value={form.default_measurement_unit} onChange={update} className={input}>
            <option value="FEET">Feet (ft)</option>
            <option value="METRES">Metres (m)</option>
          </select>
          <span className="mt-1 block font-normal text-slate-500">New properties use this unit. Quotations remain in square feet.</span>
        </label>
        <div className="border-t pt-5 sm:col-span-2">
          <SectionTitle>Payment details</SectionTitle>
        </div>
        <label className="text-sm font-medium">
          Account name
          <input name="bank_account_name" value={form.bank_account_name} onChange={update} className={input} />
        </label>
        <label className="text-sm font-medium">
          Account number
          <input name="bank_account_number" value={form.bank_account_number} onChange={update} className={input} />
        </label>
        <label className="text-sm font-medium">
          Bank name
          <input name="bank_name" value={form.bank_name} onChange={update} className={input} />
        </label>
        <label className="text-sm font-medium">
          Branch
          <input name="bank_branch" value={form.bank_branch} onChange={update} className={input} />
        </label>
        <label className="text-sm font-medium">
          IFSC code
          <input name="bank_ifsc" maxLength="20" value={form.bank_ifsc} onChange={update} placeholder="HDFC0001234" className={`${input} font-mono uppercase`} />
        </label>
        <label className="text-sm font-medium">
          UPI ID
          <input name="upi_id" value={form.upi_id} onChange={update} placeholder="yourname@okhdfcbank" className={input} />
        </label>

        <div className="border-t pt-5 sm:col-span-2">
          <SectionTitle>Online presence</SectionTitle>
        </div>
        <div className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { field: "website", label: "Website", short: "www", color: "#0F172A" },
              ...socialPlatforms,
            ].map((platform) => {
              const value = form[platform.field];
              return (
                <button
                  key={platform.field}
                  type="button"
                  onClick={() => openSocialModal(platform)}
                  className={`flex items-center gap-2 rounded-xl border p-2 pr-3 text-sm font-medium transition ${value ? "border-slate-900 bg-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
                >
                  <PlatformBadge short={platform.short} color={platform.color} className="h-7 w-7 text-[11px]" />
                  <span className="max-w-28 truncate">{platform.label}</span>
                  {value && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => openSocialModal({ label: "", field: null, extraIndex: undefined })}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 p-2 pr-3 text-sm font-medium text-slate-600 hover:border-slate-400"
            >
              <Plus className="h-4 w-4" />
              Add link
            </button>
          </div>
          {form.extra_social_links?.length > 0 && (
            <ul className="mt-3 space-y-2">
              {form.extra_social_links.map((entry, index) => (
                <li key={`${entry.url}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
                  <PlatformBadge short={(entry.label || "L").slice(0, 2).toUpperCase()} color="#64748B" className="h-7 w-7 text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{entry.label}</b>
                    <small className="block truncate text-xs text-slate-500">{entry.url}</small>
                  </span>
                  <button type="button" onClick={() => openSocialModal({ extraIndex: index })} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold">Edit</button>
                  <button type="button" onClick={() => removeExtraSocial(index)} aria-label={`Remove ${entry.label}`} className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t pt-5 sm:col-span-2">
          <SectionTitle>Certificates</SectionTitle>
        </div>
        <div className="sm:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { field: "gst_document", label: "GST certificate", accept: "application/pdf,image/*" },
              { field: "business_document", label: "Business licence", accept: "application/pdf,image/*" },
            ].map((slot) => {
              const pending = form[slot.field];
              const existing = !pending && form[`${slot.field}_url`];
              return (
                <div key={slot.field} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-sm font-medium">{slot.label}</span>
                  </div>
                  {pending ? (
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-xs">{pending.name}</span>
                      <button type="button" aria-label={`Clear ${slot.label}`} onClick={() => setForm((value) => ({ ...value, [slot.field]: null }))} className="shrink-0 text-slate-500 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : existing ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
                      <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate text-xs text-emerald-900">{form[`${slot.field}_url`].split("/").pop()}</span>
                      <button type="button" aria-label={`Remove ${slot.label}`} onClick={() => setForm((value) => ({ ...value, [slot.field]: null, [`${slot.field}_url`]: "", [`clear_${slot.field}`]: true }))} className="shrink-0 text-emerald-700 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-2 text-center text-xs text-slate-500">Not uploaded</p>
                  )}
                  <input
                    type="file"
                    accept={slot.accept}
                    onChange={(event) => setForm((value) => ({ ...value, [slot.field]: event.target.files?.[0] || null, [`clear_${slot.field}`]: false }))}
                    className="w-full min-w-0 text-xs"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-sm font-medium sm:col-span-2">
          <label htmlFor="contractor-new-password">New password</label>{" "}
          <span className="font-normal text-slate-400">
            (leave blank to keep current password)
          </span>
          <span className="relative block">
            <input
              id="contractor-new-password"
              type={showPassword ? "text" : "password"}
              minLength="8"
              autoComplete="new-password"
              name="password"
              value={form.password}
              onChange={update}
              className={`${input} pr-12`}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide new password" : "Show new password"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-1.5 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </span>
        </div>
        </>}
        <div className="flex border-t pt-5 sm:col-span-2 sm:justify-end">
          <button
            disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : themeOnly ? "Save theme settings" : "Save contractor details"}
          </button>
        </div>
      </form>
    {socialModal && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={socialModal.field ? socialModal.label : "Add link"}
        className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSocialModal(null);
        }}
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <div className="flex items-center gap-3">
            {socialModal.field ? (
              <PlatformBadge short={socialModal.short} color={socialModal.color} />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100">
                <Plus className="h-5 w-5 text-slate-600" />
              </span>
            )}
            <h3 className="min-w-0 flex-1 truncate text-base font-bold">
              {socialModal.field ? socialModal.label : socialModal.extraIndex === undefined ? "Add link" : "Edit link"}
            </h3>
            <button type="button" onClick={() => setSocialModal(null)} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          {socialModal.field ? (
            <input
              autoFocus
              value={socialDraft}
              onChange={(event) => setSocialDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSocialModal();
                }
              }}
              placeholder={socialModal.placeholder || "https://…"}
              className="mt-4 w-full min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900"
            />
          ) : (
            <div className="mt-4 grid gap-3">
              <input
                autoFocus
                value={extraDraft.label}
                onChange={(event) => setExtraDraft((value) => ({ ...value, label: event.target.value }))}
                placeholder="Label, such as LinkedIn"
                maxLength="60"
                className="w-full min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900"
              />
              <input
                value={extraDraft.url}
                onChange={(event) => setExtraDraft((value) => ({ ...value, url: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitSocialModal();
                  }
                }}
                placeholder="https://…"
                className="w-full min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900"
              />
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setSocialModal(null)}
              className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitSocialModal}
              className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Save link
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
function formatError(data) {
  if (!data) return "";
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : value}`,
    )
    .join(" ");
}
