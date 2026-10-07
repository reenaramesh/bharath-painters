import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  CircleCheck,
  CircleAlert,
  Droplets,
  Grid2x2,
  Hammer,
  Layers,
  Paintbrush,
  PaintRoller,
  Rocket,
  Sofa,
  SprayCan,
  Trees,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { ErrorState, LoadingState, PageHeader, SectionCard } from "../components/ui";
import { apiErrorMessage, prettyDate } from "../utils/subcontract";
import { serviceBranding } from "../utils/serviceBranding";

const ICONS = {
  PAINT_ROLLER: PaintRoller,
  BRUSH: Paintbrush,
  SPRAY: SprayCan,
  WATERPROOFING: Droplets,
  PUTTY: Layers,
  INTERIOR: Sofa,
  ELECTRICAL: Zap,
  PLUMBING: Droplets,
  CARPENTRY: Hammer,
  HVAC: Wind,
  FLOORING: Grid2x2,
  FURNITURE: Armchair,
  LANDSCAPING: Trees,
  GENERAL: Wrench,
};

const EMPTY_FORM = {
  headline: "",
  about: "",
  service_areas: "",
  base_location: "",
  years_in_business: 0,
  team_size: 0,
  workspace_name_override: "",
  tagline: "",
  accepts_subcontract_work: false,
  network_opt_in: true,
  is_draft: true,
};

