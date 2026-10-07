import { serviceBranding } from "./serviceBranding";
import { DEFAULT_PROFILE_IMAGE_POSITION, normalizeProfileImagePosition } from "./profileImagePosition";

export const COMPANY_FIELDS = [
  "mobile", "email", "company_name", "owner_name", "company_logo_shape", "company_logo_position", "profile_photo_position", "office_address", "service_areas", "work_skills", "gst_number", "pan_number", "years_in_business", "default_measurement_unit",
  "bank_account_name", "bank_account_number", "bank_name", "bank_branch", "bank_ifsc", "upi_id", "website", "google_business_url", "facebook_url", "instagram_url", "pinterest_url", "whatsapp_number",
  "pdf_color_template", "pdf_font_template", "pdf_custom_primary_color", "pdf_custom_accent_color", "pdf_custom_text_color", "app_primary_color", "app_accent_color",
];
const PROVIDER_FIELDS = ["headline", "about", "base_location", "team_size", "workspace_name_override", "tagline", "accepts_subcontract_work", "network_opt_in"];
const FILE_FIELDS = { company_logo: "company_logo", owner_photo: "profile_photo", gst_document: "gst_document", business_document: "business_document" };

export function businessSettingsForm({ company, provider }) {
  return {
    ...company, ...Object.fromEntries(PROVIDER_FIELDS.map((key) => [key, provider[key] ?? (key === "team_size" ? 0 : key === "network_opt_in" ? true : key === "accepts_subcontract_work" ? false : "")])),
    company_logo_position: normalizeProfileImagePosition(company.company_logo_position || DEFAULT_PROFILE_IMAGE_POSITION),
    profile_photo_position: normalizeProfileImagePosition(company.profile_photo_position || DEFAULT_PROFILE_IMAGE_POSITION),
    core_service: provider.core_service ? String(provider.core_service) : "",
    additional_services: [...new Set((provider.additional_services || []).map(String))].filter((id) => id !== String(provider.core_service)),
    sub_services: [...new Set((provider.service_claims || []).filter((claim) => claim.work_description).map((claim) => `${claim.category}:${claim.work_description}`))],
    service_claims: provider.service_claims || [],
    is_published: Boolean(provider.is_published),
    brand_snapshot: provider.brand_snapshot || {},
    branding: provider.branding || {},
    profile_status: provider.is_draft ? "DRAFT" : provider.is_published ? "PUBLISHED" : "READY",
    company_logo_url: company.company_logo || "", owner_photo_url: company.profile_photo || "", gst_document_url: company.gst_document || "", business_document_url: company.business_document || "",
    extra_social_links: (company.extra_social_links || []).map((entry, index) => ({ ...entry, id: `saved-${index}` })),
    password: "",
  };
}

export function settingsCatalogue(categories, descriptions, provider) {
  const offered = new Set([String(provider.core_service), ...(provider.additional_services || []).map(String)]);
  const unique = [...new Map(categories.map((entry) => [String(entry.id), entry])).values()];
  return unique.filter((entry) => (entry.is_active !== false && entry.is_provider_selectable !== false) || offered.has(String(entry.id))).map((entry) => {
    const id = String(entry.id);
    const subServices = [...new Map(descriptions.filter((row) => String(row.service_category) === id).map((row) => [`${id}:${row.id}`, { name: row.name, identifier: `${id}:${row.id}` }])).values()];
    for (const claim of provider.service_claims || []) {
      if (String(claim.category) === id && claim.work_description && !subServices.some((row) => row.identifier === `${id}:${claim.work_description}`)) {
        subServices.push({ identifier: `${id}:${claim.work_description}`, name: claim.work_description_name || "Existing sub-service" });
      }
    }
     return { identifier: id, name: entry.name, ...serviceBranding(entry), selectable: entry.is_active !== false && entry.is_provider_selectable !== false, subServices };
  });
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function businessSettingsPayload({ form, saved, files, republish = false }) {
  const company = {}, provider = {};
  for (const key of COMPANY_FIELDS) {
    if (!same(form[key], saved[key])) company[key] = key === "years_in_business" ? Number(form[key] || 0) : form[key];
  }
  for (const key of PROVIDER_FIELDS) {
    if (!same(form[key], saved[key])) provider[key] = key === "team_size" ? Number(form[key] || 0) : form[key];
  }
  if (!same(form.extra_social_links, saved.extra_social_links)) company.extra_social_links = form.extra_social_links.map(({ label, url }) => ({ label, url }));
  if (form.password) company.password = form.password;
  const servicesChanged = !same(form.core_service, saved.core_service) || !same(form.additional_services, saved.additional_services) || !same(form.sub_services, saved.sub_services);
  if (servicesChanged) {
    provider.core_service = form.core_service ? Number(form.core_service) : null;
    provider.additional_services = [...new Set(form.additional_services)].filter((id) => id !== form.core_service).map(Number);
    const offered = new Set([form.core_service, ...form.additional_services]);
    const original = new Map((saved.service_claims || []).map((claim) => [`${claim.category}:${claim.work_description || ""}`, claim]));
    provider.service_claims = [...new Set(form.sub_services)].map((key) => {
      const [category, description] = key.split(":");
      const existing = original.get(key);
      return { category: Number(category), work_description: Number(description), note: existing?.note || "", is_active: existing?.is_active !== false };
    }).filter((claim) => offered.has(String(claim.category)));
    for (const claim of saved.service_claims || []) {
      if (!claim.work_description && offered.has(String(claim.category))) provider.service_claims.push({ category: claim.category, work_description: null, note: claim.note || "", is_active: claim.is_active !== false });
    }
  }
  if (form.profile_status !== saved.profile_status) provider.is_draft = form.profile_status === "DRAFT";
  const payload = new FormData();
  for (const [key, field] of Object.entries(FILE_FIELDS)) {
    if (files[key]) payload.append(field, files[key]);
    else if (saved[`${key}_url`] && !form[`${key}_url`]) company[field] = null;
  }
  payload.append("company", JSON.stringify(company));
  payload.append("provider", JSON.stringify(provider));
  if (republish || (form.profile_status === "PUBLISHED" && saved.profile_status !== "PUBLISHED")) payload.append("publish", "true");
  return payload;
}

export function settingsError(data, fallback = "Settings could not be saved.") {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  const messages = [];
  const visit = (value, prefix = "") => {
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, prefix));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => visit(entry, [prefix, key.replaceAll("_", " ")].filter(Boolean).join(" · ")));
    else if (value != null) messages.push(`${prefix ? `${prefix}: ` : ""}${value}`);
  };
  visit(data);
  return messages.join("; ") || fallback;
}