export default function ProviderProfile({ embedded = false }) {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [coreService, setCoreService] = useState("");
  const [additional, setAdditional] = useState([]);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isEmployee = user?.role === "PAINTER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileCall, catalogueCall, descriptionCall] = await Promise.all([
        api.get("/accounts/provider-profile/"),
        api.get("/quotations/service-categories/"),
        api.get("/quotations/work-descriptions/"),
      ]);
      const rows = profileCall.data || {};
      setProfile(rows);
      setCoreService(rows.core_service ? String(rows.core_service) : "");
      setAdditional([...new Set((rows.additional_services || []).map(String))].filter((id) => id !== String(rows.core_service)));
      setClaims(rows.service_claims || []);
      setForm({
        headline: rows.headline || "",
        about: rows.about || "",
        service_areas: rows.service_areas || "",
        base_location: rows.base_location || "",
        years_in_business: rows.years_in_business || 0,
        team_size: rows.team_size || 0,
        workspace_name_override: rows.workspace_name_override || "",
        tagline: rows.tagline || "",
        accepts_subcontract_work: Boolean(rows.accepts_subcontract_work),
        network_opt_in: rows.network_opt_in !== false,
        is_draft: rows.is_draft !== false,
      });
      setCatalogue(catalogueCall.data?.results || catalogueCall.data || []);
      setDescriptions(descriptionCall.data?.results || descriptionCall.data || []);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err, "Your profile could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const syncCompany = (event) => setForm((current) => ({
      ...current, service_areas: event.detail.service_areas || "",
      years_in_business: event.detail.years_in_business || 0,
    }));
    window.addEventListener("bp-company-profile-saved", syncCompany);
    return () => window.removeEventListener("bp-company-profile-saved", syncCompany);
  }, []);

  const selectable = useMemo(
    () =>
      catalogue
        .filter((item) => item.is_active !== false && item.is_provider_selectable !== false)
        .slice()
        .sort((a, b) => (a.sort_weight || 0) - (b.sort_weight || 0) || a.name.localeCompare(b.name)),
    [catalogue],
  );

  const categoryById = useMemo(
    () => Object.fromEntries(catalogue.map((item) => [String(item.id), item])),
    [catalogue],
  );

  // A claim may only point at a sub-service inside one of the offered
  // categories, so the picker is driven by the offered set rather than by
  // everything in the catalogue.
  const offeredIds = useMemo(
    () => new Set([coreService, ...additional].filter(Boolean)),
    [coreService, additional],
  );

  const descriptionsFor = useCallback(
    (categoryId) =>
      descriptions.filter((item, index, all) => String(item.service_category || "") === String(categoryId) && all.findIndex((row) => row.id === item.id) === index),
    [descriptions],
  );

  const claimKey = (categoryId, workDescriptionId) => `${categoryId}:${workDescriptionId || ""}`;
  const claimedKeys = useMemo(
    () => new Set(claims.map((claim) => claimKey(claim.category, claim.work_description))),
    [claims],
  );

  const toggleClaim = (categoryId, descriptionId) => {
    const key = claimKey(categoryId, descriptionId);
    setClaims((current) => {
      if (claimedKeys.has(key)) {
        return current.filter(
          (claim) => claimKey(claim.category, claim.work_description) !== key,
        );
      }
      return [
        ...current,
        { id: `new-${key}`, category: Number(categoryId), work_description: descriptionId ? Number(descriptionId) : null, note: "", is_active: true },
      ];
    });
  };

  const toggleAdditional = (categoryId) => {
    const id = String(categoryId);
    const removing = additional.includes(id);
    setAdditional((current) =>
      removing ? current.filter((value) => value !== id) : [...current, id],
    );
    // Claims belonging to a removed service are dropped in the same step,
    // otherwise the API would reject the whole save.
    if (removing) {
      setClaims((current) => current.filter((claim) => String(claim.category) !== id));
    }
  };

  const pickCore = (categoryId) => {
    const id = String(categoryId);
    if (id === coreService) return;
    const previous = coreService;
    if (additional.includes(id)) {
      setAdditional((current) => current.filter((value) => value !== id));
    }
    setCoreService(id);
    // The trade we are leaving behind is no longer offered at all, so its
    // sub-service claims would be rejected by the API on the next save.
    if (previous) {
      setClaims((current) => current.filter((claim) => String(claim.category) !== previous));
    }
  };

  const save = async (event) => {
    event?.preventDefault();
    setNotice("");
    setError("");
    setSaving(true);
    // service_areas and years_in_business are owned by the company profile and are
    // edited on the company tab, so they are never sent from here.
    const ownFields = Object.fromEntries((isEmployee
      ? ["headline", "about", "base_location", "is_draft"]
      : ["headline", "about", "base_location", "workspace_name_override", "tagline", "accepts_subcontract_work", "network_opt_in", "is_draft"]
    ).map((key) => [key, form[key]]));
    const shared = isEmployee ? {} : { team_size: Number(form.team_size || 0) };
    try {
      const { data } = await api.patch("/accounts/provider-profile/", {
        ...ownFields,
        ...shared,
        core_service: coreService ? Number(coreService) : null,
        additional_services: additional.map(Number),
        service_claims: claims.map((claim) => ({
          category: Number(claim.category),
          work_description: claim.work_description ? Number(claim.work_description) : null,
          note: claim.note || "",
          is_active: claim.is_active !== false,
        })),
      });
      setProfile(data);
      setCoreService(data.core_service ? String(data.core_service) : "");
      setAdditional((data.additional_services || []).map(String));
      setClaims(data.service_claims || []);
      await refreshUser().catch(() => setError("Profile saved, but account details could not refresh. Reload to refresh your name and branding."));
      setNotice("Profile saved.");
    } catch (err) {
      setError(apiErrorMessage(err, "Your profile could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setNotice("");
    setError("");
    setSaving(true);
    try {
      const { data } = await api.post("/accounts/provider-profile/");
      setProfile(data);
      setForm((current) => ({ ...current, is_draft: data.is_draft }));
      await refreshUser().catch(() => setError("Profile published, but account details could not refresh. Reload to refresh branding."));
      setNotice(published ? "Published profile identity updated to match your current saved branding." : "Profile published. Its branding is now saved as the published identity.");
    } catch (err) {
      setError(apiErrorMessage(err, "Your profile could not be published."));
    } finally {
      setSaving(false);
    }
  };

  const saveDraftToggle = async (value) => {
    setForm((current) => ({ ...current, is_draft: value }));
    setNotice("");
    setSaving(true);
    try {
      const { data } = await api.patch("/accounts/provider-profile/", { is_draft: value });
      setProfile(data);
    } catch (err) {
      setForm((current) => ({ ...current, is_draft: profile.is_draft }));
      setError(apiErrorMessage(err, "That change could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading your professional profile…" />;
  if (error && !profile) return <ErrorState message={error} onRetry={load} />;

  const branding = profile?.branding || {};
  const published = Boolean(profile?.is_published);
  const core = coreService ? categoryById[coreService] : null;
  const publishedBrandingIsStale = Boolean(published && profile?.brand_snapshot &&
    ["workspace_name", "contractor_label", "employee_singular_label", "employee_plural_label"].some((key) =>
      (profile.brand_snapshot[key] || "") !== (branding[key] || "")));
  const readiness = [[isEmployee ? "Primary trade" : "Core service", Boolean(profile?.core_service)]];
  const selectedBranding = core ? serviceBranding(core) : branding;
  const canPublish = readiness.every(([, ok]) => ok);

  return (
    <div className="space-y-6">
      {embedded ? null : (
      <PageHeader
        eyebrow={isEmployee ? "Employee profile" : "Contractor profile"}
        title={isEmployee ? "Primary trade and additional skills" : "Core service and additional services"}
        description={
          isEmployee
            ? "Your primary trade sets how you appear in every job. Extra skills never rename it."
            : "One core service drives your workspace branding. Additional services are explicit and never change it."
        }
      />
      )}

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

      {published && (
        <p className="flex items-start gap-2 rounded-xl bg-sky-50 p-4 text-sm text-sky-800">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Published {prettyDate(profile?.published_at)}. The published identity is{" "}
            <b>{profile?.brand_snapshot?.workspace_name || branding.workspace_name || "Bharath Apps"}</b>
            {publishedBrandingIsStale && <>; current saved identity is <b>{branding.workspace_name}</b>. Republish to update the published profile.</>}
          </span>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={save} className="space-y-6">
          {/* Company identity is a contractor concern. An employee keeps their
              name, photo, experience and locations on the personal tab instead,
              so none of these fields are duplicated for them. */}
          <SectionCard
            title={isEmployee ? "Professional introduction" : "Business identity"}
            description={isEmployee ? "Describe your work. Personal details and work-seeking locations are in Personal details." : "These details travel with every quote you send."}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Headline" hint="One line other contractors see first">
                <input
                  maxLength={180}
                  value={form.headline}
                  onChange={(event) => setForm({ ...form, headline: event.target.value })}
                  placeholder="Waterproofing and terrace repainting specialist"
                />
              </Field>
              {!isEmployee && <Field label="Tagline">
                <input
                  maxLength={180}
                  value={form.tagline}
                  onChange={(event) => setForm({ ...form, tagline: event.target.value })}
                  placeholder="Fixed in 3 days"
                />
              </Field>}
              <Field label="Professional base location" hint="Your usual work base, distinct from office address or current work-seeking location">
                <input
                  maxLength={180}
                  value={form.base_location}
                  onChange={(event) => setForm({ ...form, base_location: event.target.value })}
                  placeholder="Whitefield, Bengaluru"
                />
              </Field>
              {!isEmployee && <Field label="Declared workforce count" hint="Your declared team size; registered employee memberships are counted separately">
                <input
                  type="number"
                  min="0"
                  value={form.team_size}
                  onChange={(event) => setForm({ ...form, team_size: event.target.value })}
                />
              </Field>}
              <Field label="About" hint="What you take on, and what you do not">
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={form.about}
                  onChange={(event) => setForm({ ...form, about: event.target.value })}
                  placeholder="We take terrace and bathroom waterproofing, and repaint society flats."
                />
              </Field>
              {!isEmployee && <Field
                label="Workspace name override"
                hint="Leave blank to use the core service name"
              >
                <input
                  maxLength={150}
                  value={form.workspace_name_override}
                  onChange={(event) =>
                    setForm({ ...form, workspace_name_override: event.target.value })
                  }
                  placeholder={branding.workspace_name || "Bharath Apps"}
                />
              </Field>}
            </div>
          </SectionCard>

          <SectionCard
            title={isEmployee ? "Primary trade — exactly one" : "Core service — exactly one"}
            description="Changing this changes your workspace heading."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selectable.map((item) => {
                const isCore = String(item.id) === coreService;
                const Icon = ICONS[item.icon] || Wrench;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickCore(item.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                      isCore
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        isCore ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{item.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {item.workspace_name || "—"}
                      </span>
                      {isCore && (
                        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {isEmployee ? "Primary trade" : "Core service"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {selectable.length === 0 && (
                <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                  No services are available yet. Ask an admin to mark services as selectable in Master
                  Data.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={isEmployee ? "Additional trades & skills" : "Additional services"}
            description="Add extra trades without touching your core identity."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {selectable
                .filter((item) => String(item.id) !== coreService)
                .map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={additional.includes(String(item.id))}
                      onChange={() => toggleAdditional(item.id)}
                    />
                    <span>
                      <span className="block font-semibold">{item.name}</span>
                      <span className="block text-xs text-slate-500">
                         Listed to you as a {isEmployee ? (item.employee_singular_label || "employee") : (item.contractor_label || "contractor")}.
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Sub-services you actually offer"
            description="Pick the specific work, not just the category."
          >
            <div className="space-y-4">
              {[...offeredIds].map((categoryId) => {
                const category = categoryById[categoryId];
                if (!category) return null;
                const rows = descriptionsFor(categoryId);
                const Icon = ICONS[category.icon] || Wrench;
                return (
                  <div key={categoryId}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                      <Icon className="h-4 w-4 text-slate-500" /> {category.name}
                      {String(categoryId) === coreService && (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                          {isEmployee ? "Primary" : "Core"}
                        </span>
                      )}
                    </p>
                    {rows.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No sub-services are mapped to this service yet.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {rows.map((row) => (
                          <label
                            key={row.id}
                            className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={claimedKeys.has(claimKey(categoryId, row.id))}
                              onChange={() => toggleClaim(categoryId, row.id)}
                            />
                            <span className="font-medium">{row.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {offeredIds.size === 0 && (
                <p className="text-sm text-slate-500">
                  Choose a core service first, then claim the sub-services you offer.
                </p>
              )}
            </div>
          </SectionCard>

          {!isEmployee && (
            <SectionCard title="Subcontract and network" description="How other contractors reach you.">
              <div className="space-y-3">
                <Toggle
                  checked={form.accepts_subcontract_work}
                  onChange={(value) => setForm({ ...form, accepts_subcontract_work: value })}
                  label="Accept subcontract work"
                  hint="Lets connected contractors send you work orders."
                />
                <Toggle
                  checked={form.network_opt_in}
                  onChange={(value) => setForm({ ...form, network_opt_in: value })}
                  label="Appear in the contractor network"
                  hint="Other contractors can find and connect with you."
                />
              </div>
            </SectionCard>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={load}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold"
            >
              Discard changes
            </button>
            <button
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <SectionCard title="Preview">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Workspace heading
              </p>
              <p className="mt-1 text-lg font-extrabold">
                {core ? (form.workspace_name_override || selectedBranding.workspaceName || "Bharath Apps") : "Bharath Apps"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                You are listed as a <b>{isEmployee
                  ? (selectedBranding.employeeSingularLabel || "Employee")
                  : (selectedBranding.contractorLabel || "Contractor")}</b>
              </p>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Additional services
                </p>
                {additional.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">None</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {additional.map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800"
                      >
                        {categoryById[id]?.name || id}
                      </span>
                    ))}
                    {claims.map((claim) => (
                      <span
                        key={claimKey(claim.category, claim.work_description)}
                        className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {claim.work_description_name || categoryById[String(claim.category)]?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Publish readiness">
            <ul className="space-y-2">
              {readiness.map(([label, ok]) => (
                <li key={label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">{label}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {ok ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
                    {ok ? "Ready" : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Profile is {profile?.completion_percent || 0}% complete.
            </p>
            <div className="mt-3">
              <Toggle
                checked={form.is_draft}
                onChange={saveDraftToggle}
                label="Keep as draft"
                hint="Drafts stay private until you publish."
              />
            </div>
            <button
              type="button"
              disabled={saving || !canPublish || (published && !publishedBrandingIsStale)}
              onClick={publish}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
            >
              <Rocket className="h-4 w-4" />
              {published ? (publishedBrandingIsStale ? "Republish updated identity" : "Already published") : "Publish profile"}
            </button>
            {!canPublish && !published && (
              <p className="mt-2 text-xs text-slate-500">
                 Publishing needs a saved {isEmployee ? "primary trade" : "core service"}. Other professional details improve your profile completeness.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Save your changes before publishing, otherwise the published version keeps your last
              saved values.
            </p>
          </SectionCard>

          {profile && (profile.rating_count > 0 || profile.completed_work_orders > 0) && (
            <SectionCard title="Track record">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Rating</dt>
                  <dd className="text-xl font-bold">
                    {Number(profile.rating_average) > 0 ? Number(profile.rating_average).toFixed(1) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    Work orders done
                  </dt>
                  <dd className="text-xl font-bold">{profile.completed_work_orders}</dd>
                </div>
              </dl>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-2 block font-semibold">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
